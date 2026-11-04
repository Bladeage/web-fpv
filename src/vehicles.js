/* Fahrzeuge für das Szenario „Jagd Boden“. Ohne DOM, in Node testbar.
   Stehende Fahrzeuge an festen Plätzen, fahrende auf einer Runde entlang der Kurs-Wege,
   seitlich versetzt, damit sie nicht durch die Tore fahren. Treffer: die Drohne berührt das Fahrzeug. */
import { vNorm } from './math.js';
import { COURSE, MeshBuilder } from './world.js';
import { newBalloon, stepBalloon, popBalloon } from './balloon.js';

export const VEH_HALF = [1.0, 0.75, 2.1];   // halbe Breite, Höhe, Länge in m (Auto ca. 2 x 1,5 x 4,2 m)
// Fahrspuren: Linienzüge entlang des Kurses, seitlich versetzt (gemittelte Normale an den Ecken).
// Jedes fahrende Fahrzeug hat seine eigene Spur; keine Strecke wird doppelt genutzt.
function offsetPath(idx, off) {
  const n = COURSE.length;
  return idx.map(i => {
    const c = COURSE[i % n], p = COURSE[(i + n - 1) % n], q = COURSE[(i + 1) % n];
    const d1 = vNorm([c[0] - p[0], 0, c[1] - p[1]]), d2 = vNorm([q[0] - c[0], 0, q[1] - c[1]]);
    const nx = -(d1[2] + d2[2]), nz = d1[0] + d2[0], l = Math.hypot(nx, nz) || 1;
    return [c[0] + nx/l*off, c[1] + nz/l*off];
  });
}
function makeRoute(pts, loop) {
  const segs = [];
  const n = loop ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; segs.push(Math.hypot(b[0] - a[0], b[1] - a[1])); }
  return { pts, loop, segs, len: segs.reduce((x, y) => x + y, 0) };
}
// Gerades Stück eines Kursabschnitts i (Anteil t0 bis t1), seitlich versetzt. Ohne Ecken, damit es an Toren vorbeigeht.
function segPath(i, t0, t1, off) {
  const a = COURSE[i], b = COURSE[(i + 1) % COURSE.length], d = vNorm([b[0] - a[0], 0, b[1] - a[1]]);
  const at = t => [a[0] + (b[0] - a[0])*t - d[2]*off, a[1] + (b[1] - a[1])*t + d[0]*off];
  return [at(t0), at(t1)];
}
export const ROUTES = [
  makeRoute(offsetPath([0, 1, 2, 3, 4, 5, 6, 7], -4), true),   // ganze Runde, innen
  makeRoute(segPath(2, 0.12, 0.88, 3), false),                  // Tor 3 bis Tor 4, außen, hin und her (keine Pfeiler dort)
  makeRoute(segPath(5, 0.12, 0.88, 3), false),                  // Tor 6 bis Tor 7, außen, hin und her
  makeRoute([[7, -4], [7, -19]], false)                          // neben der Startgeraden, hin und her
];
// Punkt und Fahrtrichtung bei Strecke s (m) auf Spur r. Offene Spuren: hin und her.
export function routeAt(r, s) {
  let back = false;
  if (r.loop) s = ((s % r.len) + r.len) % r.len;
  else { s = ((s % (2*r.len)) + 2*r.len) % (2*r.len); if (s > r.len) { s = 2*r.len - s; back = true; } }
  for (let i = 0; i < r.segs.length; i++) {
    if (s <= r.segs[i] || i === r.segs.length - 1) {
      const a = r.pts[i], b = r.pts[(i + 1) % r.pts.length], t = Math.min(1, s/r.segs[i]);
      const yaw = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])) + (back ? Math.PI : 0);
      return { x: a[0] + (b[0] - a[0])*t, z: a[1] + (b[1] - a[1])*t, yaw };
    }
    s -= r.segs[i];
  }
}

