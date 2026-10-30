/* Ton: Motorgeräusch per WebAudio, Signaltöne. */
import { vLen } from './math.js';
import { cfg, game } from './state.js';

let ac = null, osc1, osc2, filt, gain;
export function audioInit() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    osc1 = ac.createOscillator(); osc1.type = 'sawtooth';
    osc2 = ac.createOscillator(); osc2.type = 'square';
    filt = ac.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 700;
    gain = ac.createGain(); gain.gain.value = 0;
    const g2 = ac.createGain(); g2.gain.value = 0.35;
    osc1.connect(filt); osc2.connect(g2); g2.connect(filt); filt.connect(gain); gain.connect(ac.destination);
    osc1.start(); osc2.start();
  } catch (e) { ac = null; }
}
export function audioUpd() {
  if (!ac) return;
  const sim = game.sim;
  const on = cfg.sound && !game.paused && game.state === 'fly';
  const t = sim.thr, now = ac.currentTime, f = 85 + t*280 + vLen(sim.w)*4;
  osc1.frequency.setTargetAtTime(f, now, 0.03);
  osc2.frequency.setTargetAtTime(f*1.5, now, 0.03);
  filt.frequency.setTargetAtTime(450 + t*2600, now, 0.05);
  gain.gain.setTargetAtTime(on ? 0.02 + t*0.06 : 0, now, 0.05);
}
export function beep(f, d = 0.1, type = 'triangle') {
  if (!ac || !cfg.sound) return;
  try {
    const o = ac.createOscillator(), g = ac.createGain(), n = ac.currentTime;
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.09, n); g.gain.exponentialRampToValueAtTime(0.0001, n + d);
    o.connect(g); g.connect(ac.destination); o.start(n); o.stop(n + d + 0.02);
  } catch (e) {}
}
