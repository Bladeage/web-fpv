/* Physik (Stufe 1, vereinfacht): Flugmodell, Akku, Kollision, Tore.
   Ohne DOM und WebGL, in Node testbar. Ton und Vibration laufen über fx,
   main.js verbindet sie mit dem Browser. */
import { DEG, clamp, vAdd, vSub, vScale, vDot, vLen, vNorm, vCross, qMul, qNorm, qRot, qFromRotVec } from './math.js';
import { cfg, game, kb, inp, say, saveBest, eggsFound, saveEggs } from './state.js';
import { colliders, gates, GATE_IN } from './world.js';
import { fmtTime } from './format.js';
import { bf, bfStart, bfStep, bfFallbackNote } from './bf.js';
import { town } from './town.js';
import { EGGS, checkEggs } from './eggs.js';
import { initBirds } from './birds.js';
import { ambInit } from './ambient.js';
import { rw, groundH, groundN, rwNear, waterAt, WATER_UP } from './realworld.js';
// Bestzeit nur mit allen Ebenen der echten Welt (Reiter „Debug“): ohne Gebäude oder Umgebung ist der Kurs leichter
export const bestOk = () => !(rw.on && rw.showOff);

/* ---------- Physik-Parameter (Stufe 1, vereinfacht) ---------- */
export const PHYS = {
  g: 9.81,
  spool: 0.035,    // Hochlaufzeit des Motors um den Schwebepunkt in s (bestimmt die Drehträgheit J)
  radius: 0.15,    // Kollisionsradius in m (Ringe, Treffer, Hindernis-Vorprüfung)
  foot: 0.01,      // Auflage: Rahmen-Unterseite unter dem Schwerpunkt in m (aus dem Modell, 1 cm je Größe 1)
  propY: 0.034,    // Propellerebene über dem Schwerpunkt in m (aus dem Modell)
  crashV: 5.5,     // Aufprallgeschwindigkeit für Absturz in m/s
  rateTau: 0.04,   // nur Stufe 1: Reaktionszeit der Drehrate in s (seit Physik 2.0 ungenutzt)
  angleMax: 50,    // max. Neigung im Angle-Modus in Grad
  angleK: 7,       // Rückstellstärke im Angle-Modus
  yawRateAngle: 200,
  // Physik 2.0 (Schätzwerte für eine 5-Zoll-Drohne, ca. 580 g mit 4S 1500 mAh):
  arm: 0.11,                              // Motor bis Mitte in m (220 mm Diagonale)
  mMotor: 0.035,                          // Motor mit Propeller in kg
  body: [0.25, 0.06, 0.04, 0.12],         // Rahmen und Elektronik: Masse kg, Breite x, Höhe y, Länge z in m
  bat: [0.19, 0.035, 0.035, 0.075, 0.035],// Akku: Masse kg, Maße x y z in m, Höhe über Mitte in m
  // Motor und Propeller (P1). Kalibriert auf einen Prüfstandswert: 2207.5-Motor 2550 KV mit 5-Zoll-Propeller an 4S,
  // 1691 g Schub bei 53,9 A und 26645 U/min, ca. 16 V (VCI Spark, rcdrone.top). i0 und Steigung sind Schätzungen.
  motor: { kv: 2550, T_g: 1691, rpm: 26645, amps: 53.9, volts: 16.0, i0: 1.2, propD: 5.1, pitch: 4.3 },
  idle: 0.05,                             // Motor-Leerlauf im Flug (Anteil), wie Betaflight-Idle
  cdaF: 0.010, cdaT: 0.035,               // Luftwiderstand mal Fläche von vorn und von oben in m² (Schätzung)
  kRD: 0.3,                               // Rotorwiderstand: Bremsung je m/s quer zum Rotor bei Schwebedrehzahl, in 1/s (Schätzung, Größenordnung nach RotorPy/Faessler)
  rho: 1.2,                               // Luftdichte kg/m³
  kYaw: 0.012,                            // Gegenmoment pro Newton Schub in m (aus dem Motor berechnet)
  rotDamp: 0.002,                         // Luftdämpfung der Drehung in N m s
  kp: [22, 14, 22], ki: [20, 15, 20], iMax: 3,   // Rate-PID je Achse (Nicken, Gieren, Rollen); Ausgang als Winkelbeschleunigung
  size: 1,                                // Modellgröße relativ zu 5 Zoll (Darstellung, Kamera)
  mass: 0, I: [0, 0, 0], Itune: [0, 0, 0],// aus der Geometrie berechnet (computeInertia)
  twr: 0, thrScale: 1,                    // Schub zu Gewicht bei vollem Akku (berechnet); Faktor für eigenen Schub
  m: {}                                   // Motorkonstanten (computeMotor)
};
// Motoren: x-Seite, z-Seite, Drehrichtung (diagonal gleich, wie Quad-X). Gleiche Reihenfolge wie im Modell.
export const TURTLE = { rate: 8, k: 300 };   // Kipp-Drehrate bei vollem Stick in rad/s, Reglerverstärkung in 1/s (Schätzung)
export const MOTORS = [[1, -1, -1], [-1, -1, 1], [1, 1, 1], [-1, 1, -1]];

// Masse und Trägheit (Diagonaltensor) aus Motoren als Punktmassen, Rahmen und Akku als Quader.
// Itune ist die Trägheit, auf die der Regler abgestimmt ist; ändert man nur PHYS.I, reagiert die Drohne anders.
export function computeInertia() {
  const P = PHYS, a = P.arm/Math.SQRT2, [mb, bx, by, bz] = P.body, [ma, ax, ay, az, ah] = P.bat;
  P.mass = 4*P.mMotor + mb + ma;
  const box = (m, x, y, z) => [m/12*(y*y + z*z), m/12*(x*x + z*z), m/12*(x*x + y*y)];
  const B = box(mb, bx, by, bz), A = box(ma, ax, ay, az), mm = 4*P.mMotor*a*a;
  P.I = [mm + B[0] + A[0] + ma*ah*ah, 2*mm + B[1] + A[1], mm + B[2] + A[2] + ma*ah*ah];
  P.Itune = P.I.slice();
  computeMotor();
  return P.I;
}

