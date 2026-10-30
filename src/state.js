/* Gemeinsamer Zustand aller Module: Einstellungen, Spielzustand, Eingabewerte, Meldungen.
   Ohne DOM, in Node testbar. Werte, die mehrere Module neu setzen, liegen in Objekten,
   weil ein ES-Modul importierte Variablen nicht neu zuweisen darf. */

/* ---------- Einstellungen ---------- */
export const STORE_CFG = 'fpvsim1.cfg';
export const STORE_BEST = 'fpvsim1.best';
export const cfg = { mode: 'angle', tilt: 20, rate: 450, sound: true, cam: 'fpv', analog: true, propsView: true, gpPreset: 'auto', gpMap: null, scen: 'gates' };
try { Object.assign(cfg, JSON.parse(localStorage.getItem(STORE_CFG) || '{}')); } catch (e) {}

/* ---------- Spielzustand ---------- */
export const game = {
  sim: null,
  state: 'fly',          // 'fly' | 'crashed'
  paused: true, started: false,
  crashes: 0,
  throttle: 0,
  best: null,
  camPos: [0, 1.2, 3], camHeading: [0, 0, -1],
  last: 0                // Zeitstempel des letzten Bildes (Hauptschleife)
};
// Bestzeit je Szenario. Der Torkurs behält den alten Schlüssel.
const bestKey = () => cfg.scen === 'gates' ? STORE_BEST : STORE_BEST + '.' + cfg.scen;
export function loadBest() {
  game.best = null;
  try { const b = parseFloat(localStorage.getItem(bestKey())); if (b > 0) game.best = b; } catch (e) {}
}
loadBest();
export function saveCfg() { try { localStorage.setItem(STORE_CFG, JSON.stringify(cfg)); } catch (e) {} }
export function saveBest() { try { localStorage.setItem(bestKey(), String(game.best)); } catch (e) {} }

/* ---------- Eingabewerte ---------- */
export const kb = { pitch: 0, roll: 0, yaw: 0 };
export const tch = { pitch: 0, roll: 0, yaw: 0 };
export const inp = { pitch: 0, roll: 0, yaw: 0 };
export const keys = new Set();
export const ptr = new Map();

/* ---------- Meldungen im OSD ---------- */
export const messages = [];
export function say(text, dur = 1.6) { messages.push({ text, until: performance.now() + dur*1000 }); }
