/* Eingabe: Tastatur (Mode 2) und Touch mit zwei Sticks.
   Ein verbundenes Gamepad überschreibt beides (siehe updTouch). */
import { clamp } from './math.js';
import { cfg, game, kb, tch, inp, keys, ptr, say, saveCfg, keyOf, keyFns, keyLearn } from './state.js';
import { respawn, toggleArm, rewind, toggleFreeze } from './physics.js';
import { gp } from './gamepad.js';
import { hud, vw, vh, toggleCam, cycleVision } from './render.js';
import { toggleMenu, setMode } from './menu.js';

/* ---------- Eingabe: Tastatur ---------- */
addEventListener('keydown', e => {
  if (keyLearn.fn) return;   // Menü lernt gerade eine Taste (menu.js)
  if (e.code === 'Escape' || e.code === 'KeyP') { toggleMenu(); e.preventDefault(); return; }
  if (game.paused) return;
  const fns = keyFns(e.code);
  if (fns.length || e.code === 'Space' || e.code.startsWith('Arrow') || e.code.startsWith('Page')) e.preventDefault();   // Seite nicht scrollen
  if (e.repeat) return;
  keys.add(e.code);
  for (const fn of fns) {
    if (fn === 'reset') respawn();
    if (fn === 'cam') toggleCam();
    if (fn === 'vision') cycleVision();
    if (fn === 'mode') { setMode(cfg.mode === 'acro' ? 'angle' : 'acro'); say(cfg.mode === 'acro' ? 'Acro' : 'Angle', 1); }
    if (fn === 'arm') toggleArm();
    if (fn === 'rewind') rewind(5);
    if (fn === 'freeze') toggleFreeze();
    if (fn === 'tiltUp' || fn === 'tiltDown') {
      cfg.tilt = clamp(cfg.tilt + (fn === 'tiltUp' ? 5 : -5), 0, 60); saveCfg(); say('Kamerawinkel ' + cfg.tilt + '°', 1);
    }
  }
  // Blickfeld mit + und - (e.key, damit es auf jeder Tastaturbelegung passt), fest belegt
  if (!fns.length && (e.key === '+' || e.key === '-')) {
    cfg.fov = clamp((cfg.fov || 110) + (e.key === '+' ? 5 : -5), 70, 150); saveCfg(); say('Blickfeld ' + cfg.fov + '°', 1);
  }
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

export function updKeyboard(dt) {
  const ax = (p, n) => (keys.has(keyOf(p)) ? 1 : 0) - (keys.has(keyOf(n)) ? 1 : 0);   // Funktionen, Tasten aus der Belegung
  const ramp = (cur, t) => { const m = dt*(t === 0 ? 6 : 3.5); return cur + clamp(t - cur, -m, m); };
  kb.pitch = ramp(kb.pitch, ax('pitchF', 'pitchB'));
  kb.roll  = ramp(kb.roll,  ax('rollR', 'rollL'));
  kb.yaw   = ramp(kb.yaw,   ax('yawR', 'yawL'));
  const th = ax('thrUp', 'thrDown');
  if (th) game.throttle = clamp(game.throttle + th*dt*0.7, 0, 1);
}

/* ---------- Eingabe: Touch ---------- */
export let touchUI = false;
export const stickR = () => clamp(Math.min(vw, vh)*0.16, 55, 95);

hud.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' || game.paused) return;
  touchUI = true;
  if (game.state === 'done') { respawn(); return; }   // Mission erfüllt: Tippen startet eine neue
  if (game.state === 'crashed') { if (performance.now() - game.sim.crashT > 400) respawn(); return; }
  try { hud.setPointerCapture(e.pointerId); } catch (err) {}
  const side = e.clientX < vw/2 ? 'L' : 'R';
  for (const p of ptr.values()) if (p.side === side) return;
  ptr.set(e.pointerId, { side, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, thr0: game.throttle });
});
hud.addEventListener('pointermove', e => {
  const p = ptr.get(e.pointerId);
  if (p) { p.x = e.clientX; p.y = e.clientY; }
});
function endPtr(e) { ptr.delete(e.pointerId); }
hud.addEventListener('pointerup', endPtr);
hud.addEventListener('pointercancel', endPtr);
hud.addEventListener('contextmenu', e => e.preventDefault());

export function updTouch() {
  tch.pitch = tch.roll = tch.yaw = 0;
  const R = stickR();
  for (const p of ptr.values()) {
    const dx = (p.x - p.x0)/R, dy = (p.y - p.y0)/R;
    if (p.side === 'L') { game.throttle = clamp(p.thr0 - dy/2, 0, 1); tch.yaw = clamp(dx, -1, 1); }
    else { tch.roll = clamp(dx, -1, 1); tch.pitch = clamp(-dy, -1, 1); }
  }
  inp.pitch = clamp(kb.pitch + tch.pitch, -1, 1);
  inp.roll  = clamp(kb.roll + tch.roll, -1, 1);
  inp.yaw   = clamp(kb.yaw + tch.yaw, -1, 1);
  if (gp.connected) { inp.pitch = gp.pitch; inp.roll = gp.roll; inp.yaw = gp.yaw; game.throttle = gp.throttle; }
}
