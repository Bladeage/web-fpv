/* =========================================================
   FPV-Simulator Stufe 1
   Reines HTML/CSS/JavaScript, WebGL2, keine Bibliotheken.
   Koordinaten: Y nach oben, Vorwärts der Drohne = -Z.
   Einstieg: verbindet die Module und startet die Hauptschleife.
   ========================================================= */
import { cfg, game, inp, say } from './state.js';
import { gates } from './world.js';
import { STEP, fx, respawn, step, rewind, freezeOk, crash, shotHit, respawnDrone } from './physics.js';
import { updGamepad, gpAct } from './gamepad.js';
import { audioUpd, beep, hit, crashSound, popSound } from './audio.js';
import { gl, glLost, initGL, render, resize, toggleCam, cycleVision } from './render.js';
import { $, menu, resume, show, updGpUI, setMode } from './menu.js';
import { updKeyboard, updTouch } from './input.js';
import { drawHud } from './hud.js';
import { missionEnd, setScenario, scen, followLead, chargeOn, chargeDue, chargeNext, chargeBoom, chargeDrones } from './scenario.js';
import { applyDrone } from './drone.js';
import { updSignal } from './signal.js';
import { stepBirds } from './birds.js';
import { ambStep, amb } from './ambient.js';
import { trafficStep, traffic } from './traffic.js';
import { boatsStep, boats } from './boats.js';
import { vehicles } from './vehicles.js';
import { stepPilot } from './pilot.js';
import { mapPagePos } from './mapui.js';
import { rw, rwLoadEmbedded, rwStreamStep } from './realworld.js';
import { RW_STORE } from './rwstore.js';
import { bfPrepare } from './bf.js';
import { dePrepare } from './demap.js';
import { rwThreadInit } from './rwthread.js';
import { vb, vbStep, vbDetonate } from './verbund.js';
import { disBaseInfo } from './distypes.js';
let streamT = 1;   // Takt fürs Nachladen der echten Welt (s)
let tileErrShown = '';   // zuletzt gezeigter Fehler beim Nachladen

fx.beep = beep; fx.hit = hit; fx.crash = crashSound; fx.pop = popSound;
gpAct.cam = toggleCam; gpAct.vision = cycleVision; gpAct.rewind = () => rewind(5); gpAct.mode = m => { setMode(m); say(m === 'acro' ? 'Acro' : 'Angle', 1); };
fx.vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
setScenario(cfg.scen); game.scenRun = cfg.scen;
// Gelände der echten Welt im Hintergrund entpacken; war sie zuletzt gewählt, danach dort neu starten
rwLoadEmbedded().then(() => { if (cfg.world === 'real' && rw.ready && !rw.on) { setScenario('real'); respawn(); } });
applyDrone(cfg.drone);
respawn();

/* ---------- Beschuss und Wirkmittel (Prompt 157) ---------- */
// Treffer aus dem DIS-Netz (vb.hits) beschädigen die Drohne. Mit Sprengladung zündet die Drohne bei Kontakt mit einer DIS-Einheit
// (Detonation-PDU mit deren Kennung) oder beim Absturz (Bodentreffer); ohne Sprengladung ist der Zusammenstoß mit einer Einheit
// ein Absturz (Schadmodell an). boomed: einmal je Flug.
let boomed = false;
function combat() {
  if (game.state === 'fly') boomed = false;
  if (!rw.on || !game.started) { vb.hits.length = 0; return; }
  for (const h of vb.hits.splice(0)) shotHit(h.heavy, h.heavy ? 'Abgeschossen' : 'Treffer');
  const s = game.sim, armed = cfg.warhead === 'charge', u = vb.contact;
  if (game.state === 'fly' && u) {
    const name = disBaseInfo(u.base).name;
    if (armed) { vbDetonate(s.p, u, s.v); boomed = true; crash('Sprengladung gezündet: ' + name + ' getroffen'); }
    else if (cfg.dmg !== 'off' && Math.hypot(...s.v) > 2) crash('An ' + name + ' geprallt');
  }
  if (armed && !boomed && game.state === 'crashed') { vbDetonate(s.p, null, s.v); boomed = true; }
}
// Wirkmittel im Taktischen Flug (Prompt 196): Absturz zündet die Ladung (Explosion), nach kurzer Zeit kommt eine neue Drohne
let chargeSeen = 0;
function chargeStep() {
  if (!chargeOn()) return;
  const s = game.sim;
  if (game.state === 'crashed' && chargeSeen !== s.crashT) { chargeSeen = s.crashT; if (!/^Wirkmittel/.test(s.crashMsg || '')) chargeBoom(s.p); }
  if (chargeDue()) { game.state = 'fly'; respawnDrone(true); chargeNext(); say('Neue Drohne ' + chargeDrones() + ': nächstes Ziel suchen', 2); }
}

