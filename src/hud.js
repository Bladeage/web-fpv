/* HUD im Betaflight-OSD-Stil: Werte, Warnungen, Horizont, Tormarker, Touch-Sticks, Analog-Look. */
import { DEG, clamp, vSub, vLen, qRot, mApply } from './math.js';
import { cfg, game, tch, inp, ptr, messages } from './state.js';
import { PHYS, BAT } from './physics.js';
import { gp } from './gamepad.js';
import { glc, hctx, vw, vh, inset, lastVP, lastCamQ, lastVf } from './render.js';
import { touchUI, stickR } from './input.js';
import { osdOn, osdLines, osdWarning, RED } from './osd.js';
import { scenLabel, scenTarget } from './scenario.js';

function linkQuality() { const d = Math.hypot(game.sim.p[0], game.sim.p[2]); return clamp(100 - Math.max(0, d - 80)*0.3, 0, 100); }

// Analog-Look: Rauschen, Zeilen, Störstreifen, Vignette
const noisePats = []; let scanPat = null;
function makeNoise() {
  for (let k = 0; k < 4; k++) {
    const nc = document.createElement('canvas'); nc.width = nc.height = 128;
    const x = nc.getContext('2d'), id = x.createImageData(128, 128);
    for (let i = 0; i < id.data.length; i += 4) { const v = Math.random()*255; id.data[i] = id.data[i+1] = id.data[i+2] = v; id.data[i+3] = 255; }
    x.putImageData(id, 0, 0);
    noisePats.push(hctx.createPattern(nc, 'repeat'));
  }
  const sc = document.createElement('canvas'); sc.width = 1; sc.height = 3;
  const sx = sc.getContext('2d'); sx.fillStyle = 'rgba(0,0,0,0.55)'; sx.fillRect(0, 0, 1, 1);
  scanPat = hctx.createPattern(sc, 'repeat');
}
function drawAnalog(c, W, H, lq) {
  if (!noisePats.length) makeNoise();
  const bad = clamp((100 - lq)/70, 0, 1);
  c.save();
  c.globalAlpha = 0.05 + bad*0.4;
  const ox = Math.random()*128, oy = Math.random()*128;
  c.translate(-ox, -oy); c.fillStyle = noisePats[(Math.random()*4) | 0]; c.fillRect(0, 0, W + 128, H + 128);
  c.translate(ox, oy);
  c.globalAlpha = 0.16; c.fillStyle = scanPat; c.fillRect(0, 0, W, H);
  if (bad > 0.1) {
    for (let i = 0; i < Math.round(bad*8); i++) {
      if (Math.random() < 0.5) continue;
      c.globalAlpha = bad*0.55; c.fillStyle = Math.random() < 0.5 ? '#ffffff' : '#000000';
      c.fillRect(0, Math.random()*H, W, 1 + Math.random()*5*bad);
    }
  }
  c.globalAlpha = 1;
  const g = c.createRadialGradient(W/2, H/2, Math.min(W, H)*0.35, W/2, H/2, Math.hypot(W, H)*0.55);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.restore();
}

// Künstlicher Horizont: folgt dem echten Horizont im Kamerabild
function drawAHI(c, W, H) {
  const q = lastCamQ || game.sim.q;
  const f = qRot(q, [0,0,-1]), r = qRot(q, [1,0,0]), u = qRot(q, [0,1,0]);
  if (u[1] < 0.05) return;
  const pitchUp = Math.atan2(f[1], Math.hypot(f[0], f[2]));
  const roll = Math.atan2(-r[1], u[1]);
  const focal = (H/2)/Math.tan(lastVf/2);
  const off = clamp(focal*Math.tan(clamp(pitchUp, -1.3, 1.3)), -H*0.3, H*0.3);
  const half = Math.min(W*0.16, 150);
  c.save(); c.translate(W/2, H/2); c.rotate(-roll); c.translate(0, off);
  c.beginPath();
  for (let x = -half; x < half; x += 18) { if (Math.abs(x + 4.5) < 28) continue; c.moveTo(x, 0); c.lineTo(x + 9, 0); }
  c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.55)'; c.stroke();
  c.lineWidth = 2; c.strokeStyle = '#ffffff'; c.stroke();
  c.restore();
}

