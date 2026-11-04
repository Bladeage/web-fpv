/* Kleine Stadt mit Testecken (Nutzerwunsch 04.11.2026). Ohne DOM, in Node testbar.
   Lage westlich des Startplatzes (x -134 bis -50, z -102 bis -47): dort liegt keine Mission (kein Kurs, keine Fahrzeugstrecke,
   keine Plattform, kein Jagd-Gebiet). Zwei Reihen mit je drei Feldern:
     Nord: Spielplatz (für Whoops) | Startplatz (Freiflug) | Baustelle
     Süd:  offenes Haus            | Parkhaus               | Ruine
   Die Hindernisse stehen in `town` (eigene Liste, die Liste `colliders` bleibt gleich wie in legacy/).
   Maße sind Schätzungen nach üblichen Bauten, auf die kleine Karte angepasst. */
import { MeshBuilder } from './world.js';

export const TOWN = { start: [-92, -84], box: [-134, -50, -102, -47] };   // Startplatz im Freiflug; Bereich x0, x1, z0, z1
export const town = [];          // Hindernisse (Quader wie colliders: c, h, cs, sn)
const townParts = [];                // Bauteile fürs Modell: [c, h, yaw, col]

const T_CONCRETE = [0.62, 0.62, 0.6], T_DARKC = [0.42, 0.42, 0.42], T_BRICK = [0.62, 0.36, 0.28], T_OLD = [0.55, 0.5, 0.42], T_WOOD = [0.55, 0.38, 0.22],
  T_METAL = [0.55, 0.57, 0.6], T_YELLOW = [0.95, 0.78, 0.15], T_RED = [0.85, 0.2, 0.15], T_WHITE = [0.92, 0.92, 0.9], T_BLUE = [0.2, 0.45, 0.85],
  T_GREEN = [0.25, 0.65, 0.3], T_SAND = [0.85, 0.76, 0.5], T_ASPHALT = [0.24, 0.25, 0.27], T_ORANGE = [1.0, 0.45, 0.1];

// Quader (Mitte c, halbe Maße h, Drehung yaw um die Hochachse). solid = Hindernis für die Physik.
function tBox(c, h, col, yaw = 0, solid = true) {
  townParts.push([c, h, yaw, col]);
  if (solid) town.push({ c, h, cs: Math.cos(yaw), sn: Math.sin(yaw) });
}
// Wand von (x0, z0) nach (x1, z1), Höhe H, Dicke d. Öffnungen: [Mitte entlang der Wand in m, Breite, unten, oben].
function tWall(x0, z0, x1, z1, H, d, col, holes = [], y0 = 0) {
  const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0)/L, uz = (z1 - z0)/L, yaw = Math.atan2(-uz, ux);
  const seg = (a, b, lo, hi) => { if (b - a < 0.05 || hi - lo < 0.05) return; const m = (a + b)/2; tBox([x0 + ux*m, y0 + (lo + hi)/2, z0 + uz*m], [(b - a)/2, (hi - lo)/2, d/2], col, yaw); };
  let at = 0;
  for (const [m, w, lo, hi] of holes.slice().sort((p, q) => p[0] - q[0])) {
    seg(at, m - w/2, 0, H); seg(m - w/2, m + w/2, 0, lo); seg(m - w/2, m + w/2, hi, H); at = m + w/2;
  }
  seg(at, L, 0, H);
}
// Stange senkrecht oder Balken
const tPost = (x, z, h, r, col) => tBox([x, h/2, z], [r, h/2, r], col);
// Quadratisches Übungsfenster (Rahmen aus 4 Stangen), Mitte (x, y, z), lichte Weite w, Drehung yaw
function tHoop(x, y, z, w, col, yaw = 0) {
  const t = 0.05, cs = Math.cos(yaw), sn = Math.sin(yaw), P = (lx, ly) => [x + lx*cs, y + ly, z - lx*sn];
  tBox(P(0, w/2 + t), [w/2 + 2*t, t, t], col, yaw); tBox(P(0, -w/2 - t), [w/2 + 2*t, t, t], col, yaw);
  tBox(P(-w/2 - t, 0), [t, w/2, t], col, yaw); tBox(P(w/2 + t, 0), [t, w/2, t], col, yaw);
}

