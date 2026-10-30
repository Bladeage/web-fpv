// OSD: ausgeschaltete Elemente erscheinen nicht, Vorgaben und Warnungen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OSD_ITEMS, osdOn, osdLines, osdWarning } from '../src/osd.js';

const d = { lq: 100, mode: 'angle', label: 'TOR 1/8', crashes: 1, cur: 12.3, last: null, best: 30, clock: '12:34',
            vpack: 16.4, cell: 4.1, cellRest: 4.15, amp: 10, mah: 120, cap: 1500, flyT: 60, kmh: 42, alt: 3.2, homeD: 20,
            thr: 0.3, pitchDeg: -12, rollDeg: 5 };
const ids = lines => Object.values(lines).flat().map(l => l.id);

test('Vorgabe: Standard-Elemente an, Zusatzwerte aus', () => {
  const got = ids(osdLines({}, d));
  for (const id of ['lq', 'mode', 'task', 'timer', 'volt', 'cell', 'amp', 'mah', 'flytime', 'speed', 'alt', 'home', 'thr']) assert.ok(got.includes(id), id);
  for (const id of ['clock', 'eff', 'tilt']) assert.ok(!got.includes(id), id);
});

test('Ausgeschaltete Elemente werden nicht gezeichnet', () => {
  const off = Object.fromEntries(OSD_ITEMS.map(([id]) => [id, false]));
  assert.deepEqual(ids(osdLines(off, d)), []);
  const lines = osdLines({ volt: false, clock: true, tilt: true }, d);
  assert.ok(!ids(lines).includes('volt'));
  assert.equal(lines.tr.at(-1).t, '12:34');
  assert.equal(lines.bc[0].t, 'P -12 R   5');
  assert.equal(lines.br.at(-1).id, 'home', 'Heimweg steht unten rechts zuletzt');
});

test('Warnungen und Farben', () => {
  assert.equal(osdWarning(d), null);
  assert.equal(osdWarning({ ...d, cell: 3.4 }), 'LOW BATTERY');
  assert.equal(osdWarning({ ...d, cellRest: 3.4 }), 'LAND NOW');
  assert.equal(osdWarning({ ...d, lq: 20 }), 'LQ LOW');
  assert.equal(osdOn({}, 'sticks'), true);
  assert.equal(osdOn({ sticks: false }, 'sticks'), false);
});
