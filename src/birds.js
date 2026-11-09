/* Vögel (Nutzerwunsch 05.11.2026): wenige einzelne Vögel, keine Schwärme, keine Kollision mit der Drohne.
   Jeder Start verteilt sie neu und zufällig: sitzend auf Bäumen und Dächern, pickend am Boden (Sandkasten, Wiese) oder fliegend.
   Verhalten: sitzen und umschauen, am Boden picken und hüpfen, zu einem anderen Ort fliegen.
   Kommt die Drohne näher als BIRD.scare, fliegen sie auf und suchen sich einen Ort weit weg.
   Ohne DOM, in Node testbar. */
import { vAdd, vScale, clamp } from './math.js';
import { colliders, MeshBuilder } from './world.js';
import { TOWN } from './town.js';
import { obstDist } from './targets.js';
import { rw, groundH, rwNear, waterAt } from './realworld.js';
import { cfg } from './state.js';

// Schätzungen nach einer Taube: Fluggeschwindigkeit 8 m/s, flieht ab 8 m Abstand. n: Anzahl auf der Karte.
// nReal: in der echten Welt mehr einzelne Vögel (Nutzer, Prompt 178), nicht in der DIS-Übung
export const BIRD = { n: 7, nReal: 14, speed: 8, scare: 8, flee: 40, hopH: 0.08 };
export const birds = [];
let birdSpots = [];

