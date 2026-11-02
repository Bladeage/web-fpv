/* Fahrzeuge für das Szenario „Jagd Boden“. Ohne DOM, in Node testbar.
   Stehende Fahrzeuge an festen Plätzen, fahrende auf einer Runde entlang der Kurs-Wege,
   seitlich versetzt, damit sie nicht durch die Tore fahren. Treffer: die Drohne berührt das Fahrzeug. */
import { vNorm } from './math.js';
import { COURSE, MeshBuilder } from './world.js';

export const VEH_HALF = [1.0, 0.75, 2.1];   // halbe Breite, Höhe, Länge in m (Auto ca. 2 x 1,5 x 4,2 m)
const ROUTE_OFF = -4;                        // seitlicher Versatz der Fahrspur zur Kurslinie in m

// Fahrspur: Kurs als geschlossener Linienzug, an jeder Ecke entlang der gemittelten Normalen versetzt
export const ROUTE = COURSE.map((c, i) => {
  const n = COURSE.length, p = COURSE[(i + n - 1) % n], q = COURSE[(i + 1) % n];
  const d1 = vNorm([c[0] - p[0], 0, c[1] - p[1]]), d2 = vNorm([q[0] - c[0], 0, q[1] - c[1]]);
  const nx = -(d1[2] + d2[2]), nz = d1[0] + d2[0], l = Math.hypot(nx, nz) || 1;
  return [c[0] + nx/l*ROUTE_OFF, c[1] + nz/l*ROUTE_OFF];
});
const SEG = ROUTE.map((a, i) => { const b = ROUTE[(i + 1) % ROUTE.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); });
export const ROUTE_LEN = SEG.reduce((x, y) => x + y, 0);
// Punkt und Fahrtrichtung bei Strecke s (m) entlang der Fahrspur
export function routeAt(s) {
  s = ((s % ROUTE_LEN) + ROUTE_LEN) % ROUTE_LEN;
  for (let i = 0; i < ROUTE.length; i++) {
    if (s <= SEG[i]) {
      const a = ROUTE[i], b = ROUTE[(i + 1) % ROUTE.length], t = s/SEG[i];
      return { x: a[0] + (b[0] - a[0])*t, z: a[1] + (b[1] - a[1])*t, yaw: Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])) };
    }
    s -= SEG[i];
  }
  return { x: ROUTE[0][0], z: ROUTE[0][1], yaw: 0 };
}

// [Art, Tempo m/s, Startpunkt auf der Spur (Anteil) oder fester Platz [x, z, yaw], Richtung]. Tempo sind Schätzwerte.
const VEH_SETUP = [
  ['parked', 0, [8, 6, 0.6]], ['parked', 0, [-6, -8, -1.1]], ['parked', 0, [68, -42, 2.2]],
  ['slow', 5, 0.1, 1], ['slow', 6, 0.55, -1], ['fast', 14, 0.3, 1], ['fast', 16, 0.8, -1]
];
export const vehicles = [];
export function initVehicles(speedScale = 1) {
  vehicles.length = 0;
  for (const [kind, speed, at, dir] of VEH_SETUP) {
    const v = { kind, speed: speed*speedScale, dir: dir || 1, s: 0, x: 0, z: 0, yaw: 0, state: 'drive', tilt: 0 };
    if (kind === 'parked') { [v.x, v.z, v.yaw] = at; v.state = 'park'; }
    else { v.s = at*ROUTE_LEN; const r = routeAt(v.s); v.x = r.x; v.z = r.z; v.yaw = r.yaw + (v.dir < 0 ? Math.PI : 0); }
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
export function stepVehicles(h, a, b, r = 0.15) {
  let hits = 0;
  for (const v of vehicles) {
    if (v.state === 'drive') {
      v.s += v.speed*v.dir*h;
      const p = routeAt(v.s);
      v.x = p.x; v.z = p.z; v.yaw = p.yaw + (v.dir < 0 ? Math.PI : 0);
    }
    if (v.state !== 'hit' && hitsVehicle(v, a, b, r)) { v.state = 'hit'; v.tilt = 0.25; hits++; }
  }
  return hits;
}
export const vehiclesLeft = () => vehicles.filter(v => v.state !== 'hit').length;

// Modell eines Fahrzeugs (Mitte am Boden, Länge entlang Z). Helles Grau; die Farbe kommt beim Zeichnen dazu.
export function buildVehicle() {
  const mb = new MeshBuilder(), [w, hh, l] = VEH_HALF, body = [0.75, 0.75, 0.78], dark = [0.12, 0.12, 0.13], glass = [0.25, 0.32, 0.4];
  mb.box([0, 0.55, 0], [w, 0.4, l], 0, body);
  mb.box([0, 1.2, 0.25], [w*0.85, 0.3, l*0.5], 0, glass);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) mb.box([x*(w - 0.05), 0.32, z*(l - 0.6)], [0.12, 0.32, 0.32], 0, dark);
  return new Float32Array(mb.d);
}
export const VEH_COLORS = { parked: [0.55, 0.55, 0.5], slow: [0.2, 0.5, 1.0], fast: [1.0, 0.2, 0.2] };
