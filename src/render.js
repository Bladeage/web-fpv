/* Rendern mit WebGL2: Himmel, Welt, Tore, Drohne, Propeller, Kameras. */
import { DEG, clamp, vAdd, vSub, vScale, vNorm, qMul, qAxis, qRot, mPersp, mMul, mIdent, mFromQT, mView, mLookAt, mInv } from './math.js';
import { cfg, game, saveCfg, say, eggsFound } from './state.js';
import { COURSE, MeshBuilder, colliders, gates, rayBlocked, buildWorld, buildDrone, buildBlade, buildDisc, PROP_S } from './world.js';
import { scen, buildScenario, scenHighlight, followLead, diff } from './scenario.js';
import { BALLOON, BALLOON_COLORS } from './balloon.js';
import { VEH_HALF } from './vehicles.js';
import { aircraft, buildAircraftMesh, AIR_KIND } from './aircraft.js';
import { town, buildTownMesh } from './town.js';
import { EGGS, buildEggMesh } from './eggs.js';
import { birds, birdPitch, birdFlap, buildBirdMesh } from './birds.js';
import { pilot, buildPilotMesh } from './pilot.js';
import { rw, rwMesh, groundH, RW_DATA } from './realworld.js';
import { targets } from './targets.js';
import { vehicles, buildVehicle, VEH_COLORS } from './vehicles.js';
import { MOTORS, PHYS, history } from './physics.js';

