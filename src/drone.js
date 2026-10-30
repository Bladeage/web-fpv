/* Drohnen-Vorlagen. Ohne DOM, in Node testbar.
   Alle Werte sind Schätzungen für das vereinfachte Flugmodell aus Stufe 1, keine Messwerte.
   Trägheit, Gewicht und Größe wirken erst mit Physik 2.0 (E2/E3). */
import { PHYS, BAT } from './physics.js';

export const DRONES = {
  // 3-Zoll-Cinewhoop: Schutzringe = mehr Luftwiderstand, schwächerer Schub, kleiner Akku (Annahme 4S 850 mAh, ca. 45 A Vollgas)
  '3': { name: '3" Cinewhoop', info: 'Klein und träge, mit Schutzringen. Gut für enge Stellen.',
         twr: 3.2, spool: 0.03, drag1: 0.18, drag2: 0.06, rateTau: 0.035, cells: 4, cap: 850, ri: 0.035, amax: 45, vnom: 15.8 },
  // 5-Zoll-Freestyle: genau die Werte aus Stufe 1 (legacy)
  '5': { name: '5" Freestyle', info: 'Der Standard. Kräftig und wendig.',
         twr: 4.2, spool: 0.035, drag1: 0.12, drag2: 0.035, rateTau: 0.04, cells: 4, cap: 1500, ri: 0.025, amax: 95, vnom: 15.8 },
  // 7-Zoll-Langstrecke: großer 6S-Akku, weniger Überschuss-Schub, langsamere Reaktion (Annahme 6S 3000 mAh, ca. 70 A Vollgas)
  '7': { name: '7" Long Range', info: 'Groß und ausdauernd. Reagiert langsamer.',
         twr: 2.8, spool: 0.05, drag1: 0.10, drag2: 0.022, rateTau: 0.06, cells: 6, cap: 3000, ri: 0.03, amax: 70, vnom: 23.7 }
};

// Vorlage (cfg.drone.preset) mit eigenen Änderungen (twr, cap, cells) auf PHYS und BAT anwenden.
export function applyDrone(d) {
  const p = DRONES[d.preset] || DRONES['5'];
  PHYS.twr = d.twr ?? p.twr;
  PHYS.spool = p.spool; PHYS.drag1 = p.drag1; PHYS.drag2 = p.drag2; PHYS.rateTau = p.rateTau;
  BAT.cells = d.cells ?? p.cells; BAT.cap = d.cap ?? p.cap; BAT.ri = p.ri; BAT.amax = p.amax;
  BAT.vnom = p.vnom;   // Auslegung der Motoren; ein 6S-Akku an einer 4S-Drohne gibt deutlich mehr Schub
  BAT.r2 = p.ri*0.8;
}
