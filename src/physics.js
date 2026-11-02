/* Physik (Stufe 1, vereinfacht): Flugmodell, Akku, Kollision, Tore.
   Ohne DOM und WebGL, in Node testbar. Ton und Vibration laufen über fx,
   main.js verbindet sie mit dem Browser. */
import { DEG, clamp, vAdd, vSub, vScale, vDot, vLen, vCross, qMul, qNorm, qRot, qFromRotVec } from './math.js';
import { cfg, game, kb, inp, say, saveBest } from './state.js';
import { colliders, gates, GATE_IN } from './world.js';
import { fmtTime } from './format.js';

/* ---------- Physik-Parameter (Stufe 1, vereinfacht) ---------- */
export const PHYS = {
  g: 9.81,
  spool: 0.035,    // Hochlaufzeit des Motors um den Schwebepunkt in s (bestimmt die Drehträgheit J)
  radius: 0.15,    // Kollisionsradius in m
  crashV: 5.5,     // Aufprallgeschwindigkeit für Absturz in m/s
  rateTau: 0.04,   // nur Stufe 1: Reaktionszeit der Drehrate in s (seit Physik 2.0 ungenutzt)
  angleMax: 50,    // max. Neigung im Angle-Modus in Grad
  angleK: 7,       // Rückstellstärke im Angle-Modus
  yawRateAngle: 200,
  // Physik 2.0 (Schätzwerte für eine 5-Zoll-Drohne, ca. 580 g mit 4S 1500 mAh):
  arm: 0.11,                              // Motor bis Mitte in m (220 mm Diagonale)
  mMotor: 0.035,                          // Motor mit Propeller in kg
  body: [0.25, 0.06, 0.04, 0.12],         // Rahmen und Elektronik: Masse kg, Breite x, Höhe y, Länge z in m
  bat: [0.19, 0.035, 0.035, 0.075, 0.035],// Akku: Masse kg, Maße x y z in m, Höhe über Mitte in m
  // Motor und Propeller (P1). Kalibriert auf einen Prüfstandswert: 2207.5-Motor 2550 KV mit 5-Zoll-Propeller an 4S,
  // 1691 g Schub bei 53,9 A und 26645 U/min, ca. 16 V (VCI Spark, rcdrone.top). i0 und Steigung sind Schätzungen.
  motor: { kv: 2550, T_g: 1691, rpm: 26645, amps: 53.9, volts: 16.0, i0: 1.2, propD: 5.1, pitch: 4.3 },
  idle: 0.05,                             // Motor-Leerlauf im Flug (Anteil), wie Betaflight-Idle
  cdaF: 0.010, cdaT: 0.035,               // Luftwiderstand mal Fläche von vorn und von oben in m² (Schätzung)
  kRD: 0.3,                               // Rotorwiderstand: Bremsung je m/s quer zum Rotor bei Schwebedrehzahl, in 1/s (Schätzung, Größenordnung nach RotorPy/Faessler)
  rho: 1.2,                               // Luftdichte kg/m³
  kYaw: 0.012,                            // Gegenmoment pro Newton Schub in m (aus dem Motor berechnet)
  rotDamp: 0.002,                         // Luftdämpfung der Drehung in N m s
  kp: [22, 14, 22], ki: [20, 15, 20], iMax: 3,   // Rate-PID je Achse (Nicken, Gieren, Rollen); Ausgang als Winkelbeschleunigung
  size: 1,                                // Modellgröße relativ zu 5 Zoll (Darstellung, Kamera)
  mass: 0, I: [0, 0, 0], Itune: [0, 0, 0],// aus der Geometrie berechnet (computeInertia)
  twr: 0, thrScale: 1,                    // Schub zu Gewicht bei vollem Akku (berechnet); Faktor für eigenen Schub
  m: {}                                   // Motorkonstanten (computeMotor)
};
// Motoren: x-Seite, z-Seite, Drehrichtung (diagonal gleich, wie Quad-X). Gleiche Reihenfolge wie im Modell.
export const MOTORS = [[1, -1, -1], [-1, -1, 1], [1, 1, 1], [-1, 1, -1]];