// Motorkonstanten aus dem Prüfstandswert. Ke = Kt = 60/(2π KV). Schub = kT ω², Propellermoment = kQ ω².
// Rm (Motor, Regler, Kabel) so, dass Spannung, Strom und Drehzahl zum Prüfstandswert passen.
export function computeMotor() {
  const P = PHYS, s = P.motor, m = P.m;
  m.ke = 60/(2*Math.PI*s.kv);
  const w = s.rpm*2*Math.PI/60, T = s.T_g/1000*P.g;
  m.kT = T/(w*w)*P.thrScale;
  m.kQ = m.ke*(s.amps - s.i0)/(w*w)*P.thrScale;
  m.rm = (s.volts - m.ke*w)/s.amps;
  m.i0 = s.i0;
  m.R = s.propD*0.0254/2; m.A = Math.PI*m.R*m.R; m.pitch = s.pitch*0.0254;
  m.wHover = Math.sqrt(P.mass*P.g/4/m.kT);
  m.J = P.spool*(m.ke*m.ke/m.rm + 2*m.kQ*m.wHover);   // Drehträgheit Motor+Propeller aus der Hochlaufzeit
  P.kYaw = m.kQ/m.kT;
  P.twr = 4*m.kT*Math.pow(motorSteady(1, BAT.cells*4.2), 2)/(P.mass*P.g);
}
// Drehzahl im Gleichgewicht bei Steuerwert u und Akkuspannung V: Motormoment = Propellermoment
export function motorSteady(u, V) {
  const m = PHYS.m, b = m.ke*m.ke/m.rm, c = m.ke*u*V/m.rm - m.ke*m.i0;
  return c <= 0 ? 0 : (-b + Math.sqrt(b*b + 4*m.kQ*c))/(2*m.kQ);
}
// Steuerwert, bei dem 4 Motoren das Gewicht tragen (voller Akku, mit Spannungseinbruch). Für Tests und Anzeige.
export function hoverThrottle() {
  const m = PHYS.m, w = m.wHover;
  const I = m.kQ*w*w/m.ke + m.i0;
  let V = BAT.cells*4.2;
  for (let i = 0; i < 20; i++) { const u = (m.ke*w + I*m.rm)/V; V = BAT.cells*4.2 - (1 + 4*u*I)*(BAT.ri + BAT.r2); }
  return (m.ke*w + I*m.rm)/V;
}
export const STEP = 1/240;   // feste Physik-Schrittweite
// Akku (Schätzwerte): Zellen, Kapazität in mAh, Innenwiderstand in Ohm. Der Strom kommt aus dem Motormodell.
// drone.js überschreibt die Werte je Vorlage; hier die 5-Zoll-Vorlage.
export const BAT = { cells: 4, cap: 1500, ri: 0.016, r2: 0.006, tau: 4 };
computeInertia();   // nach BAT, weil computeMotor die Akkuspannung braucht
// r2, tau: RC-Glied für Spannungseinbruch und Erholung (Schätzung: Erholung in einigen Sekunden).

// Ruhespannung einer LiPo-Zelle über dem Ladestand (Schätzwerte aus typischen Entladekurven):
// steil oben und unten, flach in der Mitte.
const OCV = [[0, 3.27], [0.05, 3.5], [0.1, 3.62], [0.2, 3.7], [0.3, 3.75], [0.4, 3.79], [0.5, 3.83], [0.6, 3.87], [0.7, 3.92], [0.8, 4.0], [0.9, 4.08], [1, 4.2]];
export function cellOcv(soc) {
  soc = clamp(soc, 0, 1);
  for (let i = 1; i < OCV.length; i++) if (soc <= OCV[i][0]) {
    const [s0, v0] = OCV[i-1], [s1, v1] = OCV[i];
    return v0 + (v1 - v0)*(soc - s0)/(s1 - s0);
  }
  return 4.2;
}

// Rückmeldungen nach außen. In Node bleiben sie leer.
export const fx = { beep() {}, vibrate() {}, hit() {}, crash() {}, pop() {} };   // Ton und Vibration, setzt main.js
// Aufgabe des aktiven Szenarios. Vorgabe ist der Torkurs; scenario.js tauscht sie aus.
// check(a, b, h): Fortschritt prüfen. collide(h): eigene Hindernisse, true bei Absturz. reset(): bei Neustart.
export const task = { check: checkGate, collide: null, reset() {}, early: false, gateExtra: 0 };   // gateExtra: Tor zählt so viele m neben der Öffnung (Stufe)   // early: vor Boden und Hindernissen prüfen

function newSim() {
  return {
    p: [game.home[0], groundH(game.home[0], game.home[1]) + PHYS.foot + 0.005, game.home[1]], v: [0, 0, 0],
    q: [0, Math.sin(game.homeYaw/2), 0, Math.cos(game.homeYaw/2)], w: [0, 0, 0],
    thr: 0, t: 0, next: 0, lapStart: null, lastLap: null, grounded: true, crashMsg: '', crashT: 0,
    mah: 0, amp: 0, vpack: BAT.cells*4.2, cellRest: 4.2, flyT: 0, vrc: 0, vmin: BAT.cells*4.2,
    mot: [0, 0, 0, 0], cmd: [0, 0, 0, 0], hp: [1, 1, 1, 1], wi: [0, 0, 0], vib: 0,   // Motorausgang, Befehl, Zustand je Rotor, I-Anteil
    om: [0, 0, 0, 0], rpm: [0, 0, 0, 0],   // Motordrehzahl in rad/s und U/min
    flippedT: 0, turtle: false, turtleAir: 0, afterTurtle: false   // Zeit auf dem Kopf liegend, Turtle-Modus
  };
}
function resetDrone() {
  game.throttle = 0; kb.pitch = kb.roll = kb.yaw = 0;
  game.state = 'fly';
  game.camPos = [game.home[0], 1.0, game.home[1] + 2.6]; game.camHeading = [0, 0, -1];
  if (cfg.fc === 'bf' && !bfStart()) bfFallbackNote();   // Betaflight frisch starten, sonst eigener Regler
}
export function respawn() {
  game.sim = newSim();
  game.frozen = false;
  history.length = 0;
  resetDrone();
  game.armed = !cfg.needArm;
  game.pendingRespawn = false;
  game.payload = 0;
  task.reset();
  cfg.vision = 'normal';   // Neustart (R, Neuer Flug): Bild wieder normal, nicht Wärmebild oder Nachtsicht (Nutzer)
  initBirds(Math.random, game.sim.p);   // Vögel bei jedem Start neu und zufällig verteilen
  ambInit(game.sim.p);   // echte Welt (nicht DIS): Schwärme, Greifvögel, Flugzeuge mit Kondensstreifen
}
// Nur die Drohne neu an den Start setzen (Jagd nach Treffer). Szenario, Zeit, Akku und Scharf-Zustand bleiben.
export function respawnDrone() {
  const o = game.sim, s = newSim();
  for (const k of ['t', 'next', 'lapStart', 'lastLap', 'mah', 'vrc', 'vmin', 'flyT', 'cellRest', 'vpack']) s[k] = o[k];
  game.sim = s;
  history.length = 0;
  resetDrone();
}

// Scharf schalten oder aus (wie der Arm-Schalter an der Funke). Scharf nur mit Gas unten, wie bei Betaflight.
export function toggleArm() {
  if (game.armed) { game.armed = false; say('Disarmed', 1.2); return false; }
  if (game.throttle > 0.05) { say('Gas runter zum scharf schalten', 1.6); return false; }
  game.armed = true; say('Armed', 1.2); fx.beep(660, 0.12);
  return true;
}

// Arm-Schalter der Funke: an = scharf schalten (nur mit Gas unten), aus = ausschalten
export function setArmed(on) {
  if (on === game.armed) return game.armed;
  if (!on) { game.armed = false; say('Disarmed', 1.2); return false; }
  return toggleArm();
}

export function crash(why) {
  game.state = 'crashed';
  game.sim.crashMsg = why; game.sim.crashT = performance.now();
  game.crashes++;
  fx.crash();
  fx.vibrate(120);
}

