/* Boote auf Flüssen und Seen der echten Welt (Nutzer, Prompt 178/180, Etappe L2; Plan docs/plan-nacht-strassen.md 4.2). Nur
   Belebung: keine Kollision, kein Einfluss auf die Physik; nicht in der DIS-Übung. Art nach Breite des Gewässers: Kanu, Motorboot,
   Frachter. Nachts mit Positionslicht (Lichtkennung Alpha 0,75). Alle Zahlen Schätzungen. Ohne DOM. */
import { rw, groundH, waterAt, WATER_UP } from './realworld.js';
import { ambOn } from './ambient.js';
import { MeshBuilder } from './world.js';

// kinds: Mindestbreite des Gewässers (m; Motorboot ab 30 statt 20 m wie im Plan: die Rur in Monschau ist 18 bis 27 m breit und flach,
// dort fahren Kanus), Länge, halbe Breite, Tempo (m/s), Wärme. max Boote, near/far Abstände zur Drohne (m),
// look Blick voraus (m), turn Drehrate (rad/s), gap Pause zwischen zwei Suchen (s)
export const BOAT = { max: 3, near: [100, 600], far: 900, look: 40, turn: 0.25, gap: 2, probe: 400,
  kinds: { canoe: { minW: 6, len: 4, half: 0.4, v: 1.2, heat: 0.7 }, motor: { minW: 30, len: 7, half: 1.2, v: 3, heat: 0.5 }, cargo: { minW: 120, len: 60, half: 4.5, v: 2.5, heat: 0.5 } } };
export const boats = { list: [], t: 0 };
const wet = (x, z) => !!waterAt(x, z);
// Wie weit ist es von (x, z) in Richtung a bis zum Ufer? (1-m-Schritte, höchstens max)
export function shoreDist(x, z, a, max = 60) {
  const dx = Math.cos(a), dz = Math.sin(a);
  for (let s = 1; s <= max; s++) if (!wet(x + dx*s, z + dz*s)) return s;
  return max;
}
// Breite und Längsrichtung des Gewässers an (x, z): Freiraum in 8 Richtungen, Breite = kleinste Summe gegenüberliegender Richtungen,
// Richtung = größte Ausdehnung
export function waterSpan(x, z) {
  const d = Array.from({ length: 8 }, (_, k) => shoreDist(x, z, k*Math.PI/4));
  let w = Infinity, best = 0, along = 0;
  for (let k = 0; k < 4; k++) { const s = d[k] + d[k + 4]; if (s < w) w = s; if (s > best) { best = s; along = k*Math.PI/4; } }
  return { w, along };
}
export const boatKind = w => w >= BOAT.kinds.cargo.minW ? 'cargo' : w >= BOAT.kinds.motor.minW ? 'motor' : w >= BOAT.kinds.canoe.minW ? 'canoe' : null;
// Ist der Weg von (x, z) in Richtung a frei (nass, mit seitlichem Abstand halbe Breite + 2 m)? Proben alle 2 m bis look.
export function laneFree(x, z, a, half, look = BOAT.look) {
  const dx = Math.cos(a), dz = Math.sin(a), side = half + 2;
  for (let s = 2; s <= look; s += 2) {
    const px = x + dx*s, pz = z + dz*s;
    if (!wet(px, pz) || !wet(px - dz*side, pz + dx*side) || !wet(px + dz*side, pz - dx*side)) return false;
  }
  return true;
}
export const boatY = (x, z) => groundH(x, z) + WATER_UP + 0.05;   // Wasserlinie (Spiegel liegt auf groundH + WATER_UP)
// Neues Boot: Zufallsproben 100 bis 600 m um die Drohne auf nassen Zellen, Art nach Breite, Fahrt entlang der Längsrichtung
export function newBoat(c, rand = Math.random) {
  for (let k = 0; k < BOAT.probe; k++) {
    const a = rand()*2*Math.PI, d = BOAT.near[0] + rand()*(BOAT.near[1] - BOAT.near[0]), x = c[0] + Math.cos(a)*d, z = c[2] + Math.sin(a)*d;
    if (!wet(x, z)) continue;
    const S = waterSpan(x, z), kind = boatKind(S.w); if (!kind) continue;
    const K = BOAT.kinds[kind], head = S.along + (rand() < 0.5 ? 0 : Math.PI);
    if (!laneFree(x, z, head, K.half, Math.min(BOAT.look, K.len))) continue;
    return { kind, x, z, y: boatY(x, z), head, want: head, v: K.v*(0.85 + 0.3*rand()), t: 0 };
  }
  return null;
}
// Ein Schritt: fahren; alle 0,5 s den Weg voraus prüfen und bei Bedarf den Kurs um ±20°, ±40°, ±60° drehen, sonst wenden
export function boatsStep(h, c, rand = Math.random) {
  if (!ambOn() || !rw.water) { boats.list.length = 0; return; }   // auch nachts (mit Licht); ohne Ebene Gewässer keine Boote
  for (const b of boats.list) {
    const K = BOAT.kinds[b.kind];
    if ((b.t -= h) <= 0) {
      b.t = 0.5;
      if (!laneFree(b.x, b.z, b.want, K.half)) {
        let ok = null;
        for (const d of [20, -20, 40, -40, 60, -60]) { const a = b.head + d*Math.PI/180; if (laneFree(b.x, b.z, a, K.half)) { ok = a; break; } }
        b.want = ok !== null ? ok : b.head + Math.PI;
      }
    }
    let d = ((b.want - b.head + Math.PI) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI) - Math.PI;
    b.head += Math.max(-BOAT.turn*h, Math.min(BOAT.turn*h, d));
    const nx = b.x + Math.cos(b.head)*b.v*h, nz = b.z + Math.sin(b.head)*b.v*h;
    if (wet(nx, nz)) { b.x = nx; b.z = nz; }   // nie ans Land fahren; steht es, dreht es weiter
    b.y = boatY(b.x, b.z);
  }
  boats.list = boats.list.filter(b => Math.hypot(b.x - c[0], b.z - c[2]) < BOAT.far);
  if (boats.list.length < BOAT.max && (boats.t -= h) <= 0) { boats.t = BOAT.gap; const b = newBoat(c, rand); if (b) boats.list.push(b); }
}
// Yaw für mFromQT (Modell schaut nach -z): Kurs a ist der Winkel in der Ebene x Ost, z Süd
export const boatYaw = a => Math.atan2(-Math.cos(a), -Math.sin(a));

