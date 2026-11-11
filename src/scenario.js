/* Szenarien auf derselben Karte: Torkurs, Ringparcours, Slalom, Präzisionslandung, Freiflug.
   Ohne DOM, in Node testbar. Die Karte (world.js) bleibt immer gleich; ein Szenario legt
   nur eigene Elemente dazu und tauscht die Aufgabe der Physik (task) aus. */
import { vAdd, vSub, vScale, vDot, vLen, vNorm, vCross } from './math.js';
import { cfg, game, say, banner, saveBest, loadBest } from './state.js';
import { COURSE, gates, colliders, rng, MeshBuilder } from './world.js';
import { PHYS, task, checkGate, collide, contact, fx, bestOk, crash } from './physics.js';
import { fmtTime } from './format.js';
import { targets, initTargets, stepTargets, HUNT_N, huntRoutePts, REGION } from './targets.js';
import { vehicles, initVehicles, stepVehicles, VEH_HALF, ROUTES, routeAt } from './vehicles.js';
import { aircraft, initAircraft, stepAircraft, aircraftLeft } from './aircraft.js';
import { TOWN } from './town.js';
import { PILOT } from './signal.js';
import { placePilot, PILOT_POS } from './pilot.js';
import { rw, rwNearName, placeReal, groundH, solidH } from './realworld.js';
import { rwRoads, roadRoutes, parkSpots } from './roads.js';
import { ringChain, ringCircle, freeAir, airRegions, airCircle, airWaypoints, flatSpot } from './place.js';
import { osdOn } from './osd.js';
import { DIS_PREVIEW } from './distypes.js';

export const SCENARIOS = [
  { id: 'gates',   name: 'Torkurs',            info: '8 Tore am Boden der Reihe nach, Runde für Runde.' },
  { id: 'rings',   name: 'Ringparcours',       info: '8 Ringe in der Luft, geneigt. Bei jedem Start neu angeordnet.' },
  { id: 'slalom',  name: 'Slalom',             info: '5 Stangen, bei jedem Start neu. Blau: rechts vorbei, rot: links vorbei.' },
  { id: 'landing', name: 'Präzisionslandung',  info: 'Abheben, zur Plattform fliegen, sanft landen und 1 s ruhig stehen.' },
  { id: 'hunt',    name: 'Jagd: Drohnen',      info: '9 Ziel-Drohnen: weiß schwebend, gelb feste Route, blau zufällig, rot ausweichend.' },
  { id: 'hunt3',   name: 'Jagd: Flugzeuge',    info: '6 Luftziele: Starrflügler (3 Punkte, fliegen schnell Kreise und Achten), Hubschrauber (2 Punkte), große Sechs-Rotoren (1 Punkt).' },
  { id: 'hunt2',   name: 'Jagd: Fahrzeuge',    info: '7 Fahrzeuge: grau stehend, blau langsam, rot schnell. Die geforderte Anzahl berühren.' },
  { id: 'deliver', name: 'Paketlieferung',     info: 'Paket am orangen Platz holen, zur blauen Plattform bringen. 3 Lieferungen, tief und langsam schweben.' },
  { id: 'follow',  name: 'Verfolgung',         info: 'Dem orangen Auto folgen: 4 bis 12 m Abstand, 1,5 bis 10 m Höhe. 30 s im Band.' },
  { id: 'free',    name: 'Freiflug',           info: 'Ohne Aufgabe. Testecken rundherum: Haus im Westen, Spielplatz im Südwesten, Baustelle im Norden, Parkhaus im Osten, Ruine im Süden.' },
  { id: 'real',    name: 'Echte Welt',         info: 'Echtes Gelände mit Luftbild, Häusern und Bäumen: Monschau eingebaut, andere Orte per Karte. Daten: Geobasis NRW, dl-de/zero-2.0.' },
  { id: 'vbs',     name: 'DIS-Grundtypen',     info: 'Vorschau: 18 einfache Modelle für Einheiten aus DIS. Blau Freund, rot Feind, grün neutral, gelb sonstige, dunkel zerstört.' },
];
export const scen = { id: 'gates', version: 0 };   // version steigt bei jedem Wechsel (für render.js)