// ---------- Straße und Startplatz (Mitte Nord) ----------
tBox([-92, 0.004, -74.5], [42, 0.004, 3.2], T_ASPHALT, 0, false);                      // Straße zwischen den Reihen
for (let x = -130; x <= -54; x += 6) tBox([x, 0.009, -74.5], [1.4, 0.001, 0.08], T_WHITE, 0, false);   // Mittellinie
tBox([-92, 0.003, -88], [10, 0.003, 10], [0.5, 0.52, 0.55], 0, false);               // Platz
tBox([TOWN.start[0], 0.006, TOWN.start[1]], [1.2, 0.003, 1.2], [0.22, 0.27, 0.34], 0, false);   // Startfläche
for (const [x, z] of [[-99, -80], [-85, -80], [-99, -96], [-85, -96]]) { tPost(x, z, 4.5, 0.06, T_METAL); tBox([x, 4.5, z + 0.5], [0.12, 0.06, 0.5], T_METAL); }   // Laternen
tBox([-92, 0.45, -95], [1.6, 0.06, 0.3], T_WOOD); tPost(-93.4, -95, 0.4, 0.05, T_METAL); tPost(-90.6, -95, 0.4, 0.05, T_METAL);   // Bank

// ---------- Spielplatz (Nordwest, Mitte -120 / -88): kleine Lücken für Whoops ----------
{
  const X = -120, Z = -88;
  tBox([X, 0.004, Z], [10, 0.004, 10], [0.55, 0.72, 0.4], 0, false);                 // Rasen
  for (const [x0, z0, x1, z1] of [[-10, -10, 10, -10], [10, -10, 10, 10], [10, 10, 2, 10], [-2, 10, -10, 10], [-10, 10, -10, -10]])
    tWall(X + x0, Z + z0, X + x1, Z + z1, 0.6, 0.06, T_WOOD);                          // niedriger Zaun mit Eingang
  // Schaukel: Gestell 2,4 m hoch, 2 Sitze an Ketten
  for (const s of [-1, 1]) { tPost(X - 6 + s*1.8, Z - 6.5, 2.4, 0.06, T_BLUE); tPost(X - 6 + s*1.8, Z - 5.5, 2.4, 0.06, T_BLUE); }
  tBox([X - 6, 2.4, Z - 6], [1.9, 0.06, 0.06], T_BLUE);
  for (const s of [-0.8, 0.8]) { tBox([X - 6 + s, 1.5, Z - 6], [0.02, 0.85, 0.02], T_METAL); tBox([X - 6 + s, 0.6, Z - 6], [0.25, 0.03, 0.12], T_RED); }
  // Rutsche: Podest 1,5 m auf 4 Pfosten, Leiter, Rutschbahn als Stufen
  for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) tPost(X + 5 + dx, Z - 6 + dz, 1.5, 0.05, T_YELLOW);
  tBox([X + 5, 1.5, Z - 6], [0.7, 0.05, 0.7], T_WOOD);
  for (let i = 0; i < 5; i++) tBox([X + 5, 1.25 - i*0.28, Z - 4.9 + i*0.5], [0.35, 0.03, 0.27], T_RED);
  // Klettergerüst: Würfel 2 x 2 x 2 m aus Stangen, Lücken 1 m
  for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) tPost(X - 5 + dx, Z + 4 + dz, 2, 0.03, T_GREEN);
  for (const y of [1, 2]) for (const d of [-1, 0, 1]) { tBox([X - 5, y, Z + 4 + d], [1, 0.03, 0.03], T_GREEN); tBox([X - 5 + d, y, Z + 4], [0.03, 0.03, 1], T_GREEN); }
  // Wippe und Sandkasten
  tBox([X + 5, 0.25, Z + 4], [0.08, 0.25, 0.15], T_METAL); tBox([X + 5, 0.55, Z + 4], [1.6, 0.05, 0.15], T_WOOD, 0.15);
  for (const [x0, z0, x1, z1] of [[2, 6.5, 8, 6.5], [8, 6.5, 8, 9], [8, 9, 2, 9], [2, 9, 2, 6.5]]) tWall(X + x0, Z + z0, X + x1, Z + z1, 0.3, 0.12, T_WOOD);
  tBox([X + 5, 0.006, Z + 7.75], [2.9, 0.004, 1.15], T_SAND, 0, false);
  // Übungsfenster für Whoops: 0,6 bis 1 m Weite, verschiedene Höhen, eine Reihe zum Durchfliegen
  [[-1, 0.8, 1.0], [1, 1.2, 0.8], [3, 0.7, 0.7], [5, 1.5, 0.6]].forEach(([dx, y, w], i) => tHoop(X + dx - 2, y, Z, w, [T_RED, T_YELLOW, T_BLUE, T_GREEN][i]));
}

