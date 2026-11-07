/* DIS-Kodierer (Etappe D1, Konzept docs/dis-drohne.md). Ohne DOM, in Node testbar; die Brücke (tools/) und später der
   Simulator nutzen ihn. Inhalt: Erdkoordinaten (WGS84 <-> ECEF), Lage (Kurs/Nicken/Rollen <-> DIS-Winkel), Entity State
   PDU bauen und lesen (DIS 6 und 7), Erscheinungsbild (Appearance), Bewegungsvorhersage (Dead Reckoning) und die Regel,
   wann neu gesendet wird. Umrechnung aus dem Simulator (Kartenkoordinaten, Quaternion) in disFromSim.

   Zahlenwerte für Entity Type, Force ID, Dead Reckoning, Appearance und PDU-Typ aus SISO-REF-010 v37 (25.05.2026).
   Reprinted with permission from SISO Inc.
   Aufbau der Entity State PDU (144 Byte, Netzwerk-Bytefolge) nach dem freien Quelltext open-dis (IEEE 1278.1 selbst ist
   nicht frei; nicht gelesen). Werte von k5.2 (VBS-Gateway, 07.11.2026): DIS 6, Exercise 1, Herzschlag 5 s, Löschen 13 s. */

export const DIS_ES_LEN = 144;
// Unsere Drohne: Plattform (1), Luft (2), Deutschland (78), unbemannt (50), AirRobot AR 100-B (7); in VBS genau einer Klasse
// zugeordnet (k5.2). Rückfall: allgemein unbemannt (1.2.0.50.0), dann wählt VBS eine von mehreren Klassen.
export const DIS_FPV = { type: [1, 2, 78, 50, 7, 0, 0], fallback: [1, 2, 0, 50, 0, 0, 0], site: 1, app: 200, entity: 1, force: 1, marking: 'FPV1', exercise: 1, version: 6 };
// Bewegungsvorhersage: 1 Static, 2 FPW, 3 RPW, 4 RVW, 5 FVW (F feste Lage, R Lage dreht, P nur Tempo, V mit Beschleunigung, W Weltachsen)
export const DIS_DR = { static: 1, fpw: 2, rpw: 3, rvw: 4, fvw: 5 };
// Senden: Herzschlag 5 s (Gateway, k5.2), Schwellen 1 m und 3° (Werte aus KDIS, nicht aus der Norm)
export const DIS_SEND = { heartbeat: 5, pos: 1, ang: 3*Math.PI/180 };

// ---- Erdkoordinaten (WGS84) ----
const WGS_A = 6378137, WGS_F = 1/298.257223563, WGS_E2 = WGS_F*(2 - WGS_F), RAD = Math.PI/180;
// Breite, Länge in Grad, Höhe über dem Ellipsoid in m -> [X, Y, Z] in m (geozentrisch)
export function disToEcef(lat, lon, h) {
  const p = lat*RAD, l = lon*RAD, s = Math.sin(p), N = WGS_A/Math.sqrt(1 - WGS_E2*s*s);
  return [(N + h)*Math.cos(p)*Math.cos(l), (N + h)*Math.cos(p)*Math.sin(l), (N*(1 - WGS_E2) + h)*s];
}
// [X, Y, Z] -> [Breite, Länge, Höhe] (Iteration, nach 6 Schritten genauer als 1 mm)
export function disFromEcef(X, Y, Z) {
  const lon = Math.atan2(Y, X), r = Math.hypot(X, Y);
  let lat = Math.atan2(Z, r*(1 - WGS_E2)), h = 0;
  for (let i = 0; i < 6; i++) {
    const s = Math.sin(lat), N = WGS_A/Math.sqrt(1 - WGS_E2*s*s);
    h = r/Math.cos(lat) - N;
    lat = Math.atan2(Z, r*(1 - WGS_E2*N/(N + h)));
  }
  return [lat/RAD, lon/RAD, h];
}
// Achsen Nord, Ost, Unten an einem Ort, als Einheitsvektoren in ECEF
export function disNedAxes(lat, lon) {
  const p = lat*RAD, l = lon*RAD, sp = Math.sin(p), cp = Math.cos(p), sl = Math.sin(l), cl = Math.cos(l);
  return [[-sp*cl, -sp*sl, cp], [-sl, cl, 0], [-cp*cl, -cp*sl, -sp]];
}
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const comb = (v, A) => [0, 1, 2].map(i => v[0]*A[0][i] + v[1]*A[1][i] + v[2]*A[2][i]);   // v in Achsen A -> ECEF
export const disNedToEcef = (lat, lon, v) => comb(v, disNedAxes(lat, lon));
export function disEcefToNed(lat, lon, v) { const A = disNedAxes(lat, lon); return [dot(v, A[0]), dot(v, A[1]), dot(v, A[2])]; }

