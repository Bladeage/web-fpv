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
