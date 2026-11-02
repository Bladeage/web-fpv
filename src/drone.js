/* Drohnen-Vorlagen. Ohne DOM, in Node testbar.
   Alle Werte sind Schätzungen aus typischen Bauteilen, keine Messwerte. Annahmen je Vorlage im Kommentar.
   Felder: arm Motor bis Mitte (m), mMotor Motor+Propeller (kg), body/bat wie PHYS,
   motor: Prüfstandswert (KV, Schub g, U/min, A, V bei Vollgas, Leerlaufstrom, Propeller Durchmesser und Steigung in Zoll),
   spool Hochlaufzeit (s), cdaF/cdaT Luftwiderstand mal Fläche von vorn/oben (m²), rotDamp Luftdämpfung der Drehung (N m s),
   size Modellgröße relativ zu 5 Zoll, radius Kollisionsradius (m),
   cells/cap Akku, ri/r2 Innenwiderstand direkt und als RC-Glied (Ohm, Schätzung für gute LiPos). */
import { PHYS, BAT, computeInertia } from './physics.js';

export const DRONES = {
  // Tinywhoop 65 mm: ca. 32 g mit 1S 300 mAh, Schutzringe, sehr leicht, viel Luftwiderstand
  whoop: { name: 'Tinywhoop 65 mm', info: 'Winzig und leicht. Fliegt langsam, verzeiht viel.',
    arm: 0.032, mMotor: 0.003, body: [0.012, 0.03, 0.015, 0.03], bat: [0.008, 0.012, 0.01, 0.03, 0.012],
    // Motor 0702 19000 KV, 31-mm-Propeller (Schätzung: ca. 32 g Schub bei 42000 U/min, 3 A)
    motor: { kv: 19000, T_g: 32, rpm: 42000, amps: 3, volts: 3.9, i0: 0.15, propD: 1.22, pitch: 0.6 },
    spool: 0.025, cdaF: 0.0012, cdaT: 0.004, rotDamp: 0.00002, size: 0.3, radius: 0.06,
    cells: 1, cap: 300, ri: 0.08, r2: 0.03 },
  // 3-Zoll-Cinewhoop: ca. 410 g mit 4S 850 mAh, Schutzringe = mehr Widerstand, weniger Schubüberschuss
  '3': { name: '3" Cinewhoop', info: 'Klein und träge, mit Schutzringen. Gut für enge Stellen.',
    arm: 0.07, mMotor: 0.025, body: [0.2, 0.06, 0.04, 0.09], bat: [0.11, 0.03, 0.03, 0.065, 0.03],
    // Motor 1507 3800 KV, 3-Zoll-Propeller im Ring (Schätzung: ca. 380 g bei 33000 U/min, 22 A)
    motor: { kv: 3800, T_g: 380, rpm: 33000, amps: 22, volts: 15.5, i0: 0.6, propD: 3, pitch: 2 },
    spool: 0.03, cdaF: 0.006, cdaT: 0.022, rotDamp: 0.001, size: 0.65, radius: 0.11,
    cells: 4, cap: 850, ri: 0.03, r2: 0.01 },
  // 5-Zoll-Freestyle: ca. 580 g mit 4S 1500 mAh; Werte wie in PHYS/BAT vorgegeben
  '5': { name: '5" Freestyle', info: 'Der Standard. Kräftig und wendig.',
    arm: 0.11, mMotor: 0.035, body: [0.25, 0.06, 0.04, 0.12], bat: [0.19, 0.035, 0.035, 0.075, 0.035],
    // Motor 2207.5 2550 KV, 5,1x4,3 Zoll: Prüfstandswert VCI Spark (1691 g, 26645 U/min, 53,9 A, 16 V)
    motor: { kv: 2550, T_g: 1691, rpm: 26645, amps: 53.9, volts: 16.0, i0: 1.2, propD: 5.1, pitch: 4.3 },
    spool: 0.035, cdaF: 0.010, cdaT: 0.035, rotDamp: 0.002, size: 1, radius: 0.15,
    cells: 4, cap: 1500, ri: 0.016, r2: 0.006 },
  // 7-Zoll-Langstrecke: ca. 1 kg mit 6S 3000 mAh, große Propeller, träger, langsamere Motoren
  '7': { name: '7" Long Range', info: 'Groß und ausdauernd. Reagiert langsamer.',
    arm: 0.15, mMotor: 0.06, body: [0.3, 0.07, 0.05, 0.16], bat: [0.45, 0.045, 0.045, 0.11, 0.04],
    // Motor 2806.5 1300 KV, 7x4 Zoll (Schätzung: ca. 2200 g bei 19500 U/min, 45 A, 6S)
    motor: { kv: 1300, T_g: 2200, rpm: 19500, amps: 45, volts: 23.5, i0: 1.0, propD: 7, pitch: 4 },
    spool: 0.05, cdaF: 0.016, cdaT: 0.06, rotDamp: 0.004, size: 1.35, radius: 0.2,
    cells: 6, cap: 3000, ri: 0.025, r2: 0.008 }
};
export const presetMass = p => 4*p.mMotor + p.body[0] + p.bat[0];
// Schub zu Gewicht laut Prüfstandswert (Näherung, ohne Spannungseinbruch)
export const presetTwr = p => 4*p.motor.T_g/1000/presetMass(p);

// Vorlage (cfg.drone.preset) mit eigenen Änderungen anwenden: twr (skaliert Schub und Propellermoment), cap, cells, mass (kg).
// Mehr Gewicht skaliert alle Bauteile (also auch die Trägheit); der Regler wird auf die neue Trägheit abgestimmt.
export function applyDrone(d) {
  const p = DRONES[d.preset] || DRONES['5'];
  const m = (d.mass ?? presetMass(p))/presetMass(p);
  PHYS.arm = p.arm; PHYS.mMotor = p.mMotor*m;
  PHYS.body = [p.body[0]*m, ...p.body.slice(1)]; PHYS.bat = [p.bat[0]*m, ...p.bat.slice(1)];
  PHYS.motor = { ...p.motor };
  PHYS.spool = p.spool; PHYS.cdaF = p.cdaF; PHYS.cdaT = p.cdaT; PHYS.rotDamp = p.rotDamp;
  PHYS.size = p.size; PHYS.radius = p.radius;
  PHYS.foot = 0.01*p.size; PHYS.propY = 0.034*p.size;   // Auflage und Propellerebene wie im Modell (Modell wird mit size skaliert)
  BAT.cells = d.cells ?? p.cells; BAT.cap = d.cap ?? p.cap; BAT.ri = p.ri;
  BAT.r2 = p.r2;
  PHYS.thrScale = 1;
  computeInertia();
  // Eigener Schub: Propeller stärker oder schwächer. Mehr Schub heißt auch mehr Moment und weniger Drehzahl, darum angenähert.
  if (d.twr) for (let k = 0; k < 8; k++) { PHYS.thrScale *= d.twr/PHYS.twr; computeInertia(); }
}
