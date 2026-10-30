/* Eingabe: Funke / Gamepad (Gamepad-API).
   Die Zuordnung (gpMap, padValues) ist ohne DOM und in Node testbar. */
import { clamp } from './math.js';
import { cfg, game, say } from './state.js';
import { respawn } from './physics.js';

export const GP_FN = [['throttle', 'Gas'], ['yaw', 'Gieren'], ['pitch', 'Nicken'], ['roll', 'Rollen']];
export const GP_PRESETS = {
  // EdgeTX Kanalreihenfolge AETR: CH1 Rollen, CH2 Nicken, CH3 Gas, CH4 Gieren -> Achsen 0..3 (Annahme)
  radiomaster: { throttle: [2, false], yaw: [3, false], pitch: [1, false], roll: [0, false] },
  gamepad:     { throttle: [1, true],  yaw: [0, false], pitch: [3, true],  roll: [2, false] }
};
export const gp = { connected: false, id: '', mapping: '', axes: [], throttle: 0, yaw: 0, pitch: 0, roll: 0, btn: false };
export function gpMap() {
  if (cfg.gpPreset === 'custom' && cfg.gpMap) return cfg.gpMap;
  if (cfg.gpPreset === 'gamepad') return GP_PRESETS.gamepad;
  if (cfg.gpPreset === 'radiomaster') return GP_PRESETS.radiomaster;
  return gp.mapping === 'standard' ? GP_PRESETS.gamepad : GP_PRESETS.radiomaster;
}
// Rohachsen (-1..1) nach Zuordnung m in Steuerwerte umrechnen. Gas 0..1, Rest -1..1 mit Totzone.
export function padValues(axes, m) {
  const ax = fn => { const v = axes[m[fn][0]] || 0; return m[fn][1] ? -v : v; };
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
  gp.connected = true; gp.id = pad.id; gp.mapping = pad.mapping; gp.axes = Array.from(pad.axes);
  Object.assign(gp, padValues(gp.axes, gpMap()));
  const b = pad.buttons.some(x => x.pressed);
  if (b && !gp.btn && game.state === 'crashed' && !game.paused) respawn();
  gp.btn = b;
}
