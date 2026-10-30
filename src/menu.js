/* Menü in Schritten: Hauptmenü -> Modus -> Parcours -> Drohne -> Start.
   Einstellungen (Kamera, Ton, Funke) sind über Esc oder ☰ von überall erreichbar. */
import { cfg, game, keys, ptr, saveCfg } from './state.js';
import { respawn } from './physics.js';
import { GP_FN, gp, gpMap } from './gamepad.js';
import { toggleCam } from './render.js';
import { audioInit } from './audio.js';
import { fmtTime } from './format.js';
import { SCENARIOS, DIFF, setScenario } from './scenario.js';
import { DRONES, applyDrone, presetMass } from './drone.js';
import { PHYS } from './physics.js';
import { OSD_ITEMS, osdOn } from './osd.js';

export const $ = id => document.getElementById(id);
export const menu = $('menu');
let screen = 'main';
let from = null;   // Bildschirm vor den Einstellungen; null = aus dem Flug geöffnet

const press = (sel, test) => document.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', String(test(b))));
function addChoice(box, label, info, onClick) {
  const b = document.createElement('button'), t = document.createElement('b'), s = document.createElement('span');
  t.textContent = label; s.textContent = info; b.append(t, s);
  b.addEventListener('click', onClick); box.appendChild(b);
  return b;
}
const droneVal = k => cfg.drone[k] ?? (DRONES[cfg.drone.preset] || DRONES['5'])[k];

export function setMode(m) {
  cfg.mode = m; saveCfg();
  press('#modeSeg button', b => b.dataset.mode === m);
}
export function syncMenu() {
  setMode(cfg.mode);
  const sc = SCENARIOS.find(x => x.id === cfg.scen);
  press('#scenList button', b => b.dataset.id === cfg.scen);
  $('courseInfo').textContent = sc.name + ': ' + sc.info;
  $('courseOpts').hidden = cfg.scen === 'gates' || cfg.scen === 'free';
  press('#diffSeg button', b => b.dataset.id === cfg.diff);
  $('huntOpts').hidden = cfg.scen !== 'hunt';
  $('huntX').value = cfg.huntX; $('huntXV').textContent = cfg.huntX + ' von 6';
  press('#droneSeg button', b => b.dataset.id === cfg.drone.preset);
  $('twr').value = droneVal('twr'); $('twrV').textContent = (+droneVal('twr')).toFixed(1);
  const pm = presetMass(DRONES[cfg.drone.preset] || DRONES['5']), mass = cfg.drone.mass ?? pm;
  $('mass').value = Math.round(mass*1000); $('massV').textContent = Math.round(mass*1000) + ' g';
  applyDrone(cfg.drone);   // nur zur Anzeige der Trägheit; beim Start wird ohnehin neu angewendet
  $('droneInfo').textContent = 'Trägheit Nicken/Gieren/Rollen: ' + PHYS.I.map(x => (x*1e4).toFixed(1)).join(' / ') + ' kg·cm²';
  $('cap').value = droneVal('cap'); $('capV').textContent = droneVal('cap') + ' mAh';
  press('#cellSeg button', b => +b.dataset.cells === droneVal('cells'));
  $('batWarn').value = cfg.batWarn; $('batWarnV').textContent = cfg.batWarn.toFixed(2) + ' V';
  $('batMin').value = cfg.batMin; $('batMinV').textContent = cfg.batMin.toFixed(2) + ' V';
  $('tilt').value = cfg.tilt; $('tiltV').textContent = cfg.tilt + '°';
  $('rate').value = cfg.rate; $('rateV').textContent = cfg.rate + ' °/s';
  $('sound').checked = cfg.sound;
  press('#videoSeg button', b => b.dataset.video === cfg.video);
  press('#gfxSeg button', b => b.dataset.gfx === cfg.gfx);
  document.querySelectorAll('#osdList input').forEach(el => { el.checked = osdOn(cfg.osd, el.dataset.osd); });
  $('propsView').checked = cfg.propsView;
  $('gpPreset').value = cfg.gpPreset;
  syncGpRows();
  $('bResume').hidden = !game.started;
  $('bBack').textContent = from === null && game.started ? 'Weiterfliegen' : 'Zurück';
  const cur = SCENARIOS.find(x => x.id === (game.started ? game.scenRun : cfg.scen)) || sc;
  $('bestTxt').textContent = game.best !== null ? 'Bestzeit ' + cur.name + ': ' + fmtTime(game.best) : '';
}
export function show(name) {
  screen = name;
  document.querySelectorAll('#menu section').forEach(s => { s.hidden = s.dataset.screen !== name; });
  syncMenu();
  menu.scrollTop = 0;
  const f = document.querySelector(`#menu section[data-screen="${name}"] .primary:not([hidden])`);
  if (f) f.focus({ preventScroll: true });
}
export function openMenu(name = 'settings') {
  if (menu.hidden) from = null; else if (name === 'settings' && screen !== 'settings') from = screen;
  game.paused = true; keys.clear(); ptr.clear(); menu.hidden = false; show(name);
}
export function resume() { audioInit(); game.paused = false; game.started = true; menu.hidden = true; game.last = performance.now(); }
function back() { if (from === null && game.started) resume(); else show(from || 'main'); }
// Esc, P und ☰: Einstellungen öffnen oder wieder schließen
export function toggleMenu() { if (!menu.hidden && screen === 'settings') back(); else openMenu('settings'); }
function start() {
  setScenario(cfg.scen); applyDrone(cfg.drone); saveCfg();
  game.scenRun = cfg.scen;
  respawn(); resume();
}