// Digitalbild: bei schwachem Signal Klötzchen und kurze Standbilder statt Rauschen
const frozen = { cv: null, until: 0 };
function drawDigital(c, W, H, lq) {
  const bad = clamp((65 - lq)/45, 0, 1), now = performance.now();
  if (bad <= 0) return;
  if (now > frozen.until && Math.random() < bad*bad*0.04) {
    frozen.cv = frozen.cv || document.createElement('canvas');
    frozen.cv.width = glc.width; frozen.cv.height = glc.height;
    frozen.cv.getContext('2d').drawImage(glc, 0, 0);
    frozen.until = now + 120 + Math.random()*600*bad;
  }
  c.save();
  if (now < frozen.until && frozen.cv) c.drawImage(frozen.cv, 0, 0, W, H);
  const k = glc.width/W;
  c.imageSmoothingEnabled = false;
  for (let i = 0; i < Math.round(bad*16); i++) {
    const bs = 16*(1 + Math.floor(Math.random()*4)), x = Math.random()*(W - bs), y = Math.random()*(H - bs);
    if (Math.random() < 0.5) c.drawImage(glc, x*k, y*k, 4*k, 4*k, x, y, bs, bs);   // grobe Klötzchen
    else c.drawImage(glc, x*k, y*k, bs*k, bs*k, x + (Math.random() - 0.5)*bs, y, bs, bs);   // verschobener Block
  }
  c.restore();
}

// Kleine Quadrate mit der Knüppelstellung: links Gas/Gieren, rechts Nicken/Rollen (Mode 2)
function drawStickBoxes(c, x, y, sz, lw) {
  const box = (cx, px, py) => {
    c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = lw + 2; c.strokeRect(cx - sz/2, y - sz, sz, sz);
    c.strokeStyle = '#fff'; c.lineWidth = lw; c.strokeRect(cx - sz/2, y - sz, sz, sz);
    const dx = cx + px*sz/2*0.85, dy = y - sz/2 - py*sz/2*0.85;
    c.beginPath(); c.arc(dx, dy, Math.max(2.5, sz*0.09), 0, Math.PI*2);
    c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = 'rgba(0,0,0,.8)'; c.stroke();
  };
  box(x - sz*0.75, inp.yaw, game.throttle*2 - 1);
  box(x + sz*0.75, inp.roll, inp.pitch);
}

