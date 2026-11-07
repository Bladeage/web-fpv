/* VBS-Grundtypen (vorgebaut, noch nicht fest im Spiel; Konzept docs/dis-drohne.md). Ohne DOM, in Node testbar.
   Viele VBS-Modelle (etwa 9 900) werden auf 18 einfache Grundtypen zurückgeführt („kleinster gemeinsamer Nenner“).
   Zuordnung nach der DIS-Entitätsart (Kind, Domain, Land, Kategorie, Unterkategorie, ...), nicht nach VBS-Namen.
   Eine lokale Tabelle aus der privaten Modellliste kann die Zuordnung verfeinern (zum Beispiel Kette oder Rad); sie liegt
   nur in private/ und kommt nie ins Repo.

   Zahlenwerte der Entitätsarten aus SISO-REF-010 v37 (25.05.2026). Reprinted with permission from SISO Inc.
   Maße der Modelle: Schätzungen nach typischen Fahrzeugen der Art (Annahme jeweils im Kommentar), nicht aus VBS. */
import { MeshBuilder } from './world.js';

// id, Name, Domain (1 Land, 2 Luft, 3 Wasser, 0 Person), Maße L x B x H in m (Schätzung)
export const DIS_BASE = [
  { id: 'kpz', name: 'Kampfpanzer', dom: 1, size: [7.7, 3.7, 2.5] },            // Annahme: wie Leopard 2 (Wanne ohne Rohr)
  { id: 'spzk', name: 'Schützenpanzer Kette', dom: 1, size: [7.4, 3.6, 3.0] },  // wie Puma, Marder
  { id: 'spzr', name: 'Schützenpanzer Rad', dom: 1, size: [8.0, 3.0, 3.0] },    // wie Boxer mit Turm
  { id: 'tpz', name: 'Transportpanzer Rad', dom: 1, size: [7.0, 3.0, 2.6] },    // wie Fuchs
  { id: 'aufkl', name: 'Aufklärung', dom: 1, size: [5.7, 2.5, 1.8] },           // wie Fennek
  { id: 'pio', name: 'Pionier/Bergepanzer', dom: 1, size: [7.9, 3.5, 2.7] },    // wie Kodiak, Büffel
  { id: 'lkw', name: 'Lkw', dom: 1, size: [9.0, 2.5, 3.3] },
  { id: 'pkw', name: 'Pkw/Geländewagen', dom: 1, size: [4.7, 2.0, 1.9] },
  { id: 'art', name: 'Artillerie (Rohr)', dom: 1, size: [7.9, 3.6, 3.1] },      // wie Panzerhaubitze 2000
  { id: 'rak', name: 'Raketenwerfer', dom: 1, size: [7.0, 3.0, 2.6] },          // wie MARS
  { id: 'flak', name: 'Flugabwehr', dom: 1, size: [7.7, 3.7, 3.0] },            // wie Gepard (ohne Radar)
  { id: 'khs', name: 'Kampfhubschrauber', dom: 2, size: [14.0, 4.5, 3.8] },     // wie Tiger (Rotor 13 m)
  { id: 'ths', name: 'Transporthubschrauber', dom: 2, size: [16.0, 3.6, 4.2] }, // wie NH90 (Rotor 16 m)
  { id: 'flz', name: 'Flugzeug', dom: 2, size: [16.0, 11.0, 4.5] },             // wie Kampfjet
  { id: 'uavf', name: 'Drohne (Fläche)', dom: 2, size: [6.0, 10.0, 1.5] },      // mittlere Aufklärungsdrohne
  { id: 'uavm', name: 'Drohne (Multikopter)', dom: 2, size: [1.0, 1.0, 0.35] }, // wie AirRobot AR 100-B (1 m)
  { id: 'boot', name: 'Boot', dom: 3, size: [10.0, 3.0, 2.5] },
  { id: 'person', name: 'Person', dom: 0, size: [0.5, 0.6, 1.8] },
];
export const DIS_BASE_OTHER = { id: 'other', name: 'Unbekannt', dom: -1, size: [3, 3, 3] };   // Quader, wenn nichts passt
export const disBaseInfo = id => DIS_BASE.find(b => b.id === id) || DIS_BASE_OTHER;
// Farbe nach Seite (Force ID: 0 sonstige, 1 Freund, 2 Feind, 3 neutral), wie bei Lagekarten; zerstört dunkel
export const DIS_SIDE = { 0: [0.85, 0.75, 0.2], 1: [0.25, 0.45, 0.9], 2: [0.9, 0.25, 0.2], 3: [0.3, 0.72, 0.35], dead: [0.08, 0.08, 0.08] };

