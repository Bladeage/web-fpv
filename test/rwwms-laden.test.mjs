// Etappe W2: Quellenart WMS-Höhendienst im Ladeweg. Lesen der Quelle, Planung (Geltung, UTM-Zone aus der Länge),
// Laden eines Orts gegen den Ersatzdienst ohne jedes Speichern (Herstellerdaten nur anzeigen).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rw, rwPlan, rwLoadLive, rwSources, rwSampleH, rwStreamStep } from '../src/realworld.js';
import { rwSourcesParse, RW_SOURCES } from '../src/rwload.js';
import { GEOID_FIX, toUtm, fromUtm } from '../src/geo.js';
import { startErsatz, surface } from './wms-ersatz.mjs';

const wms = (url, use = 'all', vref = 'ellipsoid') => rwSourcesParse(JSON.stringify([{ kind: 'wms', name: 'Test-WMS', hgt: { url }, vref, use }])).sources[0];

test('W2: WMS-Quelle lesen, Fehler verständlich, nie speichern', () => {
  const s = wms('http://127.0.0.1:7071/ows?SERVICE=WMS', 'dis');
  assert.equal(s.kind, 'wms'); assert.equal(s.hgt.url, 'http://127.0.0.1:7071/ows'); assert.equal(s.store, false); assert.equal(s.box, null);
  assert.equal(s.use, 'dis'); assert.equal(s.vref, 'ellipsoid');
  const bad = rwSourcesParse(JSON.stringify([{ kind: 'wms', name: 'x', hgt: { url: 'ftp://a' }, vref: 'geoid' }]));
  assert.equal(bad.sources.length, 0); assert.match(bad.errors[0], /Adresse ungültig.*Höhenbezug/);
  const lok = RW_SOURCES.find(x => x.id === 'wms-lokal');
  assert.ok(lok && lok.kind === 'wms' && lok.store === false && lok.use === 'dis', 'Vorlage für den lokalen Rechner');
});

test('W2: Planung nach Geltung; außerhalb Deutschlands mit UTM-Zone aus der Länge', () => {
  const old = rw.userSources;
  try {
    rw.userSources = [];
    assert.equal(rwPlan(48.8566, 2.3522), null, 'Paris ohne Quelle');
    assert.equal(rwPlan(48.8566, 2.3522, rwSources(), { dis: true }).srcs[0].id, 'wms-lokal', 'DIS-Übung: Vorlage lokaler Rechner');
    rw.userSources = [wms('http://h/ows', 'all')];
    const p = rwPlan(48.8566, 2.3522);
    assert.equal(p.srcs.length, 1); assert.equal(p.srcs[0].crs, 'EPSG:25831');
    const [E, N] = toUtm(48.8566, 2.3522, 31), b = p.area.bbox;
    assert.ok(E > b[0] && E < b[2] && N > b[1] && N < b[3], 'Gebiet um den Ort');
    rw.userSources = [wms('http://h/ows', 'nie')];
    assert.equal(rwPlan(48.8566, 2.3522, rwSources(), { dis: true }).srcs[0].id, 'wms-lokal', '„Nie“ fällt weg');
    rw.userSources = [wms('http://h/ows', 'dis')];
    assert.equal(rwPlan(48.8566, 2.3522), null, '„DIS-Übung“ gilt nicht für „Ort laden“');
  } finally { rw.userSources = old; }
});

