/* Mathematik: Vektoren, Quaternionen [x,y,z,w], Matrizen (spaltenweise, wie WebGL).
   Ohne DOM, in Node testbar. */

export const DEG = Math.PI / 180;
export const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

/* ---------- Vektoren ---------- */
export const vAdd = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
export const vSub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
export const vScale = (a, s) => [a[0]*s, a[1]*s, a[2]*s];
export const vDot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
export const vLen = a => Math.hypot(a[0], a[1], a[2]);
export const vNorm = a => { const l = vLen(a) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };
export const vCross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

/* ---------- Quaternionen [x,y,z,w] ---------- */
export function qMul(a, b) {
  return [
    a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1],
    a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0],
    a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3],
    a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2]
  ];
}
export function qAxis(ax, ang) { const s = Math.sin(ang/2); return [ax[0]*s, ax[1]*s, ax[2]*s, Math.cos(ang/2)]; }
export function qNorm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0]/l, q[1]/l, q[2]/l, q[3]/l]; }
export function qRot(q, v) {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const tx = 2*(y*v[2] - z*v[1]), ty = 2*(z*v[0] - x*v[2]), tz = 2*(x*v[1] - y*v[0]);
  return [v[0] + w*tx + (y*tz - z*ty), v[1] + w*ty + (z*tx - x*tz), v[2] + w*tz + (x*ty - y*tx)];
}
export function qFromRotVec(r) {
  const a = vLen(r);
  if (a < 1e-9) return [r[0]/2, r[1]/2, r[2]/2, 1];
  return qAxis(vScale(r, 1/a), a);
}

/* ---------- Matrizen (spaltenweise, wie WebGL) ---------- */
export function mPersp(fovy, asp, n, f) {
  const t = 1/Math.tan(fovy/2), m = new Float32Array(16);
  m[0] = t/asp; m[5] = t; m[10] = (f+n)/(n-f); m[11] = -1; m[14] = 2*f*n/(n-f);
  return m;
}
export function mMul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k*4+r] * b[c*4+k];
    o[c*4+r] = s;
  }
  return o;
}
export function mIdent() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }
export function mFromQT(q, t) {
  const x = q[0], y = q[1], z = q[2], w = q[3], m = new Float32Array(16);
  m[0] = 1-2*(y*y+z*z); m[1] = 2*(x*y+z*w);   m[2] = 2*(x*z-y*w);
  m[4] = 2*(x*y-z*w);   m[5] = 1-2*(x*x+z*z); m[6] = 2*(y*z+x*w);
  m[8] = 2*(x*z+y*w);   m[9] = 2*(y*z-x*w);   m[10] = 1-2*(x*x+y*y);
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
  return m;
}
export function mViewFromAxes(r, u, b, p) {
  const m = new Float32Array(16);
  m[0] = r[0]; m[4] = r[1]; m[8]  = r[2];
  m[1] = u[0]; m[5] = u[1]; m[9]  = u[2];
  m[2] = b[0]; m[6] = b[1]; m[10] = b[2];
  m[12] = -vDot(r, p); m[13] = -vDot(u, p); m[14] = -vDot(b, p); m[15] = 1;
  return m;
}
export function mView(q, p) { return mViewFromAxes(qRot(q, [1,0,0]), qRot(q, [0,1,0]), qRot(q, [0,0,1]), p); }
export function mLookAt(eye, target) {
  const b = vNorm(vSub(eye, target));
  const r = vNorm(vCross([0,1,0], b));
  const u = vCross(b, r);
  return mViewFromAxes(r, u, b, eye);
}
export function mInv(a) {
  const o = new Float32Array(16);
  const a00=a[0],a01=a[1],a02=a[2],a03=a[3],a10=a[4],a11=a[5],a12=a[6],a13=a[7],
        a20=a[8],a21=a[9],a22=a[10],a23=a[11],a30=a[12],a31=a[13],a32=a[14],a33=a[15];
  const b00=a00*a11-a01*a10,b01=a00*a12-a02*a10,b02=a00*a13-a03*a10,b03=a01*a12-a02*a11,
        b04=a01*a13-a03*a11,b05=a02*a13-a03*a12,b06=a20*a31-a21*a30,b07=a20*a32-a22*a30,
        b08=a20*a33-a23*a30,b09=a21*a32-a22*a31,b10=a21*a33-a23*a31,b11=a22*a33-a23*a32;
  let det = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
  if (!det) return o;
  det = 1/det;
  o[0]=(a11*b11-a12*b10+a13*b09)*det; o[1]=(a02*b10-a01*b11-a03*b09)*det;
  o[2]=(a31*b05-a32*b04+a33*b03)*det; o[3]=(a22*b04-a21*b05-a23*b03)*det;
  o[4]=(a12*b08-a10*b11-a13*b07)*det; o[5]=(a00*b11-a02*b08+a03*b07)*det;
  o[6]=(a32*b02-a30*b05-a33*b01)*det; o[7]=(a20*b05-a22*b02+a23*b01)*det;
  o[8]=(a10*b10-a11*b08+a13*b06)*det; o[9]=(a01*b08-a00*b10-a03*b06)*det;
  o[10]=(a30*b04-a31*b02+a33*b00)*det; o[11]=(a21*b02-a20*b04-a23*b00)*det;
  o[12]=(a11*b07-a10*b09-a12*b06)*det; o[13]=(a00*b09-a01*b07+a02*b06)*det;
  o[14]=(a31*b01-a30*b03-a32*b00)*det; o[15]=(a20*b03-a21*b01+a22*b00)*det;
  return o;
}
export function mApply(m, p) {
  return [
    m[0]*p[0] + m[4]*p[1] + m[8]*p[2]  + m[12],
    m[1]*p[0] + m[5]*p[1] + m[9]*p[2]  + m[13],
    m[2]*p[0] + m[6]*p[1] + m[10]*p[2] + m[14],
    m[3]*p[0] + m[7]*p[1] + m[11]*p[2] + m[15]
  ];
}