// Raten wie Betaflight „Actual“ (fc/rc.c, applyActualRates): Stick x in -1..1, r = [Mitte °/s, Maximum °/s, Expo %].
// Ergebnis in rad/s. Mitte: Steigung bei Stick in der Mitte. Maximum: bei vollem Ausschlag. Expo: weicher um die Mitte.
export function actualRate(x, r) {
  const a = Math.abs(x), e = r[2]/100, ex = a*(Math.pow(x, 5)*e + x*(1 - e));
  return (x*r[0] + Math.max(0, r[1] - r[0])*ex)*DEG;
}

export function step(h) {
  const s = game.sim;
  // 1. Soll-Drehraten im Körper-Koordinatensystem (rad/s)
  let tx, ty, tz;
  if (cfg.mode === 'acro') {
    tx = -actualRate(inp.pitch, cfg.rates.rp);
    tz = -actualRate(inp.roll, cfg.rates.rp);
    ty = -actualRate(inp.yaw, cfg.rates.yaw);
  } else {
    const f = qRot(s.q, [0,0,-1]), r = qRot(s.q, [1,0,0]), u = qRot(s.q, [0,1,0]);
    const pitchA = Math.atan2(-f[1], u[1]);   // Nase runter = positiv
    const rollA  = Math.atan2(-r[1], u[1]);   // rechts runter = positiv
    const maxA = PHYS.angleMax*DEG;
    tx = -clamp(PHYS.angleK*(inp.pitch*maxA - pitchA), -8, 8);
    tz = -clamp(PHYS.angleK*(inp.roll*maxA - rollA), -8, 8);
    ty = -inp.yaw * PHYS.yawRateAngle * DEG;
  }
  const mc = PHYS.m, V = s.vpack, up = qRot(s.q, [0,1,0]);
  const wFull = motorSteady(1, V) || 1;
  // 2. Aerodynamik am Rotor (gilt für alle vier gleich, außer Propwash-Rauschen)
  const vAx = vDot(s.v, up);                                  // Anströmung entlang der Rotorachse (+ = Steigflug)
  const vPerp = vSub(s.v, vScale(up, vAx)), vHor = vLen(vPerp);
  const zr = Math.max(s.p[1] - groundH(s.p[0], s.p[2]) - PHYS.foot + PHYS.propY, mc.R*0.5);   // Rotorhöhe über Grund
  const ge = up[1] > 0.5 ? Math.min(1.4, 1/(1 - (mc.R/(4*zr))**2)) : 1;   // Bodeneffekt (Cheeseman-Bennett)
  const fac = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const vp = Math.max(1, s.om[i]/(2*Math.PI)*mc.pitch);    // Steiggeschwindigkeit des Propellers
    let f = clamp(1 - vAx/vp, 0, 1.15);                       // Steigflug kostet Schub, Sinkflug bringt etwas
    const T0 = mc.kT*s.om[i]*s.om[i];
    const vh = Math.sqrt(Math.max(T0, 0.01)/(2*PHYS.rho*mc.A));   // induzierte Geschwindigkeit im Schweben
    const d = -vAx/vh;                                        // Sinken in den eigenen Abwind (Wirbelring, Propwash)
    if (d > 0.25 && d < 1.8) {
      const k = Math.sin(Math.PI*(d - 0.25)/1.55)*clamp(1 - vHor/(1.5*vh), 0, 1);
      const n = Math.sin(s.t*53 + i*1.7) + Math.sin(s.t*79 + i*2.9);   // unruhiger Schub je Rotor
      f *= 1 - k*(0.18 + 0.12*n);
    }
    fac[i] = f*ge;
  }

  // 3. Rate-PID und Mischer (Quad-X). Am Boden mit wenig Gas: Motoren aus, Regler ruht.
  const a = PHYS.arm/Math.SQRT2, err = [tx - s.w[0], ty - s.w[1], tz - s.w[2]];
  // Liegt oder steht am Boden mit Gas unten und Sticks in der Mitte: Regler ruht, kämpft nicht gegen den Boden.
  // Mit Stick-Ausschlag regelt er auch am Boden (wie Betaflight mit Airmode): Gieren dreht die Drohne, Rollen kippt sie.
  // Ab 10 % Ausschlag, damit Rauschen von Touch-Sticks und Funken nicht stört. Nach dem Turtle-Modus erst,
  // wenn die Sticks einmal losgelassen wurden (sonst kippt der noch gehaltene Stick die Drohne gleich wieder).
  const sticks = Math.abs(inp.pitch) > 0.1 || Math.abs(inp.roll) > 0.1 || Math.abs(inp.yaw) > 0.1;
  if (s.afterTurtle && (!sticks || game.throttle >= 0.05)) s.afterTurtle = false;
  const rest = (s.grounded || s.onGround) && game.throttle < 0.05 && (!sticks || s.afterTurtle);
  const armed = game.armed && !rest;
  const tau = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    if (armed) s.wi[i] = clamp(s.wi[i] + err[i]*h, -PHYS.iMax, PHYS.iMax); else s.wi[i] = 0;
    tau[i] = PHYS.Itune[i]*(PHYS.kp[i]*err[i] + PHYS.ki[i]*s.wi[i]);   // gewünschtes Moment in N m
  }
  // Schub reagiert nicht linear auf den Steuerwert (T ~ ω²). Steigung dT/du am aktuellen Arbeitspunkt:
  const wAvg = Math.max(0.5*mc.wHover, (s.om[0] + s.om[1] + s.om[2] + s.om[3])/4);
  const slope = 2*mc.kT*wAvg*(mc.ke*V/mc.rm)/(mc.ke*mc.ke/mc.rm + 2*mc.kQ*wAvg);   // N je Einheit Steuerwert
  let lo = 1e9, hi = -1e9;
  const diff = MOTORS.map(([mx, mz, dir]) => ((-mz*a)*tau[0] + (mx*a)*tau[2])/(4*a*a*slope) + dir*tau[1]/(4*PHYS.kYaw*slope));
  for (const d of diff) { lo = Math.min(lo, d); hi = Math.max(hi, d); }
  const k = hi - lo > 1 ? 1/(hi - lo) : 1;   // zu viel verlangt: Lageregelung anteilig kürzen
  let u = diff.map(d => Math.max(PHYS.idle, game.throttle) + d*k);
  const top = Math.max(...u), bot = Math.min(...u);
  if (top > 1) u = u.map(x => x - (top - 1));   // Sättigung oben: alle runter, Lageregelung bleibt (wie Airmode)
  else if (bot < 0) u = u.map(x => x - bot);    // Sättigung unten: alle hoch
  // 4. Motoren: J dω/dt = Kt (I - I0) - kQ ω², I = (u V - Ke ω)/Rm. Akkustrom = 1 A Grundlast + Σ u I (Regler als Spannungswandler).
  // Akkuspannung V = E - Ri·Iakku hängt selbst vom Strom ab: direkt gelöst (linear in V), sonst schaukelt es bei hohen Strömen.
  for (let i = 0; i < 4; i++) s.cmd[i] = armed ? clamp(u[i], 0, 1) : game.armed ? PHYS.idle : 0;   // scharf am Boden: Leerlauf
  // Regler Betaflight (P4): echtes Betaflight rechnet Regelung und Mischer, unsere Physik den Rest
  if (cfg.fc === 'bf' && bf.ready) {
    const m = bfStep(s, h, game.armed, cfg.mode !== 'acro', game.throttle, inp.roll, inp.pitch, inp.yaw);
    // Am Boden mit Gas unten (oder knapp darüber): Gesamtschub höchstens etwa 1/3 des Gewichts (Schätzung, damit sie
    // sicher nicht abhebt). Dafür alle Motoren um denselben Wert senken: Der Unterschied zwischen den Motoren bleibt,
    // Gieren dreht die Drohne also weiter. Alle Motoren einzeln zu kappen ginge nicht: Dann folgt die Drohne dem
    // Stick nicht, und Betaflight schaltet sich ab (Schutz gegen Durchgehen beim Start). Schub ~ Steuerwert².
    let cut = 0;
    if ((s.grounded || s.onGround || s.p[1] - groundH(s.p[0], s.p[2]) < 0.25) && game.throttle < 0.05) {
      const lim = 4*(0.6*hoverThrottle())**2, sq = c => m.reduce((t, x) => t + Math.max(0, x - c)**2, 0);
      if (sq(0) > lim) { let lo = 0, hi = 1; for (let n = 0; n < 12; n++) { const c = (lo + hi)/2; if (sq(c) > lim) lo = c; else hi = c; } cut = hi; }
    }
    for (let i = 0; i < 4; i++) s.cmd[i] = game.armed ? clamp(m[i] - cut, 0, 1) : 0;
    // Liegt sie ruhig am Boden (Gas unten, Sticks mittig): Leerlauf wie beim eigenen Regler. Sonst regelt Betaflight
    // (Airmode) nach der Landung gegen den Boden. Echte Piloten schalten dafür nach der Landung unscharf.
    if (rest && game.armed) for (let i = 0; i < 4; i++) s.cmd[i] = PHYS.idle;
  }
  // Turtle-Modus (Betaflight "Flip over after crash"), schaltet sich von selbst ein:
  // Liegt die Drohne scharf geschaltet still auf dem Kopf oder auf der Seite, drehen die Motoren rückwärts. Kein Gas nötig.
  // Nicken oder Rollen kippt sie über die Kante in Stick-Richtung (vorwärts = über die Nase, rechts = über
  // den rechten Arm, bezogen auf die Drohne). Steht sie wieder auf den Füßen, gibst du Gas oder ist sie
  // länger als 1 s in der Luft, geht es normal weiter. Kippt sie auf die Seite, greift er dort erneut.
  // Wenig Stick dreht langsam, voller Stick schnell.
  // Start nur mit Gas unten (gleiche Grenze wie beim Beenden), sonst schaltet er jeden Schritt an und aus.
  if (!s.turtle && game.armed && s.flippedT > 0.3 && game.throttle <= 0.15) { s.turtle = true; s.turtleAir = 0; say('Turtle-Modus: Stick zum Umdrehen', 2); }
  else if (s.turtle && (!game.armed || (up[1] > 0.9 && vLen(s.w) < 2) || game.throttle > 0.15 || s.turtleAir > 1)) { s.turtle = false; s.afterTurtle = true; s.flippedT = 0; }
  let turtleM = null;
  if (s.turtle) {
    s.turtleAir = s.onGround ? 0 : s.turtleAir + h;
    const sx = Math.abs(inp.roll) > 0.1 ? inp.roll : 0, sz = Math.abs(inp.pitch) > 0.1 ? inp.pitch : 0;
    // Vereinfacht: Der Stick gibt eine Kipp-Drehrate vor, ein P-Regler liefert das Moment. Begrenzt auf zwei
    // rückwärts drehende Motoren (Schätzung 50 % Schub, Annahme: Propeller sind nur für eine Richtung gebaut).
    // Nicht physikalisch exakt: das Ziel ist ein zuverlässiges Umdrehen.
    // Mit dem Schub der einzelnen Motoren war es zu unruhig.
    // Mindestens das Dreifache des Schwerkraft-Moments am Kipppunkt, damit es auch die Whoop schafft (Vereinfachung).
    const mga = PHYS.mass*PHYS.g*PHYS.arm/Math.SQRT2, Mmax = Math.max(0.25*PHYS.twr, 3)*mga;
    // Über die Senkrechte hinaus (oben zeigt etwas nach oben): Motoren aus, sie fällt von selbst auf die Füße
    const push = (sx || sz) && up[1] < 0.2;
    const want = [sz*TURTLE.rate, 0, sx*TURTLE.rate];
    turtleM = want.map((x, i) => push ? clamp(PHYS.I[i]*TURTLE.k*(x - s.w[i]), -Mmax, Mmax) : 0);
    MOTORS.forEach(([mx, mz], i) => { const k = clamp(mz*sz - mx*sx, 0, 1); s.cmd[i] = k > 0.05 ? 0.15 + 0.35*k : 0; });   // Ton und Propeller
    s.wi[0] = s.wi[1] = s.wi[2] = 0;
  }
  const E = BAT.cells*cellOcv(1 - s.mah/BAT.cap) - s.vrc;
  let su2 = 0, sue = 0;
  for (let i = 0; i < 4; i++) { su2 += s.cmd[i]*s.cmd[i]; sue += s.cmd[i]*mc.ke*s.om[i]; }
  const Vb = Math.max(0, (E - BAT.ri*(1 - sue/mc.rm))/(1 + BAT.ri*su2/mc.rm));
  let ibat = 1.0;   // Grundlast Elektronik, Kamera, Sender in A (Schätzung)
  const domega = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const I = (s.cmd[i]*Vb - mc.ke*s.om[i])/mc.rm;
    const q = mc.ke*(I - mc.i0*Math.sign(s.om[i])) - mc.kQ*s.om[i]*s.om[i];
    domega[i] = q/mc.J;
    s.om[i] = Math.max(0, s.om[i] + domega[i]*h);
    ibat += s.cmd[i]*I;
    s.mot[i] = s.om[i]/wFull;
  }
  ibat = Math.max(0, ibat);
  s.thr = (s.mot[0] + s.mot[1] + s.mot[2] + s.mot[3])/4;
  s.rpm = s.om.map(w => w*60/(2*Math.PI));
  // Akku: Verbrauch, Spannung unter Last
  s.amp = ibat;
  if (!cfg.infBat) s.mah += s.amp*h/3.6;   // Akku unendlich: kein Verbrauch (Spannungseinbruch unter Last bleibt)
  s.cellRest = cellOcv(1 - s.mah/BAT.cap);
  s.vrc += (s.amp*BAT.r2 - s.vrc)*Math.min(1, h/BAT.tau);
  s.vpack = Vb;
  if (s.thr > 0.05) s.vmin = Math.min(s.vmin, s.vpack);
  if (s.thr > 0.05) s.flyT += h;

  // 5. Momente und Drehung: I dw/dt = M - w x (I w) - Dämpfung
  // Turtle-Modus: Schub und Moment der Motoren stecken in turtleM (siehe oben)
  const rev = s.turtle ? 0 : 1;
  const T = s.om.map((w, i) => rev*mc.kT*w*w*fac[i]*s.hp[i]);
  let M = [0, 0, 0];
  MOTORS.forEach(([mx, mz, dir], i) => {
    M[0] += -mz*a*T[i]; M[2] += mx*a*T[i];
    M[1] += rev*dir*(mc.kQ*s.om[i]*s.om[i] + mc.J*domega[i]);   // Propellermoment plus Reaktion beim Beschleunigen
  });
  // Unwucht beschädigter Propeller: Zittern um Nick- und Rollachse
  let vib = 0;
  for (let i = 0; i < 4; i++) vib += (1 - s.hp[i])*mc.kT*s.om[i]*s.om[i];
  s.vib = vib/(PHYS.mass*PHYS.g);
  M[0] += vib*a*0.15*Math.sin(s.t*157); M[2] += vib*a*0.15*Math.cos(s.t*173);
  const I = PHYS.I, w = s.w, Iw = [I[0]*w[0], I[1]*w[1], I[2]*w[2]], gyro = vCross(w, Iw);
  if (turtleM) for (let i = 0; i < 3; i++) M[i] += turtleM[i];
  for (let i = 0; i < 3; i++) w[i] += (M[i] - gyro[i] - PHYS.rotDamp*w[i])/I[i]*h;
  const calm = s.turtle ? !(turtleM && turtleM.some(x => x)) && (s.grounded || s.onGround) : rest;   // Turtle: nach dem Umdrehen, Stick noch gedrückt
  if (calm) {   // Bodenkontakt schluckt Energie (Schätzung, Abklingzeit 0,1 s)
    const k = Math.max(0, 1 - 10*h); w[0] *= k; w[2] *= k;
    // Auf den Füßen: Reibung stoppt Gieren und Rutschen schneller (Schätzung, Abklingzeit 1/40 s). Sonst dreht sie nach.
    const kf = s.grounded ? Math.max(0, 1 - 40*h) : k; w[1] *= kf;
    if (s.grounded) { s.v[0] *= kf; s.v[2] *= kf; }
  }
  // Drehrate begrenzen (Schätzung 80 rad/s, gut 4 500 °/s, mehr als jede echte Drohne): Nach sehr harten Stößen
  // wird die Rechnung für die Kreiselkräfte sonst instabil und schaukelt sich auf (SimITL begrenzt ebenso).
  const wl = vLen(w);
  if (wl > 80) for (let i = 0; i < 3; i++) w[i] *= 80/wl;
  s.q = qNorm(qMul(s.q, qFromRotVec(vScale(w, h))));
  s.wq = w.slice();   // nur für Betaflight: Drehrate, mit der die Lage gedreht wurde (Kreisel), siehe bf.js

  // 6. Kräfte: Schub, Schwerkraft, Rotorwiderstand (quer zum Rotor, ~ Drehzahl), Rumpfwiderstand nach Lage
  const upN = qRot(s.q, [0,1,0]);
  const aT = (T[0] + T[1] + T[2] + T[3])/(PHYS.mass + (game.payload || 0));   // mit Paket schwerer
  const rd = PHYS.kRD*(s.om[0] + s.om[1] + s.om[2] + s.om[3])/(4*mc.wHover);
  const sp = vLen(s.v), cAx = sp > 1e-6 ? Math.abs(vAx)/sp : 0;
  const bd = 0.5*PHYS.rho*(PHYS.cdaF*(1 - cAx) + PHYS.cdaT*cAx)*sp/PHYS.mass;
  const acc = [0, 0, 0];
  for (let i = 0; i < 3; i++) acc[i] = upN[i]*aT - vPerp[i]*rd - s.v[i]*bd;
  acc[1] -= PHYS.g;
  s.v = vAdd(s.v, vScale(acc, h));
  const prev = s.p;
  s.p = vAdd(s.p, vScale(s.v, h));
  // Ostereier: in jedem Modus gleich, Berühren genügt
  const egg = rw.on ? -1 : checkEggs(prev, s.p, PHYS.radius*0.6, eggsFound);   // Ostereier nur auf der Spielkarte
  if (egg >= 0) {
    saveEggs();
    const all = eggsFound.length >= EGGS.length;
    // Zwei Zeilen: Meldung, darunter der Zähler
    say(all ? 'Alle Ostereier gefunden!' : 'Osterei gefunden!', all ? 4 : 2.5);
    say(eggsFound.length + ' von ' + EGGS.length + ' gefunden', all ? 4 : 2.5);
    fx.beep(1568, 0.08); fx.beep(2093, 0.12);
  }

  // Jagd: Treffer vor Boden und Hindernissen prüfen, damit ein steiler Anflug zählt und nicht als Absturz endet
  if (task.early) {
    task.check(prev, s.p, h);
    if (game.pendingRespawn) { game.pendingRespawn = false; respawnDrone(); return; }
  }
  // 6. Boden: jede Kugel der Hitbox gegen den Boden. Kufe unten trägt die Drohne, Propeller können aufsetzen.
  // Normaler Modus: Ebene y = 0. Echte Welt: Geländeebene unter dem Teil (Höhe und Neigung aus dem Höhenmodell).
  s.grounded = false; s.onGround = false;
  const hb = hitbox(), ground = [], upB = qRot(s.q, [0, 1, 0]);
  for (let i = 0; i < hb.length; i++) {
    const [x, y, z, rad, rot, thick] = hb[i], r = qRot(s.q, [x, y, z]), pc = vAdd(s.p, r);
    const gn = groundN(pc[0], pc[2]), gh = groundH(pc[0], pc[2]), sp = support(rad, thick, gn, upB);
    const pen = sp.r - vDot([0, pc[1] - gh, 0], gn);   // Abstand zur Geländeebene (flach: s.p[1] + r[1])
    // Fast berührende Teile (unter 2 mm) zählen mit: Der Stoß wirkt dann in der Mitte zwischen den Füßen,
    // statt abwechselnd an einzelnen Füßen. Sonst schaukelt und dreht sich die Drohne am Boden ohne Ende.
    if (pen <= -0.002) continue;
    ground.push({ n: gn, pen: Math.max(0, pen), r: vAdd(r, sp.d), rot });
    s.onGround = true;
    if (i < FEET) s.grounded = true;   // steht auf den Füßen
  }
  if (resolve(ground, PHYS.crashV*1.2*dmgMode().crashK, 'Bodenkontakt zu schnell')) return;
  // Echte Welt: Wasser setzt die Drohne immer außer Gefecht (auch ohne Schadensmodell), nur Neustart hilft
  if (rw.on && waterAt(s.p[0], s.p[2]) && s.p[1] - PHYS.foot < groundH(s.p[0], s.p[2]) + WATER_UP) { crash('Ins Wasser gestürzt. R für Neustart'); return; }
  // Umgedreht liegen geblieben: startet den Turtle-Modus (siehe oben), sonst Hinweis im OSD
  s.flippedT = s.onGround && qRot(s.q, [0, 1, 0])[1] < 0.5 && vLen(s.v) < 0.5 ? (s.flippedT || 0) + h : 0;   // auf dem Kopf oder auf der Seite
  // 7. Hindernisse
  if (!cfg.ghost && rw.on && rwCollide(prev, h)) return;   // echte Welt: Gebäude (Dreiecke) und Bäume
  if (!cfg.ghost && !rw.on) {   // Durch Hindernisse fliegen (Lernhilfe): nur der Boden bleibt fest
    for (const c of colliders) if (collide(c, h)) return;
    for (const c of town) if (collide(c, h)) return;   // kleine Stadt mit Testecken
    if (task.collide && task.collide(h)) return;
  }
  // 8. Aufgabe des Szenarios (Tore, Ringe ...)
  if (!task.early) task.check(prev, s.p, h);
  s.t += h;
  // Verlauf für Zurückspulen und Flugspur: alle 0,1 s ein Schnappschuss, höchstens 8 s
  s.histT = (s.histT || 0) + h;
  if (s.histT >= 0.1) { s.histT = 0; history.push(snapshot(s)); if (history.length > 80) history.shift(); }
}

