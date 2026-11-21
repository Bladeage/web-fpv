// Etappe Q1: Leser für die Quellen aus docs/quellen-geodaten.md. Testdateien werden hier erzeugt (ohne Netz).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, deflateRawSync } from 'node:zlib';
import { readTiff, readTiffAsync, cogOpen, cogWindow, cogLevel, zipGet, readXyz } from '../src/geo.js';

// Kleines TIFF schreiben. levels: [{ w, h, tw, th, vals(c, r) }]; bps 16 oder 32, fmt 1/2/3, comp 1 oder 8, pred 1/2/3.
function tiff({ levels, bps = 32, fmt = 3, le = true, comp = 1, pred = 1, geo = null }) {
  const B = bps/8, parts = [], ifds = [];
  let pos = 8;
  const put = u8 => { const at = pos; parts.push(u8); pos += u8.length; return at; };
  for (const L of levels) {
    const across = Math.ceil(L.w/L.tw), down = Math.ceil(L.h/L.th), offs = [], cnts = [];
    for (let ty = 0; ty < down; ty++) for (let tx = 0; tx < across; tx++) {
      const raw = new Uint8Array(L.tw*L.th*B), dv = new DataView(raw.buffer);
      for (let y = 0; y < L.th; y++) for (let x = 0; x < L.tw; x++) {
        const c = Math.min(L.w - 1, tx*L.tw + x), r = Math.min(L.h - 1, ty*L.th + y), v = L.vals(c, r), o = (y*L.tw + x)*B;
        if (fmt === 3) dv.setFloat32(o, v, pred === 3 ? false : le); else if (B === 2) dv.setInt16(o, v, le); else dv.setInt32(o, v, le);
      }
      let enc = raw;
      if (pred === 2) {   // waagrecht als ganze Zahl der Wertbreite
        enc = raw.slice(); const ev = new DataView(enc.buffer), g = o => B === 2 ? dv.getUint16(o, le) : dv.getUint32(o, le);
        for (let y = 0; y < L.th; y++) for (let x = L.tw - 1; x > 0; x--) { const o = (y*L.tw + x)*B, d = (g(o) - g(o - B) + 2**bps) % 2**bps; B === 2 ? ev.setUint16(o, d, le) : ev.setUint32(o, d, le); }
      } else if (pred === 3) {   // Bytes nach Wertigkeit, dann waagrecht differenziert
        enc = new Uint8Array(raw.length);
        for (let y = 0; y < L.th; y++) {
          const row = L.tw*B, tmp = new Uint8Array(row);
          for (let x = 0; x < L.tw; x++) for (let b = 0; b < B; b++) tmp[b*L.tw + x] = raw[y*row + x*B + b];
          for (let i = row - 1; i >= 0; i--) enc[y*row + i] = (tmp[i] - (i ? tmp[i - 1] : 0)) & 255;
        }
      }
      if (comp === 8) enc = new Uint8Array(deflateSync(enc));
      offs.push(put(enc)); cnts.push(enc.length);
    }
    const tags = [[256, 4, [L.w]], [257, 4, [L.h]], [258, 3, [bps]], [259, 3, [comp]], [277, 3, [1]], [317, 3, [pred]], [322, 4, [L.tw]], [323, 4, [L.th]], [324, 4, offs], [325, 4, cnts], [339, 3, [fmt]], [42113, 2, [...'-9999\0'].map(c => c.charCodeAt(0))]];
    if (geo && !ifds.length) tags.push([33550, 12, [geo.dx, geo.dx, 0]], [33922, 12, [0, 0, 0, geo.x, geo.y, 0]]);
    ifds.push(tags.sort((a, b) => a[0] - b[0]));
  }
  // Verzeichnisse hinten anhängen (Werte über 4 Byte davor)
  const S = { 2: 1, 3: 2, 4: 4, 12: 8 }, out = [], ifdAt = [];
  for (const tags of ifds) {
    const ext = tags.map(([, t, v]) => { if (S[t]*v.length <= 4) return null; const u = new Uint8Array(S[t]*v.length), d = new DataView(u.buffer);
      v.forEach((x, i) => t === 3 ? d.setUint16(i*2, x, le) : t === 4 ? d.setUint32(i*4, x, le) : t === 12 ? d.setFloat64(i*8, x, le) : d.setUint8(i, x)); return put(u); });
    const u = new Uint8Array(2 + tags.length*12 + 4), d = new DataView(u.buffer);
    d.setUint16(0, tags.length, le);
    tags.forEach(([tag, t, v], i) => { const e = 2 + i*12; d.setUint16(e, tag, le); d.setUint16(e + 2, t, le); d.setUint32(e + 4, v.length, le);
      if (ext[i] !== null) d.setUint32(e + 8, ext[i], le); else v.forEach((x, k) => t === 3 ? d.setUint16(e + 8 + k*2, x, le) : t === 4 ? d.setUint32(e + 8, x, le) : d.setUint8(e + 8 + k, x)); });
    ifdAt.push(put(u)); out.push(u);
  }
  ifds.forEach((tags, i) => new DataView(out[i].buffer).setUint32(2 + tags.length*12, i + 1 < ifds.length ? ifdAt[i + 1] : 0, le));
  const all = new Uint8Array(pos), hv = new DataView(all.buffer);
  all.set(le ? [0x49, 0x49] : [0x4d, 0x4d]); hv.setUint16(2, 42, le); hv.setUint32(4, ifdAt[0], le);
  let o = 8; for (const p of parts) { all.set(p, o); o += p.length; }
  return all;
}
const plane = (c, r) => 100 + 0.5*c - 0.25*r;   // Ebene: bilinear exakt