// Entitätsart [Kind, Domain, Land, Kategorie, Unterkategorie, Spezifisch, Extra] -> Grundtyp-id.
// table (optional, nur lokal): Map 'Land.Kategorie.Unterkategorie' -> id, geht vor.
// Regeln (Kategorien SISO-REF-010; „vermutet“ = Zuordnung nicht in der Quelle geprüft):
// - Kind 3 Lebewesen -> Person. Kind 1 Plattform:
// - Land: 1 Kampfpanzer; 2 Schützenpanzer (Vorgabe Rad: in der VBS-Liste etwas mehr Rad, k5.2); 3 Transportpanzer, Vorgabe Rad
//   (Pionier und Berge nur über die Tabelle); 4, 5 Artillerie; 6 Pkw; 7 Lkw; 8, 9, 18 Pionier; 10 Mörser -> Artillerie (vermutet);
//   28 Flugabwehr; 81 Pkw, übrige 80 bis 93 Lkw (zivil, vermutet). Aufklärung und Raketenwerfer haben keine eigene Kategorie:
//   nur über die Tabelle.
// - Luft: 1 bis 19 Flugzeug; 20 Kampfhubschrauber; 21 bis 39 Transporthubschrauber (22, 25, 26 vermutet); 40 Schulflugzeug;
//   50 unbemannt: Vorgabe Drohne (Fläche), Multikopter für unsere Drohne (Deutschland, Unterkategorie 7) und den allgemeinen
//   Wert 1.2.0.50.0 (in VBS meist Drohnen-Hubschrauber, k5.2); zivil 80 bis 101 Flugzeug (vermutet).
// - Wasser (Oberfläche und Unterwasser): Boot.
export function disBaseOf(t, table = null) {
  const [kind, dom, country, cat, sub] = t;
  if (table) { const k = table.get(country + '.' + cat + '.' + sub); if (k) return k; }
  if (kind === 3) return 'person';
  if (kind !== 1) return 'other';
  if (dom === 1) {
    if (cat === 1) return 'kpz';
    if (cat === 2) return 'spzr';
    if (cat === 3) return 'tpz';
    if (cat === 4 || cat === 5 || cat === 10) return 'art';
    if (cat === 6 || cat === 81) return 'pkw';
    if (cat === 7 || (cat >= 80 && cat <= 93)) return 'lkw';
    if (cat === 8 || cat === 9 || cat === 18) return 'pio';
    if (cat === 28) return 'flak';
    return 'other';
  }
  if (dom === 2) {
    if (cat === 20) return 'khs';
    if (cat >= 21 && cat <= 39) return 'ths';
    if (cat === 50) return (country === 78 && sub === 7) || (country === 0 && sub === 0) ? 'uavm' : 'uavf';
    if ((cat >= 1 && cat <= 19) || cat === 40 || (cat >= 80 && cat <= 101)) return 'flz';
    return 'other';
  }
  if (dom === 3 || dom === 4) return 'boot';
  return 'other';
}
// Lokale Tabelle aus Text: je Zeile „Land.Kategorie.Unterkategorie=id“ (Kommentare mit #). Für private/ (Brücke).
export function disBaseTable(text) {
  const m = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const s = line.replace(/#.*/, '').trim(), [k, v] = s.split('=').map(x => x && x.trim());
    if (k && v && /^\d+\.\d+\.\d+$/.test(k) && disBaseInfo(v) !== DIS_BASE_OTHER) m.set(k, v);
  }
  return m;
}