/* ---------- WebGL ---------- */
export const glc = document.getElementById('gl');
export const hud = document.getElementById('hud');
export const hctx = hud.getContext('2d');
export const gl = glc.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec4 aCol;
uniform mat4 uVP, uModel;
out vec3 vNor; out vec4 vCol; out vec3 vW;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz; vNor = mat3(uModel) * aNor; vCol = aCol;
  gl_Position = uVP * w;
  // Flache Platten knapp über dem Boden (Startplatz, Rasen, Landeplatz): je mm Höhe ein fester Tiefen-Vorsprung.
  // Sonst flackern Markierungen mit ihrer Platte, weil die Tiefe in der Ferne grob aufgelöst ist (Z-Fighting).
  float lay = (w.y > 0.0005 && w.y < 0.02) ? w.y*1000.0 : 0.0;
  gl_Position.z -= lay*5e-7*gl_Position.w;
}`;
// Bodenmuster für „Schön“: Gras mit Struktur, Erdflecken, Wege entlang des Kurses. Wird einmal in eine Textur gerechnet (bakeGround).
const NOISE = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}`;
const BAKE_FS = `#version 300 es
precision highp float;
in vec2 vP;
uniform vec2 uPath[9], uOrigin;
uniform float uSize;
uniform sampler2D uShadow;
out vec4 o;
${NOISE}
void main(){
  vec2 p = uOrigin + (vP*0.5 + 0.5)*uSize;
  float n1 = vnoise(p*0.08)*0.6 + vnoise(p*0.35)*0.3 + vnoise(p*1.7)*0.1;
  vec3 c = vec3(0.27, 0.48, 0.18)*(0.8 + 0.4*n1);
  c = mix(c, vec3(0.42, 0.36, 0.24), smoothstep(0.72, 0.86, vnoise(p*0.05 + 7.0))*0.55);
  float dp = 1e9;
  for (int i = 0; i < 8; i++) {
    vec2 a = uPath[i], b = uPath[i == 7 ? 0 : i + 1], ab = b - a;
    float t = clamp(dot(p - a, ab)/dot(ab, ab), 0.0, 1.0);
    dp = min(dp, length(p - a - ab*t));
  }
  { vec2 ab = uPath[0]; float t = clamp(dot(p, ab)/dot(ab, ab), 0.0, 1.0); dp = min(dp, length(p - ab*t)); }
  dp += (vnoise(p*0.5) - 0.5)*0.8;
  c = mix(c, vec3(0.55, 0.47, 0.34)*(0.9 + 0.2*n1), 1.0 - smoothstep(0.9, 1.6, dp));
  // Sonnenschatten der Hindernisse, weichgezeichnet (9 Abtastpunkte)
  vec2 uv = vP*0.5 + 0.5, t = 1.6/vec2(textureSize(uShadow, 0));
  float sh = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) sh += texture(uShadow, uv + vec2(i, j)*t).r;
  c *= 1.0 - 0.5*sh/9.0;
  o = vec4(c, 1.0);
}`;
// Schattenmaske: projizierte Umrisse der Hindernisse, weiß auf schwarz
const SHADOW_VS = `#version 300 es
layout(location=0) in vec2 aP;
void main(){ gl_Position = vec4(aP, 0.0, 1.0); }`;
const SHADOW_FS = `#version 300 es
precision mediump float;
out vec4 o;
void main(){ o = vec4(1.0); }`;
// uGfx: 0 einfach (wie Stufe 1), 1 mittel (Licht und Farbe), 2 schön (dazu Bodentextur, Fenster, Dunst)
const FS = `#version 300 es
precision highp float;
in vec3 vNor; in vec4 vCol; in vec3 vW;
uniform vec3 uSun, uCam, uFog;
uniform vec4 uOver;
uniform float uFogD, uAlpha, uGfx, uSize;
uniform vec2 uOrigin;
uniform sampler2D uGround;
uniform float uVision, uHeat, uPhoto;
out vec4 o;
${NOISE}
// Boden ohne Textur (Mittel überall, Schön außerhalb des vorberechneten Bereichs): Gras wie im Bodenmuster,
// Erdflecken, weiter draußen Felder (Wiese, Weizen, Acker) mit Hecken. q: 1 voll, 0 sparsam (weniger Rauschen).
vec3 groundProc(vec2 p, float q){
  float n1 = vnoise(p*0.08)*0.6 + vnoise(p*0.35)*0.3 + (q > 0.5 ? vnoise(p*1.7)*0.1 : 0.05);
  vec3 c = vec3(0.27, 0.48, 0.18)*(0.8 + 0.4*n1);
  c = mix(c, vec3(0.42, 0.36, 0.24), smoothstep(0.72, 0.86, vnoise(p*0.05 + 7.0))*0.55);
  // Felder ab etwa 250 m von der Kartenmitte (dort liegen Kurs und Testecken): Rechtecke 60 x 40 m, leicht gedreht
  float r = length(p - vec2(30.0, -10.0)), fk = smoothstep(240.0, 300.0, r);
  if (fk > 0.0) {
    vec2 g = mat2(0.96, 0.28, -0.28, 0.96)*p/vec2(60.0, 40.0), cell = floor(g), f = fract(g);
    float h = hash(cell), h2 = hash(cell + 17.3);
    vec3 fc = h < 0.35 ? vec3(0.30, 0.52, 0.20) : h < 0.6 ? vec3(0.62, 0.58, 0.30) : h < 0.8 ? vec3(0.45, 0.36, 0.24) : vec3(0.22, 0.40, 0.16);
    fc *= 0.9 + 0.2*h2;
    fc *= 0.94 + 0.06*sin((h2 > 0.5 ? f.x*60.0 : f.y*40.0)*1.6);   // Fahrspuren / Saatreihen
    float edge = min(min(f.x, 1.0 - f.x)*60.0, min(f.y, 1.0 - f.y)*40.0);
    fc = mix(vec3(0.16, 0.30, 0.12), fc, smoothstep(0.8, 2.2, edge));   // Hecke am Feldrand
    c = mix(c, fc*(0.92 + 0.16*n1), fk);
  }
  return c;
}
// Bildmodus (V1): 1 Wärmebild (Szene gedämpftes Grau, warme Objekte hell), 2 Nachtsicht (grün, dunkler)
vec3 vis(vec3 col){
  if (uVision < 0.5) return col;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  if (uVision < 1.5) return vec3(mix(0.12 + 0.30*l, 0.97, uHeat));
  return vec3(0.25, 1.0, 0.35)*(0.05 + 0.6*l + 0.25*uHeat);
}
void main(){
  vec3 n = normalize(vNor);
  vec3 c = vCol.rgb;
  bool ground = vCol.a < 0.125, wall = vCol.a >= 0.125 && vCol.a < 0.5;
  if (ground && uPhoto > 0.5) {   // echte Welt: Luftbild im Gebiet, außen gerechneter Boden, 25 m weicher Übergang
    vec2 uv = (vW.xz - uOrigin)/uSize;
    float e = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y))*uSize;
    c = groundProc(vW.xz, 0.0);
    if (e > -1.0) c = mix(c, texture(uGround, clamp(uv, 0.0, 1.0)).rgb, smoothstep(-1.0, 25.0, e));
  }
  if (ground && uGfx < 0.5 && uPhoto < 0.5) {   // einfacher Boden: Schachbrett, Raster, leichte Wellen
    vec2 p = vW.xz;
    float ch = mod(floor(p.x/8.0) + floor(p.y/8.0), 2.0);
    c *= 0.88 + 0.12*ch;
    vec2 q = p/8.0;
    vec2 g = abs(fract(q + 0.5) - 0.5) / max(fwidth(q), vec2(1e-4));
    float line = 1.0 - clamp(min(g.x, g.y), 0.0, 1.0);
    c = mix(c, c*0.72, line*0.55);
    float nn = sin(p.x*0.07)*sin(p.y*0.05) + sin(p.x*0.013 + p.y*0.021);
    c *= 0.94 + 0.06*nn;
  }
  if (uGfx < 0.5) {
    c = mix(c, uOver.rgb, uOver.a);
    float dif = max(dot(n, uSun), 0.0);
    vec3 amb = mix(vec3(0.30,0.29,0.26), vec3(0.52,0.60,0.70), 0.5 + 0.5*n.y);
    vec3 col = c * (amb + dif*vec3(1.0,0.96,0.88)*0.72) + uOver.rgb*uOver.a*0.35;
    float d = length(vW - uCam);
    float f = 1.0 - exp(-pow(d*uFogD, 1.6));
    o = vec4(vis(mix(col, uFog, clamp(f, 0.0, 1.0))), uAlpha);
    return;
  }
  bool full = uGfx > 1.5;
  if (ground && uPhoto < 0.5) {
    c = groundProc(vW.xz, full ? 1.0 : 0.0);
    if (full) {   // im vorberechneten Bereich (mit Schatten und Wegen) die Textur, zum Rand hin weich in den gerechneten Boden
      vec2 uv = (vW.xz - uOrigin)/uSize;
      float e = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y))*uSize;
      if (e > 0.0) c = mix(c, texture(uGround, uv).rgb, smoothstep(0.0, 30.0, e));
    }
  }
  if (full && wall && abs(n.y) < 0.5) {   // Fenster: Raster auf den Wänden, unten Sockel
    vec2 w = vec2(vW.x + vW.z, vW.y);
    vec2 f = fract(w/vec2(2.6, 3.0));
    float win = step(0.3, f.x)*step(f.x, 0.7)*step(0.35, f.y)*step(f.y, 0.75)*step(1.2, vW.y);
    c = mix(c, vec3(0.16, 0.22, 0.30), win*0.85);
    c *= mix(0.75, 1.0, smoothstep(0.0, 0.8, vW.y));
  }
  // Lineares Licht, warme Sonne, kühler Himmel, Abdunklung am Boden, Tone-Mapping, sRGB
  vec3 base = pow(mix(c, uOver.rgb, uOver.a), vec3(2.2));
  float dif = max(dot(n, uSun), 0.0);
  vec3 sky = vec3(0.20, 0.27, 0.40), bounce = vec3(0.10, 0.09, 0.06);
  vec3 amb = mix(bounce, sky, 0.5 + 0.5*n.y);
  float ao = 1.0;
  if (!ground) ao = mix(0.45, 1.0, smoothstep(0.0, 1.5, vW.y)) * (n.y < -0.5 ? 0.6 : 1.0);
  vec3 col = base*(amb*ao + dif*vec3(1.0, 0.88, 0.70)*1.5) + pow(uOver.rgb, vec3(2.2))*uOver.a*0.5;
  float d = length(vW - uCam);
  float f = 1.0 - exp(-pow(d*uFogD, 1.6));
  float hz = full && uPhoto < 0.5 ? exp(-max(vW.y, 0.0)/18.0)*(1.0 - exp(-d/450.0))*0.12 : 0.0;   // Dunst nah am Boden
  col = mix(col, pow(uFog, vec3(2.2))*0.85, clamp(f + hz, 0.0, 1.0));
  col = (col*(2.51*col + 0.03))/(col*(2.43*col + 0.59) + 0.14);   // ACES-Näherung
  o = vec4(vis(pow(clamp(col, 0.0, 1.0), vec3(1.0/2.2))), uAlpha);
}`;
const SKY_VS = `#version 300 es
layout(location=0) in vec2 aP;
out vec2 vP;
void main(){ vP = aP; gl_Position = vec4(aP, 0.9999, 1.0); }`;
const SKY_FS = `#version 300 es
precision highp float;
in vec2 vP;
uniform mat4 uInv;
uniform vec3 uCam, uFog, uZen, uSun;
uniform float uVision, uGfx, uTime;
out vec4 o;
${NOISE}
// Wolken: Rauschen in mehreren Größen (fbm), auf eine Ebene hoch über der Karte projiziert
float fbm(vec2 p, int n){
  float a = 0.5, r = 0.0;
  for (int i = 0; i < 5; i++) { if (i >= n) break; r += a*vnoise(p); p = p*2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return r;
}
void main(){
  vec4 w = uInv * vec4(vP, 1.0, 1.0);
  vec3 d = normalize(w.xyz/w.w - uCam);
  float t = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(uFog, uZen, pow(t, 0.55));
  float s = max(dot(d, uSun), 0.0);
  // Sonne: Scheibe (etwa 1 Grad), heller Rand darum, weiter Schein
  float disc = smoothstep(0.99982, 0.99990, s);
  c += vec3(1.0,0.92,0.75) * (pow(s, 900.0)*1.2 + pow(s, 14.0)*0.12);
  if (uGfx > 0.5 && d.y > 0.0) {   // Wolken nur ab „Mittel“, „Einfach“ bleibt unverändert schnell
    vec2 p = d.xz/(d.y + 0.12)*1.6 + uTime*vec2(0.006, 0.0025);
    float n = fbm(p, uGfx > 1.5 ? 5 : 3);
    float cov = smoothstep(0.50, 0.74, n)*smoothstep(0.0, 0.22, d.y);
    cov *= smoothstep(0.9993, 0.9965, s);   // Wolken lassen die Sonne frei (sonst blendet der Lens-Flare durch Wolken)
    vec3 cc = mix(vec3(0.70, 0.75, 0.83), vec3(0.98, 0.98, 1.0), smoothstep(0.48, 0.85, n));
    cc += vec3(0.20, 0.15, 0.08)*pow(s, 6.0);   // zur Sonne hin warm aufgehellt
    c = mix(c, cc, cov*0.85);
  }
  c = mix(c, vec3(1.0, 0.98, 0.92)*1.6, disc);
  if (uVision > 1.5) c = vec3(0.02, 0.07, 0.03) + vec3(0.03, 0.10, 0.04)*(1.0 - t);   // Nachtsicht: fast schwarz-grün
  else if (uVision > 0.5) c = vec3(0.10 + 0.08*(1.0 - t));                            // Wärmebild: kalter Himmel dunkel
  o = vec4(c, 1.0);
}`;
// Lens-Flare: schwache farbige Spiegelungen auf der Linie Sonne -> Bildmitte, dazu ein feiner Lichtstreifen.
// Wird nur gezeichnet, wenn die Sonne im Bild und nicht verdeckt ist. Additiv, bewusst schwach.
const FLARE_FS = `#version 300 es
precision highp float;
in vec2 vP;
uniform vec2 uSunP;
uniform float uK, uAsp;
out vec4 o;
float blob(vec2 q, vec2 c, float r, float soft){ return 1.0 - smoothstep(r*(1.0 - soft), r, length(q - c)); }
void main(){
  vec2 a = vec2(uAsp, 1.0), q = vP*a, sp = uSunP*a, ax = -sp;
  float ds = length(q - sp);
  vec3 c = vec3(1.0, 0.85, 0.6)*exp(-ds*ds*9.0)*0.10;                               // Schein um die Sonne
  c += vec3(1.0, 0.9, 0.75)*exp(-abs(q.y - sp.y)*90.0)*exp(-abs(q.x - sp.x)*1.6)*0.10;   // Streifen waagrecht
  c += vec3(0.9, 0.6, 0.3)*blob(q, sp + ax*0.45, 0.05, 0.5)*0.10;
  c += vec3(0.4, 0.9, 0.5)*blob(q, sp + ax*0.80, 0.11, 0.3)*0.05;
  c += vec3(0.5, 0.6, 1.0)*blob(q, sp + ax*1.25, 0.06, 0.6)*0.08;
  c += vec3(0.8, 0.5, 0.9)*blob(q, sp + ax*1.55, 0.18, 0.15)*0.035;
  c += vec3(0.6, 0.8, 1.0)*blob(q, sp + ax*2.10, 0.09, 0.4)*0.06;
  float rr = length(q - sp - ax*1.0);
  c += vec3(0.7, 0.8, 1.0)*exp(-pow((rr - 0.42)*22.0, 2.0))*0.025;                   // schwacher Ring
  o = vec4(c*uK, 1.0);
}`;

