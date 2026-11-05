/* Ziel-Drohnen für das Szenario „Jagd“. Ohne DOM, in Node testbar.
   Bewegung kinematisch (nicht voll simuliert). Verhalten: dumm (feste Route), zufällig, ausweichend.
   Zufall mit festem Startwert, damit Tests und Bestzeiten vergleichbar bleiben. */
import { clamp, vAdd, vSub, vScale, vDot, vLen } from './math.js';
import { rng, colliders } from './world.js';
import { town } from './town.js';
import { newBalloon, stepBalloon, popBalloon } from './balloon.js';

export const HUNT = { center: [30, 12, -10], radius: 220, hitR: 0.4 };   // Mitte der Karte, Gebiet bis zu den Testecken, Trefferabstand (Ziel 0,25 m + Spieler 0,15 m)
export const targets = [];
// Über die ganze Karte verteilt, bis zu den Testecken und um sie herum (Nutzerwunsch 04.11.2026). Jedes bewegte Ziel hat einen
// eigenen Bereich (Kreis mit REGION m um seine Mitte), die Bereiche überschneiden sich nicht, keine Strecke wird doppelt genutzt.
// [Verhalten, Strecke, Tempo m/s (Schätzung für ein faires Spiel), Mitte [x, Höhe, z], Größe der Strecke m]
const SETUP = [
  ['dumb', 'circle', 7, [190, 13, -130], 22],    // Kreis um das Parkhaus
  ['dumb', 'eight', 9, [55, 12, 190], 18],       // Acht über der Ruine (Turmrest 8 m)
  ['dumb', 'line', 11, [12, 10, -132], 20],      // hin und her nördlich vor der Baustelle
  ['random', null, 8, [-92, 12, -74], 0],        // um das offene Haus
  ['random', null, 12, [-110, 12, 75], 0],       // über dem Spielplatz
  ['evade', null, 10, [40, 12, 30], 0]           // in der Mitte, weicht aus
];
// Schwebende Ziele neben Baustelle, Ruine und Parkhaus: [x, Höhe, z]
const STATIC = [[30, 12, -150], [70, 10, 175], [176, 12, -116]];
export const REGION = 22;
// Kleinster Abstand eines Punkts zu allen Hindernissen (Karte und Testecken)
export function obstDist(p) {
  let d = 1e9;
  for (const list of [colliders, town]) for (const c of list) {
    const dx = p[0] - c.c[0], dz = p[2] - c.c[2], lx = dx*c.cs - dz*c.sn, lz = dx*c.sn + dz*c.cs;
    d = Math.min(d, Math.hypot(Math.max(0, Math.abs(lx) - c.h[0]), Math.max(0, Math.abs(p[1] - c.c[1]) - c.h[1]), Math.max(0, Math.abs(lz) - c.h[2])));
  }
  return d;
}
// Ist die gerade Strecke a->b mindestens m Meter von allen Hindernissen entfernt? (Probe alle 2 m)
function flightClear(a, b, m) {
  const n = Math.max(1, Math.ceil(vLen(vSub(b, a))/2));
  for (let i = 0; i <= n; i++) if (obstDist(vAdd(a, vScale(vSub(b, a), i/n))) < m) return false;
  return true;
}
let R = rng(7);

function routePos(t, time) {
  const c = t.c, ph = t.phase + time*t.speed/t.size;
  if (t.route === 'circle') return [c[0] + Math.cos(ph)*t.size, c[1], c[2] + Math.sin(ph)*t.size];
  if (t.route === 'eight') return [c[0] + Math.sin(ph)*t.size, c[1] + Math.sin(ph*2)*1.5, c[2] + Math.sin(ph)*Math.cos(ph)*t.size];
  const s = Math.asin(Math.sin(ph))/(Math.PI/2);   // Hin und Her
  return [c[0] + s*t.size, c[1], c[2]];
}
function newWaypoint(t) {   // neuer Wegpunkt im eigenen Bereich, nur wenn der Weg dorthin frei ist (sonst bis zu 12 Versuche)
  let w = null;
  for (let k = 0; k < 12; k++) {
    const a = R()*Math.PI*2, d = Math.sqrt(R())*REGION*0.85;
    w = [t.c[0] + Math.cos(a)*d, 9 + R()*7, t.c[2] + Math.sin(a)*d];
    if (flightClear(t.p, w, 2.5)) return w;
  }
  return t.c.slice();   // Notfall: zurück zur Mitte des Bereichs
}

