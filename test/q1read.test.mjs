// Etappe Q1: Leser für die Quellen aus docs/quellen-geodaten.md. Testdateien werden hier erzeugt (ohne Netz).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { tiff } from './tiffwrite.mjs';
import { readTiff, readTiffAsync, cogOpen, cogWindow, cogLevel, zipGet } from '../src/geo.js';

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
