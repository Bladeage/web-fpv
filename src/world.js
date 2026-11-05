/* Welt: Gelände, Bäume, Gebäude, Pfeiler, Tore, Drohnenmodell.
   Alles per Zufall mit festem Startwert 1949. Ohne DOM, in Node testbar.
   buildWorld() füllt colliders und gates und darf nur einmal laufen. */
import { clamp, vSub, vScale, vNorm, vCross, vDot } from './math.js';

export function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export class MeshBuilder {
  constructor() { this.d = []; }
  get count() { return this.d.length / 10; }
  tri(a, b, c, col) {
    const n = vNorm(vCross(vSub(b, a), vSub(c, a)));
    const al = col.length > 3 ? col[3] : 1;
    for (const p of [a, b, c]) this.d.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], al);
  }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  box(c, h, yaw, col) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (x, y, z) => [c[0] + x*cs + z*sn, c[1] + y, c[2] - x*sn + z*cs];
    const hx = h[0], hy = h[1], hz = h[2];
    const p000=P(-hx,-hy,-hz), p100=P(hx,-hy,-hz), p110=P(hx,hy,-hz), p010=P(-hx,hy,-hz),
          p001=P(-hx,-hy,hz),  p101=P(hx,-hy,hz),  p111=P(hx,hy,hz),  p011=P(-hx,hy,hz);
    this.quad(p001, p101, p111, p011, col);
    this.quad(p100, p000, p010, p110, col);
    this.quad(p101, p100, p110, p111, col);
    this.quad(p000, p001, p011, p010, col);
    this.quad(p011, p111, p110, p010, col);
    this.quad(p000, p100, p101, p001, col);
  }
  // Runde Baumkrone: Achtflächner, einmal unterteilt, auf Halbachsen h gestreckt, leicht unregelmäßig.
  // Unregelmäßigkeit aus der Position (nicht aus dem Zufallsgenerator), damit die Welt sonst gleich bleibt.
  blob(c, h, col) {
    const jit = v => { const k = Math.sin(v[0]*12.9898 + v[1]*78.233 + v[2]*37.719 + c[0]*1.7 + c[2]*2.3)*43758.5453; return 0.88 + 0.24*(k - Math.floor(k)); };
    const P = v => { const n = vNorm(v), j = jit(n); return [c[0] + n[0]*h[0]*j, c[1] + n[1]*h[1]*j, c[2] + n[2]*h[2]*j]; };
    const mid = (a, b) => vNorm([a[0]+b[0], a[1]+b[1], a[2]+b[2]]);
    const X = [1,0,0], Y = [0,1,0], Z = [0,0,1], x = [-1,0,0], y = [0,-1,0], z = [0,0,-1];
    for (const [a, b, d] of [[X,Y,Z],[Z,Y,x],[x,Y,z],[z,Y,X],[Z,y,X],[x,y,Z],[z,y,x],[X,y,z]]) {
      const ab = mid(a, b), bd = mid(b, d), da = mid(d, a);
      for (const [p, q, r] of [[a,ab,da],[ab,b,bd],[da,bd,d],[ab,bd,da]]) this.tri(P(p), P(q), P(r), col);
    }
  }
  // Dreieck mit Normale in Richtung out (nach außen)
  triOut(a, b, c, out, col) { if (vDot(vCross(vSub(b, a), vSub(c, a)), out) < 0) this.tri(a, c, b, col); else this.tri(a, b, c, col); }
  // Zylinder um Mitte c, Radius r, halbe Länge h entlang der Achse 'x', 'y' oder 'z', mit Deckeln
  cyl(c, r, h, seg, col, axis = 'y') {
    const P = (a, t, rr = r) => {
      const u = Math.cos(a)*rr, v = Math.sin(a)*rr;
      return axis === 'y' ? [c[0] + u, c[1] + t, c[2] + v] : axis === 'x' ? [c[0] + t, c[1] + u, c[2] + v] : [c[0] + u, c[1] + v, c[2] + t];
    };
    const ax = axis === 'y' ? [0, 1, 0] : axis === 'x' ? [1, 0, 0] : [0, 0, 1];
    for (let i = 0; i < seg; i++) {
      const a0 = i/seg*Math.PI*2, a1 = (i + 1)/seg*Math.PI*2, out = vSub(P((a0 + a1)/2, 0), c);
      this.triOut(P(a0, -h), P(a1, -h), P(a1, h), out, col); this.triOut(P(a0, -h), P(a1, h), P(a0, h), out, col);
      this.triOut(P(0, h, 0), P(a0, h), P(a1, h), ax, col); this.triOut(P(0, -h, 0), P(a1, -h), P(a0, -h), vScale(ax, -1), col);
    }
  }
  cone(cx, cz, r, h, seg, col) {
    const apex = [cx, h, cz];
    for (let i = 0; i < seg; i++) {
      const a0 = i/seg*Math.PI*2, a1 = (i+1)/seg*Math.PI*2;
      const p0 = [cx + Math.cos(a0)*r, 0, cz + Math.sin(a0)*r];
      const p1 = [cx + Math.cos(a1)*r, 0, cz + Math.sin(a1)*r];
      this.tri(p1, p0, apex, col);
    }
  }
}

