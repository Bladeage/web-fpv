// Belebung der echten Welt (Prompt 178): Schwärme, Greifvögel, Flugzeuge mit Kondensstreifen; nicht in der DIS-Übung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { cfg } from '../src/state.js';
import { rw, rwApply, groundH } from '../src/realworld.js';
import { amb, ambInit, ambStep, ambJetDirs, AMB } from '../src/ambient.js';
import { rng } from '../src/world.js';

const f = n => readFileSync(new URL('../realworld/monschau.' + n, import.meta.url)), meta = JSON.parse(f('json')), q = inflateSync(f('dgm'));
rwApply({ meta, q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: new Int16Array(0), t16: new Int16Array(0) }, {});

test('Belebung: Schwarm kommt und geht, Greifvögel kreisen über dem Boden, Flugzeuge mit Streifen; DIS und Spielkarte ohne', () => {
  const R = rng(4), c = [0, groundH(0, 0) + 2, 0];
  rw.on = true; cfg.verbund = false;
  try {
    ambInit(c, R);
    let flocks = 0, maxN = 0, minAbove = 1e9, jetsSeen = 0, wasFlock = false;
    for (let k = 0; k < 600*10; k++) {   // 10 min in Schritten von 0,1 s
      ambStep(0.1, c, R);
      if (amb.flock && !wasFlock) flocks++;
      wasFlock = !!amb.flock;
      maxN = Math.max(maxN, amb.birds.length);
      for (const b of amb.birds) minAbove = Math.min(minAbove, b.p[1] - groundH(b.p[0], b.p[2]));
      const J = ambJetDirs(c);
      if (J.length) jetsSeen++;
      for (const j of J) { assert.ok(Math.abs(Math.hypot(...j.a) - 1) < 1e-9 && Math.abs(Math.hypot(...j.b) - 1) < 1e-9); assert.ok(j.alpha >= 0 && j.alpha <= 1); }
    }
    assert.ok(flocks >= 3, 'Schwärme in 10 min: ' + flocks);
    assert.ok(maxN <= AMB.swarm[1] + AMB.raptors && maxN >= AMB.raptors, 'höchstens ein Schwarm zugleich: ' + maxN);
    assert.ok(minAbove >= 5.9, 'alle über dem Boden: ' + minAbove.toFixed(1) + ' m');
    assert.ok(jetsSeen > 3000, 'meist ein Flugzeug am Himmel: ' + jetsSeen + ' von 6000');
    cfg.verbund = true; ambStep(0.1, c, R);
    assert.equal(amb.birds.length, 0, 'DIS-Übung: nichts'); assert.equal(ambJetDirs(c).length, 0);
    cfg.verbund = false; rw.on = false; ambStep(0.1, c, R);
    assert.equal(amb.birds.length, 0, 'Spielkarte: nichts');
  } finally { rw.on = false; cfg.verbund = false; }
});
