/* Tageszeit (Nutzer, Prompt 180, Etappe N1): Tag oder Nacht als reine Darstellung. Liefert Lichtrichtung, Nebel- und
   Himmelsfarben für die Grafik. Nachts ist das Licht der Mond (Südost, 35° hoch); die Farben sind Schätzungen für eine
   klare Nacht mit etwas Restlicht. Ohne DOM, in Node testbar. */
const unitV = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0]/l, v[1]/l, v[2]/l]; };
const MOON_AZ = 135*Math.PI/180, MOON_EL = 35*Math.PI/180;   // Azimut ab Norden im Uhrzeigersinn; x Ost, z Süd
export const DAY = {
  fog: [0.80, 0.86, 0.90], zen: [0.30, 0.52, 0.80],
  nightFog: [0.03, 0.035, 0.06], nightZen: [0.02, 0.03, 0.07],
  moon: unitV([Math.sin(MOON_AZ)*Math.cos(MOON_EL), Math.sin(MOON_EL), -Math.cos(MOON_AZ)*Math.cos(MOON_EL)]),
};
// night: cfg.night; sun: Sonnenrichtung der Welt (Spielkarte und echte Welt verschieden). Rückgabe: light (Richtung des
// Lichts, auch die Scheibe am Himmel), fog, zen, night (0 oder 1)
export function dayState(night, sun) {
  return night ? { light: DAY.moon, fog: DAY.nightFog, zen: DAY.nightZen, night: 1 } : { light: sun, fog: DAY.fog, zen: DAY.zen, night: 0 };
}
