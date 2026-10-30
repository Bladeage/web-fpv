/* Menü: Flugmodus, Kamera, Ton, Funke-Zuordnung mit Live-Anzeige. */
import { cfg, game, keys, ptr, saveCfg } from './state.js';
import { respawn } from './physics.js';
import { GP_FN, gp, gpMap } from './gamepad.js';
import { toggleCam } from './render.js';
import { audioInit } from './audio.js';
import { fmtTime } from './format.js';

export const $ = id => document.getElementById(id);
export const menu = $('menu');
export function setMode(m) {
  cfg.mode = m; saveCfg();
  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
}
export function syncMenu() {
  setMode(cfg.mode);
  $('tilt').value = cfg.tilt; $('tiltV').textContent = cfg.tilt + '°';
  $('rate').value = cfg.rate; $('rateV').textContent = cfg.rate + ' °/s';
  $('sound').checked = cfg.sound;
  $('analog').checked = cfg.analog;
  $('propsView').checked = cfg.propsView;
  $('gpPreset').value = cfg.gpPreset;
  syncGpRows();
  $('go').textContent = game.started ? 'Weiterfliegen' : 'Fliegen';
  $('bestTxt').textContent = game.best !== null ? 'Bestzeit: ' + fmtTime(game.best) : '';
}
export function openMenu() { game.paused = true; keys.clear(); ptr.clear(); syncMenu(); menu.hidden = false; $('go').focus({ preventScroll: true }); }
export function resume() { audioInit(); game.paused = false; game.started = true; menu.hidden = true; game.last = performance.now(); }
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('tilt').addEventListener('input', e => { cfg.tilt = +e.target.value; $('tiltV').textContent = cfg.tilt + '°'; saveCfg(); });
$('rate').addEventListener('input', e => { cfg.rate = +e.target.value; $('rateV').textContent = cfg.rate + ' °/s'; saveCfg(); });
$('sound').addEventListener('change', e => { cfg.sound = e.target.checked; saveCfg(); });
$('analog').addEventListener('change', e => { cfg.analog = e.target.checked; saveCfg(); });
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
$('go').addEventListener('click', resume);
$('bMenu').addEventListener('click', () => game.paused ? resume() : openMenu());
$('bReset').addEventListener('click', () => { respawn(); if (game.paused) resume(); });
$('bCam').addEventListener('click', toggleCam);
document.addEventListener('visibilitychange', () => { if (document.hidden && !game.paused) openMenu(); });
