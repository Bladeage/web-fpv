// Ortssuche (Prompt 192): Adresse des Dienstes, kurzer Name, Wartezeit zwischen Anfragen, Antwort lesen. Kein Netz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geoSearch, geoSearchUrl, geoShortName, GEOSEARCH } from '../src/geosearch.js';

test('Adresse: nur Deutschland, deutsch, höchstens 5 Treffer, Text kodiert', () => {
  const u = geoSearchUrl(' 51643 Bergisch Gladbach, Josef-Roemer-Str. ');
  assert.ok(u.startsWith(GEOSEARCH.url) && u.includes('countrycodes=de') && u.includes('accept-language=de') && u.includes('limit=5'));
  assert.ok(u.endsWith('q=51643%20Bergisch%20Gladbach%2C%20Josef-Roemer-Str.'));
});

test('Kurzer Name: ohne Hausnummer, mit Stadt', () => {
  assert.equal(geoShortName({ display_name: 'Kölner Dom, 4, Domkloster, Andreasviertel, Altstadt-Nord, Köln', address: { city: 'Köln' } }), 'Kölner Dom, Köln');
  assert.equal(geoShortName({ display_name: 'Josef-Roemer-Straße, Paffrath, Bergisch Gladbach', address: { city: 'Bergisch Gladbach' } }), 'Josef-Roemer-Straße, Bergisch Gladbach');
});

test('Suche: Treffer gelesen, höchstens eine Anfrage je 1,1 s, leere Eingabe fragt nicht', async () => {
  let t = 10000, waited = 0, asked = 0;
  const net = { text: async u => { asked++; return JSON.stringify([{ lat: '50.9413', lon: '6.95814', display_name: 'Kölner Dom, 4, Domkloster, Köln', address: { city: 'Köln' } }]); } };
  const now = () => t, wait = async ms => { waited += ms; t += ms; };
  const a = await geoSearch('kölner dom', net, now, wait);
  assert.deepEqual(a.map(r => [r.lat, r.lon, r.name]), [[50.9413, 6.95814, 'Kölner Dom, Köln']]);
  t += 200; await geoSearch('kölner dom', net, now, wait);
  assert.ok(waited >= 900 && waited <= GEOSEARCH.gap, 'gewartet ' + waited + ' ms');
  assert.deepEqual(await geoSearch('   ', net, now, wait), []); assert.equal(asked, 2);
});
