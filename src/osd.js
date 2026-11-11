/* OSD-Inhalt: welche Werte in welcher Ecke stehen. Ohne DOM, in Node testbar.
   hud.js zeichnet die Zeilen; hier wird nur entschieden, was erscheint und wie es lautet.
   Beschriftung angelehnt an Betaflight (THR, ALT, mAh ...). */
import { fmtTime, fmtClock } from './format.js';

// [id, Name im Menü, Vorgabe an]
export const OSD_ITEMS = [
  ['lq', 'Empfang (LQ)', true], ['mode', 'Flugmodus', true], ['task', 'Aufgabe', true], ['crashes', 'Abstürze', true],
  ['timer', 'Rundenzeiten', true], ['clock', 'Uhrzeit', false], ['fps', 'Bildrate', false],
  ['volt', 'Akku-Spannung', true], ['cell', 'Zellspannung', true], ['amp', 'Strom', true], ['mah', 'Verbrauch mAh', true], ['vmin', 'Tiefste Spannung', true], ['eff', 'mAh pro Minute', false],
  ['flytime', 'Flugzeit', true], ['speed', 'Tempo', true], ['alt', 'Höhe', true], ['home', 'Heimweg', true],
  ['thr', 'Gas', true], ['tilt', 'Neigung', false], ['sticks', 'Knüppel-Anzeige', true],
  ['motors', 'Motorschaden', true], ['ahi', 'Künstlicher Horizont', true], ['cross', 'Fadenkreuz', true], ['marker', 'Zielmarker', true], ['warn', 'Warnungen', true],
  ['compass', 'Kompassband', false], ['finder', 'Sucher-Rahmen', false], ['big', 'Große Zahlen (Höhe, Tempo)', false], ['goggle', 'Brillenrand', false], ['rec', 'Aufnahme-Punkt', false], ['mapLayers', 'Kartenlinien', false], ['coords', 'Koordinaten', true], ['place', 'Nächster Ort', true]
];
const DEFAULT = Object.fromEntries(OSD_ITEMS.map(([id, , on]) => [id, on]));
// OSD-Stile: setzen alle Häkchen auf einmal (cfg.osd) und die Schrift (cfg.osdStyle). Danach einzeln änderbar.
const only = ids => Object.fromEntries(OSD_ITEMS.map(([id]) => [id, ids.includes(id)]));
export const OSD_STYLES = {
  bf:      { name: 'Betaflight', osd: {} },
  digital: { name: 'Digital-Brille', osd: { compass: true, big: true, goggle: true, rec: true, amp: false, mah: false, vmin: false, cell: false, speed: false, alt: false, home: false, crashes: false } },
  racer:   { name: 'Racer', osd: only(['mode', 'thr', 'alt', 'timer', 'cross', 'warn', 'marker', 'task']) }
};
// o: cfg.osd mit den Abweichungen von der Vorgabe
export const osdOn = (o, id) => (o && id in o) ? !!o[id] : !!DEFAULT[id];

export const RED = '#ff7a6a', YEL = '#ffd27a', WHITE = '#ffffff';
const pad = (n, w, ch = ' ') => String(n).padStart(w, ch);
// Koordinaten wie im GPS-OSD: Grad mit 5 Stellen (etwa 1 m), N/S und E/W (E statt O: O sieht neben Ziffern aus wie 0)
export const fmtLatLon = (lat, lon) => Math.abs(lat).toFixed(5) + (lat >= 0 ? 'N ' : 'S ') + Math.abs(lon).toFixed(5) + (lon >= 0 ? 'E' : 'W');
const fmtDist = m => m < 1000 ? Math.round(m/10)*10 + 'M' : (m/1000).toFixed(1) + 'KM';