// ---------- Baustelle (Nordost, Mitte -64 / -88) ----------
{
  const X = -64, Z = -88;
  tBox([X, 0.004, Z], [11, 0.004, 11], [0.55, 0.47, 0.36], 0, false);                // Erde
  for (const [x0, z0, x1, z1] of [[-11, -11, 11, -11], [11, -11, 11, 11], [11, 11, 3, 11], [-3, 11, -11, 11], [-11, 11, -11, -11]])
    tWall(X + x0, Z + z0, X + x1, Z + z1, 2, 0.05, [0.75, 0.78, 0.8], [], 0);      // Bauzaun 2 m mit Einfahrt
  // Rohbau: 2 Geschosse aus Stützen und Decken (3 m Geschosshöhe), Deckenloch für den Treppenschacht
  for (const dx of [-4, 0, 4]) for (const dz of [-3, 3]) tPost(X - 3 + dx, Z - 4 + dz, 6, 0.18, T_CONCRETE);
  tBox([X - 5.5, 3, Z - 4], [2.5, 0.12, 3.3], T_CONCRETE); tBox([X + 0.5, 3, Z - 4], [1.5, 0.12, 3.3], T_CONCRETE); tBox([X - 2, 3, Z - 6.2], [1, 0.12, 1.1], T_CONCRETE);
  tBox([X - 3, 6, Z - 4], [4.3, 0.12, 3.3], T_CONCRETE);
  // Gerüst vor der Südseite: Rahmen 2 m breit, 2 m hoch, Bohlen
  for (let i = 0; i <= 4; i++) { tPost(X - 7 + i*2, Z - 0.2, 6, 0.03, T_METAL); tPost(X - 7 + i*2, Z + 0.8, 6, 0.03, T_METAL); }
  for (const y of [2, 4]) tBox([X - 3, y, Z + 0.3], [4, 0.04, 0.55], T_WOOD);
  // Kran: Mast 14 m, Ausleger 12 m nach Westen über den Rohbau, Gegenausleger mit Gewicht nach Osten, Seil mit Haken
  tBox([X + 7, 7, Z - 7], [0.5, 7, 0.5], T_YELLOW); tBox([X + 1, 14.3, Z - 7], [6, 0.3, 0.3], T_YELLOW); tBox([X + 9, 14.3, Z - 7], [1.5, 0.3, 0.3], T_YELLOW);
  tBox([X + 9.8, 13.6, Z - 7], [0.7, 0.5, 0.5], T_DARKC); tBox([X - 3, 11.5, Z - 7], [0.02, 2.5, 0.02], T_METAL); tBox([X - 3, 8.8, Z - 7], [0.25, 0.25, 0.25], T_RED);
  // Container (einer gestapelt), Rohre, Pylonen, Sandhaufen
  tBox([X + 6, 1.3, Z + 6], [3, 1.3, 1.2], T_BLUE); tBox([X + 6, 3.9, Z + 6.3], [3, 1.3, 1.2], T_ORANGE, 0.08);
  for (let i = 0; i < 3; i++) tBox([X - 6, 0.3 + i*0.5, Z + 6 + i*0.3], [2.5, 0.25, 0.25], T_DARKC);
  for (const [dx, dz] of [[-2, 9], [0, 9], [2, 9], [8, 2], [8, 0]]) tBox([X + dx, 0.35, Z + dz], [0.15, 0.35, 0.15], T_ORANGE);
  tBox([X + 1, 0.6, Z + 5], [2, 0.6, 1.6], T_SAND);
}