// Echte Welt: Baumspitzen, Dachflächen (Mitte eines Dachdreiecks) und freie Wiese, alle höchstens 260 m vom Start,
// damit die wenigen Vögel auch zu sehen sind. Boden frei: kein Wasser, kein Haus und kein Baum in 3 m.
function birdSpotsReal(rand, home) {
  const out = [], near = (x, z) => Math.hypot(x - home[0], z - home[2]) < 260;
  const trees = rw.trees.filter(t => near(t.x, t.z));
  for (let i = 0; i < 25 && trees.length; i++) { const t = trees[Math.floor(rand()*trees.length)]; out.push({ p: [t.x, t.y0 + t.h + 0.05, t.z], kind: 'perch' }); }
  const T = rw.tris, nr = rw.meta ? rw.meta.roofTris || 0 : 0;
  for (let i = 0, k = 0; i < 25 && k < 400 && nr; k++) {
    const o = Math.floor(rand()*nr)*9, x = (T[o] + T[o + 3] + T[o + 6])/3, z = (T[o + 2] + T[o + 5] + T[o + 8])/3;
    if (near(x, z)) { out.push({ p: [x, (T[o + 1] + T[o + 4] + T[o + 7])/3 + 0.02, z], kind: 'perch' }); i++; }
  }
  for (let i = 0, k = 0; i < 15 && k < 400; k++) {
    const a = rand()*Math.PI*2, d = 20 + rand()*220, x = home[0] + Math.cos(a)*d, z = home[2] + Math.sin(a)*d, n = rwNear(x, z, 3);
    if (!waterAt(x, z) && !n.tris.length && !n.boxes.length) { out.push({ p: [x, groundH(x, z) + 0.01, z], kind: 'ground' }); i++; }
  }
  return out;
}
// Landeplätze: Baumkronen, Dächer, Boden (Sandkasten, Spielplatz-Rasen, Ruine, freie Wiese)
function birdSpotsFind(rand, home) {
  if (rw.on) return birdSpotsReal(rand, home);
  const out = [];
  for (const c of colliders) {
    if (c.h[0] === c.h[2] && Math.abs(c.h[1]/c.h[0] - 1.5/1.3) < 1e-6) out.push({ p: [c.c[0], c.c[1] + c.h[1]*1.05, c.c[2]], kind: 'perch' });   // Baumkrone
    else if (c.h[0] >= 4 && c.h[2] >= 4 && Math.abs(c.c[1] - c.h[1]) < 1e-6) out.push({ p: [c.c[0], 2*c.h[1] + 0.5, c.c[2]], kind: 'perch' });   // Hausdach
  }
  const { spiel, haus, ruine, park } = TOWN.areas;
  out.push({ p: [haus[0] - 4, 6.12, haus[1] + 1], kind: 'perch' });               // Dach des offenen Hauses
  out.push({ p: [park[0] - 4, 9.75, park[1] + 4], kind: 'perch' });               // oberstes Deck im Parkhaus
  out.push({ p: [ruine[0] - 1.25, 4.2, ruine[1] + 4], kind: 'perch' });           // Torbogen der Ruine
  for (let i = 0; i < 3; i++) out.push({ p: [spiel[0] + 3 + rand()*4, 0.01, spiel[1] + 7 + rand()*1.5], kind: 'ground', box: 1 });   // Sandkasten
  for (let i = 0; i < 3; i++) out.push({ p: [spiel[0] - 8 + rand()*16, 0.01, spiel[1] - 2 + rand()*3], kind: 'ground' });            // Rasen am Spielplatz
  for (let i = 0; i < 2; i++) out.push({ p: [ruine[0] - 6 + rand()*10, 0.01, ruine[1] - 1 + rand()*3], kind: 'ground' });             // Innenhof der Ruine
  for (let i = 0, tries = 0; i < 10 && tries < 200; tries++) {   // freie Wiese
    const a = rand()*Math.PI*2, d = 20 + rand()*180, p = [Math.cos(a)*d, 0.01, Math.sin(a)*d];
    if (obstDist(p) > 3) { out.push({ p, kind: 'ground' }); i++; }
  }
  // Frei: am Boden kein Hindernis daneben; oben nichts darüber (Bäume stehen teils in anderen Kronen oder an Häusern)
  return out.filter(s => s.kind === 'ground' ? obstDist([s.p[0], 0.3, s.p[2]]) > 0.4 : obstDist([s.p[0], s.p[1] + 0.12, s.p[2]]) > 0.05);
}
const birdHz = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
// Neuen Landeplatz wählen: frei, möglichst 30 bis 180 m entfernt, weg von der Drohne (away)
function birdPick(b, rand, away) {
  const free = birdSpots.filter(s => !birds.some(o => o !== b && o.spot === s));
  let c = free.filter(s => { const d = birdHz(s.p, b.p); return d > 30 && d < 180 && (!away || birdHz(s.p, away) > BIRD.flee); });
  if (!c.length) c = free.filter(s => !away || birdHz(s.p, away) > BIRD.flee);
  if (!c.length) c = free.length ? free : birdSpots;
  return c[Math.floor(rand()*c.length) % c.length];
}
function birdLand(b, rand) {
  b.state = b.spot.kind === 'ground' ? 'ground' : 'perch';
  b.p = b.spot.p.slice();
  b.t = b.state === 'ground' ? 6 + rand()*14 : 8 + rand()*17;   // so lange bleibt er (s)
  b.next = 0.5 + rand()*2;                                       // nächstes Umschauen oder Hüpfen
  b.hop = 0; b.peck = 0; b.wing = 0;
}
function birdFlyTo(b, spot, rand) {
  b.state = 'fly'; b.spot = spot;
  b.from = b.p.slice(); b.el = 0;
  const d = birdHz(b.from, spot.p), top = Math.max(b.from[1], spot.p[1]);
  // Bogen: kurze Wege flach, lange Wege über Bäume und Häuser (über 17 m)
  b.apex = d > 40 ? Math.max(17, top + 4) + rand()*5 : top + clamp(d*0.2, 1.5, 6);
  if (rw.on) {   // echte Welt: Gelände unter dem Weg, Scheitel so hoch, dass der Bogen Abstand hält (lang 20 m, kurz 2 m)
    const f = b.from, e = spot.p, mid = (f[1] + e[1])/2, clear = d > 40 ? 20 : 2;
    b.apex = Math.max(top + (d > 40 ? 4 + rand()*5 : clamp(d*0.2, 1.5, 6)), mid + 1);
    for (let u = 0.05; u < 0.96; u += 0.05) {   // nah an Start und Ziel weniger Abstand (dort sitzt er ja)
      const sn = Math.sin(Math.PI*u), g = groundH(f[0] + (e[0] - f[0])*u, f[2] + (e[2] - f[2])*u) + 0.3 + clear*Math.min(1, 2*sn), base = f[1] + (e[1] - f[1])*u;
      b.apex = Math.max(b.apex, mid + (g - base)/sn);
    }
  }
  b.dur = Math.max(1.2, (d + 2*(b.apex - top))/BIRD.speed);
  b.yaw = Math.atan2(-(spot.p[0] - b.from[0]), -(spot.p[2] - b.from[2]));
}
// Neu verteilen (bei jedem Start). avoid: Startpunkt der Drohne, dort sitzt kein Vogel.
export function initBirds(rand = Math.random, avoid = [0, 0, 0]) {
  birdSpots = birdSpotsFind(rand, avoid);
  birds.length = 0;
  const nb = rw.on && !cfg.verbund ? BIRD.nReal : BIRD.n;
  for (let i = 0; i < nb; i++) {
    const b = { p: [0, 0, 0], yaw: rand()*Math.PI*2, col: i % 3, flap: rand()*6, spot: null, state: 'perch', t: 0, next: 0, hop: 0, peck: 0, wing: 0 };
    birds.push(b);
    let s = null;
    for (let k = 0; k < 20 && (!s || birdHz(s.p, avoid) < 25 || birds.some(o => o !== b && o.spot === s)); k++) s = birdSpots[Math.floor(rand()*birdSpots.length)];
    b.spot = s; birdLand(b, rand);
    b.t *= rand();   // nicht alle starten gleichzeitig
    if (rand() < 0.25) { birdFlyTo(b, birdPick(b, rand), rand); b.el = rand()*b.dur*0.8; }   // ein Teil ist schon unterwegs
  }
}
// Ein Schritt für alle Vögel. drone: Position der Drohne.
export function stepBirds(h, drone, rand = Math.random) {
  for (const b of birds) {
    b.flap += h;
    if (b.state !== 'fly' && drone && Math.hypot(b.p[0] - drone[0], b.p[1] - drone[1], b.p[2] - drone[2]) < BIRD.scare) {
      birdFlyTo(b, birdPick(b, rand, drone), rand); continue;   // erschreckt: weg von der Drohne
    }
    if (b.state === 'fly') {
      b.el += h;
      const u = clamp(b.el/b.dur, 0, 1), f = b.from, e = b.spot.p;
      const base = f[1] + (e[1] - f[1])*u;   // Gerade zwischen Start und Ziel, darüber ein Bogen bis zur Scheitelhöhe
      b.p = [f[0] + (e[0] - f[0])*u, base + (b.apex - (f[1] + e[1])/2)*Math.sin(Math.PI*u), f[2] + (e[2] - f[2])*u];
      b.climb = Math.cos(Math.PI*u);   // > 0 steigt, < 0 sinkt
      b.wing = u < 0.45 || u > 0.85 || Math.sin(b.el*0.9 + b.col) > 0.2 ? 1 : 0;   // Flügelschlag oder Gleiten
      if (u >= 1) birdLand(b, rand);
      continue;
    }
    b.t -= h; b.next -= h;
    if (b.state === 'ground') {
      b.peck = Math.max(0, Math.sin(b.flap*7))*(Math.sin(b.flap*0.8 + b.col) > 0 ? 1 : 0);   // picken in Serien
      if (b.hop > 0) {   // kleiner Hüpfer
        b.hop = Math.max(0, b.hop - h/0.25);
        b.p = vAdd(b.p, vScale(b.hopV, h));
        b.p[1] = (rw.on ? groundH(b.p[0], b.p[2]) + 0.01 : b.spot.p[1]) + BIRD.hopH*Math.sin(Math.PI*b.hop);   // am Hang mit dem Boden
      } else if (b.next <= 0) {
        b.yaw += (rand() - 0.5)*2.5;
        const d = 0.3 + rand()*0.5, dir = [-Math.sin(b.yaw), 0, -Math.cos(b.yaw)], tgt = vAdd(b.p, vScale(dir, d));
        const home = b.spot.box ? 1.0 : 3;   // Sandkasten klein, Wiese großzügiger
        if (birdHz(tgt, b.spot.p) < home && (rw.on || obstDist([tgt[0], 0.15, tgt[2]]) > 0.3)) { b.hop = 1; b.hopV = vScale(dir, d/0.25); }
        b.next = 1.5 + rand()*2.5;
      }
    } else if (b.next <= 0) {   // sitzt: schaut sich um
      b.yaw += (rand() - 0.5)*2;
      b.next = 1 + rand()*2.5;
    }
    if (b.t <= 0) birdFlyTo(b, birdPick(b, rand), rand);
  }
}
// Für die Darstellung: Neigung nach vorn (Picken) oder nach Steigen/Sinken
export const birdPitch = b => b.state === 'fly' ? 0.25*(b.climb || 0) : b.state === 'ground' ? -0.7*b.peck : 0;
export const birdFlap = b => b.state === 'fly' && b.wing ? Math.sin(b.flap*2*Math.PI*5)*0.9 : b.state === 'fly' ? 0.1 : null;
// Modell (Ursprung zwischen den Füßen, vorn = -z). part: 'body' oder 'wing' (rechter Flügel, Gelenk im Ursprung, nach +x).
// Drei Arten nach Farbe: Taube grau, Spatz braun, Amsel schwarz mit gelbem Schnabel. Größe als Schätzung (Taube, 25 cm lang).
// Dazu für die Belebung (ambient.js): 3 Gans (graubraun), 4 Greifvogel (Bussard, braun), 5 kleiner Schwarmvogel (Star, dunkel).
// Größe über s: Gans etwa 1,6 m Spannweite (s 2,7), Bussard etwa 1,2 m (s 2,1), Star (s 0,85); Schätzungen.
const BIRD_COLORS = [[[0.55, 0.56, 0.62], [0.42, 0.43, 0.5], [0.9, 0.55, 0.3]], [[0.6, 0.45, 0.3], [0.45, 0.32, 0.2], [0.35, 0.3, 0.25]], [[0.12, 0.12, 0.13], [0.08, 0.08, 0.09], [1, 0.75, 0.1]],
  [[0.5, 0.47, 0.42], [0.33, 0.31, 0.28], [0.15, 0.15, 0.15]], [[0.48, 0.36, 0.24], [0.33, 0.23, 0.15], [0.85, 0.75, 0.2]], [[0.16, 0.16, 0.2], [0.1, 0.1, 0.13], [0.8, 0.7, 0.2]]];