// Netze je Art (Länge entlang -z = Bug). Rumpf mit spitzem Bug aus Dreiecken, Kajüte, Positionslicht (Alpha 0,75).
export function buildBoatMesh(kind) {
  const mb = new MeshBuilder(), K = BOAT.kinds[kind], L = K.len/2, W = K.half, light = [1, 0.95, 0.8, 0.75];
  const hull = kind === 'canoe' ? [0.75, 0.3, 0.12] : kind === 'motor' ? [0.92, 0.92, 0.9] : [0.22, 0.24, 0.3];
  const H = kind === 'canoe' ? 0.35 : kind === 'motor' ? 0.9 : 4, D = kind === 'cargo' ? 1.0 : 0.15;   // Höhe über und Tiefgang unter der Wasserlinie
  const bow = kind === 'cargo' ? L*0.85 : L*0.55;   // ab hier läuft der Rumpf zum Bug spitz zu
  const P = (x, y, z) => [x, y, z];
  // Seiten, Deck und Heck als Prisma mit Spitze
  const ring = y => [P(-W, y, L), P(W, y, L), P(W, y, -bow), P(0, y, -L), P(-W, y, -bow)];
  const top = ring(H), bot = ring(-D);
  for (let i = 0; i < 5; i++) { const j = (i + 1) % 5; mb.quad(bot[i], bot[j], top[j], top[i], hull); }
  const deck = kind === 'cargo' ? [0.35, 0.3, 0.25] : kind === 'canoe' ? [0.3, 0.16, 0.08] : [0.8, 0.78, 0.72];
  mb.tri(top[0], top[1], top[2], deck); mb.tri(top[0], top[2], top[4], deck); mb.tri(top[4], top[2], top[3], deck);
  if (kind === 'canoe') {   // Person im Kanu
    mb.box([0, H + 0.3, 0.2], [0.2, 0.3, 0.15], 0, [0.2, 0.35, 0.6]); mb.blob([0, H + 0.72, 0.2], [0.12, 0.13, 0.12], [0.85, 0.7, 0.55]);
    mb.box([0, H + 0.45, 0.2], [0.9, 0.02, 0.05], 0.6, [0.4, 0.3, 0.2]);   // Paddel quer
  } else if (kind === 'motor') {
    mb.box([0, H + 0.55, 0.6], [W*0.75, 0.55, L*0.35], 0, [0.95, 0.95, 0.95]); mb.box([0, H + 0.75, -0.05], [W*0.7, 0.3, 0.03], 0, [0.2, 0.28, 0.36]);   // Kajüte, Scheibe
    mb.box([0, H + 1.2, 0.6], [0.08, 0.08, 0.08], 0, light);
  } else {
    for (let k = 0; k < 4; k++) mb.box([0, H + 1.3, -L*0.6 + k*L*0.27], [W*0.9, 1.3, L*0.12], 0, [[0.7, 0.2, 0.15], [0.15, 0.35, 0.6], [0.75, 0.6, 0.2], [0.3, 0.5, 0.3]][k]);   // Container
    mb.box([0, H + 3, L*0.85], [W*0.9, 3, 3], 0, [0.92, 0.92, 0.9]); mb.box([0, H + 4.5, L*0.85 - 3.02], [W*0.8, 0.6, 0.02], 0, [0.2, 0.28, 0.36]);   // Brücke, Fenster
    mb.box([0, H + 6.4, L*0.85], [0.15, 0.15, 0.15], 0, light); mb.box([0, H + 0.6, -L + 1], [0.12, 0.12, 0.12], 0, light);
  }
  return new Float32Array(mb.d);
}
