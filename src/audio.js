/* Ton, aus der Physik berechnet. Nur WebAudio, keine Dateien.
   Je Motor zwei Stimmen: Propeller-Brummen (Blattfrequenz) und Motorpfeifen (elektrische Frequenz).
   Die vier Motoren drehen leicht verschieden, daraus entsteht die typische Schwebung.
   Dazu Rauschen: Propeller (nach Last), Fahrtwind (nach Tempo), Propwash (Sinken in den eigenen Abwind).
   Aufprall und Absturz als kurze Geräusche, Signaltöne als weiche Glocke. */
import { clamp, vLen, vDot, qRot } from './math.js';
import { cfg, game } from './state.js';

// Schätzungen: 3 Propellerblätter, 7 Polpaare (Motor 12N14P). Übliche Bauform bei 3 bis 7 Zoll.
const BLADES = 3, POLES = 7;
let ac = null, noise = null, master, sfx, comp, propN, windN, washN, lastHit = 0;
const motors = [];

function noiseBuffer(sec) {
  const n = Math.round(ac.sampleRate*sec), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random()*2 - 1;
  return b;
}
function noiseSrc() { const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; s.start(0, Math.random()*1.5); return s; }
// Rauschen durch einen Filter in eine eigene Lautstärke, dann in den Motor-Bus
function noiseVoice(type, f, q) {
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ac.createGain(); g.gain.value = 0;
  noiseSrc().connect(fl); fl.connect(g); g.connect(master);
  return { f: fl, g };
}

export function audioInit() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;   // schützt vor Übersteuern
    comp.connect(ac.destination);
    master = ac.createGain(); master.gain.value = 0; master.connect(comp);   // Motoren und Rauschen
    sfx = ac.createGain(); sfx.gain.value = 0; sfx.connect(comp);           // Aufprall, Signaltöne
    noise = noiseBuffer(2);
    for (let i = 0; i < 4; i++) {
      const buzz = ac.createOscillator(), whine = ac.createOscillator();
      buzz.type = 'sawtooth'; whine.type = 'triangle';
      const bf = ac.createBiquadFilter(); bf.type = 'lowpass'; bf.Q.value = 0.8;
      const bg = ac.createGain(), wg = ac.createGain(); bg.gain.value = 0; wg.gain.value = 0;
      buzz.connect(bf); bf.connect(bg); bg.connect(master);
      whine.connect(wg); wg.connect(master);
      buzz.start(); whine.start();
      motors.push({ buzz, whine, bf, bg, wg });
    }
    propN = noiseVoice('bandpass', 1200, 0.7);
    windN = noiseVoice('lowpass', 300, 0.5);
    washN = noiseVoice('lowpass', 260, 2);
  } catch (e) { ac = null; }
}
// Sofort stumm und Audio anhalten (Menü, App im Hintergrund). audioInit() setzt es fort.
// Nötig, weil audioUpd im Hintergrund nicht mehr läuft (keine Bildschleife) und der Ton sonst weiterklingt.
export function audioPause() {
  if (!ac) return;
  try {
    for (const g of [master.gain, sfx.gain]) { g.cancelScheduledValues(ac.currentTime); g.setValueAtTime(0, ac.currentTime); }
    if (ac.state === 'running') ac.suspend();
  } catch (e) {}
}
const vol = () => cfg.sound ? clamp(cfg.vol ?? 0.7, 0, 1) : 0;