/* ---------- Elemente ---------- */
// Ringe: einer je Kursabschnitt, bei jedem Start zufällig versetzt und geprüft (makeRings). Die Ringebene steht
// quer zur Linie vom vorigen zum nächsten Ring; wegen der Höhenunterschiede sind die Ringe geneigt.
const RING_H = [4, 7, 11, 6, 13, 9, 5, 8];
export const RING_TUBE = 0.1;   // Rohrradius in m
// In der echten Welt dickeres Rohr, damit die Ringe aus der Ferne zu sehen sind (Nutzer, Prompt 165: „ich finde keine“;
// Schätzung: 0,22 m ist bei 60 m Abstand etwa 2 Pixel breit)
export const ringTube = () => rw.on ? 0.22 : RING_TUBE;
// Schwierigkeit (cfg.diff): Ringradius bis Rohrmitte, Slalom-Fenster, Landung (Grenzgeschwindigkeit, halbe Plattformbreite) in m und m/s, Tempo der Ziel-Drohnen (Faktor)
// Leicht: Jagd mit Ballons (balloons), sonst vorerst wie Normal; weitere Erleichterungen folgen in Runden (J0).
// Normal: das frühere „Leicht“. Schwer: das frühere „Mittel“.
export const DIFF = {
  // Leicht (Runde 1, Schätzungen): größere Ringe, breiterer Slalom, Tor zählt bis 0,8 m neben der Öffnung, Landeplatz und Lieferzonen
  // doppelt so groß, Landehilfe unter 3 m, Abwurf im Überflug, Sinkraten-Anzeige, Verfolgung 30 % langsamer mit mehr Abstand
  // Runde 2: Ringe nur 3 bis 8 m hoch, Leuchtspur hinter dem Auto, Ziele langsamer (Ballon-Treffer großzügiger, siehe balloon.js)
  easy: { name: 'Leicht', ringR: 3.0, slalomW: 10, landV: 4.0, padHalf: 3.0, huntSpeed: 0.55, balloons: true, gateExtra: 0.8, dropScale: 2,
          landAid: true, flyDrop: true, sinkHud: true, followSpeed: 0.5, followMax: 18, ringSpan: 5, leadTrail: true, info: 'Ballons in der Jagd, größere Ringe und Plätze, Landehilfe' },
  mid:  { name: 'Normal', ringR: 2.2, slalomW: 8, landV: 3.0, padHalf: 1.5, huntSpeed: 0.7, followSpeed: 0.7, info: 'Ohne Hilfen' },
  hard: { name: 'Schwer', ringR: 1.6, slalomW: 6, landV: 2.0, padHalf: 1.0, huntSpeed: 1.0, followSpeed: 1.0, info: 'Kleinere Ringe, engerer Slalom, schnellere Ziele' }
};
export const diff = () => DIFF[cfg.diff] || DIFF.mid;
export const dropR = () => DROP_R*(diff().dropScale || 1);   // Radius der Lieferzonen nach Stufe
// Landehilfe (Leicht): unter 5 m Höhe höchstens 1,2 m/s plus 0,5 m/s je Meter Höhe sinken (am Boden 1,2 m/s)
function landAid(s, h) {
  const alt = s.p[1] - PHYS.foot - (rw.on ? solidH(s.p[0], s.p[2]) : 0), vmax = 1.2 + 0.5*Math.max(0, alt);
  if (!diff().landAid || alt > 5 || s.v[1] > -vmax) return;
  // Schwerkraft dieses Schritts ausgleichen und dann zügig auf die erlaubte Sinkrate bremsen (nicht darüber hinaus)
  s.v[1] = Math.min(-vmax, s.v[1] + 9.81*h + (-vmax - s.v[1])*Math.min(1, 10*h));
}
/* ---------- Zufällige Anordnung mit Prüfung (Ringe, Slalom) ---------- */
// Abstand eines Punktes zu einem Hindernis-Quader (0 = innen)
function boxDist(p, c) {
  const dx = p[0] - c.c[0], dz = p[2] - c.c[2], lx = dx*c.cs - dz*c.sn, lz = dx*c.sn + dz*c.cs, ly = p[1] - c.c[1];
  return Math.hypot(Math.max(0, Math.abs(lx) - c.h[0]), Math.max(0, Math.abs(ly) - c.h[1]), Math.max(0, Math.abs(lz) - c.h[2]));
}
const clearOf = (p, d) => colliders.every(c => boxDist(p, c) > d);
// Weg a->b frei: Punkte alle 0,75 m mit Abstand d zu allen Hindernissen
function pathClear(a, b, d) {
  const n = Math.ceil(vLen(vSub(b, a))/0.75);
  for (let i = 0; i <= n; i++) if (!clearOf(vAdd(a, vScale(vSub(b, a), i/n)), d)) return false;
  return true;
}
const RING_CHECK_R = 2.4;   // größter Ringradius (leicht) plus Rohr, für die Prüfung
function ringFrame(c, n) { const e1 = vNorm(vCross(n, [0,1,0])); return { c, n, e1, e2: vCross(e1, n) }; }
function framesFromCenters(cs) {
  return cs.map((c, i) => ringFrame(c, vNorm(vSub(cs[(i + 1) % cs.length], cs[(i + cs.length - 1) % cs.length]))));
}
// Prüfung einer Ringanordnung: Höhe über Boden, Abstand zu Hindernissen, Neigung, freier Weg zum nächsten Ring, Abstand der Ringe.
export function ringLayoutOk(list) {
  return list.every((g, i) => {
    const nx = list[(i + 1) % list.length], d = vLen(vSub(nx.c, g.c));
    return g.c[1] - RING_CHECK_R > 1 && clearOf(g.c, RING_CHECK_R + 1.5) && Math.abs(g.n[1]) < 0.6
      && d > 12 && d < 70 && pathClear(g.c, nx.c, 1.2);
  });
}
// Feste Anordnung (Mitte jedes Kursabschnitts) als Rückfall
const segMid = i => { const a = COURSE[i], b = COURSE[(i+1) % COURSE.length]; return [(a[0]+b[0])/2, RING_H[i], (a[1]+b[1])/2]; };
export const rings = [];
function makeRings(R) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const cs = COURSE.map((a, i) => {
      const b = COURSE[(i + 1) % COURSE.length], t = 0.3 + 0.4*R(), lat = (R() - 0.5)*12;
      const d = vNorm([b[0] - a[0], 0, b[1] - a[1]]);
      return [a[0] + (b[0] - a[0])*t - d[2]*lat, 3 + R()*(diff().ringSpan ?? 12), a[1] + (b[1] - a[1])*t + d[0]*lat];   // Höhe 3 m bis 3 m + ringSpan
    });
    const list = framesFromCenters(cs);
    if (ringLayoutOk(list)) return list;
  }
  return framesFromCenters(COURSE.map((_, i) => segMid(i)));
}

