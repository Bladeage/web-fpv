/* Ballon-Modus (Stufe „Leicht“): Jedes Jagd-Ziel trägt einen Luftballon an einer Leine. Getroffen wird der Ballon.
   Luftziele ziehen ihn hinter sich her, Fahrzeuge tragen ihn über sich. Ohne DOM, in Node testbar. */
import { vAdd, vSub, vScale, vLen, vDot, clamp } from './math.js';

// Schätzungen: großer Partyballon, gut sichtbar. Radius und Leinenlänge in m, Auftrieb in m/s², Luftwiderstand in 1/s.
export const BALLOON = { r: 0.6, line: 3.0, lift: 6, drag: 1.5, margin: 0.3 };   // margin: Treffer zählt 0,3 m außerhalb (Leicht, Runde 2)
export const BALLOON_COLORS = [[1, 0.15, 0.2], [1, 0.8, 0.1], [0.2, 0.6, 1], [0.3, 0.9, 0.3], [1, 0.4, 0.9], [1, 0.55, 0.1]];

export function newBalloon(anchor, i = 0) {
  return { p: vAdd(anchor, [0, BALLOON.line, 0]), v: [0, 0, 0], popped: false, col: i % BALLOON_COLORS.length };
}
// Ein Schritt: Auftrieb nach oben, Luftwiderstand, Leine bleibt höchstens BALLOON.line lang (dann gespannt)
export function stepBalloon(b, anchor, h) {
  if (b.popped) return;
  b.v[1] += BALLOON.lift*h;
  b.v = vScale(b.v, Math.max(0, 1 - BALLOON.drag*h));
  let p = vAdd(b.p, vScale(b.v, h));
  const d = vSub(p, anchor), l = vLen(d);
  if (l > BALLOON.line) { p = vAdd(anchor, vScale(d, BALLOON.line/l)); b.v = vScale(vSub(p, b.p), 1/h); }
  b.p = p;
}
// Abstand des Punkts p zur Strecke a->c
export function segPointDist(a, c, p) {
  const ac = vSub(c, a), l2 = vDot(ac, ac), t = l2 < 1e-12 ? 0 : clamp(vDot(vSub(p, a), ac)/l2, 0, 1);
  return vLen(vSub(vAdd(a, vScale(ac, t)), p));
}
// Trifft die Drohne (Weg a->c, Radius r) den Ballon? Dann platzt er.
export function popBalloon(b, a, c, r) {
  if (b.popped || segPointDist(a, c, b.p) > BALLOON.r + BALLOON.margin + r) return false;
  b.popped = true;
  return true;
}
