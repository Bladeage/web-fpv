/* Rendern mit WebGL2: Himmel, Welt, Tore, Drohne, Propeller, Kameras. */
import { DEG, clamp, vAdd, vSub, vScale, vNorm, qMul, qAxis, qRot, mPersp, mMul, mIdent, mFromQT, mView, mLookAt, mInv } from './math.js';
import { cfg, game, saveCfg, say, eggsFound, gfxLevel } from './state.js';
import { COURSE, MeshBuilder, colliders, gates, rayBlocked, buildWorld, buildDrone, buildDisc, PROP_S } from './world.js';
import { scen, buildScenario, scenHighlight, followLead, diff } from './scenario.js';
import { BALLOON, BALLOON_COLORS } from './balloon.js';
import { VEH_HALF } from './vehicles.js';
import { aircraft, buildAircraftMesh, AIR_KIND } from './aircraft.js';
import { town, buildTownMesh } from './town.js';
import { EGGS, buildEggMesh } from './eggs.js';
import { birds, birdPitch, birdFlap, buildBirdMesh, BIRD_SCALE } from './birds.js';
import { amb, ambJetDirs, ambOn, buildHotAirMesh, buildGliderMesh, BALLOON_COLS } from './ambient.js';
import { boats, buildBoatMesh, boatYaw, BOAT } from './boats.js';
import { dayState } from './daylight.js';
import { traffic } from './traffic.js';
import { rwLamps } from './roads.js';
import { deLandAt } from './demap.js';
import { i3sAddL1, I3S_PHYS, i3sPhysBuild, i3sGroundAt, i3sTrisNear, i3sPhysList, I3S, I3S_LOW, i3sAdapt, i3sRoom, i3s, i3sWanted, i3sAddPage, i3sPlanes, i3sSelect, i3sEvict, i3sGeometry, i3sPageUrl, i3sGeoUrl, i3sTexUrl, i3sBytes } from './rwmesh.js';
import { pilot, buildPilotMesh } from './pilot.js';
import { rw, rwMesh, rwFarMesh, rwWaterMesh, rwFeatureMesh, rwModelMesh, rwMeshInput, groundH, rwNet } from './realworld.js';
const tileGl = new Map();   // echte Welt, L5b: Netze und Luftbild je nachgeladener Kachel
// Umgebung, die mitwandert (Prüfbericht Nr. 16): gezeichneter Stand (Mitte, Größe, Version) und der nächste im Aufbau
const farAt = { cx: 0, cz: 0, size: 1, ver: -1 };
let farNext = null;
import { osdOn } from './osd.js';
import { targets } from './targets.js';
import { vehicles, buildVehicle, VEH_COLORS } from './vehicles.js';
import { MOTORS, PHYS, history } from './physics.js';
import { disBaseMesh, disBaseParts, disPreviewLayout, DIS_SIDE } from './distypes.js';
import { vb, vbGun, VB_FX } from './verbund.js';
const baseGl = new Map();   // VBS-Grundtypen: Netz je Typ, beim ersten Zeichnen hochgeladen