let bladeMesh = null, discMesh = null;
let P = null, PS = null, PF = null, flareK = 0, flareP = [0, 0], worldMesh = null, droneMesh = null, skyVao = null, staticCount = 0, groundCount = 0;
let townMesh = null, eggMesh = [], birdMesh = [], pilotMesh = null, terrain = null, photoTex = null, airMesh = {}, scenMesh = null, scenParts = [], scenVer = -1, vehMesh = null, pkgMesh = null, trail = null, balloonMesh = null, tether = null;
const SUN = vNorm([0.45, 0.8, 0.3]);
const PATH = new Float32Array(COURSE.flatMap(c => [c[0], c[1]]).concat([0, 0]));   // Wege im Boden: Kurs als Linienzug
const FOG = [0.80, 0.86, 0.90], ZEN = [0.30, 0.52, 0.80];

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(vs, fs, names) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  for (const n of names) u[n] = gl.getUniformLocation(p, n);
  return { p, u };
}
function upload(data) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24);
  gl.bindVertexArray(null);
  return { vao, buf, count: data.length / 10 };
}
// Bodenmuster einmal auf der Grafikkarte in eine Textur rechnen (400 x 400 m um den Kurs, 2048², ca. 0,2 m je Pixel).
// Danach liest der Boden pro Pixel nur noch einen Wert, statt Rauschen und Wege jedes Bild neu zu rechnen.
const GROUND = { origin: [-170, -190], size: 400, res: 2048 };
let groundTex = null;
// Konvexe Hülle von 2D-Punkten (Monotone-Chain), gegen den Uhrzeigersinn
function hull(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0])*(b[1] - o[1]) - (a[1] - o[1])*(b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.reverse()) { while (up.length > 1 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// Schatten jedes Hindernisses: Eckpunkte (Kronen: Ring, damit rund) entlang der Sonne auf den Boden projiziert,
// Umriss als Dreiecksfächer in Textur-Koordinaten (-1..1) der Bodentextur.
function shadowTris() {
  const out = [], toNdc = (x, z) => [(x - GROUND.origin[0])/GROUND.size*2 - 1, (z - GROUND.origin[1])/GROUND.size*2 - 1];
  for (const c of colliders.concat(town)) {
    const pts = [], crown = c.c[1] - c.h[1] > 1 && Math.abs(c.h[0] - c.h[2]) < 0.01 && c.h[0] > 0.8;
    const P = (lx, ly, lz) => [c.c[0] + lx*c.cs + lz*c.sn, c.c[1] + ly, c.c[2] - lx*c.sn + lz*c.cs];
    if (crown) for (let k = 0; k < 12; k++) { const a = k/12*Math.PI*2; for (const ly of [-0.7, 0, 0.7]) pts.push(P(Math.cos(a)*c.h[0]*1.1*(1 - Math.abs(ly)*0.4), ly*c.h[1], Math.sin(a)*c.h[2]*1.1*(1 - Math.abs(ly)*0.4))); }
    else for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) pts.push(P(x*c.h[0], y*c.h[1], z*c.h[2]));
    const poly = hull(pts.map(p => toNdc(p[0] - SUN[0]/SUN[1]*p[1], p[2] - SUN[2]/SUN[1]*p[1])));
    for (let i = 1; i < poly.length - 1; i++) out.push(...poly[0], ...poly[i], ...poly[i + 1]);
  }
  return new Float32Array(out);
}
function bakeGround() {
  // 1. Schattenmaske (1024², ca. 0,4 m je Pixel)
  const sres = 1024, shadowTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, sres, sres, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const sfb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, sfb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadowTex, 0);
  gl.viewport(0, 0, sres, sres); gl.disable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  const sp = program(SHADOW_VS, SHADOW_FS, []), tris = shadowTris(), svao = gl.createVertexArray(), sbuf = gl.createBuffer();
  gl.bindVertexArray(svao); gl.bindBuffer(gl.ARRAY_BUFFER, sbuf); gl.bufferData(gl.ARRAY_BUFFER, tris, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(sp.p); gl.drawArrays(gl.TRIANGLES, 0, tris.length/2);
  gl.bindVertexArray(null); gl.deleteBuffer(sbuf); gl.deleteVertexArray(svao); gl.deleteFramebuffer(sfb);
  // 2. Bodenmuster mit Schatten
  const prog = program(SKY_VS, BAKE_FS, ['uPath', 'uOrigin', 'uSize', 'uShadow']);
  groundTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, groundTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, GROUND.res, GROUND.res, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, groundTex, 0);
  gl.viewport(0, 0, GROUND.res, GROUND.res);
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(prog.p);
  gl.uniform2fv(prog.u.uPath, PATH); gl.uniform2f(prog.u.uOrigin, GROUND.origin[0], GROUND.origin[1]); gl.uniform1f(prog.u.uSize, GROUND.size);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shadowTex); gl.uniform1i(prog.u.uShadow, 0);
  gl.bindVertexArray(skyVao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb);
  gl.deleteTexture(shadowTex);
  gl.bindTexture(gl.TEXTURE_2D, groundTex);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const an = gl.getExtension('EXT_texture_filter_anisotropic');   // schärfer bei flachem Blick, falls vorhanden
  if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  gl.enable(gl.DEPTH_TEST);
}
// Ballon: runde Kugel (Radius 1) aus Breiten- und Längenkreisen, weiß; die Farbe kommt beim Zeichnen dazu
function buildBalloonMesh() {
  const mb = new MeshBuilder(), N = 8, M = 12, P = (i, j) => { const th = Math.PI*i/N, ph = 2*Math.PI*j/M; return [Math.sin(th)*Math.cos(ph), Math.cos(th), Math.sin(th)*Math.sin(ph)]; };
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1), w = [1, 1, 1];
    if (i > 0) mb.tri(a, c, b, w);
    if (i < N - 1) mb.tri(a, d, c, w);
  }
  return new Float32Array(mb.d);
}
export function initGL() {
  P = program(VS, FS, ['uVP', 'uModel', 'uSun', 'uCam', 'uFog', 'uOver', 'uFogD', 'uAlpha', 'uGfx', 'uSize', 'uOrigin', 'uGround', 'uVision', 'uHeat', 'uPhoto']);
  PS = program(SKY_VS, SKY_FS, ['uInv', 'uCam', 'uFog', 'uZen', 'uSun', 'uVision', 'uGfx', 'uTime']);
  PF = program(SKY_VS, FLARE_FS, ['uSunP', 'uK', 'uAsp']);
  const w = buildWorld();
  staticCount = w.staticCount; groundCount = w.groundCount;
  worldMesh = upload(w.data);
  droneMesh = upload(buildDrone());
  vehMesh = upload(buildVehicle());
  { const mb = new MeshBuilder(); mb.box([0, 0, 0], [0.07, 0.05, 0.07], 0, [0.62, 0.45, 0.28]); pkgMesh = upload(new Float32Array(mb.d)); }   // Paket
  balloonMesh = upload(buildBalloonMesh());
  for (const k of ['plane', 'heli', 'hexa']) airMesh[k] = upload(buildAircraftMesh(k));
  townMesh = upload(buildTownMesh());   // kleine Stadt mit Testecken
  eggMesh = EGGS.map((e, i) => upload(buildEggMesh(i)));   // Ostereier
  birdMesh = [0, 1, 2].map(k => ({ body: upload(buildBirdMesh(k, 'body')), wing: upload(buildBirdMesh(k, 'wing')) }));   // Vögel
  pilotMesh = { body: upload(buildPilotMesh('body')), head: upload(buildPilotMesh('head')) };   // Pilot mit Funke
  // Luftbild der echten Welt (eingebettetes JPEG) als Textur, mit Mipmaps und Anisotropie
  if (!RW_DATA.dop.startsWith('%%')) {
    const img = new Image();
    img.onload = () => {
      photoTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, photoTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const an = gl.getExtension('EXT_texture_filter_anisotropic');
      if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    };
    img.src = 'data:image/jpeg;base64,' + RW_DATA.dop;
  }
  bladeMesh = upload(buildBlade());
  discMesh = upload(buildDisc());
  skyVao = gl.createVertexArray();
  gl.bindVertexArray(skyVao);
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  gl.enable(gl.DEPTH_TEST);
  bakeGround();
}