// ---- Lage ----
// Körperachsen (x vorn, y rechts, z unten) aus Gieren a, Nicken b, Rollen c (Reihenfolge z, y, x), ausgedrückt im Bezugssystem.
// Gilt gleich für Nord-Ost-Unten (Kurs, Nicken, Rollen) und für ECEF (DIS-Winkel psi, theta, phi).
export function disAxes(a, b, c) {
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  return [[cb*ca, cb*sa, -sb], [sc*sb*ca - cc*sa, sc*sb*sa + cc*ca, sc*cb], [cc*sb*ca + sc*sa, cc*sb*sa - sc*ca, cc*cb]];
}
export function disAngles(x, y, z) { return [Math.atan2(x[1], x[0]), -Math.asin(Math.max(-1, Math.min(1, x[2]))), Math.atan2(y[2], z[2])]; }
// Kurs (von Nord im Uhrzeigersinn), Nicken (Nase hoch +), Rollen (rechts runter +) in Radiant -> DIS [psi, theta, phi]
export function disHprToEuler(lat, lon, hdg, pitch, roll) {
  const B = disAxes(hdg, pitch, roll), A = disNedAxes(lat, lon);
  return disAngles(comb(B[0], A), comb(B[1], A), comb(B[2], A));
}
export function disEulerToHpr(lat, lon, psi, theta, phi) {
  const B = disAxes(psi, theta, phi), n = v => disEcefToNed(lat, lon, v);
  return disAngles(n(B[0]), n(B[1]), n(B[2]));
}
// Meridiankonvergenz in UTM (Winkel von geografisch Nord zu Gitter-Nord, östlich positiv), Radiant. Formel, auf
// Bogensekunden genau im Streifen (Test gegen geo.toUtm). Richtung geografisch = Richtung im Gitter + Konvergenz.
export function disConvergence(lat, lon, zone = 32) { return Math.atan(Math.tan((lon - (zone*6 - 183))*RAD)*Math.sin(lat*RAD)); }

// ---- Erscheinungsbild (Appearance) für Luftfahrzeuge ----
// Bit 1 Antrieb ausgefallen, Bit 3-4 Schaden (0 keiner, 1 leicht, 2 mittel, 3 zerstört), Bit 5 Rauch, Bit 15 Flammen,
// Bit 21 eingefroren (nicht vorhersagen), Bit 22 Triebwerk an, Bit 23 deaktiviert
export function disAppearance(o = {}) {
  return ((o.propKilled ? 1 : 0) << 1 | ((o.damage || 0) & 3) << 3 | (o.smoke ? 1 : 0) << 5 | (o.flames ? 1 : 0) << 15
    | (o.frozen ? 1 : 0) << 21 | (o.powerOn ? 1 : 0) << 22 | (o.off ? 1 : 0) << 23) >>> 0;
}
export function disAppearanceRead(u) {
  return { propKilled: !!(u >> 1 & 1), damage: u >> 3 & 3, smoke: !!(u >> 5 & 1), flames: !!(u >> 15 & 1), frozen: !!(u >> 21 & 1), powerOn: !!(u >> 22 & 1), off: !!(u >> 23 & 1) };
}
// Zustand unserer Drohne -> Erscheinungsbild und Vorhersage (Konzept, Tabelle „Zustände“)
export function disState(st) {
  if (st === 'crashed') return { appearance: disAppearance({ damage: 3, propKilled: true }), dra: DIS_DR.static };
  if (st === 'frozen') return { appearance: disAppearance({ frozen: true, powerOn: true }), dra: DIS_DR.static };
  if (st === 'off') return { appearance: disAppearance({ off: true }), dra: DIS_DR.static };
  return { appearance: disAppearance({ powerOn: true }), dra: DIS_DR.rvw };
}

// ---- Zeitstempel: Einheiten von 3600 s / 2^31 seit der vollen Stunde, letztes Bit 1 = absolut (Uhr gestellt), 0 = relativ ----
export function disTimestamp(ms, absolute = false) {
  const inHour = ((ms % 3600000) + 3600000) % 3600000;
  return ((Math.floor(inHour/3600000*2147483648) << 1) | (absolute ? 1 : 0)) >>> 0;
}