// speedScale: Schwierigkeit (leicht langsamer, schwer schneller)
export function initTargets(speedScale = 1) {
  R = rng(7); targets.length = 0;
  SETUP.forEach(([beh, route, speed, c0, size]) => {
    const c = c0.slice();
    const t = { beh, route, speed: speed*speedScale, c, size: size || 12, phase: R()*6, p: c.slice(), v: [0, 0, 0],
                state: 'fly', spin: 0, ang: 0, wp: null, time: 0 };
    if (beh === 'dumb') t.p = routePos(t, 0);
    targets.push(t);
  });
  for (const c0 of STATIC) {
    const c = c0.slice();
    targets.push({ beh: 'static', route: null, speed: 0, c, size: 0, phase: 0, p: c.slice(), v: [0, 0, 0], state: 'fly', spin: 0, ang: 0, wp: null, time: 0 });
  }
  targets.forEach((t, i) => { t.bal = newBalloon(t.p, i); });   // Ballon für Stufe „Leicht“
}

// Kleinster Abstand zweier Punkte, die sich im Schritt gleichförmig bewegen (a0->a1, b0->b1)
export function sweptDist(a0, a1, b0, b1) {
  const r0 = vSub(a0, b0), dr = vSub(vSub(a1, a0), vSub(b1, b0));
  const dd = vDot(dr, dr), s = dd < 1e-12 ? 0 : clamp(-vDot(r0, dr)/dd, 0, 1);
  return vLen(vAdd(r0, vScale(dr, s)));
}

// Ein Schritt: Ziele bewegen, Treffer durch den Spieler (Weg a->b) prüfen. Ergebnis: Anzahl neuer Treffer.
// balloons: Stufe „Leicht“, Treffer nur über den Ballon (die Ziel-Drohne selbst zählt dann nicht).
export function stepTargets(h, a, b, player, balloons = false) {
  let hits = 0;
  for (const t of targets) {
    const p0 = t.p.slice();
    if (t.state === 'fly') {
      t.time += h;
      if (t.beh === 'static') {
        t.v = [0, 0, 0];   // schwebt auf der Stelle
      } else if (t.beh === 'dumb') {
        t.p = routePos(t, t.time); t.v = vScale(vSub(t.p, p0), 1/h);
      } else {
        if (!t.wp || vLen(vSub(t.wp, t.p)) < 3) t.wp = newWaypoint(t);
        let want = vScale(vSub(t.wp, t.p), 1);
        const away = vSub(t.p, player);
        if (t.beh === 'evade' && vLen(away) < 25) want = vAdd(vScale(away, 3), [0, (R() - 0.5)*20, 0]);   // fliehen, etwas Höhe wechseln
        const off = vSub(t.p, t.c); off[1] = 0;
        if (vLen(off) > REGION*0.9) want = vAdd(want, vScale(off, -2));   // zurück in den eigenen Bereich
        const wl = vLen(want) || 1, dv = vSub(vScale(want, t.speed/wl), t.v), dl = vLen(dv), amax = 12*h;
        t.v = vAdd(t.v, dl > amax ? vScale(dv, amax/dl) : dv);
        t.p = vAdd(t.p, vScale(t.v, h));
        t.p[1] = clamp(t.p[1], 6, 18);
      }
      if (t.bal) stepBalloon(t.bal, t.p, h);   // Ballon an der Leine hinter der Ziel-Drohne
      if (balloons ? popBalloon(t.bal, a, b, 0.15) : sweptDist(a, b, p0, t.p) < HUNT.hitR) {
        t.state = 'fall'; t.spin = 8 + R()*8; hits++;
        t.v = vAdd(vScale(t.v, 0.3), vScale(vSub(b, a), 0.4/h));   // Stoß in Flugrichtung des Spielers
      }
    } else if (t.state === 'fall') {
      t.v[1] -= 9.81*h; t.v = vScale(t.v, 1 - 0.3*h);
      t.p = vAdd(t.p, vScale(t.v, h)); t.ang += t.spin*h;
      if (t.p[1] <= 0.1) { t.p[1] = 0.1; t.state = 'down'; t.v = [0, 0, 0]; }
    }
  }
  return hits;
}