// ---------- Offenes Haus (Südwest, Mitte -120 / -61): 2 Geschosse, Türen und Fenster zum Durchfliegen ----------
{
  const X = -120, Z = -61, hw = 5, hd = 4, H = 3, d = 0.25;
  for (const lvl of [0, 1]) {
    const y0 = lvl*H, door = lvl ? [] : [[5, 1.6, 0, 2.3]];
    tWall(X - hw, Z - hd, X + hw, Z - hd, H, d, T_WHITE, [[2.5, 1.2, 1, 2.2], [7.5, 1.2, 1, 2.2], ...(lvl ? [[5, 1.2, 1, 2.2]] : [])], y0);   // Nordseite
    tWall(X + hw, Z - hd, X + hw, Z + hd, H, d, T_WHITE, [[4, 1.4, 0.9, 2.3], ...(lvl ? [] : [[1.5, 1.4, 0, 2.3]])], y0);                   // Ostseite
    tWall(X + hw, Z + hd, X - hw, Z + hd, H, d, T_WHITE, [...door, [2, 1.2, 1, 2.2], [8, 1.2, 1, 2.2]], y0);                                 // Südseite mit Haustür
    tWall(X - hw, Z + hd, X - hw, Z - hd, H, d, T_WHITE, [[4, 1.4, 0.9, 2.3]], y0);                                                       // Westseite
  }
  tWall(X, Z - hd, X, Z + hd, H, 0.15, [0.85, 0.83, 0.78], [[4, 1.2, 0, 2.2]]);   // Innenwand mit Durchgang
  tBox([X - 2.5, H, Z], [2.5, 0.1, hd], T_WOOD); tBox([X + 3.5, H, Z - 1.5], [1.5, 0.1, 2.5], T_WOOD);   // Decke, Loch für die Treppe
  tBox([X - 2, 2*H, Z], [3, 0.12, hd + 0.3], T_BRICK);                                // halbes Dach, Osthälfte offen
  tBox([X + 3.5, 2*H + 0.6, Z - hd], [1.5, 0.6, 0.1], T_BRICK);                       // Giebelrest
}

// ---------- Parkhaus (Süd Mitte, Mitte -92 / -61): 3 offene Decks, Stützen, Brüstungen mit Lücken ----------
{
  const X = -92, Z = -61, hw = 9, hd = 9, deck = 3.2;
  for (const dx of [-9, -3, 3, 9]) for (const dz of [-9, -3, 3, 9]) tPost(X + dx, Z + dz, 3*deck, 0.22, T_CONCRETE);
  for (const lvl of [1, 2, 3]) {
    const y = lvl*deck;
    tBox([X - 2, y, Z], [7, 0.15, hd], T_CONCRETE); tBox([X + 7, y, Z - 4], [2, 0.15, 5], T_CONCRETE);   // Deck mit Rampenloch im Südosten
    for (const [x0, z0, x1, z1, holes] of [[-hw, -hd, hw, -hd, [[6, 4, 0, 1]]], [hw, -hd, hw, hd, [[12, 4, 0, 1]]], [hw, hd, -hw, hd, [[9, 5, 0, 1]]], [-hw, hd, -hw, -hd, [[6, 4, 0, 1]]]])
      tWall(X + x0, Z + z0, X + x1, Z + z1, 1, 0.2, T_DARKC, holes, y + 0.15);   // Brüstung 1 m, mit Lücke zum Durchfliegen
  }
  for (let i = 0; i < 6; i++) tBox([X + 7, 0.25 + i*0.5, Z + 1.5 + i*1.2], [1.8, 0.1, 0.6], T_DARKC);   // Rampe (Stufen) ins erste Deck
  tBox([X - 9.4, 8.2, Z], [0.1, 0.8, 2.5], T_BLUE);                                   // Schild „P“
  tBox([X - 9.5, 8.2, Z], [0.02, 0.5, 0.15], T_WHITE); tBox([X - 9.5, 8.5, Z + 0.25], [0.02, 0.2, 0.15], T_WHITE);
}