// Slalom: 5 Stangen auf einem geraden Kursabschnitt ohne Pfeiler, zufällig versetzt; Seiten wechseln sich ab.
export const SLALOM_H = 4;   // Stangenhöhe in m
export const poles = [];
let poleCols = [];
export function slalomLayoutOk(list) {
  return list.every((g, k) => {
    if (!clearOf(g.c, 2)) return false;
    for (let w = 1; w <= 8; w++) for (const y of [1, 3]) {   // Durchflug-Fenster auf der richtigen Seite frei
      if (!clearOf([g.c[0] + g.r[0]*g.side*w, y, g.c[2] + g.r[2]*g.side*w], 0.8)) return false;
    }
    const nx = list[k + 1];
    if (!nx) return true;
    const pa = [g.c[0] + g.r[0]*g.side*3, 2, g.c[2] + g.r[2]*g.side*3], pb = [nx.c[0] + nx.r[0]*nx.side*3, 2, nx.c[2] + nx.r[2]*nx.side*3];
    return pathClear(pa, pb, 1.0);
  });
}
function makeSlalom(R) {
  const segs = [0, 2, 3, 5, 7];   // Abschnitte ohne Pfeiler
  for (let attempt = 0; attempt < 200; attempt++) {
    const i = segs[Math.floor(R()*segs.length)], A = COURSE[i], B = COURSE[(i + 1) % COURSE.length];
    const n = vNorm([B[0] - A[0], 0, B[1] - A[1]]), r = [-n[2], 0, n[0]], yaw = Math.atan2(-n[0], -n[2]);
    const first = R() < 0.5 ? 1 : -1;
    const list = [0, 1, 2, 3, 4].map(k => {
      const t = 0.18 + k*0.16 + (R() - 0.5)*0.05, lat = (R() - 0.5)*3;
      return { c: [A[0] + (B[0] - A[0])*t + r[0]*lat, SLALOM_H/2, A[1] + (B[1] - A[1])*t + r[2]*lat], n, r, yaw, side: k % 2 ? -first : first };
    });
    if (slalomLayoutOk(list)) return list;
  }
  const A = COURSE[0], B = COURSE[1], n = vNorm([B[0] - A[0], 0, B[1] - A[1]]);
  return [0.2, 0.35, 0.5, 0.65, 0.8].map((t, k) => ({ c: [A[0] + (B[0] - A[0])*t, SLALOM_H/2, A[1] + (B[1] - A[1])*t], n, r: [-n[2], 0, n[0]], yaw: Math.atan2(-n[0], -n[2]), side: k % 2 ? -1 : 1 }));
}
// Ringe in der echten Welt: ein Kurs je km² (Nutzer, Prompt 171; ersetzt die zwei Kurse aus Prompt 166). 8 Ringe zufällig im Gebiet,
// 40 bis 420 m vom Start, 3 bis 18 m über dem Boden, reihum; zwischen den Ringen fliegt man auch über Häuser, frei sein müssen nur
// je 15 m An- und Abflug. Den nächsten Ring zeigt die Zielraute. Findet der Dienst keine Kette, Kreis hoch über dem Start.
export const RING_REAL = { rMin: 40, rMax: 420, hMin: 3, hMax: 18, dMin: 40, dMax: 360, approach: 15, retry: 12 };
export function ringsReal(R) {
  const W = placeReal(), c = game.home, cs = ringChain(W, c, 8, R, RING_REAL) || ringCircle(W, c, 8);
  return framesFromCenters(cs);
}
// Startwert für die Anordnung: null = bei jedem Start neu (Zufall), Zahl = feste Anordnung (Tests)
let layoutSeed = null;
export function setLayoutSeed(n) { layoutSeed = n; }
function newLayout() {
  const R = rng(layoutSeed ?? Math.floor(Math.random()*1e9));
  rings.length = 0; rings.push(...(rw.on ? ringsReal(R) : makeRings(R)));
  poles.length = 0; poles.push(...makeSlalom(R));
  poleCols = poles.map(p => ({ c: p.c, h: [0.08, SLALOM_H/2, 0.08], cs: 1, sn: 0 }));
  scen.version++;   // Modell neu bauen
}

// Paketlieferung: Abholplatz neben der Startgeraden, Lieferplattformen auf Kursabschnitten ohne Pfeiler (Reihenfolge zufällig).
export const PICKUP = [-5, 0, -12];
export const DROPS = [2, 3, 5, 7].map(i => { const a = COURSE[i], b = COURSE[(i + 1) % COURSE.length]; return [(a[0] + b[0])/2, 0, (a[1] + b[1])/2]; });
export const DELIVER_N = 3, DROP_R = 1.5;   // Lieferungen, Plattform-Radius in m
const DROP_HOLD = 0.8;                      // so lange tief und langsam über dem Platz schweben, in s
export const dropOrder = [];
// Verfolgung: Auto auf der inneren Runde, Tempo wechselt (Schätzung 5 bis 13 m/s, Schwierigkeit skaliert)
export const FOLLOW = { dMin: 4, dMax: 12, hMin: 1.5, hMax: 10, need: 30 };
// Wirkmittel im Taktischen Flug (Nutzer, Prompt 196): Sprengladung als Last unter der Drohne. Treffer (Landung auf dem Ziel oder
// Berührung) zündet sie: Ziel getroffen, Explosion, die Drohne ist verbraucht. Ein Absturz zündet sie ohne Treffer. Nach delay
// Sekunden startet eine neue Drohne mit vollem Akku und neuer Ladung; Zeit und Treffer laufen weiter. mass: Anteil der Drohnenmasse
// (Schätzung: Last etwa ein Drittel der Startmasse); fx: Dauer der Explosion im Bild (s). Nur Darstellung und Spiel, keine Wirkung.
export const CHARGE = { mass: 0.3, delay: 1.5, fx: 1.4 };
export const booms = [];   // Explosionen für die Darstellung: { p, t (performance.now) }
export const chargeOn = () => cfg.flight === 'tactical' && cfg.warhead === 'charge' && ['hunt', 'hunt2', 'hunt3'].includes(scen.id) && !diff().balloons;
export function chargeBoom(p) { booms.push({ p: p.slice(), t: performance.now() }); while (booms.length > 8) booms.shift(); }
// Nach dem Zünden: neue Drohne fällig? Liefert true, wenn jetzt eine neue Drohne starten soll (Aufrufer setzt sie an den Start).
export function chargeDue(now = performance.now()) {
  return chargeOn() && game.state === 'crashed' && !st.done && now - (game.sim.crashT || 0) > CHARGE.delay*1000;
}
export function chargeNext() { st.drones++; game.tries++; game.payload = CHARGE.mass*PHYS.mass; }
export const chargeDrones = () => st.drones;
const lead = { s: 0, t: 0, x: 0, y: 0, z: 0, yaw: 0, ok: false, dist: 0, trail: [], trailT: 0, route: null };
// Echte Welt (S3): Fahrzeuge der Jagd auf den Straßen (3 geparkt, 4 fahrend) und das Auto der Verfolgung auf einem langen Weg,
// der 30 bis 150 m vom Startplatz beginnt. Ohne Straßen leer (das Menü sperrt die Modi dann).
export function vehLayoutReal(R) {
  const G = rwRoads(), h = rw.meta.home;
  return G ? { parked: parkSpots(G, h, 3, R), routes: roadRoutes(G, h, 4, R) } : { parked: [], routes: [] };
}
export function leadRouteReal(R) {
  const G = rwRoads(); if (!G) return null;
  return roadRoutes(G, rw.meta.home, 1, R, { min: 2000, max: 3500, d0: 30, d1: 150 })[0] || roadRoutes(G, rw.meta.home, 1, R, { min: 1500, max: 3000, d0: 0, d1: 400 })[0] || null;
}
export const followLead = () => lead;

