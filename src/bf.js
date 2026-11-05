/* Betaflight als Regler (P4): echtes Betaflight als WebAssembly (sitl/betaflight.wasm, GPLv3).
   Ohne DOM, in Node testbar. Der Build ersetzt den Platzhalter in BF_WASM durch die Datei als Base64.
   Tests geben die Bytes direkt mit bfLoad(). Fehlt Betaflight oder lädt es nicht, fliegt der eigene Regler. */
import { clamp, qRot } from './math.js';
import { say } from './state.js';

export const BF_WASM = '%%BF_WASM%%';
export const bf = { mod: null, x: null, ready: false, err: '', vPrev: [0, 0, 0] };
const BF_MATH_FN = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'exp', 'log', 'log10', 'log2', 'pow', 'cbrt', 'hypot', 'tanh'];
const R2D = 180/Math.PI;

export function bfLoad(bytes) {
  try { bf.mod = new WebAssembly.Module(bytes); bf.err = ''; return true; }
  catch (e) { bf.mod = null; bf.err = String(e); return false; }
}
// Base64 in Bytes (atob gibt es im Browser und in Node)
export function bfDecode(b64) {
  const s = atob(b64), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
// Neu starten (bei jedem Neustart der Drohne): frische Instanz, Einstellungen, 1,5 s Vorlauf mit AUX1 aus,
// damit Funksignal und Kreisel-Abgleich bereit sind. Danach folgt AUX1 dem Scharf-Zustand des Spiels.
export function bfStart() {
  bf.ready = false;
  if (!bf.mod && BF_WASM.length > 1000 && !bf.err) bfLoad(bfDecode(BF_WASM));
  if (!bf.mod) return false;
  try {
    const env = {};   // Hardware-Funktionen ohne Gegenstück im Browser: geben 0 zurück
    for (const i of WebAssembly.Module.imports(bf.mod)) if (i.module === 'env') env[i.name] = () => 0;
    const math = Object.fromEntries(BF_MATH_FN.map(n => [n, Math[n]]));
    const x = new WebAssembly.Instance(bf.mod, { env, math }).exports;
    x.__wasm_call_ctors(); x.bf_init();
    x.bf_set_acc(0, 0, 9.81); x.bf_set_gyro(0, 0, 0);
    x.bf_step(1500000);
    bf.x = x; bf.ready = true; bf.vPrev = [0, 0, 0];
    return true;
  } catch (e) { bf.err = String(e); bf.x = null; return false; }
}
// Ein Physikschritt mit Betaflight. s: Zustand der Drohne, h: Schrittweite in s.
// Gibt die Motorbefehle 0..1 in unserer Reihenfolge zurück (MOTORS: vorne rechts, vorne links, hinten rechts, hinten links).
export function bfStep(s, h, armed, angle, thr, roll, pitch, yaw) {
  const x = bf.x;
  // Kreisel: unser Körper (x rechts, y oben, z hinten) -> Betaflight (x vorne, y links, z oben), in °/s
  x.bf_set_gyro(-s.w[2]*R2D, -s.w[0]*R2D, s.w[1]*R2D);
  // Beschleunigungssensor misst die spezifische Kraft: Beschleunigung minus Schwerkraft (ruhig: 1 g nach oben)
  const a = [(s.v[0] - bf.vPrev[0])/h, (s.v[1] - bf.vPrev[1])/h + 9.81, (s.v[2] - bf.vPrev[2])/h];
  bf.vPrev = s.v.slice();
  const fb = qRot([-s.q[0], -s.q[1], -s.q[2], s.q[3]], a);
  x.bf_set_acc(clamp(-fb[2], -150, 150), clamp(-fb[0], -150, 150), clamp(fb[1], -150, 150));
  // Funk: AETR, 1000..2000 µs; AUX1 scharf, AUX2 Angle
  x.bf_set_rc(0, Math.round(1500 + 500*clamp(roll, -1, 1)));
  x.bf_set_rc(1, Math.round(1500 + 500*clamp(pitch, -1, 1)));
  x.bf_set_rc(2, Math.round(1000 + 1000*clamp(thr, 0, 1)));
  x.bf_set_rc(3, Math.round(1500 + 500*clamp(yaw, -1, 1)));
  x.bf_set_rc(4, armed ? 2000 : 1000);
  x.bf_set_rc(5, angle ? 2000 : 1000);
  x.bf_step(Math.round(h*1e6));
  // Betaflight Quad-X: 1 hinten rechts, 2 vorne rechts, 3 hinten links, 4 vorne links
  return [x.bf_motor(1), x.bf_motor(3), x.bf_motor(0), x.bf_motor(2)];
}
// Meldung, falls Betaflight gewählt ist, aber nicht startet
export function bfFallbackNote() { say('Betaflight nicht verfügbar, eigener Regler aktiv', 2.5); }