export const history = [];
const snapshot = s => ({ p: s.p.slice(), v: s.v.slice(), q: s.q.slice(), w: s.w.slice(), om: s.om.slice(), mot: s.mot.slice(), wi: s.wi.slice(), hp: s.hp.slice(), t: s.t });
// Einfrieren (Lernhilfe, Nutzer Prompt 126): Taste F hält die Drohne an Ort und Stelle, nochmals F fliegt genau so weiter
// (Lage, Geschwindigkeit, Drehung bleiben; die Zeit des Flugs ruht). Nur ohne Schaden und mit unendlichem Akku, also in
// den Spielstilen Lernen und Gott-Modus (auch wenn dort Angle/Acro umgeschaltet wird).
export const freezeOk = () => cfg.dmg === 'off' && !!cfg.infBat;
export function toggleFreeze() {
  if (!game.frozen && !freezeOk()) { say('Einfrieren nur im Spielstil Lernen oder Gott-Modus', 1.6); return false; }
  if (!game.frozen && game.state !== 'fly') return false;
  game.frozen = !game.frozen;
  say(game.frozen ? 'Eingefroren' : 'Weiter', 1);
  return game.frozen;
}
// Zurückspulen (Lernhilfe): Drohne an den Zustand von vor sec Sekunden setzen, auch nach einem Absturz.
// Zeit, Akku und Fortschritt im Szenario laufen weiter.
export function rewind(sec = 5) {
  if (!history.length) return false;
  const target = game.sim.t - sec;
  let k = history.findIndex(x => x.t >= target);
  if (k < 0) k = 0;
  const h = history[k], s = game.sim;
  for (const key of ['p', 'v', 'q', 'w', 'om', 'mot', 'wi', 'hp']) s[key] = h[key].slice();
  s.grounded = false; s.turtle = false; s.flippedT = 0; history.length = k + 1;
  game.state = 'fly';
  say('Zurückgespult', 1);
  return true;
}

