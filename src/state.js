/* Gemeinsamer Zustand aller Module: Einstellungen, Spielzustand, Eingabewerte, Meldungen.
   Ohne DOM, in Node testbar. Werte, die mehrere Module neu setzen, liegen in Objekten,
   weil ein ES-Modul importierte Variablen nicht neu zuweisen darf. */

/* ---------- Einstellungen ---------- */
// Versionsangabe, beim Build eingesetzt (tools/build.mjs): „Version 1.<Commits> (Datum, Hash)“
export const VERSION = '%%VERSION%%';
export const STORE_CFG = 'fpvsim1.cfg';
export const STORE_BEST = 'fpvsim1.best';
export const cfg = { mode: 'angle', tilt: 20, sound: true, cam: 'fpv', analog: true, propsView: true, gpPreset: 'auto', gpMap: null, scen: 'gates',
  diff: 'mid', drone: { preset: '5' }, video: 'clean', osd: {}, huntX: 5, gfx: (globalThis.matchMedia && matchMedia('(pointer:coarse)').matches) ? 'mid' : 'nice',   // Handy: erst "Mittel" (Annahme: schwächere Grafik)
  batWarn: 3.5, batMin: 3.3, dmg: 'off', infBat: true,   // Schaden standardmäßig aus; Akku unendlich
  fov: 110, needArm: false, autoRes: true,
  gpSw: {}, gpCal: {},
  ghost: false, trail: true, vol: 0.7, keys: {}, fc: 'own', vision: 'normal',
  rwSrc: 'emb', rwLL: '', rwSources: [], rwStream: true, rwShow: {}, verbund: false, disPort: 3000, disEx: 1, disLL: '', disH: 0, disKeep: false, warhead: 'none', flight: 'course', world: 'map', tac: 'recon',   // verbund: DIS-Modus über die Brücke; Port, Übung; Einheiten behalten bis zur Abmeldung; Ort und Höhe (NHN) der Übung für rwSrc 'dis'
    // echte Welt: eingebettetes Monschau oder Ort per Koordinate laden; eigene Quellen (L3)
  // Raten wie Betaflight „Actual“: [Mitte °/s, Maximum °/s, Expo %], für Rollen/Nicken und Gieren. Gelten für beide Regler.
  // Vorgabe nahe der früheren Kurve (max. 450 °/s), nicht die Betaflight-Vorgabe 70/670/0 (für Einsteiger zu steil).
  rates: { rp: [250, 450, 45], yaw: [190, 290, 30] } };   // vision: Bildmodus normal, thermal (Wärmebild), night (Nachtsicht)   // fc: Regler 'own' (eigener) oder 'bf' (Betaflight)
// Vorgaben für den ersten Start (Demo): Torkurs, Spielstil „Lernen“ (Angle, kein Schaden, Akku unendlich, Flugspur),
// Bild ohne Rauschen. gpSw/gpCal: Schalter-Belegung und Kalibrierung der Funke. vol: Lautstärke 0..1.
// keys: eigene Tastenbelegung (nur Abweichungen von KEY_FN).
/* ---------- Tastenbelegung ---------- */
// [Funktion, Name im Menü, Vorgabe als KeyboardEvent.code]. Esc und P (Menü) sowie + und − (Blickfeld) bleiben fest.
export const KEY_FN = [
  ['thrUp', 'Gas mehr', 'KeyW'], ['thrDown', 'Gas weniger', 'KeyS'],
  ['yawL', 'Gieren links', 'KeyA'], ['yawR', 'Gieren rechts', 'KeyD'],
  ['pitchF', 'Nase runter', 'ArrowUp'], ['pitchB', 'Nase hoch', 'ArrowDown'],
  ['rollL', 'Rollen links', 'ArrowLeft'], ['rollR', 'Rollen rechts', 'ArrowRight'],
  ['arm', 'Scharf / aus', 'Space'], ['mode', 'Angle / Acro', 'KeyM'],
  ['reset', 'Neustart', 'KeyR'], ['cam', 'Kamera', 'KeyV'], ['rewind', 'Zurückspulen', 'KeyZ'], ['vision', 'Wärme/Nacht', 'KeyN'],
  ['freeze', 'Einfrieren', 'KeyF'],
  ['tiltUp', 'Kamera höher', 'PageUp'], ['tiltDown', 'Kamera tiefer', 'PageDown']
];
// Knüppel-Paare der Tastatur (Reiter Steuerung, Bereich Knüppel; Hilfe): [Name, Funktion, Gegenfunktion, Beschriftung].
// Die übrigen Funktionen aus KEY_FN stehen im Bereich Funktionen; jede Funktion genau einmal (docs/plan-menue.md)
export const KEY_STICKS = [['Gas', 'thrUp', 'thrDown', 'mehr / weniger'], ['Gieren', 'yawL', 'yawR', 'links / rechts'],
  ['Nicken', 'pitchF', 'pitchB', 'Nase runter / hoch'], ['Rollen', 'rollL', 'rollR', 'links / rechts']];
