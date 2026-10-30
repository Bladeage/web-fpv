/* HUD im Betaflight-OSD-Stil: Werte, Warnungen, Horizont, Tormarker, Touch-Sticks, Analog-Look. */
import { clamp, vSub, vLen, qRot, mApply } from './math.js';
import { cfg, game, tch, ptr, messages } from './state.js';
import { PHYS, BAT } from './physics.js';
import { gp } from './gamepad.js';
import { hctx, vw, vh, inset, lastVP, lastCamQ, lastVf } from './render.js';
import { touchUI, stickR } from './input.js';
import { fmtTime, fmtClock } from './format.js';
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

export function drawHud() {
  const c = hctx, W = vw, H = vh, s = game.sim;
  c.clearRect(0, 0, W, H);
  if (game.paused) return;
  const lq = linkQuality();
  if (cfg.analog && cfg.cam === 'fpv') drawAnalog(c, W, H, lq);

  const fs = Math.round(clamp(Math.min(W, H)/30, 12, 18));
  const FONT = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
  c.font = `700 ${fs}px ${FONT}`;
  c.lineWidth = 3; c.lineJoin = 'round'; c.textBaseline = 'alphabetic';
  const txt = (t, x, y, al = 'left', col = '#fff') => {
    c.textAlign = al; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.7)'; c.strokeText(t, x, y); c.fillStyle = col; c.fillText(t, x, y);
  };
  const narrow = W < 600;
  const L = inset.l + 14, Rx = W - inset.r - 14, B = H - inset.b - 16;
  const T = inset.t + 16 + fs + (narrow ? 50 : 0);
  const Lt = narrow ? L : L + 54;   // oben links Platz für ☰ (schmal: Zeilen rücken stattdessen nach unten)
  const lh = fs*1.35;
  const bot = touchUI ? B - stickR()*2 - 30 : B;
  const blink = (performance.now() % 800) < 500;
  const RED = '#ff7a6a', YEL = '#ffd27a';

  // links oben: Empfang, Modus, Tor
  txt('LQ ' + String(Math.round(lq)).padStart(3, ' '), Lt, T, 'left', lq < 50 ? RED : '#fff');
  txt(cfg.mode === 'acro' ? 'ACRO' : 'ANGL', Lt, T + lh, 'left', cfg.mode === 'acro' ? '#ffb27a' : '#9be7ff');
  txt(scenLabel(), Lt, T + lh*2);
  if (game.crashes) txt(`CRASH ${game.crashes}`, Lt, T + lh*3, 'left', '#ffd0c8');
  // rechts oben: Rundenzeiten
  const cur = s.lapStart !== null ? s.t - s.lapStart : null;
  txt(fmtTime(cur), Rx, T, 'right');
  txt('LETZTE ' + fmtTime(s.lastLap), Rx, T + lh, 'right', '#dfe6ea');
  txt('BESTE ' + fmtTime(game.best), Rx, T + lh*2, 'right', '#c8ffd4');

  // links unten: Akku
  const cell = s.vpack/BAT.cells;
  const vcol = cell < 3.5 ? RED : cell < 3.7 ? YEL : '#fff';
  txt(s.vpack.toFixed(1) + 'V', L, bot - lh*3, 'left', vcol);
  txt(cell.toFixed(2) + 'V', L, bot - lh*2, 'left', vcol);
  txt(s.amp.toFixed(1) + 'A', L, bot - lh);
  txt(String(Math.round(s.mah)).padStart(4, '0') + 'MAH', L, bot, 'left', s.mah > BAT.cap*0.8 ? YEL : '#fff');
  // rechts unten: Flugzeit, Tempo, Höhe, Heimweg
  const kmh = Math.round(vLen(s.v)*3.6), alt = Math.max(0, s.p[1] - PHYS.radius).toFixed(1);
  const homeD = Math.round(Math.hypot(s.p[0], s.p[2]));
  txt('FLY ' + fmtClock(s.flyT), Rx, bot - lh*3, 'right');
  txt(String(kmh).padStart(3, '0') + ' KMH', Rx, bot - lh*2, 'right');
  txt('ALT ' + alt + 'M', Rx, bot - lh, 'right');
  const homeTxt = 'H ' + homeD + 'M';
  txt(homeTxt, Rx, bot, 'right');
  {
    const f = qRot(s.q, [0,0,-1]);
    const rel = Math.atan2(-s.p[0], s.p[2]) - Math.atan2(f[0], -f[2]);
    const ax = Rx - c.measureText(homeTxt).width - fs*0.8, ay = bot - fs*0.35;
    c.save(); c.translate(ax, ay); c.rotate(rel);
    c.beginPath(); c.moveTo(0, -fs*0.55); c.lineTo(fs*0.4, fs*0.45); c.lineTo(0, fs*0.2); c.lineTo(-fs*0.4, fs*0.45); c.closePath();
    c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.7)'; c.stroke(); c.fillStyle = '#fff'; c.fill();
    c.restore();
  }
  // Mitte unten: Gas
  txt('GAS ' + String(Math.round(game.throttle*100)).padStart(3, ' ') + '%', W/2, bot, 'center');

  // Mitte: Fadenkreuz und künstlicher Horizont
  if (cfg.cam === 'fpv') drawAHI(c, W, H);
  c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2;
  c.beginPath();
  c.moveTo(W/2 - 14, H/2); c.lineTo(W/2 - 5, H/2);
  c.moveTo(W/2 + 5, H/2);  c.lineTo(W/2 + 14, H/2);
  c.moveTo(W/2, H/2 - 4);  c.lineTo(W/2, H/2 - 9);
  c.stroke();

  // Gasbalken (ohne Touch)
  if (!touchUI) {
    const bh = H*0.28, bx = L, byTop = H/2 - bh/2;
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(bx, byTop, 10, bh);
    c.fillStyle = '#fff'; c.fillRect(bx, byTop + bh*(1 - game.throttle), 10, bh*game.throttle);
  }

  // Warnungen wie im Betaflight-OSD
  let warn = null;
  if (s.cellRest < 3.45) warn = 'LAND NOW';
  else if (cell < 3.5) warn = 'LOW BATTERY';
  else if (lq < 35) warn = 'LQ LOW';
  if (warn && blink && game.state === 'fly') txt(warn, W/2, H/2 - Math.min(H*0.16, 120), 'center', RED);

  drawGateMarker(c, W, H, fs);
  if (touchUI) drawSticks(c, W, H);

  const now = performance.now();
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].until < now) messages.splice(i, 1);
  messages.forEach((m, i) => txt(m.text, W/2, H*0.3 + i*lh, 'center', '#fff6b0'));

  if (game.state === 'fly' && s.t < 6 && s.grounded && game.throttle < 0.2) {
    const hint = gp.connected ? 'Gasknüppel hoch' : touchUI ? 'Linken Daumen nach oben schieben für Gas' : 'W drücken für Gas, S für weniger';
    txt(hint, W/2, H*0.62, 'center', '#ffffff');
  }
  if (game.state === 'crashed') {
    c.fillStyle = 'rgba(120,0,0,.25)'; c.fillRect(0, 0, W, H);
    c.font = `800 ${fs*2.2}px ${FONT}`;
    txt('ABSTURZ', W/2, H/2 - fs, 'center', '#ff5a4a');
    c.font = `700 ${fs}px ${FONT}`;
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
