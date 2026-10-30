/* Szenarien auf derselben Karte: Torkurs, Ringparcours, Slalom, Präzisionslandung, Freiflug.
   Ohne DOM, in Node testbar. Die Karte (world.js) bleibt immer gleich; ein Szenario legt
   nur eigene Elemente dazu und tauscht die Aufgabe der Physik (task) aus. */
import { vAdd, vSub, vScale, vDot, vLen, vNorm, vCross } from './math.js';
import { cfg, game, say, saveBest, loadBest } from './state.js';
import { COURSE, gates, MeshBuilder } from './world.js';
import { PHYS, task, checkGate, collide, contact, fx } from './physics.js';
import { fmtTime } from './format.js';

export const SCENARIOS = [
  { id: 'gates',   name: 'Torkurs',            info: '8 Tore am Boden der Reihe nach, Runde für Runde.' },
  { id: 'rings',   name: 'Ringparcours',       info: '8 Ringe in der Luft, auf verschiedenen Höhen und geneigt.' },
  { id: 'slalom',  name: 'Slalom',             info: '5 Stangen. Blaue Fahne: rechts vorbei. Rote Fahne: links vorbei.' },
  { id: 'landing', name: 'Präzisionslandung',  info: 'Abheben, zur Plattform fliegen und sanft landen. 1 s ruhig stehen.' },
  { id: 'free',    name: 'Freiflug',           info: 'Ohne Aufgabe.' }
];
export const scen = { id: 'gates', version: 0 };   // version steigt bei jedem Wechsel (für render.js)

/* ---------- Elemente ---------- */
// Ringe: in der Mitte jedes Kursabschnitts. Die Ringebene steht quer zur Linie vom vorigen
// zum nächsten Ring. Wegen der Höhenunterschiede sind die Ringe dadurch geneigt.
const RING_H = [4, 7, 11, 6, 13, 9, 5, 8];
export const RING_R = 1.6;      // Radius bis zur Rohrmitte in m
export const RING_TUBE = 0.1;   // Rohrradius in m
const segMid = i => { const a = COURSE[i], b = COURSE[(i+1) % COURSE.length]; return [(a[0]+b[0])/2, RING_H[i], (a[1]+b[1])/2]; };
export const rings = COURSE.map((_, i) => {
  const c = segMid(i), n = vNorm(vSub(segMid((i+1) % COURSE.length), segMid((i+COURSE.length-1) % COURSE.length)));
  const e1 = vNorm(vCross(n, [0,1,0])), e2 = vCross(e1, n);
  return { c, n, e1, e2 };
});

// Slalom: Stangen auf der Linie von Tor 1 zu Tor 2. Dort stehen keine Bäume (world.js hält 9 m Abstand).
const SL_A = COURSE[0], SL_B = COURSE[1];
const slDir = vNorm([SL_B[0]-SL_A[0], 0, SL_B[1]-SL_A[1]]);
const slRight = [-slDir[2], 0, slDir[0]];
const slYaw = Math.atan2(-slDir[0], -slDir[2]);
export const SLALOM_H = 4;   // Stangenhöhe in m
export const SLALOM_W = 6;   // so weit seitlich zählt ein Vorbeiflug noch, in m
export const poles = [0.2, 0.35, 0.5, 0.65, 0.8].map((t, i) => ({
  c: [SL_A[0] + (SL_B[0]-SL_A[0])*t, SLALOM_H/2, SL_A[1] + (SL_B[1]-SL_A[1])*t],
  n: slDir, r: slRight,
  side: i % 2 ? -1 : 1     // +1: rechts an der Stange vorbei, -1: links
}));
const poleCols = poles.map(p => ({ c: p.c, h: [0.08, SLALOM_H/2, 0.08], cs: 1, sn: 0 }));

// Landeplattform: Mitte des Abschnitts von Tor 3 zu Tor 4, flach am Boden.
export const PAD = { c: [72.5, 0, -45], half: 1.0 };
export const LAND_V = 2.0;     // höchste Aufsetzgeschwindigkeit für eine gültige Landung in m/s
const LAND_HOLD = 1.0;         // so lange ruhig stehen, in s

/* ---------- Ablauf ---------- */
const st = { done: false, takeoff: null, onPad: false, hard: false, hold: 0, vPrev: [0, 0, 0] };
function reset() { st.done = false; st.takeoff = null; st.onPad = false; st.hard = false; st.hold = 0; st.vPrev = [0, 0, 0]; }
export function scenDone() { return st.done; }

// Schnittpunkt der Strecke a->b mit der Ebene durch c (Normale n), nur in Richtung n.
function crossed(a, b, c, n) {
  const da = vDot(vSub(a, c), n), db = vDot(vSub(b, c), n);
  if (!(da < 0 && db >= 0)) return null;
  return vAdd(a, vScale(vSub(b, a), da/(da - db)));
}
function finish(time) {
  const s = game.sim;
  s.lastLap = time; s.lapStart = null; st.done = true;
  if (game.best === null || time < game.best) { game.best = time; saveBest(); say('Ziel! Neue Bestzeit ' + fmtTime(time), 3); fx.beep(1320, 0.25); }
  else say('Ziel! ' + fmtTime(time), 3);
}
function advance(count) {
  const s = game.sim;
  if (s.next === 0) { s.lapStart = s.t; say('Zeit läuft', 1.2); }
  fx.beep(880 + s.next*40, 0.09);
  s.next++;
  if (s.next === count) finish(s.t - s.lapStart);
}