/* ---------- Bildschirm ---------- */
export let vw = innerWidth;
export let vh = innerHeight;
export let inset = { t: 0, r: 0, b: 0, l: 0 };
export let lastVP = null;
export let lastCamQ = null;
export let lastVf = 90*DEG;
let dpr = 1;
function readInsets() {
  const cs = getComputedStyle(document.getElementById('probe'));
  inset = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0,
            b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}
// Auflösung automatisch: misst jede Sekunde die echte Bildrate (ohne Begrenzung von dt).
// Ziel ist die beste Bildrate der letzten Sekunden (Bildschirmtakt, auch 30 im Stromsparmodus), begrenzt auf 30 bis 60.
// Zu langsam: 3D-Bild kleiner (bis 50 %). Reicht das nicht, schaltet "lite" teure Bildeffekte ab
// und rechnet das OSD mit einfacher Pixeldichte. Wieder schnell genug: erst Effekte zurück, dann Auflösung.
export const frameStat = { scale: 1, t0: 0, n: 0, fps: 0, top: 0, lite: false, slow: 0, wait: 0, liteN: 0 };
// Handy und Tablet (Finger statt Maus): höchstens 1,5-fache Pixeldichte, sonst bis 2. Annahme: spart auf Handys viel Rechenzeit, Bild bleibt scharf genug.
const COARSE = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
if (COARSE) frameStat.scale = 0.75;   // Handy: vorsichtig anfangen, bei Reserve geht es hoch
function adaptRes() {
  const f = frameStat, now = performance.now();
  if (!f.t0) { f.t0 = now; return; }
  f.n++;
  if (now - f.t0 < 1000) return;
  const fps = f.n*1000/(now - f.t0), old = f.scale, oldLite = f.lite;
  f.t0 = now; f.n = 0; f.fps = fps;
  f.top = Math.max(fps, f.top*0.97);   // Bildschirmtakt schätzen, langsam vergessen
  const goal = clamp(f.top, 30, 60);   // Ziel: mindestens 30, höchstens 60 Bilder pro Sekunde
  if (!cfg.autoRes) { f.scale = 1; f.lite = false; }
  else if (f.wait > 0) f.wait--;   // nach einer Änderung kurz abwarten
  else if (fps < goal*0.8) {
    if (f.scale > 0.5) f.scale = Math.max(0.5, f.scale*(fps < goal*0.5 ? 0.7 : 0.85));
    else if (++f.slow >= 2) { f.lite = true; f.liteN++; f.wait = Math.min(60, 5*f.liteN); }   // je öfter nötig, desto länger bleibt der Sparmodus
    f.wait = Math.max(f.wait, 1);
  } else if (fps > goal*0.93) {
    f.slow = 0;
    if (f.lite) f.lite = false;
    else if (f.scale < 1) f.scale = Math.min(1, f.scale*1.1);
    f.wait = 2;
  }
  if (f.scale !== old || f.lite !== oldLite) resize();
}
export function resize() {
  vw = innerWidth; vh = innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, COARSE ? 1.5 : 2);
  const hdpr = frameStat.lite ? Math.min(dpr, 1) : dpr;   // OSD im Sparmodus mit einfacher Pixeldichte
  hud.width = Math.round(vw*hdpr); hud.height = Math.round(vh*hdpr);
  glc.width = Math.round(vw*dpr*frameStat.scale); glc.height = Math.round(vh*dpr*frameStat.scale);   // 3D-Bild ggf. kleiner, OSD bleibt scharf
  hctx.setTransform(hdpr, 0, 0, hdpr, 0, 0);
  readInsets();
}
addEventListener('resize', resize);