// Masse und Trägheit (Diagonaltensor) aus Motoren als Punktmassen, Rahmen und Akku als Quader.
// Itune ist die Trägheit, auf die der Regler abgestimmt ist; ändert man nur PHYS.I, reagiert die Drohne anders.
export function computeInertia() {
  const P = PHYS, a = P.arm/Math.SQRT2, [mb, bx, by, bz] = P.body, [ma, ax, ay, az, ah] = P.bat;
  P.mass = 4*P.mMotor + mb + ma;
  const box = (m, x, y, z) => [m/12*(y*y + z*z), m/12*(x*x + z*z), m/12*(x*x + y*y)];
  const B = box(mb, bx, by, bz), A = box(ma, ax, ay, az), mm = 4*P.mMotor*a*a;
  P.I = [mm + B[0] + A[0] + ma*ah*ah, 2*mm + B[1] + A[1], mm + B[2] + A[2] + ma*ah*ah];
  P.Itune = P.I.slice();
  computeMotor();
  return P.I;
}

// Motorkonstanten aus dem Prüfstandswert. Ke = Kt = 60/(2π KV). Schub = kT ω², Propellermoment = kQ ω².
// Rm (Motor, Regler, Kabel) so, dass Spannung, Strom und Drehzahl zum Prüfstandswert passen.
export function computeMotor() {
  const P = PHYS, s = P.motor, m = P.m;
  m.ke = 60/(2*Math.PI*s.kv);
  const w = s.rpm*2*Math.PI/60, T = s.T_g/1000*P.g;
  m.kT = T/(w*w)*P.thrScale;
  m.kQ = m.ke*(s.amps - s.i0)/(w*w)*P.thrScale;
  m.rm = (s.volts - m.ke*w)/s.amps;
  m.i0 = s.i0;
  m.R = s.propD*0.0254/2; m.A = Math.PI*m.R*m.R; m.pitch = s.pitch*0.0254;
  m.wHover = Math.sqrt(P.mass*P.g/4/m.kT);
  m.J = P.spool*(m.ke*m.ke/m.rm + 2*m.kQ*m.wHover);   // Drehträgheit Motor+Propeller aus der Hochlaufzeit
  P.kYaw = m.kQ/m.kT;
  P.twr = 4*m.kT*Math.pow(motorSteady(1, BAT.cells*4.2), 2)/(P.mass*P.g);
}
// Drehzahl im Gleichgewicht bei Steuerwert u und Akkuspannung V: Motormoment = Propellermoment
export function motorSteady(u, V) {
  const m = PHYS.m, b = m.ke*m.ke/m.rm, c = m.ke*u*V/m.rm - m.ke*m.i0;
  return c <= 0 ? 0 : (-b + Math.sqrt(b*b + 4*m.kQ*c))/(2*m.kQ);
}
// Steuerwert, bei dem 4 Motoren das Gewicht tragen (voller Akku, mit Spannungseinbruch). Für Tests und Anzeige.
export function hoverThrottle() {
  const m = PHYS.m, w = m.wHover;
  const I = m.kQ*w*w/m.ke + m.i0;
  let V = BAT.cells*4.2;
  for (let i = 0; i < 20; i++) { const u = (m.ke*w + I*m.rm)/V; V = BAT.cells*4.2 - (1 + 4*u*I)*(BAT.ri + BAT.r2); }
  return (m.ke*w + I*m.rm)/V;
}
export const STEP = 1/240;   // feste Physik-Schrittweite
// Akku (Schätzwerte): Zellen, Kapazität in mAh, Innenwiderstand in Ohm. Der Strom kommt aus dem Motormodell.
// drone.js überschreibt die Werte je Vorlage; hier die 5-Zoll-Vorlage.
export const BAT = { cells: 4, cap: 1500, ri: 0.016, r2: 0.006, tau: 4 };
computeInertia();   // nach BAT, weil computeMotor die Akkuspannung braucht
// r2, tau: RC-Glied für Spannungseinbruch und Erholung (Schätzung: Erholung in einigen Sekunden).