/* ---------- WebGL ---------- */
export const glc = document.getElementById('gl');
export const hud = document.getElementById('hud');
export const hctx = hud.getContext('2d');
export const gl = glc.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
// Grafik verloren (Treiber neu gestartet, Grafikspeicher voll, Handy lange im Hintergrund; Prüfbericht Nr. 3): Ohne
// preventDefault bliebe das Bild für immer schwarz. So meldet der Browser die Rückkehr, und alles wird neu aufgebaut.
// Solange ruht der Flug (main.js), das OSD zeigt einen Hinweis (hud.js).
export const glLost = { on: false, since: 0 };
glc.addEventListener('webglcontextlost', e => { e.preventDefault(); glLost.on = true; glLost.since = performance.now(); });
glc.addEventListener('webglcontextrestored', () => {
  trail = tether = scenMesh = null; scenVer = -1; tileGl.clear(); farNext = null; baseGl.clear(); partGl.clear(); flashMesh = tracerGl = null;
  terrain = farGl = rwModelGl = waterGl = featGl = photoTex = farTex = lampGl = null; rwGlVer = -1; tileGlVer = -1;
  initGL(); resize(); glLost.on = false;
});

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec4 aCol;
uniform mat4 uVP, uModel;
uniform float uTime, uGfx, uSink;
out vec3 vNor; out vec4 vCol; out vec3 vW;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  // Baumkronen im Wind (Prompt 180, L1): die Länge der Normale trägt 1 + Höhenanteil in der Krone (unten fest, Spitze schwingt am
  // meisten). Ausschlag bis etwa 0,2 m, langsame Böe plus leichtes Zittern, Phase je Ort. Nur ab „Mittel“. Zahlen: Schätzung.
  if (uGfx > 0.5 && aCol.a > 0.07 && aCol.a < 0.1) {
    float f = clamp(length(aNor) - 1.0, 0.0, 1.0), ph = aPos.x*0.21 + aPos.z*0.17;
    w.xz += f*(vec2(0.9, 0.35)*0.18*sin(uTime*0.9 + ph) + 0.05*sin(uTime*2.6 + ph));
  }
  if (uSink > 0.0 && aCol.a < 0.03) w.y -= uSink;   // Sichtprobe 3D-Mesh (M0): Gelände unter das Mesh, sonst flackern beide
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
uniform sampler2D uGround, uFar;
uniform float uVision, uHeat, uPhoto, uFarOn, uFarSize, uTime, uNight;
uniform vec2 uFarOrigin;
// Nachtmodus (N1): Selbstleuchten dieses Bildpunkts (Fenster, Lichter), Farbe und Wärme fürs Wärmebild. Global, damit facade()
// und vis() ihre Signatur behalten. Am Tag bleibt alles 0.
float gEmit = 0.0, gHeat = 0.0;
vec3 gEmitC = vec3(1.0, 0.78, 0.45);
uniform vec4 uEdgeOpen;   // echte Welt: Ränder der Kachel ohne Nachbarn (W, O, N, S), nur dort weich ins Umgebungsbild
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
// Fassade (echte Welt) je Nutzung k (aus ALKIS über LoD2): 0 Wohnhaus, 1 Wohnhaus mit Laden, 2 Garage/Überdachung, 3 Gewerbe,
// 4 Scheune, 5 öffentliches Gebäude, 6 Kirche/Burg/Turm, 7 Fachwerkhaus. Raster aus Feldbreite und Geschosshöhe ab dem Sockel.
// Fenster mit Rahmen spiegeln den Himmel je nach Blickwinkel. Feine Muster (Rippen, Bretter, Steine, Balken) und Fenster
// gehen weit weg weich in einen Mittelwert über (kein Flimmern). Maße: Schätzung nach üblichen Bauten.
vec2 wallInfo(float a){ float k = floor((a - 0.13)/0.04); return vec2(k, (a - 0.132 - k*0.04)/0.035*380.0 - 190.0); }
float rect(vec2 f, vec4 r, vec2 e){
  return smoothstep(r.x - e.x, r.x + e.x, f.x)*(1.0 - smoothstep(r.y - e.x, r.y + e.x, f.x))*smoothstep(r.z - e.y, r.z + e.y, f.y)*(1.0 - smoothstep(r.w - e.y, r.w + e.y, f.y));
}
float stoneAt(float u, float h){   // Bruchstein: Reihen 0,35 m, Steine 0,7 m versetzt; Rückgabe Helligkeit, < 0 = Fuge
  float row = floor(h/0.35), bx = (u + mod(row, 2.0)*0.35)/0.7, sy = fract(h/0.35), sx = fract(bx);
  float joint = 1.0 - smoothstep(0.0, 0.08, min(min(sy, 1.0 - sy)*0.35, min(sx, 1.0 - sx)*0.7));
  return mix(0.82 + 0.3*hash(vec2(floor(bx), row)), -1.0, joint*0.7);
}
vec3 stoneCol(vec3 c, float u, float h){ float s = stoneAt(u, h); return s < 0.0 ? mix(c*0.95, vec3(0.72, 0.7, 0.66), 0.7) : c*s; }
vec3 facade(vec3 c, vec3 p, vec3 n, float base, float k, vec3 cam, float eave){
  vec2 t = normalize(vec2(-n.z, n.x) + 1e-5);
  float u = dot(p.xz, t), h = p.y - base;
  if (k == 8.0) return c*(0.94 + 0.12*vnoise(vec2(u, h)*0.8));   // Brücke: Beton, leicht fleckig; keine Fenster, kein Sockel, kein Fachwerk
  // je Haus etwas anders (aus der Sockelhöhe, die je Gebäude verschieden ist): Feldbreite, Geschosshöhe, Fenstergröße, Sockel
  float bq = floor(base*4.0 + 0.5)*0.25;   // gerundet: die Sockelhöhe schwankt je Pixel minimal, die Zufallswerte dürfen das nicht verstärken
  float b1 = hash(vec2(bq*0.317 + 1.3, 2.1)), b2 = hash(vec2(7.7, bq*0.191)), b3 = hash(vec2(bq*0.037 + 5.1, bq*0.41));
  vec2 cell = k == 5.0 ? vec2(3.2, 3.6) : k == 3.0 ? vec2(4.0, 3.6) : k == 4.0 ? vec2(5.0, 4.0) : k == 6.0 ? vec2(4.0, 6.0) : k == 2.0 ? vec2(3.0, 2.9)
            : vec2(2.2 + 0.9*b1, 2.7 + 0.5*b2);
  vec2 q = vec2(u, h)/cell, f = fract(q), fw = max(fwidth(q), vec2(1e-4)), e = fw*1.5;
  float storey = floor(q.y), hs = hash(vec2(floor(q.x), storey) + bq);
  float fu = max(fwidth(u), 1e-4), fine = clamp(1.4 - fu*6.0, 0.0, 1.0);   // feine Muster (ca. 0,25 m) nur nah
  c *= 0.93 + 0.1*vnoise(p.xz*0.7 + p.y*0.9);
  vec3 avg = c, pat = c;
  // Material
  if (k == 3.0) pat *= mix(1.0, 0.86 + 0.14*smoothstep(0.2, 0.6, abs(fract(u/0.5) - 0.5)*2.0), fine);   // Blech mit Rippen
  if (k == 4.0) { float bd = fract(u/0.25); pat *= mix(1.0, (0.88 + 0.12*hash(vec2(floor(u/0.25), 3.0)))*mix(0.6, 1.0, smoothstep(0.0, 0.12, bd)*(1.0 - smoothstep(0.88, 1.0, bd))), fine); avg *= 0.93; }   // Bretter
  if (k == 6.0) pat = mix(c, stoneCol(c, u, h), fine);
  // Sockelgeschoss aus Bruchstein bei etwa jedem dritten Wohnhaus (in Monschau häufig; Annahme)
  bool stoneBase = (k < 1.5 || k == 7.0) && b3 < 0.33 && h < cell.y - 0.1;
  if (stoneBase) { vec3 sc = vec3(0.55, 0.51, 0.46); pat = mix(sc, stoneCol(sc, u, h), fine); avg = mix(avg, sc, 0.3); }
  // Öffnungen: Fenster (Glas), Ladenfenster, Tore
  float ww = 0.17 + 0.07*b2, wt = 0.68 + 0.1*b1;
  vec4 w = vec4(0.5 - ww, 0.5 + ww, 0.3, wt);
  float glassOn = 1.0, door = 0.0;
  if (k == 1.0 && storey < 0.5) w = vec4(0.08, 0.92, 0.06, 0.8);
  if (k == 2.0) { glassOn = 0.0; door = storey < 0.5 ? 1.0 : 0.0; w = vec4(0.1, 0.9, 0.0, 0.75); }
  if (k == 3.0) { w = vec4(0.03, 0.97, 0.45, 0.75); glassOn = step(0.25, hs); }
  if (k == 4.0) { if (storey < 0.5 && hs < 0.5) { door = 1.0; glassOn = 0.0; w = vec4(0.15, 0.85, 0.0, 0.85); } else { w = vec4(0.42, 0.58, 0.5, 0.7); glassOn = step(0.7, hs); } }
  if (k == 5.0) w = vec4(0.22, 0.78, 0.22, 0.82);
  if (k == 6.0) { w = vec4(0.42, 0.58, 0.3, 0.85); glassOn = step(0.4, hs); }
  // Über der Traufe (Giebel) und wo das Fenster die Traufe schneiden würde: keine Öffnung
  float below = 1.0 - smoothstep(eave - 0.35, eave - 0.25, (storey + w.w)*cell.y);
  glassOn *= below; door *= below;
  float win = rect(f, w, e)*glassOn, frame = (k == 0.0 || k == 1.0 || k == 5.0 || k == 7.0) ? rect(f, w + vec4(-0.04, 0.04, -0.04, 0.04), e)*glassOn : 0.0;
  float dr = rect(f, w, e)*door;
  vec3 v = normalize(cam - p);
  float fr = pow(1.0 - abs(dot(v, n)), 3.0);
  vec3 glass = mix(vec3(0.10, 0.13, 0.17), vec3(0.55, 0.66, 0.78), 0.25 + 0.6*fr);
  glass = mix(glass, vec3(0.78, 0.74, 0.62), step(0.78, hs)*0.5*step(k, 1.5));   // manche Wohnungsfenster mit hellem Vorhang
  // Nachts beleuchtet (N1): etwa jedes dritte Wohnungsfenster, jedes fünfte bei Gewerbe und Amt, nie Garage, Scheune, Kirche
  float litK = (k < 1.5 || k == 7.0) ? 0.35 : (k == 3.0 || k == 5.0) ? 0.2 : 0.0, lit = (1.0 - step(litK, hs))*uNight;
  glass = mix(glass, step(0.78, hs) > 0.5 ? vec3(0.95, 0.8, 0.6) : vec3(1.0, 0.85, 0.55), lit);
  vec3 doorC = k == 4.0 ? c*0.62 : vec3(0.42, 0.43, 0.44)*(0.9 + 0.1*step(0.5, fract(f.y*cell.y/0.3)));   // Scheunentor / Garagentor mit Lamellen
  // Fachwerk: dunkle Balken auf Geschossen, Brüstung, Pfosten an Feldrand und Fenstern, Streben neben den Fenstern
  if (k == 7.0 && !stoneBase) {
    float bx = 0.035, by = 0.034;
    float tim = max(1.0 - smoothstep(by, by + e.y, f.y), rect(f, vec4(-1.0, 2.0, 0.24, 0.28), e));
    tim = max(tim, max(1.0 - smoothstep(bx, bx + e.x, f.x), smoothstep(1.0 - bx - e.x, 1.0 - bx, f.x)));
    tim = max(tim, max(rect(f, vec4(w.x - 0.065, w.x - 0.03, -1.0, 2.0), e), rect(f, vec4(w.y + 0.03, w.y + 0.065, -1.0, 2.0), e))*below);
    float s = hs < 0.5 ? 1.0 : -1.0, jl = w.x - 0.065, gx = (f.x < 0.5 ? f.x - 0.035 : 0.965 - f.x)/max(jl - 0.035, 0.05), gy = (f.y - 0.28)/0.72;
    float brace = (f.y > 0.28 && gx > 0.0 && gx < 1.0) ? 1.0 - smoothstep(0.03, 0.03 + e.x*1.5, abs((s > 0.0 ? gx : 1.0 - gx) - gy)*(jl - 0.035)) : 0.0;
    if (h > eave) brace = 0.0;
    pat = mix(pat, vec3(0.2, 0.15, 0.11), max(tim, brace)*fine);
    avg = mix(c, vec3(0.2, 0.15, 0.11), 0.22);
  }
  pat = mix(mix(pat, vec3(0.93, 0.92, 0.9), frame), glass, win);
  pat = mix(pat, doorC, dr);
  avg = mix(avg, vec3(0.3, 0.34, 0.4), 0.17*(1.0 - step(1.5, k)*step(k, 2.5)));
  float fade = clamp(1.6 - max(fw.x, fw.y)*3.0, 0.0, 1.0);   // ab ~0,5 Felder je Pixel: Muster aus
  c = mix(avg, pat, fade);
  gEmit = uNight*mix(litK*0.12*below, win*lit, fade); gHeat = 0.15*gEmit;   // weit weg: mittleres Glimmen der Fassade
  float plinth = 1.0 - smoothstep(0.45, 0.55, h);
  return mix(c, c*vec3(0.55, 0.53, 0.5), plinth*step(k, 5.5));
}
// Bildmodus (V1): 1 Wärmebild (Szene gedämpftes Grau, warme Objekte hell), 2 Nachtsicht (grün, dunkler)
vec3 vis(vec3 col){
  if (uVision < 0.5) return col;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  if (uVision < 1.5) return vec3(mix(0.12 + 0.30*l, 0.97, max(uHeat, gHeat)));   // Lichter warm, beleuchtete Fenster etwas wärmer
  // Nachtsicht: nachts verstärkt das Gerät das Restlicht stark, Lichtquellen überstrahlen (N1); am Tag wie bisher
  return vec3(0.25, 1.0, 0.35)*min(0.05 + (uNight > 0.5 ? 4.5 : 0.6)*l + 0.25*uHeat + 2.5*gEmit, 1.6);
}
// Echte Welt: Dunst, der in Tälern (unter der Kamera) dichter ist, und blassere Farben mit der Entfernung.
// Zahlen Schätzung: 150 m Talhöhe, Dunst über 900 m, Entsättigung über 2,5 km, höchstens 45 %.
float rwHaze(float d, float dy){ return (1.0 - exp(-d/900.0))*(0.05 + 0.10*clamp(dy/150.0, 0.0, 1.0)); }
vec3 rwPale(vec3 col, float d){ return mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))), 0.45*(1.0 - exp(-d/2500.0))); }
void main(){
  vec3 n = normalize(vNor);
  vec3 c = vCol.rgb;
  bool ground = vCol.a < 0.125, wall = vCol.a >= 0.125 && vCol.a < 0.5, full = uGfx > 1.5;
  float dCam = length(vW - uCam);
  if (ground && uPhoto > 0.5) {   // echte Welt: Luftbild im Gebiet (25 m weicher Rand), außen das Luftbild der Umgebung (L5a), ganz außen gerechneter Boden
    vec2 uv = (vW.xz - uOrigin)/uSize;
    vec4 dd = mix(vec4(1e5), vec4(uv.x, 1.0 - uv.x, uv.y, 1.0 - uv.y)*uSize, uEdgeOpen);
    float e = all(lessThanEqual(abs(uv - 0.5), vec2(0.5))) ? min(min(dd.x, dd.y), min(dd.z, dd.w)) : min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y))*uSize;
    vec3 far = groundProc(vW.xz, 0.0);
    if (uFarOn > 0.5) {
      vec2 fv = (vW.xz - uFarOrigin)/uFarSize;
      float fe = min(min(fv.x, 1.0 - fv.x), min(fv.y, 1.0 - fv.y))*uFarSize;
      far = mix(far, texture(uFar, clamp(fv, 0.0, 1.0)).rgb, smoothstep(-1.0, 300.0, fe));
    }
    c = far;
    if (e > -1.0) c = mix(c, texture(uGround, clamp(uv, 0.0, 1.0)).rgb, smoothstep(-1.0, 25.0, e));
    if (vCol.a > 0.07) {   // Baumkrone: Farbe des Luftbilds darunter (unscharf, sonst Streifen an den Seiten), Licht weich
      c = mix(far, texture(uGround, clamp(uv, 0.0, 1.0), 3.0).rgb, smoothstep(-1.0, 25.0, e));
      c = mix(c, vec3(0.20, 0.30, 0.15), 0.15);
      n = normalize(n + vec3(0.0, 1.3, 0.0));
    } else if (full && dCam < 15.0) {   // „Schön“: feines Korn nah am Boden; das Luftbild (0,25 m je Pixel) verwischt unter 10 m. Stärke 0,22: Schätzung
      float g = vnoise(vW.xz*7.0)*0.6 + vnoise(vW.xz*19.0)*0.4;
      c *= 1.0 + (g - 0.5)*0.22*(1.0 - smoothstep(8.0, 15.0, dCam));
    }
  }
  // Wasser (echte Welt, Alpha 0,7): Luftbild des Flusses mit leichter Tönung, Spiegelung des Horizonts zum flachen Blick hin
  // (Fresnel), leichte Wellen und Sonnenglanz. Die Länge der Normale trägt 1 + Anteil Wasser um die Ecke: Rand weich ins Ufer.
  bool rwWater = uPhoto > 0.5 && vCol.a > 0.68 && vCol.a < 0.72;
  float wGlint = 0.0, wAlpha = 1.0;
  if (rwWater) {
    vec2 uv = (vW.xz - uOrigin)/uSize;
    c = mix(texture(uGround, clamp(uv, 0.0, 1.0)).rgb, c, 0.35);   // 65 % Luftbild, 35 % Tönung (Schätzung)
    vec3 v = normalize(uCam - vW);
    vec2 wp = vW.xz*1.7 + uTime*vec2(0.25, 0.18);   // Wellen etwa 0,6 m, langsam ziehend (Schätzung)
    float ws = exp(-dCam/150.0);   // Wellen nur nah: weiter weg ist ein Bildpunkt größer als eine Welle, Rauschen wurde zu weißem Geflimmer (Köln, 77 m)
    vec3 wn = normalize(vec3((vnoise(wp) - 0.5)*ws, 4.0, (vnoise(wp.yx + 3.1) - 0.5)*ws));
    float fr = pow(1.0 - max(dot(v, wn), 0.0), 3.0);
    c = mix(c, uFog, 0.12 + 0.55*fr);
    wGlint = pow(max(dot(reflect(-v, wn), uSun), 0.0), 160.0)*0.7*(0.4 + 0.6*ws);
    n = normalize(wn + vec3(0.0, 2.0, 0.0));
    wAlpha = clamp(length(vNor) - 1.0, 0.0, 1.0);
  }
  bool rwWall = wall && uPhoto > 0.5, rwRoof = uPhoto > 0.5 && vCol.a > 0.55 && vCol.a < 0.65;
  vec2 wi = wallInfo(vCol.a);
  if (rwWall && abs(n.y) < 0.6) c = facade(c, vW, n, wi.y, wi.x, uCam, (length(vNor) - 2.0)*100.0);
  if (rwRoof) {   // Dach: Farbe aus dem Luftbild an dieser Stelle (Licht und Schatten sind darin), leicht mit der Dachfarbe gemischt
    vec2 uv = (vW.xz - uOrigin)/uSize;
    if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) c = mix(texture(uGround, uv).rgb, c, 0.15);
    n = normalize(n + vec3(0.0, 1.0, 0.0));   // Licht weich, sonst doppelt (Bild und Rechnung)
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
  // Lichtkennung Alpha 0,75 (Scheinwerfer, Rücklichter, später Laternen): nachts selbstleuchtend, am Tag normale Fläche
  if (uNight > 0.5 && vCol.a > 0.74 && vCol.a < 0.76) { float m = max(max(vCol.r, vCol.g), vCol.b); gEmit = pow(m, 2.2); gEmitC = vCol.rgb/max(m, 1e-3); gHeat = 0.6*m; }   // Stärke aus dem hellsten Farbanteil, gekrümmt: Lichtscheiben laufen zum Rand weich aus (sonst harte Kante)
  if (uNight > 0.5) wGlint *= 0.3;   // Mond glänzt schwächer als die Sonne
  if (uGfx < 0.5) {
    c = mix(c, uOver.rgb, uOver.a);
    float dif = max(dot(n, uSun), 0.0);
    vec3 amb = mix(vec3(0.30,0.29,0.26), vec3(0.52,0.60,0.70), 0.5 + 0.5*n.y), lc = vec3(1.0,0.96,0.88)*0.72;
    if (uNight > 0.5) { amb *= vec3(0.07, 0.08, 0.12); lc = vec3(0.25, 0.30, 0.45)*0.2; }   // Nacht: schwaches bläuliches Restlicht (Schätzung)
    vec3 col = c * (amb + dif*lc) + uOver.rgb*uOver.a*0.35 + vec3(1.0, 0.95, 0.85)*wGlint;
    float d = dCam;
    float f = 1.0 - exp(-pow(d*uFogD, 1.6));
    if (uPhoto > 0.5) { col = rwPale(col, d); f += rwHaze(d, uCam.y - vW.y)*(1.0 - 0.5*uNight); }
    col = mix(col, uFog, clamp(f, 0.0, 1.0)) + gEmitC*gEmit*(1.0 - 0.7*clamp(f, 0.0, 1.0));
    o = vec4(vis(col), uAlpha*wAlpha);
    return;
  }
  if (ground && uPhoto < 0.5) {
    c = groundProc(vW.xz, full ? 1.0 : 0.0);
    if (full) {   // im vorberechneten Bereich (mit Schatten und Wegen) die Textur, zum Rand hin weich in den gerechneten Boden
      vec2 uv = (vW.xz - uOrigin)/uSize;
      float e = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y))*uSize;
      if (e > 0.0) c = mix(c, texture(uGround, uv).rgb, smoothstep(0.0, 30.0, e));
    }
  }
  if (full && wall && abs(n.y) < 0.5 && uPhoto < 0.5) {   // Fenster: Raster auf den Wänden, unten Sockel
    vec2 w = vec2(vW.x + vW.z, vW.y);
    vec2 f = fract(w/vec2(2.6, 3.0));
    float win = step(0.3, f.x)*step(f.x, 0.7)*step(0.35, f.y)*step(f.y, 0.75)*step(1.2, vW.y);
    float lit = (1.0 - step(0.3, hash(floor(w/vec2(2.6, 3.0)))))*uNight;   // nachts etwa jedes dritte Fenster hell (N1)
    c = mix(c, mix(vec3(0.16, 0.22, 0.30), vec3(1.0, 0.85, 0.55), lit), win*0.85);
    gEmit = win*lit*0.85; gHeat = 0.15*gEmit;
    c *= mix(0.75, 1.0, smoothstep(0.0, 0.8, vW.y));
  }
  // Lineares Licht, warme Sonne, kühler Himmel, Abdunklung am Boden, Tone-Mapping, sRGB
  vec3 base = pow(mix(c, uOver.rgb, uOver.a), vec3(2.2));
  float dif = max(dot(n, uSun), 0.0);
  vec3 sky = vec3(0.20, 0.27, 0.40), bounce = vec3(0.10, 0.09, 0.06);
  vec3 amb = mix(bounce, sky, 0.5 + 0.5*n.y);
  float ao = 1.0;
  if (!ground && uPhoto < 0.5) ao = mix(0.45, 1.0, smoothstep(0.0, 1.5, vW.y)) * (n.y < -0.5 ? 0.6 : 1.0);
  if (rwWall) ao = mix(0.6, 1.0, smoothstep(0.0, 1.5, vW.y - wi.y));   // echte Welt: Abdunklung ab dem Sockel
  vec3 lc = vec3(1.0, 0.88, 0.70)*1.5;
  if (uNight > 0.5) { amb *= vec3(0.06, 0.08, 0.12); lc = vec3(0.25, 0.30, 0.45)*0.25; }   // Nacht: Mondlicht bläulich und schwach (Schätzung)
  vec3 col = base*(amb*ao + dif*lc) + pow(uOver.rgb, vec3(2.2))*uOver.a*0.5 + vec3(1.0, 0.95, 0.85)*wGlint;
  float d = dCam;
  float f = 1.0 - exp(-pow(d*uFogD, 1.6));
  float hz = full && uPhoto < 0.5 ? exp(-max(vW.y, 0.0)/18.0)*(1.0 - exp(-d/450.0))*0.12 : 0.0;   // Dunst nah am Boden
  if (uPhoto > 0.5) { col = rwPale(col, d); hz = rwHaze(d, uCam.y - vW.y)*(1.0 - 0.5*uNight); }   // echte Welt: Taldunst und blasse Ferne
  col = mix(col, pow(uFog, vec3(2.2))*0.85, clamp(f + hz, 0.0, 1.0));
  col += pow(gEmitC, vec3(2.2))*gEmit*1.4*(1.0 - 0.7*clamp(f + hz, 0.0, 1.0));   // Licht: nur leicht vom Nebel gedämpft
  col = (col*(2.51*col + 0.03))/(col*(2.43*col + 0.59) + 0.14);   // ACES-Näherung
  o = vec4(vis(pow(clamp(col, 0.0, 1.0), vec3(1.0/2.2))), uAlpha*wAlpha);
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
uniform float uVision, uGfx, uTime, uNight;   // nachts ist uSun die Richtung zum Mond
uniform vec4 uJa0, uJb0, uJa1, uJb1;   // Flugzeuge (ambient.js): Richtung zum Rumpf und zum Ende des Kondensstreifens, w = Deckkraft
out vec4 o;
${NOISE}
// Kondensstreifen: Großkreis-Stück zwischen Rumpf (a) und Ende (b) am Himmel; schmal am Rumpf, breiter und blasser mit dem Alter.
// Rechnet nur nahe am Streifen weiter (Abstand zur Großkreis-Ebene), sonst kostet es fast nichts.
vec3 contrail(vec3 c, vec3 d, vec4 A, vec4 B){
  if (A.w <= 0.0) return c;
  vec3 nr = cross(A.xyz, B.xyz); float L = length(nr);
  float hd = acos(clamp(dot(d, A.xyz), -1.0, 1.0));
  if (uNight > 0.5) return mix(c, vec3(1.0), smoothstep(0.003, 0.0012, hd)*step(0.5, fract(uTime*1.2))*A.w);   // nachts: nur Blinklicht
  c = mix(c, vec3(0.62, 0.64, 0.68), smoothstep(0.0022, 0.0010, hd)*A.w);   // Rumpf als kleiner heller Punkt (etwa 1 Bildpunkt)
  if (L < 1e-6) return c;
  nr /= L;
  float dist = abs(dot(d, nr));
  if (dist > 0.01) return c;
  vec3 pr = normalize(d - nr*dot(d, nr));
  float ab = acos(clamp(dot(A.xyz, B.xyz), -1.0, 1.0)), ta = acos(clamp(dot(A.xyz, pr), -1.0, 1.0)), tb = acos(clamp(dot(pr, B.xyz), -1.0, 1.0));
  if (ta + tb > ab + 1e-4) return c;
  float u = ta/max(ab, 1e-5), w = mix(0.0015, 0.008, u);   // Breite in Radiant: frisch etwa 40 m, alt etwa 200 m auf 25 km (Schätzung)
  float k = smoothstep(w, w*0.25, dist)*smoothstep(0.0, 0.015, u)*(1.0 - smoothstep(0.55, 1.0, u))*A.w*(0.85 - 0.35*u);
  return mix(c, vec3(0.97, 0.97, 1.0), k);
}
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
  // Sonne: Scheibe (etwa 1 Grad), heller Rand darum, weiter Schein. Nachts der Mond: Scheibe, schwacher Hof, dazu Sterne.
  float disc = smoothstep(0.99982, 0.99990, s), sl = 0.0;
  if (uNight < 0.5) c += vec3(1.0,0.92,0.75) * (pow(s, 900.0)*1.2 + pow(s, 14.0)*0.12);
  else {
    if (uGfx > 1.5) c += vec3(0.5, 0.55, 0.7)*pow(s, 30.0)*0.08;
    if (uGfx > 0.5 && d.y > 0.0) {   // Sterne: Zelle von etwa 0,2 Grad, jede 250. leuchtet, Helligkeit zufällig, Schön mit Funkeln
      vec2 g = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)))*280.0, f = fract(g) - 0.5;
      float h = hash(floor(g));
      if (h > 0.996) {
        float st = smoothstep(0.35, 0.08, length(f))*(0.35 + 0.65*fract(h*731.0))*smoothstep(0.02, 0.15, d.y);
        if (uGfx > 1.5) st *= 0.75 + 0.25*sin(uTime*3.0 + h*900.0);
        c += vec3(0.9, 0.92, 1.0)*st; sl += st;
      }
    }
  }
  if (uGfx > 0.5 && d.y > 0.0) {   // Wolken nur ab „Mittel“, „Einfach“ bleibt unverändert schnell
    vec2 p = d.xz/(d.y + 0.12)*1.6 + uTime*vec2(0.006, 0.0025);
    float n = fbm(p, uGfx > 1.5 ? 5 : 3);
    float cov = smoothstep(0.50, 0.74, n)*smoothstep(0.0, 0.22, d.y);
    cov *= smoothstep(0.9993, 0.9965, s);   // Wolken lassen die Sonne frei (sonst blendet der Lens-Flare durch Wolken)
    vec3 cc = mix(vec3(0.70, 0.75, 0.83), vec3(0.98, 0.98, 1.0), smoothstep(0.48, 0.85, n));
    cc += vec3(0.20, 0.15, 0.08)*pow(s, 6.0);   // zur Sonne hin warm aufgehellt
    if (uNight > 0.5) { cc = mix(vec3(0.10, 0.11, 0.14), vec3(0.16, 0.17, 0.2), smoothstep(0.48, 0.85, n)); cov *= 0.7; sl *= 1.0 - cov; }   // nachts dunkelgrau, Sterne dahinter
    c = mix(c, cc, cov*0.85);
  }
  if (d.y > 0.0) { c = contrail(c, d, uJa0, uJb0); c = contrail(c, d, uJa1, uJb1); }
  c = mix(c, uNight > 0.5 ? vec3(0.85, 0.87, 0.92) : vec3(1.0, 0.98, 0.92)*1.6, disc);
  sl += disc*uNight;
  if (uVision > 1.5) c = vec3(0.02, 0.07, 0.03) + vec3(0.03, 0.10, 0.04)*(1.0 - t) + vec3(0.25, 1.0, 0.35)*sl*0.8;   // Nachtsicht: fast schwarz-grün, Sterne und Mond hell
  else if (uVision > 0.5) c = vec3((0.10 + 0.08*(1.0 - t))*(1.0 - 0.3*uNight));             // Wärmebild: kalter Himmel dunkel, nachts kälter
  o = vec4(c, 1.0);
}`;
// Sichtprobe 3D-Mesh NRW (M0, ?mesh=1): Knoten mit Textur; Lagen relativ zur Knotenmitte (Ost, Nord, Höhe) -> Karte (x Ost, y Höhe,
// z Süd) plus Versatz uOff. Licht wie ein Bodenpunkt des Luftbilds im Welt-Shader (Normale nach oben; Licht und Schatten stecken im
// Bild), Dunst, blasse Ferne, Nebel, Nacht, Wärme und Nachtsicht wie dort (Stücke kopiert, für die Probe).
const MESH_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
uniform mat4 uVP; uniform vec3 uOff;
out vec2 vUV; out vec3 vW;
void main(){ vec3 w = vec3(aPos.x, aPos.z, -aPos.y) + uOff; vW = w; vUV = aUV; gl_Position = uVP*vec4(w, 1.0); }`;
const MESH_FS = `#version 300 es
precision highp float;
in vec2 vUV; in vec3 vW;
uniform vec3 uCam, uFog, uSun; uniform float uFogD, uNight, uGfx, uVision; uniform sampler2D uTex;
out vec4 o;
float rwHaze(float d, float dy){ return (1.0 - exp(-d/900.0))*(0.05 + 0.10*clamp(dy/150.0, 0.0, 1.0)); }
vec3 rwPale(vec3 col, float d){ return mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))), 0.45*(1.0 - exp(-d/2500.0))); }
vec3 vis(vec3 col){
  if (uVision < 0.5) return col;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  if (uVision < 1.5) return vec3(0.12 + 0.30*l);
  return vec3(0.25, 1.0, 0.35)*min(0.05 + (uNight > 0.5 ? 4.5 : 0.6)*l, 1.6);
}
void main(){
  vec3 c = texture(uTex, vUV).rgb;
  float d = length(vW - uCam), f = 1.0 - exp(-pow(d*uFogD, 1.6)), dif = max(uSun.y, 0.0);
  if (uGfx < 0.5) {
    vec3 amb = vec3(0.52, 0.60, 0.70), lc = vec3(1.0, 0.96, 0.88)*0.72;
    if (uNight > 0.5) { amb *= vec3(0.07, 0.08, 0.12); lc = vec3(0.25, 0.30, 0.45)*0.2; }
    vec3 col = rwPale(c*(amb + dif*lc), d);
    o = vec4(vis(mix(col, uFog, clamp(f + rwHaze(d, uCam.y - vW.y)*(1.0 - 0.5*uNight), 0.0, 1.0))), 1.0);
    return;
  }
  vec3 amb = vec3(0.20, 0.27, 0.40), lc = vec3(1.0, 0.88, 0.70)*1.5;
  if (uNight > 0.5) { amb *= vec3(0.06, 0.08, 0.12); lc = vec3(0.25, 0.30, 0.45)*0.25; }
  vec3 col = rwPale(pow(c, vec3(2.2))*(amb + dif*lc), d);
  col = mix(col, pow(uFog, vec3(2.2))*0.85, clamp(f + rwHaze(d, uCam.y - vW.y)*(1.0 - 0.5*uNight), 0.0, 1.0));
  col = (col*(2.51*col + 0.03))/(col*(2.43*col + 0.59) + 0.14);
  o = vec4(vis(pow(clamp(col, 0.0, 1.0), vec3(1.0/2.2))), 1.0);
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

let rotorMesh = null, rotorBlur = null, discMesh = null;
let P = null, PS = null, PF = null, PM = null, flareK = 0, flareP = [0, 0], worldMesh = null, droneMesh = null, skyVao = null, staticCount = 0, groundCount = 0;
let townMesh = null, eggMesh = [], birdMesh = [], pilotMesh = null, terrain = null, farGl = null, farTex = null, rwModelGl = null, photoTex = null, rwGlVer = -1, tileGlVer = -1, farDirty = false, mainDirty = false, tileGen = 0, farGen = 0, waterGl = null, featGl = null, airMesh = {}, scenMesh = null, scenParts = [], scenVer = -1, vehMesh = null, beamMesh = null, boatMesh = {}, hotAirMesh = [], gliderMesh = null, lampGl = null, pkgMesh = null, trail = null, balloonMesh = null, tether = null, flashMesh = null, tracerGl = null;
const partGl = new Map();   // DIS-Einheiten: Teile je Grundtyp
const SUN = vNorm([0.45, 0.8, 0.3]);
// Sonne in der echten Welt: passend zu den Schatten im Luftbild (die sind eingebacken; vorher widersprachen beleuchtete
// Fassaden und Bodenschatten). Gemessen am Luftbild von Monschau (08.11.2026, Skript: je LoD2-Gebäude die dunkelste
// Richtung 1 bis 3 m neben dem Grundriss, 145 Gebäude mit deutlichem Schatten): Schatten fallen nach Azimut 1° (Norden),
// die Sonne steht also im Süden (181°), Befliegung um die Mittagszeit. Sonnenhöhe: aus Schattenlängen nicht verlässlich
// (Nachbarhäuser und Hang kürzen die Schatten, Messung ergab 55 bis 72°, über dem Höchststand in NRW); Annahme 45°,
// typisch für Frühjahrsbefliegungen (März/April) in NRW (Schätzung). Für andere Orte und Bildflüge kann beides abweichen.
const SUN_RW = vNorm([-Math.sin(Math.PI/180)*Math.cos(Math.PI/4), Math.sin(Math.PI/4), Math.cos(Math.PI/180)*Math.cos(Math.PI/4)]);   // x Ost, z Süd
const sunDir = () => rw.on ? SUN_RW : SUN;
const PATH = new Float32Array(COURSE.flatMap(c => [c[0], c[1]]).concat([0, 0]));   // Wege im Boden: Kurs als Linienzug

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
let worldData = null;
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
  P = program(VS, FS, ['uVP', 'uModel', 'uSun', 'uCam', 'uFog', 'uOver', 'uFogD', 'uAlpha', 'uGfx', 'uSize', 'uOrigin', 'uGround', 'uVision', 'uHeat', 'uPhoto', 'uFar', 'uFarOn', 'uFarSize', 'uFarOrigin', 'uEdgeOpen', 'uTime', 'uNight', 'uSink']);
  PM = program(MESH_VS, MESH_FS, ['uVP', 'uOff', 'uCam', 'uFog', 'uFogD', 'uSun', 'uNight', 'uGfx', 'uVision', 'uTex']);
  PS = program(SKY_VS, SKY_FS, ['uInv', 'uCam', 'uFog', 'uZen', 'uSun', 'uVision', 'uGfx', 'uTime', 'uJa0', 'uJb0', 'uJa1', 'uJb1', 'uNight']);
  PF = program(SKY_VS, FLARE_FS, ['uSunP', 'uK', 'uAsp']);
  const w = worldData || (worldData = buildWorld());   // buildWorld füllt Hindernisse und Tore und darf nur einmal laufen (Neuaufbau nach Grafikverlust)
  staticCount = w.staticCount; groundCount = w.groundCount;
  worldMesh = upload(w.data);
  droneMesh = upload(buildDrone());
  vehMesh = upload(buildVehicle());
  for (const k of Object.keys(BOAT.kinds)) boatMesh[k] = upload(buildBoatMesh(k));   // Belebung L2: Boote, Ballon, Segler
  hotAirMesh = BALLOON_COLS.map(c => upload(buildHotAirMesh(c))); gliderMesh = upload(buildGliderMesh());
  { // Lichtkegel vor einem Auto (N2, Schön): Fläche auf der Straße 2,3 bis 12 m vor dem Wagen, vorn warm, hinten 0 (Alpha 0,75 = Licht)
    const n = [0.62, 0.55, 0.4, 0.75], f = [0, 0, 0, 0.75], y = 0.06, d = [];
    const v = (x, z, c) => d.push(x, y, z, 0, 1, 0, c[0], c[1], c[2], c[3]);
    v(-1.0, -2.3, n); v(1.0, -2.3, n); v(3.0, -12, f); v(-1.0, -2.3, n); v(3.0, -12, f); v(-3.0, -12, f);
    beamMesh = upload(new Float32Array(d)); }
  { const mb = new MeshBuilder(); mb.box([0, 0, 0], [0.07, 0.05, 0.07], 0, [0.62, 0.45, 0.28]); pkgMesh = upload(new Float32Array(mb.d)); }   // Paket
  balloonMesh = upload(buildBalloonMesh());
  for (const k of ['plane', 'heli', 'hexa']) airMesh[k] = upload(buildAircraftMesh(k));
  townMesh = upload(buildTownMesh());   // kleine Stadt mit Testecken
  eggMesh = EGGS.map((e, i) => upload(buildEggMesh(i)));   // Ostereier
  birdMesh = [0, 1, 2, 3, 4, 5].map(k => ({ body: upload(buildBirdMesh(k, 'body', BIRD_SCALE[k] || 1)), wing: upload(buildBirdMesh(k, 'wing', BIRD_SCALE[k] || 1)) }));   // Vögel, dazu Gans, Greifvogel, Star (ambient.js)
  pilotMesh = { body: upload(buildPilotMesh('body')), head: upload(buildPilotMesh('head')) };   // Pilot mit Funke
  // Propeller: vorne rot, hinten dunkelgrau (Farbe im Netz, damit das Licht das Blatt formt statt einer flachen Tönung)
  rotorMesh = { front: upload(buildRotorMesh(ROTOR_RED)), rear: upload(buildRotorMesh(ROTOR_DARK)) };
  rotorBlur = { front: buildRotorBlur(ROTOR_RED), rear: buildRotorBlur(ROTOR_DARK) };
  discMesh = upload(buildDisc());   // flache Scheibe: weiche Schatten unter bewegten Objekten
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
  if (glLost.on || gl.isContextLost()) return;
  const sim = game.sim;
  adaptRes();
  const W = glc.width, H = glc.height, asp = W/H;
  const hf = (cfg.fov || 110)*DEG;   // horizontales Blickfeld
  const vf = clamp(2*Math.atan(Math.tan(hf/2)/asp), 55*DEG, 120*DEG);
  const near = rw.on ? (rw.far ? 0.1 : 0.06) : cfg.cam === 'fpv' ? 0.02 : 0.05;
  const proj = mPersp(vf, asp, near, rw.on && rw.far ? 9000 : 1500);   // echte Welt mit Umgebung (L5a): Sicht bis 9 km, nahe Ebene 0,1 m (Tiefe bleibt fein)   // FPV: nahe Bildebene, sonst schneidet sie am Boden den Boden an. Echte Welt: 0,06 m, dreifach feinere Tiefe in der Ferne (Dächer, Wasser)
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
    // Abstand zum Boden mindestens 1,4 x nahe Bildebene: Sonst trifft der unterste Sichtstrahl den Boden näher als die
    // Bildebene, das Bild schneidet ihn weg und man sieht von unten ins Gelände (Fehlerbericht Nutzer, Prompt 138: Start in der
    // echten Welt). Gerechnet für Blickfeld bis 120° hoch und Kamera 20° nach oben: nötig sind bis 1,3 x nahe Ebene.
    eye[1] = Math.max(eye[1], groundH(eye[0], eye[2]) + Math.max(0.035, near*1.4));   // groundH ist die gezeichnete Fläche (echte Welt)
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
  const DS = dayState(cfg.night, sunDir()), FOGN = DS.fog;   // Tageszeit (N1): Licht, Nebel, Himmel
  gl.clearColor(FOGN[0], FOGN[1], FOGN[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Himmel
  gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
  gl.useProgram(PS.p);
  gl.uniformMatrix4fv(PS.u.uInv, false, mInv(vp));
  gl.uniform3fv(PS.u.uCam, eye); gl.uniform3fv(PS.u.uFog, FOGN);
  const S = DS.light;
  gl.uniform3fv(PS.u.uZen, DS.zen); gl.uniform3fv(PS.u.uSun, S); gl.uniform1f(PS.u.uNight, DS.night);
  const VIS = cfg.vision === 'thermal' ? 1 : cfg.vision === 'night' ? 2 : 0;   // Bildmodus (V1)
  gl.uniform1f(PS.u.uVision, VIS);
  const GFX = gfxLevel(cfg.gfx);   // Foto 3D zählt als Schön (plus Mesh)
  gl.uniform1f(PS.u.uGfx, GFX); gl.uniform1f(PS.u.uTime, performance.now()/1000);
  { const J = ambJetDirs(eye);   // Flugzeuge mit Kondensstreifen (nur echte Welt, nicht DIS)
    [['uJa0', 'uJb0'], ['uJa1', 'uJb1']].forEach(([ka, kb], i) => { const j = J[i]; gl.uniform4f(PS.u[ka], ...(j ? j.a : [0, 1, 0]), j ? j.alpha : 0); gl.uniform4f(PS.u[kb], ...(j ? j.b : [0, 1, 0]), 0); }); }
  gl.bindVertexArray(skyVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true);

  // Welt
  gl.useProgram(P.p);
  gl.uniformMatrix4fv(P.u.uVP, false, vp);
  gl.uniformMatrix4fv(P.u.uModel, false, mIdent());
  gl.uniform3fv(P.u.uSun, S); gl.uniform3fv(P.u.uCam, eye); gl.uniform3fv(P.u.uFog, FOGN); gl.uniform1f(P.u.uNight, DS.night);
  gl.uniform1f(P.u.uFogD, rw.on ? (rw.far ? 1/2200 : 1/700) : GFX ? 1/380 : 1/260);   // Mittel und Schön: weniger dichter Nebel (Einfach unverändert). Echte Welt: klare Sicht, Nebel verdeckt erst den Rand
  gl.uniform1f(P.u.uGfx, GFX); gl.uniform1f(P.u.uTime, performance.now()/1000);
  gl.uniform1f(P.u.uVision, VIS); gl.uniform1f(P.u.uHeat, 0);   // Wärme je Objekt: 0 kalt, 1 heiß (Motoren)
  gl.uniform1f(P.u.uSize, GROUND.size); gl.uniform2f(P.u.uOrigin, GROUND.origin[0], GROUND.origin[1]);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, groundTex); gl.uniform1i(P.u.uGround, 0);
  gl.uniform1f(P.u.uAlpha, 1);
  gl.uniform4f(P.u.uOver, 0, 0, 0, 0);
  gl.uniform1f(P.u.uPhoto, rw.on ? 1 : 0);
  const meshO = meshStep(vp, eye, H/(2*Math.tan(vf/2)));   // Sichtprobe 3D-Mesh (M0, nur ?mesh=1)
  gl.uniform1f(P.u.uSink, meshShow ? I3S.sink : 0);
  if (rw.on) drawTerrain(meshO && meshShow ? () => drawMesh(vp, eye, meshO, GFX, VIS, FOGN) : null);
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
  }   // Ende Spielkarte
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
  // Belebung der echten Welt (ambient.js, nicht DIS): Schwarm und Greifvögel, gleiche Teile wie die Vögel, größer (BIRD_SCALE)
  for (const b of amb.birds) {
    const m = birdMesh[b.kind], s = BIRD_SCALE[b.kind] || 1, q = qAxis([0,1,0], b.yaw);
    gl.uniformMatrix4fv(P.u.uModel, false, mFromQT(q, b.p));
    gl.bindVertexArray(m.body.vao); gl.drawArrays(gl.TRIANGLES, 0, m.body.count);
    const f = b.glide ? 0.12 : Math.sin(b.flap*2*Math.PI)*0.8, sh = vAdd(b.p, qRot(q, [0, 0.09*s, 0]));
    gl.bindVertexArray(m.wing.vao);
    gl.uniformMatrix4fv(P.u.uModel, false, mFromQT(qMul(q, qAxis([0,0,1], f)), vAdd(sh, qRot(q, [0.04*s, 0, 0]))));
    gl.drawArrays(gl.TRIANGLES, 0, m.wing.count);
    gl.uniformMatrix4fv(P.u.uModel, false, mFromQT(qMul(q, qMul(qAxis([0,1,0], Math.PI), qAxis([0,0,1], f))), vAdd(sh, qRot(q, [-0.04*s, 0, 0]))));
    gl.drawArrays(gl.TRIANGLES, 0, m.wing.count);
  }
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
    // Höhe über dem Boden: Spielkarte y = 0, echte Welt die Bodenhöhe darunter (sonst lag der Schatten flach auf Höhe 0, Prompt 138)
    const add = (p, rx, rz, yaw) => { const g = rw.on ? groundH(p[0], p[2]) : 0, h = p[1] - g;
      if (h < 40) blobs.push([p[0] - S[0]/S[1]*h, p[2] - S[2]/S[1]*h, rx*(1 + h*0.03), rz*(1 + h*0.03), yaw, 0.5*Math.max(0, 1 - h/30), g]); };
    { const hg = sim.p[1] - (rw.on ? groundH(sim.p[0], sim.p[2]) : 0);   // eigener Schatten; im Kamerabild erst ab 0,5 m (am Boden deckte er den unteren Rand zu)
      if (cfg.cam !== 'fpv' || (hg > 0.5 && hg < 20)) add(vSub(sim.p, [0, PHYS.foot, 0]), 0.2*PHYS.size, 0.2*PHYS.size, 0); }
    if (scen.id === 'hunt') for (const t of targets) add(t.p, 0.35, 0.35, 0);
    if (scen.id === 'hunt3') for (const t of aircraft) add(t.p, t.kind === 'hexa' ? 0.9 : 1.1, t.kind === 'hexa' ? 0.9 : 1.1, 0);
    if (scen.id === 'hunt2') for (const v of vehicles) add([v.x, v.y || 0, v.z], 1.15, 2.3, v.yaw);
    for (const a of traffic.cars) add([a.x, a.y, a.z], 1.15, 2.3, a.yaw);
    if (scen.id === 'follow') { const L = followLead(); add([L.x, L.y || 0, L.z], 1.15, 2.3, L.yaw); }
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -4);
    gl.uniform4f(P.u.uOver, 0, 0, 0, 1);
    gl.bindVertexArray(discMesh.vao);
    const dr = 0.063*PROP_S;   // Radius der Scheibe im Modell
    for (const [x, z, rx, rz, yaw, a, g0] of blobs) for (const [k, al] of [[1.4, 0.45], [0.9, 1]]) {   // außen weich, innen dunkler
      const m = mFromQT(qAxis([0,1,0], yaw), [x, (rw.on ? groundH(x, z) : g0) + 0.02, z]);
      for (const i of [0, 1, 2]) m[i] *= rx*k/dr;
      for (const i of [8, 9, 10]) m[i] *= rz*k/dr;
      gl.uniformMatrix4fv(P.u.uModel, false, m); gl.uniform1f(P.u.uAlpha, a*al*0.6*(cfg.night ? 0.4 : 1));   // nachts schwach (Mond)
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
    const list = scen.id === 'hunt' ? targets.map(t => [t.bal, t.p]) : scen.id === 'hunt3' ? aircraft.map(t => [t.bal, vSub(t.p, [0, 0.4, 0])]) : vehicles.map(v => [v.bal, [v.x, (v.y || 0) + VEH_HALF[1]*2, v.z]]);
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
      const pts = L.trail.concat([[L.x, (L.y || 0) + 0.4, L.z]]), d = new Float32Array(pts.length*10);
      pts.forEach((p, i) => d.set([p[0], p[1], p[2], 0, 1, 0, 1, 0.6, 0.1, 1], i*10));
      gl.bindVertexArray(tether.vao); gl.bindBuffer(gl.ARRAY_BUFFER, tether.buf); gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
      gl.uniformMatrix4fv(P.u.uModel, false, mIdent()); gl.uniform4f(P.u.uOver, 1, 0.6, 0.1, 1);
      gl.drawArrays(gl.LINE_STRIP, 0, pts.length);
    }
    gl.bindVertexArray(vehMesh.vao);
    gl.uniformMatrix4fv(P.u.uModel, false, mFromQT(qAxis([0,1,0], L.yaw), [L.x, L.y || 0, L.z]));
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
      gl.uniformMatrix4fv(P.u.uModel, false, mFromQT(q, [v.x, (v.y || 0) + v.tilt*0.6, v.z]));
      const c = v.state === 'hit' ? [0.08, 0.08, 0.08] : VEH_COLORS[v.kind];
      gl.uniform4f(P.u.uOver, c[0], c[1], c[2], v.state === 'hit' ? 0.75 : 0.55);
      gl.drawArrays(gl.TRIANGLES, 0, vehMesh.count);
    }
    gl.uniform4f(P.u.uOver, 0, 0, 0, 0);
  }
  // Verkehr der echten Welt (S1): Zufallsautos auf den Straßen, Farbe je Auto, warmer Motor; nachts leuchten die Lichter (Alpha 0,75)
  if (traffic.cars.length) {
    gl.bindVertexArray(vehMesh.vao); gl.uniform1f(P.u.uHeat, 0.85);
    for (const a of traffic.cars) {
      gl.uniformMatrix4fv(P.u.uModel, false, mFromQT(qMul(qAxis([0,1,0], a.yaw), qAxis([1,0,0], a.pitch)), [a.x, a.y, a.z]));
      gl.uniform4f(P.u.uOver, a.col[0], a.col[1], a.col[2], 0.6);
      gl.drawArrays(gl.TRIANGLES, 0, vehMesh.count);
    }
    gl.uniform4f(P.u.uOver, 0, 0, 0, 0); gl.uniform1f(P.u.uHeat, 0);
  }
  // Belebung der echten Welt (L2): Boote auf dem Wasser, Heißluftballon, Segelflieger
  for (const b of boats.list) {
    const m = boatMesh[b.kind]; gl.bindVertexArray(m.vao); gl.uniform1f(P.u.uHeat, BOAT.kinds[b.kind].heat);
    gl.uniformMatrix4fv(P.u.uModel, false, mFromQT(qAxis([0,1,0], boatYaw(b.head)), [b.x, b.y, b.z]));
    gl.drawArrays(gl.TRIANGLES, 0, m.count);
  }
  if (amb.balloon) {
    const B = amb.balloon, m = hotAirMesh[Math.max(0, BALLOON_COLS.indexOf(B.col))];
    gl.bindVertexArray(m.vao); gl.uniform1f(P.u.uHeat, 0.5);
    gl.uniformMatrix4fv(P.u.uModel, false, mFromQT([0, 0, 0, 1], B.p)); gl.drawArrays(gl.TRIANGLES, 0, m.count);
  }
  if (amb.glider) {
    const G = amb.glider; gl.bindVertexArray(gliderMesh.vao); gl.uniform1f(P.u.uHeat, 0.3);
    gl.uniformMatrix4fv(P.u.uModel, false, mFromQT(qMul(qAxis([0,1,0], G.yaw), qAxis([0,0,1], G.roll)), G.p)); gl.drawArrays(gl.TRIANGLES, 0, gliderMesh.count);
  }
  gl.uniform1f(P.u.uHeat, 0);
  // Nacht in der echten Welt (N2): Straßenlaternen in Ortslagen (ab Mittel) und Lichtkegel vor den Autos (Schön). Masten und Köpfe
  // normal, Lichtscheiben am Boden additiv ohne Tiefen-Eintrag. Im Wärmebild keine Scheiben (Licht ist nicht warm).
  if (cfg.night && rw.on && GFX > 0 && ambOn()) {
    const L = rw.show.lamps !== false ? rwLamps() : null;
    if (L && (!lampGl || lampGl.key !== L.key)) { if (lampGl) freeGl(lampGl); lampGl = upload(L.data); lampGl.key = L.key; }
    gl.uniformMatrix4fv(P.u.uModel, false, mIdent());
    if (L) { gl.bindVertexArray(lampGl.vao); gl.drawArrays(gl.TRIANGLES, 0, L.solid); }
    if (VIS !== 1) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -16);
      if (L) gl.drawArrays(gl.TRIANGLES, L.solid, L.count - L.solid);
      if (GFX > 1 && traffic.cars.length) {
        gl.bindVertexArray(beamMesh.vao);
        for (const a of traffic.cars) {
          gl.uniformMatrix4fv(P.u.uModel, false, mFromQT(qMul(qAxis([0,1,0], a.yaw), qAxis([1,0,0], a.pitch)), [a.x, a.y, a.z]));
          gl.drawArrays(gl.TRIANGLES, 0, beamMesh.count);
        }
        gl.uniformMatrix4fv(P.u.uModel, false, mIdent());
      }
      gl.disable(gl.POLYGON_OFFSET_FILL); gl.depthMask(true); gl.disable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
  }
  // Vorschau VBS-Grundtypen (Modus unter Spezial): Modelle nach Seite eingefärbt, zerstörte dunkel und schief
  if (scen.id === 'vbs') {
    for (const it of disPreviewLayout()) {
      let g = baseGl.get(it.id);
      if (!g) { g = upload(disBaseMesh(it.id)); baseGl.set(it.id, g); }
      const c = it.dead ? DIS_SIDE.dead : DIS_SIDE[it.force];
      gl.uniform1f(P.u.uHeat, it.dead ? 0.4 : it.id === 'person' ? 0.8 : 0.6);
      gl.uniform4f(P.u.uOver, c[0], c[1], c[2], it.dead ? 0.75 : 0.45);
      gl.uniformMatrix4fv(P.u.uModel, false, mFromQT(it.dead ? qAxis([0, 0, 1], 0.12) : [0, 0, 0, 1], [it.x, it.dead ? 0.3 : 0, it.z]));
      gl.bindVertexArray(g.vao); gl.drawArrays(gl.TRIANGLES, 0, g.count);
    }
    gl.uniform4f(P.u.uOver, 0, 0, 0, 0); gl.uniformMatrix4fv(P.u.uModel, false, mIdent());
  }
  // Verbund mit VBS (D3): Einheiten aus VBS als Grundtypen, Lage aus Kurs, Nicken, Rollen; zerstörte dunkel und schief
  // Einheiten in Teilen (Prompt 154): Wanne, Turm (dreht um tp nach dem Azimut aus DIS), Rohr (hebt sich um gp). Je Grundtyp
  // einmal hochgeladen. Beschädigt etwas dunkler. Danach Schüsse und Einschläge (vb.fx) und Mündungsfeuer.
  if (rw.on && (vb.units.length || vb.fx.length)) {
    const drawMesh = (g, m) => { if (!g) return; gl.uniformMatrix4fv(P.u.uModel, false, m); gl.bindVertexArray(g.vao); gl.drawArrays(gl.TRIANGLES, 0, g.count); };
    const flashes = [];
    for (const u of vb.units) {
      let g = partGl.get(u.base);
      if (!g) { const p = disBaseParts(u.base); g = { p, hull: p.hull && upload(p.hull), turret: p.turret && upload(p.turret), gun: p.gun && upload(p.gun) }; partGl.set(u.base, g); }
      const c = u.dead ? DIS_SIDE.dead : DIS_SIDE[u.force] || DIS_SIDE[0], pos = [u.x, u.y, u.z];
      let q = qMul(qAxis([0, 1, 0], u.yaw), qMul(qAxis([1, 0, 0], u.pitch), qAxis([0, 0, 1], -u.roll)));
      if (u.dead) q = qMul(q, qAxis([0, 0, 1], 0.12));
      gl.uniform1f(P.u.uHeat, u.dead ? 0.4 : 0.75);
      gl.uniform4f(P.u.uOver, c[0]*(u.damaged ? 0.7 : 1), c[1]*(u.damaged ? 0.7 : 1), c[2]*(u.damaged ? 0.7 : 1), u.dead ? 0.75 : 0.45);
      drawMesh(g.hull, mFromQT(q, pos));
      // Turm: Punkt p -> pos + q*tp + qt*(p - tp); Rohr: pos + q*tp + qt*(gp - tp) + qg*(p - gp)
      const tp = g.p.tp || [0, 0, 0], qt = qMul(q, qAxis([0, 1, 0], -(u.az || 0))), qg = qMul(qt, qAxis([1, 0, 0], u.el || 0));
      const at = vAdd(pos, qRot(q, tp));
      drawMesh(g.turret, mFromQT(qt, vSub(at, qRot(qt, tp))));
      if (g.gun) { const ag = vAdd(at, qRot(qt, vSub(g.p.gp, tp))); drawMesh(g.gun, mFromQT(qg, vSub(ag, qRot(qg, g.p.gp)))); }
      if (vb.now - u.fireT < VB_FX.flash) { const G = vbGun(u); if (G) flashes.push([G.muzzle, 0.6 + 0.4*Math.random()]); }
    }
    // Schüsse: Mündungsfeuer am Abschussort (falls der Schütze nicht bekannt ist), Leuchtspur in Flugrichtung.
    // Einschläge: Feuerball wächst (0,3 s), dann Rauch, der steigt und schrumpft (bis 1,5 s). Größen geschätzt.
    const lines = [];
    for (const f of vb.fx) {
      const age = vb.now - f.t;
      if (f.kind === 'fire') {
        if (age < VB_FX.flash && !vb.units.some(u => u.id === f.from)) flashes.push([[f.x, f.y, f.z], 0.8]);
        const sp = Math.hypot(f.v[0], f.v[1], f.v[2]);
        if (age < VB_FX.tracer && sp > 1) { const d = vScale(f.v, 1/sp), a = vAdd([f.x, f.y, f.z], vScale(f.v, age)); lines.push(a, vSub(a, vScale(d, Math.min(25, sp*age + 0.5)))); }
      } else if (age < VB_FX.blast) {
        const k = age/VB_FX.blast, fire = age < 0.3;
        flashes.push([[f.x, f.y + (fire ? 0.5 : 1 + 4*k), f.z], fire ? 0.8 + 6*age : 2.6*(1 - k) + 0.4, fire ? [1, 0.6, 0.2] : [0.35, 0.35, 0.35]]);
      }
    }
    if (flashes.length) {
      if (!flashMesh) { const m = new MeshBuilder(); m.blob([0, 0, 0], [1, 1, 1], [1, 1, 1]); flashMesh = upload(new Float32Array(m.d)); }
      gl.uniform1f(P.u.uHeat, 1);
      for (const [p, r, col] of flashes) {
        const c = col || [1, 0.85, 0.4], m = mFromQT([0, 0, 0, 1], p);
        for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) m[i] *= r;
        gl.uniform4f(P.u.uOver, c[0], c[1], c[2], 1); drawMesh(flashMesh, m);
      }
    }
    if (lines.length) {
      if (!tracerGl) { tracerGl = { vao: gl.createVertexArray(), buf: gl.createBuffer() }; gl.bindVertexArray(tracerGl.vao); gl.bindBuffer(gl.ARRAY_BUFFER, tracerGl.buf);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24); }
      const d = new Float32Array(lines.length*10);
      lines.forEach((p, i) => d.set([p[0], p[1], p[2], 0, 1, 0, 1, 0.8, 0.35, 1], i*10));
      gl.bindVertexArray(tracerGl.vao); gl.bindBuffer(gl.ARRAY_BUFFER, tracerGl.buf); gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
      gl.uniformMatrix4fv(P.u.uModel, false, mIdent()); gl.uniform1f(P.u.uHeat, 1); gl.uniform4f(P.u.uOver, 1, 0.8, 0.35, 1);
      gl.drawArrays(gl.LINES, 0, lines.length);
    }
    gl.uniform1f(P.u.uHeat, 0); gl.uniform4f(P.u.uOver, 0, 0, 0, 0); gl.uniformMatrix4fv(P.u.uModel, false, mIdent());
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
  if (cfg.cam !== 'fpv') drawProps(md, dt);
  else if (cfg.propsView) drawPropsFpv(md, dt, vf, asp, eye, lastCamQ);
  drawFlare(vp, eye, asp, GFX, VIS, dt);
  meshInfo();
  gl.bindVertexArray(null);
}
// Luftbild der echten Welt (DOP, 4096² für 1 km = 0,25 m je Pixel) als Textur mit Mipmaps; zu groß fürs Gerät: verkleinert.
// Kommt als JPEG-Bytes (eingebettet oder live geladen); Entpacken läuft im Hintergrund, bis dahin der gerechnete Boden.
// Obergrenze der Luftbilder im Grafikspeicher (Prüfbericht Nr. 3). Ein Bild 4096² mit Mipmaps belegt 85 MB, 2048² 21 MB,
// 1024² 5,6 MB. Auf Handys und Geräten mit wenig Speicher (Browser meldet höchstens 4 GB) Startgebiet 2048², Umgebung und
// Kacheln 1024². Schätzung danach: etwa 70 statt 280 MB. Sonst wie geliefert (Startgebiet 4096², Kacheln 2048²).
const LOW_MEM = COARSE || (navigator.deviceMemory > 0 && navigator.deviceMemory <= 4);
export const RW_TEX = { main: LOW_MEM ? 2048 : 4096, other: LOW_MEM ? 1024 : 2048 };
function loadPhoto(bytes, ver, set = t => { photoTex = t; }, cap = RW_TEX.other) {
  createImageBitmap(new Blob([bytes], { type: 'image/jpeg' })).then(async img => {
    const max = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), cap);
    if (img.width > max) { const big = img; img = await createImageBitmap(big, { resizeWidth: max, resizeHeight: max, resizeQuality: 'high' }); big.close(); }
    if (ver !== rwGlVer || glLost.on) { img.close(); return; }   // inzwischen ein anderes Gebiet oder Grafik weg
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    img.close();   // Kopie liegt jetzt in der Grafik; das Bild im Hauptspeicher freigeben
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const an = gl.getExtension('EXT_texture_filter_anisotropic');
    if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    set(t);
  }).catch(() => {});
}
const freeGl = m => { if (m) { gl.deleteVertexArray(m.vao); if (m.buf) gl.deleteBuffer(m.buf); if (m.ib) gl.deleteBuffer(m.ib); } };
// Echte Welt: Höhenmodell mit Luftbild, Gewässer, Gebäude (LoD2, Fassaden) und Bäume, Kartenebenen. Schreibt Tiefe.
// Neues Gebiet (rw.ver): alle Netze und das Luftbild frei geben und neu bauen.
// Sichtprobe 3D-Mesh (M0): nur mit ?mesh=1, echte Welt, nicht DIS, Gebiet in UTM 32 (NRW). meshShow: es ist etwas zu sehen; dann
// Gelände abgesenkt und Häuser, eigene Bäume, Wasser, Kartenlinien aus (das Mesh zeigt sie). Physik unverändert (LoD2, DGM).
export const MESH_PROBE = typeof location !== 'undefined' && /[?&]mesh=1(&|$)/.test(location.search);
// Foto 3D (G1): Preset cfg.gfx 'mesh' oder Diagnose ?mesh=1. NRW: Mitte oder eine Ecke des Gebiets in NRW (UTM 32), je Gebiet gemerkt.
// Ohne Mesh am Ort sieht Foto 3D aus wie Schön; ein Hinweis einmal je Ort.
let nrwKey = -1, nrwIn = false, meshSaid = '';
function inNrw() {
  if (nrwKey === rw.ver) return nrwIn;
  nrwKey = rw.ver; const m = rw.meta, b = m && m.bbox;
  nrwIn = !!b && m.crs === 'EPSG:25832' && [[(b[0] + b[2])/2, (b[1] + b[3])/2], [b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].some(([E, N]) => deLandAt(E, N) === 'Nordrhein-Westfalen');
  return nrwIn;
}
const meshWhy = () => i3sWanted(cfg.gfx, MESH_PROBE, rw.on && !!rw.meta, cfg.verbund, rw.on && inNrw());
const meshOn = () => meshWhy() === 'on';
function meshHint() {
  if (cfg.gfx !== 'mesh' || !rw.on) return;
  const why = meshWhy(), key = rw.ver + ':' + why;
  const txt = why === 'land' ? 'Foto 3D: hier kein 3D-Mesh (nur NRW). Grafik wie Schön.' : why === 'dis' ? 'Foto 3D: nicht in der DIS-Übung. Grafik wie Schön.'
    : why === 'on' && i3s.err && !meshShow && !i3s.jobs && i3s.loaded === 0 ? 'Foto 3D: 3D-Mesh nicht erreichbar. Grafik wie Schön.' : '';
  if (txt && meshSaid !== key) { meshSaid = key; say(txt, 3); }
}
let meshShow = false, meshVer = -1, meshEvictT = 0;
const meshNet = rwNet(null, 15000);
function meshPage(p) {
  i3s.pages.set(p, 'load'); i3s.jobs++;
  meshNet.text(i3sPageUrl(p)).then(t => { i3sAddPage(p, JSON.parse(t)); if (p === 0) { const r = i3s.nodes.get(0); i3s.root = r; i3s.l1 = r ? r.ch : []; if (r) i3sAddL1(r.ch); } })   // Stufe 1 eingebettet: keine 108 Seiten
    .catch(e => { i3s.pages.set(p, 'fail'); i3s.err = String(e && e.message || e); setTimeout(() => i3s.pages.delete(p), 30000); })
    .finally(() => { i3s.jobs--; });
}
function meshNode(n) {
  n.st = 'load'; i3s.jobs++;
  Promise.all([meshNet.get(i3sGeoUrl(n.res)), meshNet.get(i3sTexUrl(n.tex))]).then(async ([g, t]) => {
    if (g[0] === 0x1f && g[1] === 0x8b) g = new Uint8Array(await new Response(new Blob([g]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());   // ohne Content-Encoding
    const G = i3sGeometry(g); let img = await createImageBitmap(new Blob([t], { type: 'image/jpeg' }));
    if (I3S.texMax && img.width > I3S.texMax) { const big = img, k = I3S.texMax/big.width; img = await createImageBitmap(big, { resizeWidth: I3S.texMax, resizeHeight: Math.max(1, Math.round(big.height*k)), resizeQuality: 'high' }); big.close(); }   // Handy: kleinere Texturen
    if (glLost.on) { img.close(); n.st = 'idle'; return; }
    const vao = gl.createVertexArray(), buf = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(G.pos.buffer, G.pos.byteOffset, G.vc*5), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 8, G.vc*12);
    gl.bindVertexArray(null);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); img.close();
    gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const an = gl.getExtension('EXT_texture_filter_anisotropic');
    if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    if (n.r <= I3S_PHYS.physR) n.phys = i3sPhysBuild(G.pos, G.vc);   // Kollision aus dem Mesh (M2): nur feine Teile
    n.texel = img.width*img.height || n.texel; n.gl = { vao, buf, tex }; n.vc = G.vc; n.st = 'ready'; i3s.gpu += i3sBytes(n)/1e6; n.t = performance.now()/1000; i3s.loaded++; i3s.mb += (g.byteLength + t.byteLength)/1e6;
  }).catch(e => { n.st = 'fail'; n.fail = performance.now()/1000; i3s.err = String(e && e.message || e); }).finally(() => { i3s.jobs--; });
}
const meshFree = n => { n.phys = null; if (n.gl) {   // Speicher zählt i3sEvict neu
   gl.deleteVertexArray(n.gl.vao); gl.deleteBuffer(n.gl.buf); gl.deleteTexture(n.gl.tex); n.gl = null; } };
// Je Bild: Auswahl, Abrufe anstoßen (höchstens I3S.para gleichzeitig), alte Knoten freigeben
const meshTrisBuf = [];
function meshStep(vp, eye, f) {
  meshHint();
  if (!meshOn()) { meshShow = false; rw.meshPhys = null; return null; }
  if (glLost.on) return null;
  if (meshVer !== rwGlVer) { for (const n of i3s.nodes.values()) if (n.gl) { n.gl = null; n.st = 'idle'; } meshVer = rwGlVer; }   // Grafik neu (Verlust): neu laden
  if (!i3s.pages.has(0)) { if (LOW_MEM) Object.assign(I3S, I3S_LOW); meshPage(0); }
  const m = rw.meta, o = { ec: (m.bbox[0] + m.bbox[2])/2, nc: (m.bbox[1] + m.bbox[3])/2, h: m.hHome }, now = performance.now()/1000;
  const S = i3sSelect(eye, f, i3sPlanes(vp), o, (LOW_MEM ? 2.5 : I3S.q)*i3s.qa);
  i3sAdapt(S.draw);
  for (const p of S.pages) { if (i3s.jobs >= I3S.para) break; if (!i3s.pages.has(p)) meshPage(p); }
  for (const [n] of S.want) { if (i3s.jobs >= I3S.para || !i3sRoom()) break; if (n.st === 'idle' || (n.st === 'fail' && now - n.fail > 30)) meshNode(n); }
  for (const n of S.draw) n.t = now;
  i3s.drawn = S.draw;
  if (now - meshEvictT > 1) { meshEvictT = now; for (const n of i3sEvict(now, new Set(S.draw))) meshFree(n); }
  meshShow = S.draw.length > 0;
  // Physik (M2): feine Teile um die Drohne; Boden aus dem Raster, Wände aus den steilen Dreiecken. Ohne feine Teile wie bisher.
  const sp = game.sim.p, PL = meshShow ? i3sPhysList(sp[0], sp[2], o) : [];
  rw.meshPhys = PL.length ? { ground: (x, z) => i3sGroundAt(PL, x, z, o), covered: (x, z) => i3sGroundAt(PL, x, z, o) === i3sGroundAt(PL, x, z, o),
    near: (x, z, R) => { const T = i3sTrisNear(PL, x, z, R, o, meshTrisBuf); return { T, tris: Array.from({ length: T.length/9 }, (_, i) => i) }; } } : null;
  return o;
}
function drawMesh(vp, eye, o, GFX, VIS, fog) {
  gl.useProgram(PM.p);
  gl.uniformMatrix4fv(PM.u.uVP, false, vp); gl.uniform3fv(PM.u.uCam, eye); gl.uniform3fv(PM.u.uFog, fog);
  gl.uniform1f(PM.u.uFogD, rw.far ? 1/2200 : 1/700); gl.uniform3fv(PM.u.uSun, dayState(cfg.night, sunDir()).light); gl.uniform1f(PM.u.uNight, cfg.night ? 1 : 0);
  gl.uniform1f(PM.u.uGfx, GFX); gl.uniform1f(PM.u.uVision, VIS); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(PM.u.uTex, 0);
  for (const n of i3s.drawn) {
    gl.uniform3f(PM.u.uOff, n.c[0] - o.ec, n.c[2] - o.h, -(n.c[1] - o.nc));
    gl.bindTexture(gl.TEXTURE_2D, n.gl.tex); gl.bindVertexArray(n.gl.vao); gl.drawArrays(gl.TRIANGLES, 0, n.vc);
  }
  gl.useProgram(P.p);
}
// Anzeige der Sichtprobe: Knoten, Speicher, geladene Daten, Bilder je Sekunde (gemessen über 1 s)
let meshHud = null, fpsN = 0, fpsT = 0, fps = 0;
function meshInfo() {
  if (!MESH_PROBE) return;
  const now = performance.now(); fpsN++;
  if (now - fpsT < 1000) return;
  fps = fpsN*1000/(now - fpsT); fpsN = 0; fpsT = now;
  if (!meshHud) { meshHud = document.createElement('div'); meshHud.style.cssText = 'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:5;font:12px/1.3 monospace;color:#fff;background:rgba(0,0,0,.45);padding:3px 8px;border-radius:6px;pointer-events:none;white-space:nowrap'; document.body.appendChild(meshHud); }
  meshHud.textContent = 'MESH-PROBE ' + (meshOn() ? i3s.drawn.length + ' Teile, ' + Math.round(i3s.gpu) + ' MB Grafik, ' + i3s.mb.toFixed(0) + ' MB geladen' + (i3s.jobs ? ', lädt ' + i3s.jobs : '') + (i3s.err && !meshShow ? ', Fehler: ' + i3s.err.slice(0, 40) : '') : 'aus (nur echte Welt, NRW)') + ' · ' + Math.round(fps) + ' Bilder/s';
}
function drawTerrain(meshDraw = null) {   // meshDraw: Sichtprobe 3D-Mesh zeichnet statt Wasser, Häusern, Bäumen, Kartenlinien
  if (rwGlVer !== rw.ver) {
    [terrain, farGl, rwModelGl, waterGl, featGl].forEach(freeGl);
    for (const t of [photoTex, farTex]) if (t) gl.deleteTexture(t);
    terrain = farGl = rwModelGl = waterGl = featGl = photoTex = farTex = null;
    rwGlVer = rw.ver; tileGlVer = -1;
    if (rw.dop) loadPhoto(rw.dop, rw.ver, undefined, RW_TEX.main);
    if (rw.farDop) loadPhoto(rw.farDop, rw.ver, t => { farTex = t; });
    if (farNext) { freeGl(farNext.gl); if (farNext.tex) gl.deleteTexture(farNext.tex); farNext = null; }
    if (rw.far) Object.assign(farAt, { cx: rw.far.cx, cz: rw.far.cz, size: rw.far.size, ver: rw.farVer });
  }
  const indexed = ({ v, idx }) => { const m = upload(v), ib = gl.createBuffer();
    gl.bindVertexArray(m.vao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null); return { vao: m.vao, buf: m.buf, ib, n: idx.length }; };
  // Kacheln (L5b) geändert: Netz der Umgebung (Löcher) und des Startgebiets (Ränder) neu bauen, Kacheln ohne Bestand frei geben.
  // Gegen Ruckler höchstens ein großer Aufbau je Bild (je 130 bis 260 ms gemessen): Kachel-Gelände, dann Gebäude, dann
  // Umgebung, dann Startgebiet. Eine neue Kachel erscheint erst, wenn die Umgebung ihr Loch hat.
  if (tileGlVer !== rw.tileVer) {
    tileGlVer = rw.tileVer;
    if (farGl) { farDirty = true; mainDirty = true; }
    for (const [T, g] of tileGl) if (rw.tiles.get(T.i + ',' + T.j) !== T) { [g.terrain, g.model, g.water].forEach(freeGl); if (g.tex) gl.deleteTexture(g.tex); tileGl.delete(T); }
  }
  let budget = 1;
  for (const T of rw.tiles.values()) {
    const g = tileGl.get(T);
    if (!budget) break;
    if (!g) {
      const n = { terrain: indexed(rwMesh(2, rw.size/2, T)), model: null, water: null, tex: null, born: ++tileGen };
      tileGl.set(T, n); budget--;
      if (T.dop) loadPhoto(T.dop, rw.ver, t => { if (tileGl.get(T) === n) n.tex = t; else gl.deleteTexture(t); });
    } else if (!g.model) {
      // Netz der Gebäude und Bäume (Innenstadt bis 160 ms): im Hintergrund-Thread, wenn es ihn gibt; hier nur hochladen
      if (!g.job) g.job = rw.work ? rw.work('modelMesh', { S: rwMeshInput(T) }).catch(() => rwModelMesh(T)).then(v => { g.data = v; }) : (g.data = rwModelMesh(T), true);
      if (g.data) { g.model = upload(g.data); g.data = null; g.water = T.water ? upload(rwWaterMesh(T)) : null; budget--; }
    }
  }
  // Umgebung ist mitgewandert: Luftbild laden und Netz bauen (ein Aufbau je Bild), dann beides zusammen tauschen. Bis dahin
  // bleibt die alte gezeichnet; nahe der Drohne decken sich beide (gleiche Messpunkte, gleiche Daten).
  if (rw.far && farAt.ver !== rw.farVer && (!farNext || farNext.ver !== rw.farVer)) {
    if (farNext) { freeGl(farNext.gl); if (farNext.tex) gl.deleteTexture(farNext.tex); }
    const n = farNext = { ver: rw.farVer, cx: rw.far.cx, cz: rw.far.cz, size: rw.far.size, gl: null, tex: null, img: !rw.farDop, tiles: -1 };
    if (rw.farDop) loadPhoto(rw.farDop, rw.ver, t => { if (farNext === n) { n.tex = t; n.img = true; } else gl.deleteTexture(t); });
  }
  if (farNext && !farNext.gl && budget) { farNext.gl = indexed(rwFarMesh()); farNext.tiles = rw.tileVer; budget--; }
  if (farNext && farNext.gl && farNext.img) {
    freeGl(farGl); if (farTex) gl.deleteTexture(farTex);
    farGl = farNext.gl; farTex = farNext.tex; Object.assign(farAt, { cx: farNext.cx, cz: farNext.cz, size: farNext.size, ver: farNext.ver });
    farGen = tileGen; farDirty = farNext.tiles !== rw.tileVer; farNext = null;   // Kacheln kamen inzwischen dazu: Löcher neu
  }
  if (farDirty && !farNext && budget && [...tileGl.values()].every(g => g.model)) { freeGl(farGl); farGl = indexed(rwFarMesh()); farGen = tileGen; farDirty = false; budget--; }
  if (mainDirty && !farDirty && budget) { freeGl(terrain); terrain = null; mainDirty = false; }
  const open = (I, J) => [[I - 1, J], [I + 1, J], [I, J - 1], [I, J + 1]].map(([a, b]) => (a === 0 && b === 0) || rw.tiles.has(a + ',' + b) ? 0 : 1);
  // Gebiet fein (mit Umgebung bis genau an den Rand, sonst mit Rand bis 1,5 km); Umgebung grob mit Loch für das Gebiet
  if (!terrain) terrain = indexed(rwMesh(2, rw.far ? rw.size/2 : 1500));
  gl.uniform4fv(P.u.uEdgeOpen, open(0, 0));
  if (!farGl && rw.far) { farGl = indexed(rwFarMesh()); farGen = tileGen; farDirty = false; }
  gl.uniform1f(P.u.uSize, rw.size); gl.uniform2f(P.u.uOrigin, -rw.size/2, -rw.size/2);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, photoTex || groundTex);
  gl.uniform1f(P.u.uPhoto, photoTex || farTex ? 1 : 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, farTex || groundTex); gl.uniform1i(P.u.uFar, 1);
  gl.uniform1f(P.u.uFarOn, farTex ? 1 : 0);
  if (rw.far) { gl.uniform1f(P.u.uFarSize, farAt.size); gl.uniform2f(P.u.uFarOrigin, farAt.cx - farAt.size/2, farAt.cz - farAt.size/2); }   // Luftbild der gezeichneten Umgebung
  gl.activeTexture(gl.TEXTURE0);
  gl.bindVertexArray(terrain.vao);
  gl.drawElements(gl.TRIANGLES, terrain.n, gl.UNSIGNED_INT, 0);
  if (farGl) { gl.bindVertexArray(farGl.vao); gl.drawElements(gl.TRIANGLES, farGl.n, gl.UNSIGNED_INT, 0); }
  // Gewässer (Basis-DLM): Fläche über dem Flussbett; der Shader tönt das Luftbild darunter und spiegelt den Horizont.
  // Mit Blending, damit der Rand (Alpha aus dem Wasseranteil je Ecke) weich ins Ufer läuft; nach vorn gezogen (16 Einheiten;
  // 4 reichten aus der Höhe nicht, dazu liegt das gezeichnete Bett tiefer, WATER_DIP), damit der Spiegel in der Ferne nicht mit
  // dem Flussbett flackert. Das Luftbild der Kachel muss dabei gebunden sein.
  const drawWater = m => { if (!m || !m.count) return;
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -16);
    gl.bindVertexArray(m.vao); gl.drawArrays(gl.TRIANGLES, 0, m.count);
    gl.disable(gl.POLYGON_OFFSET_FILL); gl.disable(gl.BLEND); };
  if (!waterGl && rw.water) waterGl = upload(rwWaterMesh());
  if (!meshDraw) drawWater(waterGl);
  // Gebäude und Bäume, ein Netz
  if (!rwModelGl && rw.main) rwModelGl = upload(rwModelMesh());
  if (rwModelGl && !meshDraw) { gl.bindVertexArray(rwModelGl.vao); gl.drawArrays(gl.TRIANGLES, 0, rwModelGl.count); }
  // Nachgeladene Kacheln: je Kachel Gelände, Wasser, Gebäude und Bäume mit eigenem Luftbild
  for (const T of rw.tiles.values()) {
    const g = tileGl.get(T);
    if (!g || !g.model || g.born > farGen) continue;   // noch im Aufbau
    gl.uniform2f(P.u.uOrigin, T.dx - rw.size/2, T.dz - rw.size/2); gl.uniform4fv(P.u.uEdgeOpen, open(T.i, T.j));
    gl.bindTexture(gl.TEXTURE_2D, g.tex || groundTex);
    gl.bindVertexArray(g.terrain.vao); gl.drawElements(gl.TRIANGLES, g.terrain.n, gl.UNSIGNED_INT, 0);
    if (meshDraw) continue;
    drawWater(g.water);
    gl.bindVertexArray(g.model.vao); gl.drawArrays(gl.TRIANGLES, 0, g.model.count);
  }
  if (meshDraw) meshDraw();
  gl.uniform2f(P.u.uOrigin, -rw.size/2, -rw.size/2); gl.uniform4fv(P.u.uEdgeOpen, open(0, 0)); gl.bindTexture(gl.TEXTURE_2D, photoTex || groundTex);
  // Kartenebenen (nur Anzeige): Bänder für Bäche, Straßen, Brücken, Waldränder; leicht nach vorn gezogen
  if (rw.features && osdOn(cfg.osd, 'mapLayers') && !meshDraw) {
    if (!featGl) featGl = upload(rwFeatureMesh());
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -400);
    gl.bindVertexArray(featGl.vao); gl.drawArrays(gl.TRIANGLES, 0, featGl.count);
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }
}
// Lens-Flare: nur ab „Mittel“, im normalen Bild, wenn die Sonne im Bild steht und kein Hindernis davor ist.
// Je näher die Sonne an der Bildmitte, desto stärker. Weiches Ein- und Ausblenden (0,15 s), damit es nicht flackert.
function drawFlare(vp, eye, asp, GFX, VIS, dt) {
  const S = sunDir(), c = [0, 1, 2, 3].map(i => vp[i]*S[0] + vp[4 + i]*S[1] + vp[8 + i]*S[2]);   // Richtung (w = 0): Sonne unendlich weit
  let want = 0;
  if (GFX > 0 && VIS === 0 && c[3] > 0 && !cfg.night) {   // nachts kein Lens-Flare
    const x = c[0]/c[3], y = c[1]/c[3], r = Math.hypot(x*asp, y);
    if (Math.abs(x) < 1.1 && Math.abs(y) < 1.1 && (rw.on || (!rayBlocked(eye, S, 400, colliders) && !rayBlocked(eye, S, 400, town))))
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


// Propeller (R3, 06.11.2026): drei Blätter je Motor statt eines flachen Balkens. Blatt von der Nabe bis zur Spitze
// verjüngt, mit runder Spitze, Anstellwinkel 24° an der Wurzel bis 10° an der Spitze (verdrillt). Maße sind Schätzungen
// für einen 5-Zoll-Dreiblatt-Propeller, Maßstab PROP_S wie das Drohnenmodell. Radius 0,063·PROP_S bleibt (Hitbox PHYS.m.R).
// Nur eine Fläche je Blatt (keine Dicke): ohne Rückseiten-Ausblendung wird sie von beiden Seiten gezeichnet; die Normale
// zeigt nach oben, damit das Blatt auch von unten (Kamerabild) hell bleibt. Nabe als kleiner Zylinder mit Kappe.
const ROTOR_R0 = 0.009, ROTOR_R = 0.063;   // Nabenradius und Spitzenradius (× PROP_S)
const ROTOR_RED = [0.78, 0.12, 0.09], ROTOR_DARK = [0.24, 0.24, 0.26];   // Blattfarben vorne und hinten (matter Kunststoff)
// Halbe Blattbreite in Modelleinheiten an der Stelle t (0 Wurzel, 1 Spitze): breit um die Mitte, runde Spitze
function rotorHalfChord(t) {
  const round = t < 0.85 ? 1 : Math.sqrt(Math.max(0, 1 - ((t - 0.85)/0.15)**2));
  return (0.0045 + 0.004*Math.sin(Math.PI*t))*round*PROP_S;
}
function buildRotorMesh(col) {
  const mb = new MeshBuilder(), s = PROP_S, N = 8, up = [0, 1, 0];
  for (let b = 0; b < 3; b++) {
    const a = b/3*Math.PI*2, cs = Math.cos(a), sn = Math.sin(a);
    // Punkt am Radius r, Querversatz u entlang der Sehne, Anstellwinkel th: um die Blattachse gekippt, dann um die Nabe gedreht
    const P = (r, u, th) => { const x = r, y = u*Math.sin(th), z = u*Math.cos(th); return [x*cs - z*sn, y, x*sn + z*cs]; };
    for (let i = 0; i < N; i++) {
      const t0 = i/N, t1 = (i + 1)/N;
      const r0 = (ROTOR_R0 + (ROTOR_R - ROTOR_R0)*t0)*s, r1 = (ROTOR_R0 + (ROTOR_R - ROTOR_R0)*t1)*s;
      const h0 = rotorHalfChord(t0), h1 = rotorHalfChord(t1), th0 = (24 - 14*t0)*DEG, th1 = (24 - 14*t1)*DEG;
      const p00 = P(r0, -h0, th0), p01 = P(r0, h0, th0), p10 = P(r1, -h1, th1), p11 = P(r1, h1, th1);
      const blade = vScale(col, 0.7 + 0.3*t1);   // zur Wurzel hin dunkler: wirkt wie Schatten der Nabe, kein flacher Fleck
      mb.triOut(p00, p10, p11, up, blade); mb.triOut(p00, p11, p01, up, blade);
    }
  }
  mb.cyl([0, 0.003*s, 0], 0.0075*s, 0.004*s, 8, [0.22, 0.22, 0.24]);   // Nabe
  mb.cyl([0, 0.0085*s, 0], 0.0045*s, 0.0015*s, 8, [0.6, 0.6, 0.64]);   // Mutter
  return new Float32Array(mb.d);
}
// Unschärfescheibe eines drehenden Propellers: Ringe von der Nabe bis zur Spitze, jeder Ring mit eigener Deckkraft.
// Deckkraft = Anteil der Zeit, in dem ein Punkt vom Blatt bedeckt ist: drei Blätter × Blattbreite / Kreisumfang.
// Innen dicht (gut 40 %), zur Spitze dünn (wenige %); dazu ein schmaler Saum an der Spitze, wie ihn Kameras zeigen.
// Ein Puffer, je Ring ein Zeichenaufruf (uAlpha), weil der Shader eine feste Deckkraft je Aufruf hat.
function buildRotorBlur(col) {
  const mb = new MeshBuilder(), s = PROP_S, n = 32, bands = [];
  const edges = [];   // 20 Ringe von 0,12 R bis 0,96 R, dazu der Saum: Stufen der Deckkraft unter 2 %, im Bild nicht sichtbar
  for (let i = 0; i <= 20; i++) edges.push(0.12 + 0.84*i/20);
  edges.push(1.0);
  const haze = col.map(c => c*0.75 + 0.25);   // Schleier etwas heller als das Blatt (Glanzlichter verwischen mit)
  for (let b = 0; b + 1 < edges.length; b++) {
    const ri = Math.max(edges[b]*ROTOR_R, ROTOR_R0)*s, ro = edges[b + 1]*ROTOR_R*s, rm = (ri + ro)/2;
    const t = clamp((rm/s - ROTOR_R0)/(ROTOR_R - ROTOR_R0), 0, 1);
    let a = 3*2*rotorHalfChord(t)/(2*Math.PI*rm);                         // Bedeckungsanteil
    if (b + 2 === edges.length) a = Math.max(a, 0.14);                       // Saum an der Spitze
    const first = mb.count;
    for (let i = 0; i < n; i++) {
      const a0 = i/n*Math.PI*2, a1 = (i + 1)/n*Math.PI*2;
      const Q = (ang, r) => [Math.cos(ang)*r, 0, Math.sin(ang)*r];
      mb.quad(Q(a0, ri), Q(a0, ro), Q(a1, ro), Q(a1, ri), haze);
    }
    bands.push({ first, count: mb.count - first, a: clamp(a, 0, 0.6) });
  }
  const m = upload(new Float32Array(mb.d));
  return { vao: m.vao, buf: m.buf, bands };
}

const propAng = [0, 0.8, 1.6, 2.4];
// Propeller im Kamerabild (Wunsch Nutzer, 06.11.2026): am Bildrand wie bei einer echten FPV-Kamera, nicht frei schwebend.
// Dieselbe Kamera wie das Hauptbild (Auge, Lage, Uptilt), aber ein eigener Durchgang: die nahe Bildebene liegt bei
// 3 mm je Größe 1 statt 2 cm (echte Welt 6 cm). So schneidet keine gerade Linie mehr mitten im Bild durch die Scheiben;
// die vorderen Propeller ragen nur noch aus den oberen Ecken und Rändern ins Bild. Geprüft: Punkte in 3 mm Abstand
// liegen bei jedem Blickfeld bis 150° außerhalb des Bildes (Scheibe beginnt 3 cm neben der Kamera). Tiefe vorher löschen,
// weil die Tiefenwerte des Hauptbilds zu einer anderen Projektion gehören; die Propeller liegen ohnehin direkt vor der Kamera.
function drawPropsFpv(md, dt, vf, asp, eye, qc) {
  const sz = PHYS.size;
  gl.uniformMatrix4fv(P.u.uVP, false, mMul(mPersp(vf, asp, 0.003*sz, 2*sz), mView(qc, eye)));
  gl.clear(gl.DEPTH_BUFFER_BIT);
  drawProps(md, dt, true);
  gl.uniformMatrix4fv(P.u.uVP, false, lastVP);
}
// Propeller je Motor: Unschärfescheibe (Ringe, Deckkraft mit dem Gas), darüber die drei Blätter, die mit dem Gas blasser werden.
// Sichtbare Drehung gedrosselt (9 + Gas·38 rad/s), sonst flimmern die Blätter; die Scheibe trägt den Eindruck der Drehung.
// Vorne rot, hinten dunkelgrau (Farbe im Netz). Im Kamerabild nur die vorderen (die hinteren liegen hinter der Kamera).
function drawProps(md, dt, frontOnly = false) {
  const sim = game.sim;
  const S = PROP_S, spin = game.state === 'fly' && !game.paused && game.armed;
  const w = spin ? 9 + sim.thr*38 : 0;                 // sichtbare Drehung, gedrosselt gegen Flimmern
  const blur = spin ? clamp(0.3 + sim.thr*1.4, 0, 1) : 0;
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform1f(P.u.uHeat, 0.3);   // Kunststoff, leicht warm vom Motor: im Wärmebild grau, nicht weiß
  gl.uniform4f(P.u.uOver, 0, 0, 0, 0);   // keine Tönung: Farbe steckt im Netz
  for (let i = 0; i < 4; i++) {
    const [mx, mz, dir] = MOTORS[i];
    propAng[i] += dir*w*dt;
    const hp = sim.hp[i];
    if (hp <= 0 || (frontOnly && mz > 0)) continue;   // Propeller abgebrochen; im Kamerabild nur die vorderen
    const mp = mMul(md, mFromQT(qAxis([0,1,0], propAng[i]), [mx*0.088*S, 0.026*S, mz*0.088*S]));
    if (hp < 0.5) for (const k of [0, 1, 2, 8, 9, 10]) mp[k] *= 0.55;   // stark beschädigt: kurze Blätter, kleine Scheibe
    gl.uniformMatrix4fv(P.u.uModel, false, mp);
    const side = mz < 0 ? 'front' : 'rear', rotor = rotorMesh[side], rb = rotorBlur[side];
    if (blur > 0) {   // Unschärfescheibe zuerst (ohne Tiefe), die blassen Blätter darüber
      gl.depthMask(false);
      gl.bindVertexArray(rb.vao);
      for (const b of rb.bands) { gl.uniform1f(P.u.uAlpha, blur*b.a); gl.drawArrays(gl.TRIANGLES, b.first, b.count); }
      gl.depthMask(true);
    }
    gl.uniform1f(P.u.uAlpha, 1 - blur*0.8);
    gl.bindVertexArray(rotor.vao); gl.drawArrays(gl.TRIANGLES, 0, rotor.count);
  }
  gl.disable(gl.BLEND); gl.uniform1f(P.u.uAlpha, 1); gl.uniform1f(P.u.uHeat, 0);
}
