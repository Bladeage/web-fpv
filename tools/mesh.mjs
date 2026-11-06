// 3D-Mesh NRW (Digitaler Zwilling, Geobasis NRW, dl-de/zero-2.0) für den Modus „Echte Welt“ vorbereiten. Nur Node-Bordmittel.
// Liest das SLPK-Paket (ZIP64, I3S 1.7 IntegratedMesh) per HTTP-Teilabruf, ohne es herunterzuladen:
//  1. zentrales Verzeichnis (einmal, zwischengespeichert in tools/.cache), 2. Knotenbaum im Gebiet,
//  3. Index aller Knoten (Lage, Stufe, Byte-Position im Paket) -> der Browser lädt scharfe Knoten im Flug nach,
//  4. grobe Stufe (COARSE) zusammengefasst und klein gepackt -> eingebettet (läuft ohne Internet).
// Aufruf: node tools/mesh.mjs
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, deflateSync } from 'node:zlib';
import { AREA } from './realworld.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), CACHE = join(ROOT, 'tools/.cache'), OUT = join(ROOT, 'realworld');
export const MESH = { url: 'https://www.opengeodata.nrw.de/produkte/geobasis/lusat/akt/3dmesh/3dmesh/Mesh_AC1443T45_nw_2025.slpk',
  flown: '2025-03-07', coarse: +(process.env.COARSE || 13), maxLevel: 18, margin: 150 };   // COARSE: eingebettete Stufe (13: ~115 cm/Pixel, 2,7 MB)

