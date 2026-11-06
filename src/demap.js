/* Deutschlandkarte zum Auswählen eines Ortes (Etappe L2). Ohne DOM, in Node testbar.
   Grenzen der Bundesländer: BKG VG2500, © BKG 2026 dl-de/by-2-0 (vereinfacht, tools/germany.mjs), eingebettet (geht offline).
   Ansicht: Mittelpunkt in UTM 32 (m) und Maßstab (m je Bildpunkt); Bildschirm y nach unten, Norden oben. */

// Der Build bettet die Karte gepackt ein (deflate, Base64). dePrepare entpackt sie einmal beim Start (Bordmittel
// DecompressionStream); bis dahin liefert deMap null wie ohne Karte (Laden eines Orts nutzt dann nur die Hauptquelle).
export const DE_DATA = '%%DE_MAP%%';
let deCache = null;
export function deMap() { return deCache; }
export async function dePrepare() {
  if (deCache || DE_DATA.startsWith('%%')) return deCache;
  try {
    const b = Uint8Array.from(atob(DE_DATA), c => c.charCodeAt(0));
    deCache = JSON.parse(new TextDecoder().decode(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()));
  } catch (e) { deCache = null; }
  return deCache;
}
export function deSetMap(m) { deCache = m; }   // für Werkzeuge und Tests
// Ausdehnung Deutschlands in UTM 32 (m), mit etwas Rand
export const DE_BOX = [270000, 5220000, 930000, 6110000];

// Land an einem Punkt (UTM 32, m) oder null (Ausland, Meer)
export function deLandAt(E, N) {
  const m = deMap();
  if (!m) return null;
  const x = E/100, y = N/100;
  for (const l of m.lands) {
    let inside = false;
    for (const r of l.rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ax, ay] = r[j], [bx, by] = r[i];
      if ((ay > y) !== (by > y) && x < ax + (y - ay)*(bx - ax)/(by - ay)) inside = !inside;
    }
    if (inside) return l.name;
  }
  return null;
}
// Ansicht: v = { E, N, s } (Mitte, m je Bildpunkt), w und h = Größe in Bildpunkten
export const mapToScreen = (v, w, h, E, N) => [w/2 + (E - v.E)/v.s, h/2 - (N - v.N)/v.s];
export const mapFromScreen = (v, w, h, x, y) => [v.E + (x - w/2)*v.s, v.N - (y - h/2)*v.s];
// Zoomen um einen Bildpunkt (der Ort unter dem Zeiger bleibt stehen); Maßstab zwischen 1 m und 3 km je Bildpunkt
export function mapZoom(v, w, h, x, y, f) {
  const [E, N] = mapFromScreen(v, w, h, x, y), s = Math.min(3000, Math.max(1, v.s*f));
  return mapClamp({ E: E - (x - w/2)*s, N: N + (y - h/2)*s, s });
}
// Mitte innerhalb Deutschlands halten
export const mapClamp = v => ({ E: Math.min(DE_BOX[2], Math.max(DE_BOX[0], v.E)), N: Math.min(DE_BOX[3], Math.max(DE_BOX[1], v.N)), s: v.s });
// Ganz Deutschland in w x h zeigen
export function mapFitGermany(w, h) {
  return { E: (DE_BOX[0] + DE_BOX[2])/2, N: (DE_BOX[1] + DE_BOX[3])/2, s: Math.max((DE_BOX[2] - DE_BOX[0])/w, (DE_BOX[3] - DE_BOX[1])/h)*1.02 };
}
// Rechteck eines Landes (UTM 32, m) mit Rand in m, oder null
export function deLandBox(name, pad = 2000) {
  const m = deMap(), l = m && m.lands.find(x => x.name === name);
  if (!l) return null;
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of l.rings) for (const [x, y] of r) b = [Math.min(b[0], x*100), Math.min(b[1], y*100), Math.max(b[2], x*100), Math.max(b[3], y*100)];
  return [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
}