// Landeplattform: Mitte des Abschnitts von Tor 3 zu Tor 4, flach am Boden. In der echten Welt ein flacher Platz (T3); c[1] = Boden.
export const PAD = { c: [72.5, 0, -45] };
const PAD_MAP = PAD.c.slice(), PICKUP_MAP = PICKUP.slice(), DROPS_MAP = DROPS.map(d => d.slice());

/* ---------- Echte Welt: Aufstellung über den Platzierungsdienst (Etappe T3) ---------- */
// Ziel-Drohnen: 6 Bereiche 40 bis 320 m um den Start, 9 bis 16 m über dem Boden; die drei mit fester Strecke nur dort, wo die
// ganze Strecke 2,5 m frei und 4 m über dem Boden ist. Dazu 3 Schweber. Findet der Dienst weniger, gibt es weniger Ziele.
export function huntLayoutReal(R) {
  const W = placeReal(), h = game.home, regions = [], statics = [];
  for (let i = 0; i < HUNT_N; i++) for (let k = 0; k < 40; k++) {
    const p = freeAir(W, h, 40, 320, 9, 16, 3, R, 10);
    if (!p || regions.some(q => Math.hypot(p[0] - q[0], p[2] - q[2]) < 2*REGION)) continue;
    if (huntRoutePts(i, p).every(q => W.free(q, 2.5) && q[1] > W.groundH(q[0], q[2]) + 4)) { regions.push(p); break; }
  }
  for (let k = 0; k < 60 && statics.length < 3; k++) {
    const p = freeAir(W, h, 30, 280, 8, 14, 2, R, 10);
    if (p && [...regions, ...statics].every(q => Math.hypot(p[0] - q[0], p[2] - q[2]) > 20)) statics.push(p);
  }
  return { regions, statics, gh: solidH, free: W.free };
}
// Luftziele: Starrflügler als Achte (zwei Kreise mit 60 m, die sich berühren) und als Kreis mit 120 m um den Start, je 25 m über
// dem höchsten Boden und frei; der Kreis mindestens 7 m über der Achte (wie auf der Spielkarte). Hubschrauber 18 bis 30 m, Sechs-
// Rotoren 17 bis 22 m über dem Boden mit freien Wegen. Fehlt eine Strecke, fehlt das Ziel.
export function airLayoutReal(R) {
  const W = placeReal(), h = game.home, B = W.bounds, cx = Math.min(B[2] - 140, Math.max(B[0] + 140, h[0])), cz = Math.min(B[3] - 70, Math.max(B[1] + 70, h[1]));
  const A = airCircle(W, [cx - 60, cz], 60), C = airCircle(W, [cx + 60, cz], 60), E = airCircle(W, h, 120), alt8 = Math.max(A.alt, C.alt);
  const planes = [{ loops: [[A.c[0], A.c[1], 60, 1], [C.c[0], C.c[1], 60, -1]], alt: alt8, speed: 14 },
    { loops: [[E.c[0], E.c[1], 120, -1]], alt: Math.max(E.alt, alt8 + 7), speed: 15 }];
  const rotors = [];
  for (const [kind, n, o] of [['heli', 4, { hMin: 18, hMax: 30 }], ['heli', 4, { hMin: 18, hMax: 30 }], ['hexa', 3, { hMin: 17, hMax: 22, rMax: 200 }], ['hexa', 3, { hMin: 17, hMax: 22, rMax: 200 }]]) {
    const wps = airWaypoints(W, h, n, R, o);
    if (wps) rotors.push([kind, wps]);
  }
  return { planes, rotors, gh: solidH };
}
// Plätze: Landeplatz 60 bis 150 m vom Start (Rückfall 15 bis 400 m), Abholplatz 10 bis 30 m, 4 Lieferplätze 60 bis 200 m, je
// 25 m auseinander. Halbe Breite 3 m (größte Stufe), damit derselbe Platz für jede Stufe passt. Ohne Fund: neben dem Start.
function spotReal(W, R, rMin, rMax, need, away = []) {
  const ok = p => p && away.every(q => Math.hypot(p[0] - q[0], p[2] - q[2]) > 25);
  for (let k = 0; k < 6; k++) { const p = flatSpot(W, game.home, rMin, rMax, 3, need, R, 100); if (ok(p)) return p; }
  for (let k = 0; k < 6; k++) { const p = flatSpot(W, game.home, 15, 400, 3, need, R, 100); if (ok(p)) return p; }
  const x = game.home[0] + 8 + 6*away.length, z = game.home[1];
  return [x, solidH(x, z), z];
}
function spotsReal(R) {
  const W = placeReal();
  if (scen.id === 'landing') { const p = spotReal(W, R, 60, 150, 6); PAD.c[0] = p[0]; PAD.c[1] = p[1]; PAD.c[2] = p[2]; }
  if (scen.id === 'deliver') {
    const pk = spotReal(W, R, 10, 30, 4), ds = [];
    for (let i = 0; i < 4; i++) ds.push(spotReal(W, R, 60, 200, 5, [pk, ...ds]));
    PICKUP.splice(0, 3, ...pk); ds.forEach((d, i) => DROPS[i].splice(0, 3, ...d));
  }
}
function spotsMap() { PAD.c.splice(0, 3, ...PAD_MAP); PICKUP.splice(0, 3, ...PICKUP_MAP); DROPS_MAP.forEach((d, i) => DROPS[i].splice(0, 3, ...d)); }
const LAND_HOLD = 1.0;         // so lange ruhig stehen, in s