async function range(a, b) {
  for (let k = 0; k < 4; k++) {
    try { const r = await fetch(MESH.url, { headers: { Range: `bytes=${a}-${b}` } }); if (r.status === 206) return Buffer.from(await r.arrayBuffer()); }
    catch (e) { /* neu versuchen */ }
    await new Promise(res => setTimeout(res, 1000*(k + 1)));
  }
  throw new Error('Teilabruf fehlgeschlagen ' + a);
}
// ZIP64: Ende -> ZIP64-Ende -> zentrales Verzeichnis -> Name: [Kopf-Offset, gepackte Größe]
export async function openSlpk() {
  const head = await fetch(MESH.url, { method: 'HEAD' }), size = +head.headers.get('content-length');
  const tail = await range(size - 65536, size - 1), loc = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]));
  const z = await range(Number(tail.readBigUInt64LE(loc + 8)), Number(tail.readBigUInt64LE(loc + 8)) + 55);
  const cdSize = Number(z.readBigUInt64LE(40)), cdOff = Number(z.readBigUInt64LE(48));
  mkdirSync(CACHE, { recursive: true });
  const cf = join(CACHE, MESH.url.split('/').pop() + '.cd');
  let cd;
  if (existsSync(cf) && readFileSync(cf).length === cdSize) cd = readFileSync(cf); else { cd = await range(cdOff, cdOff + cdSize - 1); writeFileSync(cf, cd); }
  const dir = new Map();
  for (let q = 0; q + 46 <= cd.length && cd.readUInt32LE(q) === 0x02014b50; ) {
    const n1 = cd.readUInt16LE(q + 28), e1 = cd.readUInt16LE(q + 30), c1 = cd.readUInt16LE(q + 32);
    let off = cd.readUInt32LE(q + 42), csz = cd.readUInt32LE(q + 20);
    if (off === 0xffffffff || csz === 0xffffffff) {
      const ex = cd.slice(q + 46 + n1, q + 46 + n1 + e1);
      for (let k = 0; k + 4 <= ex.length; ) {
        const id = ex.readUInt16LE(k), sz = ex.readUInt16LE(k + 2);
        if (id === 1) { let r = k + 4; if (cd.readUInt32LE(q + 24) === 0xffffffff) r += 8; if (csz === 0xffffffff) { csz = Number(ex.readBigUInt64LE(r)); r += 8; } if (off === 0xffffffff) off = Number(ex.readBigUInt64LE(r)); }
        k += 4 + sz;
      }
    }
    dir.set(cd.slice(q + 46, q + 46 + n1).toString(), [off, csz]);
    q += 46 + n1 + e1 + c1;
  }
  const file = async path => {
    const e = dir.get(path); if (!e) return null;
    const h = await range(e[0], e[0] + 29), d0 = e[0] + 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
    return range(d0, d0 + e[1] - 1);
  };
  return { dir, file };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { dir, file } = await openSlpk();
  const meta = JSON.parse(readFileSync(join(OUT, AREA.name + '.json'), 'utf8'));
  const m = MESH.margin, BB = [AREA.bbox[0] - m, AREA.bbox[1] - m, AREA.bbox[2] + m, AREA.bbox[3] + m];
  const ec = (AREA.bbox[0] + AREA.bbox[2])/2, nc = (AREA.bbox[1] + AREA.bbox[3])/2, hHome = meta.hHome;
  const pages = new Map();
  const node = async i => { const p = Math.floor(i/64); if (!pages.has(p)) pages.set(p, JSON.parse(gunzipSync(await file(`nodepages/${p}.json.gz`))).nodes); return pages.get(p)[i % 64]; };
  const hit = n => { const c = n.obb.center, r = Math.hypot(...n.obb.halfSize); return c[0] + r > BB[0] && c[0] - r < BB[2] && c[1] + r > BB[1] && c[1] - r < BB[3]; };
  // Index: je Knoten [Nummer, Elternteil, Stufe, Mitte x y z (Karte), Radius, lodThreshold, Geometrie [Kopf, Länge], Textur [Kopf, Länge], Ecken]
  const nodes = [], list = [];
  async function walk(i, parent, d) {
    const n = await node(i);
    if (!hit(n) || d > MESH.maxLevel) return;
    let k = parent;
    if (n.mesh) {
      const r = n.mesh.geometry.resource, t = n.mesh.material.resource, g = dir.get(`nodes/${r}/geometries/0.bin.gz`), tx = dir.get(`nodes/${t}/textures/0.jpg`);
      if (g && tx) {
        const c = n.obb.center;
        k = nodes.length;
        nodes.push([i, parent, d, +(c[0] - ec).toFixed(2), +(c[2] - hHome).toFixed(2), +(-(c[1] - nc)).toFixed(2), +Math.hypot(...n.obb.halfSize).toFixed(2),
          Math.round(n.lodThreshold || 0), g[0], g[1], tx[0], tx[1], n.mesh.geometry.vertexCount, r, t, ...n.obb.quaternion.map(v => +v.toFixed(7))]);
        list.push({ n, k, r, t, d });
      }
    }
    for (const c of n.children || []) await walk(c, k, d + 1);
  }
  await walk(0, -1, 0);
  console.log('Knoten im Gebiet', nodes.length, 'Stufen', [...new Set(nodes.map(x => x[2]))].join(','));
  // Grobe Stufe: Dreiecke im Gebiet (mit Rand), Positionen 16 Bit in dm (Karte), UV 16 Bit, gepackt; Texturen dazu
  const coarse = list.filter(x => x.d === MESH.coarse), parts = [], texs = [];
  for (const { n, r, t } of coarse) {
    const raw = gunzipSync(await file(`nodes/${r}/geometries/0.bin.gz`)), vc = raw.readUInt32LE(0), c = n.obb.center;
    const pos = new Float32Array(raw.buffer.slice(raw.byteOffset + 8, raw.byteOffset + 8 + vc*12));
    // Positionen: relativ zur Knotenmitte in Landesachsen (die Drehung q beschreibt nur die Lage der Box; geprüft:
    // mit Drehung lägen Ecken eines gedrehten Knotens bis 180 m unter dem Gelände)
    const uv = new Float32Array(raw.buffer.slice(raw.byteOffset + 8 + vc*12, raw.byteOffset + 8 + vc*20));
    const keep = [];
    for (let v = 0; v < vc; v += 3) {
      let inside = false;
      for (let j = v; j < v + 3; j++) { const e = c[0] + pos[j*3], nn = c[1] + pos[j*3 + 1]; if (e > BB[0] && e < BB[2] && nn > BB[1] && nn < BB[3]) inside = true; }
      if (inside) keep.push(v);
    }
    const out = new Int16Array(keep.length*3*5);
    keep.forEach((v, q) => { for (let j = 0; j < 3; j++) { const s = (v + j), o = (q*3 + j)*5;
      out[o] = Math.round((c[0] + pos[s*3] - ec)*10); out[o + 1] = Math.round((c[2] + pos[s*3 + 2] - hHome)*10); out[o + 2] = Math.round(-(c[1] + pos[s*3 + 1] - nc)*10);
      out[o + 3] = Math.round(Math.min(1, Math.max(0, uv[s*2]))*65535) - 32768; out[o + 4] = Math.round(Math.min(1, Math.max(0, uv[s*2 + 1]))*65535) - 32768; } });
    parts.push(out); texs.push(await file(`nodes/${t}/textures/0.jpg`));
  }
  const counts = parts.map(p => p.length/15), all = new Int16Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  const geo = deflateSync(Buffer.from(all.buffer), { level: 9 });
  writeFileSync(join(OUT, AREA.name + '-mesh.geo'), geo);
  writeFileSync(join(OUT, AREA.name + '-mesh.tex'), Buffer.concat(texs));
  const index = { url: MESH.url, flown: MESH.flown, attribution: 'Geobasis NRW 3D-Mesh, Datenlizenz Deutschland – Zero 2.0', coarse: MESH.coarse,
    tris: counts, tex: texs.map(t => t.length), cols: 'i,parent,level,x,y,z,radius,lod,geoOff,geoLen,texOff,texLen,vertices,geoRes,texRes,qx,qy,qz,qw (Lage der Knoten-Box; Ecken = Mitte + Position, ohne Drehung)', nodes };
  writeFileSync(join(OUT, AREA.name + '-mesh.json'), JSON.stringify(index));
  console.log('grob: Dreiecke', counts.reduce((a, b) => a + b, 0), 'Geometrie gepackt', geo.length, 'Texturen', Buffer.concat(texs).length, 'Index', JSON.stringify(index).length);
}