test('Deflate mit Prädiktor 2 (32 Bit Gleitkomma) und 3, Bytefolge LE und BE', async () => {
  for (const [pred, le] of [[2, true], [2, false], [3, true], [1, false]]) {
    const u8 = tiff({ levels: [{ w: 20, h: 9, tw: 16, th: 8, vals: (c, r) => plane(c, r) + Math.sin(c*r) }], comp: 8, pred, le });
    const t = await readTiffAsync(u8.buffer);
    assert.equal(t.w, 20); assert.equal(t.nodata, -9999);
    for (const [c, r] of [[0, 0], [19, 8], [7, 3], [16, 8]]) assert.ok(Math.abs(t.data[r*20 + c] - (plane(c, r) + Math.sin(c*r))) < 1e-4, `pred ${pred} le ${le} bei ${c},${r}`);
  }
  assert.throws(() => readTiff(tiff({ levels: [{ w: 4, h: 4, tw: 4, th: 4, vals: plane }], comp: 8 }).buffer), /readTiffAsync/);
});

test('Prädiktor 2 mit 16 Bit (ganze Zahlen, negativ) ohne Kompression', () => {
  const v = (c, r) => (c*37 - r*91) % 300 - 150;
  const t = readTiff(tiff({ levels: [{ w: 12, h: 5, tw: 12, th: 5, vals: v }], bps: 16, fmt: 2, pred: 2, le: false }).buffer);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 12; c++) assert.equal(t.data[r*12 + c], v(c, r));
});