// Bildmodus reihum: normal, Wärmebild, Nachtsicht (Taste N, Funk-Schalter, Menü)
export const VISIONS = [['normal', 'Normal'], ['thermal', 'Wärmebild'], ['night', 'Nachtsicht']];
export function cycleVision() {
  const i = VISIONS.findIndex(([id]) => id === cfg.vision), next = VISIONS[(i + 1) % VISIONS.length];
  cfg.vision = next[0]; saveCfg(); say('Bild: ' + next[1], 1.2);
}
export function toggleCam() { cfg.cam = cfg.cam === 'fpv' ? 'chase' : 'fpv'; saveCfg(); say(cfg.cam === 'fpv' ? 'Drohnenkamera' : 'Verfolgerkamera', 1); }

export function render(dt) {
  const sim = game.sim;
  adaptRes();
  const W = glc.width, H = glc.height, asp = W/H;
  const hf = (cfg.fov || 110)*DEG;   // horizontales Blickfeld
  const vf = clamp(2*Math.atan(Math.tan(hf/2)/asp), 55*DEG, 120*DEG);
  const proj = mPersp(vf, asp, cfg.cam === 'fpv' ? 0.02 : 0.05, 1500);   // FPV: nahe Bildebene, sonst schneidet sie am Boden den Boden an
  let view, eye;
  if (cfg.cam === 'fpv') {
    let qc = qMul(sim.q, qAxis([1,0,0], cfg.tilt*DEG));
    if (sim.vib > 0.01 && game.state === 'fly') {   // Zittern durch Unwucht
      const k = Math.min(0.05, sim.vib*0.08);
      qc = qMul(qc, qMul(qAxis([1,0,0], (Math.random() - 0.5)*k), qAxis([0,0,1], (Math.random() - 0.5)*k)));
    }
    // Kamera sitzt vorne zwischen den Platten, 1,5 cm je Größe 1 über dem Schwerpunkt.
    // Mindestens 3,5 cm über dem Boden, sonst sieht man am Boden durch die Karte (Bildebene 2 cm vor dem Auge).
    const sz = PHYS.size;
    eye = vAdd(sim.p, vAdd(vScale(qRot(sim.q, [0,0,-1]), 0.09*sz), vScale(qRot(sim.q, [0,1,0]), 0.015*sz)));
    eye[1] = Math.max(eye[1], groundH(eye[0], eye[2]) + 0.035);
    view = mView(qc, eye);
    lastCamQ = qc;
  } else {
    const f = qRot(sim.q, [0,0,-1]), fl = Math.hypot(f[0], f[2]);
    if (fl > 0.2) game.camHeading = [f[0]/fl, 0, f[2]/fl];
    const cd = 2.4*clamp(PHYS.size, 0.45, 1.5), ch = 0.8*clamp(PHYS.size, 0.45, 1.5);   // Verfolger-Abstand nach Drohnengröße
    const tx = sim.p[0] - game.camHeading[0]*cd, tz = sim.p[2] - game.camHeading[2]*cd;
    const target = [tx, Math.max(groundH(tx, tz) + 0.4, sim.p[1] + ch), tz];   // nie unter dem Gelände
    const k = Math.min(1, dt*6);
    game.camPos = vAdd(game.camPos, vScale(vSub(target, game.camPos), k));
    eye = game.camPos;
    view = mLookAt(eye, vAdd(sim.p, [0, 0.15, 0]));
    lastCamQ = null;
  }
  lastVf = vf;
  const vp = mMul(proj, view);
  lastVP = vp;

  gl.viewport(0, 0, W, H);
  gl.clearColor(FOG[0], FOG[1], FOG[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Himmel
  gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
  gl.useProgram(PS.p);
  gl.uniformMatrix4fv(PS.u.uInv, false, mInv(vp));
  gl.uniform3fv(PS.u.uCam, eye); gl.uniform3fv(PS.u.uFog, FOG);
  gl.uniform3fv(PS.u.uZen, ZEN); gl.uniform3fv(PS.u.uSun, SUN);
  const VIS = cfg.vision === 'thermal' ? 1 : cfg.vision === 'night' ? 2 : 0;   // Bildmodus (V1)
  gl.uniform1f(PS.u.uVision, VIS);
  const GFX = cfg.gfx === 'simple' ? 0 : cfg.gfx === 'mid' ? 1 : 2;
  gl.uniform1f(PS.u.uGfx, GFX); gl.uniform1f(PS.u.uTime, performance.now()/1000);
  gl.bindVertexArray(skyVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true);

  // Welt
  gl.useProgram(P.p);
  gl.uniformMatrix4fv(P.u.uVP, false, vp);
  gl.uniformMatrix4fv(P.u.uModel, false, mIdent());
  gl.uniform3fv(P.u.uSun, SUN); gl.uniform3fv(P.u.uCam, eye); gl.uniform3fv(P.u.uFog, FOG);
  gl.uniform1f(P.u.uFogD, rw.on ? 1/700 : GFX ? 1/380 : 1/260);   // Mittel und Schön: weniger dichter Nebel (Einfach unverändert). Echte Welt: klare Sicht, Nebel verdeckt erst den Rand
  gl.uniform1f(P.u.uGfx, GFX);
  gl.uniform1f(P.u.uVision, VIS); gl.uniform1f(P.u.uHeat, 0);   // Wärme je Objekt: 0 kalt, 1 heiß (Motoren)
  gl.uniform1f(P.u.uSize, GROUND.size); gl.uniform2f(P.u.uOrigin, GROUND.origin[0], GROUND.origin[1]);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, groundTex); gl.uniform1i(P.u.uGround, 0);
  gl.uniform1f(P.u.uAlpha, 1);
  gl.uniform4f(P.u.uOver, 0, 0, 0, 0);
  gl.uniform1f(P.u.uPhoto, rw.on ? 1 : 0);
  if (rw.on) drawTerrain();
  else {
  gl.bindVertexArray(worldMesh.vao);
  // Boden ohne Tiefen-Eintrag: Alles steht auf oder über ihm und wird danach gezeichnet. So können flache Platten
  // (Startplatz, Rasen, Landeplatz) nie mit dem Boden flackern, auch wenn die Tiefe am Gerät grob aufgelöst ist.
  gl.depthMask(false); gl.drawArrays(gl.TRIANGLES, 0, groundCount); gl.depthMask(true);
  gl.drawArrays(gl.TRIANGLES, groundCount, staticCount - groundCount);
  gl.bindVertexArray(townMesh.vao); gl.drawArrays(gl.TRIANGLES, 0, townMesh.count);
  // Ostereier, die noch nicht gefunden sind: drehen sich langsam
  const eggYaw = performance.now()/1500;
  EGGS.forEach(([p], i) => {
    if (eggsFound.includes(i)) return;
    gl.uniformMatrix4fv(P.u.uModel, false, mFromQT(qAxis([0,1,0], eggYaw + i), p));
    gl.bindVertexArray(eggMesh[i].vao); gl.drawArrays(gl.TRIANGLES, 0, eggMesh[i].count);
  });
  // Vögel: Rumpf, im Flug dazu zwei schlagende Flügel (der linke ist der rechte, um 180° gedreht)
  gl.uniform1f(P.u.uHeat, 0.8);   // warmblütig: hell im Wärmebild
  for (const b of birds) {
    const m = birdMesh[b.col], q = qMul(qAxis([0,1,0], b.yaw), qAxis([1,0,0], birdPitch(b)));
    gl.uniformMatrix4fv(P.u.uModel, false, mFromQT(q, b.p));
    gl.bindVertexArray(m.body.vao); gl.drawArrays(gl.TRIANGLES, 0, m.body.count);
    const f = birdFlap(b);
    if (f === null) continue;
    const sh = vAdd(b.p, qRot(q, [0, 0.09, 0]));
    gl.bindVertexArray(m.wing.vao);
    gl.uniformMatrix4fv(P.u.uModel, false, mFromQT(qMul(q, qAxis([0,0,1], f)), vAdd(sh, qRot(q, [0.04, 0, 0]))));
    gl.drawArrays(gl.TRIANGLES, 0, m.wing.count);
    gl.uniformMatrix4fv(P.u.uModel, false, mFromQT(qMul(q, qMul(qAxis([0,1,0], Math.PI), qAxis([0,0,1], f))), vAdd(sh, qRot(q, [-0.04, 0, 0]))));
    gl.drawArrays(gl.TRIANGLES, 0, m.wing.count);
  }
  }   // Ende Spielkarte
  // Pilot hinter dem Startplatz: Körper dreht um die Hochachse, Kopf dazu seitlich und nach oben (Drehpunkt im Hals)
  {
    const qb = qAxis([0,1,0], pilot.yaw);
    gl.uniformMatrix4fv(P.u.uModel, false, mFromQT(qb, pilot.p));
    gl.bindVertexArray(pilotMesh.body.vao); gl.drawArrays(gl.TRIANGLES, 0, pilotMesh.body.count);
    const qh = qMul(qAxis([0,1,0], pilot.yaw + pilot.head), qAxis([1,0,0], pilot.headPitch));
    gl.uniformMatrix4fv(P.u.uModel, false, mFromQT(qh, vAdd(pilot.p, [0, 1.46, 0])));
    gl.bindVertexArray(pilotMesh.head.vao); gl.drawArrays(gl.TRIANGLES, 0, pilotMesh.head.count);
  }
  gl.uniform1f(P.u.uHeat, 0);
  gl.uniformMatrix4fv(P.u.uModel, false, mIdent());
  gl.bindVertexArray(worldMesh.vao);
  const pulse = 0.75 + 0.15*Math.sin(performance.now()/180);
  if (!rw.on) gates.forEach((g, i) => {
    if (i === sim.next && scen.id === 'gates') gl.uniform4f(P.u.uOver, 0.15, 1.0, 0.35, pulse);
    else gl.uniform4f(P.u.uOver, 0, 0, 0, 0);
    gl.drawArrays(gl.TRIANGLES, g.start, g.count);
  });
  // Elemente des Szenarios (Ringe, Stangen, Plattform), neu hochladen nach einem Wechsel
  if (scenVer !== scen.version) {
    if (scenMesh) { gl.deleteVertexArray(scenMesh.vao); gl.deleteBuffer(scenMesh.buf); scenMesh = null; }
    const sm = buildScenario();
    if (sm.data.length) scenMesh = upload(sm.data);
    scenParts = sm.parts; scenVer = scen.version;
  }
  if (scenMesh) {
    const hi = scenHighlight();
    gl.bindVertexArray(scenMesh.vao);
    scenParts.forEach((pt, i) => {
      if (i === hi) gl.uniform4f(P.u.uOver, 0.15, 1.0, 0.35, pulse);
      else gl.uniform4f(P.u.uOver, 0, 0, 0, 0);
      gl.drawArrays(gl.TRIANGLES, pt.start, pt.count);
    });
  }
  // Ziel-Drohnen (Jagd): Farbe nach Verhalten, Neigung in Flugrichtung, beim Absturz drehend
  if (scen.id === 'hunt') {
    gl.uniform1f(P.u.uHeat, 0.9);   // Ziel-Drohnen: warme Motoren und Akkus
    gl.bindVertexArray(droneMesh.vao);
    const COL = { dumb: [1.0, 0.85, 0.1], random: [0.2, 0.6, 1.0], evade: [1.0, 0.2, 0.25], static: [0.95, 0.95, 0.95] };
    for (const t of targets) {
      const sp = Math.hypot(t.v[0], t.v[2]), yaw = Math.atan2(-t.v[0], -t.v[2]);
      let q = qMul(qAxis([0,1,0], sp > 0.1 ? yaw : 0), qAxis([1,0,0], -Math.min(0.5, sp*0.03)));
      if (t.state !== 'fly') q = qMul(q, qAxis(vNorm([1, 0.3, 0.6]), t.ang));
      const m = mFromQT(q, t.p);
      for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) m[i] *= 1.8;   // größer als die eigene Drohne, besser sichtbar
      const c = COL[t.beh];
      gl.uniform4f(P.u.uOver, c[0], c[1], c[2], t.state === 'fly' ? 0.65 : 0.25);
      gl.uniformMatrix4fv(P.u.uModel, false, m);
      gl.drawArrays(gl.TRIANGLES, 0, droneMesh.count);
    }
    gl.uniform4f(P.u.uOver, 0, 0, 0, 0);
  }
  // Luftziele (Jagd Flugzeuge): eigenes Modell je Art, Lage aus dem Flugmodell; abgestürzte dunkel
  if (scen.id === 'hunt3') {
    for (const t of aircraft) {
      const mesh = airMesh[t.kind];
      gl.bindVertexArray(mesh.vao);
      gl.uniform1f(P.u.uHeat, t.state === 'fly' ? AIR_KIND[t.kind].heat : 0.4);
      gl.uniformMatrix4fv(P.u.uModel, false, mFromQT(t.q, t.p));
      gl.uniform4f(P.u.uOver, 0.05, 0.05, 0.05, t.state === 'fly' ? 0 : 0.6);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }
    gl.uniform4f(P.u.uOver, 0, 0, 0, 0);
  }
  gl.uniform1f(P.u.uHeat, 0);
  // Weiche Schatten unter bewegten Objekten (Mittel und Schön), entlang der Sonne versetzt, schwächer mit der Höhe
  if (cfg.gfx !== 'simple') {
    const blobs = [];
    const add = (p, rx, rz, yaw) => { if (p[1] < 40) blobs.push([p[0] - SUN[0]/SUN[1]*p[1], p[2] - SUN[2]/SUN[1]*p[1], rx*(1 + p[1]*0.03), rz*(1 + p[1]*0.03), yaw, 0.5*Math.max(0, 1 - p[1]/30)]); };
    if (cfg.cam !== 'fpv' || sim.p[1] < 20) add(vSub(sim.p, [0, PHYS.foot, 0]), 0.2*PHYS.size, 0.2*PHYS.size, 0);
    if (scen.id === 'hunt') for (const t of targets) add(t.p, 0.35, 0.35, 0);
    if (scen.id === 'hunt3') for (const t of aircraft) add(t.p, t.kind === 'hexa' ? 0.9 : 1.1, t.kind === 'hexa' ? 0.9 : 1.1, 0);
    if (scen.id === 'hunt2') for (const v of vehicles) add([v.x, 0, v.z], 1.15, 2.3, v.yaw);
    if (scen.id === 'follow') { const L = followLead(); add([L.x, 0, L.z], 1.15, 2.3, L.yaw); }
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -4);
    gl.uniform4f(P.u.uOver, 0, 0, 0, 1);
    gl.bindVertexArray(discMesh.vao);
    const dr = 0.063*PROP_S;   // Radius der Scheibe im Modell
    for (const [x, z, rx, rz, yaw, a] of blobs) for (const [k, al] of [[1.4, 0.45], [0.9, 1]]) {   // außen weich, innen dunkler
      const m = mFromQT(qAxis([0,1,0], yaw), [x, 0.02, z]);
      for (const i of [0, 1, 2]) m[i] *= rx*k/dr;
      for (const i of [8, 9, 10]) m[i] *= rz*k/dr;
      gl.uniformMatrix4fv(P.u.uModel, false, m); gl.uniform1f(P.u.uAlpha, a*al*0.6);
      gl.drawArrays(gl.TRIANGLES, 0, discMesh.count);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL); gl.depthMask(true); gl.disable(gl.BLEND);
    gl.uniform1f(P.u.uAlpha, 1); gl.uniform4f(P.u.uOver, 0, 0, 0, 0);
  }
  gl.uniform1f(P.u.uHeat, 0);
  // Flugspur (Lernhilfe): Linie durch die Schnappschüsse der letzten Sekunden
  if (cfg.trail && history.length > 1) {
    if (!trail) { trail = { vao: gl.createVertexArray(), buf: gl.createBuffer() }; gl.bindVertexArray(trail.vao); gl.bindBuffer(gl.ARRAY_BUFFER, trail.buf);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24); }
    const pts = history.slice(-60).map(h => h.p).concat([sim.p]), d = new Float32Array(pts.length*10);
    pts.forEach((p, i) => d.set([p[0], p[1], p[2], 0, 1, 0, 0.2, 0.9, 1, 1], i*10));
    gl.bindVertexArray(trail.vao); gl.bindBuffer(gl.ARRAY_BUFFER, trail.buf); gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
    gl.uniformMatrix4fv(P.u.uModel, false, mIdent()); gl.uniform4f(P.u.uOver, 0.2, 0.9, 1, 1);
    gl.drawArrays(gl.LINE_STRIP, 0, pts.length);
    gl.uniform4f(P.u.uOver, 0, 0, 0, 0);
  }
  // Ballons (Stufe „Leicht“): Kugel in der Ballonfarbe, Leine als Linie zum Ziel
  if ((scen.id === 'hunt' || scen.id === 'hunt2' || scen.id === 'hunt3') && diff().balloons) {
    const list = scen.id === 'hunt' ? targets.map(t => [t.bal, t.p]) : scen.id === 'hunt3' ? aircraft.map(t => [t.bal, vSub(t.p, [0, 0.4, 0])]) : vehicles.map(v => [v.bal, [v.x, VEH_HALF[1]*2, v.z]]);
    gl.uniform1f(P.u.uHeat, 0.35);
    gl.bindVertexArray(balloonMesh.vao);
    const lines = [];
    for (const [b, anchor] of list) {
      if (!b || b.popped) continue;
      const c = BALLOON_COLORS[b.col], m = mFromQT([0, 0, 0, 1], b.p);
      for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) m[i] *= BALLOON.r;
      m[5] *= 1.15;   // etwas höher als breit
      gl.uniformMatrix4fv(P.u.uModel, false, m);
      gl.uniform4f(P.u.uOver, c[0], c[1], c[2], 0.85);
      gl.drawArrays(gl.TRIANGLES, 0, balloonMesh.count);
      lines.push(anchor, vSub(b.p, [0, BALLOON.r*1.1, 0]));
    }
    if (lines.length) {
      if (!tether) { tether = { vao: gl.createVertexArray(), buf: gl.createBuffer() }; gl.bindVertexArray(tether.vao); gl.bindBuffer(gl.ARRAY_BUFFER, tether.buf);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24); }
      const d = new Float32Array(lines.length*10);
      lines.forEach((p, i) => d.set([p[0], p[1], p[2], 0, 1, 0, 0.95, 0.95, 0.95, 1], i*10));
      gl.bindVertexArray(tether.vao); gl.bindBuffer(gl.ARRAY_BUFFER, tether.buf); gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
      gl.uniformMatrix4fv(P.u.uModel, false, mIdent()); gl.uniform4f(P.u.uOver, 0.95, 0.95, 0.95, 1);
      gl.drawArrays(gl.LINES, 0, lines.length);
    }
    gl.uniform4f(P.u.uOver, 0, 0, 0, 0);
  }
  // Verfolgung: das orange Auto, in Leicht mit Leuchtspur
  if (scen.id === 'follow') {
    const L = followLead();
    if (diff().leadTrail && L.trail.length > 1) {
      if (!tether) { tether = { vao: gl.createVertexArray(), buf: gl.createBuffer() }; gl.bindVertexArray(tether.vao); gl.bindBuffer(gl.ARRAY_BUFFER, tether.buf);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24); }
      const pts = L.trail.concat([[L.x, 0.4, L.z]]), d = new Float32Array(pts.length*10);
      pts.forEach((p, i) => d.set([p[0], p[1], p[2], 0, 1, 0, 1, 0.6, 0.1, 1], i*10));
      gl.bindVertexArray(tether.vao); gl.bindBuffer(gl.ARRAY_BUFFER, tether.buf); gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
      gl.uniformMatrix4fv(P.u.uModel, false, mIdent()); gl.uniform4f(P.u.uOver, 1, 0.6, 0.1, 1);
      gl.drawArrays(gl.LINE_STRIP, 0, pts.length);
    }
    gl.bindVertexArray(vehMesh.vao);
    gl.uniformMatrix4fv(P.u.uModel, false, mFromQT(qAxis([0,1,0], L.yaw), [L.x, 0, L.z]));
    gl.uniform4f(P.u.uOver, 1.0, 0.5, 0.05, L.ok ? 0.75 : 0.55); gl.uniform1f(P.u.uHeat, 0.85);
    gl.drawArrays(gl.TRIANGLES, 0, vehMesh.count);
    gl.uniform4f(P.u.uOver, 0, 0, 0, 0); gl.uniform1f(P.u.uHeat, 0);
  }
  gl.uniform1f(P.u.uHeat, 0);
  // Paket unter der Drohne (Paketlieferung)
  if (game.payload > 0) {
    gl.bindVertexArray(pkgMesh.vao);
    const pp = vAdd(sim.p, vScale(qRot(sim.q, [0, 1, 0]), -0.09*PHYS.size));
    gl.uniformMatrix4fv(P.u.uModel, false, mFromQT(sim.q, pp));
    gl.drawArrays(gl.TRIANGLES, 0, pkgMesh.count);
  }
  // Fahrzeuge (Jagd Boden): Farbe nach Tempo, getroffene dunkel und schief
  if (scen.id === 'hunt2') {
    gl.bindVertexArray(vehMesh.vao);
    for (const v of vehicles) {
      gl.uniform1f(P.u.uHeat, v.state === 'hit' ? 0.5 : v.kind === 'parked' ? 0.45 : 0.85);   // fahrend: warmer Motor
      const q = qMul(qAxis([0,1,0], v.yaw), qAxis([0,0,1], v.tilt));
      gl.uniformMatrix4fv(P.u.uModel, false, mFromQT(q, [v.x, v.tilt*0.6, v.z]));
      const c = v.state === 'hit' ? [0.08, 0.08, 0.08] : VEH_COLORS[v.kind];
      gl.uniform4f(P.u.uOver, c[0], c[1], c[2], v.state === 'hit' ? 0.75 : 0.55);
      gl.drawArrays(gl.TRIANGLES, 0, vehMesh.count);
    }
    gl.uniform4f(P.u.uOver, 0, 0, 0, 0);
  }
  // Drohne (Rumpf nur in der Verfolgerkamera, Propeller auch im Kamerabild)
  gl.uniform1f(P.u.uHeat, 0.7);
  const md = mFromQT(sim.q, sim.p);
  for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) md[i] *= PHYS.size;   // Modell nach Drohnengröße
  if (cfg.cam !== 'fpv') {
    gl.uniform4f(P.u.uOver, 0, 0, 0, 0);
    gl.uniformMatrix4fv(P.u.uModel, false, md);
    gl.bindVertexArray(droneMesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, droneMesh.count);
  }
  if (cfg.cam !== 'fpv' || cfg.propsView) drawProps(md, dt);
  drawFlare(vp, eye, asp, GFX, VIS, dt);
  gl.bindVertexArray(null);
}
// Echte Welt: Gelände-Netz (einmal gebaut, mit Indizes) und Luftbild statt Bodenmuster. Schreibt Tiefe (Hügel verdecken).
function drawTerrain() {
  if (!terrain) {
    const { v, idx } = rwMesh(2, 1500), m = upload(v), ib = gl.createBuffer();
    gl.bindVertexArray(m.vao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    terrain = { vao: m.vao, n: idx.length };
  }
  gl.uniform1f(P.u.uSize, rw.size); gl.uniform2f(P.u.uOrigin, -rw.size/2, -rw.size/2);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, photoTex || groundTex);
  gl.uniform1f(P.u.uPhoto, photoTex ? 1 : 0);
  gl.bindVertexArray(terrain.vao);
  gl.drawElements(gl.TRIANGLES, terrain.n, gl.UNSIGNED_INT, 0);
}
// Lens-Flare: nur ab „Mittel“, im normalen Bild, wenn die Sonne im Bild steht und kein Hindernis davor ist.
// Je näher die Sonne an der Bildmitte, desto stärker. Weiches Ein- und Ausblenden (0,15 s), damit es nicht flackert.
function drawFlare(vp, eye, asp, GFX, VIS, dt) {
  const c = [0, 1, 2, 3].map(i => vp[i]*SUN[0] + vp[4 + i]*SUN[1] + vp[8 + i]*SUN[2]);   // Richtung (w = 0): Sonne unendlich weit
  let want = 0;
  if (GFX > 0 && VIS === 0 && c[3] > 0) {
    const x = c[0]/c[3], y = c[1]/c[3], r = Math.hypot(x*asp, y);
    if (Math.abs(x) < 1.1 && Math.abs(y) < 1.1 && (rw.on || (!rayBlocked(eye, SUN, 400, colliders) && !rayBlocked(eye, SUN, 400, town))))
      want = clamp(1.25 - r*0.7, 0, 1);
    flareP[0] = x; flareP[1] = y;
  }
  flareK += (want - flareK)*Math.min(1, dt/0.15);
  if (flareK < 0.01) return;
  gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  gl.useProgram(PF.p);
  gl.uniform2f(PF.u.uSunP, flareP[0], flareP[1]); gl.uniform1f(PF.u.uK, flareK); gl.uniform1f(PF.u.uAsp, asp);
  gl.bindVertexArray(skyVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
  gl.useProgram(P.p);
}

const propAng = [0, 0.8, 1.6, 2.4];
function drawProps(md, dt) {
  const sim = game.sim;
  const S = PROP_S, spin = game.state === 'fly' && !game.paused && game.armed;
  const w = spin ? 9 + sim.thr*38 : 0;                 // sichtbare Drehung, gedrosselt gegen Flimmern
  const blur = spin ? clamp(0.3 + sim.thr*1.4, 0, 1) : 0;
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  for (let i = 0; i < 4; i++) {
    const [mx, mz, dir] = MOTORS[i];
    propAng[i] += dir*w*dt;
    const hp = sim.hp[i];
    if (hp <= 0) continue;   // Propeller abgebrochen
    const mp = mMul(md, mFromQT(qAxis([0,1,0], propAng[i]), [mx*0.088*S, 0.026*S, mz*0.088*S]));
    if (hp < 0.5) { mp[0] *= 0.55; mp[1] *= 0.55; mp[2] *= 0.55; }   // stark beschädigt: kurzes Blatt
    gl.uniformMatrix4fv(P.u.uModel, false, mp);
    if (mz < 0) gl.uniform4f(P.u.uOver, 0.92, 0.22, 0.14, 0.9); else gl.uniform4f(P.u.uOver, 0, 0, 0, 0);
    gl.uniform1f(P.u.uAlpha, 1 - blur*0.75);
    gl.bindVertexArray(bladeMesh.vao); gl.drawArrays(gl.TRIANGLES, 0, bladeMesh.count);
    if (blur > 0) {
      gl.depthMask(false);
      gl.uniform1f(P.u.uAlpha, blur*0.3);
      gl.bindVertexArray(discMesh.vao); gl.drawArrays(gl.TRIANGLES, 0, discMesh.count);
      gl.depthMask(true);
    }
  }
  gl.disable(gl.BLEND); gl.uniform1f(P.u.uAlpha, 1); gl.uniform4f(P.u.uOver, 0, 0, 0, 0);
}
