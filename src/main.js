/* =========================================================
   FPV-Simulator Stufe 1
   Reines HTML/CSS/JavaScript, WebGL2, keine Bibliotheken.
   Koordinaten: Y nach oben, Vorwärts der Drohne = -Z.
   Einstieg: verbindet die Module und startet die Hauptschleife.
   ========================================================= */
import { cfg, game, inp } from './state.js';
import { gates } from './world.js';
import { STEP, fx, respawn, step } from './physics.js';
import { updGamepad } from './gamepad.js';
import { audioUpd, beep } from './audio.js';
import { gl, initGL, render, resize } from './render.js';
import { $, menu, resume, show, updGpUI } from './menu.js';
import { updKeyboard, updTouch } from './input.js';
import { drawHud } from './hud.js';
import { setScenario } from './scenario.js';
import { applyDrone } from './drone.js';
import { updSignal } from './signal.js';

fx.beep = beep;
fx.vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
setScenario(cfg.scen); game.scenRun = cfg.scen;
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
    if (game.state === 'fly') {
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
window.__fpv = { get sim() { return game.sim; }, get state() { return game.state; }, set throttle(v) { game.throttle = v; }, inp, cfg, gates, step, respawn, resume };
