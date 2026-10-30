/* Rendern mit WebGL2: Himmel, Welt, Tore, Drohne, Propeller, Kameras. */
import { DEG, clamp, vAdd, vSub, vScale, vNorm, qMul, qAxis, qRot, mPersp, mMul, mIdent, mFromQT, mView, mLookAt, mInv } from './math.js';
import { cfg, game, saveCfg, say } from './state.js';
import { gates, buildWorld, buildDrone, buildBlade, buildDisc, PROP_S } from './world.js';
import { scen, buildScenario, scenHighlight } from './scenario.js';
import { targets } from './targets.js';

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
}`;
const FS = `#version 300 es
precision highp float;
in vec3 vNor; in vec4 vCol; in vec3 vW;
uniform vec3 uSun, uCam, uFog;
uniform vec4 uOver;
uniform float uFogD, uAlpha, uFancy;
out vec4 o;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}
void main(){
  vec3 n = normalize(vNor);
  vec3 c = vCol.rgb;
  if (vCol.a < 0.5) {
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
  if (uFancy < 0.5) {
    c = mix(c, uOver.rgb, uOver.a);
    float dif = max(dot(n, uSun), 0.0);
    vec3 amb = mix(vec3(0.30,0.29,0.26), vec3(0.52,0.60,0.70), 0.5 + 0.5*n.y);
    vec3 col = c * (amb + dif*vec3(1.0,0.96,0.88)*0.72) + uOver.rgb*uOver.a*0.35;
    float d = length(vW - uCam);
    float f = 1.0 - exp(-pow(d*uFogD, 1.6));
    o = vec4(mix(col, uFog, clamp(f, 0.0, 1.0)), uAlpha);
    return;
  }
  // Schön: lineares Licht, warme Sonne, kühler Himmel, Abdunklung am Boden, Dunst, Tone-Mapping, sRGB
  vec3 base = pow(mix(c, uOver.rgb, uOver.a), vec3(2.2));
  float dif = max(dot(n, uSun), 0.0);
  vec3 sky = vec3(0.20, 0.27, 0.40), bounce = vec3(0.10, 0.09, 0.06);
  vec3 amb = mix(bounce, sky, 0.5 + 0.5*n.y);
  float ao = 1.0;
  if (vCol.a >= 0.5) ao = mix(0.45, 1.0, smoothstep(0.0, 1.5, vW.y)) * (n.y < -0.5 ? 0.6 : 1.0);
  vec3 col = base*(amb*ao + dif*vec3(1.0, 0.88, 0.70)*1.5) + pow(uOver.rgb, vec3(2.2))*uOver.a*0.5;
  float d = length(vW - uCam);
  float f = 1.0 - exp(-pow(d*uFogD, 1.6));
  float hz = exp(-max(vW.y, 0.0)/18.0)*(1.0 - exp(-d/350.0))*0.18;   // Dunst nah am Boden
  col = mix(col, pow(uFog, vec3(2.2))*0.85, clamp(f + hz, 0.0, 1.0));
  col = (col*(2.51*col + 0.03))/(col*(2.43*col + 0.59) + 0.14);   // ACES-Näherung
  o = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0/2.2)), uAlpha);
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
out vec4 o;
void main(){
  vec4 w = uInv * vec4(vP, 1.0, 1.0);
  vec3 d = normalize(w.xyz/w.w - uCam);
  float t = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(uFog, uZen, pow(t, 0.55));
  float s = max(dot(d, uSun), 0.0);
  c += vec3(1.0,0.92,0.75) * (pow(s, 900.0)*1.6 + pow(s, 14.0)*0.12);
  o = vec4(c, 1.0);
}`;

let bladeMesh = null, discMesh = null;
let P = null, PS = null, worldMesh = null, droneMesh = null, skyVao = null, staticCount = 0;
let scenMesh = null, scenParts = [], scenVer = -1;
const SUN = vNorm([0.45, 0.8, 0.3]);
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
export function initGL() {
  P = program(VS, FS, ['uVP', 'uModel', 'uSun', 'uCam', 'uFog', 'uOver', 'uFogD', 'uAlpha', 'uFancy']);
  PS = program(SKY_VS, SKY_FS, ['uInv', 'uCam', 'uFog', 'uZen', 'uSun']);
  const w = buildWorld();
  staticCount = w.staticCount;
  worldMesh = upload(w.data);
  droneMesh = upload(buildDrone());
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
export function resize() {
  vw = innerWidth; vh = innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const c of [glc, hud]) { c.width = Math.round(vw*dpr); c.height = Math.round(vh*dpr); }
  hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  readInsets();
}
addEventListener('resize', resize);

export function toggleCam() { cfg.cam = cfg.cam === 'fpv' ? 'chase' : 'fpv'; saveCfg(); say(cfg.cam === 'fpv' ? 'Drohnenkamera' : 'Verfolgerkamera', 1); }

export function render(dt) {
  const sim = game.sim;
  const W = glc.width, H = glc.height, asp = W/H;
  const hf = 110*DEG;
  const vf = clamp(2*Math.atan(Math.tan(hf/2)/asp), 55*DEG, 120*DEG);
  const proj = mPersp(vf, asp, 0.05, 1500);
  let view, eye;
  if (cfg.cam === 'fpv') {
    const qc = qMul(sim.q, qAxis([1,0,0], cfg.tilt*DEG));
    // Kamera sitzt vorne im Rahmen, leicht unter den Propellern
    eye = vAdd(sim.p, vAdd(vScale(qRot(sim.q, [0,0,-1]), 0.09), vScale(qRot(sim.q, [0,1,0]), -0.01)));
    view = mView(qc, eye);
    lastCamQ = qc;
  } else {
    const f = qRot(sim.q, [0,0,-1]), fl = Math.hypot(f[0], f[2]);
    if (fl > 0.2) game.camHeading = [f[0]/fl, 0, f[2]/fl];
    const target = [sim.p[0] - game.camHeading[0]*2.4, Math.max(0.4, sim.p[1] + 0.8), sim.p[2] - game.camHeading[2]*2.4];
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
  gl.bindVertexArray(skyVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true);

  // Welt
  gl.useProgram(P.p);
  gl.uniformMatrix4fv(P.u.uVP, false, vp);
  gl.uniformMatrix4fv(P.u.uModel, false, mIdent());
  gl.uniform3fv(P.u.uSun, SUN); gl.uniform3fv(P.u.uCam, eye); gl.uniform3fv(P.u.uFog, FOG);
  gl.uniform1f(P.u.uFogD, 1/260);
  gl.uniform1f(P.u.uFancy, cfg.gfx === 'simple' ? 0 : 1);
  gl.uniform1f(P.u.uAlpha, 1);
  gl.uniform4f(P.u.uOver, 0, 0, 0, 0);
  gl.bindVertexArray(worldMesh.vao);
  gl.drawArrays(gl.TRIANGLES, 0, staticCount);
  const pulse = 0.75 + 0.15*Math.sin(performance.now()/180);
  gates.forEach((g, i) => {
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
    gl.bindVertexArray(droneMesh.vao);
    const COL = { dumb: [1.0, 0.85, 0.1], random: [0.2, 0.6, 1.0], evade: [1.0, 0.2, 0.25] };
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
  // Drohne (Rumpf nur in der Verfolgerkamera, Propeller auch im Kamerabild)
  const md = mFromQT(sim.q, sim.p);
  if (cfg.cam !== 'fpv') {
    gl.uniform4f(P.u.uOver, 0, 0, 0, 0);
    gl.uniformMatrix4fv(P.u.uModel, false, md);
    gl.bindVertexArray(droneMesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, droneMesh.count);
  }
  if (cfg.cam !== 'fpv' || cfg.propsView) drawProps(md, dt);
  gl.bindVertexArray(null);
}

// Motoren: x-Seite, z-Seite, Drehrichtung (diagonal gleich, wie bei echten Quads)
const MOTORS = [[1, -1, -1], [-1, -1, 1], [1, 1, 1], [-1, 1, -1]];
const propAng = [0, 0.8, 1.6, 2.4];
function drawProps(md, dt) {
  const sim = game.sim;
  const S = PROP_S, spin = game.state === 'fly' && !game.paused;
  const w = spin ? 9 + sim.thr*38 : 0;                 // sichtbare Drehung, gedrosselt gegen Flimmern
  const blur = spin ? clamp(0.3 + sim.thr*1.4, 0, 1) : 0;
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  for (let i = 0; i < 4; i++) {
    const [mx, mz, dir] = MOTORS[i];
    propAng[i] += dir*w*dt;
    const mp = mMul(md, mFromQT(qAxis([0,1,0], propAng[i]), [mx*0.088*S, 0.026*S, mz*0.088*S]));
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
