/* Zeitformate für OSD und Meldungen. Ohne DOM. */

export function fmtTime(t) {
  if (t === null || t === undefined) return '–:––.––';
  const m = Math.floor(t/60), s = t - m*60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
}
export function fmtClock(t) { const m = Math.floor(t/60), s = Math.floor(t - m*60); return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }

// Breite, Länge aus Text lesen: „50.5547, 6.2425“, „50,5547 6,2425“, „50.5547 N 6.2425 E“ (auch Komma als Dezimalzeichen).
// Rückgabe [Breite, Länge] in Grad oder null.
export function parseLatLon(t) {
  const s = String(t || '').replace(/[NnEeOo°]/g, ' ').trim();
  let m = s.match(/^(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)$/);   // Punkt als Dezimalzeichen
  if (!m) m = s.replace(/(\d),(\d)/g, '$1.$2').match(/^(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)$/);   // Komma als Dezimalzeichen
  if (!m) return null;
  const lat = +m[1], lon = +m[2];
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? [lat, lon] : null;
}