// Ruhespannung einer LiPo-Zelle über dem Ladestand (Schätzwerte aus typischen Entladekurven):
// steil oben und unten, flach in der Mitte.
const OCV = [[0, 3.27], [0.05, 3.5], [0.1, 3.62], [0.2, 3.7], [0.3, 3.75], [0.4, 3.79], [0.5, 3.83], [0.6, 3.87], [0.7, 3.92], [0.8, 4.0], [0.9, 4.08], [1, 4.2]];
export function cellOcv(soc) {
  soc = clamp(soc, 0, 1);
  for (let i = 1; i < OCV.length; i++) if (soc <= OCV[i][0]) {
    const [s0, v0] = OCV[i-1], [s1, v1] = OCV[i];
    return v0 + (v1 - v0)*(soc - s0)/(s1 - s0);
  }
  return 4.2;
}

// Rückmeldungen nach außen. In Node bleiben sie leer.
export const fx = { beep() {}, vibrate() {} };
// Aufgabe des aktiven Szenarios. Vorgabe ist der Torkurs; scenario.js tauscht sie aus.
// check(a, b, h): Fortschritt prüfen. collide(h): eigene Hindernisse, true bei Absturz. reset(): bei Neustart.
export const task = { check: checkGate, collide: null, reset() {}, early: false };   // early: vor Boden und Hindernissen prüfen

function newSim() {
  return {
    p: [0, PHYS.radius + 0.04, 0], v: [0, 0, 0], q: [0, 0, 0, 1], w: [0, 0, 0],
    thr: 0, t: 0, next: 0, lapStart: null, lastLap: null, grounded: true, crashMsg: '', crashT: 0,
    mah: 0, amp: 0, vpack: BAT.cells*4.2, cellRest: 4.2, flyT: 0, vrc: 0, vmin: BAT.cells*4.2,
    mot: [0, 0, 0, 0], cmd: [0, 0, 0, 0], hp: [1, 1, 1, 1], wi: [0, 0, 0], vib: 0,   // Motorausgang, Befehl, Zustand je Rotor, I-Anteil
    om: [0, 0, 0, 0], rpm: [0, 0, 0, 0]   // Motordrehzahl in rad/s und U/min
  };
}
function resetDrone() {
  game.throttle = 0; kb.pitch = kb.roll = kb.yaw = 0;
  game.state = 'fly';
  game.camPos = [0, 1.0, 2.6]; game.camHeading = [0, 0, -1];
}
export function respawn() {
  game.sim = newSim();
  resetDrone();
  game.armed = !cfg.needArm;
  game.pendingRespawn = false;
  task.reset();
}
// Nur die Drohne neu an den Start setzen (Jagd nach Treffer). Szenario, Zeit, Akku und Scharf-Zustand bleiben.
export function respawnDrone() {
  const o = game.sim, s = newSim();
  for (const k of ['t', 'next', 'lapStart', 'lastLap', 'mah', 'vrc', 'vmin', 'flyT', 'cellRest', 'vpack']) s[k] = o[k];
  game.sim = s;
  resetDrone();
}

