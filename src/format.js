/* Zeitformate für OSD und Meldungen. Ohne DOM. */

export function fmtTime(t) {
  if (t === null || t === undefined) return '–:––.––';
  const m = Math.floor(t/60), s = t - m*60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
}
export function fmtClock(t) { const m = Math.floor(t/60), s = Math.floor(t - m*60); return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