// ---- Entity State PDU ----
// e: { version, exercise, site, app, entity, force, type[7], alt[7], vel[3] (m/s, ECEF), pos[3] (m, ECEF), ori[3] (psi, theta,
// phi), appearance, dra, accel[3] (m/s², ECEF), angVel[3] (rad/s, Körperachsen), marking, capabilities, timestamp }
export function disEncodeES(e) {
  const b = new Uint8Array(DIS_ES_LEN), v = new DataView(b.buffer), t7 = (o, a) => { v.setUint8(o, a[0]); v.setUint8(o + 1, a[1]); v.setUint16(o + 2, a[2]); for (let i = 3; i < 7; i++) v.setUint8(o + i + 1, a[i]); };
  v.setUint8(0, e.version ?? 6); v.setUint8(1, e.exercise ?? 1); v.setUint8(2, 1); v.setUint8(3, 1);   // PDU-Typ 1 Entity State, Familie 1
  v.setUint32(4, e.timestamp ?? 0); v.setUint16(8, DIS_ES_LEN);
  if ((e.version ?? 6) >= 7) v.setUint8(10, e.status ?? 0);   // DIS 7: PDU-Status; DIS 6: Füllbyte
  v.setUint16(12, e.site); v.setUint16(14, e.app); v.setUint16(16, e.entity);
  v.setUint8(18, e.force ?? 0); v.setUint8(19, 0);   // keine variablen Parameter
  t7(20, e.type); t7(28, e.alt || e.type);
  for (let i = 0; i < 3; i++) v.setFloat32(36 + i*4, (e.vel || [0, 0, 0])[i]);
  for (let i = 0; i < 3; i++) v.setFloat64(48 + i*8, e.pos[i]);
  for (let i = 0; i < 3; i++) v.setFloat32(72 + i*4, (e.ori || [0, 0, 0])[i]);
  v.setUint32(84, e.appearance ?? 0); v.setUint8(88, e.dra ?? DIS_DR.static);   // Byte 89-103: Parameter der Vorhersage, hier 0
  for (let i = 0; i < 3; i++) v.setFloat32(104 + i*4, (e.accel || [0, 0, 0])[i]);
  for (let i = 0; i < 3; i++) v.setFloat32(116 + i*4, (e.angVel || [0, 0, 0])[i]);
  v.setUint8(128, 1);   // Zeichensatz ASCII
  const m = String(e.marking || '').slice(0, 11);
  for (let i = 0; i < m.length; i++) v.setUint8(129 + i, m.charCodeAt(i) & 127);
  v.setUint32(140, e.capabilities ?? 0);
  return b;
}
// PDU lesen: Kopf immer; Entity State (Typ 1) vollständig; andere Typen nur der Kopf. Zu kurz oder kaputt: null.
export function disDecode(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length < 12) return null;
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const h = { version: v.getUint8(0), exercise: v.getUint8(1), pduType: v.getUint8(2), family: v.getUint8(3), timestamp: v.getUint32(4), length: v.getUint16(8) };
  if (h.pduType !== 1) return h;
  if (u8.length < DIS_ES_LEN) return null;
  const t7 = o => [v.getUint8(o), v.getUint8(o + 1), v.getUint16(o + 2), v.getUint8(o + 4), v.getUint8(o + 5), v.getUint8(o + 6), v.getUint8(o + 7)];
  const f3 = (o, w) => [0, 1, 2].map(i => w === 8 ? v.getFloat64(o + i*8) : v.getFloat32(o + i*4));
  let marking = '';
  for (let i = 0; i < 11; i++) { const c = v.getUint8(129 + i); if (!c) break; marking += String.fromCharCode(c); }
  return { ...h, status: h.version >= 7 ? v.getUint8(10) : 0, site: v.getUint16(12), app: v.getUint16(14), entity: v.getUint16(16), force: v.getUint8(18), nParams: v.getUint8(19),
    type: t7(20), alt: t7(28), vel: f3(36, 4), pos: f3(48, 8), ori: f3(72, 4), appearance: v.getUint32(84), dra: v.getUint8(88),
    accel: f3(104, 4), angVel: f3(116, 4), marking, capabilities: v.getUint32(140) };
}

