// Prüfbericht Etappe 5: Hintergrund-Thread. Der Worker-Quelltext entsteht aus dem fertigen Bundle (rwthread.wkSource);
// hier läuft er abgeschottet (vm) mit nachgebildetem postMessage und Abrufen aus Testdaten, Ergebnis gleich wie direkt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import vm from 'node:vm';
import { bundle } from '../tools/build.mjs';
import { wkSource } from '../src/rwthread.js';
import { rw, rwApply, rwModelMesh, rwMeshInput } from '../src/realworld.js';
import { RW_SOURCES, rwAreaAt, rwFetchArea } from '../src/rwload.js';

const src = wkSource(bundle().js);
// Worker in einer eigenen Umgebung starten; send(Nachricht) liefert die Antwort (Zwischenstände gesammelt)
function startWorker(fetchFn) {
  const out = [], ctx = vm.createContext({ postMessage: m => out.push(m), fetch: fetchFn, AbortController, TextDecoder, TextEncoder, setTimeout, clearTimeout, Response, Blob, URL, atob, console, navigator: {} });
  vm.runInContext(src, ctx);
  const send = async m => { ctx.onmessage({ data: m }); for (let i = 0; i < 2000; i++) { const r = out.find(x => x.id === m.id && (x.out || x.err)); if (r) return { r, say: out.filter(x => x.id === m.id && x.say) }; await new Promise(res => setTimeout(res, 5)); } throw new Error('keine Antwort'); };
  return { out, send };
}

test('Etappe 5: Worker-Quelltext aus dem Bundle, ohne eingebettete Daten und ohne DOM-Teile', () => {
  assert.ok(src, 'alle Module gefunden');
  assert.ok(src.length < 400e3, 'klein: ' + Math.round(src.length/1e3) + ' KB (Bundle 7,5 MB)');
  assert.ok(!/'[A-Za-z0-9+/=]{2000,}'/.test(src), 'keine Base64-Daten');
  assert.ok(!/document\.|getElementById/.test(src), 'kein DOM');
  const w = startWorker(async () => { throw new TypeError('offline'); });
  assert.equal(w.out[0].ready, true, 'Worker meldet sich');
});

test('Etappe 5: Netz der Gebäude und Bäume im Worker gleich wie direkt (Monschau)', async () => {
  const f = n => readFileSync(new URL('../realworld/monschau.' + n, import.meta.url)), meta = JSON.parse(f('json')), q = inflateSync(f('dgm'));
  const un = n => { const b = inflateSync(f(n)); return new Int16Array(b.buffer, b.byteOffset, b.byteLength/2); };
  rwApply({ meta, q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees') });
  const direct = rwModelMesh(rw.main), w = startWorker(async () => { throw new TypeError('offline'); });
  const { r } = await w.send({ id: 1, job: 'modelMesh', S: rwMeshInput(rw.main) });
  assert.equal(r.out.length, direct.length);
  assert.ok(r.out.every((v, i) => v === direct[i]), 'jeder Wert gleich');
});

test('Etappe 5: Gebiet im Worker laden (Abrufe, Raster, Gebäude, Bäume) gleich wie direkt; Fehler kommen als Text zurück', async () => {
  const tif = new Uint8Array(readFileSync(new URL('./fixtures/nrw-dgm-32.tif', import.meta.url))), NRW = RW_SOURCES[0];
  const a = { ...rwAreaAt(305000, 5604000, NRW), n: 32, place: 'Test' };
  const fake = async u => u.includes('WMS') ? new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])) : u.endsWith('.gml') ? new Response('x', { status: 404 }) : new Response(tif);
  const w = startWorker(fake);
  const { r, say } = await w.send({ id: 2, job: 'area', a, srcs: [NRW], opt: { far: false, cells: null, lod2: false } });
  assert.ok(!r.err, r.err);
  const get = async u => new Uint8Array(await (await fake(u)).arrayBuffer()), text = async u => { const x = await fake(u); return x.status === 404 ? null : x.text(); };
  const d = await rwFetchArea(a, NRW, get, text, () => {}, { far: false });
  assert.deepEqual([...r.out.q], [...d.q]); assert.deepEqual(r.out.meta.bbox, d.meta.bbox); assert.equal(r.out.meta.trees, d.meta.trees);
  assert.ok(say.length >= 3, 'Zwischenstände kommen an');
  const bad = startWorker(async () => { throw new TypeError('Failed to fetch'); });
  const { r: e } = await bad.send({ id: 3, job: 'area', a, srcs: [NRW], opt: { far: false, cells: null, lod2: false } });
  assert.match(e.err, /Keine Verbindung zu www\.wcs\.nrw\.de/);
});
