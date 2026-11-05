/* Funkstrecke: Videosignal (5,8 GHz) und Steuerverbindung (LQ) getrennt. Ohne DOM, in Node testbar.
   Alle Dämpfungswerte sind Schätzungen für ein glaubwürdiges Spielgefühl, keine Messwerte.
   Annahmen: Das Signal geht von der Funke des Piloten aus (Figur hinter dem Startplatz, Antenne 1,35 m hoch).
   Die Stärke fällt mit dem Abstand logarithmisch (Freiraumdämpfung: je doppelte Entfernung gleich viel weniger).
   Video verliert früher und stärker als die Steuerverbindung (höhere Frequenz, weniger Sendeleistung).
   Hindernisse zwischen Pilot und Drohne dämpfen (Gebäude stark, Bäume mittel, Stangen wenig).
   Dicht am Boden in der Ferne verdeckt der Boden einen Teil der Strecke (Fresnel-Zone).
   Wie das Bild darauf reagiert, hängt vom System ab (hud.js): analog wird nach und nach verrauscht,
   digital bleibt lange sauber und bricht dann ein (Blöcke, Streifen, Ruckler, Standbild). */
import { clamp } from './math.js';
import { game } from './state.js';
import { colliders } from './world.js';
import { town } from './town.js';

export const PILOT = [-1.6, 1.35, 3.6];   // wird je Szenario auf die Funke des Piloten gesetzt (pilot.js)
export const signal = { video: 100, lq: 100, block: 0, t: 0 };

// Schneidet die Strecke a->b den gedrehten Quader c? (Quader-Koordinaten, Slab-Test)
function segHitsBox(a, b, c) {
  const loc = p => { const dx = p[0]-c.c[0], dz = p[2]-c.c[2]; return [dx*c.cs - dz*c.sn, p[1]-c.c[1], dx*c.sn + dz*c.cs]; };
  const p = loc(a), q = loc(b);
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    const d = q[i] - p[i];
    if (Math.abs(d) < 1e-9) { if (Math.abs(p[i]) > c.h[i]) return false; continue; }
    let ta = (-c.h[i] - p[i])/d, tb = (c.h[i] - p[i])/d;
    if (ta > tb) { const x = ta; ta = tb; tb = x; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}
// Dämpfung durch Hindernisse zwischen Pilot und Drohne, in Prozentpunkten Video.
// Dicke Hindernisse (Gebäude) dämpfen stark, Stämme und Stangen wenig, Baumkronen mittel.
export function obstruction(p) {
  let sum = 0;
  for (const list of [colliders, town]) for (const c of list) if (segHitsBox(PILOT, p, c)) sum += clamp(Math.min(c.h[0], c.h[2])*12, 4, 35);
  return sum;
}
// Signal ohne Schwanken: video und lq in Prozent, block = Dämpfung durch Hindernisse
export function signalTarget(p) {
  const d = Math.hypot(p[0] - PILOT[0], p[1] - PILOT[1], p[2] - PILOT[2]);   // Abstand im Raum, auch Höhe zählt
  const block = obstruction(p);
  const low = p[1] < 2 && d > 40 ? (2 - p[1])*5 : 0;   // dicht am Boden in der Ferne: Fresnel-Zone verdeckt
  // Je doppelte Entfernung: Video -38 Punkte ab 90 m, Steuerung -25 Punkte ab 180 m (Schätzung, passend zur Kartengröße)
  return {
    video: clamp(100 - 38*Math.log2(Math.max(1, d/90)) - block - low, 0, 100),
    lq: clamp(100 - 25*Math.log2(Math.max(1, d/180)) - block*0.3, 0, 100),
    block
  };
}
// Jedes Bild: Zielwerte plus langsames Schwanken (Mehrwege), geglättet
export function updSignal(dt) {
  const s = game.sim, tg = signalTarget(s.p);
  signal.t += dt;
  const d = Math.hypot(s.p[0] - PILOT[0], s.p[2] - PILOT[2]);   // Schwanken wächst mit dem Abstand zum Piloten
  const fade = clamp(d/40, 0, 6)*(Math.sin(signal.t*0.9) + 0.7*Math.sin(signal.t*2.3 + 1));
  const k = Math.min(1, dt/0.25);
  signal.video += (clamp(tg.video + fade, 0, 100) - signal.video)*k;
  signal.lq += (tg.lq - signal.lq)*k;
  signal.block = tg.block;
}
export function resetSignal() { signal.video = 100; signal.lq = 100; signal.block = 0; }
