/* Ziel-Drohnen für das Szenario „Jagd“. Ohne DOM, in Node testbar.
   Bewegung kinematisch (nicht voll simuliert). Verhalten: dumm (feste Route), zufällig, ausweichend.
   Zufall mit festem Startwert, damit Tests und Bestzeiten vergleichbar bleiben. */
import { clamp, vAdd, vSub, vScale, vDot, vLen } from './math.js';
import { rng } from './world.js';

export const HUNT = { center: [30, 12, -10], radius: 70, hitR: 0.4 };   // Gebiet, Trefferabstand (Ziel 0,25 m + Spieler 0,15 m)
export const targets = [];
// Verhalten und Grundtempo in m/s je Ziel (Schätzung für ein faires Spiel)
const SETUP = [['dumb', 'circle', 7], ['dumb', 'eight', 9], ['dumb', 'line', 11], ['random', null, 8], ['random', null, 12], ['evade', null, 10]];
export const BEHAVIOR_NAME = { dumb: 'dumm', random: 'zufällig', evade: 'ausweichend' };
let R = rng(7);

function routePos(t, time) {
  const c = t.c, ph = t.phase + time*t.speed/t.size;
  if (t.route === 'circle') return [c[0] + Math.cos(ph)*t.size, c[1], c[2] + Math.sin(ph)*t.size];
  if (t.route === 'eight') return [c[0] + Math.sin(ph)*t.size, c[1] + Math.sin(ph*2)*1.5, c[2] + Math.sin(ph)*Math.cos(ph)*t.size];
  const s = Math.asin(Math.sin(ph))/(Math.PI/2);   // Hin und Her
  return [c[0] + s*t.size, c[1], c[2]];
}
function newWaypoint() {
  const a = R()*Math.PI*2, d = Math.sqrt(R())*HUNT.radius*0.9;
  return [HUNT.center[0] + Math.cos(a)*d, 9 + R()*7, HUNT.center[2] + Math.sin(a)*d];
}

// speedScale: Schwierigkeit (leicht langsamer, schwer schneller)
export function initTargets(speedScale = 1) {
  R = rng(7); targets.length = 0;
  SETUP.forEach(([beh, route, speed], i) => {
    const a = i/SETUP.length*Math.PI*2;
    const c = [HUNT.center[0] + Math.cos(a)*35, 9 + (i % 3)*3, HUNT.center[2] + Math.sin(a)*35];
    const t = { beh, route, speed: speed*speedScale, c, size: 14 + i*2, phase: R()*6, p: c.slice(), v: [0, 0, 0],
                state: 'fly', spin: 0, ang: 0, wp: null, time: 0 };
    if (beh === 'dumb') t.p = routePos(t, 0);
    targets.push(t);
  });
}
export const aliveCount = () => targets.filter(t => t.state === 'fly').length;

// Kleinster Abstand zweier Punkte, die sich im Schritt gleichförmig bewegen (a0->a1, b0->b1)
export function sweptDist(a0, a1, b0, b1) {
  const r0 = vSub(a0, b0), dr = vSub(vSub(a1, a0), vSub(b1, b0));
  const dd = vDot(dr, dr), s = dd < 1e-12 ? 0 : clamp(-vDot(r0, dr)/dd, 0, 1);
  return vLen(vAdd(r0, vScale(dr, s)));
}

// Ein Schritt: Ziele bewegen, Treffer durch den Spieler (Weg a->b) prüfen. Ergebnis: Anzahl neuer Treffer.
export function stepTargets(h, a, b, player) {
  let hits = 0;
  for (const t of targets) {
    const p0 = t.p.slice();
    if (t.state === 'fly') {
      t.time += h;
      if (t.beh === 'dumb') {
        t.p = routePos(t, t.time); t.v = vScale(vSub(t.p, p0), 1/h);
      } else {
        if (!t.wp || vLen(vSub(t.wp, t.p)) < 3) t.wp = newWaypoint();
        let want = vScale(vSub(t.wp, t.p), 1);
        const away = vSub(t.p, player);
        if (t.beh === 'evade' && vLen(away) < 25) want = vAdd(vScale(away, 3), [0, (R() - 0.5)*20, 0]);   // fliehen, etwas Höhe wechseln
        const off = vSub(t.p, HUNT.center); off[1] = 0;
        if (vLen(off) > HUNT.radius) want = vScale(off, -1);   // zurück ins Gebiet
        const wl = vLen(want) || 1, dv = vSub(vScale(want, t.speed/wl), t.v), dl = vLen(dv), amax = 12*h;
        t.v = vAdd(t.v, dl > amax ? vScale(dv, amax/dl) : dv);
        t.p = vAdd(t.p, vScale(t.v, h));
        t.p[1] = clamp(t.p[1], 6, 18);
      }
      if (sweptDist(a, b, p0, t.p) < HUNT.hitR) {
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