/* ---------- Ablauf ---------- */
const st = { drones: 1, hits: 0, score: 0, carry: false, deliv: 0, inBand: 0, done: false, takeoff: null, onPad: false, hard: false, hold: 0, vPrev: [0, 0, 0] };
function reset() {
  task.gateExtra = diff().gateExtra || 0;   // Tor-Toleranz nach Stufe
  if (scen.id === 'rings' || scen.id === 'slalom' || !rings.length) newLayout();
  st.carry = false; st.deliv = 0; st.inBand = 0; game.payload = 0; st.drones = 1; booms.length = 0;
  if (chargeOn()) game.payload = CHARGE.mass*PHYS.mass;   // Sprengladung unter der Drohne (schwerer)
  if (rw.on) spotsReal(rng(layoutSeed ?? Math.floor(Math.random()*1e9))); else spotsMap();
  scen.version++;
  if (scen.id === 'deliver') {   // zufällige Reihenfolge von 3 der 4 Plattformen
    const idx = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    dropOrder.length = 0; dropOrder.push(...idx.slice(0, DELIVER_N));
    scen.version++;
  }
  st.hits = 0; const lr = () => rng(layoutSeed ?? Math.floor(Math.random()*1e9));
  if (scen.id === 'follow') { lead.s = 0; lead.t = 0; lead.trail = []; lead.trailT = 0; lead.route = rw.on ? leadRouteReal(lr()) : null; const r = routeAt(lead.route || ROUTES[0], 0); lead.x = r.x; lead.y = r.y; lead.z = r.z; lead.yaw = r.yaw; }
  if (scen.id === 'hunt') initTargets(diff().huntSpeed, rw.on ? huntLayoutReal(lr()) : null); if (scen.id === 'hunt2') initVehicles(diff().huntSpeed, rw.on ? vehLayoutReal(lr()) : null); if (scen.id === 'hunt3') initAircraft(diff().huntSpeed, rw.on ? airLayoutReal(lr()) : null); st.score = 0; st.done = false; st.takeoff = null; st.onPad = false; st.hard = false; st.hold = 0; st.vPrev = [0, 0, 0]; }
export function scenDone() { return st.done; }
// Mission erfüllt (Prompt 197): 2,5 s nach dem Ziel steht alles still (game.state 'done'), die Anzeige nennt Zeit und Versuche;
// Neustart (R, Tippen) beginnt eine neue Mission mit Versuch 1. Gilt für alle Aufgaben mit Ziel. Liefert true beim Umschalten.
export const MISSION = { hold: 2.5 };
export function missionEnd(now = performance.now()) {
  if (!st.done || game.state !== 'fly') { if (!st.done) st.doneT = 0; return false; }
  if (!st.doneT) st.doneT = now;
  if (now - st.doneT < MISSION.hold*1000) return false;
  game.state = 'done'; return true;
}

// Schnittpunkt der Strecke a->b mit der Ebene durch c (Normale n), nur in Richtung n.
function crossed(a, b, c, n) {
  const da = vDot(vSub(a, c), n), db = vDot(vSub(b, c), n);
  if (!(da < 0 && db >= 0)) return null;
  return vAdd(a, vScale(vSub(b, a), da/(da - db)));
}
function finish(time) {
  const s = game.sim;
  s.lastLap = time; s.lapStart = null; st.done = true;
  if (bestOk() && (game.best === null || time < game.best)) { game.best = time; saveBest(); banner('AUFGABE ERFÜLLT', 'Neue Bestzeit ' + fmtTime(time), 4); fx.beep(1320, 0.25); }
  else banner('AUFGABE ERFÜLLT', fmtTime(time), 4);
}
function advance(count) {
  const s = game.sim;
  if (s.next === 0) { s.lapStart = s.t; say('Zeit läuft', 1.2); }
  fx.beep(880 + s.next*40, 0.09);
  s.next++;
  if (s.next === count) finish(s.t - s.lapStart);
}

const ringPassed = (g, a, b) => { const p = crossed(a, b, g.c, g.n); if (!p) return false; const d = vSub(p, g.c); return vLen(vSub(d, vScale(g.n, vDot(d, g.n)))) < diff().ringR - ringTube(); };
function checkRing(a, b) {
  if (st.done) return;
  if (ringPassed(rings[game.sim.next], a, b)) advance(rings.length);
}
function collideRings(h) {
  const s = game.sim, lim = ringTube() + PHYS.radius;
  for (const g of rings) {
    const d = vSub(s.p, g.c);
    if (vLen(d) > diff().ringR + lim) continue;
    const inPlane = vSub(d, vScale(g.n, vDot(d, g.n))), l = vLen(inPlane);
    if (l < 1e-6) continue;
    const dv = vSub(d, vScale(inPlane, diff().ringR/l)), dist = vLen(dv);   // Abstand zur Rohrmitte
    if (dist < lim && dist > 1e-9 && contact(vScale(dv, 1/dist), lim - dist, h)) return true;
  }
  return false;
}

function checkPole(a, b) {
  if (st.done) return;
  const g = poles[game.sim.next], p = crossed(a, b, g.c, g.n);
  if (!p) return;
  const lat = vDot(vSub(p, g.c), g.r);
  if (Math.abs(lat) > diff().slalomW || p[1] > SLALOM_H + 0.5) return;
  if (lat*g.side > 0) advance(poles.length);
  else say('Falsche Seite', 1.2);
}
function collidePoles(h) {
  for (const c of poleCols) if (collide(c, h)) return true;
  return false;
}