export function audioUpd() {
  if (!ac) return;
  const s = game.sim, now = ac.currentTime;
  const on = !game.paused && game.state === 'fly' && !game.frozen;   // eingefroren: Motoren still
  master.gain.setTargetAtTime(on ? vol() : 0, now, 0.05);
  sfx.gain.setTargetAtTime(game.paused ? 0 : vol(), now, 0.05);
  if (!on || !vol()) return;
  let load = 0;
  for (let i = 0; i < 4; i++) {
    const m = motors[i], rpm = Math.max(0, s.rpm[i]), k = clamp(s.mot[i], 0, 1);   // k: Drehzahl relativ zu Vollgas
    const fb = Math.max(20, rpm/60*BLADES), fw = Math.min(14000, rpm/60*POLES);
    const spin = rpm > 300 ? 1 : 0;
    m.buzz.frequency.setTargetAtTime(fb, now, 0.015);
    m.whine.frequency.setTargetAtTime(Math.max(20, fw), now, 0.015);
    m.bf.frequency.setTargetAtTime(fb*(2.5 + 5*k), now, 0.03);    // unter Last mehr Obertöne, heller
    m.bg.gain.setTargetAtTime(spin*(0.01 + 0.05*k*k), now, 0.03);
    m.wg.gain.setTargetAtTime(spin*(0.003 + 0.008*k), now, 0.03);
    load += k*k/4;
  }
  // Propellerrauschen: mit der Last lauter und heller
  propN.f.frequency.setTargetAtTime(700 + 2800*Math.sqrt(load), now, 0.05);
  propN.g.gain.setTargetAtTime(0.07*load, now, 0.05);
  // Fahrtwind: wächst mit dem Quadrat der Geschwindigkeit
  const sp = vLen(s.v);
  windN.f.frequency.setTargetAtTime(200 + sp*30, now, 0.1);
  windN.g.gain.setTargetAtTime(Math.min(0.14, sp*sp*0.00015), now, 0.1);
  // Propwash: Sinken entlang der Rotorachse mit Gas gibt unruhiges Wummern
  const vAx = vDot(s.v, qRot(s.q, [0, 1, 0]));
  const wash = clamp((-vAx - 1.5)/4, 0, 1)*clamp(s.thr*2.5, 0, 1);
  washN.g.gain.setTargetAtTime(wash*0.15*(0.4 + 0.6*Math.random()), now, 0.02);
}

// Kurzes gefiltertes Rauschen auf den Effekt-Bus
function burst(type, f, gain, dur, t) {
  const src = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = noise; fl.type = type; fl.frequency.value = f;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl); fl.connect(g); g.connect(sfx);
  src.start(t, Math.random()*1.5); src.stop(t + dur + 0.02);
}
// Tiefer Schlag: Sinus, der schnell nach unten gleitet
function thump(f0, gain, dur, t) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(40, t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(sfx); o.start(t); o.stop(t + dur + 0.02);
}
// Aufprall mit v m/s. prop: ein Propeller hat getroffen (helles Klappern).
export function hit(v, prop) {
  if (!ac || !vol() || ac.currentTime - lastHit < 0.07) return;
  const t = ac.currentTime, a = clamp(v/6, 0.08, 1);
  lastHit = t;
  burst('lowpass', 400 + 900*a, 0.35*a, 0.16, t);
  thump(150, 0.4*a, 0.18, t);
  if (prop) burst('bandpass', 3000, 0.25*a, 0.07, t);
}
// Absturz: harter Schlag, splitterndes Rauschen, das langsam verklingt
export function crashSound() {
  if (!ac || !vol()) return;
  const t = ac.currentTime;
  thump(120, 0.6, 0.35, t);
  burst('lowpass', 1500, 0.45, 0.5, t);
  burst('bandpass', 3500, 0.2, 0.25, t + 0.03);
}
// Ballon platzt: kurzer heller Knall, dann ein leises Flattern
export function popSound() {
  if (!ac || !vol()) return;
  const t = ac.currentTime;
  burst('highpass', 1800, 0.5, 0.05, t);
  burst('bandpass', 700, 0.15, 0.2, t + 0.03);
  beep(1320, 0.08);
}
// Signalton als weiche Glocke (Grundton und Oktave). type bleibt für ältere Aufrufe, wird nicht mehr gebraucht.
export function beep(f, d = 0.1) {
  if (!ac || !vol()) return;
  try {
    const t = ac.currentTime, len = Math.max(0.12, d*1.6);
    for (const [mul, amp] of [[1, 0.12], [2, 0.04]]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = f*mul;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(amp, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(sfx); o.start(t); o.stop(t + len + 0.02);
    }
  } catch (e) {}
}
