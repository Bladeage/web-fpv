// Kartenebenen für den Modus „Echte Welt“ aus dem ATKIS Basis-DLM (Geobasis NRW, dl-de/zero-2.0). Nur Node-Bordmittel.
// Nur zur Anzeige: schmale Gewässer (Achsen), Straßen (Achsen), Brücken und Wehre, Wald (Umrisse), Türme.
// Liest per Teilabruf die Shape-Dateien aus dem Gesamtpaket, schneidet aufs Gebiet zu (mit Rand) und rechnet in
// Kartenkoordinaten (Mitte = Ursprung, x nach Osten, z nach Süden). Ergebnis: realworld/<name>.features.json
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipFile, DLM } from './water.mjs';
import { AREA } from './realworld.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), M = 60;   // Rand in m
// Shapefile mit Sachdaten (DBF): je Objekt Typ, Teile (Linien, Ringe oder ein Punkt) und Felder
async function layer(name, m = M) {
  const shp = await zipFile(DLM.url, name + '.shp'), dbf = await zipFile(DLM.url, name + '.dbf');
  const hlen = dbf.readUInt16LE(8), rlen = dbf.readUInt16LE(10), fields = [];
  for (let o = 32, pos = 1; dbf[o] !== 0x0d; o += 32) { fields.push({ name: dbf.slice(o, o + 11).toString().replace(/\0.*$/, ''), pos, len: dbf[o + 16] }); pos += dbf[o + 16]; }
  const bb = [AREA.bbox[0] - m, AREA.bbox[1] - m, AREA.bbox[2] + m, AREA.bbox[3] + m], out = [];
  for (let p = 100, k = 0; p + 8 <= shp.length; k++) {
    const len = shp.readInt32BE(p + 4)*2, c = p + 8, t = shp.readInt32LE(c);
    let parts = null;
    if (t === 1) { const x = shp.readDoubleLE(c + 4), y = shp.readDoubleLE(c + 12); if (x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3]) parts = [[[x, y]]]; }
    else if (t === 3 || t === 5) {
      const x0 = shp.readDoubleLE(c + 4), y0 = shp.readDoubleLE(c + 12), x1 = shp.readDoubleLE(c + 20), y1 = shp.readDoubleLE(c + 28);
      if (x1 >= bb[0] && x0 <= bb[2] && y1 >= bb[1] && y0 <= bb[3]) {
        const np = shp.readInt32LE(c + 36), nn = shp.readInt32LE(c + 40), idx = [], pts = c + 44 + np*4;
        for (let i = 0; i < np; i++) idx.push(shp.readInt32LE(c + 44 + i*4));
        parts = idx.map((s, i) => { const r = []; for (let q = s; q < (i + 1 < np ? idx[i + 1] : nn); q++) r.push([shp.readDoubleLE(pts + q*16), shp.readDoubleLE(pts + q*16 + 8)]); return r; });
      }
    }
    if (parts) {
      const rec = {}; for (const f of fields) { const v = dbf.slice(hlen + k*rlen + f.pos, hlen + k*rlen + f.pos + f.len).toString('utf8').trim(); if (v && v !== '-9999' && v !== '-9998') rec[f.name] = v; }
      out.push({ type: t, parts, rec });
    }
    p = c + len;
  }
  return { out, bb };
}
const ec = (AREA.bbox[0] + AREA.bbox[2])/2, nc = (AREA.bbox[1] + AREA.bbox[3])/2;
const loc = ([x, y]) => [+(x - ec).toFixed(1), +(-(y - nc)).toFixed(1)];
// Linie vereinfachen (Douglas-Peucker, Toleranz tol m)
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  let k = 0, dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((pts[i][0] - a[0])*dy - (pts[i][1] - a[1])*dx)/l; if (d > dmax) { dmax = d; k = i; } }
  return dmax < tol ? [a, b] : simplify(pts.slice(0, k + 1), tol).slice(0, -1).concat(simplify(pts.slice(k), tol));
}
// Linie aufs Rechteck zuschneiden (Punkte außerhalb trennen die Linie)
function clipLine(pts, bb) {
  const res = []; let cur = [];
  for (const p of pts) { if (p[0] >= bb[0] && p[0] <= bb[2] && p[1] >= bb[1] && p[1] <= bb[3]) cur.push(p); else { if (cur.length > 1) res.push(cur); cur = []; } }
  if (cur.length > 1) res.push(cur);
  return res;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const lines = async (name, fn) => { const { out, bb } = await layer(name), res = []; for (const o of out) for (const part of o.parts) for (const l of clipLine(part, bb)) res.push({ ...fn(o.rec), pts: l.map(loc) }); return res; };
  const F = { source: 'ATKIS Basis-DLM NRW, Datenlizenz Deutschland – Zero 2.0' };
  F.streams = await lines('gew01_l', r => ({ name: r.NAM || '' }));
  F.roads = await lines('ver01_l', r => ({ name: r.NAM || '' }));
  F.bridges = (await lines('ver06_l', r => ({ kind: r.OBJART_TXT === 'AX_BauwerkImGewaesserbereich' ? 'Wasserbauwerk' : 'Brücke' })));
  F.forest = (await lines('veg02_f', r => ({ kind: r.VEG === '1200' ? 'Nadelwald' : r.VEG === '1100' ? 'Laubwald' : 'Mischwald' })));   // Ränder als Linien
  // Ortslagen (bebaute Orte mit Namen) im Umkreis von 8 km: Umrisse vereinfacht (10 m), für „nächster Ort“ im OSD
  F.places = (await layer('sie01_f', 8000)).out.filter(o => o.rec.NAM).map(o => ({ name: o.rec.NAM, rings: o.parts.map(r => simplify(r.slice(0, -1), 10).map(loc)).filter(r => r.length > 3) }));
  F.towers = (await layer('sie05_p')).out.filter(o => o.rec.OBJART_TXT === 'AX_Turm').map(o => { const [x, z] = loc(o.parts[0][0]); return { name: o.rec.NAM || 'Turm', x, z }; });
  writeFileSync(join(ROOT, 'realworld', AREA.name + '.features.json'), JSON.stringify(F));
  console.log(Object.fromEntries(Object.entries(F).filter(([k]) => k !== 'source').map(([k, v]) => [k, v.length])), 'Namen:',
    [...new Set([...F.streams, ...F.roads].map(x => x.name).filter(Boolean))].slice(0, 12).join(', '), '| Türme:', F.towers.map(t => t.name).join(', '),
    '| Größe', JSON.stringify(F).length, 'B');
}