// Schadmodell (E4). crashK: Faktor auf die Absturzgeschwindigkeit; k: Schaden je (m/s)^2 Aufprall.
// Schätzwerte für das Spielgefühl. Aus: weder Schaden noch Absturz (Standard).
export const DMG = {
  off:  { name: 'Aus', crashK: Infinity, k: 0 },   // kein Schaden und kein Absturz: die Drohne prallt nur ab
  mild: { name: 'Nachsichtig', crashK: 1.4, k: 0.012 },
  real: { name: 'Realistisch', crashK: 1, k: 0.03 }
};
export const dmgMode = () => DMG[cfg.dmg] || DMG.mild;
// Aufprall mit Normale n (zeigt vom Hindernis weg) und Geschwindigkeit v in m/s. Rotoren auf der
// Aufprallseite trifft es stärker; base ist der Anteil, den jeder Rotor abbekommt.
export function damage(n, v, base) {
  const s = game.sim, k = dmgMode().k;
  if (!k || v < 1.5) return;
  const c = [-s.q[0], -s.q[1], -s.q[2], s.q[3]], nb = qRot(c, n);   // Normale im Körpersystem
  MOTORS.forEach(([mx, mz], i) => {
    if (s.hp[i] <= 0) return;
    const w = Math.max(0, -(mx*nb[0] + mz*nb[2])/Math.SQRT2);
    s.hp[i] = Math.max(0, s.hp[i] - k*v*v*(base + w));
    if (s.hp[i] === 0) say('Motor ' + (i + 1) + ' ausgefallen', 2);
  });
}

