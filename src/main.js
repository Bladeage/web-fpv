/* =========================================================
   FPV-Simulator Stufe 1
   Reines HTML/CSS/JavaScript, WebGL2, keine Bibliotheken.
   Koordinaten: Y nach oben, Vorwärts der Drohne = -Z.
   Einstieg: verbindet die Module und startet die Hauptschleife.
   ========================================================= */
import { cfg, game, inp, say } from './state.js';
import { gates } from './world.js';
import { STEP, fx, respawn, step, rewind, freezeOk } from './physics.js';
import { updGamepad, gpAct } from './gamepad.js';
import { audioUpd, beep, hit, crashSound, popSound } from './audio.js';
import { gl, glLost, initGL, render, resize, toggleCam, cycleVision } from './render.js';
import { $, menu, resume, show, updGpUI, setMode } from './menu.js';
import { updKeyboard, updTouch } from './input.js';
import { drawHud } from './hud.js';
import { setScenario } from './scenario.js';
import { applyDrone } from './drone.js';
import { updSignal } from './signal.js';
import { stepBirds } from './birds.js';
import { stepPilot } from './pilot.js';
import { mapPagePos } from './mapui.js';
import { rw, rwLoadEmbedded, rwStreamStep } from './realworld.js';
import { RW_STORE } from './rwstore.js';
let streamT = 1;   // Takt fürs Nachladen der echten Welt (s)
let tileErrShown = '';   // zuletzt gezeigter Fehler beim Nachladen

fx.beep = beep; fx.hit = hit; fx.crash = crashSound; fx.pop = popSound;
gpAct.cam = toggleCam; gpAct.vision = cycleVision; gpAct.rewind = () => rewind(5); gpAct.mode = m => { setMode(m); say(m === 'acro' ? 'Acro' : 'Angle', 1); };
fx.vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
setScenario(cfg.scen); game.scenRun = cfg.scen;
// Gelände der echten Welt im Hintergrund entpacken; war sie zuletzt gewählt, danach dort neu starten
rwLoadEmbedded().then(() => { if (cfg.scen === 'real' && rw.ready && !rw.on) { setScenario('real'); respawn(); } });
applyDrone(cfg.drone);
respawn();

/* ---------- Hauptschleife ---------- */
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
  render(dt);
  drawHud();
  audioUpd();
  requestAnimationFrame(frame);
}

resize();
show('main');
if (!gl) {
  $('glErr').hidden = false; $('go').disabled = true; $('bStart').disabled = true;
} else {
  try { initGL(); requestAnimationFrame(frame); }
  catch (e) { $('glErr').hidden = false; $('glErr').textContent = 'Grafikfehler: ' + e.message; $('go').disabled = true; $('bStart').disabled = true; }
}
// Testzugang für automatische Prüfungen
window.__fpv = { mapPagePos, get sim() { return game.sim; }, get state() { return game.state; }, get armed() { return game.armed; }, set throttle(v) { game.throttle = v; }, inp, cfg, gates, step, respawn, resume };
