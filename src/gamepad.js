/* Eingabe: Funke / Gamepad (Gamepad-API).
   Die Zuordnung (gpMap, padValues) ist ohne DOM und in Node testbar. */
import { clamp } from './math.js';
import { cfg, game, say } from './state.js';
import { respawn, setArmed } from './physics.js';

export const GP_FN = [['throttle', 'Gas'], ['yaw', 'Gieren'], ['pitch', 'Nicken'], ['roll', 'Rollen']];
export const GP_PRESETS = {
  // EdgeTX Kanalreihenfolge AETR: CH1 Rollen, CH2 Nicken, CH3 Gas, CH4 Gieren -> Achsen 0..3 (Annahme)
  radiomaster: { throttle: [2, false], yaw: [3, false], pitch: [1, false], roll: [0, false] },
  gamepad:     { throttle: [1, true],  yaw: [0, false], pitch: [3, true],  roll: [2, false] }
};
// Schalter-Funktionen: frei belegbar mit einer Achse (Schalter an der Funke, an ab 0,3) oder einer Taste.
// Quelle: '' aus, 'a4' Achse 4, 'b0' Taste 0. cfg.gpSw = { arm: { src, inv }, ... }
export const GP_SW = [['arm', 'Arm-Schalter'], ['mode', 'Angle/Acro'], ['reset', 'Neustart'], ['cam', 'Kamera'], ['rewind', 'Rückspulen']];
// Aktionen, die das Browser-Modul (main.js) einsetzt: Kamera, Zurückspulen, Flugmodus
export const gpAct = { cam() {}, rewind() {}, mode() {} };
export const gp = { connected: false, id: '', mapping: '', axes: [], buttons: [], throttle: 0, yaw: 0, pitch: 0, roll: 0, btn: false, sw: {}, swPrev: {} };
export function gpMap() {
  if (cfg.gpPreset === 'custom' && cfg.gpMap) return cfg.gpMap;
  if (cfg.gpPreset === 'gamepad') return GP_PRESETS.gamepad;
  if (cfg.gpPreset === 'radiomaster') return GP_PRESETS.radiomaster;
  return gp.mapping === 'standard' ? GP_PRESETS.gamepad : GP_PRESETS.radiomaster;
}
// Zustand eines Schalters aus Achsen und Tasten
export function switchOn(src, inv, axes, buttons, cal) {
  if (!src) return false;
  let on;
  if (src[0] === 'a') { const i = +src.slice(1); on = calAxis(axes[i] || 0, cal && cal[i]) > 0.3; }
  else { const b = buttons[+src.slice(1)]; on = !!(b && (b.pressed || b.value > 0.5)); }
  return inv ? !on : on;
}
// Rohwert einer Achse mit Kalibrierung (cal[i] = [min, max]) auf -1..1 bringen
export function calAxis(v, c) { return c && c[1] - c[0] > 0.2 ? clamp((v - c[0])/(c[1] - c[0])*2 - 1, -1, 1) : v; }
// Rohachsen (-1..1) nach Zuordnung m in Steuerwerte umrechnen. Gas 0..1, Rest -1..1 mit Totzone.
export function padValues(axes, m, cal) {
  const ax = fn => { const i = m[fn][0], v = calAxis(axes[i] || 0, cal && cal[i]); return m[fn][1] ? -v : v; };
  const dz = v => Math.abs(v) < 0.03 ? 0 : v;
  return { throttle: clamp((ax('throttle') + 1)/2, 0, 1), yaw: dz(ax('yaw')), pitch: dz(ax('pitch')), roll: dz(ax('roll')) };
}
export function updGamepad() {
  let pad = null;
  try {
    const ps = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of ps) if (p && p.connected && p.axes.length >= 4) { pad = p; break; }
  } catch (e) { pad = null; }
  if (!pad) { gp.connected = false; return; }
  if (!gp.connected || gp.id !== pad.id) say('Erkannt: ' + pad.id.slice(0, 40), 2);
  gp.connected = true; gp.id = pad.id; gp.mapping = pad.mapping; gp.axes = Array.from(pad.axes); gp.buttons = Array.from(pad.buttons);
  Object.assign(gp, padValues(gp.axes, gpMap(), cfg.gpCal));
  // Schalter-Funktionen: Flanken (an/aus) auswerten
  const used = new Set();
  for (const [fn] of GP_SW) {
    const m = (cfg.gpSw || {})[fn];
    if (!m || !m.src) { gp.sw[fn] = false; continue; }
    if (m.src[0] === 'b') used.add(+m.src.slice(1));
    const on = switchOn(m.src, m.inv, gp.axes, gp.buttons, cfg.gpCal), was = !!gp.swPrev[fn];
    gp.sw[fn] = on;
    if (game.paused) { gp.swPrev[fn] = on; continue; }
    // Taste (Gamepad): jeder Druck schaltet um. Schalter an der Funke (Achse): die Stellung gilt.
    const btn = m.src[0] === 'b', press = on && !was;
    if (fn === 'arm') {
      if (btn) { if (press) setArmed(!game.armed); }
      else if (!on && game.armed) setArmed(false); else if (press) setArmed(true);   // wie Betaflight: scharf nur beim Umlegen und mit Gas unten
    }
    if (fn === 'mode') {
      if (btn) { if (press) gpAct.mode(cfg.mode === 'acro' ? 'angle' : 'acro'); }
      else if (on !== was) gpAct.mode(on ? 'acro' : 'angle');
    }
    if (fn === 'reset' && on && !was) respawn();
    if (fn === 'cam' && on && !was) gpAct.cam();
    if (fn === 'rewind' && on && !was) gpAct.rewind();
    gp.swPrev[fn] = on;
  }
  // Nach einem Absturz startet jede (nicht belegte) Taste neu
  const b = pad.buttons.some((x, i) => x.pressed && !used.has(i));
  if (b && !gp.btn && game.state === 'crashed' && !game.paused) respawn();
  gp.btn = b;
}
