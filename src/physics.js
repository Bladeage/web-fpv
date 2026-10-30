/* Physik (Stufe 1, vereinfacht): Flugmodell, Akku, Kollision, Tore.
   Ohne DOM und WebGL, in Node testbar. Ton und Vibration laufen über fx,
   main.js verbindet sie mit dem Browser. */
import { DEG, clamp, vAdd, vSub, vScale, vDot, vLen, qMul, qNorm, qRot, qFromRotVec } from './math.js';
import { cfg, game, kb, inp, say, saveBest } from './state.js';
import { colliders, gates, GATE_IN } from './world.js';
import { fmtTime } from './format.js';

/* ---------- Physik-Parameter (Stufe 1, vereinfacht) ---------- */
export const PHYS = {
  g: 9.81,
  twr: 4.2,        // Schub-zu-Gewicht bei Vollgas
  spool: 0.035,    // Motor-Reaktionszeit in s
  drag1: 0.12,     // linearer Luftwiderstand (1/s)
  drag2: 0.035,    // quadratischer Luftwiderstand (1/m)
  radius: 0.15,    // Kollisionsradius in m
  crashV: 5.5,     // Aufprallgeschwindigkeit für Absturz in m/s
  rateTau: 0.04,   // Reaktionszeit der Drehrate in s
  angleMax: 50,    // max. Neigung im Angle-Modus in Grad
  angleK: 7,       // Rückstellstärke im Angle-Modus
  yawRateAngle: 200
};
export const STEP = 1/240;   // feste Physik-Schrittweite
export const BAT = { cells: 4, cap: 1500, ri: 0.025 };   // 4S-Akku, 1500 mAh, Innenwiderstand in Ohm (Schätzwerte)

// Rückmeldungen nach außen. In Node bleiben sie leer.
export const fx = { beep() {}, vibrate() {} };

export function respawn() {
  game.sim = {
    p: [0, PHYS.radius + 0.04, 0], v: [0, 0, 0], q: [0, 0, 0, 1], w: [0, 0, 0],
    thr: 0, t: 0, next: 0, lapStart: null, lastLap: null, grounded: true, crashMsg: '', crashT: 0,
    mah: 0, amp: 0, vpack: BAT.cells*4.2, cellRest: 4.2, flyT: 0
  };
  game.throttle = 0; kb.pitch = kb.roll = kb.yaw = 0;
  game.state = 'fly';
  game.camPos = [0, 1.0, 2.6]; game.camHeading = [0, 0, -1];
}

export function crash(why) {
  game.state = 'crashed';
  game.sim.crashMsg = why; game.sim.crashT = performance.now();
  game.crashes++;
  fx.beep(95, 0.35, 'sawtooth');
  fx.vibrate(120);
}

export function rateCurve(x, maxDeg, expo) {
  const a = Math.abs(x);
  return Math.sign(x) * maxDeg * DEG * ((1 - expo)*a + expo*a*a*a);
}

export function step(h) {
  const s = game.sim;
  // 1. Soll-Drehraten im Körper-Koordinatensystem (rad/s)
  let tx, ty, tz;
  if (cfg.mode === 'acro') {
    tx = -rateCurve(inp.pitch, cfg.rate, 0.45);
    tz = -rateCurve(inp.roll, cfg.rate, 0.45);
    ty = -rateCurve(inp.yaw, cfg.rate*0.65, 0.3);
  } else {
    const f = qRot(s.q, [0,0,-1]), r = qRot(s.q, [1,0,0]), u = qRot(s.q, [0,1,0]);
    const pitchA = Math.atan2(-f[1], u[1]);   // Nase runter = positiv
    const rollA  = Math.atan2(-r[1], u[1]);   // rechts runter = positiv
    const maxA = PHYS.angleMax*DEG;
    tx = -clamp(PHYS.angleK*(inp.pitch*maxA - pitchA), -8, 8);
    tz = -clamp(PHYS.angleK*(inp.roll*maxA - rollA), -8, 8);
    ty = -inp.yaw * PHYS.yawRateAngle * DEG;
  }
  // 2. Drehrate folgt dem Sollwert mit kurzer Verzögerung
  const k = Math.min(1, h/PHYS.rateTau);
  s.w[0] += (tx - s.w[0])*k; s.w[1] += (ty - s.w[1])*k; s.w[2] += (tz - s.w[2])*k;
  s.q = qNorm(qMul(s.q, qFromRotVec(vScale(s.w, h))));

  // 3. Schub, Schwerkraft, Luftwiderstand
  s.thr += (game.throttle - s.thr) * Math.min(1, h/PHYS.spool);
  const up = qRot(s.q, [0,1,0]);
  // Akku: Strom, Verbrauch, Spannung unter Last (vereinfachtes Modell)
  s.amp = 1.0 + 95*Math.pow(s.thr, 1.6);
  s.mah += s.amp*h/3.6;
  const frac = s.mah/BAT.cap;
  s.cellRest = Math.max(3.0, 4.2 - 0.55*Math.min(frac, 1) - Math.max(0, frac - 0.8)*2.5);
  s.vpack = BAT.cells*s.cellRest - s.amp*BAT.ri;
  if (s.thr > 0.05) s.flyT += h;
  const aT = s.thr * PHYS.twr * PHYS.g * clamp(s.vpack/15.8, 0.55, 1.08);
  const sp = vLen(s.v), dr = PHYS.drag1 + PHYS.drag2*sp;
  const a = [up[0]*aT - s.v[0]*dr, up[1]*aT - PHYS.g - s.v[1]*dr, up[2]*aT - s.v[2]*dr];
  s.v = vAdd(s.v, vScale(a, h));
  const prev = s.p;
  s.p = vAdd(s.p, vScale(s.v, h));

  // 4. Boden
  s.grounded = false;
  if (s.p[1] < PHYS.radius) {
    const vDown = -s.v[1], vh = Math.hypot(s.v[0], s.v[2]);
    if (vDown > PHYS.crashV*1.2 || vh > 9) { crash('Bodenkontakt zu schnell'); return; }
    s.p[1] = PHYS.radius;
    if (s.v[1] < 0) s.v[1] = 0;
    const fr = Math.max(0, 1 - 6*h);
    s.v[0] *= fr; s.v[2] *= fr;
    s.grounded = true;
  }
  // 5. Hindernisse
  for (const c of colliders) if (collide(c, h)) return;
  // 6. Tore
  checkGate(prev, s.p);
  s.t += h;
}