function checkLanding(a, b, h) {
  const s = game.sim;
  landAid(s, h);
  if (st.done) return;
  if (st.takeoff === null && !s.grounded) { st.takeoff = s.t; s.lapStart = s.t; }
  const onPad = s.p[1] - PHYS.foot - PAD.c[1] < 0.03 && Math.abs(s.p[0] - PAD.c[0]) < diff().padHalf && Math.abs(s.p[2] - PAD.c[2]) < diff().padHalf;
  if (onPad && !st.onPad && st.takeoff !== null) {
    const hard = vLen(st.vPrev) > diff().landV;
    st.hard = st.hard || hard;   // einmal zu hart bleibt zu hart, bis die Drohne wieder abhebt
    if (hard) say('Zu hart aufgesetzt', 1.5);
  }
  if (onPad && !st.hard && st.takeoff !== null && vLen(s.v) < 0.3) {
    st.hold += h;
    if (st.hold >= LAND_HOLD) finish(s.t - st.takeoff);
  } else st.hold = 0;
  if (s.p[1] - PHYS.foot - PAD.c[1] > 0.2) st.hard = false;   // nach hartem Aufsetzen erst wieder abheben (Abpraller zählen nicht)
  st.onPad = onPad; st.vPrev = s.v.slice();
}

// Jagd: Ziele bewegen sich im Physikschritt; Zeit läuft ab dem Abheben, Ziel nach cfg.huntX Treffern
export const huntTotal = () => scen.id === 'hunt2' ? (vehicles.length || 7) : scen.id === 'hunt3' ? (aircraft.length || 6) : (targets.length || 9);
export const huntNeed = () => Math.min(cfg.huntX || 5, huntTotal());
function checkHunt(a, b, h) {
  const s = game.sim;
  if (st.takeoff === null && !s.grounded) { st.takeoff = s.t; s.lapStart = s.t; }
  const bal = !!diff().balloons;
  let n, pts = 0;
  if (scen.id === 'hunt3') { const left = aircraftLeft(); pts = stepAircraft(h, a, b, bal); n = left - aircraftLeft(); st.score += pts; }   // Punkte je Art
  else n = scen.id === 'hunt2' ? stepVehicles(h, a, b, PHYS.radius, bal) : stepTargets(h, a, b, b, bal);
  if (!n || st.done) return;
  st.hits += n;
  if (bal) fx.pop(); else fx.beep(1100, 0.12);
  if (st.hits >= huntNeed()) finish(s.t - (st.takeoff ?? s.t));
  else banner(bal ? 'BALLON GETROFFEN' : 'ZIEL GETROFFEN', st.hits + ' / ' + huntNeed() + (pts ? '  +' + pts + ' Punkte' : ''));
  if (chargeOn()) { chargeBoom(s.p); if (!st.done) { crash('Wirkmittel im Ziel umgesetzt'); game.crashes--; } else fx.crash(); return; }   // Treffer ist kein Absturz   // Ladung gezündet, Drohne verbraucht
  if (!bal) game.pendingRespawn = true;   // Drohne startet neu am Startplatz, kein Einschlag nach dem Anflug. Mit Ballons: weiterfliegen
}

// Paketlieferung: tief (unter 1,2 m) und langsam (unter 2,5 m/s) über dem Platz schweben
function checkDeliver(a, b, h) {
  const s = game.sim;
  if (st.done) return;
  if (st.takeoff === null && !s.grounded) { st.takeoff = s.t; s.lapStart = s.t; }
  const tgt = st.carry ? DROPS[dropOrder[st.deliv]] : PICKUP;
  landAid(s, h);
  const over = Math.hypot(s.p[0] - tgt[0], s.p[2] - tgt[2]) < dropR(), alt = s.p[1] - PHYS.foot - tgt[1];
  const near = over && alt < 1.2 && vLen(s.v) < 2.5;
  const drop = st.carry && diff().flyDrop && over && alt < 12;   // Leicht: Abwurf im Überflug
  st.hold = near ? st.hold + h : 0;
  if (st.hold < DROP_HOLD && !drop) return;
  st.hold = 0;
  if (!st.carry) {
    st.carry = true; game.payload = 0.25*PHYS.mass;   // Paket: ein Viertel der Drohnenmasse (Schätzung)
    banner('PAKET AUFGENOMMEN', 'Lieferung ' + (st.deliv + 1) + ' / ' + DELIVER_N, 2); fx.beep(990, 0.12);
  } else {
    st.carry = false; game.payload = 0; st.deliv++; fx.beep(1180, 0.15);
    if (st.deliv >= DELIVER_N) finish(s.t - st.takeoff);
    else banner(drop ? 'PAKET ABGEWORFEN' : 'GELIEFERT', st.deliv + ' / ' + DELIVER_N, 2);
  }
}
// Verfolgung: Auto fährt los, sobald die Drohne abhebt; Zeit im Abstandsband zählt
function checkFollow(a, b, h) {
  const s = game.sim;
  if (st.done) return;
  if (st.takeoff === null && !s.grounded) { st.takeoff = s.t; s.lapStart = s.t; }
  if (st.takeoff !== null) {
    lead.t += h;
    lead.s += (9 + 4*Math.sin(lead.t*0.25))*(diff().followSpeed ?? diff().huntSpeed)*h;
    const r = routeAt(lead.route || ROUTES[0], lead.s); lead.x = r.x; lead.y = r.y; lead.z = r.z; lead.yaw = r.yaw;
    if (diff().leadTrail && (!lead.trail.length || lead.t - lead.trailT > 0.2)) {   // Leuchtspur: alle 0,2 s ein Punkt, höchstens 8 s
      lead.trail.push([lead.x, lead.y + 0.4, lead.z]); lead.trailT = lead.t; if (lead.trail.length > 40) lead.trail.shift();
    }
  }
  lead.dist = Math.hypot(s.p[0] - lead.x, s.p[2] - lead.z);
  const alt = s.p[1] - PHYS.foot - lead.y;   // Höhe über der Straße des Autos (echte Welt: Gelände)
  lead.ok = st.takeoff !== null && lead.dist >= FOLLOW.dMin && lead.dist <= (diff().followMax || FOLLOW.dMax) && alt >= FOLLOW.hMin && alt <= FOLLOW.hMax;
  if (lead.ok) st.inBand += h;
  if (st.inBand >= FOLLOW.need) finish(s.t - st.takeoff);
}
export const deliverState = () => ({ carry: st.carry, deliv: st.deliv, inBand: st.inBand });