export function drawHud() {
  const c = hctx, W = vw, H = vh, s = game.sim;
  c.clearRect(0, 0, W, H);
  if (game.paused) return;
  const lq = linkQuality();
  const fpv = cfg.cam === 'fpv', analog = cfg.video === 'analog';
  if (fpv && analog) drawAnalog(c, W, H, lq);
  if (fpv && cfg.video === 'digital') drawDigital(c, W, H, lq);
  const on = id => osdOn(cfg.osd, id);

  // Analog: Zeichensatz wie MAX7456 (fett, dicker schwarzer Rand, leicht weich).
  // Digital und ohne Effekte: feiner und scharf, mehr Zeilen auf dem Bild.
  const fs = Math.round(clamp(Math.min(W, H)/(analog ? 30 : 34), 12, 18));
  const FONT = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
  const weight = analog ? 700 : 600, edge = analog ? 3 : 2.2;
  c.font = `${weight} ${fs}px ${FONT}`;
  c.lineJoin = 'round'; c.textBaseline = 'alphabetic';
  const txt = (t, x, y, al = 'left', col = '#fff') => {
    c.textAlign = al; c.lineWidth = edge; c.strokeStyle = analog ? 'rgba(0,0,0,.75)' : 'rgba(0,0,0,.6)'; c.strokeText(t, x, y); c.fillStyle = col; c.fillText(t, x, y);
  };
  const narrow = W < 600;
  const L = inset.l + 14, Rx = W - inset.r - 14, B = H - inset.b - 16;
  const T = inset.t + 16 + fs + (narrow ? 50 : 0);
  const Lt = narrow ? L : L + 54;   // oben links Platz für ☰ (schmal: Zeilen rücken stattdessen nach unten)
  const lh = fs*1.35;
  const bot = touchUI ? B - stickR()*2 - 30 : B;
  const blink = (performance.now() % 800) < 500;

  // Messwerte für das OSD
  const f = qRot(s.q, [0,0,-1]), r = qRot(s.q, [1,0,0]), u = qRot(s.q, [0,1,0]);
  const now = new Date();
  const d = {
    lq, mode: cfg.mode, label: scenLabel(), crashes: game.crashes,
    cur: s.lapStart !== null ? s.t - s.lapStart : null, last: s.lastLap, best: game.best,
    clock: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
    vpack: s.vpack, cell: s.vpack/BAT.cells, cellRest: s.cellRest, amp: s.amp, mah: s.mah, cap: BAT.cap, flyT: s.flyT,
    kmh: vLen(s.v)*3.6, alt: Math.max(0, s.p[1] - PHYS.radius), homeD: Math.hypot(s.p[0], s.p[2]),
    thr: game.throttle, pitchDeg: Math.atan2(-f[1], u[1])/DEG, rollDeg: Math.atan2(-r[1], u[1])/DEG
  };
  const lines = osdLines(cfg.osd, d);

  // Analog: OSD leicht weich, bei schlechtem Empfang springt es seitlich (Synchronisation)
  c.save();
  if (analog && fpv) {
    c.filter = 'blur(0.45px)';
    if (lq < 50 && Math.random() < (50 - lq)/80) c.translate((Math.random() - 0.5)*6, 0);
  }
  lines.tl.forEach((l, i) => txt(l.t, Lt, T + lh*i, 'left', l.col));
  lines.tr.forEach((l, i) => txt(l.t, Rx, T + lh*i, 'right', l.col));
  lines.bl.forEach((l, i, a) => txt(l.t, L, bot - lh*(a.length - 1 - i), 'left', l.col));
  lines.br.forEach((l, i, a) => txt(l.t, Rx, bot - lh*(a.length - 1 - i), 'right', l.col));
  lines.bc.forEach((l, i, a) => txt(l.t, W/2, bot - lh*(a.length - 1 - i), 'center', l.col));
  if (on('home')) {
    const homeTxt = lines.br[lines.br.length - 1].t;
    const rel = Math.atan2(-s.p[0], s.p[2]) - Math.atan2(f[0], -f[2]);
    const ax = Rx - c.measureText(homeTxt).width - fs*0.8, ay = bot - fs*0.35;
    c.save(); c.translate(ax, ay); c.rotate(rel);
    c.beginPath(); c.moveTo(0, -fs*0.55); c.lineTo(fs*0.4, fs*0.45); c.lineTo(0, fs*0.2); c.lineTo(-fs*0.4, fs*0.45); c.closePath();
    c.lineWidth = edge; c.strokeStyle = 'rgba(0,0,0,.7)'; c.stroke(); c.fillStyle = '#fff'; c.fill();
    c.restore();
  }
  if (on('sticks') && !touchUI) drawStickBoxes(c, W/2, bot - lh*lines.bc.length - fs*0.2, fs*2.6, analog ? 2 : 1.5);

  // Mitte: Fadenkreuz und künstlicher Horizont
  if (fpv && on('ahi')) drawAHI(c, W, H);
  if (on('cross')) {
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(W/2 - 14, H/2); c.lineTo(W/2 - 5, H/2);
    c.moveTo(W/2 + 5, H/2);  c.lineTo(W/2 + 14, H/2);
    c.moveTo(W/2, H/2 - 4);  c.lineTo(W/2, H/2 - 9);
    c.stroke();
  }
  // Gasbalken (ohne Touch)
  if (!touchUI && on('thr')) {
    const bh = H*0.28, bx = L, byTop = H/2 - bh/2;
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(bx, byTop, 10, bh);
    c.fillStyle = '#fff'; c.fillRect(bx, byTop + bh*(1 - game.throttle), 10, bh*game.throttle);
  }
  // Warnungen wie im Betaflight-OSD
  const warn = osdWarning(d);
  if (on('warn') && warn && blink && game.state === 'fly') txt(warn, W/2, H/2 - Math.min(H*0.16, 120), 'center', RED);
  c.restore();

  if (on('marker')) drawGateMarker(c, W, H, fs);
  if (touchUI) drawSticks(c, W, H);

  const tnow = performance.now();
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].until < tnow) messages.splice(i, 1);
  messages.forEach((m, i) => txt(m.text, W/2, H*0.3 + i*lh, 'center', '#fff6b0'));

  if (game.state === 'fly' && s.t < 6 && s.grounded && game.throttle < 0.2) {
    const hint = gp.connected ? 'Gasknüppel hoch' : touchUI ? 'Linken Daumen nach oben schieben für Gas' : 'W drücken für Gas, S für weniger';
    txt(hint, W/2, H*0.62, 'center', '#ffffff');
  }
  if (game.state === 'crashed') {
    c.fillStyle = 'rgba(120,0,0,.25)'; c.fillRect(0, 0, W, H);
    c.font = `800 ${fs*2.2}px ${FONT}`;
    txt('ABSTURZ', W/2, H/2 - fs, 'center', '#ff5a4a');
    c.font = `${weight} ${fs}px ${FONT}`;
    txt(s.crashMsg, W/2, H/2 + fs*0.8, 'center');
    txt(gp.connected ? 'Taste an der Funke oder R für Neustart' : touchUI ? 'Tippen für Neustart' : 'R für Neustart', W/2, H/2 + fs*2.3, 'center', '#dfe6ea');
  }
}