// Beschuss im DIS-Modus (Prompt 157): schwer = Absturz, Drohne zerstört; leicht = ein Motor stark beschädigt (60 % weg, Schätzung),
// zwei ausgefallene Motoren bringen sie ohnehin herunter. Schadmodell „Aus“ (Spielstile Lerner, Gott): nur Meldung.
export function shotHit(heavy, why = 'Abgeschossen') {
  const s = game.sim;
  if (game.state !== 'fly') return false;
  fx.hit(6);
  if (cfg.dmg === 'off') { say('Treffer (Schaden aus)', 1.5); return false; }
  if (heavy) { crash(why + ': zerstört'); return true; }
  const alive = s.hp.map((h, i) => [h, i]).filter(x => x[0] > 0);
  if (!alive.length) return false;
  const [, i] = alive[Math.floor(Math.random()*alive.length)];
  s.hp[i] = Math.max(0, s.hp[i] - 0.6);
  say('Treffer: Motor ' + (i + 1) + (s.hp[i] === 0 ? ' ausgefallen' : ' beschädigt'), 2);
  return false;
}

// Hitbox (P2): Teile im Körpersystem [x, y, z, Radius, Rotor oder -1, Dicke oder 0].
// 0 bis 3: Füße unter den Armen, Auflage auf Höhe der Rahmen-Unterseite (PHYS.foot).
// 4: Oberseite (Deckplatte, Akku), darauf liegt sie auf dem Kopf.
// 5 bis 8: Propellerkreise als flache Scheiben (Dicke > 0), nicht als Kugeln. Kugeln würden die Drohne
// anheben und schon bei kleiner Neigung kippen lassen.
export const FEET = 4;
export function hitbox() {
  const a = PHYS.arm/Math.SQRT2, sz = PHYS.size, rs = 0.006*sz, f = 0.7*a;
  const out = MOTORS.map(([mx, mz]) => [mx*f, -(PHYS.foot - rs), mz*f, rs, -1, 0]);
  out.push([0, 0.04*sz, 0, 0.03*sz, -1, 0]);
  MOTORS.forEach(([mx, mz], i) => out.push([mx*a, PHYS.propY, mz*a, PHYS.m.R, i, 0.005*sz]));
  return out;
}
// Berührpunkt eines Hitbox-Teils in Richtung -n (n zeigt vom Hindernis zur Drohne), u = Drohne oben (Welt).
// Kugel: Radius. Scheibe: Rand der Scheibe auf der Seite von -n, dazu halbe Dicke. Ergebnis: Versatz zur Teilmitte und wirksamer Radius.
function support(rad, thick, n, u) {
  if (!thick) return { d: vScale(n, -rad), r: rad };
  const c = vDot(n, u), p = vAdd(vScale(n, -1), vScale(u, c)), l = vLen(p);
  const d = vAdd(l > 1e-6 ? vScale(p, rad/l) : [0, 0, 0], vScale(u, c > 0 ? -thick : thick));
  return { d, r: -vDot(d, n) };
}
// Mehrere gleichzeitige Berührungen mit einem Hindernis: ein gemeinsamer Stoß am mittleren Kontaktpunkt,
// tiefste Eindringtiefe, gemittelte Normale. Sonst gäbe jede Kugel einen eigenen vollen Stoß (zu starker Rückprall).
function resolve(hits, limit, why) {
  if (!hits.length) return false;
  // Kontaktpunkt nach Eindringtiefe gewichtet: Der tiefere Fuß trägt mehr. Steht die Drohne leicht schief, wirkt der
  // Stoß auf der tieferen Seite und richtet sie auf. Mit dem einfachen Mittel wirkte er immer unter der Mitte,
  // dann gab es kein Aufrichten und sie schaukelte am Boden ohne Ende. 0,2 mm Grundgewicht: fast berührende Teile zählen schwach mit.
  let n = [0, 0, 0], r = [0, 0, 0], pen = 0, rot = -1, ws = 0;
  for (const k of hits) {
    const wk = k.pen + 0.0002;
    n = vAdd(n, k.n); r = vAdd(r, vScale(k.r, wk)); ws += wk;
    if (k.pen > pen) { pen = k.pen; rot = k.rot; }
  }
  // Heben sich die Richtungen auf (zwei gegenüberliegende Wände, enge Gasse): Richtung der tiefsten Berührung
  if (vLen(n) < 1e-6*hits.length) n = hits.reduce((x, k) => k.pen > x.pen ? k : x).n;
  return impact(vNorm(n), pen, vScale(r, 1/ws), rot, limit, why);
}
// Kugel (Mitte pc, Radius R) gegen gedrehten Quader c: Normale (vom Quader weg) und Eindringtiefe, oder null
function sphereBox(pc, R, c) {
  const dx = pc[0]-c.c[0], dy = pc[1]-c.c[1], dz = pc[2]-c.c[2];
  if (Math.abs(dy) > c.h[1] + R) return null;
  const lx = dx*c.cs - dz*c.sn, lz = dx*c.sn + dz*c.cs, ly = dy;
  if (Math.abs(lx) > c.h[0] + R || Math.abs(lz) > c.h[2] + R) return null;
  let nx = lx - clamp(lx, -c.h[0], c.h[0]), ny = ly - clamp(ly, -c.h[1], c.h[1]), nz = lz - clamp(lz, -c.h[2], c.h[2]);
  const d = Math.hypot(nx, ny, nz);
  let pen;
  if (d < 1e-6) {
    const px = c.h[0] - Math.abs(lx), py = c.h[1] - Math.abs(ly), pz = c.h[2] - Math.abs(lz);
    if (px < py && px < pz) { nx = Math.sign(lx) || 1; ny = 0; nz = 0; pen = px + R; }
    else if (py < pz)        { nx = 0; ny = Math.sign(ly) || 1; nz = 0; pen = py + R; }
    else                     { nx = 0; ny = 0; nz = Math.sign(lz) || 1; pen = pz + R; }
  } else {
    if (d >= R) return null;
    nx /= d; ny /= d; nz /= d; pen = R - d;
  }
  return { n: [nx*c.cs + nz*c.sn, ny, -nx*c.sn + nz*c.cs], pen };
}
// Alle Kugeln der Hitbox gegen ein Hindernis. true = Absturz.
export function collide(c, h) {
  const s = game.sim, reach = Math.max(PHYS.radius, PHYS.arm + PHYS.m.R) + 0.05;
  if (Math.abs(s.p[1] - c.c[1]) > c.h[1] + reach) return false;
  if (Math.hypot(s.p[0] - c.c[0], s.p[2] - c.c[2]) > Math.hypot(c.h[0], c.h[2]) + reach) return false;
  const hits = [], upB = qRot(s.q, [0, 1, 0]);
  for (const [x, y, z, rad, rot, thick] of hitbox()) {
    const r = qRot(s.q, [x, y, z]), pc = vAdd(s.p, r);
    let hit = sphereBox(pc, rad + thick, c);
    if (!hit) continue;
    const sp = support(rad, thick, hit.n, upB);   // Scheibe: zweiter Durchgang mit dem wirksamen Radius in dieser Richtung
    if (thick && !(hit = sphereBox(pc, sp.r, c))) continue;
    hits.push({ n: hit.n, pen: hit.pen, r: vAdd(r, thick ? support(rad, thick, hit.n, upB).d : sp.d), rot });
  }
  return resolve(hits, PHYS.crashV*dmgMode().crashK, 'Hindernis getroffen');
}