/* ---------- Hauptschleife ---------- */
let meshLaid = -1;   // Gebiet (rw.ver), für das die Aufstellung schon auf dem Mesh steht
game.last = performance.now();
let acc = 0;
function frame(now) {
  let dt = Math.min((now - game.last)/1000, 0.1);
  game.last = now;
  updGamepad();
  if (!menu.hidden) updGpUI();
  if (!game.paused) {
    updKeyboard(dt);
    updTouch();
    updSignal(dt);
    stepBirds(dt, game.sim.p);
    ambStep(dt, game.sim.p);
    { const q = game.sim.q, fx = -2*(q[0]*q[2] + q[3]*q[1]), fz = -(1 - 2*(q[0]*q[0] + q[1]*q[1])), fl = Math.hypot(fx, fz);   // Blickrichtung (-z der Drohne) für den Verkehr
      if (scen.id === 'hunt2' || scen.id === 'follow') traffic.cars.length = 0;   // Jagd und Verfolgung: kein Zufallsverkehr (Verwechslung mit den Zielen)
      else trafficStep(dt, game.sim.p, fl > 0.1 ? [fx/fl, fz/fl] : null); }
    boatsStep(dt, game.sim.p);
    // Foto 3D (Prompt 196): kommt das 3D-Mesh am Start erst nach dem Start an, Aufstellung einmal je Gebiet neu auf dem Mesh,
    // solange die Drohne noch am Startplatz steht (Ringe, Plätze und Ziele sonst nach LoD2 und Geländemodell)
    if (rw.meshPhys && meshLaid !== rw.ver && game.state === 'fly' && game.sim.grounded && Math.hypot(game.sim.p[0] - game.home[0], game.sim.p[2] - game.home[1]) < 2) {
      meshLaid = rw.ver; respawn(); say('Foto 3D: Ziele und Plätze auf das 3D-Mesh gestellt', 2);
    }
    // Echte Welt (L5b): etwa jede Sekunde prüfen, ob eine Kachel nachzuladen oder zu entladen ist
    if (rw.on && (streamT -= dt) <= 0) {
      streamT = 1; rw.stream = cfg.rwStream !== false;
      const n0 = rw.tiles.size;
      rwStreamStep(game.sim.p[0], game.sim.p[2], RW_STORE).then(() => {
        if (rw.tiles.size > n0) say('Umgebung nachgeladen: ' + rw.tiles.size + (rw.tiles.size === 1 ? ' Kachel' : ' Kacheln'), 1.2);
        // Fehler beim Nachladen einmal zeigen (gleicher Text nicht noch einmal; Prüfbericht Nr. 5)
        if (rw.tileErr && rw.tileErr !== tileErrShown) say('Nachladen gestört: ' + rw.tileErr + '. Neuer Versuch in 60 s.', 3);
        tileErrShown = rw.tileErr;
      });
    }
    stepPilot(dt, game.sim.p);
    if (game.frozen && (!freezeOk() || game.state !== 'fly')) game.frozen = false;   // Spielstil gewechselt: wieder frei
    if (game.state === 'fly' && !game.frozen && !glLost.on) {   // ohne Grafik nicht blind weiterfliegen
      acc += dt;
      while (acc >= STEP) {
        step(STEP); acc -= STEP;
        if (game.state !== 'fly') { acc = 0; break; }
      }
    }
  }
  // DIS-Modus: Verbindung halten, solange er gewählt ist (auch im Menü: Brücke und Einheiten der Übung anzeigen); die eigene
  // Drohne nur im Flug der echten Welt senden, auch in der Pause (die Brücke hält den Herzschlag)
  const disOn = !!cfg.verbund;   // DIS-Übung ist immer echte Welt (Flugart im Hauptmenü)
  vbStep(now/1000, game.sim, game.state === 'crashed' ? 'crashed' : game.frozen ? 'frozen' : 'fly', disOn, disOn && game.started && rw.on);
  combat();
  chargeStep();
  if (missionEnd()) fx.beep(1320, 0.3);   // Mission erfüllt: steht still, Anzeige mit Zeit und Versuchen
  render(dt);
  drawHud();
  audioUpd();
  requestAnimationFrame(frame);
}

// Gepackt eingebettete Daten entpacken (Betaflight, Deutschlandkarte), im Hintergrund; dauert Millisekunden
bfPrepare(); dePrepare();
rwThreadInit();   // Hintergrund-Thread für die echte Welt (Prüfbericht Etappe 5); ohne ihn rechnet das Hauptprogramm
resize();
show('main');
if (!gl) {
  $('glErr').hidden = false; $('go').disabled = true; $('bStart').disabled = true;
} else {
  try { initGL(); requestAnimationFrame(frame); }
  catch (e) { $('glErr').hidden = false; $('glErr').textContent = 'Grafikfehler: ' + e.message; $('go').disabled = true; $('bStart').disabled = true; }
}
// Testzugang für automatische Prüfungen
window.__fpv = { rw, amb, traffic, boats, vehicles, followLead, mapPagePos, get sim() { return game.sim; }, get state() { return game.state; }, get armed() { return game.armed; }, set throttle(v) { game.throttle = v; }, inp, cfg, gates, step, respawn, resume };