export const colliders = [];
export function addSolid(mb, c, h, yaw, col) {
  mb.box(c, h, yaw, col);
  colliders.push({ c, h, cs: Math.cos(yaw), sn: Math.sin(yaw) });
}

// Kurs: [x, z, Höhe der Tormitte]
// Trifft der Strahl o + t·d (0 < t < maxT) einen der Quader (c, h, cs, sn wie colliders)? Für die Sonne hinter Hindernissen.
export function rayBlocked(o, d, maxT, list) {
  for (const b of list) {
    const ox = o[0] - b.c[0], oz = o[2] - b.c[2];
    const lo = [ox*b.cs - oz*b.sn, o[1] - b.c[1], ox*b.sn + oz*b.cs], ld = [d[0]*b.cs - d[2]*b.sn, d[1], d[0]*b.sn + d[2]*b.cs];
    let t0 = 0, t1 = maxT;
    for (let i = 0; i < 3 && t0 <= t1; i++) {
      if (Math.abs(ld[i]) < 1e-9) { if (Math.abs(lo[i]) > b.h[i]) t0 = t1 + 1; continue; }
      let a = (-b.h[i] - lo[i])/ld[i], e = (b.h[i] - lo[i])/ld[i];
      if (a > e) { const x = a; a = e; e = x; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, e);
    }
    if (t0 <= t1) return true;
  }
  return false;
}
export const COURSE = [
  [0, -25, 2], [25, -55, 3], [60, -60, 5], [85, -30, 3],
  [70, 10, 8], [35, 30, 3], [0, 40, 2], [-30, 15, 4]
];
export const GATE_IN = 1.2;   // halbe lichte Weite eines Tors in m
export const gates = [];

export function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx-ax, dz = bz-az, l2 = dx*dx + dz*dz;
  const t = clamp(((px-ax)*dx + (pz-az)*dz) / l2, 0, 1);
  return Math.hypot(px - (ax + dx*t), pz - (az + dz*t));
}
export function nearCourse(x, z, d) {
  if (Math.hypot(x, z) < 12) return true;
  for (let i = 0; i < COURSE.length; i++) {
    const a = COURSE[i], b = COURSE[(i+1) % COURSE.length];
    if (distToSeg(x, z, a[0], a[1], b[0], b[1]) < d) return true;
  }
  return distToSeg(x, z, 0, 0, COURSE[0][0], COURSE[0][1]) < d;
}