// Nächster Punkt auf dem Dreieck a, b, c zum Punkt p (Ericson, Real-Time Collision Detection 5.1.5)
function closestOnTri(p, a, b, c) {
  const ab = vSub(b, a), ac = vSub(c, a), ap = vSub(p, a), d1 = vDot(ab, ap), d2 = vDot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = vSub(p, b), d3 = vDot(ab, bp), d4 = vDot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1*d4 - d3*d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return vAdd(a, vScale(ab, d1/(d1 - d3)));
  const cp = vSub(p, c), d5 = vDot(ab, cp), d6 = vDot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5*d2 - d1*d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return vAdd(a, vScale(ac, d2/(d2 - d6)));
  const va = d3*d6 - d5*d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return vAdd(b, vScale(vSub(c, b), (d4 - d3)/((d4 - d3) + (d5 - d6))));
  const den = 1/(va + vb + vc);
  return vAdd(a, vAdd(vScale(ab, vb*den), vScale(ac, vc*den)));
}
// Echte Welt: Hitbox gegen Gebäude-Dreiecke (genau an Wand und Dach) und Bäume (Quader für Stamm und Krone).
// Schnelle Flüge: Schneidet der Weg des Schwerpunkts im letzten Schritt eine Fläche, zurück vor die Fläche (kein Durchtunneln).
const triPt = (T, o) => [T[o], T[o + 1], T[o + 2]];
function rwCollide(prev, h) {
  const s = game.sim, T = rw.tris, near = rwNear(s.p[0], s.p[2], Math.max(PHYS.radius, PHYS.arm + PHYS.m.R) + vLen(vSub(s.p, prev)) + 0.3);
  for (const b of near.boxes) if (collide(b, h)) return true;
  if (!T || !near.tris.length) return false;
  // Durchtunneln: Strecke prev -> s.p gegen jedes nahe Dreieck (Möller-Trumbore)
  const dseg = vSub(s.p, prev), L = vLen(dseg);
  if (L > 0.05) for (const t of near.tris) {
    const a = triPt(T, t*9), b = triPt(T, t*9 + 3), c = triPt(T, t*9 + 6), e1 = vSub(b, a), e2 = vSub(c, a);
    const pv = vCross(dseg, e2), det = vDot(e1, pv);
    if (Math.abs(det) < 1e-12) continue;
    const tv = vSub(prev, a), u = vDot(tv, pv)/det;
    if (u < 0 || u > 1) continue;
    const qv = vCross(tv, e1), v = vDot(dseg, qv)/det;
    if (v < 0 || u + v > 1) continue;
    const k = vDot(e2, qv)/det;
    if (k < 0 || k > 1) continue;
    let n = vNorm(vCross(e1, e2));
    if (vDot(n, dseg) > 0) n = vScale(n, -1);   // Normale zur Seite, von der die Drohne kam
    s.p = vAdd(vAdd(prev, vScale(dseg, Math.max(0, k - 0.02))), vScale(n, 0.05));
    if (impact(n, 0, vScale(n, -0.05), -1, PHYS.crashV*dmgMode().crashK, 'Gebäude getroffen')) return true;
    break;
  }
  // Flächen sind dünn (ohne Dicke). Damit ein Teil, das schon hinter der Fläche steckt, nicht weiter hindurch
  // geschoben wird, wirkt der Stoß immer zu der Seite, auf der der Schwerpunkt im letzten Schritt war.
  const hits = [], parts = hitbox().map(([x, y, z, rad, rot, thick]) => { const r = qRot(s.q, [x, y, z]); return { pc: vAdd(s.p, r), R: rad + thick, rot }; });
  for (const t of near.tris) {
    const a = triPt(T, t*9), b = triPt(T, t*9 + 3), c = triPt(T, t*9 + 6);
    let nf = vCross(vSub(b, a), vSub(c, a));
    const nl = vLen(nf);
    if (nl < 1e-9) continue;
    nf = vScale(nf, 1/nl);
    if (vDot(vSub(prev, a), nf) < 0) nf = vScale(nf, -1);   // zur Seite des Schwerpunkts
    for (const { pc, R, rot } of parts) {
      const q = closestOnTri(pc, a, b, c), d = vSub(pc, q), l = vLen(d), sd = vDot(vSub(pc, a), nf);
      if (sd >= 0 && l >= R) continue;                            // davor und weit genug weg
      if (sd < 0 && l > 1e-6 && Math.abs(sd) < l - 1e-6) continue;   // dahinter, aber neben der Fläche (an der Kante vorbei)
      if (sd < -0.5) continue;                                    // weit dahinter: gehört zur anderen Seite eines Gebäudes
      const n = sd >= 0 && l > 1e-9 && vDot(d, nf) > 0 ? vScale(d, 1/l) : nf;
      hits.push({ n, pen: sd >= 0 ? R - l : R - sd, r: vSub(q, s.p), rot });
    }
  }
  const crashed = resolve(hits, PHYS.crashV*dmgMode().crashK, 'Gebäude getroffen');
  const wl = vLen(s.w);
  if (wl > 80) for (let i = 0; i < 3; i++) s.w[i] *= 80/wl;   // auch nach dem Stoß begrenzen (siehe oben)
  return crashed;
}
// Stoß am Kontaktpunkt (P2): Drohne als starrer Körper mit Masse und Trägheit. Rückprall und Reibung sind Schätzwerte.
// n: Normale (vom Hindernis weg), pen: Eindringtiefe, r: Kontaktpunkt relativ zur Mitte (Welt), rotor: getroffener Rotor oder -1.
export const RESTITUTION = 0.3, FRICTION = 0.5;
export function impact(n, pen, r, rotor, limit, why) {
  const s = game.sim, q = s.q, qi = [-q[0], -q[1], -q[2], q[3]], I = PHYS.I, m = PHYS.mass + (game.payload || 0);
  const vc = vAdd(s.v, vCross(qRot(q, s.w), r));   // Geschwindigkeit des Kontaktpunkts
  const vn = vDot(vc, n);
  s.p = vAdd(s.p, vScale(n, pen));                  // aus dem Hindernis schieben
  if (vn >= 0) return false;                         // trennt sich schon
  if (-vn > limit) { crash(why); return true; }
  if (-vn > 0.6) fx.hit(-vn, rotor >= 0);   // Aufprall hörbar, leichtes Aufsetzen nicht
  damage(n, -vn, 0.15);
  const k = dmgMode().k;
  if (rotor >= 0 && k && -vn > 1.5) s.hp[rotor] = Math.max(0, s.hp[rotor] - k*vn*vn*0.6);   // getroffener Propeller mehr
  const Iinv = x => { const b = qRot(qi, x); return qRot(q, [b[0]/I[0], b[1]/I[1], b[2]/I[2]]); };   // I⁻¹ in Weltkoordinaten
  const eff = d => 1/m + vDot(d, vCross(Iinv(vCross(r, d)), r));
  const e = -vn > 0.5 ? RESTITUTION : 0;            // langsam: kein Rückprall (ruhiges Aufliegen)
  let J = vScale(n, -(1 + e)*vn/eff(n));
  const vt = vSub(vc, vScale(n, vn)), vtl = vLen(vt);
  if (vtl > 1e-6) { const t = vScale(vt, -1/vtl); J = vAdd(J, vScale(t, Math.min(FRICTION*vLen(J), vtl/eff(t)))); }
  s.v = vAdd(s.v, vScale(J, 1/m));
  const dw = qRot(qi, Iinv(vCross(r, J)));          // Drehstoß, zurück ins Körpersystem
  for (let i = 0; i < 3; i++) s.w[i] += dw[i];
  return false;
}
// Berührung einer Szenario-Fläche (Ring) mit Normale n: Stoß am Rand der Drohne
export function contact(n, pen, h) {
  return impact(n, pen, vScale(n, -PHYS.radius*0.6), -1, PHYS.crashV*dmgMode().crashK, 'Hindernis getroffen');
}

