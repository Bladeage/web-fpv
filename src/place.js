/* Platzierungsdienst (Etappe T2, docs/plan-taktischer-flug.md Abschnitt 2). Ohne DOM, in Node testbar.
   Er kennt die Welt nur über eine kleine Schnittstelle W und liefert Orte für zufällige Ereignisse (Ringe, später Ziele,
   Plätze, Fahrspuren). So läuft ein Modus einmal gebaut auf der Spielkarte und in der echten Welt.
   W = { groundH(x, z), wet(x, z), free(p, r) (Kugel um p mit Radius r berührt kein Hindernis), bounds: [x0, z0, x1, z1], home: [x, z] }
   Zufall immer über eine Quelle R (rng aus world.js), damit Tests feste Startwerte nutzen können. */
import { vAdd, vSub, vScale, vLen, vNorm } from './math.js';

// Weg a -> b frei: Proben alle step m, Kugel r
export function pathClearW(W, a, b, r, step = 1) {
  const n = Math.max(1, Math.ceil(vLen(vSub(b, a))/step));
  for (let i = 0; i <= n; i++) if (!W.free(vAdd(a, vScale(vSub(b, a), i/n)), r)) return false;
  return true;
}
const inB = (W, x, z, m) => x > W.bounds[0] + m && x < W.bounds[2] - m && z > W.bounds[1] + m && z < W.bounds[3] - m;
// Kette von n Ringen um die Mitte c [x, z] (Rundkurs in Uhrzeigerrichtung). Regeln wie der Ringparcours der Spielkarte
// (scenario.js ringLayoutOk): Ring rCheck + 1 m über dem Boden, rCheck + 1,5 m frei, Ringe 12 bis 70 m auseinander, Weg zum
// nächsten Ring mit 1,2 m frei, Ringebene nicht zu flach (Steigung zum Nachbarn unter etwa 37°), nicht über Wasser tiefer als
// 3 m (Absturz ins Wasser beim Verfehlen soll nicht zwingend sein; Schätzung). Höhe über dem Boden hMin bis hMax.
// opts: { rMin, rMax (Abstand zur Mitte, m), hMin, hMax, rCheck, tries }. Liefert Mitten [[x, y, z], ...] oder null.
export const PLACE_RING = { rMin: 25, rMax: 70, hMin: 3, hMax: 15, rCheck: 2.4, tries: 400 };
export function ringChain(W, c, n, R, opts = {}) {
  const o = { ...PLACE_RING, ...opts };
  for (let t = 0; t < o.tries; t++) {
    const a0 = R()*2*Math.PI, cs = [];
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      const a = a0 + (i + 0.2 + 0.6*R())/n*2*Math.PI, r = o.rMin + (o.rMax - o.rMin)*R(), x = c[0] + Math.sin(a)*r, z = c[1] - Math.cos(a)*r;
      if (!inB(W, x, z, 20) || W.wet(x, z)) { ok = false; break; }
      const p = [x, W.groundH(x, z) + o.rCheck + 1 + o.hMin + (o.hMax - o.hMin)*R(), z];
      // auch über Hängen: Ringunterkante über dem höchsten Boden im Umkreis
      for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) if (W.groundH(x + dx, z + dz) > p[1] - o.rCheck - 1) { ok = false; break; }
      if (ok && !W.free(p, o.rCheck + 1.5)) ok = false;
      cs.push(p);
    }
    if (!ok) continue;
    for (let i = 0; i < n && ok; i++) {
      const p = cs[i], q = cs[(i + 1) % n], d = vLen(vSub(q, p)), dir = vNorm(vSub(cs[(i + 1) % n], cs[(i + n - 1) % n]));
      if (d < 12 || d > 70 || Math.abs(dir[1]) > 0.6 || !pathClearW(W, p, q, 1.2, 0.75)) ok = false;
    }
    if (ok) return cs;
  }
  return null;
}
// Rückfall: Kreis über der Mitte, hoch über dem höchsten Boden und allen Hindernissen in der Nähe (findet immer eine Lage)
export function ringCircle(W, c, n, r = 30, extra = 12) {
  let top = -Infinity;
  for (let i = 0; i < 24; i++) { const a = i/24*2*Math.PI; top = Math.max(top, W.groundH(c[0] + Math.sin(a)*r, c[1] - Math.cos(a)*r)); }
  const cs = [];
  for (let i = 0; i < n; i++) { const a = i/n*2*Math.PI; cs.push([c[0] + Math.sin(a)*r, top + extra, c[1] - Math.cos(a)*r]); }
  for (let k = 0; k < 20 && !cs.every(p => W.free(p, 3.9)); k++) for (const p of cs) p[1] += 5;   // über Dächer und Bäume heben
  return cs;
}
