// Etappe F1 (Feinschliff): Fehlermeldungen in einfachem Deutsch, nächster Schritt des Auftrags, Einführung nur beim ersten Start.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game } from '../src/state.js';
import { buildWorld } from '../src/world.js';
import { respawn } from '../src/physics.js';
import { setScenario, scenHint } from '../src/scenario.js';
import { loadErrText } from '../src/format.js';

buildWorld();
after(() => { cfg.flight = 'course'; cfg.diff = 'mid'; setScenario('gates'); });

test('Fehlermeldung beim Laden: Ursache, was zu tun ist, technische Meldung dahinter', () => {
  const a = loadErrText('Keine Verbindung zu www.wcs.nrw.de (offline oder Zugriff gesperrt)');
  assert.match(a, /^Der Dienst www\.wcs\.nrw\.de ist nicht erreichbar\. Prüfe deine Internetverbindung/); assert.match(a, /\(Technisch: Keine Verbindung zu/);
  assert.match(loadErrText('geoportal.saarland.de antwortet 503'), /^Der Dienst geoportal\.saarland\.de meldet einen Fehler\. Später/);
  assert.match(loadErrText('www.wcs.nrw.de antwortet nicht (20 s ohne Daten)'), /antwortet zu langsam/);
  assert.match(loadErrText('Keine gültigen Höhen im Gebiet'), /keine Höhen.*weiter innen/);
  assert.equal(loadErrText('Abgebrochen'), 'Laden abgebrochen.');
  assert.match(loadErrText('irgendwas'), /^Der Ort konnte nicht geladen werden\..*\(Technisch: irgendwas\)$/);
});

test('Nächster Schritt je Auftrag; Jagd mit Ladung nennt erst die 10 m', () => {
  cfg.flight = 'course'; setScenario('gates'); respawn(); assert.match(scenHint(), /Tor/);
  setScenario('deliver'); respawn(); assert.match(scenHint(), /orangen Platz/);
  setScenario('free'); respawn(); assert.equal(scenHint(), null);
  cfg.flight = 'tactical'; cfg.diff = 'mid'; setScenario('hunt2'); respawn(); assert.match(scenHint(), /über 10 m/);
  game.sim.armed = true; assert.match(scenHint(), /zündet beim Aufprall/);
  setScenario('recon'); respawn(); assert.match(scenHint(), /Fadenkreuz/);
});

test('Einführung: ohne gespeicherte Einstellungen an', () => { assert.equal(cfg.intro, true); });