// [Art, Tempo m/s, fester Platz [x, z, yaw] oder Spur-Nummer, Richtung]. Tempo sind Schätzwerte.
const VEH_SETUP = [
  ['parked', 0, [8, 6, 0.6]], ['parked', 0, [-6, -8, -1.1]], ['parked', 0, [40, -30, 0.4]],
  ['slow', 5, 3, 1], ['slow', 6, 1, 1], ['fast', 14, 0, 1], ['fast', 16, 2, -1]
];
export const vehicles = [];
export function initVehicles(speedScale = 1) {
  vehicles.length = 0;
  for (const [kind, speed, at, dir] of VEH_SETUP) {
    const v = { kind, speed: speed*speedScale, dir: dir || 1, s: 0, x: 0, z: 0, yaw: 0, state: 'drive', tilt: 0, route: null };
    if (kind === 'parked') { [v.x, v.z, v.yaw] = at; v.state = 'park'; }
    else { v.route = ROUTES[at]; const r = routeAt(v.route, 0); v.x = r.x; v.z = r.z; v.yaw = r.yaw + (v.dir < 0 ? Math.PI : 0); }
    v.bal = newBalloon([v.x, VEH_HALF[1]*2, v.z], vehicles.length);   // Ballon für Stufe „Leicht“, über dem Dach
    vehicles.push(v);
  }
}

// Schneidet die Strecke a->b (Drohne, um Radius r vergrößert) das Fahrzeug? Slab-Test im Fahrzeugsystem.
function hitsVehicle(v, a, b, r) {
  const cs = Math.cos(v.yaw), sn = Math.sin(v.yaw);
  const loc = p => { const dx = p[0] - v.x, dz = p[2] - v.z; return [dx*cs - dz*sn, p[1] - VEH_HALF[1], dx*sn + dz*cs]; };
  const p = loc(a), q = loc(b);
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    const h = VEH_HALF[i] + r, d = q[i] - p[i];
    if (Math.abs(d) < 1e-9) { if (Math.abs(p[i]) > h) return false; continue; }
    let ta = (-h - p[i])/d, tb = (h - p[i])/d;
    if (ta > tb) { const x = ta; ta = tb; tb = x; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

// Ein Schritt: Fahrzeuge bewegen, Treffer durch die Drohne (Weg a->b, Radius r) prüfen. Ergebnis: neue Treffer.
// balloons: Stufe „Leicht“, Treffer nur über den Ballon über dem Fahrzeug.
export function stepVehicles(h, a, b, r = 0.15, balloons = false) {
  let hits = 0;
  for (const v of vehicles) {
    if (v.state === 'drive') {
      v.s += v.speed*v.dir*h;
      const p = routeAt(v.route, v.s);
      v.x = p.x; v.z = p.z; v.yaw = p.yaw + (v.dir < 0 ? Math.PI : 0);
    }
    if (v.bal) stepBalloon(v.bal, [v.x, VEH_HALF[1]*2, v.z], h);
    if (v.state !== 'hit' && (balloons ? popBalloon(v.bal, a, b, r) : hitsVehicle(v, a, b, r))) { v.state = 'hit'; v.tilt = 0.25; hits++; }
  }
  return hits;
}
export const vehiclesLeft = () => vehicles.filter(v => v.state !== 'hit').length;

// Modell eines Fahrzeugs (Mitte am Boden, Länge entlang Z). Helles Grau; die Farbe kommt beim Zeichnen dazu.
export function buildVehicle() {
  const mb = new MeshBuilder(), [w, , l] = VEH_HALF, body = [0.75, 0.75, 0.78], dark = [0.1, 0.1, 0.11], glass = [0.22, 0.3, 0.38];
  mb.box([0, 0.6, 0], [w, 0.32, l], 0, body);                                   // Karosserie
  mb.box([0, 0.36, 0], [w*0.98, 0.1, l*1.01], 0, dark);                          // Schweller und Stoßfänger
  mb.box([0, 1.1, 0.2], [w*0.86, 0.22, l*0.48], 0, glass);                       // Fensterband
  mb.box([0, 1.34, 0.2], [w*0.82, 0.03, l*0.46], 0, body);                       // Dach
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {                    // Räder mit Felge
    mb.cyl([x*(w - 0.06), 0.33, z*(l - 0.68)], 0.33, 0.12, 12, dark, 'x');
    mb.cyl([x*(w + 0.005), 0.33, z*(l - 0.68)], 0.17, 0.02, 10, [0.6, 0.6, 0.62], 'x');
  }
  for (const x of [-1, 1]) {
    mb.box([x*(w - 0.25), 0.7, -l - 0.01], [0.18, 0.07, 0.02], 0, [1.0, 0.96, 0.75]);   // Scheinwerfer (vorn = -Z)
    mb.box([x*(w - 0.22), 0.72, l + 0.01], [0.16, 0.06, 0.02], 0, [0.85, 0.08, 0.06]);   // Rücklichter
  }
  return new Float32Array(mb.d);
}
export const VEH_COLORS = { parked: [0.55, 0.55, 0.5], slow: [0.2, 0.5, 1.0], fast: [1.0, 0.2, 0.2] };