const TASKS = {
  gates:   { check: checkGate, collide: null },
  rings:   { check: checkRing, collide: collideRings },
  slalom:  { check: checkPole, collide: collidePoles },
  landing: { check: checkLanding, collide: null },
  hunt:    { check: checkHunt, collide: null, early: true },
  hunt2:   { check: checkHunt, collide: null, early: true },
  hunt3:   { check: checkHunt, collide: null, early: true },
  deliver: { check: checkDeliver, collide: null },
  follow:  { check: checkFollow, collide: null },
  free:    { check() {}, collide: null },
  vbs:     { check() {}, collide: null },
  real:    { check() {}, collide: null }
};
task.reset = reset;

// Szenario wählen. Danach respawn() aufrufen. real: in der echten Welt (Freiflug „real“ immer; Ringe ab Etappe T2)
export function setScenario(id, real = id === 'real') {
  if (!TASKS[id]) id = 'gates';
  game.tries = 0;   // neue Mission: der nächste Start ist Versuch 1
  scen.id = id; scen.version++;
  // Echte Welt nur mit geladenem Gelände; Start auf der flachsten Stelle (Werkzeug), Nase zur Mitte des Gebiets (Altstadt)
  rw.on = real && rw.ready;
  if (rw.on && (id === 'rings' || id === 'slalom')) rings.length = 0;   // neue Anordnung beim nächsten Neustart (reset)
  game.home = rw.on ? rw.meta.home.slice() : id === 'free' ? TOWN.start.slice() : id === 'vbs' ? DIS_PREVIEW.home.slice() : [0, 0];   // Startpunkt im Freiflug (TOWN.start), der Pilot steht dort
  game.homeYaw = rw.on ? Math.atan2(game.home[0], game.home[1]) : 0;
  const pp = placePilot(); PILOT[0] = pp[0]; PILOT[1] = pp[1] + PILOT_POS.antenna; PILOT[2] = pp[2];   // Signal geht von der Funke des Piloten aus
  game.bestScen = id === 'real' || !rw.on ? id : id + '.real';   // Bestzeit je Welt
  task.check = TASKS[id].check; task.collide = TASKS[id].collide; task.early = !!TASKS[id].early;
  loadBest();
}

/* ---------- Anzeige ---------- */
// Aufgabe mit Ziel (nicht Freiflug, echte Welt frei, DIS-Grundtypen): dort zählt das OSD die Versuche (Prompt 197)
export const scenHasGoal = () => !['free', 'real', 'vbs'].includes(scen.id);
export function scenLabel() {
  const s = game.sim;
  if (scen.id === 'gates') return `TOR ${s.next + 1}/${gates.length}`;
  if (scen.id === 'free') return 'FREIFLUG';
  if (scen.id === 'vbs') return 'DIS-GRUNDTYPEN';
  if (scen.id === 'real') { const n = osdOn(cfg.osd, 'place') ? rwNearName(s.p[0], s.p[2]) : '', m = cfg.verbund ? 'DIS' : 'ECHTE WELT'; return n ? m + ' · ' + n.toUpperCase() : m; }   // DIS-Modus: echte Welt im Verbund
  if (scen.id === 'deliver') return st.done ? 'ZIEL' : st.carry ? `LIEFERN ${st.deliv + 1}/${DELIVER_N}` : `PAKET HOLEN ${st.deliv + 1}/${DELIVER_N}`;
  if (scen.id === 'follow') return st.done ? 'ZIEL' : `FOLGEN ${Math.floor(st.inBand)}/${FOLLOW.need}S ${lead.ok ? 'OK' : Math.round(lead.dist) + 'M'}`;
  if (scen.id === 'hunt' || scen.id === 'hunt2' || scen.id === 'hunt3') return st.done ? 'ZIEL' : `${diff().balloons ? 'BALLONS' : 'TREFFER'} ${st.hits}/${huntNeed()}` + (scen.id === 'hunt3' ? ` ${st.score}P` : '');
  if (st.done) return scen.id === 'landing' ? 'GELANDET' : 'ZIEL';
  if (scen.id === 'rings') return `RING ${s.next + 1}/${rings.length}`;
  if (scen.id === 'slalom') return `SLALOM ${s.next + 1}/${poles.length} ${poles[s.next].side > 0 ? 'RECHTS' : 'LINKS'}`;
  return 'LANDEN';
}
// Punkt für den Zielmarker im OSD, oder null.
export function scenTarget() {
  const s = game.sim;
  if (scen.id === 'gates') return gates[s.next] ? gates[s.next].c : null;
  if (st.done || scen.id === 'free' || scen.id === 'vbs' || scen.id === 'real') return null;   // Freiflug: kein Ziel (vorher zeigte die echte Welt auf den Landeplatz der Spielkarte)
  if (scen.id === 'deliver') { const t = st.carry ? DROPS[dropOrder[st.deliv]] : PICKUP; return [t[0], t[1] + 0.6, t[2]]; }
  if (scen.id === 'follow') return [lead.x, lead.y + 1.5, lead.z];
  if (scen.id === 'hunt2') {   // nächstes noch nicht getroffenes Fahrzeug
    let best = null, bd = 1e9;
    for (const v of vehicles) if (v.state !== 'hit') { const d = Math.hypot(v.x - s.p[0], v.z - s.p[2]); if (d < bd) { bd = d; best = [v.x, v.y + VEH_HALF[1]*2, v.z]; } }
    return best;
  }
  if (scen.id === 'hunt3') {   // nächstes noch fliegendes Luftziel
    let best = null, bd = 1e9;
    for (const t of aircraft) if (t.state === 'fly') { const d = vLen(vSub(t.p, s.p)); if (d < bd) { bd = d; best = t.p; } }
    return best;
  }
  if (scen.id === 'hunt') {   // nächstes noch fliegendes Ziel
    let best = null, bd = 1e9;
    for (const t of targets) if (t.state === 'fly') { const d = vLen(vSub(t.p, s.p)); if (d < bd) { bd = d; best = t.p; } }
    return best;
  }
  if (scen.id === 'rings') return rings[s.next].c;
  if (scen.id === 'slalom') { const g = poles[s.next]; return [g.c[0] + g.r[0]*g.side*2, 2, g.c[2] + g.r[2]*g.side*2]; }
  return [PAD.c[0], PAD.c[1] + 0.5, PAD.c[2]];
}
// Welches Teil des Szenario-Modells grün leuchtet, oder -1.
export function scenHighlight() {
  if (st.done || scen.id === 'gates' || scen.id === 'free' || scen.id === 'vbs') return -1;
  if (scen.id === 'deliver') return st.carry ? 1 + st.deliv : 0;
  if (scen.id === 'follow') return -1;
  return scen.id === 'landing' ? 0 : game.sim.next;
}

