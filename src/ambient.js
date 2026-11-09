/* Belebung der echten Welt (Nutzer, Prompt 178): Gänse in V-Formation und kleine Vogelschwärme ab und zu, kreisende Greifvögel,
   Verkehrsflugzeuge hoch am Himmel mit Kondensstreifen. Nur in der echten Welt und nicht in der DIS-Übung (dort zählt nur der
   Inhalt des Partners). Kein Einfluss auf die Physik, keine Kollision. Wenig Rechenzeit: höchstens ein Schwarm zugleich, die
   Flugzeuge zeichnet der Himmel-Shader (nur Richtungen, keine Modelle). Alle Zahlen sind Schätzungen für ein ruhiges Bild.
   Ohne DOM, in Node testbar. */
import { rw, groundH } from './realworld.js';
import { cfg } from './state.js';
import { MeshBuilder } from './world.js';

// jets: höchstens gleichzeitig; jetH Flughöhe (m), jetV Tempo (m/s, Reiseflug etwa 830 km/h), jetLen Länge des Kondensstreifens (m),
// jetSpan Strecke über den Himmel (m), jetGap Pause bis zum nächsten (s). flockGap Pause zwischen Schwärmen (s).
export const AMB = { jets: 2, jetH: [9000, 11500], jetV: 230, jetLen: [4000, 14000], jetSpan: 70000, jetGap: [15, 90],
  flockGap: [35, 100], goose: [7, 13], swarm: [16, 28], raptors: 2,
  // Heißluftballon (L2): Pause (s), Tempo mit dem Wind (m/s), Höhe über dem Boden (m), Strecke (m). Segelflieger: Kreisradius (m),
  // Höhe über dem Boden (m), Tempo (m/s), Kreise je Thermik, neue Thermik 300 bis 700 m von der Drohne. Alles Schätzungen.
  balloonGap: [180, 480], balloonV: [3, 5], balloonH: [120, 350], balloonLen: 2500,
  gliderR: [60, 120], gliderH: [150, 300], gliderV: 25, gliderLaps: [2, 4], gliderNext: [300, 700] };
export const amb = { jets: [], flock: null, raptors: [], birds: [], tFlock: 0, tJet: 0, balloon: null, tBalloon: 0, glider: null };
// Wind: dieselbe Richtung wie bei den Baumkronen (Vertex-Shader, (0,9 / 0,35) in x Ost, z Süd)
export const AMB_WIND = (() => { const l = Math.hypot(0.9, 0.35); return [0.9/l, 0, 0.35/l]; })();
export const BALLOON_COLS = [[0.85, 0.15, 0.12], [0.95, 0.75, 0.1], [0.15, 0.35, 0.75], [0.2, 0.6, 0.3]];
export const ambOn = () => rw.on && !cfg.verbund;
const rr = (rand, a) => a[0] + (a[1] - a[0])*rand();
const gh = (x, z) => rw.on ? groundH(x, z) : 0;

