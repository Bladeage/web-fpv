/* Luftziele für den Modus „Jagd Flugzeuge“ (J1). Ohne DOM, in Node testbar.
   Drei Arten mit eigenem Flugverhalten nach realen Eigenschaften, verkleinert auf unsere Karte (Werte sind Schätzungen):
   - Starrflügler: kann nicht schweben, fliegt immer 13 bis 15 m/s, Kurven nur mit Schräglage (höchstens 35°),
     daraus Mindest-Kurvenradius r = v²/(g·tan φ), etwa 25 bis 33 m. Fliegt Kreise und Achten in 22 bis 34 m Höhe.
   - Hubschrauber-Drohne: schwebt, höchstens 10 m/s, beschleunigt mit höchstens 3 m/s², neigt sich in Beschleunigungsrichtung,
     dreht sich mit höchstens 70°/s in Flugrichtung. Patrouille mit kurzen Halten.
   - Großer Sechs-Rotor: höchstens 5 m/s, beschleunigt mit 1,5 m/s², schwebt 4 s an jedem Wegpunkt, dreht kaum.
   Alle Strecken über 16 m Höhe (höchstes Hindernis 15,1 m), keine Strecke doppelt. */
import { clamp, vAdd, vSub, vScale, vLen, qMul, qAxis } from './math.js';
import { sweptDist, HUNT } from './targets.js';
import { newBalloon, stepBalloon, popBalloon } from './balloon.js';
import { MeshBuilder } from './world.js';

const G = 9.81;
// Art: Trefferradius (m, Ziel plus Spieler 0,15 m), Punkte, Name
export const AIR_KIND = {
  plane: { name: 'Starrflügler', hitR: 1.0, points: 3, maxBank: 35, heat: 0.95 },
  heli:  { name: 'Hubschrauber', hitR: 1.0, points: 2, vmax: 10, amax: 3, yawRate: 70, hold: 2, heat: 0.95 },
  hexa:  { name: 'Sechs-Rotor', hitR: 1.3, points: 1, vmax: 5, amax: 1.5, yawRate: 20, hold: 4, heat: 0.85 }
};
const C = HUNT.center;
// Starrflügler: Bahn aus Kreisen (Mitte x, z, Radius, Drehsinn), Höhe, Tempo. Achte = zwei Kreise, die sich berühren.
const PLANES = [
  { loops: [[C[0] - 32, C[2], 32, 1], [C[0] + 32, C[2], 32, -1]], alt: 26, speed: 14 },   // Achte, Radius 32 m
  { loops: [[C[0], C[2] + 10, 45, -1]], alt: 33, speed: 15 }                               // großer Kreis, 45 m
];
// Hubschrauber und Sechs-Rotor: Wegpunkte [x, Höhe, z], jede Strecke nur einmal
const ROTORS = [
  ['heli', [[C[0] - 50, 18, C[2] - 40], [C[0] + 10, 22, C[2] - 55], [C[0] + 55, 19, C[2] - 20], [C[0] + 5, 24, C[2] - 10]]],
  ['heli', [[C[0] - 45, 21, C[2] + 45], [C[0] - 5, 17, C[2] + 60], [C[0] + 40, 23, C[2] + 40]]],
  ['hexa', [[C[0] - 20, 17, C[2] + 20], [C[0] + 15, 19, C[2] + 25], [C[0] + 10, 16.5, C[2] - 5]]],
  ['hexa', [[C[0] + 45, 18, C[2] + 5], [C[0] + 60, 21, C[2] - 40], [C[0] + 30, 17, C[2] - 30]]]
];
export const aircraft = [];

// Starrflügler: Lage auf der Kreisbahn nach zurückgelegter Strecke s (Achte: Kreise nacheinander)
function planeAt(a, s) {
  const L = a.loops.map(l => 2*Math.PI*l[2]), total = L.reduce((x, y) => x + y, 0);
  let d = ((s % total) + total) % total, i = 0;
  while (d > L[i]) { d -= L[i]; i++; }
  const [cx, cz, r, dir] = a.loops[i];
  // Start jedes Kreises am Berührpunkt bzw. bei Winkel 0; dir +1 gegen, -1 mit dem Uhrzeigersinn (von oben)
  const start = a.loops.length > 1 ? (i === 0 ? 0 : Math.PI) : 0, ang = start + dir*d/r;
  return { p: [cx + Math.cos(ang)*r, 0, cz + Math.sin(ang)*r], r, dir, ang };
}