export function checkGate(a, b) {
  const g = gates[game.sim.next];
  const da = (a[0]-g.c[0])*g.n[0] + (a[2]-g.c[2])*g.n[2];
  const db = (b[0]-g.c[0])*g.n[0] + (b[2]-g.c[2])*g.n[2];
  if (!(da < 0 && db >= 0)) return;
  const t = da / (da - db);
  const p = [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t, a[2] + (b[2]-a[2])*t];
  const lat = (p[0]-g.c[0])*g.r[0] + (p[2]-g.c[2])*g.r[2];
  const ver = p[1] - g.c[1];
  const w = GATE_IN + (task.gateExtra || 0);
  if (Math.abs(lat) < w && Math.abs(ver) < w) passGate();
}

export function passGate() {
  const s = game.sim;
  if (s.next === 0) {
    if (s.lapStart !== null) {
      const lt = s.t - s.lapStart;
      s.lastLap = lt;
      if (bestOk() && (game.best === null || lt < game.best)) { game.best = lt; saveBest(); say('Neue Bestzeit ' + fmtTime(lt), 2.2); fx.beep(1320, 0.25); }
      else say('Runde ' + fmtTime(lt), 2);
    } else say('Zeit läuft', 1.2);
    s.lapStart = s.t;
  }
  fx.beep(880 + s.next*40, 0.09);
  s.next = (s.next + 1) % gates.length;
}
