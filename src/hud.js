/* HUD im Betaflight-OSD-Stil: Werte, Warnungen, Horizont, Tormarker, Touch-Sticks, Analog-Look. */
import { DEG, clamp, vSub, vLen, qRot, mApply } from './math.js';
import { cfg, game, tch, inp, ptr, messages, keyOf, keyName } from './state.js';
import { bf } from './bf.js';
import { rw, groundH, rwLatLon, rwPlace } from './realworld.js';
import { PHYS, BAT } from './physics.js';
import { gp } from './gamepad.js';
import { glc, glLost, hctx, vw, vh, inset, lastVP, lastCamQ, lastVf, frameStat } from './render.js';
import { touchUI, stickR } from './input.js';
import { osdOn, osdLines, osdWarning, RED } from './osd.js';
import { scenLabel, scenTarget, scen, diff } from './scenario.js';
import { disPreviewLayout, disBaseInfo } from './distypes.js';
import { vb, vbLabel } from './verbund.js';
import { signal } from './signal.js';


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
// Farbe und Helligkeit des 3D-Bildes per CSS-Filter (billig, auf der Grafikkarte)
let glFilter = '';
function setGlFilter(f) { if (f !== glFilter) { glFilter = f; glc.style.filter = f; } }

// Analogbild. q = Videosignal 0..100. Mit sinkendem Signal: mehr Schnee, Farbe geht verloren,
// Zeilen reißen seitlich aus, Geisterbild (Mehrwege), wandernder Brummbalken, Bild rollt, am Ende nur Rauschen.
function drawAnalog(c, W, H, q) {
  if (!noisePats.length) makeNoise();
  const bad = clamp((100 - q)/85, 0, 1), now = performance.now(), k = glc.width/W;
  const flick = bad > 0.3 ? 1 + (Math.random() - 0.5)*0.25*bad : 1, lite = frameStat.lite;
  setGlFilter(bad > 0.02 && !lite ? `saturate(${(1 - bad*0.9).toFixed(2)}) brightness(${(flick*(1 - bad*0.15)).toFixed(2)}) contrast(${(1 - bad*0.25).toFixed(2)})` : '');
  c.save();
  // Bild rollt (Synchronisation verloren)
  // Sparmodus: keine Kopien des 3D-Bilds (auf Handys teuer), kein CSS-Filter
  if (!lite && bad > 0.75 && Math.random() < (bad - 0.75)*1.2) {
    const off = Math.random()*H*0.25;
    c.drawImage(glc, 0, 0, glc.width, glc.height, 0, off, W, H);
    c.drawImage(glc, 0, 0, glc.width, glc.height, 0, off - H, W, H);
  }
  // Geisterbild durch Reflexionen, vor allem hinter Hindernissen
  const ghost = clamp(bad*0.6 + signal.block/120, 0, 0.6);
  if (!lite && ghost > 0.08) { c.globalAlpha = ghost*0.35; c.drawImage(glc, 0, 0, glc.width, glc.height, 5 + ghost*20, 0, W, H); c.globalAlpha = 1; }
  // ausgerissene Zeilen
  for (let i = 0; i < (lite ? 0 : Math.round(bad*bad*10)); i++) {
    const y = Math.random()*H, h = 1 + Math.random()*14*bad, dx = (Math.random() - 0.5)*60*bad;
    c.drawImage(glc, 0, y*k, glc.width, h*k, dx, y, W, h);
  }
  // Schnee
  c.globalAlpha = q < 6 ? 0.95 : 0.05 + bad*bad*0.6;
  const ox = Math.random()*128, oy = Math.random()*128;
  c.translate(-ox, -oy); c.fillStyle = noisePats[(Math.random()*4) | 0]; c.fillRect(0, 0, W + 128, H + 128);
  c.translate(ox, oy);
  c.globalAlpha = 0.16; c.fillStyle = scanPat; c.fillRect(0, 0, W, H);
  // helle und dunkle Störstreifen
  for (let i = 0; i < Math.round(bad*8); i++) {
    if (Math.random() < 0.5) continue;
    c.globalAlpha = bad*0.5; c.fillStyle = Math.random() < 0.5 ? '#ffffff' : '#000000';
    c.fillRect(0, Math.random()*H, W, 1 + Math.random()*5*bad);
  }
  // wandernder Brummbalken
  if (bad > 0.25) {
    const by = ((now/1000*70) % (H*1.6)) - H*0.3, bh = H*0.18;
    const g = c.createLinearGradient(0, by, 0, by + bh);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, `rgba(0,0,0,${(bad*0.22).toFixed(2)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = 1; c.fillStyle = g; c.fillRect(0, by, W, bh);
  }
  c.globalAlpha = 1;
  c.fillStyle = vignette(c, W, H); c.fillRect(0, 0, W, H);
  c.restore();
}

// Randabdunklung: Verlauf nur bei neuer Bildgröße anlegen
const vig = { w: 0, h: 0, g: null };
function vignette(c, W, H) {
  if (vig.w !== W || vig.h !== H || !vig.g) {
    vig.g = c.createRadialGradient(W/2, H/2, Math.min(W, H)*0.35, W/2, H/2, Math.hypot(W, H)*0.55);
    vig.g.addColorStop(0, 'rgba(0,0,0,0)'); vig.g.addColorStop(1, 'rgba(0,0,0,0.45)');
    vig.w = W; vig.h = H;
  }
  return vig.g;
}

// Digitalbild. q = Videosignal 0..100. Mit sinkendem Signal: weniger Bitrate (grobes, weiches Bild),
// Klötzchen mit Farbfehlern, kurze Standbilder. Ohne Signal bleibt das letzte Bild stehen und wird dunkel.
const frozen = { cv: null, until: 0, lost: 0 };
// Digital (wie HD-Brillen): bleibt lange sauber und bricht dann ein. Keine Verpixelung, sondern Fehler wie bei
// komprimiertem Video: 16-px-Blöcke mit altem Bildinhalt, einfarbige Blöcke (nur Grundfarbe übertragen), verschobene
// Blöcke, Fehler laufen in einer Zeile nach rechts weiter, verschobene Streifen, kurze Ruckler und Standbilder.
const DG = { prev: null, prevT: 0, dc: null };
function drawDigital(c, W, H, q) {
  const bad = clamp((45 - q)/40, 0, 1), now = performance.now(), k = glc.width/W;   // über 45 % sauber (Schätzung)
  setGlFilter('');
  if (bad <= 0) { frozen.lost = 0; return; }
  const copy = cv => { cv.width = glc.width; cv.height = glc.height; cv.getContext('2d').drawImage(glc, 0, 0); return cv; };
  const snap = () => { frozen.cv = copy(frozen.cv || document.createElement('canvas')); };
  c.save();
  if (q < 4) {   // Signal weg: Standbild, wird nach und nach dunkel
    if (!frozen.lost) { frozen.lost = now; snap(); }
    c.drawImage(frozen.cv, 0, 0, W, H);
    c.fillStyle = `rgba(0,0,0,${clamp((now - frozen.lost)/2500, 0, 0.85).toFixed(2)})`; c.fillRect(0, 0, W, H);
    c.restore(); return;
  }
  frozen.lost = 0;
  // Standbild (selten, länger) und Ruckler (häufiger, kurz: einzelne Bilder fallen aus)
  if (now > frozen.until) {
    if (Math.random() < bad*bad*0.03) { snap(); frozen.until = now + 150 + Math.random()*700*bad; }
    else if (bad > 0.25 && Math.random() < bad*0.12) { snap(); frozen.until = now + 35 + Math.random()*70; }
  }
  if (frameStat.lite) { c.restore(); return; }   // Sparmodus: keine Kopien des 3D-Bilds
  if (now < frozen.until && frozen.cv) { c.drawImage(frozen.cv, 0, 0, W, H); c.restore(); return; }
  // Älteres Bild für „hängende“ Blöcke, alle 300 ms erneuert
  if (!DG.prev || now - DG.prevT > 300) { DG.prev = copy(DG.prev || document.createElement('canvas')); DG.prevT = now; }
  DG.dc = DG.dc || Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
  const bs = 16, cols = Math.ceil(W/bs), rows = Math.ceil(H/bs);
  const block = (type, x, y, w, h) => {
    if (type === 0) c.drawImage(DG.prev, x*k, y*k, w*k, h*k, x, y, w, h);                           // alter Inhalt
    else if (type === 1) { const d = DG.dc.getContext('2d'); d.drawImage(glc, x*k, y*k, w*k, h*k, 0, 0, 1, 1);
      c.imageSmoothingEnabled = true; c.drawImage(DG.dc, 0, 0, 1, 1, x, y, w, h); }                  // nur Grundfarbe
    else { const dx = (Math.random() < 0.5 ? -1 : 1)*bs*(1 + Math.floor(Math.random()*2));
      c.drawImage(glc, clamp(x + dx, 0, W - w)*k, y*k, w*k, h*k, x, y, w, h); }                     // verschoben
  };
  // Fehler in Läufen: Start irgendwo in einer Zeile, dann 2 bis 12 Blöcke nach rechts gleicher Art
  const runs = Math.round(bad*bad*14 + bad*2);
  for (let r = 0; r < runs; r++) {
    const row = Math.floor(Math.random()*rows), col = Math.floor(Math.random()*cols), len = 2 + Math.floor(Math.random()*10*bad);
    const type = Math.random() < 0.45 ? 0 : Math.random() < 0.6 ? 1 : 2, tall = Math.random() < 0.3 ? 2 : 1;
    for (let i = 0; i < len && col + i < cols; i++) block(type, (col + i)*bs, row*bs, bs, bs*tall);
  }
  // Streifen: ein Band über die ganze Breite, seitlich verschoben oder mit altem Inhalt, leicht grünstichig
  if (Math.random() < bad*0.18) {
    const y = Math.floor(Math.random()*rows)*bs, h = bs*(1 + Math.floor(Math.random()*3)), dx = (Math.random() - 0.5)*W*0.15*bad;
    if (Math.random() < 0.5) c.drawImage(glc, 0, y*k, W*k, h*k, dx, y, W, h); else c.drawImage(DG.prev, 0, y*k, W*k, h*k, 0, y, W, h);
    c.fillStyle = 'rgba(30,255,120,.07)'; c.fillRect(0, y, W, h);
  }
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
  if (game.paused) { setGlFilter(''); return; }
  const lq = signal.lq, q = signal.video;
  const fpv = cfg.cam === 'fpv', analog = cfg.video === 'analog';
  if (fpv && analog) drawAnalog(c, W, H, q);
  else if (fpv && cfg.video === 'digital') drawDigital(c, W, H, q);
  else setGlFilter('');
  const on = id => osdOn(cfg.osd, id);

  // Analog: Zeichensatz wie MAX7456 (fett, dicker schwarzer Rand, leicht weich).
  // Digital und ohne Effekte: feiner und scharf, mehr Zeilen auf dem Bild.
  const fs = Math.round(clamp(Math.min(W, H)/(analog ? 30 : 34), 12, 18));
  // Stil Digital-Brille: klare Schrift ohne feste Breite, sonst Betaflight-Zeichensatz
  const FONT = cfg.osdStyle === 'digital' ? 'system-ui,"Segoe UI",Roboto,Arial,sans-serif' : 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
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
    vpack: s.vpack, vmin: s.vmin, hp: s.hp, warnV: cfg.batWarn, minV: cfg.batMin, cell: s.vpack/BAT.cells, cellRest: s.cellRest, amp: s.amp, mah: s.mah, cap: BAT.cap, flyT: s.flyT,
    kmh: vLen(s.v)*3.6, alt: Math.max(0, s.p[1] - PHYS.foot), homeD: Math.hypot(s.p[0] - game.home[0], s.p[2] - game.home[1]),
    fps: frameStat.fps, res: cfg.autoRes ? frameStat.scale : 1, lite: frameStat.lite, thr: game.throttle, pitchDeg: Math.atan2(-f[1], u[1])/DEG, rollDeg: Math.atan2(-r[1], u[1])/DEG
  };
  if (rw.on && rw.meta) {   // echte Welt: Koordinaten und nächster Ort
    [d.lat, d.lon] = rwLatLon(s.p[0], s.p[2]);
    d.place = rwPlace(s.p[0], s.p[2]);
    d.vbs = vbLabel(cfg.verbund);
  }
  const lines = osdLines(cfg.osd, d);

  if (cfg.vision === 'night' || cfg.vision === 'thermal') drawVisionGrain(c, W, H, cfg.vision === 'night');   // Sensorrauschen
  if (fpv && on('goggle')) drawGoggle(c, W, H);   // zuerst, damit die Werte darüber lesbar bleiben
  // Analog: bei schlechtem Empfang springt das OSD seitlich (Synchronisation).
  // Kein Weichzeichnen (filter blur): kostete pro Textzeile viel Zeit, im Test 148 statt 9 ms pro Bild.
  c.save();
  if (analog && fpv) {
    if (q < 50 && Math.random() < (50 - q)/80) c.translate((Math.random() - 0.5)*6, 0);
    if (q < 10 && Math.random() < 0.35) c.globalAlpha = 0.25;   // OSD fast weg im Rauschen
  }
  lines.tl.forEach((l, i) => txt(l.t, Lt, T + lh*i, 'left', l.col));
  lines.tr.forEach((l, i) => txt(l.t, Rx, T + lh*i, 'right', l.col));
  lines.bl.forEach((l, i, a) => txt(l.t, L, bot - lh*(a.length - 1 - i), 'left', l.col));
  lines.br.forEach((l, i, a) => txt(l.t, Rx, bot - lh*(a.length - 1 - i), 'right', l.col));
  lines.bc.forEach((l, i, a) => txt(l.t, W/2, bot - lh*(a.length - 1 - i), 'center', l.col));
  if (on('home')) {
    const homeTxt = lines.br[lines.br.length - 1].t;
    const rel = Math.atan2(game.home[0] - s.p[0], s.p[2] - game.home[1]) - Math.atan2(f[0], -f[2]);
    const ax = Rx - c.measureText(homeTxt).width - fs*0.8, ay = bot - fs*0.35;
    c.save(); c.translate(ax, ay); c.rotate(rel);
    c.beginPath(); c.moveTo(0, -fs*0.55); c.lineTo(fs*0.4, fs*0.45); c.lineTo(0, fs*0.2); c.lineTo(-fs*0.4, fs*0.45); c.closePath();
    c.lineWidth = edge; c.strokeStyle = 'rgba(0,0,0,.7)'; c.stroke(); c.fillStyle = '#fff'; c.fill();
    c.restore();
  }
  if (on('compass')) drawCompass(c, W, inset.t + 74 + fs, f, fs, txt);   // unter den runden Knöpfen oben
  if (on('finder')) drawFinder(c, W, H);
  if (on('big')) drawBig(c, Rx, H*0.3, fs, FONT, weight, txt, [['ALT', 'M', Math.max(0, s.p[1] - PHYS.foot).toFixed(0)], ['SPD', 'KM/H', Math.round(vLen(s.v)*3.6)]]);
  if (on('rec') && blink) { const ry = bot - lh*lines.bl.length - fs*0.6; c.fillStyle = '#ff3b30'; c.beginPath(); c.arc(L + fs*0.45, ry - fs*0.35, fs*0.4, 0, 7); c.fill(); txt('REC', L + fs*1.2, ry, 'left', '#ff3b30'); }
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
  // Warnungen wie im Betaflight-OSD
  const warn = osdWarning(d);
  if (on('warn') && warn && blink && game.state === 'fly') txt(warn, W/2, H/2 - Math.min(H*0.16, 120), 'center', RED);
  c.restore();

  if (on('marker')) drawGateMarker(c, W, H, fs);
  drawPoiLabels(c, W, H, fs);
  drawBaseLabels(c, W, H, fs);
  drawVbsLabels(c, W, H, fs);
  if (touchUI) drawSticks(c, W, H);

  const tnow = performance.now();
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].until < tnow) messages.splice(i, 1);
  messages.forEach((m, i) => txt(m.text, W/2, H*0.3 + i*lh, 'center', '#fff6b0'));

  if (game.banner && game.banner.until > performance.now()) {   // großer Text: Treffer, Aufgabe erfüllt
    const fsb = c.font;
    c.font = `800 ${Math.round(fs*2)}px ${FONT}`;
    txt(game.banner.text, W/2, H*0.38, 'center', '#7dff9a');
    c.font = fsb;
    if (game.banner.sub) txt(game.banner.sub, W/2, H*0.38 + fs*1.6, 'center', '#ffffff');
  }
  if (game.state === 'fly' && s.turtle) {   // Turtle-Modus: schaltet sich auf dem Kopf von selbst ein
    txt('TURTLE', W/2, H/2 - fs*2, 'center', '#ffd27a');
    txt(touchUI ? 'Rechten Daumen in Kipprichtung schieben' : 'Nicken oder Rollen zum Umdrehen', W/2, H/2 - fs*0.6, 'center', '#ffffff');
  } else if (game.state === 'fly' && s.flippedT > 1) {   // umgedreht ohne Turtle-Modus: nicht scharf oder Gas oben
    txt('UMGEDREHT', W/2, H/2 - fs*2, 'center', RED);
    const tip = game.armed ? 'Gas runter für Turtle-Modus' : gp.connected ? 'Scharf schalten für Turtle, Taste oder R für Neustart' : touchUI ? 'Neustart-Knopf oben' : 'Leertaste für Turtle, R für Neustart';
    txt(tip, W/2, H/2 - fs*0.6, 'center', '#ffffff');
  }
  // Sinkraten-Anzeige (Leicht, Landung und Lieferung): grün sicher, gelb knapp, rot zu schnell
  if ((scen.id === 'landing' || scen.id === 'deliver') && diff().sinkHud && game.state === 'fly') {
    const alt = s.p[1] - PHYS.foot, sink = Math.max(0, -s.v[1]), lim = scen.id === 'landing' ? diff().landV : 2.5;
    if (alt < 15 && !s.grounded) {
      const col = sink < lim*0.6 ? '#7dff9a' : sink < lim ? '#ffd27a' : RED;
      txt('\u2193 ' + sink.toFixed(1) + ' M/S   ALT ' + alt.toFixed(1) + ' M', W/2, H/2 + fs*3.2, 'center', col);
    }
  }
  if (!game.armed && game.state === 'fly') txt('DISARMED', W/2, H/2 + fs*1.6, 'center', '#ffd27a');
  // Betaflight schaltet nur mit Gas unten scharf (Sicherheit). Stand das Gas beim Start oben, bleibt es aus: Hinweis wie im Betaflight-OSD.
  else if (game.state === 'fly' && cfg.fc === 'bf' && bf.ready && bf.x && !bf.x.bf_flag(0) && blink) txt('BETAFLIGHT AUS: GAS GANZ RUNTER', W/2, H/2 + fs*1.6, 'center', '#ffd27a');
  if (!game.armed && game.state === 'fly' && s.grounded) txt('Leertaste: scharf schalten', W/2, H*0.8, 'center', '#ffffff');
  else if (game.state === 'fly' && s.t < 6 && s.grounded && game.throttle < 0.2) {
    const hint = gp.connected ? 'Gasknüppel hoch' : touchUI ? 'Linken Daumen nach oben schieben für Gas' : 'W drücken für Gas, S für weniger';
    txt(hint, W/2, H*0.8, 'center', '#ffffff');   // unter Horizont und Zielmarker, über der Knüppel-Anzeige
  }
  if (glLost.on) {   // Grafik verloren: Bild bleibt stehen, Flug ruht; meist kommt sie nach Sekunden zurück
    c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, 0, W, H);
    txt('GRAFIK UNTERBROCHEN, WIRD NEU GESTARTET', W/2, H/2, 'center', '#ffd27a');
    if (performance.now() - glLost.since > 8000) txt('Kommt sie nicht zurück: Seite neu laden', W/2, H/2 + fs*1.6, 'center', '#ffffff');
  }
  if (game.frozen) txt('EINGEFROREN \u00b7 ' + keyName(keyOf('freeze')).toUpperCase() + ' ZUM WEITERFLIEGEN', W/2, H*0.62, 'center', '#9fd8ff');
  if (game.state === 'crashed') {
    c.fillStyle = 'rgba(120,0,0,.25)'; c.fillRect(0, 0, W, H);
    c.font = `800 ${fs*2.2}px ${FONT}`;
    txt('ABSTURZ', W/2, H/2 - fs, 'center', '#ff5a4a');
    c.font = `${weight} ${fs}px ${FONT}`;
    txt(s.crashMsg, W/2, H/2 + fs*0.8, 'center');
    txt(gp.connected ? 'Taste an der Funke oder R für Neustart' : touchUI ? 'Tippen für Neustart' : 'R für Neustart', W/2, H/2 + fs*2.3, 'center', '#dfe6ea');
  }
}

// Rauschen der Wärme- oder Nachtsichtkamera: feines Korn, Nachtsicht stärker und mit dunklem Rand
function drawVisionGrain(c, W, H, night) {
  if (!noisePats.length) makeNoise();
  c.save();
  const ox = Math.random()*128, oy = Math.random()*128;
  c.globalAlpha = night ? 0.22 : 0.08;
  c.translate(-ox, -oy); c.fillStyle = noisePats[(Math.random()*4) | 0]; c.fillRect(0, 0, W + 128, H + 128);
  c.restore();
  if (night) { c.save(); c.fillStyle = vignette(c, W, H); c.fillRect(0, 0, W, H); c.restore(); }
}
// Brillenrand: dunkler Rand mit ovalem Ausschnitt wie in einer Videobrille
function drawGoggle(c, W, H) {
  c.save();
  c.beginPath(); c.rect(0, 0, W, H);
  c.ellipse(W/2, H/2, W*0.56, H*0.62, 0, 0, Math.PI*2);
  c.fillStyle = 'rgba(8,8,10,.92)'; c.fill('evenodd');
  c.restore();
}
// Kompassband: N, O, S, W und Striche alle 10°, Mitte = Flugrichtung. Norden ist die Startrichtung der Drohne (-z).
function drawCompass(c, W, y, f, fs, txt) {
  const head = (Math.atan2(f[0], -f[2])/DEG + 360) % 360, half = 60, w = Math.min(W*0.4, 420), px = w/(2*half);
  c.save();
  c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.9)';
  for (let a = Math.ceil((head - half)/10)*10; a <= head + half; a += 10) {
    const x = W/2 + (a - head)*px, n = ((a % 360) + 360) % 360, big = n % 30 === 0;
    c.beginPath(); c.moveTo(x, y - (big ? fs*0.9 : fs*0.5)); c.lineTo(x, y); c.stroke();
    const lab = { 0: 'N', 90: 'O', 180: 'S', 270: 'W' }[n];
    if (lab) txt(lab, x, y - fs*1.15, 'center', '#ffffff');
  }
  c.fillStyle = '#ffd27a'; c.beginPath(); c.moveTo(W/2, y + 3); c.lineTo(W/2 - 6, y + 12); c.lineTo(W/2 + 6, y + 12); c.closePath(); c.fill();
  c.restore();
}
// Sucher-Rahmen: Ecken um die Bildmitte und ein großes Fadenkreuz mit Lücke
function drawFinder(c, W, H) {
  const hw = W*0.24, hh = H*0.27, k = Math.min(hw, hh)*0.28, cx = W/2, cy = H/2;
  c.save(); c.lineCap = 'square';
  for (const [w, col] of [[5, 'rgba(0,0,0,.55)'], [2.5, 'rgba(255,255,255,.95)']]) {
    c.lineWidth = w; c.strokeStyle = col; c.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = cx + sx*hw, y = cy + sy*hh;
      c.moveTo(x - sx*k, y); c.lineTo(x, y); c.lineTo(x, y - sy*k);
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.moveTo(cx + dx*18, cy + dy*18); c.lineTo(cx + dx*44, cy + dy*44); }
    c.stroke();
  }
  c.restore();
}
// Große Werte rechts (Digital-Brille): kleine Beschriftung, große Zahl
function drawBig(c, x, y, fs, FONT, weight, txt, rows) {
  const font = c.font;
  rows.forEach(([lab, unit, val], i) => {
    const yy = y + i*fs*2.6;
    c.font = `${weight} ${Math.round(fs*0.8)}px ${FONT}`;
    txt(lab, x - fs*3.2, yy - fs*0.55, 'right', '#ffffff');
    txt(unit, x - fs*3.2, yy + fs*0.35, 'right', '#cfd6da');
    c.font = `${weight} ${Math.round(fs*1.9)}px ${FONT}`;
    txt(String(val), x, yy + fs*0.35, 'right', '#ffffff');
  });
  c.font = font;
}

// Echte Welt (mit „Nächster Ort“): Name und Entfernung über Türmen (z. B. Eselsturm), nur wenn im Bild
function drawPoiLabels(c, W, H, fs) {
  if (!lastVP || !rw.on || !rw.features || !osdOn(cfg.osd, 'place')) return;
  for (const t of rw.features.towers || []) {
    const p = [t.x, groundH(t.x, t.z) + 31, t.z], cp = mApply(lastVP, p);
    if (cp[3] < 0.01) continue;
    const nx = cp[0]/cp[3], ny = cp[1]/cp[3];
    if (Math.abs(nx) > 0.95 || Math.abs(ny) > 0.95) continue;
    const d = Math.round(vLen(vSub(p, game.sim.p)));
    c.font = `600 ${Math.round(fs*0.9)}px system-ui,sans-serif`; c.textAlign = 'center';
    c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.6)'; c.fillStyle = '#ffc27a';
    const sx = (nx*0.5 + 0.5)*W, sy = (0.5 - ny*0.5)*H - 6, txt = `${t.name} ${d} M`;
    c.strokeText(txt, sx, sy); c.fillText(txt, sx, sy);
  }
}
// Vorschau VBS-Grundtypen: Name über jedem Modell (bis 50 m, nur wenn im Bild; nahe zuerst, überdeckte Namen entfallen)
function drawBaseLabels(c, W, H, fs) {
  if (!lastVP || scen.id !== 'vbs') return;
  c.font = `600 ${Math.round(fs*0.85)}px system-ui,sans-serif`; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.6)';
  const list = disPreviewLayout().map(it => { const b = disBaseInfo(it.id), p = [it.x, b.size[2] + (b.dom === 2 && it.id !== 'uavm' ? 1.5 : 0.8), it.z]; return { it, b, p, d: vLen(vSub(p, game.sim.p)) }; })
    .filter(x => x.d <= 50).sort((a, b) => a.d - b.d), used = [];
  for (const { it, b, p } of list) {
    const cp = mApply(lastVP, p);
    if (cp[3] < 0.01) continue;
    const nx = cp[0]/cp[3], ny = cp[1]/cp[3];
    if (Math.abs(nx) > 0.95 || Math.abs(ny) > 0.95) continue;
    const t = b.name + (it.note ? ' (' + it.note + ')' : ''), sx = (nx*0.5 + 0.5)*W, sy = (0.5 - ny*0.5)*H, hw = c.measureText(t).width/2 + 4, hh = fs*0.6;
    if (used.some(r => Math.abs(r[0] - sx) < r[2] + hw && Math.abs(r[1] - sy) < r[3] + hh)) continue;
    used.push([sx, sy, hw, hh]);
    c.fillStyle = '#ffffff'; c.strokeText(t, sx, sy); c.fillText(t, sx, sy);
  }
}
// Verbund mit VBS: Grundtyp und Entfernung über den Einheiten bis 200 m (nahe zuerst, überdeckte entfallen)
function drawVbsLabels(c, W, H, fs) {
  if (!lastVP || !rw.on || !vb.units.length) return;
  c.font = `600 ${Math.round(fs*0.8)}px system-ui,sans-serif`; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.6)';
  const used = [], col = { 0: '#ffe27a', 1: '#9cc2ff', 2: '#ff9a8a', 3: '#9be7a8' };
  for (const u of vb.units) {
    const b = disBaseInfo(u.base), p = [u.x, u.y + b.size[2] + 1, u.z], d = vLen(vSub(p, game.sim.p));
    if (d > 200) continue;
    const cp = mApply(lastVP, p);
    if (cp[3] < 0.01) continue;
    const nx = cp[0]/cp[3], ny = cp[1]/cp[3];
    if (Math.abs(nx) > 0.95 || Math.abs(ny) > 0.95) continue;
    const t = b.name + (u.dead ? ' (zerstört)' : '') + ' ' + Math.round(d) + ' M', sx = (nx*0.5 + 0.5)*W, sy = (0.5 - ny*0.5)*H, hw = c.measureText(t).width/2 + 4, hh = fs*0.55;
    if (used.some(r => Math.abs(r[0] - sx) < r[2] + hw && Math.abs(r[1] - sy) < r[3] + hh)) continue;
    used.push([sx, sy, hw, hh]);
    c.fillStyle = col[u.force] || '#ffffff'; c.strokeText(t, sx, sy); c.fillText(t, sx, sy);
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