for (const x of SCENARIOS) addChoice($('scenList'), x.name, x.info, () => { cfg.scen = x.id; saveCfg(); syncMenu(); }).dataset.id = x.id;
for (const [id, d] of Object.entries(DIFF)) addChoice($('diffSeg'), d.name, '', () => { cfg.diff = id; saveCfg(); syncMenu(); }).dataset.id = id;
for (const [id, d] of Object.entries(DRONES)) addChoice($('droneSeg'), d.name, d.info, () => { cfg.drone = { preset: id }; saveCfg(); syncMenu(); }).dataset.id = id;
document.querySelectorAll('#cellSeg button').forEach(b => b.addEventListener('click', () => { cfg.drone.cells = +b.dataset.cells; saveCfg(); syncMenu(); }));
document.querySelectorAll('#modeSeg button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('twr').addEventListener('input', e => { cfg.drone.twr = +e.target.value; $('twrV').textContent = cfg.drone.twr.toFixed(1); saveCfg(); });
$('mass').addEventListener('input', e => { cfg.drone.mass = +e.target.value/1000; saveCfg(); syncMenu(); });
$('cap').addEventListener('input', e => { cfg.drone.cap = +e.target.value; $('capV').textContent = cfg.drone.cap + ' mAh'; saveCfg(); });
$('huntX').addEventListener('input', e => { cfg.huntX = +e.target.value; $('huntXV').textContent = cfg.huntX + ' von 6'; saveCfg(); });
$('batWarn').addEventListener('input', e => { cfg.batWarn = +e.target.value; $('batWarnV').textContent = cfg.batWarn.toFixed(2) + ' V'; saveCfg(); });
$('batMin').addEventListener('input', e => { cfg.batMin = +e.target.value; $('batMinV').textContent = cfg.batMin.toFixed(2) + ' V'; saveCfg(); });
$('tilt').addEventListener('input', e => { cfg.tilt = +e.target.value; $('tiltV').textContent = cfg.tilt + '°'; saveCfg(); });
$('rate').addEventListener('input', e => { cfg.rate = +e.target.value; $('rateV').textContent = cfg.rate + ' °/s'; saveCfg(); });
$('sound').addEventListener('change', e => { cfg.sound = e.target.checked; saveCfg(); });
document.querySelectorAll('#gfxSeg button').forEach(b => b.addEventListener('click', () => { cfg.gfx = b.dataset.gfx; saveCfg(); syncMenu(); }));
document.querySelectorAll('#videoSeg button').forEach(b => b.addEventListener('click', () => { cfg.video = b.dataset.video; saveCfg(); syncMenu(); }));
for (const [id, name] of OSD_ITEMS) {
  const lab = document.createElement('label'), cb = document.createElement('input');
  lab.className = 'check'; cb.type = 'checkbox'; cb.dataset.osd = id;
  cb.addEventListener('change', () => { cfg.osd[id] = cb.checked; saveCfg(); });
  lab.append(cb, ' ' + name); $('osdList').appendChild(lab);
}
$('propsView').addEventListener('change', e => { cfg.propsView = e.target.checked; saveCfg(); });

// Funke-Zuordnung im Menü
function buildGpRows() {
  const box = $('gpRows'); box.textContent = '';
  for (const [fn, label] of GP_FN) {
    const row = document.createElement('div'); row.className = 'gprow';
    const lab = document.createElement('span'); lab.textContent = label;
    const sel = document.createElement('select'); sel.dataset.fn = fn; sel.setAttribute('aria-label', 'Achse für ' + label);
    for (let i = 0; i < 8; i++) { const o = document.createElement('option'); o.value = i; o.textContent = 'Achse ' + i; sel.appendChild(o); }
    const inv = document.createElement('label');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.inv = fn;
    inv.appendChild(cb); inv.appendChild(document.createTextNode('umkehren'));
    const bar = document.createElement('i'); bar.className = 'gpbar'; bar.dataset.bar = fn; bar.appendChild(document.createElement('b'));
    row.append(lab, sel, inv, bar); box.appendChild(row);
    sel.addEventListener('change', gpFromUI); cb.addEventListener('change', gpFromUI);
  }
}
function syncGpRows() {
  const m = gpMap();
  document.querySelectorAll('#gpRows select').forEach(el => { el.value = m[el.dataset.fn][0]; });
  document.querySelectorAll('#gpRows input[type=checkbox]').forEach(el => { el.checked = m[el.dataset.inv][1]; });
}
function gpFromUI() {
  const m = {};
  for (const [fn] of GP_FN) m[fn] = [+document.querySelector(`#gpRows select[data-fn="${fn}"]`).value,
                                     document.querySelector(`#gpRows input[data-inv="${fn}"]`).checked];
  cfg.gpMap = m; cfg.gpPreset = 'custom'; $('gpPreset').value = 'custom'; saveCfg();
}
$('gpPreset').addEventListener('change', e => {
  const prev = JSON.parse(JSON.stringify(gpMap()));
  cfg.gpPreset = e.target.value;
  if (cfg.gpPreset === 'custom' && !cfg.gpMap) cfg.gpMap = prev;
  syncGpRows(); saveCfg();
});
export function updGpUI() {
  const st = $('gpStat');
  if (!gp.connected) {
    st.textContent = 'Kein Gerät erkannt. Funke oder Gamepad per USB anstecken und einen Knüppel bewegen.';
  } else {
    st.textContent = 'Erkannt: ' + gp.id;
    const sm = document.createElement('small');
    sm.textContent = 'Rohwerte: ' + gp.axes.slice(0, 8).map((v, i) => i + ':' + (v >= 0 ? '+' : '') + v.toFixed(2)).join(' ');
    st.appendChild(sm);
  }
  for (const [fn] of GP_FN) {
    const b = document.querySelector(`#gpRows [data-bar="${fn}"] b`);
    if (!b) continue;
    const v = !gp.connected ? 0 : fn === 'throttle' ? gp.throttle*2 - 1 : gp[fn];
    b.style.left = ((v + 1)*50) + '%';
  }
}
buildGpRows();
document.querySelectorAll('#menu [data-go]').forEach(b => b.addEventListener('click', () => show(b.dataset.go)));
$('go').addEventListener('click', () => show('mode'));
$('bResume').addEventListener('click', resume);
$('bStart').addEventListener('click', start);
$('bBack').addEventListener('click', back);
$('bMenu').addEventListener('click', toggleMenu);
$('bReset').addEventListener('click', () => { respawn(); if (game.paused) resume(); });
$('bCam').addEventListener('click', toggleCam);
document.addEventListener('visibilitychange', () => { if (document.hidden && !game.paused) openMenu('settings'); });