// Scharf schalten oder aus (wie der Arm-Schalter an der Funke). Scharf nur mit Gas unten, wie bei Betaflight.
export function toggleArm() {
  if (game.armed) { game.armed = false; say('Disarmed', 1.2); return false; }
  if (game.throttle > 0.05) { say('Gas runter zum Scharfschalten', 1.6); return false; }
  game.armed = true; say('Armed', 1.2); fx.beep(660, 0.12);
  return true;
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
  const mc = PHYS.m, V = s.vpack, up = qRot(s.q, [0,1,0]);
  const wFull = motorSteady(1, V) || 1;
  // 2. Aerodynamik am Rotor (gilt für alle vier gleich, außer Propwash-Rauschen)
  const vAx = vDot(s.v, up);                                  // Anströmung entlang der Rotorachse (+ = Steigflug)
  const vPerp = vSub(s.v, vScale(up, vAx)), vHor = vLen(vPerp);
  const zr = Math.max(s.p[1] - PHYS.radius + 0.04*PHYS.size, mc.R*0.5);   // Rotorhöhe über Grund (Propeller ca. 4 cm über den Kufen)
  const ge = up[1] > 0.5 ? Math.min(1.4, 1/(1 - (mc.R/(4*zr))**2)) : 1;   // Bodeneffekt (Cheeseman-Bennett)
  const fac = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const vp = Math.max(1, s.om[i]/(2*Math.PI)*mc.pitch);    // Steiggeschwindigkeit des Propellers
    let f = clamp(1 - vAx/vp, 0, 1.15);                       // Steigflug kostet Schub, Sinkflug bringt etwas
    const T0 = mc.kT*s.om[i]*s.om[i];
    const vh = Math.sqrt(Math.max(T0, 0.01)/(2*PHYS.rho*mc.A));   // induzierte Geschwindigkeit im Schweben
    const d = -vAx/vh;                                        // Sinken in den eigenen Abwind (Wirbelring, Propwash)
    if (d > 0.25 && d < 1.8) {
      const k = Math.sin(Math.PI*(d - 0.25)/1.55)*clamp(1 - vHor/(1.5*vh), 0, 1);
      const n = Math.sin(s.t*53 + i*1.7) + Math.sin(s.t*79 + i*2.9);   // unruhiger Schub je Rotor
      f *= 1 - k*(0.18 + 0.12*n);
    }
    fac[i] = f*ge;
  }

  // 3. Rate-PID und Mischer (Quad-X). Am Boden mit wenig Gas: Motoren aus, Regler ruht.
  const a = PHYS.arm/Math.SQRT2, err = [tx - s.w[0], ty - s.w[1], tz - s.w[2]];
  const rest = s.grounded && game.throttle < 0.05;   // steht am Boden mit Gas unten
  const armed = game.armed && !rest;
  const tau = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    if (armed) s.wi[i] = clamp(s.wi[i] + err[i]*h, -PHYS.iMax, PHYS.iMax); else s.wi[i] = 0;
    tau[i] = PHYS.Itune[i]*(PHYS.kp[i]*err[i] + PHYS.ki[i]*s.wi[i]);   // gewünschtes Moment in N m
  }
  // Schub reagiert nicht linear auf den Steuerwert (T ~ ω²). Steigung dT/du am aktuellen Arbeitspunkt:
  const wAvg = Math.max(0.5*mc.wHover, (s.om[0] + s.om[1] + s.om[2] + s.om[3])/4);
  const slope = 2*mc.kT*wAvg*(mc.ke*V/mc.rm)/(mc.ke*mc.ke/mc.rm + 2*mc.kQ*wAvg);   // N je Einheit Steuerwert
  let lo = 1e9, hi = -1e9;
  const diff = MOTORS.map(([mx, mz, dir]) => ((-mz*a)*tau[0] + (mx*a)*tau[2])/(4*a*a*slope) + dir*tau[1]/(4*PHYS.kYaw*slope));
  for (const d of diff) { lo = Math.min(lo, d); hi = Math.max(hi, d); }
  const k = hi - lo > 1 ? 1/(hi - lo) : 1;   // zu viel verlangt: Lageregelung anteilig kürzen
  let u = diff.map(d => Math.max(PHYS.idle, game.throttle) + d*k);
  const top = Math.max(...u), bot = Math.min(...u);
  if (top > 1) u = u.map(x => x - (top - 1));   // Sättigung oben: alle runter, Lageregelung bleibt (wie Airmode)
  else if (bot < 0) u = u.map(x => x - bot);    // Sättigung unten: alle hoch
  // 4. Motoren: J dω/dt = Kt (I - I0) - kQ ω², I = (u V - Ke ω)/Rm. Akkustrom = 1 A Grundlast + Σ u I (Regler als Spannungswandler).
  // Akkuspannung V = E - Ri·Iakku hängt selbst vom Strom ab: direkt gelöst (linear in V), sonst schaukelt es bei hohen Strömen.
  for (let i = 0; i < 4; i++) s.cmd[i] = armed ? clamp(u[i], 0, 1) : game.armed ? PHYS.idle : 0;   // scharf am Boden: Leerlauf
  const E = BAT.cells*cellOcv(1 - s.mah/BAT.cap) - s.vrc;
  let su2 = 0, sue = 0;
  for (let i = 0; i < 4; i++) { su2 += s.cmd[i]*s.cmd[i]; sue += s.cmd[i]*mc.ke*s.om[i]; }
  const Vb = Math.max(0, (E - BAT.ri*(1 - sue/mc.rm))/(1 + BAT.ri*su2/mc.rm));
  let ibat = 1.0;   // Grundlast Elektronik, Kamera, Sender in A (Schätzung)
  const domega = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const I = (s.cmd[i]*Vb - mc.ke*s.om[i])/mc.rm;
    const q = mc.ke*(I - mc.i0*Math.sign(s.om[i])) - mc.kQ*s.om[i]*s.om[i];
    domega[i] = q/mc.J;
    s.om[i] = Math.max(0, s.om[i] + domega[i]*h);
    ibat += s.cmd[i]*I;
    s.mot[i] = s.om[i]/wFull;
  }
  ibat = Math.max(0, ibat);
  s.thr = (s.mot[0] + s.mot[1] + s.mot[2] + s.mot[3])/4;
  s.rpm = s.om.map(w => w*60/(2*Math.PI));
  // Akku: Verbrauch, Spannung unter Last
  s.amp = ibat;
  s.mah += s.amp*h/3.6;
  s.cellRest = cellOcv(1 - s.mah/BAT.cap);
  s.vrc += (s.amp*BAT.r2 - s.vrc)*Math.min(1, h/BAT.tau);
  s.vpack = Vb;
  if (s.thr > 0.05) s.vmin = Math.min(s.vmin, s.vpack);
  if (s.thr > 0.05) s.flyT += h;

  // 5. Momente und Drehung: I dw/dt = M - w x (I w) - Dämpfung
  const T = s.om.map((w, i) => mc.kT*w*w*fac[i]*s.hp[i]);
  let M = [0, 0, 0];
  MOTORS.forEach(([mx, mz, dir], i) => {
    M[0] += -mz*a*T[i]; M[2] += mx*a*T[i];
    M[1] += dir*(mc.kQ*s.om[i]*s.om[i] + mc.J*domega[i]);   // Propellermoment plus Reaktion beim Beschleunigen
  });
  // Unwucht beschädigter Propeller: Zittern um Nick- und Rollachse
  let vib = 0;
  for (let i = 0; i < 4; i++) vib += (1 - s.hp[i])*mc.kT*s.om[i]*s.om[i];
  s.vib = vib/(PHYS.mass*PHYS.g);
  M[0] += vib*a*0.15*Math.sin(s.t*157); M[2] += vib*a*0.15*Math.cos(s.t*173);
  const I = PHYS.I, w = s.w, Iw = [I[0]*w[0], I[1]*w[1], I[2]*w[2]], gyro = vCross(w, Iw);
  for (let i = 0; i < 3; i++) w[i] += (M[i] - gyro[i] - PHYS.rotDamp*w[i])/I[i]*h;
  if (rest) { w[0] = w[1] = w[2] = 0; }   // aus in der Luft: Drohne taumelt frei
  s.q = qNorm(qMul(s.q, qFromRotVec(vScale(w, h))));

  // 6. Kräfte: Schub, Schwerkraft, Rotorwiderstand (quer zum Rotor, ~ Drehzahl), Rumpfwiderstand nach Lage
  const upN = qRot(s.q, [0,1,0]);
  const aT = (T[0] + T[1] + T[2] + T[3])/PHYS.mass;
  const rd = PHYS.kRD*(s.om[0] + s.om[1] + s.om[2] + s.om[3])/(4*mc.wHover);
  const sp = vLen(s.v), cAx = sp > 1e-6 ? Math.abs(vAx)/sp : 0;
  const bd = 0.5*PHYS.rho*(PHYS.cdaF*(1 - cAx) + PHYS.cdaT*cAx)*sp/PHYS.mass;
  const acc = [0, 0, 0];
  for (let i = 0; i < 3; i++) acc[i] = upN[i]*aT - vPerp[i]*rd - s.v[i]*bd;
  acc[1] -= PHYS.g;
  s.v = vAdd(s.v, vScale(acc, h));
  const prev = s.p;
  s.p = vAdd(s.p, vScale(s.v, h));

  // Jagd: Treffer vor Boden und Hindernissen prüfen, damit ein steiler Anflug zählt und nicht als Absturz endet
  if (task.early) {
    task.check(prev, s.p, h);
    if (game.pendingRespawn) { game.pendingRespawn = false; respawnDrone(); return; }
  }
  // 6. Boden
  s.grounded = false;
  if (s.p[1] < PHYS.radius) {
    const vDown = -s.v[1], vh = Math.hypot(s.v[0], s.v[2]);
    const ck = dmgMode().crashK;
    if (vDown > PHYS.crashV*1.2*ck || vh > 9*ck) { crash('Bodenkontakt zu schnell'); return; }
    damage([0, 1, 0], vDown, 0.4);
    s.p[1] = PHYS.radius;
    if (s.v[1] < 0) s.v[1] = 0;
    const fr = Math.max(0, 1 - 6*h);
    s.v[0] *= fr; s.v[2] *= fr;
    s.grounded = true;
  }
  // 7. Hindernisse
  for (const c of colliders) if (collide(c, h)) return;
  if (task.collide && task.collide(h)) return;
  // 8. Aufgabe des Szenarios (Tore, Ringe ...)
  if (!task.early) task.check(prev, s.p, h);
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
  return contact([nx*c.cs + nz*c.sn, ny, -nx*c.sn + nz*c.cs], pen, h);
}