export function collide(c, h) {
  const s = game.sim, R = PHYS.radius;
  const dx = s.p[0]-c.c[0], dy = s.p[1]-c.c[1], dz = s.p[2]-c.c[2];
  if (Math.abs(dy) > c.h[1] + R) return false;
  const lx = dx*c.cs - dz*c.sn, lz = dx*c.sn + dz*c.cs, ly = dy;
  if (Math.abs(lx) > c.h[0] + R || Math.abs(lz) > c.h[2] + R) return false;
  let nx = lx - clamp(lx, -c.h[0], c.h[0]);
  let ny = ly - clamp(ly, -c.h[1], c.h[1]);
  let nz = lz - clamp(lz, -c.h[2], c.h[2]);
  const d = Math.hypot(nx, ny, nz);
  let pen;
  if (d < 1e-6) {
    const px = c.h[0] - Math.abs(lx), py = c.h[1] - Math.abs(ly), pz = c.h[2] - Math.abs(lz);
    if (px < py && px < pz) { nx = Math.sign(lx) || 1; ny = 0; nz = 0; pen = px + R; }
    else if (py < pz)        { nx = 0; ny = Math.sign(ly) || 1; nz = 0; pen = py + R; }
    else                     { nx = 0; ny = 0; nz = Math.sign(lz) || 1; pen = pz + R; }
  } else {
    if (d >= R) return false;
    nx /= d; ny /= d; nz /= d; pen = R - d;
  }
  const n = [nx*c.cs + nz*c.sn, ny, -nx*c.sn + nz*c.cs];
  const vn = vDot(s.v, n);
  if (-vn > PHYS.crashV) { crash('Hindernis getroffen'); return true; }
  s.p = vAdd(s.p, vScale(n, pen));
  if (vn < 0) s.v = vSub(s.v, vScale(n, vn));
  s.v = vScale(s.v, Math.max(0, 1 - 3*h));
  return false;
}

export function checkGate(a, b) {
  const g = gates[game.sim.next];
  const da = (a[0]-g.c[0])*g.n[0] + (a[2]-g.c[2])*g.n[2];
  const db = (b[0]-g.c[0])*g.n[0] + (b[2]-g.c[2])*g.n[2];
  if (!(da < 0 && db >= 0)) return;
  const t = da / (da - db);
  const p = [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t, a[2] + (b[2]-a[2])*t];
  const lat = (p[0]-g.c[0])*g.r[0] + (p[2]-g.c[2])*g.r[2];
  const ver = p[1] - g.c[1];
  if (Math.abs(lat) < GATE_IN && Math.abs(ver) < GATE_IN) passGate();
}

export function passGate() {
  const s = game.sim;
  if (s.next === 0) {
    if (s.lapStart !== null) {
      const lt = s.t - s.lapStart;
      s.lastLap = lt;
      if (game.best === null || lt < game.best) { game.best = lt; saveBest(); say('Neue Bestzeit ' + fmtTime(lt), 2.2); fx.beep(1320, 0.25); }
      else say('Runde ' + fmtTime(lt), 2);
    } else say('Zeit läuft', 1.2);
    s.lapStart = s.t;
  }
  fx.beep(880 + s.next*40, 0.09);
  s.next = (s.next + 1) % gates.length;
}