/* ---------- Modell ---------- */
// Viereck mit Normale passend zu out (nach außen).
function quadOut(mb, a, b, c, d, out, col) {
  if (vDot(vCross(vSub(b, a), vSub(c, a)), out) < 0) mb.quad(a, d, c, b, col); else mb.quad(a, b, c, d, col);
}
function torus(mb, g, col) {
  const U = 40, V = 8;
  const at = (u, v) => {
    const cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v);
    const radial = vAdd(vScale(g.e1, cu), vScale(g.e2, su));
    const tb = ringTube();
    return { p: vAdd(g.c, vAdd(vScale(radial, diff().ringR + tb*cv), vScale(g.n, tb*sv))),
             o: vAdd(vScale(radial, cv), vScale(g.n, sv)) };
  };
  for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) {
    const u0 = i/U*Math.PI*2, u1 = (i+1)/U*Math.PI*2, v0 = j/V*Math.PI*2, v1 = (j+1)/V*Math.PI*2;
    const m = at((u0+u1)/2, (v0+v1)/2);
    quadOut(mb, at(u0, v0).p, at(u1, v0).p, at(u1, v1).p, at(u0, v1).p, m.o, col);
  }
}
// Modell der Szenario-Elemente: Vertexdaten und je Element ein Teil (start, count).
export function buildScenario() {
  const mb = new MeshBuilder(), parts = [];
  const part = f => { const start = mb.count; f(); parts.push({ start, count: mb.count - start }); };
  if (scen.id === 'rings') for (const g of rings) part(() => torus(mb, g, [1.0, 0.72, 0.1]));
  if (scen.id === 'slalom') for (const g of poles) part(() => {
    mb.box(g.c, [0.08, SLALOM_H/2, 0.08], g.yaw, [0.92, 0.92, 0.9]);
    const fc = [g.c[0] + g.r[0]*g.side*0.33, SLALOM_H - 0.25, g.c[2] + g.r[2]*g.side*0.33];
    mb.box(fc, [0.25, 0.18, 0.015], g.yaw, g.side > 0 ? [0.15, 0.4, 1.0] : [0.95, 0.15, 0.12]);
  });
  if (scen.id === 'deliver') {   // Teil 0: Abholplatz (orange, mit Paketstapel), Teile 1..3: Lieferplattformen in Reihenfolge (blau)
    const plate = (c, col) => {
      mb.box([c[0], c[1] + 0.003, c[2]], [dropR(), 0.003, dropR()], 0, col);   // flache Platten: Drohne steht physikalisch auf dem Boden (c[1])
      mb.box([c[0], c[1] + 0.007, c[2]], [dropR()*0.8, 0.001, dropR()*0.8], 0, [0.92, 0.92, 0.92]);
    };
    part(() => { plate(PICKUP, [1.0, 0.5, 0.1]); for (let k = 0; k < 3; k++) mb.box([PICKUP[0] + (k - 1)*0.5, PICKUP[1] + 0.106, PICKUP[2]], [0.18, 0.1, 0.18], k*0.4, [0.62, 0.45, 0.28]); });
    for (const i of dropOrder) part(() => plate(DROPS[i], [0.15, 0.4, 0.95]));
  }
  if (scen.id === 'landing') part(() => {
    const [x, y, z] = PAD.c, w = diff().padHalf, white = [0.95, 0.95, 0.95], orange = [1.0, 0.42, 0.08];
    mb.box([x, y + 0.003, z], [w, 0.003, w], 0, [0.25, 0.27, 0.3]);
    for (const [dx, dz, hx, hz] of [[0, -w, w, 0.05], [0, w, w, 0.05], [-w, 0, 0.05, w], [w, 0, 0.05, w]]) mb.box([x+dx, y + 0.007, z+dz], [hx, 0.001, hz], 0, orange);
    const k = w/1.0;   // H-Markierung mit der Plattform skalieren
    mb.box([x-0.3*k, y + 0.007, z], [0.06*k, 0.001, 0.45*k], 0, white);
    mb.box([x+0.3*k, y + 0.007, z], [0.06*k, 0.001, 0.45*k], 0, white);
    mb.box([x, y + 0.007, z], [0.3*k, 0.001, 0.06*k], 0, white);
  });
  return { data: new Float32Array(mb.d), parts };
}