export function buildWorld() {
  const mb = new MeshBuilder();
  const R = rng(1949);
  const L = 600;
  // Boden (Alpha 0 = Bodenmuster im Shader)
  // In Kacheln von 30 m: Ein einziges riesiges Viereck macht die Tiefe ungenau, flache Platten (Startplatz) verschwänden darin.
  for (let x = -L; x < L; x += 30) for (let z = -L; z < L; z += 30)
    mb.quad([x,0,z], [x,0,z+30], [x+30,0,z+30], [x+30,0,z], [0.35, 0.50, 0.27, 0]);
  const groundCount = mb.count;   // Boden zuerst und ohne Tiefe zeichnen (render.js), dann flackern Platten darauf nicht
  // Startplatz
  mb.box([0, 0.003, 0], [1.2, 0.003, 1.2], 0, [0.22, 0.27, 0.34]);   // flach: die Drohne steht physikalisch auf y = 0
  mb.box([0, 0.007, -0.9], [0.5, 0.001, 0.05], 0, [0.95, 0.95, 0.95]);

  // Hügel am Horizont
  for (let i = 0; i < 30; i++) {
    const a = R()*Math.PI*2, d = 340 + R()*180;
    mb.cone(Math.cos(a)*d, Math.sin(a)*d, 45 + R()*55, 22 + R()*55, 7, [0.36, 0.46, 0.40]);
  }
  // Bäume
  let placed = 0, tries = 0;
  while (placed < 80 && tries < 2000) {
    tries++;
    const a = R()*Math.PI*2, d = 14 + R()*190;
    const x = Math.cos(a)*d + 30, z = Math.sin(a)*d - 10;
    if (nearCourse(x, z, 9)) continue;
    const s = 0.8 + R()*0.6, yaw = R()*Math.PI;
    addSolid(mb, [x, 1.5*s, z], [0.2*s, 1.5*s, 0.2*s], yaw, [0.36, 0.25, 0.16]);
    const crown = [x, 4.2*s, z], ch = [1.3*s, 1.5*s, 1.3*s];   // Kollision bleibt der Quader, sichtbar ist eine runde Krone
    const col = [0.17 + R()*0.05, 0.36 + R()*0.08, 0.16];
    mb.blob(crown, [ch[0]*1.15, ch[1]*1.05, ch[2]*1.15], col);
    // zwei kleinere Teilkronen, Lage aus der Position (nicht aus dem Zufallsgenerator, damit die Welt gleich bleibt)
    const k = Math.sin(x*3.1 + z*1.7)*0.5 + 0.5, a2 = k*6.28;
    mb.blob([x + Math.cos(a2)*ch[0]*0.7, crown[1] + ch[1]*0.45, z + Math.sin(a2)*ch[2]*0.7], [ch[0]*0.7, ch[1]*0.6, ch[2]*0.7], [col[0]*0.9, col[1]*1.08, col[2]]);
    mb.blob([x - Math.cos(a2)*ch[0]*0.6, crown[1] - ch[1]*0.3, z - Math.sin(a2)*ch[2]*0.6], [ch[0]*0.65, ch[1]*0.55, ch[2]*0.65], [col[0]*0.85, col[1]*0.9, col[2]*0.9]);
    colliders.push({ c: crown, h: ch, cs: Math.cos(yaw), sn: Math.sin(yaw) });
    placed++;
  }
  // Gebäude
  placed = 0; tries = 0;
  while (placed < 7 && tries < 500) {
    tries++;
    const a = R()*Math.PI*2, d = 110 + R()*90;
    const x = Math.cos(a)*d + 30, z = Math.sin(a)*d - 10;
    if (nearCourse(x, z, 25)) continue;
    const hx = 4 + R()*5, hy = 3 + R()*5, hz = 4 + R()*4, yaw = R()*Math.PI;
    const g = 0.55 + R()*0.15;
    addSolid(mb, [x, hy, z], [hx, hy, hz], yaw, [g, g*0.97, g*0.93, 0.25]);   // Alpha 0,25: Fenster im Shader
    mb.box([x, hy*2 + 0.25, z], [hx + 0.3, 0.25, hz + 0.3], yaw, [0.45, 0.22, 0.18]);
    placed++;
  }
  // Pfeiler nahe am Kurs
  for (const i of [1, 4, 6]) {
    const a = COURSE[i], b = COURSE[(i+1) % COURSE.length];
    const mx = (a[0]+b[0])/2, mz = (a[1]+b[1])/2;
    const dx = b[0]-a[0], dz = b[1]-a[1], l = Math.hypot(dx, dz);
    const ox = -dz/l*5, oz = dx/l*5;
    addSolid(mb, [mx+ox, 4, mz+oz], [0.5, 4, 0.5], 0, [0.62, 0.62, 0.6]);
    addSolid(mb, [mx-ox*1.6, 3, mz-oz*1.6], [0.5, 3, 0.5], 0, [0.62, 0.62, 0.6]);
  }
  const staticCount = mb.count;

  // Tore
  const t = 0.12, dep = 0.1, w = GATE_IN;
  for (let i = 0; i < COURSE.length; i++) {
    const [x, z, h] = COURSE[i];
    const pv = COURSE[(i - 1 + COURSE.length) % COURSE.length], nx = COURSE[(i+1) % COURSE.length];
    const d = vNorm([nx[0]-pv[0], 0, nx[1]-pv[1]]);
    const yaw = Math.atan2(-d[0], -d[2]);
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const W = (lx, ly) => [x + lx*cs, ly, z - lx*sn];
    const start = mb.count;
    const orange = [1.0, 0.42, 0.08], dark = [0.20, 0.20, 0.22];
    const postH = h + w + 2*t;
    addSolid(mb, W(0, h + w + t), [w + 2*t, t, dep], yaw, orange);
    if (h - w - 2*t > 0.05) addSolid(mb, W(0, h - w - t), [w + 2*t, t, dep], yaw, orange);
    addSolid(mb, W(-(w + t), postH/2), [t, postH/2, dep], yaw, orange);
    addSolid(mb, W(w + t, postH/2), [t, postH/2, dep], yaw, orange);
    // Füße
    mb.box(W(-(w + t), 0.04), [0.3, 0.04, 0.4], yaw, dark);
    mb.box(W(w + t, 0.04), [0.3, 0.04, 0.4], yaw, dark);
    gates.push({
      c: [x, h, z], yaw,
      n: [-sn, 0, -cs], r: [cs, 0, -sn],
      start, count: mb.count - start
    });
  }
  return { data: new Float32Array(mb.d), staticCount, groundCount };
}