export const BIRD_SCALE = { 3: 2.7, 4: 2.1, 5: 0.85 };
export function buildBirdMesh(kind, part, s = 1) {
  const d = birdMeshRaw(kind, part);
  if (s !== 1) for (let i = 0; i < d.length; i += 10) { d[i] *= s; d[i + 1] *= s; d[i + 2] *= s; }
  return d;
}
function birdMeshRaw(kind, part) {
  const mb = new MeshBuilder(), [body, dark, beak] = BIRD_COLORS[kind % BIRD_COLORS.length], leg = [0.6, 0.45, 0.3];
  if (part === 'wing') { mb.box([0.13, 0, 0], [0.13, 0.006, 0.055], 0, dark); mb.box([0.27, 0, 0], [0.03, 0.005, 0.035], 0, dark); return new Float32Array(mb.d); }
  mb.box([0, 0.065, 0], [0.045, 0.04, 0.1], 0, body);            // Rumpf
  mb.box([0, 0.11, -0.085], [0.03, 0.03, 0.035], 0, body);       // Kopf
  mb.box([0, 0.105, -0.13], [0.008, 0.008, 0.015], 0, beak);     // Schnabel
  mb.box([0, 0.075, 0.13], [0.03, 0.008, 0.05], 0, dark);        // Schwanz
  for (const x of [-1, 1]) {
    mb.box([x*0.047, 0.07, 0.015], [0.004, 0.028, 0.075], 0, dark);   // angelegte Flügel
    mb.box([x*0.02, 0.0125, 0], [0.004, 0.0125, 0.004], 0, leg);      // Beine
  }
  return new Float32Array(mb.d);
}