// Modell eines Grundtyps: Mitte am Boden, vorn = -Z, oben = +Y (wie die übrigen Modelle). Farben neutral (Oliv, Grau);
// die Seite färbt das Zeichnen ein (uOver). Einfache Formen: Wanne, Ketten oder Räder, Turm, Rohr, Rotor.
export function disBaseMesh(id) {
  const mb = new MeshBuilder(), b = disBaseInfo(id), [L, W, H] = b.size, l = L/2, w = W/2;
  const OL = [0.42, 0.45, 0.32], DK = [0.12, 0.12, 0.13], GL = [0.2, 0.28, 0.35], GR = [0.55, 0.57, 0.6], LT = [0.7, 0.72, 0.74];
  const box = (x, y, z, hx, hy, hz, c = OL) => mb.box([x, y, z], [hx, hy, hz], 0, c);
  const tracks = h => { for (const s of [-1, 1]) box(s*(w - 0.35), h/2, 0, 0.35, h/2, l*0.95, DK); };
  const wheels = (n, r) => { for (let i = 0; i < n; i++) { const z = -l*0.75 + i*(1.5*l)/(n - 1); for (const s of [-1, 1]) mb.cyl([s*(w - 0.15), r, z], r, 0.15, 12, DK, 'x'); } };
  const gun = (y, z0, len, r) => mb.cyl([0, y, z0 - len/2], r, len/2, 8, DK, 'z');
  const rotor = (y, r) => { box(0, y, 0, r, 0.04, 0.14, DK); box(0, y, 0, 0.14, 0.04, r, DK); mb.cyl([0, y - 0.25, 0], 0.12, 0.25, 8, DK); };
  switch (id) {
    case 'kpz': tracks(1.1); box(0, 1.35, 0, w*0.82, 0.45, l*0.9); box(0, 2.1, 0.4, w*0.6, 0.35, l*0.42); gun(2.1, -l*0.4, 5.0, 0.12); break;
    case 'spzk': tracks(1.1); box(0, 1.7, 0, w*0.85, 0.75, l*0.92); box(0, 2.7, 0.3, w*0.4, 0.3, l*0.25); gun(2.7, -l*0.2, 2.5, 0.07); break;
    case 'spzr': wheels(4, 0.6); box(0, 1.75, 0, w*0.95, 0.75, l*0.95); box(0, 2.75, 0.4, w*0.4, 0.25, l*0.22); gun(2.75, -l*0.1, 2.6, 0.07); break;
    case 'tpz': wheels(3, 0.6); box(0, 1.6, 0, w*0.95, 0.7, l*0.95); box(0, 2.0, -l*0.75, w*0.9, 0.25, l*0.18, GL); break;
    case 'aufkl': wheels(2, 0.5); box(0, 1.1, 0, w*0.95, 0.55, l*0.95); box(0, 1.65, 0.3, w*0.6, 0.12, l*0.4); mb.cyl([0, 2.0, 0.8], 0.06, 0.25, 6, DK); break;   // kurze Antenne (Mast eingefahren)
    case 'pio': tracks(1.1); box(0, 1.6, 0.4, w*0.85, 0.6, l*0.75); box(0, 0.7, -l - 0.3, w*1.05, 0.55, 0.12, DK); box(0.6, 2.6, 0.5, 0.18, 0.18, l*0.7, DK); break;   // Räumschild, Kranarm
    case 'lkw': wheels(3, 0.55); box(0, 1.6, -l*0.75, w*0.95, 0.75, l*0.22); box(0, 2.0, -l*0.95, w*0.9, 0.3, 0.05, GL); box(0, 1.9, l*0.2, w, 0.85, l*0.72, GR); break;
    case 'pkw': wheels(2, 0.38); box(0, 0.8, 0, w*0.95, 0.4, l*0.95); box(0, 1.45, 0.3, w*0.85, 0.3, l*0.5, GL); break;
    case 'art': tracks(1.1); box(0, 1.45, 0, w*0.85, 0.55, l*0.92); box(0, 2.4, 0.6, w*0.8, 0.55, l*0.45); gun(2.5, -l*0.1, 8.0, 0.11); break;
    case 'rak': tracks(1.0); box(0, 1.3, -l*0.55, w*0.85, 0.5, l*0.35); box(0, 1.2, l*0.25, w*0.85, 0.4, l*0.6);
      mb.box([0, 2.2, l*0.3], [w*0.8, 0.5, l*0.5], 0, GR); break;
    case 'flak': tracks(1.1); box(0, 1.45, 0, w*0.85, 0.55, l*0.92); box(0, 2.4, 0.3, w*0.7, 0.45, l*0.35);
      for (const s of [-1, 1]) mb.cyl([s*(w*0.85), 2.6, -l*0.2], 0.07, 1.8, 6, DK, 'z'); mb.cyl([0, 3.05, 1.2], 0.6, 0.05, 12, LT); break;
    case 'khs': mb.cyl([0, 1.6, 0], 0.65, l*0.55, 10, OL, 'z'); box(0, 1.1, l*0.75, 0.15, 0.3, l*0.35); box(0, 1.5, 0, w*0.6, 0.06, 0.5); box(0, 2.0, -l*0.25, 0.5, 0.3, 1.0, GL); rotor(2.8, 6.5); break;
    case 'ths': mb.cyl([0, 2.0, -0.5], 1.4, l*0.4, 12, OL, 'z'); box(0, 2.2, l*0.65, 0.3, 0.4, l*0.3); box(0, 2.3, -l*0.45, 1.1, 0.6, 0.6, GL);
      for (const s of [-1, 1]) for (const z of [-2, 2]) mb.cyl([s*1.1, 0.35, z], 0.35, 0.15, 10, DK, 'x'); rotor(4.0, 8.0); break;
    case 'flz': mb.cyl([0, 1.8, 0], 0.8, l*0.9, 10, GR, 'z'); mb.box([0, 1.7, 0.8], [w, 0.1, 2.2], 0, GR); mb.box([0, 1.9, l*0.75], [2.6, 0.08, 1.0], 0, GR);
      mb.box([0, 3.0, l*0.8], [0.08, 1.2, 1.0], 0, GR); mb.box([0, 2.4, -l*0.55], [0.5, 0.35, 1.2], 0, GL);
      for (const [x, z] of [[0, -l*0.6], [-1.6, 1], [1.6, 1]]) mb.cyl([x, 0.45, z], 0.3, 0.1, 8, DK, 'x'); break;
    case 'uavf': mb.cyl([0, 1.0, 0], 0.4, l*0.9, 8, LT, 'z'); mb.box([0, 1.1, 0], [w, 0.06, 0.6], 0, LT); mb.box([0, 1.4, l*0.8], [0.06, 0.5, 0.4], 0, LT);
      mb.cyl([0, 1.0, l*0.95], 0.25, 0.05, 8, DK, 'z'); for (const z of [-l*0.6, l*0.4]) mb.cyl([0, 0.3, z], 0.12, 0.3, 6, DK); break;   // Fahrwerk bis zum Boden
    case 'uavm': box(0, 0.25, 0, 0.12, 0.06, 0.12, DK); for (const s of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { mb.box([s[0]*0.2, 0.25, s[1]*0.2], [0.24, 0.02, 0.02], s[0]*s[1] > 0 ? -Math.PI/4 : Math.PI/4, DK);
      mb.cyl([s[0]*0.35, 0.3, s[1]*0.35], 0.15, 0.01, 12, LT); } break;
    case 'boot': mb.box([0, 0.6, 0.6], [w, 0.6, l*0.85], 0, GR); for (const s of [-1, 1]) mb.box([s*w*0.5, 0.6, -l*0.75], [w*0.5, 0.6, l*0.3], s*0.35, GR);
      box(0, 1.7, 0.8, w*0.6, 0.5, l*0.3, LT); box(0, 1.9, 0.2, w*0.55, 0.2, 0.05, GL); break;
    case 'person': for (const s of [-1, 1]) box(s*0.1, 0.42, 0, 0.08, 0.42, 0.09); box(0, 1.15, 0, 0.2, 0.32, 0.11); box(0, 1.62, 0, 0.11, 0.13, 0.11, [0.75, 0.6, 0.5]);
      for (const s of [-1, 1]) box(s*0.27, 1.12, 0, 0.06, 0.3, 0.06); break;
    default: box(0, H/2, 0, w, H/2, l, LT);   // unbekannt: Quader
  }
  return new Float32Array(mb.d);
}

// Vorschau „VBS-Grundtypen“ (Modus unter Spezial): Aufstellung auf einer freien Fläche der Spielkarte (110 x 50 m,
// nordwestlich vom Start). Reihe 1 Bodenfahrzeuge, Reihe 2 Luftfahrzeuge, Reihe 3 Boot, Person und Beispiele für die Seiten.
export const DIS_PREVIEW = { home: [-125, -80] };
export function disPreviewLayout() {
  const out = [], land = DIS_BASE.filter(b => b.dom === 1), air = ['khs', 'ths', 'flz', 'uavf', 'uavm'];
  land.forEach((b, i) => out.push({ id: b.id, x: -172 + i*9.5, z: -96, force: 1 }));
  air.forEach((id, i) => out.push({ id, x: -168 + i*19, z: -114, force: 1 }));
  [['boot', 1], ['person', 1], ['kpz', 2, 'Feind'], ['kpz', 3, 'neutral'], ['kpz', 0, 'sonstige'], ['kpz', 1, 'zerstört', true], ['other', 0]]
    .forEach(([id, force, note, dead], i) => out.push({ id, x: -170 + i*14, z: -132, force, note, dead: !!dead }));
  return out;
}
