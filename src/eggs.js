/* Ostereier (Nutzerwunsch 05.11.2026): versteckt auf der Karte, in jedem Modus und jeder Stufe an derselben Stelle.
   Berührt die Drohne ein Ei, ist es gefunden. Gefundene Eier bleiben gespeichert (cfg.eggs) und werden nicht mehr gezeigt.
   Ohne DOM, in Node testbar. */
import { MeshBuilder } from './world.js';
import { segPointDist } from './balloon.js';

// Mitte des Eis [x, y, z] und Name des Verstecks. y: Auflagefläche plus Ei-Halbhöhe (0,12 m).
export const EGGS = [
  [[-105, 0.13, 83.3], 'Sandkasten am Spielplatz'],
  [[-105, 1.67, 69], 'Podest der Rutsche'],
  [[-96, 3.22, -76], 'Obergeschoss im offenen Haus'],
  [[-96, 6.24, -72], 'Dach des offenen Hauses'],
  [[8, 4.16, -164.7], 'Gerüst der Baustelle'],
  [[18, 5.32, -158.7], 'Gestapelter Container'],
  [[15, 14.72, -172], 'Ausleger des Krans'],
  [[184, 6.67, -136], 'Mittleres Deck im Parkhaus'],
  [[62.75, 0.12, 196.75], 'Im Turmrest der Ruine'],
  [[53.75, 4.32, 194], 'Auf dem Torbogen der Ruine'],
  [[-35, 14.85, -112], 'Dach eines Hochhauses'],
  [[-11.8, 8.12, 23.66], 'Auf einer Säule nahe dem Start'],
  [[0.6, 0.12, 14.3], 'Unter dem Baum am Start']
];
// Größe als Schätzung: großes Deko-Ei, damit man es aus einigen Metern erkennt (Halbachsen in m)
export const EGG = { rx: 0.09, ry: 0.12, pick: 0.15 };
const EGG_COLORS = [[1, 0.55, 0.7], [0.55, 0.8, 1], [1, 0.85, 0.3], [0.6, 0.9, 0.5], [0.8, 0.6, 1], [1, 0.6, 0.35]];

// Weg der Drohne a -> b mit Radius r: Index des neu gefundenen Eis oder -1. found: Liste der gefundenen Indizes (wird ergänzt).
export function checkEggs(a, b, r, found) {
  for (let i = 0; i < EGGS.length; i++) {
    if (found.includes(i)) continue;
    if (segPointDist(a, b, EGGS[i][0]) < EGG.pick + r) { found.push(i); return i; }
  }
  return -1;
}
// Modell eines Eis um (0, 0, 0): Ellipsoid, oben spitzer, mit zwei Farbstreifen
export function buildEggMesh(i) {
  const mb = new MeshBuilder(), A = EGG_COLORS[i % EGG_COLORS.length], B = EGG_COLORS[(i + 2) % EGG_COLORS.length];
  const N = 10, M = 12;
  const P = (t, u) => {   // t: 0 unten .. 1 oben, u: Winkel
    const th = Math.PI*t, s = Math.sin(th), y = -Math.cos(th);
    const k = y > 0 ? 1 - 0.18*y : 1;   // obere Hälfte schmaler
    return [EGG.rx*s*k*Math.cos(u), EGG.ry*y, EGG.rx*s*k*Math.sin(u)];
  };
  for (let a = 0; a < N; a++) for (let b = 0; b < M; b++) {
    const t0 = a/N, t1 = (a + 1)/N, u0 = 2*Math.PI*b/M, u1 = 2*Math.PI*(b + 1)/M;
    const col = (a === 4 || a === 6) ? B : A;
    mb.quad(P(t0, u0), P(t1, u0), P(t1, u1), P(t0, u1), col);   // Reihenfolge: Normale nach außen
  }
  return new Float32Array(mb.d);
}
