/* Verkehr in der echten Welt (Nutzer, Prompt 179/180, Etappe S1; Plan docs/plan-nacht-strassen.md 2.5). Zufallsautos fahren
   rechts auf den Straßen (Graph aus roads.js), über Brücken, bergauf langsamer. Nur Belebung wie die Vögel: keine Kollision mit
   der Drohne, kein Einfluss auf die Physik. Nur echte Welt, nicht in der DIS-Übung, Debug-Schalter „Verkehr“. Ohne DOM. */
import { rw } from './realworld.js';
import { ambOn } from './ambient.js';
import { makeRoute, routeAt } from './vehicles.js';
import { rwRoads, roadWalk, laneOffset, laneOff, laneProfile } from './roads.js';

// max Autos; near Abstand der Startkante zur Drohne (m); far ab hier ersetzen; speed m/s (Ortsverkehr 25 bis 45 km/h);
// walk Länge eines Zufallswegs (m); front halber Winkel vor der Kamera, in dem kein Auto neu erscheint. Alles Schätzungen.
export const TRAFFIC = { max: 8, near: [150, 600], far: 1200, speed: [7, 13], walk: [1500, 3000], minRoute: 120, front: Math.PI/6 };
export const CAR_COLS = [[0.75, 0.75, 0.78], [0.12, 0.12, 0.14], [0.55, 0.08, 0.06], [0.1, 0.22, 0.45], [0.85, 0.85, 0.82], [0.35, 0.36, 0.38]];
export const traffic = { cars: [], key: '' };
export const trafficOn = () => ambOn() && !!rw.show && rw.show.traffic !== false && !!rwRoads();

// Neues Auto: Kante 150 bis 600 m von der Drohne, nicht vor der Kamera, Zufallsweg, Spur rechts, Höhenprofil. null wenn nichts passt.
export function newCar(G, c, fwd, rand = Math.random) {
  for (let k = 0; k < 12; k++) {
    const e = Math.floor(rand()*G.edges.length), E = G.edges[e], m = E.pts[Math.floor(E.pts.length/2)];
    const dx = m[0] - c[0], dz = m[1] - c[2], d = Math.hypot(dx, dz);
    if (d < TRAFFIC.near[0] || d > TRAFFIC.near[1]) continue;
    if (fwd && (dx*fwd[0] + dz*fwd[1])/d > Math.cos(TRAFFIC.front)) continue;
    const W = roadWalk(G, e, rand() < 0.5 ? 0 : 1, TRAFFIC.walk[0] + rand()*(TRAFFIC.walk[1] - TRAFFIC.walk[0]), rand);
    const prof = laneProfile(laneOffset(W.pts, laneOff(W.w)), W.pts);
    if (prof.length < 2) continue;
    const route = makeRoute(prof, false);
    if (route.len < TRAFFIC.minRoute) continue;
    return { route, s: 0, v0: TRAFFIC.speed[0] + rand()*(TRAFFIC.speed[1] - TRAFFIC.speed[0]), v: 0, x: prof[0][0], z: prof[0][1], y: prof[0][2], yaw: 0, pitch: 0, col: CAR_COLS[Math.floor(rand()*CAR_COLS.length)] };
  }
  return null;
}
// Ein Schritt: c Drohne, fwd Blickrichtung [x, z] (Einheitsvektor) oder null. Höchstens ein neues Auto je Schritt.
export function trafficStep(h, c, fwd, rand = Math.random) {
  if (!trafficOn()) { traffic.cars.length = 0; return; }
  const G = rwRoads(), key = rw.ver + ':' + rw.tileVer;
  if (traffic.key !== key) { traffic.key = key; traffic.cars.length = 0; }   // anderes Gebiet oder Kachel: neu verteilen
  for (const a of traffic.cars) {
    const ahead = routeAt(a.route, Math.min(a.s + 2, a.route.len)), slope = (ahead.y - a.y)/2;
    a.v = a.v0*Math.max(0.4, 1 - 2.5*Math.max(0, slope));   // bergauf langsamer, mindestens 40 %
    a.s += a.v*h;
    const p = routeAt(a.route, a.s);
    a.x = p.x; a.z = p.z; a.y = p.y; a.yaw = p.yaw; a.pitch = Math.atan(slope);
  }
  traffic.cars = traffic.cars.filter(a => a.s < a.route.len - 5 && Math.hypot(a.x - c[0], a.z - c[2]) < TRAFFIC.far);
  if (traffic.cars.length < TRAFFIC.max) { const a = newCar(G, c, fwd, rand); if (a) traffic.cars.push(a); }
}
