/* Drohnen-Vorlagen. Ohne DOM, in Node testbar.
   Alle Werte sind Schätzungen aus typischen Bauteilen, keine Messwerte. Annahmen je Vorlage im Kommentar.
   Felder: arm Motor bis Mitte (m), mMotor Motor+Propeller (kg), body/bat wie PHYS, twr Schub zu Gewicht,
   kYaw Gegenmoment je N Schub (m), rotDamp Luftdämpfung der Drehung (N m s), size Modellgröße relativ zu 5 Zoll, radius Kollisionsradius (m),
   cells/cap/ri/amax/vnom Akku (vnom = Auslegungsspannung der Motoren). */
import { PHYS, BAT, computeInertia } from './physics.js';

export const DRONES = {
  // Tinywhoop 65 mm: ca. 32 g mit 1S 300 mAh, Schutzringe, sehr leicht, viel Luftwiderstand
  whoop: { name: 'Tinywhoop 65 mm', info: 'Winzig und leicht. Fliegt langsam, verzeiht viel.',
    arm: 0.032, mMotor: 0.003, body: [0.012, 0.03, 0.015, 0.03], bat: [0.008, 0.012, 0.01, 0.03, 0.012],
    twr: 2.4, spool: 0.025, drag1: 0.35, drag2: 0.25, kYaw: 0.006, rotDamp: 0.00002, size: 0.3, radius: 0.06,
    cells: 1, cap: 300, ri: 0.15, amax: 6, vnom: 3.95 },
  // 3-Zoll-Cinewhoop: ca. 410 g mit 4S 850 mAh, Schutzringe = mehr Widerstand, weniger Schubüberschuss
  '3': { name: '3" Cinewhoop', info: 'Klein und träge, mit Schutzringen. Gut für enge Stellen.',
    arm: 0.07, mMotor: 0.025, body: [0.2, 0.06, 0.04, 0.09], bat: [0.11, 0.03, 0.03, 0.065, 0.03],
    twr: 3.2, spool: 0.03, drag1: 0.18, drag2: 0.06, kYaw: 0.009, rotDamp: 0.001, size: 0.65, radius: 0.11,
    cells: 4, cap: 850, ri: 0.035, amax: 45, vnom: 15.8 },
  // 5-Zoll-Freestyle: ca. 580 g mit 4S 1500 mAh; Werte wie in PHYS/BAT vorgegeben
  '5': { name: '5" Freestyle', info: 'Der Standard. Kräftig und wendig.',
    arm: 0.11, mMotor: 0.035, body: [0.25, 0.06, 0.04, 0.12], bat: [0.19, 0.035, 0.035, 0.075, 0.035],
    twr: 4.2, spool: 0.035, drag1: 0.12, drag2: 0.035, kYaw: 0.012, rotDamp: 0.002, size: 1, radius: 0.15,
    cells: 4, cap: 1500, ri: 0.025, amax: 95, vnom: 15.8 },
  // 7-Zoll-Langstrecke: ca. 1 kg mit 6S 3000 mAh, große Propeller, träger, langsamere Motoren
  '7': { name: '7" Long Range', info: 'Groß und ausdauernd. Reagiert langsamer.',
    arm: 0.15, mMotor: 0.06, body: [0.3, 0.07, 0.05, 0.16], bat: [0.45, 0.045, 0.045, 0.11, 0.04],
    twr: 2.8, spool: 0.05, drag1: 0.10, drag2: 0.022, kYaw: 0.016, rotDamp: 0.004, size: 1.35, radius: 0.2,
    cells: 6, cap: 3000, ri: 0.03, amax: 70, vnom: 23.7 }
};
export const presetMass = p => 4*p.mMotor + p.body[0] + p.bat[0];

// Vorlage (cfg.drone.preset) mit eigenen Änderungen anwenden: twr, cap, cells, mass (Gesamtgewicht in kg).
// Mehr Gewicht skaliert alle Bauteile (also auch die Trägheit); der Regler wird auf die neue Trägheit abgestimmt.
export function applyDrone(d) {
  const p = DRONES[d.preset] || DRONES['5'];
  const m = (d.mass ?? presetMass(p))/presetMass(p);
  PHYS.arm = p.arm; PHYS.mMotor = p.mMotor*m;
  PHYS.body = [p.body[0]*m, ...p.body.slice(1)]; PHYS.bat = [p.bat[0]*m, ...p.bat.slice(1)];
  PHYS.twr = d.twr ?? p.twr;
  PHYS.spool = p.spool; PHYS.drag1 = p.drag1; PHYS.drag2 = p.drag2; PHYS.kYaw = p.kYaw; PHYS.rotDamp = p.rotDamp;
  PHYS.size = p.size; PHYS.radius = p.radius;
  BAT.cells = d.cells ?? p.cells; BAT.cap = d.cap ?? p.cap; BAT.ri = p.ri; BAT.amax = p.amax;
  BAT.vnom = p.vnom;   // Auslegung der Motoren; mehr Zellen geben deutlich mehr Schub
  BAT.r2 = p.ri*0.8;
  computeInertia();
}