export function initAircraft(speedScale = 1) {
  aircraft.length = 0;
  PLANES.forEach(pl => aircraft.push({ kind: 'plane', ...pl, speed: pl.speed*Math.max(0.85, speedScale),   /* nicht langsamer als etwa 12 m/s: sonst Strömungsabriss (Schätzung) */ s: 0, t: 0, p: [0, 0, 0], v: [0, 0, 0], q: [0, 0, 0, 1], bank: 0, state: 'fly', spin: 0, ang: 0 }));
  ROTORS.forEach(([kind, wps]) => {
    const k = AIR_KIND[kind];
    aircraft.push({ kind, wps, wp: 1, p: wps[0].slice(), v: [0, 0, 0], yaw: 0, hold: 0, vmax: k.vmax*speedScale, q: [0, 0, 0, 1], tilt: [0, 0], state: 'fly', spin: 0, ang: 0, t: 0 });
  });
  for (const a of aircraft) { if (a.kind === 'plane') stepPlane(a, 0); a.bal = newBalloon(a.p, aircraft.indexOf(a)); }
}

// Starrflügler: Lage folgt der Bahn; Schräglage aus der Kurve (tan φ = v²/(r·g)), Nase leicht nach oben/unten mit dem Steigen
function stepPlane(a, h) {
  a.s += a.speed*h; a.t += h;
  const now = planeAt(a, a.s), next = planeAt(a, a.s + 0.5);
  const alt = a.alt + 2.5*Math.sin(a.t*0.3);   // sanft auf und ab
  const p = [now.p[0], alt, now.p[2]];
  a.v = h > 0 ? vScale(vSub(p, a.p), 1/h) : [0, 0, 0];
  a.p = p;
  const dir = vSub(next.p, now.p), yaw = Math.atan2(-dir[0], -dir[2]);
  const bankWant = Math.min(AIR_KIND.plane.maxBank*Math.PI/180, Math.atan(a.speed*a.speed/(now.r*G)))*-now.dir;   // dir +1 = Rechtskurve (von oben im Uhrzeigersinn): rechte Fläche runter
  a.bank += (bankWant - a.bank)*Math.min(1, 3*h);   // Schräglage baut sich in etwa 0,3 s auf
  const pitch = Math.atan2(a.v[1] || 0, a.speed);
  a.q = qMul(qMul(qAxis([0, 1, 0], yaw), qAxis([1, 0, 0], pitch)), qAxis([0, 0, 1], a.bank));
}
// Hubschrauber und Sechs-Rotor: zum Wegpunkt beschleunigen, rechtzeitig bremsen (v² = 2·a·d), dort schweben
function stepRotor(a, h) {
  const k = AIR_KIND[a.kind];
  a.t += h;
  const tgt = a.wps[a.wp], d = vSub(tgt, a.p), dist = vLen(d);
  let want = [0, 0, 0];
  if (a.hold > 0) a.hold -= h;
  else if (dist < 0.6 && vLen(a.v) < 0.5) { a.hold = k.hold; a.wp = (a.wp + 1) % a.wps.length; }
  else want = vScale(d, Math.min(a.vmax, Math.sqrt(2*k.amax*0.8*dist))/(dist || 1));
  const dv = vSub(want, a.v), dl = vLen(dv), am = k.amax*h;
  const acc = dl > am ? vScale(dv, am/dl) : dv;
  a.v = vAdd(a.v, acc); a.p = vAdd(a.p, vScale(a.v, h));
  // Gieren in Flugrichtung (Hubschrauber) mit begrenzter Drehrate
  const hs = Math.hypot(a.v[0], a.v[2]);
  if (hs > 1) {
    const want = Math.atan2(-a.v[0], -a.v[2]);
    let dy = ((want - a.yaw + Math.PI*3) % (Math.PI*2)) - Math.PI;
    const maxY = k.yawRate*Math.PI/180*h;
    a.yaw += clamp(dy, -maxY, maxY);
  }
  // Neigung in Beschleunigungsrichtung plus etwas Fahrtwind (im eigenen System: vorn/seitlich)
  const ax = h > 0 ? acc[0]/h : 0, az = h > 0 ? acc[2]/h : 0, cs = Math.cos(a.yaw), sn = Math.sin(a.yaw);
  const fwd = -(ax*sn + az*cs) + 0.15*hs, side = ax*cs - az*sn;
  a.tilt[0] += (Math.atan(fwd/G) - a.tilt[0])*Math.min(1, 4*h);
  a.tilt[1] += (Math.atan(side/G) - a.tilt[1])*Math.min(1, 4*h);
  a.q = qMul(qMul(qAxis([0, 1, 0], a.yaw), qAxis([1, 0, 0], -a.tilt[0])), qAxis([0, 0, 1], -a.tilt[1]));
}

