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
// opts: { rMin, rMax (Abstand zur Mitte, m), hMin, hMax, rCheck, tries, dMin, dMax (Abstand der Ringe), approach }. approach > 0:
// statt des ganzen Wegs nur An- und Abflug je approach m vor und hinter jedem Ring frei (weit verteilte Ringe, Prompt 171: man
// fliegt über Häuser hinweg). Liefert Mitten [[x, y, z], ...] oder null.
export const PLACE_RING = { rMin: 25, rMax: 70, hMin: 3, hMax: 15, rCheck: 2.4, tries: 400, dMin: 12, dMax: 70, approach: 0, retry: 1 };
export function ringChain(W, c, n, R, opts = {}) {
  const o = { ...PLACE_RING, ...opts };
  for (let t = 0; t < o.tries; t++) {
    const a0 = R()*2*Math.PI, cs = [];
    let ok = true;
    // je Ring bis retry Würfe in seinem Sektor (retry 1: wie bisher, ein Fehlwurf verwirft die Kette)
    const one = i => {
      const a = a0 + (i + 0.2 + 0.6*R())/n*2*Math.PI, r = o.rMin + (o.rMax - o.rMin)*R(), x = c[0] + Math.sin(a)*r, z = c[1] - Math.cos(a)*r;
      if (!inB(W, x, z, 20) || W.wet(x, z)) return null;
      const p = [x, W.groundH(x, z) + o.rCheck + 1 + o.hMin + (o.hMax - o.hMin)*R(), z];
      // auch über Hängen: Ringunterkante über dem höchsten Boden im Umkreis
      for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) if (W.groundH(x + dx, z + dz) > p[1] - o.rCheck - 1) return null;
      return W.free(p, o.rCheck + 1.5) ? p : null;
    };
    for (let i = 0; i < n && ok; i++) {
      let p = null;
      for (let k = 0; k < o.retry && !p; k++) p = one(i);
      if (p) cs.push(p); else ok = false;
    }
    if (!ok) continue;
    for (let i = 0; i < n && ok; i++) {
      const p = cs[i], q = cs[(i + 1) % n], d = vLen(vSub(q, p)), dir = vNorm(vSub(cs[(i + 1) % n], cs[(i + n - 1) % n]));
      if (d < o.dMin || d > o.dMax || Math.abs(dir[1]) > 0.6) ok = false;
      else if (o.approach ? !pathClearW(W, vAdd(p, vScale(dir, -o.approach)), vAdd(p, vScale(dir, o.approach)), 1.2, 0.75) : !pathClearW(W, p, q, 1.2, 0.75)) ok = false;
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

// ---- Etappe T3: Luftziele und Plätze in der echten Welt ----
// Zufälliger Punkt im Ring rMin..rMax um c [x, z], Höhe hMin..hMax über dem Boden, Kugel r frei, über dem Hang (vier Proben
// im Abstand r liegen unter dem Punkt minus hMin/2), im Rechteck mit Rand m, nicht über Wasser. tries Versuche, sonst null.
export function freeAir(W, c, rMin, rMax, hMin, hMax, r, R, tries = 60, m = 20) {
  for (let t = 0; t < tries; t++) {
    const a = R()*2*Math.PI, d = rMin + (rMax - rMin)*Math.sqrt(R()), x = c[0] + Math.sin(a)*d, z = c[1] - Math.cos(a)*d;
    if (!inB(W, x, z, m) || W.wet(x, z)) continue;
    const p = [x, W.groundH(x, z) + hMin + (hMax - hMin)*R(), z];
    if ([[r, 0], [-r, 0], [0, r], [0, -r]].some(([dx, dz]) => W.groundH(x + dx, z + dz) > p[1] - hMin/2)) continue;
    if (W.free(p, r)) return p;
  }
  return null;
}
// n Bereiche für Ziel-Drohnen (Mitte [x, y, z]), Mitten frei mit Radius 3 m, Bereiche mit Radius rad überschneiden sich nicht
// (Mitten mindestens 2 rad auseinander), Ring rMin..rMax um c. Liefert so viele, wie sich finden (höchstens n).
export function airRegions(W, c, n, R, o = {}) {
  const { rMin = 40, rMax = 320, rad = 22, hMin = 9, hMax = 16 } = o, out = [];
  for (let k = 0; k < n*20 && out.length < n; k++) {
    const p = freeAir(W, c, rMin, rMax, hMin, hMax, 3, R, 10);
    if (p && out.every(q => Math.hypot(p[0] - q[0], p[2] - q[2]) > 2*rad)) out.push(p);
  }
  return out;
}
// Kreisbahn für Starrflügler: Mitte c, Radius r; Höhe = höchster Boden auf dem Kreis (Proben alle 10 m) plus margin, dann in
// 5-m-Schritten höher, bis Proben alle 10 m mit 4 m Kugel frei sind. Die Mitte rückt zur Gebietsmitte, bis der Kreis im
// Rechteck liegt. Liefert { c: [x, z], r, alt }.
export function airCircle(W, c, r, margin = 25) {
  const B = W.bounds, cx = Math.min(B[2] - r - 10, Math.max(B[0] + r + 10, c[0])), cz = Math.min(B[3] - r - 10, Math.max(B[1] + r + 10, c[1]));
  const n = Math.max(12, Math.ceil(2*Math.PI*r/10)), pts = [];
  let top = -Infinity;
  for (let i = 0; i < n; i++) { const a = i/n*2*Math.PI, x = cx + Math.cos(a)*r, z = cz + Math.sin(a)*r; pts.push([x, z]); top = Math.max(top, W.groundH(x, z)); }
  let alt = top + margin;
  for (let k = 0; k < 20 && !pts.every(([x, z]) => W.free([x, alt, z], 4) && W.free([x, alt - 2.5, z], 4)); k++) alt += 5;
  return { c: [cx, cz], r, alt };
}
// Wegpunkte für Hubschrauber und Sechs-Rotor: n Punkte im Ring rMin..rMax um c, hMin..hMax über dem Boden, Kugel r frei,
// Wege zwischen den Punkten (auch zurück zum ersten) mit r frei, Punkte 25 bis 140 m auseinander. Bis 40 Versuche, sonst null.
export function airWaypoints(W, c, n, R, o = {}) {
  const { rMin = 30, rMax = 260, hMin = 18, hMax = 30, r = 3 } = o;
  for (let t = 0; t < 40; t++) {
    const wps = [];
    for (let i = 0; i < n; i++) {
      const prev = wps[i - 1], base = prev ? [prev[0], prev[2]] : c, p = prev ? freeAir(W, base, 25, 90, hMin, hMax, r, R, 20) : freeAir(W, c, rMin, rMax, hMin, hMax, r, R, 20);
      if (!p || Math.hypot(p[0] - c[0], p[2] - c[1]) > rMax + 60) break;
      wps.push(p);
    }
    if (wps.length < n) continue;
    if (wps.every((p, i) => { const q = wps[(i + 1) % n], d = Math.hypot(q[0] - p[0], q[2] - p[2]); return d > 25 && d < 140 && pathClearW(W, p, q, r, 2); })) return wps;
  }
  return null;
}
// Flacher, trockener, freier Platz (Landeplatz, Lieferplatz): Ring rMin..rMax um c, Boden auf ±half m eben (Höhenunterschied unter
// 0,25 m an 9 Proben, Schätzung: Platte liegt sichtbar auf), kein Wasser im Umkreis half + 4 m, need m frei zu Gebäuden und
// Bäumen (Kugel über dem Platz), Weg vom Platz 4 m senkrecht nach oben frei. Liefert [x, y, z] (y = höchster Boden der Proben).
export function flatSpot(W, c, rMin, rMax, half, need, R, tries = 300, m = 20) {
  for (let t = 0; t < tries; t++) {
    const a = R()*2*Math.PI, d = rMin + (rMax - rMin)*Math.sqrt(R()), x = c[0] + Math.sin(a)*d, z = c[1] - Math.cos(a)*d;
    if (!inB(W, x, z, m)) continue;
    const hs = [];
    for (const dx of [-half, 0, half]) for (const dz of [-half, 0, half]) hs.push(W.groundH(x + dx, z + dz));
    const lo = Math.min(...hs), hi = Math.max(...hs);
    if (hi - lo > 0.25) continue;
    const wr = half + 4;
    if ([[0, 0], [wr, 0], [-wr, 0], [0, wr], [0, -wr], [wr*0.7, wr*0.7], [-wr*0.7, wr*0.7], [wr*0.7, -wr*0.7], [-wr*0.7, -wr*0.7]].some(([dx, dz]) => W.wet(x + dx, z + dz))) continue;
    if (!W.free([x, hi + need + 0.3, z], need) || !W.free([x, hi + need + 4, z], need)) continue;
    return [x, hi, z];
  }
  return null;
}