// ---- Bewegungsvorhersage (Dead Reckoning) und Senderegel ----
// Lage um die Drehrate w (Körperachsen) über dt weiterdrehen (Rodrigues: Achsen im Körpersystem um w*dt gedreht)
function turn(ori, w, dt) {
  const B = disAxes(ori[0], ori[1], ori[2]), ang = Math.hypot(w[0], w[1], w[2])*dt;
  if (ang < 1e-12) return ori.slice();
  const k = w.map(x => x*dt/ang), c = Math.cos(ang), s = Math.sin(ang), C = 1 - c;
  // Drehmatrix R (im Körpersystem); neue Achse i = Summe_j R[j][i] * alte Achse j
  const R = [[c + k[0]*k[0]*C, k[0]*k[1]*C - k[2]*s, k[0]*k[2]*C + k[1]*s], [k[1]*k[0]*C + k[2]*s, c + k[1]*k[1]*C, k[1]*k[2]*C - k[0]*s], [k[2]*k[0]*C - k[1]*s, k[2]*k[1]*C + k[0]*s, c + k[2]*k[2]*C]];
  const N = [0, 1, 2].map(i => comb([R[0][i], R[1][i], R[2][i]], B));
  return disAngles(N[0], N[1], N[2]);
}
// Wo sieht der Empfänger die Einheit dt Sekunden nach der PDU e? Liefert { pos, ori }.
export function disDeadReckon(e, dt) {
  const v = e.vel || [0, 0, 0], a = e.accel || [0, 0, 0], d = e.dra;
  if (d === DIS_DR.static || d === undefined) return { pos: e.pos.slice(), ori: e.ori.slice() };
  const acc = d === DIS_DR.rvw || d === DIS_DR.fvw;
  const pos = e.pos.map((p, i) => p + v[i]*dt + (acc ? 0.5*a[i]*dt*dt : 0));
  const ori = d === DIS_DR.rpw || d === DIS_DR.rvw ? turn(e.ori, e.angVel || [0, 0, 0], dt) : e.ori.slice();
  return { pos, ori };
}
// Winkel zwischen zwei Lagen (Radiant)
export function disAngleBetween(o1, o2) {
  const A = disAxes(o1[0], o1[1], o1[2]), B = disAxes(o2[0], o2[1], o2[2]);
  return Math.acos(Math.max(-1, Math.min(1, (dot(A[0], B[0]) + dot(A[1], B[1]) + dot(A[2], B[2]) - 1)/2)));
}
// Neu senden? last = zuletzt gesendete PDU (mit Sendezeit tSent in s), now = aktueller Zustand { pos, ori, appearance, dra }, t = jetzt in s.
// Ja beim ersten Mal, bei geändertem Erscheinungsbild oder Vorhersage, nach dem Herzschlag oder wenn die Vorhersage
// mehr als 1 m oder 3° abweicht.
export function disNeedSend(last, now, t) {
  if (!last) return true;
  if (now.appearance !== last.appearance || now.dra !== last.dra || t - last.tSent >= DIS_SEND.heartbeat) return true;
  const p = disDeadReckon(last, t - last.tSent);
  return Math.hypot(p.pos[0] - now.pos[0], p.pos[1] - now.pos[1], p.pos[2] - now.pos[2]) > DIS_SEND.pos || disAngleBetween(p.ori, now.ori) > DIS_SEND.ang;
}

// ---- Aus dem Simulator ----
// s: { p: [x, y, z] (x Osten, y oben, z Süden im Gitter der Karte), v: [..] m/s, q: [x, y, z, w] (vorn = -z, oben = +y),
//      w: [..] rad/s in Körperachsen des Simulators (x rechts, y oben, z hinten), a: [..] m/s² (optional) }
// ref: { lat, lon (Breite, Länge des Punkts p, zum Beispiel aus realworld.rwLatLon), zone (UTM), hNhn (Höhe von p über NHN),
//        undulation (Quasigeoidhöhe, m; NRW 42,5 bis 48,5) }
// Liefert die Felder für disEncodeES: pos, vel, ori, accel, angVel.
export function disFromSim(s, ref) {
  const g = disConvergence(ref.lat, ref.lon, ref.zone || 32), cg = Math.cos(g), sg = Math.sin(g);
  // Karte (Osten, oben, Süden) -> Gitter Nord-Ost-Unten -> geografisch (um die Konvergenz gedreht)
  const ned = w => { const n = -w[2], e = w[0]; return [n*cg - e*sg, n*sg + e*cg, -w[1]]; };
  const rot = v => { const q = s.q, x = q[0], y = q[1], z = q[2], w = q[3], tx = 2*(y*v[2] - z*v[1]), ty = 2*(z*v[0] - x*v[2]), tz = 2*(x*v[1] - y*v[0]);
    return [v[0] + w*tx + y*tz - z*ty, v[1] + w*ty + z*tx - x*tz, v[2] + w*tz + x*ty - y*tx]; };
  const L = ref.lat, O = ref.lon, E = v => disNedToEcef(L, O, ned(v));
  const bx = E(rot([0, 0, -1])), by = E(rot([1, 0, 0])), bz = E(rot([0, -1, 0]));   // vorn, rechts, unten
  const w = s.w || [0, 0, 0];
  return { pos: disToEcef(L, O, ref.hNhn + ref.undulation), vel: E(s.v || [0, 0, 0]), ori: disAngles(bx, by, bz), accel: E(s.a || [0, 0, 0]), angVel: [-w[2], w[0], -w[1]] };
}
