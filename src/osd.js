/* OSD-Inhalt: welche Werte in welcher Ecke stehen. Ohne DOM, in Node testbar.
   hud.js zeichnet die Zeilen; hier wird nur entschieden, was erscheint und wie es lautet.
   Beschriftung angelehnt an Betaflight (THR, ALT, mAh ...). */
import { fmtTime, fmtClock } from './format.js';

// [id, Name im Menü, Vorgabe an]
export const OSD_ITEMS = [
  ['lq', 'Empfang (LQ)', true], ['mode', 'Flugmodus', true], ['task', 'Aufgabe', true], ['crashes', 'Abstürze', true],
  ['timer', 'Rundenzeiten', true], ['clock', 'Uhrzeit', false],
  ['volt', 'Akku-Spannung', true], ['cell', 'Zellspannung', true], ['amp', 'Strom', true], ['mah', 'Verbrauch mAh', true], ['eff', 'mAh pro Minute', false],
  ['flytime', 'Flugzeit', true], ['speed', 'Tempo', true], ['alt', 'Höhe', true], ['home', 'Heimweg', true],
  ['thr', 'Gas', true], ['tilt', 'Neigung', false], ['sticks', 'Stick-Anzeige', true],
  ['ahi', 'Künstlicher Horizont', true], ['cross', 'Fadenkreuz', true], ['marker', 'Zielmarker', true], ['warn', 'Warnungen', true]
];
const DEFAULT = Object.fromEntries(OSD_ITEMS.map(([id, , on]) => [id, on]));
// o: cfg.osd mit den Abweichungen von der Vorgabe
export const osdOn = (o, id) => (o && id in o) ? !!o[id] : !!DEFAULT[id];

export const RED = '#ff7a6a', YEL = '#ffd27a', WHITE = '#ffffff';
const pad = (n, w, ch = ' ') => String(n).padStart(w, ch);

// d: Messwerte (siehe hud.js). Ergebnis: Zeilen je Ecke, oben nach unten.
export function osdLines(o, d) {
  const out = { tl: [], tr: [], bl: [], br: [], bc: [] };
  const add = (slot, id, t, col = WHITE) => { if (osdOn(o, id)) out[slot].push({ id, t, col }); };
  add('tl', 'lq', 'LQ ' + pad(Math.round(d.lq), 3), d.lq < 50 ? RED : WHITE);
  add('tl', 'mode', d.mode === 'acro' ? 'ACRO' : 'ANGL', d.mode === 'acro' ? '#ffb27a' : '#9be7ff');
  add('tl', 'task', d.label);
  if (d.crashes) add('tl', 'crashes', 'CRASH ' + d.crashes, '#ffd0c8');
  add('tr', 'timer', fmtTime(d.cur));
  add('tr', 'timer', 'LETZTE ' + fmtTime(d.last), '#dfe6ea');
  add('tr', 'timer', 'BESTE ' + fmtTime(d.best), '#c8ffd4');
  add('tr', 'clock', d.clock);
  const vcol = d.cell < 3.5 ? RED : d.cell < 3.7 ? YEL : WHITE;
  add('bl', 'volt', d.vpack.toFixed(1) + 'V', vcol);
  add('bl', 'cell', d.cell.toFixed(2) + 'V', vcol);
  add('bl', 'amp', d.amp.toFixed(1) + 'A');
  add('bl', 'mah', pad(Math.round(d.mah), 4, '0') + 'MAH', d.mah > d.cap*0.8 ? YEL : WHITE);
  add('bl', 'eff', (d.flyT > 5 ? Math.round(d.mah/(d.flyT/60)) : 0) + 'MAH/MIN');
  add('br', 'flytime', 'FLY ' + fmtClock(d.flyT));
  add('br', 'speed', pad(Math.round(d.kmh), 3, '0') + ' KMH');
  add('br', 'alt', 'ALT ' + d.alt.toFixed(1) + 'M');
  add('br', 'home', 'H ' + Math.round(d.homeD) + 'M');   // Heimweg bleibt unten, daneben der Pfeil
  add('bc', 'tilt', 'P' + pad(Math.round(d.pitchDeg), 4) + ' R' + pad(Math.round(d.rollDeg), 4));
  add('bc', 'thr', 'THR ' + pad(Math.round(d.thr*100), 3));
  return out;
}

// Warnung wie im Betaflight-OSD, oder null
export function osdWarning(d) {
  if (d.cellRest < 3.45) return 'LAND NOW';
  if (d.cell < 3.5) return 'LOW BATTERY';
  if (d.lq < 35) return 'LQ LOW';
  return null;
}
