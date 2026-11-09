/* Belebung der echten Welt (Nutzer, Prompt 178): Gänse in V-Formation und kleine Vogelschwärme ab und zu, kreisende Greifvögel,
   Verkehrsflugzeuge hoch am Himmel mit Kondensstreifen. Nur in der echten Welt und nicht in der DIS-Übung (dort zählt nur der
   Inhalt des Partners). Kein Einfluss auf die Physik, keine Kollision. Wenig Rechenzeit: höchstens ein Schwarm zugleich, die
   Flugzeuge zeichnet der Himmel-Shader (nur Richtungen, keine Modelle). Alle Zahlen sind Schätzungen für ein ruhiges Bild.
   Ohne DOM, in Node testbar. */
import { rw, groundH } from './realworld.js';
import { cfg } from './state.js';

// jets: höchstens gleichzeitig; jetH Flughöhe (m), jetV Tempo (m/s, Reiseflug etwa 830 km/h), jetLen Länge des Kondensstreifens (m),
// jetSpan Strecke über den Himmel (m), jetGap Pause bis zum nächsten (s). flockGap Pause zwischen Schwärmen (s).
export const AMB = { jets: 2, jetH: [9000, 11500], jetV: 230, jetLen: [4000, 14000], jetSpan: 70000, jetGap: [15, 90],
  flockGap: [35, 100], goose: [7, 13], swarm: [16, 28], raptors: 2 };
export const amb = { jets: [], flock: null, raptors: [], birds: [], tFlock: 0, tJet: 0 };
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
  if (rand() < 0.8) { const j = newJet(c, rand); j.run = (0.2 + 0.5*rand())*AMB.jetSpan; amb.jets.push(j); }   // meist ist schon eines am Himmel
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