test('COG: Lage, Stufe wählen, nur nötige Kacheln laden, Werte bilinear', async () => {
  // 64 x 64 Pixel zu 1 m ab (1000, 2064) oben links, Kacheln 16; Übersicht 32 x 32 (2 m)
  const u8 = tiff({ levels: [{ w: 64, h: 64, tw: 16, th: 16, vals: plane }, { w: 32, h: 32, tw: 16, th: 16, vals: (c, r) => plane(2*c + 0.5, 2*r + 0.5) }], comp: 8, pred: 3, geo: { x: 1000, y: 2064, dx: 1 } });
  const asked = [], range = async (a, b) => { asked.push([a, b]); return u8.slice(a, b + 1); };
  const c = await cogOpen(range);
  assert.deepEqual([c.x0, c.y0, c.dx, c.levels.length], [1000.5, 2063.5, 1, 2]);
  assert.equal(cogLevel(c, 1), 0); assert.equal(cogLevel(c, 2), 1); assert.equal(cogLevel(c, 8), 1);
  asked.length = 0;
  const bb = [1004, 2044, 1012, 2052], t = await cogWindow(c, bb, 8, 0);   // 8 x 8 m, Pixel 4..11, Zeilen 12..19 (zwei Kachelzeilen)
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) assert.ok(Math.abs(t.data[j*8 + i] - plane(4 + i, 12 + j)) < 1e-4);
  const bytes = asked.reduce((s, [a, b]) => s + b - a + 1, 0);
  assert.ok(bytes < u8.length/3, 'nur ein Teil der Datei geladen: ' + bytes + ' von ' + u8.length);
  const g = await cogWindow(c, [1000, 2000, 1064, 2064], 16);   // grob: Übersicht
  assert.ok(Math.abs(g.data[0] - plane(1.5, 1.5)) < 1e-3, 'Übersicht ' + g.data[0]);
});

test('Datei aus einem ZIP per Teilabruf (Deflate und gespeichert), Deflate64 abgelehnt', async () => {
  const files = [['a/dgm.tif', new TextEncoder().encode('Höhen'.repeat(50)), 8], ['b.txt', new TextEncoder().encode('xyz'), 0], ['c.gml', new Uint8Array(10), 9]];
  const loc = [], cd = [];
  let off = 0;
  for (const [name, data, m] of files) {
    const nm = new TextEncoder().encode(name), body = m === 8 ? new Uint8Array(deflateRawSync(data)) : data, h = new Uint8Array(30 + nm.length), d = new DataView(h.buffer);
    d.setUint32(0, 0x04034b50, true); d.setUint16(8, m, true); d.setUint32(18, body.length, true); d.setUint32(22, data.length, true); d.setUint16(26, nm.length, true); h.set(nm, 30);
    const c = new Uint8Array(46 + nm.length), e = new DataView(c.buffer);
    e.setUint32(0, 0x02014b50, true); e.setUint16(10, m, true); e.setUint32(20, body.length, true); e.setUint32(24, data.length, true); e.setUint16(28, nm.length, true); e.setUint32(42, off, true); c.set(nm, 46);
    loc.push(h, body); cd.push(c); off += h.length + body.length;
  }
  const cdLen = cd.reduce((s, c) => s + c.length, 0), end = new Uint8Array(22), ed = new DataView(end.buffer);
  ed.setUint32(0, 0x06054b50, true); ed.setUint32(12, cdLen, true); ed.setUint32(16, off, true);
  const all = new Uint8Array([...loc, ...cd, end].reduce((a, p) => (a.push(...p), a), []));
  const range = async (a, b) => all.slice(a, b + 1);
  assert.equal(new TextDecoder().decode(await zipGet(range, all.length, '.tif')), 'Höhen'.repeat(50));
  assert.equal(new TextDecoder().decode(await zipGet(range, all.length, 'b.txt')), 'xyz');
  await assert.rejects(zipGet(range, all.length, '.gml'), /Deflate64/);
  await assert.rejects(zipGet(range, all.length, '.xml'), /fehlt/);
});

test('XYZ-Text als Raster (Berlin: Pixelmitten auf ,5)', () => {
  let txt = '';
  for (let y = 9; y >= 0; y--) for (let x = 0; x < 10; x++) txt += `${500 + x + 0.5} ${600 + y + 0.5} ${plane(x, 9 - y).toFixed(3)}\n`;
  const t = readXyz(txt, [502, 602, 506, 606], 4);   // Zellmitten 502,5 ... 505,5
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) assert.ok(Math.abs(t.data[j*4 + i] - plane(2 + i, 9 - (605 - j - 600))) < 1e-3, `${i},${j}: ${t.data[j*4 + i]}`);
});