test('W2: Ort vom Ersatzdienst laden: Höhen stimmen, Relief statt Luftbild, nichts gespeichert', async t => {
  const E = startErsatz(); await E.ready; t.after(() => E.close());
  const old = rw.userSources, puts = [], gets = [];
  const store = { get: async k => (gets.push(k), null), put: async k => (puts.push(k), true), land: async () => null, landPut: async () => true, landHas: async () => false };
  const [lat, lon] = [50.9, 7.0];
  try {
    rw.userSources = [wms(E.url, 'all')];
    await rwLoadLive(lat, lon, () => {}, undefined, null, store);
    assert.equal(puts.length, 0, 'kein Speichern'); assert.equal(gets.length, 0, 'auch nicht aus dem Speicher gelesen');
    assert.ok(rw.live && !rw.fromStore); assert.deepEqual(rw.liveSrcs, ['Test-WMS']);
    assert.ok(rw.dop && rw.dop.length > 1000, 'schattiertes Relief als Bild');
    assert.equal(rw.meta.buildings, 0); assert.equal(rw.meta.trees, 0);
    assert.ok(rw.far, 'Umgebung vom Höhendienst');
    // Startplatz: Höhe aus dem Gitter gegen die bekannte Fläche (Ellipsoid minus GEOID_FIX), Gitterzelle 1 m bis 2 m
    const bb = rw.meta.bbox, [hl, hn] = fromUtm((bb[0] + bb[2])/2 + rw.meta.home[0], (bb[1] + bb[3])/2 - rw.meta.home[1], 32);
    assert.ok(Math.abs(rw.meta.hHome - (surface(hl, hn) - GEOID_FIX)) < 1.5, 'Höhe am Start ' + rw.meta.hHome + ' gegen ' + (surface(hl, hn) - GEOID_FIX).toFixed(2));
    rw.on = true; assert.ok(Number.isFinite(rwSampleH(0, 0)));
    // Kachel östlich beim Fliegen: vom Ersatzdienst, wieder ohne Speichern, Höhe passt zur Fläche
    rw.stream = true; const n0 = E.calls.length;
    assert.equal(await rwStreamStep(260, 0, store), true, rw.tileErr);
    assert.ok(rw.tiles.has('1,0') && E.calls.length > n0, 'Kachel vom Höhendienst');
    const [tl, tn] = fromUtm((bb[0] + bb[2])/2 + 1000, (bb[1] + bb[3])/2, 32);
    assert.ok(Math.abs(rwSampleH(1000, 0) + rw.meta.hHome - (surface(tl, tn) - GEOID_FIX)) < 1.5, 'Höhe in der Kachel');
    assert.equal(puts.length, 0, 'auch die Kachel nicht gespeichert');
  } finally { rw.userSources = old; rw.on = false; rw.tiles.clear(); }
});

test('W3: Gefundener Dienst gilt vor der Landesquelle, auch in NRW; Kacheln planen mit ihm; Monschau setzt zurück', async () => {
  const old = rw.userSources;
  try {
    rw.userSources = [];
    const found = { ...wms('http://h:7071/ows', 'dis'), hgt: { url: 'http://h:7071/ows', layer: 'X_hgt', tile: 256 } };
    assert.equal(rwPlan(50.5553, 6.2428, rwSources(), { dis: true }).srcs[0].id, 'nrw', 'ohne Aushandlung: Landesquelle in NRW');
    const p = rwPlan(50.5553, 6.2428, rwSources(), { wms: found });
    assert.equal(p.srcs.length, 1); assert.equal(p.srcs[0].hgt.layer, 'X_hgt'); assert.equal(p.srcs[0].crs, 'EPSG:25832');
  } finally { rw.userSources = old; }
});