export const KEY_RESERVED = ['Escape', 'KeyP'];
export const keyLearn = { fn: null };   // Menü wartet auf eine Taste für diese Funktion
const KEY_DEFAULT = Object.fromEntries(KEY_FN.map(([fn, , code]) => [fn, code]));
export const keyOf = fn => (cfg.keys && cfg.keys[fn]) || KEY_DEFAULT[fn];
// Alle Funktionen, die auf einer Taste liegen
export const keyFns = code => KEY_FN.filter(([fn]) => keyOf(fn) === code).map(([fn]) => fn);
// Taste für eine Funktion setzen. Lag die Taste schon auf einer anderen Funktion, tauschen beide.
export function setKey(fn, code) {
  if (KEY_RESERVED.includes(code)) return false;
  const old = keyOf(fn), k = { ...(cfg.keys || {}) };
  for (const other of keyFns(code)) if (other !== fn) k[other] = old;
  k[fn] = code;
  for (const [f, , def] of KEY_FN) if (k[f] === def) delete k[f];   // nur Abweichungen speichern
  cfg.keys = k;
  return true;
}
// Anzeigename einer Taste
export function keyName(code) {
  const named = { Space: 'Leertaste', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', PageUp: 'Bild ↑', PageDown: 'Bild ↓',
    ShiftLeft: 'Shift L', ShiftRight: 'Shift R', ControlLeft: 'Strg L', ControlRight: 'Strg R', AltLeft: 'Alt', AltRight: 'AltGr',
    Enter: 'Enter', Backspace: '⌫', Tab: 'Tab', Home: 'Pos1', End: 'Ende', Insert: 'Einfg', Delete: 'Entf' };
  if (named[code]) return named[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
  return code;
}

let storedCfg = {};
try { storedCfg = JSON.parse(localStorage.getItem(STORE_CFG) || '{}') || {}; } catch (e) {}
Object.assign(cfg, storedCfg);
cfgMigrate(cfg);
// Menü mit Flugart und Welt (Etappe T1): alte Wahl „Echte Welt“ (scen 'real') wird Welt 'real' mit Freiflug, die Vorschau der
// Grundtypen ist kein Modus mehr. Alte DIS-Wahl (verbund) bleibt: Startort „DIS-Übung“.
// DIS-Übung ist seit der Neuordnung der Menüs (docs/plan-menue.md) eine Flugart im Hauptmenü, kein Startort mehr:
// flight 'dis'; verbund bleibt als Flagge für main, hud und scenario und folgt nur noch flight. Die ebene Fläche (rwSrc 'dis')
// gibt es nur in der DIS-Übung, sonst startete ein Parcours darauf.
export function cfgMigrate(c) {
  if (c.scen === 'real') { c.world = 'real'; c.scen = 'free'; }
  if (c.scen === 'vbs') c.scen = 'gates';
  if (c.verbund && c.flight !== 'dis') c.flight = 'dis';   // alte Wahl „Startort DIS-Übung“ wird die Flugart DIS-Übung
  if (!['course', 'tactical', 'dis'].includes(c.flight)) c.flight = 'course';
  c.verbund = c.flight === 'dis';
  if (c.world !== 'map' && c.world !== 'real') c.world = 'map';
  if (c.rwSrc === 'dis' && c.flight !== 'dis') c.rwSrc = 'emb';
  return c;
}
// Raten: Ältere Einstellungen kannten nur cfg.rate (max. Drehrate). Daraus Mitte, Maximum und Expo ableiten.
if (!storedCfg.rates && storedCfg.rate) { const r = Math.min(900, Math.max(200, +storedCfg.rate || 450)), t = x => Math.round(x/10)*10;
  cfg.rates = { rp: [t(r*0.55), t(r), 45], yaw: [t(r*0.42), t(r*0.65), 30] }; }
delete cfg.rate;
// Bildmodus: 'analog' | 'digital' | 'clean'. Ältere Einstellungen kannten nur cfg.analog.
if (!storedCfg.video && 'analog' in storedCfg) cfg.video = storedCfg.analog === false ? 'clean' : 'analog';

/* ---------- Spielzustand ---------- */
export const game = {
  sim: null,
  home: [0, 0], homeYaw: 0,   // Startpunkt x, z (Freiflug: in der kleinen Stadt), Blickrichtung beim Start (0 = Nase nach -z)
  state: 'fly',          // 'fly' | 'crashed'
  frozen: false,         // Einfrieren (Taste F, nur Lernen und Gott-Modus): Drohne steht in der Luft, die Zeit des Flugs ruht
  paused: true, started: false,
  crashes: 0,
  throttle: 0,
  best: null,
  camPos: [0, 1.2, 3], camHeading: [0, 0, -1],
  last: 0,               // Zeitstempel des letzten Bildes (Hauptschleife)
  scenRun: 'gates',      // Szenario des laufenden Flugs (cfg.scen ist die Auswahl im Menü)
  armed: true,           // scharf geschaltet: Motoren und Regler aktiv
  banner: null,          // großer Text in der Bildmitte { text, sub, until }
  pendingRespawn: false, // Drohne nach diesem Physikschritt neu starten (Jagd nach Treffer)
  payload: 0             // Masse eines getragenen Pakets in kg
};
// Bestzeit je Szenario und Welt (game.bestScen, setzt setScenario; in der echten Welt mit „.real“, Echte-Welt-Freiflug heißt
// weiter „real“). Der Torkurs behält den alten Schlüssel.
const bestKey = () => { const k = game.bestScen || cfg.scen; return k === 'gates' ? STORE_BEST : STORE_BEST + '.' + k; };
export function loadBest() {
  game.best = null;
  try { const b = parseFloat(localStorage.getItem(bestKey())); if (b > 0) game.best = b; } catch (e) {}
}
loadBest();
export function saveCfg() { try { localStorage.setItem(STORE_CFG, JSON.stringify(cfg)); } catch (e) {} }
// Gefundene Ostereier (Indizes in EGGS), eigener Speicher: bleibt beim Zurücksetzen der Einstellungen erhalten
export const STORE_EGGS = 'fpvsim1.eggs';
export const eggsFound = [];
try { for (const i of JSON.parse(localStorage.getItem(STORE_EGGS) || '[]')) if (Number.isInteger(i) && !eggsFound.includes(i)) eggsFound.push(i); } catch (e) {}
export function saveEggs() { try { localStorage.setItem(STORE_EGGS, JSON.stringify(eggsFound)); } catch (e) {} }
export function saveBest() { try { localStorage.setItem(bestKey(), String(game.best)); } catch (e) {} }

/* ---------- Eingabewerte ---------- */
export const kb = { pitch: 0, roll: 0, yaw: 0 };
export const tch = { pitch: 0, roll: 0, yaw: 0 };
export const inp = { pitch: 0, roll: 0, yaw: 0 };
export const keys = new Set();
export const ptr = new Map();

/* ---------- Meldungen im OSD ---------- */
export const messages = [];
// Großer Text in der Bildmitte, z. B. „ZIEL GETROFFEN“
export function banner(text, sub = '', dur = 2.5) { game.banner = { text, sub, until: performance.now() + dur*1000 }; }
// Gleiche Meldung, die noch zu sehen ist, wird nur verlängert (sonst stapeln sich Wiederholungen).
export function say(text, dur = 1.6) {
  const until = performance.now() + dur*1000, m = messages.find(x => x.text === text && x.until > performance.now());
  if (m) m.until = Math.max(m.until, until); else messages.push({ text, until });
}