function drawGateMarker(c, W, H, fs) {
  if (!lastVP) return;
  const tgt = scenTarget();
  if (!tgt) return;
  const cp = mApply(lastVP, tgt);
  const dist = Math.round(vLen(vSub(tgt, game.sim.p)));
  c.lineWidth = 3;
  if (cp[3] > 0.01) {
    const nx = cp[0]/cp[3], ny = cp[1]/cp[3];
    if (Math.abs(nx) < 0.95 && Math.abs(ny) < 0.95) {
      const sx = (nx*0.5 + 0.5)*W, sy = (0.5 - ny*0.5)*H, r = 9;
      c.beginPath(); c.moveTo(sx, sy - r); c.lineTo(sx + r, sy); c.lineTo(sx, sy + r); c.lineTo(sx - r, sy); c.closePath();
      c.strokeStyle = 'rgba(0,0,0,.6)'; c.stroke();
      c.strokeStyle = '#5dff86'; c.lineWidth = 2; c.stroke();
      c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.7)';
      c.strokeText(dist + ' M', sx, sy + r + fs + 2); c.fillStyle = '#5dff86'; c.fillText(dist + ' M', sx, sy + r + fs + 2);
      return;
    }
  }
  let dx = cp[0], dy = cp[1];
  if (cp[3] < 0) { dx = -dx; dy = -dy; }
  let vx = dx*W, vy = -dy*H;
  const l = Math.hypot(vx, vy);
  if (l < 1e-6) { vx = 0; vy = 1; } else { vx /= l; vy /= l; }
  const rad = Math.min(W, H)*0.36;
  const sx = W/2 + vx*rad, sy = H/2 + vy*rad, ang = Math.atan2(vy, vx);
  c.save(); c.translate(sx, sy); c.rotate(ang);
  c.beginPath(); c.moveTo(14, 0); c.lineTo(-8, -10); c.lineTo(-8, 10); c.closePath();
  c.fillStyle = '#5dff86'; c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 2; c.fill(); c.stroke();
  c.restore();
}

function drawSticks(c, W, H) {
  const R = stickR(), m = 22;
  let L = null, Rt = null;
  for (const p of ptr.values()) { if (p.side === 'L') L = p; else Rt = p; }
  const baseL = L ? [L.x0, L.y0 + (L.thr0 - 0.5)*2*R] : [inset.l + m + R, H - inset.b - m - R];
  const knobL = [baseL[0] + tch.yaw*R, baseL[1] + (0.5 - game.throttle)*2*R];
  const baseR = Rt ? [Rt.x0, Rt.y0] : [W - inset.r - m - R, H - inset.b - m - R];
  const knobR = [baseR[0] + tch.roll*R, baseR[1] - tch.pitch*R];
  for (const [b, k, active] of [[baseL, knobL, !!L], [baseR, knobR, !!Rt]]) {
    c.beginPath(); c.arc(b[0], b[1], R, 0, Math.PI*2);
    c.fillStyle = active ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.07)'; c.fill();
    c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 2; c.stroke();
    c.beginPath(); c.arc(k[0], k[1], R*0.32, 0, Math.PI*2);
    c.fillStyle = active ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.4)'; c.fill();
  }
}