test('Prompt 173: Luftbild des Höhendienstes: Ebene wählen, Kacheln und Ecken, im Ladeweg statt Relief, nichts gespeichert', async t => {
  const { wmsPickPhoto, wmsCapsParse, wmsFetchPhoto } = await import('../src/rwwms.js');
  const { ERSATZ_CAPS } = await import('./wms-ersatz.mjs');
  const partner = wmsCapsParse('<Layer><Name>Blue_hgt</Name></Layer><Layer><Name>Blue_ortho_photo</Name></Layer><Layer><Name>Blue_ortho_height</Name></Layer><Layer><Name>Blue_shaded_relief</Name></Layer><Layer><Name>Blue_ortho_vegetation_height_rgb</Name></Layer>');
  assert.deepEqual(wmsPickPhoto(partner), ['Blue_ortho_photo']);
  assert.deepEqual(wmsPickPhoto(wmsCapsParse(ERSATZ_CAPS)), ['Test_photo']);
  const E = startErsatz(); await E.ready; t.after(() => E.close());
  const src = wms(E.url, 'all'), [E0, N0] = toUtm(50.9, 7.0, 32), bbox = [E0 - 500, N0 - 500, E0 + 500, N0 + 500];
  const net = (await import('../src/realworld.js')).rwNet(null, 5000).get;
  const ph = await wmsFetchPhoto(src, 'Test_photo', bbox, 32, 512, net);
  assert.equal(ph.tiles.length, ph.nx*ph.ny); assert.ok(ph.nx >= 2 && ph.ny >= 2, ph.nx + ' x ' + ph.ny);
  assert.ok(ph.tiles.every(x => x.bytes[0] === 0x89 && x.bytes[1] === 0x50), 'PNG');
  const [nw, ne, sw] = ph.corners, W = ph.nx*ph.T, H = ph.ny*ph.T;
  for (const c of ph.corners) assert.ok(c[0] > 0 && c[0] < W && c[1] > 0 && c[1] < H, 'Ecke im Mosaik');
  // Gitter-Nord ist gegen geografisch Nord gedreht (Meridiankonvergenz, Länge 7° in Zone 32: etwa (7 - 9)·sin 50,9° = -1,55°);
  // im Mosaik (Zeilen nach Süden) liegt die Nordost-Ecke darum höher als die Nordwest-Ecke
  const rot = Math.atan2(ne[1] - nw[1], ne[0] - nw[0])*180/Math.PI;
  assert.ok(Math.abs(rot + 1.55) < 0.1, 'Drehung ' + rot.toFixed(2) + '°');
  assert.ok(sw[1] > nw[1] + 400, 'Südwest-Ecke unter der Nordwest-Ecke');
  // Ladeweg: Bild kommt vom Entzerren (Attrappe), Startgebiet und Umgebung, kein Speichern
  const old = rw.userSources, oldW = rw.photoWarp, calls = [], puts = [];
  const store = { get: async () => null, put: async k => (puts.push(k), true), land: async () => null, landPut: async () => true, landHas: async () => false };
  try {
    rw.userSources = [src]; rw.photoWarp = async (p, N) => { calls.push([p.tiles.length, N]); return new Uint8Array([0xff, 0xd8, N & 255]); };
    await rwLoadLive(50.9, 7.0, () => {}, undefined, null, store);
    assert.ok(calls.length >= 1 && calls[0][1] === 512, 'Startgebiet 512 Bildpunkte');
    assert.deepEqual([...rw.dop], [0xff, 0xd8, 0], 'Luftbild statt Relief');
    assert.ok(rw.farDop && rw.farDop[0] === 0xff, 'Umgebung mit Luftbild');
    assert.equal(puts.length, 0);
    rw.photoWarp = null;   // ohne Entzerren (Node, Worker): Relief wie bisher
    await rwLoadLive(50.9, 7.0, () => {}, undefined, null, store);
    assert.equal(rw.dop[0], 0x42, 'Relief als BMP');
  } finally { rw.userSources = old; rw.photoWarp = oldW; }
});

test('Prompt 178: Gewässer und Ortsnamen auch über dem Gelände des Höhendienstes (Landesdaten lesen, nichts speichern)', async t => {
  const { rwExtraSrc } = await import('../src/realworld.js');
  const E = startErsatz(); await E.ready; t.after(() => E.close());
  const old = rw.userSources, oldW = rw.photoWarp, asked = [], puts = [];
  const store = { get: async () => null, put: async k => (puts.push(k), true), land: async k => (asked.push(k), null), landPut: async () => true, landHas: async () => true };
  try {
    rw.userSources = [wms(E.url, 'all')]; rw.photoWarp = null;
    const w = rwPlan(50.9, 7.0).srcs[0];
    assert.equal(w.kind, 'wms');
    assert.equal(rwExtraSrc(w, 50.9, 7.0).id, 'nrw', 'in NRW: Landesquelle für Gewässer');
    assert.equal(rwExtraSrc({ ...w, crs: 'EPSG:25831' }, 48.85, 2.35), null, 'außerhalb: keine');
    await rwLoadLive(50.9, 7.0, () => {}, undefined, null, store);
    assert.ok(asked.some(k => k.includes(RW_SOURCES[0].dlm.water)), 'Gewässer aus den Landesdaten abgefragt: ' + asked.join(', '));
    assert.equal(puts.length, 0, 'vom Höhendienst nichts gespeichert');
  } finally { rw.userSources = old; rw.photoWarp = oldW; }
});