// d: Messwerte (siehe hud.js). Ergebnis: Zeilen je Ecke, oben nach unten.
export function osdLines(o, d) {
  const out = { tl: [], tr: [], bl: [], br: [], bc: [] };
  const add = (slot, id, t, col = WHITE) => { if (osdOn(o, id)) out[slot].push({ id, t, col }); };
  add('tl', 'lq', 'LQ ' + pad(Math.round(d.lq), 3), d.lq < 50 ? RED : WHITE);
  add('tl', 'mode', d.mode === 'acro' ? 'ACRO' : 'ANGL', d.mode === 'acro' ? '#ffb27a' : '#9be7ff');
  add('tl', 'task', d.label);
  if (d.tries) add('tl', 'task', 'VERSUCH ' + d.tries, '#ffe08a');   // Versuche der Mission live (Prompt 197), gehört zur Aufgabe
  if (d.place) add('tl', 'place', d.place.d < 1 ? 'ORT ' + d.place.name.toUpperCase() : d.place.name.toUpperCase() + ' ' + fmtDist(d.place.d) + ' ' + d.place.dir, '#dfe6ea');
  if (d.lat !== undefined) add('tl', 'coords', fmtLatLon(d.lat, d.lon), '#dfe6ea');
  if (d.crashes) add('tl', 'crashes', 'CRASH ' + d.crashes, '#ffd0c8');
  if (d.vbs) out.tl.push({ id: 'vbs', t: d.vbs, col: d.vbs.endsWith('--') ? YEL : '#9be7ff' });   // DIS-Modus, nur wenn eingeschaltet
  (d.hp || []).forEach((hp, i) => { if (hp < 0.98) add('tl', 'motors', 'M' + (i + 1) + ' ' + (hp > 0 ? pad(Math.round(hp*100), 3) + '%' : 'AUS'), hp < 0.5 ? RED : YEL); });
  add('tr', 'timer', fmtTime(d.cur));
  if (d.last !== null && d.last !== undefined) add('tr', 'timer', 'LETZTE ' + fmtTime(d.last), '#dfe6ea');   // erst nach der ersten Runde
  if (d.best !== null && d.best !== undefined) add('tr', 'timer', 'BESTE ' + fmtTime(d.best), '#c8ffd4');
  add('tr', 'clock', d.clock);
  add('tr', 'fps', Math.round(d.fps || 0) + ' FPS ' + Math.round((d.res ?? 1)*100) + '%' + (d.lite ? ' L' : ''), (d.fps || 0) < 40 ? YEL : WHITE);   // L = Sparmodus
  const warnV = d.warnV ?? 3.5, minV = d.minV ?? 3.3;
  const vcol = d.cell < warnV ? RED : d.cell < warnV + 0.2 ? YEL : WHITE;
  add('bl', 'volt', d.vpack.toFixed(1) + 'V', vcol);
  add('bl', 'cell', d.cell.toFixed(2) + 'V', vcol);
  add('bl', 'amp', d.amp.toFixed(1) + 'A');
  add('bl', 'mah', pad(Math.round(d.mah), 4, '0') + 'MAH', d.mah > d.cap*0.8 ? YEL : WHITE);
  add('bl', 'vmin', 'MIN ' + (d.vmin ?? d.vpack).toFixed(1) + 'V', (d.vmin ?? d.vpack)/(d.vpack/d.cell) < minV ? RED : WHITE);
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
// d.god: Gott-Modus (durch Hindernisse, Akku unendlich, kein Schaden). Dort keine Warnungen zu Akku und Funk (Nutzer, Prompt 177).
export function osdWarning(d) {
  const warnV = d.warnV ?? 3.5, minV = d.minV ?? 3.3;   // Volt pro Zelle, im Menü einstellbar
  if (!d.god && (d.cellRest < minV + 0.15 || d.cell < minV)) return 'LAND NOW';
  if (!d.god && d.cell < warnV) return 'LOW BATTERY';
  if (d.hp && d.hp.some(x => x <= 0)) return 'MOTOR FAIL';
  if (!d.god && d.lq < 35) return 'LQ LOW';
  return null;
}