// Ein Schritt: fliegen, Treffer durch den Spieler (Weg a->b) prüfen. balloons: Stufe „Leicht“, nur der Ballon zählt.
// Ergebnis: Punkte der neu getroffenen Ziele (0 = kein Treffer).
export function stepAircraft(h, a, b, balloons = false) {
  let points = 0;
  for (const t of aircraft) {
    const p0 = t.p.slice();
    if (t.state === 'fly') {
      if (t.kind === 'plane') stepPlane(t, h); else stepRotor(t, h);
      if (t.bal) stepBalloon(t.bal, vSub(t.p, [0, 0.4, 0]), h);
      if (balloons ? popBalloon(t.bal, a, b, 0.15) : sweptDist(a, b, p0, t.p) < AIR_KIND[t.kind].hitR) {
        t.state = 'fall'; t.spin = 3 + Math.random()*3; points += AIR_KIND[t.kind].points;
      }
    } else if (t.state === 'fall') {
      t.v[1] -= G*h; t.v = vScale(t.v, 1 - 0.4*h);
      t.p = vAdd(t.p, vScale(t.v, h)); t.ang += t.spin*h;
      t.q = qMul(t.q, qAxis([0, 0, 1], t.spin*h));   // trudelt um die Längsachse
      if (t.p[1] <= 0.3) { t.p[1] = 0.3; t.state = 'down'; t.v = [0, 0, 0]; }
    }
  }
  return points;
}
export const aircraftLeft = () => aircraft.filter(t => t.state === 'fly').length;

// Modelle (vorn = -Z, oben = +Y), Größen geschätzt: Starrflügler 2,2 m Spannweite, Hubschrauber 2,2 m Rotor, Sechs-Rotor etwa 1,8 m
export function buildAircraftMesh(kind) {
  const mb = new MeshBuilder(), dark = [0.14, 0.14, 0.15], glass = [0.2, 0.28, 0.36];
  if (kind === 'plane') {
    const body = [0.72, 0.74, 0.68];
    mb.box([0, 0, 0], [0.11, 0.11, 0.72], 0, body);                    // Rumpf
    mb.box([0, 0.0, -0.78], [0.07, 0.07, 0.07], 0, dark);              // Nase mit Motor
    mb.cyl([0, 0, -0.86], 0.24, 0.008, 12, dark, 'z');                 // Propeller als Scheibe
    mb.box([0, 0.06, -0.08], [1.1, 0.022, 0.17], 0, body);             // Tragfläche
    mb.box([0, 0.04, 0.66], [0.38, 0.018, 0.09], 0, body);             // Höhenleitwerk
    mb.box([0, 0.2, 0.66], [0.018, 0.17, 0.1], 0, body);               // Seitenleitwerk
    mb.box([0, -0.09, -0.3], [0.05, 0.03, 0.08], 0, glass);            // Kamera unten
  } else if (kind === 'heli') {
    const body = [0.85, 0.82, 0.3];
    mb.box([0, 0, 0], [0.22, 0.22, 0.45], 0, body);                    // Rumpf
    mb.box([0, 0.03, -0.46], [0.19, 0.16, 0.1], 0, glass);             // Kanzel vorn
    mb.box([0, 0.08, 0.9], [0.045, 0.045, 0.48], 0, body);             // Heckausleger
    mb.box([0, 0.22, 1.32], [0.018, 0.17, 0.08], 0, body);             // Seitenflosse
    mb.cyl([0.07, 0.24, 1.34], 0.17, 0.006, 10, dark, 'x');            // Heckrotor
    mb.cyl([0, 0.3, 0], 0.035, 0.08, 6, dark);                         // Rotormast
    mb.cyl([0, 0.39, 0], 1.1, 0.006, 18, dark);                        // Hauptrotor als Scheibe
    for (const x of [-1, 1]) {                                         // Kufen mit Streben
      mb.box([x*0.26, -0.33, 0], [0.022, 0.022, 0.52], 0, dark);
      for (const z of [-0.25, 0.25]) mb.box([x*0.2, -0.26, z], [0.07, 0.07, 0.015], 0, dark);
    }
  } else {
    const carbon = [0.13, 0.13, 0.14], red = [0.8, 0.15, 0.12];
    mb.cyl([0, 0, 0], 0.24, 0.07, 12, carbon);                         // Mittelplatte
    mb.box([0, 0.1, 0], [0.12, 0.05, 0.16], 0, [0.75, 0.75, 0.78]);    // Haube
    mb.box([0, -0.13, 0], [0.09, 0.06, 0.15], 0, [0.25, 0.25, 0.28]);  // Akku unten
    for (let i = 0; i < 6; i++) {                                      // 6 Arme, die vorderen zwei rot
      const a = Math.PI/2 + (i + 0.5)*Math.PI/3, cs = Math.cos(a), sn = Math.sin(a), col = (i === 0 || i === 5) ? red : carbon;
      mb.box([cs*0.45, 0, -sn*0.45], [0.42, 0.02, 0.025], a, col);
      mb.cyl([cs*0.88, 0.04, -sn*0.88], 0.05, 0.035, 8, carbon);       // Motor
      mb.cyl([cs*0.88, 0.09, -sn*0.88], 0.36, 0.005, 14, [0.2, 0.2, 0.22]);   // Rotor als Scheibe
    }
    for (const x of [-1, 1]) {                                         // Landebeine
      mb.box([x*0.22, -0.3, 0], [0.018, 0.25, 0.018], 0, carbon);
      mb.box([x*0.22, -0.55, 0], [0.02, 0.02, 0.32], 0, carbon);
    }
  }
  return new Float32Array(mb.d);
}