// Schadmodell (E4). crashK: Faktor auf die Absturzgeschwindigkeit; k: Schaden je (m/s)^2 Aufprall.
// Schätzwerte für das Spielgefühl. Aus: wie Stufe 1 (nur Absturz, kein Schaden).
export const DMG = {
  off:  { name: 'Aus', crashK: 1, k: 0 },
  mild: { name: 'Nachsichtig', crashK: 1.4, k: 0.012 },
  real: { name: 'Realistisch', crashK: 1, k: 0.03 }
};
export const dmgMode = () => DMG[cfg.dmg] || DMG.mild;
// Aufprall mit Normale n (zeigt vom Hindernis weg) und Geschwindigkeit v in m/s. Rotoren auf der
// Aufprallseite trifft es stärker; base ist der Anteil, den jeder Rotor abbekommt.
export function damage(n, v, base) {
  const s = game.sim, k = dmgMode().k;
  if (!k || v < 1.5) return;
  const c = [-s.q[0], -s.q[1], -s.q[2], s.q[3]], nb = qRot(c, n);   // Normale im Körpersystem
  MOTORS.forEach(([mx, mz], i) => {
    if (s.hp[i] <= 0) return;
    const w = Math.max(0, -(mx*nb[0] + mz*nb[2])/Math.SQRT2);
    s.hp[i] = Math.max(0, s.hp[i] - k*v*v*(base + w));
    if (s.hp[i] === 0) say('Motor ' + (i + 1) + ' ausgefallen', 2);
  });
}

// Berührung mit Flächennormale n und Eindringtiefe pen: zu schnell = Absturz, sonst abgleiten.
export function contact(n, pen, h) {
  const s = game.sim;
  const vn = vDot(s.v, n);
  if (-vn > PHYS.crashV*dmgMode().crashK) { crash('Hindernis getroffen'); return true; }
  damage(n, -vn, 0.15);
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