function checkRing(a, b) {
  if (st.done) return;
  const g = rings[game.sim.next], p = crossed(a, b, g.c, g.n);
  if (!p) return;
  const d = vSub(p, g.c);
  if (vLen(vSub(d, vScale(g.n, vDot(d, g.n)))) < RING_R - RING_TUBE) advance(rings.length);
}
function collideRings(h) {
  const s = game.sim, lim = RING_TUBE + PHYS.radius;
  for (const g of rings) {
    const d = vSub(s.p, g.c);
    if (vLen(d) > RING_R + lim) continue;
    const inPlane = vSub(d, vScale(g.n, vDot(d, g.n))), l = vLen(inPlane);
    if (l < 1e-6) continue;
    const dv = vSub(d, vScale(inPlane, RING_R/l)), dist = vLen(dv);   // Abstand zur Rohrmitte
    if (dist < lim && dist > 1e-9 && contact(vScale(dv, 1/dist), lim - dist, h)) return true;
  }
  return false;
}

function checkPole(a, b) {
  if (st.done) return;
  const g = poles[game.sim.next], p = crossed(a, b, g.c, g.n);
  if (!p) return;
  const lat = vDot(vSub(p, g.c), g.r);
  if (Math.abs(lat) > SLALOM_W || p[1] > SLALOM_H + 0.5) return;
  if (lat*g.side > 0) advance(poles.length);
  else say('Falsche Seite', 1.2);
}
function collidePoles(h) {
  for (const c of poleCols) if (collide(c, h)) return true;
  return false;
}

function checkLanding(a, b, h) {
  const s = game.sim;
  if (st.done) return;
  if (st.takeoff === null && !s.grounded) { st.takeoff = s.t; s.lapStart = s.t; }
  const onPad = s.grounded && Math.abs(s.p[0] - PAD.c[0]) < PAD.half && Math.abs(s.p[2] - PAD.c[2]) < PAD.half;
  if (onPad && !st.onPad && st.takeoff !== null) {
    st.hard = vLen(st.vPrev) > LAND_V;
    if (st.hard) say('Zu hart aufgesetzt', 1.5);
  }
  if (onPad && !st.hard && st.takeoff !== null && vLen(s.v) < 0.3) {
    st.hold += h;
    if (st.hold >= LAND_HOLD) finish(s.t - st.takeoff);
  } else st.hold = 0;
  if (!onPad) st.hard = false;
  st.onPad = onPad; st.vPrev = s.v.slice();
}

const TASKS = {
  gates:   { check: checkGate, collide: null },
  rings:   { check: checkRing, collide: collideRings },
  slalom:  { check: checkPole, collide: collidePoles },
  landing: { check: checkLanding, collide: null },
  free:    { check() {}, collide: null }
};
task.reset = reset;

// Szenario wählen. Danach respawn() aufrufen.
export function setScenario(id) {
  if (!TASKS[id]) id = 'gates';
  scen.id = id; scen.version++;
  cfg.scen = id;
  task.check = TASKS[id].check; task.collide = TASKS[id].collide;
  loadBest();
}

/* ---------- Anzeige ---------- */
export function scenLabel() {
  const s = game.sim;
  if (scen.id === 'gates') return `TOR ${s.next + 1}/${gates.length}`;
  if (scen.id === 'free') return 'FREIFLUG';
  if (st.done) return scen.id === 'landing' ? 'GELANDET' : 'ZIEL';
  if (scen.id === 'rings') return `RING ${s.next + 1}/${rings.length}`;
  if (scen.id === 'slalom') return `SLALOM ${s.next + 1}/${poles.length} ${poles[s.next].side > 0 ? 'RECHTS' : 'LINKS'}`;
  return 'LANDEN';
}
// Punkt für den Zielmarker im OSD, oder null.
export function scenTarget() {
  const s = game.sim;
  if (scen.id === 'gates') return gates[s.next] ? gates[s.next].c : null;
  if (st.done || scen.id === 'free') return null;
  if (scen.id === 'rings') return rings[s.next].c;
  if (scen.id === 'slalom') { const g = poles[s.next]; return [g.c[0] + g.r[0]*g.side*2, 2, g.c[2] + g.r[2]*g.side*2]; }
  return [PAD.c[0], 0.5, PAD.c[2]];
}
// Welches Teil des Szenario-Modells grün leuchtet, oder -1.
export function scenHighlight() {
  if (st.done || scen.id === 'gates' || scen.id === 'free') return -1;
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
    return { p: vAdd(g.c, vAdd(vScale(radial, RING_R + RING_TUBE*cv), vScale(g.n, RING_TUBE*sv))),
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
    mb.box(g.c, [0.08, SLALOM_H/2, 0.08], slYaw, [0.92, 0.92, 0.9]);
    const fc = [g.c[0] + g.r[0]*g.side*0.33, SLALOM_H - 0.25, g.c[2] + g.r[2]*g.side*0.33];
    mb.box(fc, [0.25, 0.18, 0.015], slYaw, g.side > 0 ? [0.15, 0.4, 1.0] : [0.95, 0.15, 0.12]);
  });
  if (scen.id === 'landing') part(() => {
    const [x, , z] = PAD.c, w = PAD.half, white = [0.95, 0.95, 0.95], orange = [1.0, 0.42, 0.08];
    mb.box([x, 0.025, z], [w, 0.025, w], 0, [0.25, 0.27, 0.3]);
    for (const [dx, dz, hx, hz] of [[0, -w, w, 0.05], [0, w, w, 0.05], [-w, 0, 0.05, w], [w, 0, 0.05, w]]) mb.box([x+dx, 0.055, z+dz], [hx, 0.005, hz], 0, orange);
    mb.box([x-0.3, 0.055, z], [0.06, 0.005, 0.45], 0, white);
    mb.box([x+0.3, 0.055, z], [0.06, 0.005, 0.45], 0, white);
    mb.box([x, 0.055, z], [0.3, 0.005, 0.06], 0, white);
  });
  return { data: new Float32Array(mb.d), parts };
}