// Drohnenmodell (5 Zoll, Maßstab 1,3 wie Stufe 1): Rahmen aus Carbon, Arme, Motorglocken, Kamera, Akku mit Gurt, Antenne
export function buildDrone() {
  const mb = new MeshBuilder(), s = 1.3;
  const S = v => vScale(v, s), carbon = [0.11, 0.11, 0.12], dark = [0.06, 0.06, 0.07], metal = [0.55, 0.56, 0.6];
  mb.box([0, -0.004*s, 0], S([0.035, 0.003, 0.06]), 0, carbon);                    // Bodenplatte
  mb.box([0, 0.022*s, 0], S([0.028, 0.003, 0.045]), 0, carbon);                    // Deckplatte
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) mb.cyl(S([x*0.022, 0.009, z*0.035]), 0.003*s, 0.013*s, 6, metal);   // Abstandshalter
  mb.box(S([0, 0.009, 0]), S([0.018, 0.008, 0.02]), 0, [0.15, 0.3, 0.18]);        // Elektronik
  mb.box([0, 0, 0], S([0.013, 0.005, 0.125]), Math.PI/4, carbon);                  // Arme
  mb.box([0, 0, 0], S([0.013, 0.005, 0.125]), -Math.PI/4, carbon);
  for (const [px, pz] of [[1, -1], [-1, -1], [1, 1], [-1, 1]]) {                   // Motoren: Stator, Glocke, Kappe
    mb.cyl(S([px*0.088, 0.008, pz*0.088]), 0.014*s, 0.004*s, 10, dark);
    mb.cyl(S([px*0.088, 0.016, pz*0.088]), 0.0135*s, 0.006*s, 10, metal);
    mb.cyl(S([px*0.088, 0.0235, pz*0.088]), 0.006*s, 0.0015*s, 8, pz < 0 ? [0.85, 0.2, 0.12] : [0.2, 0.2, 0.22]);
  }
  mb.box(S([0, 0.012, -0.058]), S([0.012, 0.012, 0.01]), 0, [0.95, 0.75, 0.1]);    // Kamera
  mb.cyl(S([0, 0.012, -0.07]), 0.007*s, 0.004*s, 10, [0.05, 0.08, 0.12], 'z');     // Linse
  mb.box(S([0, 0.04, 0.005]), S([0.02, 0.015, 0.04]), 0, [0.15, 0.38, 0.9]);       // Akku
  mb.box(S([0, 0.04, 0.005]), S([0.022, 0.016, 0.006]), 0, dark);                  // Akkugurt
  mb.cyl(S([0, 0.045, 0.055]), 0.0018*s, 0.022*s, 5, dark);                        // Antenne
  mb.cyl(S([0, 0.069, 0.055]), 0.004*s, 0.003*s, 6, [0.9, 0.9, 0.92]);             // Antennenkappe
  return new Float32Array(mb.d);
}
export const PROP_S = 1.3;
export function buildBlade() {
  const mb = new MeshBuilder(), s = PROP_S;
  mb.box([0,0,0], [0.062*s, 0.0025*s, 0.009*s], 0, [0.95, 0.95, 0.95]);
  mb.box([0,0.004*s,0], [0.008*s, 0.004*s, 0.008*s], 0, [0.3, 0.3, 0.32]);
  return new Float32Array(mb.d);
}
export function buildDisc() {
  const mb = new MeshBuilder(), r = 0.063*PROP_S, n = 24;
  for (let i = 0; i < n; i++) {
    const a0 = i/n*Math.PI*2, a1 = (i+1)/n*Math.PI*2;
    mb.tri([0,0,0], [Math.cos(a1)*r, 0, Math.sin(a1)*r], [Math.cos(a0)*r, 0, Math.sin(a0)*r], [0.95, 0.95, 0.95]);
  }
  return new Float32Array(mb.d);
}
