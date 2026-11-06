/* Pilot (Nutzerwunsch 05.11.2026): Figur hinter dem Startplatz mit Funke in der Hand. Von hier geht das Signal aus.
   Stil wie die Stadt (Quader). Dreht sich langsam zur Drohne, der Kopf schaut ihr nach. Keine Kollision.
   Ohne DOM, in Node testbar. */
import { MeshBuilder } from './world.js';
import { game } from './state.js';
import { clamp } from './math.js';
import { groundH } from './realworld.js';

// Standort relativ zum Startpunkt: hinten links (die Drohne startet mit der Nase nach -z). Antenne der Funke in 1,35 m Höhe.
// Größe: 1,78 m (Schätzung: durchschnittlicher Erwachsener).
export const PILOT_POS = { off: [-1.6, 3.6], antenna: 1.35, turn: 1.2, headMax: 0.9 };   // turn: höchstens 1,2 rad/s (langsam)
export const pilot = { p: [PILOT_POS.off[0], 0, PILOT_POS.off[1]], yaw: 0, head: 0, headPitch: 0 };

export function placePilot() {
  // Versatz mit der Startrichtung gedreht (hinter der Drohne), Füße auf dem Boden
  const y = game.homeYaw || 0, c = Math.cos(y), s = Math.sin(y), [ox, oz] = PILOT_POS.off;
  const x = game.home[0] + ox*c + oz*s, z = game.home[1] - ox*s + oz*c;
  pilot.p = [x, groundH(x, z), z];
  pilot.yaw = Math.atan2(x - game.home[0], z - game.home[1]);   // schaut zum Startplatz
  pilot.head = 0; pilot.headPitch = 0;
  return pilot.p;
}
// Winkel auf -π..π
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
// Ein Schritt: Körper dreht langsam zur Drohne, der Kopf folgt schneller (bis ±50° zum Körper) und schaut nach oben.
export function stepPilot(dt, drone) {
  const dx = drone[0] - pilot.p[0], dz = drone[2] - pilot.p[2], dist = Math.hypot(dx, dz);
  if (dist < 0.3) return;
  const want = Math.atan2(-dx, -dz);   // Blickrichtung -z bei yaw 0
  const err = wrap(want - pilot.yaw);
  if (Math.abs(err) > 0.35) pilot.yaw = wrap(pilot.yaw + clamp(err, -PILOT_POS.turn*dt, PILOT_POS.turn*dt));   // kleine Abweichung: Körper bleibt stehen
  const headWant = clamp(wrap(want - pilot.yaw), -PILOT_POS.headMax, PILOT_POS.headMax);
  pilot.head += (headWant - pilot.head)*Math.min(1, dt*4);
  const pitchWant = clamp(Math.atan2(drone[1] - pilot.p[1] - 1.65, dist), -0.4, 1.0);
  pilot.headPitch += (pitchWant - pilot.headPitch)*Math.min(1, dt*4);
}

// Modell. part 'body': Ursprung am Boden zwischen den Füßen, vorn = -z. 'head': Ursprung im Hals (1,52 m), dreht dort.
const SKIN = [0.80, 0.62, 0.50], HAIR = [0.22, 0.17, 0.13], HOOD = [0.24, 0.36, 0.42], JEANS = [0.20, 0.24, 0.33],
  SHOE = [0.14, 0.14, 0.15], RADIO = [0.16, 0.17, 0.19], STICK = [0.55, 0.56, 0.58], SCREEN = [0.45, 0.85, 0.95], GOG = [0.08, 0.08, 0.09];
export function buildPilotMesh(part) {
  const mb = new MeshBuilder();
  if (part === 'head') {
    mb.box([0, 0.06, 0], [0.04, 0.06, 0.04], 0, SKIN);              // Hals
    mb.box([0, 0.19, 0], [0.085, 0.11, 0.1], 0, SKIN);              // Kopf
    mb.box([0, 0.295, 0.01], [0.092, 0.025, 0.105], 0, HAIR);       // kurze Haare oben
    mb.box([0, 0.22, 0.09], [0.09, 0.08, 0.02], 0, HAIR);           // Hinterkopf
    for (const x of [-1, 1]) {
      mb.box([x*0.035, 0.205, -0.101], [0.014, 0.008, 0.003], 0, [0.12, 0.10, 0.09]);   // Augen
      mb.box([x*0.035, 0.228, -0.101], [0.02, 0.004, 0.003], 0, HAIR);               // Augenbrauen
    }
    mb.box([0, 0.175, -0.105], [0.012, 0.022, 0.012], 0, [0.74, 0.55, 0.44]);        // Nase
    mb.box([0, 0.135, -0.101], [0.025, 0.004, 0.003], 0, [0.55, 0.35, 0.32]);        // Mund
    mb.box([0, 0.27, -0.06], [0.095, 0.025, 0.05], 0, GOG);         // FPV-Brille auf die Stirn geschoben
    mb.box([0, 0.27, 0.02], [0.096, 0.012, 0.07], 0, GOG);          // Band der Brille
    return new Float32Array(mb.d);
  }
  for (const x of [-1, 1]) {
    mb.box([x*0.1, 0.04, -0.03], [0.055, 0.04, 0.13], 0, SHOE);     // Schuhe
    mb.box([x*0.1, 0.47, 0], [0.07, 0.4, 0.075], 0, JEANS);         // Beine
  }
  mb.box([0, 0.92, 0], [0.18, 0.08, 0.1], 0, JEANS);                // Hüfte
  mb.box([0, 1.2, 0], [0.2, 0.25, 0.12], 0, HOOD);                  // Oberkörper (Hoodie)
  mb.box([0, 1.36, 0.1], [0.12, 0.08, 0.04], 0, HOOD);              // Kapuze hinten
  for (const x of [-1, 1]) {
    mb.box([x*0.235, 1.28, -0.01], [0.05, 0.16, 0.055], 0, HOOD);   // Oberarme
    mb.box([x*0.19, 1.1, -0.13], [0.045, 0.045, 0.12], 0, HOOD);    // Unterarme nach vorn
    mb.box([x*0.125, 1.11, -0.25], [0.035, 0.03, 0.04], 0, SKIN);   // Hände an der Funke
  }
  // Funke flach in den Händen (wie echte Piloten sie halten): Gehäuse, zwei Sticks nach oben, Bildschirm, Antenne vorn
  mb.box([0, 1.12, -0.28], [0.11, 0.025, 0.07], 0, RADIO);
  for (const x of [-1, 1]) {
    mb.box([x*0.055, 1.148, -0.26], [0.016, 0.004, 0.016], 0, RADIO);   // Kardan
    mb.box([x*0.055, 1.17, -0.26], [0.004, 0.022, 0.004], 0, STICK);    // Stick
  }
  mb.box([0, 1.147, -0.31], [0.03, 0.002, 0.022], 0, SCREEN);        // Bildschirm
  mb.box([0, 1.2, -0.345], [0.006, 0.07, 0.006], 0, STICK);           // Antenne
  mb.box([0, 1.275, -0.345], [0.01, 0.012, 0.01], 0, RADIO);
  return new Float32Array(mb.d);
}