// ---------- Ruine (Südost, Mitte -64 / -61): Gemäuer mit Lücken, Bogen, Säulen, Turmrest ----------
{
  const X = -64, Z = -61;
  tBox([X, 0.004, Z], [11, 0.004, 11], [0.5, 0.55, 0.38], 0, false);                 // verwilderter Boden
  // Außenmauer in unterschiedlicher Höhe (abgebrochen), mit Fensterlöchern
  const jag = (x0, z0, x1, z1, hs, holes = []) => { const n = hs.length; for (let i = 0; i < n; i++) { const a = i/n, b = (i + 1)/n;
    tWall(x0 + (x1 - x0)*a, z0 + (z1 - z0)*a, x0 + (x1 - x0)*b, z0 + (z1 - z0)*b, hs[i], 0.6, T_OLD, holes.filter(h => h[4] === i)); } };
  jag(X - 10, Z - 9, X + 6, Z - 9, [4.5, 5.2, 3.8, 2.2], [[2, 1.2, 1.5, 3, 1]]);
  jag(X + 6, Z - 9, X + 6, Z + 2, [3.4, 1.6, 0.8]);
  jag(X - 10, Z - 9, X - 10, Z + 8, [5, 4.2, 2.6, 1.2], [[2.1, 1.4, 0, 2.6, 0], [2.1, 1, 1.6, 2.8, 1]]);
  // Torbogen: zwei Pfeiler und Sturz, 2,5 m breit
  tBox([X - 3, 1.8, Z + 4], [0.5, 1.8, 0.5], T_OLD); tBox([X + 0.5, 1.8, Z + 4], [0.5, 1.8, 0.5], T_OLD); tBox([X - 1.25, 3.9, Z + 4], [2.25, 0.3, 0.5], T_OLD);
  // Säulenreihe (zwei umgefallen)
  for (let i = 0; i < 4; i++) tPost(X - 6 + i*2.5, Z - 3, 3.5, 0.3, [0.7, 0.68, 0.62]);
  tBox([X + 5, 0.3, Z - 1], [1.6, 0.3, 0.3], [0.7, 0.68, 0.62], 0.7); tBox([X + 3, 0.3, Z + 7], [1.4, 0.3, 0.3], [0.7, 0.68, 0.62], -0.4);
  // Turmrest 8 m mit Öffnungen zum Durchfliegen
  tWall(X + 6, Z + 5, X + 9.5, Z + 5, 8, 0.5, T_OLD, [[1.75, 1.2, 2, 3.4], [1.75, 1, 5.5, 6.6]]);
  tWall(X + 9.5, Z + 5, X + 9.5, Z + 8.5, 7, 0.5, T_OLD, [[1.75, 1.4, 0, 2.6]]);
  tWall(X + 9.5, Z + 8.5, X + 6, Z + 8.5, 5.5, 0.5, T_OLD);
  tWall(X + 6, Z + 8.5, X + 6, Z + 5, 6.2, 0.5, T_OLD, [[1.75, 1.2, 3, 4.2]]);
  // Schutt
  for (const [dx, dz, s] of [[-7, 5, 0.6], [-6, 6.5, 0.4], [2, -6, 0.5], [3.5, -5, 0.35], [-2, 8, 0.45]]) tBox([X + dx, s, Z + dz], [s*1.3, s, s], T_OLD, dx);
}

// Modell der Stadt (Weltkoordinaten)
export function buildTownMesh() {
  const mb = new MeshBuilder();
  for (const [c, h, yaw, col] of townParts) mb.box(c, h, yaw, col);
  return new Float32Array(mb.d);
}