function newJet(c, rand) {
  const a = rand()*2*Math.PI, dir = [Math.cos(a), 0, Math.sin(a)], side = [-dir[2], 0, dir[0]], off = (rand() - 0.5)*30000;
  const p = [c[0] - dir[0]*AMB.jetSpan/2 + side[0]*off, rr(rand, AMB.jetH), c[2] - dir[2]*AMB.jetSpan/2 + side[2]*off];
  return { p, dir, v: AMB.jetV*(0.9 + 0.2*rand()), len: rr(rand, AMB.jetLen), run: 0 };
}
// Schwarm: Weg 900 m als Gerade, die 80 bis 260 m an der Drohne vorbeiführt. Gänse in V-Formation (Keil nach vorn, 60 bis 110 m
// über dem Boden, 15 m/s), kleine Vögel als lockere Wolke (15 bis 40 m, 11 m/s, jedes Tier mit eigenem Wellenmuster).
function newFlock(c, rand) {
  const goose = rand() < 0.5, a = rand()*2*Math.PI, dir = [Math.cos(a), 0, Math.sin(a)], side = [-dir[2], 0, dir[0]], miss = (80 + 180*rand())*(rand() < 0.5 ? -1 : 1);
  const p = [c[0] - dir[0]*450 + side[0]*miss, 0, c[2] - dir[2]*450 + side[2]*miss], n = Math.round(rr(rand, goose ? AMB.goose : AMB.swarm));
  const mem = [];
  for (let i = 0; i < n; i++) {
    if (goose) { const k = Math.ceil(i/2), s = i % 2 ? 1 : -1; mem.push({ o: [s*k*2.6, 0, k*2.2], ph: rand()*6 }); }   // Keil: je Reihe 2,2 m zurück, 2,6 m seitlich
    else mem.push({ o: [(rand() - 0.5)*14, (rand() - 0.5)*6, (rand() - 0.5)*14], ph: rand()*6, f: 0.6 + rand()*0.8 });
  }
  return { goose, p, dir, side, v: goose ? 15 : 11, alt: goose ? 60 + 50*rand() : 15 + 25*rand(), run: 0, len: 900, mem };
}
// Greifvögel kreisen in der Thermik: Mitte bis 300 m von der Drohne, Radius 25 bis 45 m, 50 bis 90 m über dem Boden, 9 m/s.
function newRaptor(c, rand) {
  const a = rand()*2*Math.PI, d = 80 + 220*rand();
  return { c: [c[0] + Math.cos(a)*d, 0, c[2] + Math.sin(a)*d], r: 25 + 20*rand(), alt: 50 + 40*rand(), ang: rand()*6, dir: rand() < 0.5 ? 1 : -1, ph: rand()*6 };
}
// Neu beginnen (bei jedem Start). c: Startpunkt der Drohne.
export function ambInit(c, rand = Math.random) {
  amb.jets = []; amb.flock = null; amb.birds = [];
  amb.raptors = Array.from({ length: AMB.raptors }, () => newRaptor(c, rand));
  amb.tFlock = 8 + 20*rand(); amb.tJet = 0;
  amb.balloon = null; amb.tBalloon = 20 + 70*rand();   // erster Ballon nach 20 bis 90 s, danach alle 3 bis 8 Minuten
  amb.glider = rand() < 0.6 ? newGlider(c, rand) : null;
  if (rand() < 0.8) { const j = newJet(c, rand); j.run = (0.2 + 0.5*rand())*AMB.jetSpan; amb.jets.push(j); }   // meist ist schon eines am Himmel
}
// Heißluftballon: startet gegen den Wind vor der Drohne (Weg führt bis 400 m an ihr vorbei), zieht 2,5 km mit dem Wind
function newHotAir(c, rand) {
  const W = AMB_WIND, side = [-W[2], 0, W[0]], off = (rand() - 0.5)*800, L = AMB.balloonLen;
  const p0 = [c[0] - W[0]*L/2 + side[0]*off, 0, c[2] - W[2]*L/2 + side[2]*off];
  return { p0, p: p0.slice(), run: 0, v: rr(rand, AMB.balloonV), alt: gh(p0[0], p0[2]) + rr(rand, AMB.balloonH), ph: rand()*6, col: BALLOON_COLS[Math.floor(rand()*BALLOON_COLS.length)] };
}
// Segelflieger: kreist in einer Thermik, gleitet nach einigen Kreisen geradeaus zur nächsten
function newGlider(c, rand) {
  const a = rand()*2*Math.PI, d = rr(rand, AMB.gliderNext), m = [c[0] + Math.cos(a)*d, 0, c[2] + Math.sin(a)*d];
  const r = rr(rand, AMB.gliderR), ang = rand()*2*Math.PI;
  return { m, r, alt: gh(m[0], m[2]) + rr(rand, AMB.gliderH), ang, dir: rand() < 0.5 ? 1 : -1, left: rr(rand, AMB.gliderLaps)*2*Math.PI,
    p: [m[0] + Math.cos(ang)*r, 0, m[2] + Math.sin(ang)*r], yaw: 0, roll: 0, glide: null };
}
function stepGlider(G, h, c, rand) {
  const V = AMB.gliderV;
  if (G.glide) {   // geradeaus zur nächsten Thermik
    const d = [G.glide[0] - G.p[0], G.glide[2] - G.p[2]], l = Math.hypot(d[0], d[1]);
    if (l < G.r) { G.m = G.glide; G.glide = null; G.ang = Math.atan2(G.p[2] - G.m[2], G.p[0] - G.m[0]); G.left = rr(rand, AMB.gliderLaps)*2*Math.PI; }
    else { G.p[0] += d[0]/l*V*h; G.p[2] += d[1]/l*V*h; G.yaw = Math.atan2(-d[0], -d[1]); G.roll *= Math.max(0, 1 - 2*h); G.alt -= 1.0*h; }   // gleitet mit etwa 1 m/s Sinken
  }
  if (!G.glide) {
    const w = G.dir*V/G.r; G.ang += w*h; G.left -= Math.abs(w*h); G.alt += 1.5*h;   // in der Thermik etwa 1,5 m/s Steigen (Schätzung)
    G.p[0] = G.m[0] + Math.cos(G.ang)*G.r; G.p[2] = G.m[2] + Math.sin(G.ang)*G.r;
    const tx = -Math.sin(G.ang)*G.dir, tz = Math.cos(G.ang)*G.dir;   // Flugrichtung (Tangente)
    G.yaw = Math.atan2(-tx, -tz); G.roll += (-G.dir*Math.PI/6 - G.roll)*Math.min(1, 2*h);   // 30° Querneigung zur Mitte
    if (G.left <= 0) { const a = rand()*2*Math.PI, d = rr(rand, AMB.gliderNext); G.glide = [c[0] + Math.cos(a)*d, 0, c[2] + Math.sin(a)*d]; }
  }
  const g = gh(G.p[0], G.p[2]); G.alt = Math.min(Math.max(G.alt, g + AMB.gliderH[0]), g + AMB.gliderH[1] + 150); G.p[1] = G.alt;
}
// Ein Schritt. c: Position der Drohne. Füllt amb.birds für die Darstellung: { p, yaw, kind (3 Gans, 4 Greifvogel, 5 kleiner Vogel), flap, glide }
export function ambStep(h, c, rand = Math.random) {
  amb.birds.length = 0;
  if (!ambOn()) return;
  // Flugzeuge
  for (const j of amb.jets) j.run += j.v*h;
  amb.jets = amb.jets.filter(j => j.run < AMB.jetSpan);
  amb.tJet -= h;
  if (amb.jets.length < AMB.jets && amb.tJet <= 0) { amb.jets.push(newJet(c, rand)); amb.tJet = rr(rand, AMB.jetGap); }
  if (cfg.night) { amb.balloon = null; amb.glider = null; return; }   // nachts keine Schwärme, Greifvögel, Ballons, Segler (N1); Flugzeuge blinken
  // Heißluftballon
  amb.tBalloon -= h;
  if (!amb.balloon && amb.tBalloon <= 0) amb.balloon = newHotAir(c, rand);
  const B = amb.balloon;
  if (B) {
    B.run += B.v*h; B.ph += h;
    if (B.run > AMB.balloonLen) { amb.balloon = null; amb.tBalloon = rr(rand, AMB.balloonGap); }
    else { const x = B.p0[0] + AMB_WIND[0]*B.run, z = B.p0[2] + AMB_WIND[2]*B.run; B.p = [x, Math.max(B.alt + 12*Math.sin(B.ph*0.05), gh(x, z) + 60), z]; }
  }
  // Segelflieger: ist er weit weg, kreist er bald woanders
  if (amb.glider && Math.hypot(amb.glider.p[0] - c[0], amb.glider.p[2] - c[2]) > 2500) amb.glider = newGlider(c, rand);
  if (amb.glider) stepGlider(amb.glider, h, c, rand);
  // Schwarm
  amb.tFlock -= h;
  if (!amb.flock && amb.tFlock <= 0) amb.flock = newFlock(c, rand);
  const F = amb.flock;
  if (F) {
    F.run += F.v*h;
    if (F.run > F.len) { amb.flock = null; amb.tFlock = rr(rand, AMB.flockGap); }
    else {
      const cx = F.p[0] + F.dir[0]*F.run, cz = F.p[2] + F.dir[2]*F.run, base = gh(cx, cz) + F.alt, yaw = Math.atan2(-F.dir[0], -F.dir[2]), t = F.run/F.v;
      for (const m of F.mem) {
        let o = m.o;
        if (!F.goose) o = [o[0] + 4*Math.sin(t*m.f + m.ph), o[1] + 2*Math.sin(t*1.3*m.f + m.ph*2), o[2] + 4*Math.cos(t*0.8*m.f + m.ph)];
        const x = cx + F.side[0]*o[0] + F.dir[0]*-o[2], z = cz + F.side[2]*o[0] + F.dir[2]*-o[2];
        amb.birds.push({ p: [x, Math.max(base + o[1], gh(x, z) + 6), z], yaw, kind: F.goose ? 3 : 5, flap: t*(F.goose ? 2.2 : 6) + m.ph, glide: false });
      }
    }
  }
  // Greifvögel: ist die Drohne weit weg, kreisen sie bald woanders (nahe der Drohne)
  amb.raptors = amb.raptors.map(r => Math.hypot(r.c[0] - c[0], r.c[2] - c[2]) > 700 ? newRaptor(c, rand) : r);
  for (const r of amb.raptors) {
    r.ang += r.dir*9/r.r*h; r.ph += h;
    const x = r.c[0] + Math.cos(r.ang)*r.r, z = r.c[2] + Math.sin(r.ang)*r.r, yaw = Math.atan2(r.dir*Math.sin(r.ang), -r.dir*Math.cos(r.ang)) + Math.PI;
    amb.birds.push({ p: [x, gh(r.c[0], r.c[2]) + r.alt + 3*Math.sin(r.ph*0.2), z], yaw, kind: 4, flap: r.ph*2.5, glide: Math.sin(r.ph*0.35) < 0.75 });
  }
}
// Für den Himmel-Shader: je Flugzeug Richtung zum Rumpf und zum Ende des Kondensstreifens (Einheitsvektoren von der Kamera aus)
// und eine Deckkraft (blendet am Anfang und Ende der Strecke weich ein und aus). Höchstens n Einträge.
export function ambJetDirs(cam, n = 2) {
  const out = [], unit = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/l, v[1]/l, v[2]/l]; };
  if (!ambOn()) return out;
  for (const j of amb.jets.slice(0, n)) {
    const head = [j.p[0] + j.dir[0]*j.run, j.p[1], j.p[2] + j.dir[2]*j.run], tl = Math.min(j.len, j.run), tail = [head[0] - j.dir[0]*tl, head[1], head[2] - j.dir[2]*tl];
    const fade = Math.min(1, j.run/6000, (AMB.jetSpan - j.run)/6000);
    out.push({ a: unit([head[0] - cam[0], head[1] - cam[1], head[2] - cam[2]]), b: unit([tail[0] - cam[0], tail[1] - cam[1], tail[2] - cam[2]]), alpha: Math.max(0, fade) });
  }
  return out;
}
// Heißluftballon (Modell steht auf dem Korbboden, y nach oben): Hülle mit 12 Bahnen (abwechselnd Farbe und Weiß), unten schmal zum
// Brenner, Korb, vier Seile. Maße Schätzung: Hülle 18 m breit, 22 m hoch, Korb 1,4 m.
export function buildHotAirMesh(col) {
  const mb = new MeshBuilder(), N = 12, rows = [[0, 1.2, 3.2], [0.12, 4.5, 6], [0.3, 8.6, 10], [0.5, 9, 14], [0.7, 8.2, 18.5], [0.85, 6, 21.6], [0.96, 3, 23.6], [1, 0, 24]];
  const P = (k, r) => { const a = k*2*Math.PI/N; return [Math.cos(a)*r[1], r[2], Math.sin(a)*r[1]]; };
  for (let i = 0; i + 1 < rows.length; i++) for (let k = 0; k < N; k++) {
    const c = k % 2 ? [0.95, 0.94, 0.9] : col, a = P(k, rows[i]), b = P(k + 1, rows[i]), d = P(k + 1, rows[i + 1]), e = P(k, rows[i + 1]);
    mb.quad(a, e, d, b, c);
  }
  mb.box([0, 0.55, 0], [0.7, 0.55, 0.7], 0, [0.45, 0.32, 0.18]);   // Korb
  for (const [x, z] of [[0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]]) mb.box([x*1.1, 2.2, z*1.1], [0.03, 1.1, 0.03], 0, [0.2, 0.2, 0.2]);   // Seile
  mb.box([0, 2.6, 0], [0.25, 0.2, 0.25], 0, [0.25, 0.25, 0.27]);   // Brenner
  return new Float32Array(mb.d);
}
// Segelflugzeug (Nase nach -z): Rumpf 7 m, Spannweite 15 m, schlanke Flächen, T-Leitwerk; weiß
export function buildGliderMesh() {
  const mb = new MeshBuilder(), w = [0.95, 0.95, 0.94], g = [0.25, 0.32, 0.4];
  mb.box([0, 0, -0.5], [0.35, 0.4, 2.2], 0, w); mb.box([0, -0.05, 2.6], [0.15, 0.18, 1.6], 0, w);   // Rumpf vorn und Leitwerksträger
  mb.box([0, 0.3, -1.4], [0.28, 0.22, 0.9], 0, g);                                                 // Haube
  mb.box([0, 0.25, -0.2], [7.5, 0.06, 0.45], 0, w);                                                // Tragfläche
  mb.box([0, 0.9, 3.9], [0.06, 0.8, 0.45], 0, w); mb.box([0, 1.7, 3.9], [1.5, 0.04, 0.35], 0, w);  // Seitenleitwerk, Höhenleitwerk oben (T)
  return new Float32Array(mb.d);
}
