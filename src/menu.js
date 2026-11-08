/* Menü in Schritten: Hauptmenü -> Modus -> Parcours -> Drohne -> Start.
   Einstellungen (Kamera, Ton, Steuerung) sind über Esc oder ☰ von überall erreichbar. */
import { cfg, game, keys, ptr, saveCfg, KEY_FN, keyOf, keyName, setKey, keyLearn, VERSION, say } from './state.js';
import { respawn } from './physics.js';
import { GP_FN, GP_SW, gp, gpMap } from './gamepad.js';
import { toggleCam } from './render.js';
import { audioInit, audioPause } from './audio.js';
import { fmtTime, parseLatLon } from './format.js';
import { clamp } from './math.js';
import { bfRates } from './bf.js';
import { rw, rwLoadEmbedded, rwLoadLive, rwFlat, rwPlan } from './realworld.js';
import { SCENARIOS, DIFF, setScenario } from './scenario.js';
import { DRONES, applyDrone, droneSpec, DRONE_LIMITS } from './drone.js';
import { PHYS, DMG, hoverThrottle } from './physics.js';
import { OSD_ITEMS, OSD_STYLES, osdOn } from './osd.js';
import { mapInit, mapOpen, mapDraw } from './mapui.js';
import { srcInit, srcOpen } from './srcui.js';
import { RW_STORE, storeAll } from './rwstore.js';
import { VB, vb, vbBridge, vbCenter, vbSet, VB_BRUECKE } from './verbund.js';
let rwBusy = null;   // echte Welt: laufendes Laden (AbortController)
// Menüführung (Etappe T1, docs/plan-taktischer-flug.md): Flugart im Hauptmenü (cfg.flight: Parcours oder Taktisch), auf Schritt 1
// die Welt (cfg.world: Spielkarte oder echte Welt) und der Modus. Der Modus heißt intern weiter cfg.scen (Parcours) bzw. cfg.tac
// (Taktisch). In der echten Welt gibt es bis zu den Etappen T2 und T3 nur den Freiflug (Szenario 'real').
// Taktische Modi: bis Etappe T4 verhalten sie sich wie die Jagd-Modi; „Gemischt“ und Ziele in der echten Welt folgen (T5, T6).
export const TAC = [
  { id: 'recon', name: 'Aufklärung', scen: 'free', worlds: ['map', 'real'], info: 'Frei fliegen und beobachten. Mit Wirkmittel zündet die Drohne bei Kontakt.' },
  { id: 'ground', name: 'Ziele Boden', scen: 'hunt2', worlds: ['map'], info: 'Fahrzeuge auf der Spielkarte. Die Wirkung der Wirkmittel auf Fahrzeuge folgt mit der nächsten Etappe.' },
  { id: 'air', name: 'Ziele Luft', scen: 'hunt3', worlds: ['map'], info: 'Fluggeräte über der Spielkarte. Die Wirkung der Wirkmittel folgt.' },
  { id: 'mix', name: 'Gemischt', scen: null, worlds: [], info: 'Ziele am Boden und in der Luft. Folgt.' }
];
const COURSE_REAL = ['free', 'rings'];   // Parcours in der echten Welt (Etappe T2: Ringe; wächst mit T3)
const isReal = () => cfg.world === 'real';
// Szenario, das beim Start läuft
export function flightScen() {
  if (isReal()) return cfg.flight !== 'tactical' && COURSE_REAL.includes(cfg.scen) && cfg.scen !== 'free' ? cfg.scen : 'real';
  if (cfg.flight === 'tactical') { const t = TAC.find(x => x.id === cfg.tac) || TAC[0]; return t.scen || 'free'; }
  return cfg.scen === 'real' || cfg.scen === 'vbs' ? 'gates' : cfg.scen;
}

export const $ = id => document.getElementById(id);
export const menu = $('menu');
let screen = 'main';
let from = null;   // Bildschirm vor den Einstellungen; null = aus dem Flug geöffnet

const press = (sel, test) => document.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', String(test(b))));
function addChoice(box, label, info, onClick) {
  const b = document.createElement('button'), t = document.createElement('b'), s = document.createElement('span');
  t.textContent = label; s.textContent = info; b.append(t, s);
  if (!info) s.remove();
  b.addEventListener('click', onClick); box.appendChild(b);
  return b;
}
/* ---------- Symbole (SVG, im Code gezeichnet) ---------- */
const SVGNS = 'http://www.w3.org/2000/svg';
function icon(w, h, inner) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', `0 0 ${w} ${h}`); s.setAttribute('width', w); s.setAttribute('height', h);
  s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'ico'); s.innerHTML = inner;
  return s;
}
// Drehzahl als Farbe: 18000 U/min und weniger blau, 42000 und mehr rot
const rpmColor = rpm => `hsl(${Math.round(220*(1 - Math.min(1, Math.max(0, (rpm - 18000)/24000))))},85%,52%)`;
// Quad-Symbol: Größe nach Vorlage, Propeller in der Drehzahlfarbe
function droneIcon(p) {
  const f = 0.42 + 0.58*Math.min(1, p.size/1.35), c = 20, a = 13*f, r = 3 + 5*f, col = rpmColor(p.motor.rpm);
  let g = `<g stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="${c-a}" y1="${c-a}" x2="${c+a}" y2="${c+a}"/><line x1="${c+a}" y1="${c-a}" x2="${c-a}" y2="${c+a}"/></g>`;
  for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g += `<circle cx="${c+x*a}" cy="${c+y*a}" r="${r}" fill="${col}" fill-opacity=".45" stroke="${col}" stroke-width="1.5"/>`;
  g += `<rect x="${c-3.5*f-1}" y="${c-5*f-1}" width="${7*f+2}" height="${10*f+2}" rx="1.5" fill="currentColor"/>`;
  return icon(40, 40, g);
}
// Akku-Symbol: Breite nach Kapazität, Segmente nach Zellen
function batteryIcon(cap, cells) {
  const w = Math.round(12 + 26*Math.pow(Math.min(1, Math.max(0, (cap - 200)/4800)), 0.6)), h = 14;
  let g = `<rect x="1" y="1" width="${w}" height="${h-2}" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="${w+1}" y="${h/2-2.5}" width="2.5" height="5" rx="1" fill="currentColor"/>`;
  const n = Math.max(1, cells), sw = (w - 4)/n;
  for (let i = 0; i < n; i++) g += `<rect x="${3 + i*sw + 0.6}" y="3" width="${sw - 1.2}" height="${h-6}" rx="1" fill="#3cb371"/>`;
  return icon(w + 5, h, g);
}
function setCapIcon() { const sp = droneSpec(cfg.drone), b = $('capIco'); b.textContent = ''; b.appendChild(batteryIcon(sp.cap, sp.cells)); }

// Spielstil-Karten: setzen mehrere Einstellungen auf einmal. Weicht eine ab, gilt „Eigene“.
const STYLES = {
  learn:  { name: 'Lernen',      info: 'Angle, kein Schaden, Akku unendlich, Flugspur.', set: { mode: 'angle', dmg: 'off', infBat: true, trail: true, ghost: false, needArm: false } },
  normal: { name: 'Normal',      info: 'Angle, kein Schaden, Akku normal.', set: { mode: 'angle', dmg: 'off', infBat: false, trail: false, ghost: false, needArm: false } },
  real:   { name: 'Realistisch', info: 'Acro, Schaden realistisch, Akku normal, scharf schalten nötig.', set: { mode: 'acro', dmg: 'real', infBat: false, trail: false, ghost: false, needArm: true } },
  god:    { name: 'Gott-Modus',  info: 'Durch Hindernisse fliegen, kein Schaden, Akku unendlich, Flugspur.', set: { mode: 'angle', dmg: 'off', infBat: true, trail: true, ghost: true, needArm: false } }
};
const currentStyle = () => Object.keys(STYLES).find(k => Object.entries(STYLES[k].set).every(([key, v]) => cfg[key] === v)) || null;


export function setMode(m) {
  cfg.mode = m; saveCfg();
  press('#modeSeg button', b => b.dataset.mode === m);
  syncStyle();
}
function syncStyle() {
  const st = currentStyle();
  press('#styleSeg button', b => b.dataset.id === st);
  $('styleHint').textContent = st ? 'Spielstil ' + STYLES[st].name + ': ' + STYLES[st].info : 'Spielstil: eigene Einstellungen.';
}
export function syncMenu() {
  press('#fcSeg button', b => b.dataset.fc === (cfg.fc || 'own'));
  setMode(cfg.mode);
  // Schritt 1: Titel nach Flugart, Welt-Schalter, Modus-Liste (nach Flugart und Welt gefiltert), Startort in der echten Welt.
  // DIS-Übung (experimentell) = Startort in der echten Welt (cfg.verbund), in beiden Flugarten.
  const tac = cfg.flight === 'tactical', real = isReal(), dis = real && !!cfg.verbund, run = flightScen(), sc = SCENARIOS.find(x => x.id === run);
  $('modeTitle').textContent = tac ? 'Taktischer Flug' : 'Parcours';
  document.querySelectorAll('#modeTabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.world === cfg.world)));
  buildModeList();
  const t = TAC.find(x => x.id === cfg.tac) || TAC[0];
  $('courseInfo').textContent = dis ? DIS_INFO : tac ? t.info : real && run === 'real' ? 'Freiflug in echtem Gelände. Weitere Modi in der echten Welt folgen.' : real && run === 'rings' ? 'Zwei Kurse mit je 8 Ringen (orange am Start, blau weiter weg). Es zählt der Kurs, durch dessen ersten Ring du zuerst fliegst.' : sc.info;
  $('modeSpec').hidden = !real;
  $('disOpts').hidden = !dis; syncDis();
  $('droneHint').textContent = (DRONES[cfg.drone.preset] || DRONES['5']).info + ' Propeller: blau = langsam, rot = schnell.';
  $('courseOpts').hidden = run === 'gates' || run === 'free' || run === 'real' || run === 'vbs';
  press('#rwSeg button', b => b.dataset.start === (dis ? 'dis' : cfg.rwSrc === 'live' ? 'live' : 'emb'));
  $('rwLive').hidden = dis || cfg.rwSrc !== 'live';
  if (document.activeElement !== $('rwLL')) $('rwLL').value = cfg.rwLL || '';
  if (!rwBusy) $('rwMsg').textContent = dis && cfg.rwSrc !== 'dis' ? '' : cfg.rwSrc === 'dis' ? 'Start am Ort der Übung: ' + (cfg.disLL || '?') + ', ebene Fläche ohne Kartendaten.'
    : cfg.rwSrc !== 'live' ? 'Monschau ist eingebaut und geht ohne Netz: 1 x 1 km fein, Umgebung bis 5 km.'
    : rw.live && rw.liveAt ? 'Geladen: ' + rw.meta.place + ', ' + rw.meta.buildings + ' Gebäude, ' + rw.meta.trees + ' Bäume'
      + (rw.fromStore ? ', aus dem Speicher.' : rw.stored ? ', gespeichert.' : rw.stored === false ? ', nicht gespeichert: Speicher im Browser voll oder gesperrt (Optionen → Daten).' : '.') + (!rw.water && rw.liveDlm ? ' Ohne Gewässer: Optionen → Daten.' : '')
      + (!rw.far ? ' Ohne Umgebung, kein Nachladen (offline?).' : '')
    : 'Zum Beispiel 50.7753, 6.0839, oder auf der Karte wählen. 15 bis 200 MB, danach gespeichert.';
  rwLock();
  press('#diffSeg button', b => b.dataset.id === cfg.diff);
  $('huntOpts').hidden = run !== 'hunt' && run !== 'hunt2' && run !== 'hunt3';
  const total = run === 'hunt2' ? 7 : run === 'hunt3' ? 6 : 9;
  $('huntX').max = total; cfg.huntX = Math.min(cfg.huntX, total);
  $('huntX').value = cfg.huntX; $('huntXV').textContent = cfg.huntX + ' von ' + total;
  press('#droneSeg button', b => b.dataset.id === cfg.drone.preset);
  // Grenzen der Feinwerte je Vorlage (drone.js): Regler-Bereiche, gesperrte Zellen, wirksame Werte anzeigen
  const sp = droneSpec(cfg.drone);
  $('mass').min = Math.round(sp.massMin*1000); $('mass').max = Math.round(sp.massMax*1000); $('mass').step = sp.massMax < 0.2 ? 1 : 5;
  $('mass').value = Math.round(sp.mass*1000); $('massV').textContent = Math.round(sp.mass*1000) + ' g';
  $('cap').min = Math.round(sp.capMin); $('cap').max = Math.round(sp.capMax); $('cap').step = sp.capMax < 1000 ? 10 : 50;
  $('twr').min = DRONE_LIMITS.twrMin; $('twr').max = DRONE_LIMITS.twrMax;
  document.querySelectorAll('#cellSeg button').forEach(b => { const ok = sp.p.cellsOk.includes(+b.dataset.cells); b.disabled = !ok; b.title = ok ? '' : 'Passt nicht zu dieser Vorlage'; });
  applyDrone(cfg.drone);   // nur zur Anzeige der Trägheit; beim Start wird ohnehin neu angewendet
  $('twr').value = PHYS.twr; $('twrV').textContent = PHYS.twr.toFixed(1);   // berechnet aus Motor und Gewicht
  $('droneInfo').textContent = 'Schub zu Gewicht ' + PHYS.twr.toFixed(1) + ', Schweben bei ' + Math.round(hoverThrottle()*100) + ' % Gas. Trägheit Nicken/Gieren/Rollen: ' + PHYS.I.map(x => (x*1e4).toFixed(1)).join(' / ') + ' kg·cm²';
  $('cap').value = sp.cap; $('capV').textContent = sp.cap + ' mAh'; setCapIcon();
  press('#cellSeg button', b => +b.dataset.cells === sp.cells);
  $('batWarn').value = cfg.batWarn; $('batWarnV').textContent = cfg.batWarn.toFixed(2) + ' V';
  $('batMin').value = cfg.batMin; $('batMinV').textContent = cfg.batMin.toFixed(2) + ' V';
  $('fov').value = cfg.fov; $('fovV').textContent = cfg.fov + '°';
  $('vol').value = Math.round((cfg.vol ?? 0.7)*100); $('volV').textContent = Math.round((cfg.vol ?? 0.7)*100) + ' %';
  $('needArm').checked = cfg.needArm;
  $('autoRes').checked = cfg.autoRes;
  $('infBat').checked = cfg.infBat;
  $('ghost').checked = cfg.ghost; $('trail').checked = cfg.trail;
  syncStyle();
  $('tilt').value = cfg.tilt; $('tiltV').textContent = cfg.tilt + '°';
  document.querySelectorAll('#rates input').forEach(el => { const [k, i] = el.dataset.r.split(','); el.value = cfg.rates[k][+i]; });
  $('sound').checked = cfg.sound;
  press('#videoSeg button', b => b.dataset.video === cfg.video);
  press('#visionSeg button', b => b.dataset.vision === (cfg.vision || 'normal'));
  press('#gfxSeg button', b => b.dataset.gfx === cfg.gfx);
  press('#dmgSeg button', b => b.dataset.id === cfg.dmg);
  // Wirkmittel (Prompt 157): nur im Taktischen Flug (T1); zündet bei Kontakt
  $('whSeg').hidden = !tac;
  press('#whSeg button', b => b.dataset.wh === (cfg.warhead || 'none'));
  document.querySelectorAll('#osdList input').forEach(el => { el.checked = osdOn(cfg.osd, el.dataset.osd); });
  press('#osdStyleSeg button', b => b.dataset.style === (cfg.osdStyle || 'bf'));
  $('propsView').checked = cfg.propsView;
  $('gpPreset').value = cfg.gpPreset;
  syncGpRows();
  $('bResume').hidden = !game.started;
  $('go').className = game.started ? 'secondary' : 'primary';   // nach dem ersten Flug ist „Weiterfliegen“ der Hauptknopf
  // Einstellungen: im Flug „Pause“ mit „Weiterfliegen“; aus dem Hauptmenü nur „Fertig“; aus einem anderen Schritt „Fertig“ (zurück dorthin) und „Hauptmenü“
  const inFlight = from === null && game.started;
  $('setTitle').textContent = inFlight ? 'Pause' : 'Einstellungen';
  $('bBack').textContent = inFlight ? 'Weiterfliegen' : 'Fertig';
  $('bMain').hidden = !inFlight && (from === null || from === 'main');
  $('setNav').style.gridTemplateColumns = $('bMain').hidden ? '1fr' : '';
  $('firstHint').hidden = game.started || game.best !== null;
  const cur = SCENARIOS.find(x => x.id === (game.started ? game.scenRun : cfg.scen)) || sc;
  $('bestTxt').textContent = game.best !== null ? 'Bestzeit ' + cur.name + ': ' + fmtTime(game.best) : '';
}
// Menügröße an den Bildschirm anpassen (CSS zoom, Chromium): erst in Grundgröße messen, dann so weit vergrößern,
// wie Breite und Höhe erlauben (höchstens 1,35-fach, damit die Seiten ähnlich groß bleiben). Passt es nicht, etwas verkleinern (bis 0,8), sonst scrollt das Menü.
export function fitPanel() {
  const pn = document.querySelector('#menu .panel');
  if (!pn || menu.hidden) return;
  pn.style.zoom = '1'; pn.style.maxHeight = 'none';
  const cs = getComputedStyle(menu);
  const aw = menu.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = menu.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  let z = Math.floor(clamp(Math.min(ah/pn.scrollHeight, aw/pn.offsetWidth, 1.15), 0.72, 1.15)*100)/100;   // höchstens 1,15: Seiten springen weniger in der Größe
  const set = () => { pn.style.zoom = String(z); pn.style.maxHeight = Math.floor(ah/z) + 'px'; };
  set();
  // Nachmessen: Mit anderer Größe brechen Zeilen anders um. In 3-%-Schritten verkleinern, bis nichts mehr scrollt.
  for (let i = 0; i < 10 && z > 0.72 && pn.scrollHeight > pn.clientHeight + 1; i++) { z = Math.round((z - 0.03)*100)/100; set(); }
}
addEventListener('resize', () => fitPanel());
// Version ohne Kurz-Hash anzeigen (der steht in der Konsole)
$('verTxt').textContent = VERSION.startsWith('%%') ? 'Version dev' : VERSION.replace(/, [0-9a-f]{6,}\)$/, ')');
if (!VERSION.startsWith('%%')) console.info('FPV-Simulator', VERSION);
export function show(name) {
  screen = name;
  document.body.classList.toggle('menuopen', !menu.hidden);   // Flug-Knöpfe oben nur ohne Menü
  if (name === 'drone') showFine(false);
  document.querySelectorAll('#menu section').forEach(s => { s.hidden = s.dataset.screen !== name; });
  syncMenu();
  menu.scrollTop = 0;
  if (name === 'map') requestAnimationFrame(mapDraw);   // Quellen können sich geändert haben (grüne Länder)
  const f = document.querySelector(`#menu section[data-screen="${name}"] .primary:not([hidden])`);
  if (f) f.focus({ preventScroll: true });
  fitPanel();
}
export function openMenu(name = 'settings') {
  if (menu.hidden) from = null; else if (name === 'settings' && screen !== 'settings') from = screen;
  if (menu.hidden && name === 'settings') showTab('general');   // Pause beginnt immer bei „Allgemein“
  game.paused = true; keys.clear(); ptr.clear(); menu.hidden = false; document.body.classList.add('menuopen'); show(name);
  audioPause();
}
export function resume() { keyLearn.fn = null; audioInit(); game.paused = false; game.started = true; menu.hidden = true; document.body.classList.remove('menuopen'); game.last = performance.now(); }
function back() { if (from === null && game.started) resume(); else show(from || 'main'); }
// Esc, P und ☰: Einstellungen öffnen oder wieder schließen
export function toggleMenu() { if (!menu.hidden && screen === 'settings') back(); else openMenu('settings'); }
// Echte Welt, Ort laden: Fortschritt im Menü. Knopf „Laden“: ein zweiter Klick bricht ab (rwBusy oben).
// Solange geladen wird, sind „Weiter“ und „Start“ gesperrt (Nutzer, Prompt 148): sonst startet man mit halbem Gebiet.
// Die Karte, ein gespeicherter Ort und „Dort fliegen“ ersetzen das laufende Laden; ein anderer Startort oder Modus bricht es ab.
let rwJob = null;
function rwLive() {
  if (rwBusy) { rwBusy.abort(); return Promise.resolve(false); }
  return rwLiveRun();
}
async function rwReplace() { if (rwBusy) { rwBusy.abort(); await rwJob; } return rwLiveRun(); }
function rwLiveRun() { rwJob = rwLiveDo(); return rwJob; }
function rwAbort() { if (rwBusy) rwBusy.abort(); }
// „Weiter“ (Modus) und „Start“ (Drohne) während des Ladens gesperrt, mit Beschriftung „Lädt …“
function rwLock() {
  for (const [id, t] of [['modeNext', 'Weiter'], ['bStart', 'Start']]) { $(id).disabled = !!rwBusy; $(id).textContent = rwBusy ? 'Lädt …' : t; }
  if (cfg.verbund) syncDis();   // „Dort fliegen“ ist während des Ladens auch gesperrt
}
async function rwLiveDo() {
  const ll = parseLatLon(cfg.rwLL);
  if (!ll) { $('rwMsg').textContent = 'Bitte Breite und Länge eingeben, zum Beispiel 50.7753, 6.0839.'; return false; }
  rwBusy = new AbortController(); $('rwGo').textContent = 'Abbrechen'; rwLock();
  const t0 = performance.now();
  let ok = false;
  try {
    await rwLoadLive(ll[0], ll[1], (step, f) => { $('rwMsg').textContent = (step.startsWith('Hinweis') ? '' : 'Lade ') + step + ' … ' + Math.round(f*100) + ' %'; }, rwBusy.signal, mergeImg, RW_STORE);
    rwSavedFill(); ok = true;
    // Flug in der echten Welt läuft (Menü offen): neu beginnen, sonst steht die Drohne an der alten Stelle im neuen Gelände
    if (game.started && rw.on) { setScenario(game.scenRun, true); respawn(); }
  } catch (e) {
    $('rwMsg').textContent = 'Nicht geladen: ' + (e.message || e);
    if (/Keine Verbindung|antwortet 5\d\d/.test(String(e.message))) {   // Server nicht erreichbar: Import gespeicherter Geodaten anbieten
      const b = document.createElement('button'); b.className = 'secondary linkbtn'; b.textContent = 'Geodaten importieren';
      b.addEventListener('click', () => { srcFrom = 'mode'; srcOpen('data'); }); $('rwMsg').append(' ', b);
    }
  } finally {
    rwBusy = null; rwJob = null; $('rwGo').textContent = 'Laden'; rwLock();
    // Geladen: Hinweis zum Ort mit Dauer. Startort inzwischen gewechselt (Abbruch): Hinweis des neuen Startorts statt der Fehlermeldung
    if (ok || cfg.rwSrc !== 'live') { syncMenu(); if (ok) $('rwMsg').textContent += ' (' + ((performance.now() - t0)/1000).toFixed(0) + ' s)'; }
    fitPanel();
  }
  return ok;
}
// Luftbilder mehrerer Quellen (Landesgrenze) zusammensetzen: erst ein Bild als Grund, darüber je Quelle ihre Zellen.
// imgs: JPEG/PNG-Bytes je Quelle (oder null), cells: Quelle je Zelle (RW_CELLS²). Ergebnis: JPEG-Bytes.
async function mergeImg(imgs, cells) {
  const bm = await Promise.all(imgs.map(b => b ? createImageBitmap(new Blob([b])).catch(() => null) : null)), first = bm.find(Boolean);
  if (!first) return null;
  const N = first.width, C = Math.round(Math.sqrt(cells.length)), cv = document.createElement('canvas'); cv.width = cv.height = N;
  const c = cv.getContext('2d'), k = N/C;
  c.drawImage(first, 0, 0, N, N);
  bm.forEach((b, i) => {
    if (!b) return;
    c.save(); c.beginPath();
    for (let j = 0; j < C; j++) for (let x = 0; x < C; x++) if (cells[j*C + x] === i) c.rect(x*k, j*k, k + 0.5, k + 0.5);
    c.clip(); c.drawImage(b, 0, 0, N, N); c.restore();
  });
  return new Uint8Array(await (await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9))).arrayBuffer());
}
// Gespeicherte Orte (L4): Auswahl lädt sofort aus dem Speicher
async function rwSavedFill() {
  const list = (await storeAll('info')).filter(x => !x.tile).sort((a, b) => b.date - a.date), sel = $('rwSaved');   // ohne nachgeladene Kacheln
  sel.textContent = '';
  const add = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.append(o); };
  add('', 'Gespeicherte Orte (' + list.length + ')');
  for (const x of list) add(x.lat + ', ' + x.lon, x.place + ' · ' + (x.buildings || 0) + ' Gebäude · ' + (x.size/1e6).toFixed(0) + ' MB');
  sel.hidden = !list.length || cfg.rwSrc !== 'live';
  fitPanel();
}
const rwWanted = () => { const ll = parseLatLon(cfg.rwLL); return ll && rw.live && rw.liveAt && rw.liveAt[0] === ll[0] && rw.liveAt[1] === ll[1]; };
async function start() {
  const real = isReal();
  if (real && cfg.rwSrc === 'live' && rwJob) { say('Lade Gebiet …', 60); await rwJob; }   // läuft schon: abwarten
  if (real && cfg.rwSrc === 'live' && !rwWanted()) {   // noch nicht geladen: jetzt laden, sonst Monschau
    say('Lade Gebiet …', 60);
    if (!await rwLiveRun()) { say('Ort nicht geladen, fliege Monschau. ' + $('rwMsg').textContent, 5); await rwLoadEmbedded(); }
    else say('Gebiet geladen', 1.5);
  }
  if (real && cfg.rwSrc === 'dis') disFlat();   // Ort der DIS-Übung ohne Kartendaten
  if (real && cfg.rwSrc === 'emb' && rw.live) await rwLoadEmbedded();   // zurück zu Monschau
  if (real && !rw.ready) await rwLoadEmbedded();   // Gelände entpacken (dauert nur kurz)
  if (real && !rw.ready) say('Gelände konnte nicht geladen werden: ' + rw.err, 4);
  run(flightScen(), real);
}
// Flug mit Szenario id beginnen, real: in der echten Welt (auch die Vorschau der Grundtypen, ohne die Wahl im Menü zu ändern)
function run(id, real = false) {
  setScenario(id, real); applyDrone(cfg.drone); saveCfg();
  game.scenRun = id;
  respawn(); resume();
}
// Modus-Liste nach Flugart und Welt: Parcours auf der Spielkarte alle Modi außer echte Welt und Vorschau; Parcours in der
// echten Welt die platzierbaren (heute Freiflug); Taktisch die vier Aufgaben, nicht verfügbare gesperrt mit Grund im Titel
let listKey = '';
function buildModeList() {
  const tac = cfg.flight === 'tactical', real = isReal(), key = cfg.flight + '|' + cfg.world, box = $('scenList');
  if (key !== listKey) {
    listKey = key; box.textContent = '';
    const items = tac ? TAC.map(t => ({ id: t.id, name: t.name, off: !t.worlds.includes(cfg.world) }))
      : SCENARIOS.filter(x => x.id !== 'real' && x.id !== 'vbs' && (!real || COURSE_REAL.includes(x.id))).map(x => ({ id: x.id, name: x.name, off: false }));
    for (const it of items) {
      const b = addChoice(box, it.name, '', () => { if (tac) cfg.tac = it.id; else cfg.scen = it.id; saveCfg(); syncMenu(); fitPanel(); });
      b.dataset.id = it.id; b.disabled = it.off; if (it.off) b.title = 'Folgt mit einer der nächsten Etappen';
    }
  }
  // gewählter Modus muss in der Liste sein; sonst den ersten verfügbaren nehmen
  const ok = [...box.querySelectorAll('button')].filter(b => !b.disabled).map(b => b.dataset.id), cur = tac ? cfg.tac : cfg.scen;
  if (!ok.includes(cur) && ok.length) { if (tac) cfg.tac = ok[0]; else if (!real) cfg.scen = ok[0]; }
  press('#scenList button', b => b.dataset.id === (tac ? cfg.tac : real && !COURSE_REAL.includes(cfg.scen) ? 'free' : cfg.scen));
}

// DIS-Modus (Nutzer, Prompt 143 und 145): echte Welt im Verbund mit einem DIS-Partner. Zeigt, ob die Brücke läuft (die
// Verbindung hält vbStep in der Hauptschleife), sonst Download der Windows-Brücke. Ein Browser sieht nur, ob die Brücke läuft,
// nicht ob sie installiert ist. Mit Einheiten in der Übung: Flug an ihrem Ort (Kartendaten, wenn eine Quelle ihn abdeckt,
// sonst ebene Fläche auf der Höhe der Einheiten).
// Experimentell (DIS-Abschluss, docs/dis-abschluss.md): bekannte Grenzen im Hinweis.
const DIS_INFO = 'DIS-Übung (experimentell): Die Drohne erscheint beim Partner, seine Einheiten hier. Der Partner greift die Drohne meist nicht an und übernimmt keinen Schaden.';
vbSet({ port: cfg.disPort || 3000, exercise: cfg.disEx || 1, keep: !!cfg.disKeep });
// Frage des Browsers nach dem lokalen Netz (Chrome: „local-network-access“): 'prompt', 'denied', 'granted' oder '' (unbekannt)
let lna = '';
function lnaCheck() {
  try { navigator.permissions.query({ name: 'local-network-access' }).then(p => { lna = p.state; }, () => { lna = ''; }); } catch (e) { lna = ''; }
}
// Letzter Ort der Übung (D5: pausiert der Partner, etwa VBS ohne Fokus, kommen keine Meldungen; nach 13 s wären die Einheiten
// weg und „Dort fliegen“ aus). Bleibt bis zum Wechsel von Übung oder Port; das Menü nennt das Alter.
let disLast = null;
const disN = n => n + (n === 1 ? ' Einheit' : ' Einheiten');
function syncDis() {
  const st = vbBridge(), cur = vbCenter(), c = st !== 'läuft' ? null : cur || (disLast && disLast.c);
  if (cur) disLast = { c: cur, t: performance.now() - (vb.now - cur.tNew)*1000 };   // t: Zeit der jüngsten Meldung
  const now = cur && vb.now - cur.tNew < 6 ? cur : null;   // 6 s ohne Meldung (Herzschlag 5 s): Partner schweigt
  if (st === 'wartet') lnaCheck();
  const where = c ? ' bei ' + c.lat.toFixed(5) + ', ' + c.lon.toFixed(5) : '', skip = c && c.skipped ? ' (' + c.skipped + ' Platzhalter übergangen)' : '';
  $('disSt').textContent = st === 'läuft' ? 'Brücke läuft. ' + (now ? 'Übung ' + VB.exercise + ': ' + disN(c.n) + where + skip + '.'
      : c ? 'Übung ' + VB.exercise + ': keine neuen Meldungen, zuletzt ' + disN(c.n) + where + ', vor ' + Math.round((performance.now() - disLast.t)/1000) + ' s.'
      : 'Noch keine Einheiten in Übung ' + VB.exercise + ' auf Port ' + VB.port + '.')
    : st === 'wartet' && lna === 'prompt' ? 'Der Browser fragt nach dem Zugriff auf das lokale Netz. Bitte „Zulassen“ wählen.'
    : st === 'wartet' && lna === 'denied' ? 'Zugriff auf das lokale Netz ist gesperrt: links neben der Adresse die Website-Einstellungen öffnen und erlauben.'
    : st === 'nicht gefunden' || st === 'wartet' ? 'Brücke nicht gefunden. Datei herunterladen und doppelklicken. Fragt Windows nach: „Ausführen“ oder „Weitere Informationen“, „Trotzdem ausführen“.'
    : 'Suche Brücke …';
  $('disGet').hidden = !(st === 'nicht gefunden' || (st === 'wartet' && lna !== 'prompt' && lna !== 'denied'));
  $('disSets').hidden = st !== 'läuft';
  $('disHere').disabled = !c || !!rwBusy;
  // „Dort fliegen“ gewählt: ebene Fläche am Ort der Übung oder Kartendaten an genau diesem Ort (dann ist auch „Ort laden“ gewählt)
  $('disHere').setAttribute('aria-pressed', String(cfg.rwSrc === 'dis' || (cfg.rwSrc === 'live' && !!cfg.disLL && cfg.rwLL === cfg.disLL)));
  if (document.activeElement !== $('disPort')) $('disPort').value = VB.port;
  if (document.activeElement !== $('disEx')) $('disEx').value = VB.exercise;
}
let disShown = '';
setInterval(() => {   // jede Sekunde, solange der DIS-Modus im Menü gewählt ist
  if (menu.hidden || screen !== 'mode' || !isReal() || !cfg.verbund) return;
  syncDis();
  const k = $('disOpts').textContent + $('disGet').hidden + $('disSets').hidden;
  if (k !== disShown) { disShown = k; fitPanel(); }
}, 1000);
$('disGet').addEventListener('click', () => {
  if (VB_BRUECKE.startsWith('%%')) { $('disSt').textContent = 'Brücke nur in der fertigen Datei enthalten (npm run build).'; return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([VB_BRUECKE], { type: 'application/octet-stream' })); a.download = 'fpv-dis-bruecke.cmd';
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});
// Port und Übung: übernehmen, wenn gültig (Port an die Brücke, Übung filtert den Empfang)
for (const [id, key, lo, hi] of [['disPort', 'disPort', 1, 65535], ['disEx', 'disEx', 1, 255]]) {
  $(id).addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); });   // Tippen steuert nicht die Drohne; Enter übernimmt
  $(id).addEventListener('change', e => {
    const v = Math.round(+e.target.value), old = key === 'disPort' ? VB.port : VB.exercise;
    if (!(v >= lo && v <= hi)) { e.target.value = old; return; }
    cfg[key] = v; saveCfg();
    if (v !== old) disLast = null;   // andere Übung oder anderer Port: alte Einheiten und alter Ort weg (vbSet leert die Liste)
    vbSet(key === 'disPort' ? { port: v } : { exercise: v });
    syncDis();
  });
}
// Am Ort der Übung fliegen (Nutzer, Prompt 148: ein Klick lädt und startet): Ort festhalten; mit Quelle (zum Beispiel NRW)
// die Kartendaten laden wie „Ort laden“ (Abbrechen bleibt möglich), sonst ebene Fläche; dann der Flug dort, auch aus einem
// laufenden Flug heraus. Schlägt das Laden fehl, bleibt das Menü mit der Meldung offen, kein Start in Monschau.
$('disHere').addEventListener('click', async () => {
  const c = vbCenter() || (disLast && disLast.c);
  if (!c || rwBusy) return;
  const ll = c.lat.toFixed(5) + ', ' + c.lon.toFixed(5);
  cfg.disLL = ll; cfg.disH = Math.round(c.h*100)/100;
  if (rwPlan(c.lat, c.lon)) {
    cfg.rwLL = ll; cfg.rwSrc = 'live'; saveCfg(); syncMenu();
    if (!await rwReplace()) return;
  } else { rwAbort(); cfg.rwSrc = 'dis'; saveCfg(); syncMenu(); fitPanel(); }
  await start();
});
function disFlat() {
  const ll = parseLatLon(cfg.disLL);
  if (!ll) return;
  if (!(rw.live && rw.meta && rw.meta.flat && rw.liveAt && rw.liveAt[0] === ll[0] && rw.liveAt[1] === ll[1] && rw.meta.hHome === cfg.disH)) rwFlat(ll[0], ll[1], cfg.disH || 0);
}
// Welt wechseln (Spielkarte, echte Welt); beim Verlassen der echten Welt laufendes Laden abbrechen
document.querySelectorAll('#modeTabs button').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.world === cfg.world) return;
  if (b.dataset.world !== 'real') rwAbort();
  cfg.world = b.dataset.world; saveCfg(); syncMenu(); rwSavedFill(); fitPanel();
}));
// Flugart aus dem Hauptmenü
for (const id of ['go', 'goTac']) $(id).addEventListener('click', () => { cfg.flight = $(id).dataset.flight; saveCfg(); syncMenu(); show('mode'); });
// Vorschau der DIS-Grundtypen (aus dem DIS-Block): Spielkarte mit den 18 Modellen, Wahl im Menü bleibt
$('disBases').addEventListener('click', () => { rwAbort(); run('vbs'); });
document.querySelectorAll('#whSeg button').forEach(b => b.addEventListener('click', () => { cfg.warhead = b.dataset.wh; saveCfg(); syncMenu(); fitPanel(); }));
// Startort: Monschau, Ort laden oder DIS-Übung (Verbund; den Ort setzt dort „Dort fliegen“)
document.querySelectorAll('#rwSeg button[data-start]').forEach(b => b.addEventListener('click', () => {
  const v = b.dataset.start;
  if (v === 'dis') { cfg.verbund = true; }
  else { if (v !== cfg.rwSrc) rwAbort(); cfg.verbund = false; cfg.rwSrc = v; }
  saveCfg(); syncMenu(); rwSavedFill(); fitPanel();
}));
let srcFrom = 'mode';   // Optionen der echten Welt: „Fertig“ führt dorthin zurück, woher man kam
$('rwOpt').addEventListener('click', () => { srcFrom = 'mode'; srcOpen('data'); });   // Optionen der echten Welt (Daten, Quellen)
$('srcDone').addEventListener('click', () => show(srcFrom));
$('rwLL').addEventListener('input', e => { cfg.rwLL = e.target.value; saveCfg(); });
$('rwLL').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') rwLive(); });   // Tippen steuert nicht die Drohne
$('rwGo').addEventListener('click', () => rwLive());
$('rwSaved').addEventListener('change', e => { if (!e.target.value) return; cfg.rwLL = e.target.value; cfg.rwSrc = 'live'; saveCfg(); e.target.value = ''; syncMenu(); rwReplace(); });
rwSavedFill();
// Karte (L2): Punkt wählen, übernehmen lädt sofort
$('rwMap').addEventListener('click', () => { show('map'); mapOpen(); });
srcInit(show, () => fitPanel(), () => rwSavedFill());
$('mapSrc').addEventListener('click', () => { srcFrom = 'map'; srcOpen('src'); });
mapInit((lat, lon) => { cfg.rwLL = lat.toFixed(5) + ', ' + lon.toFixed(5); cfg.rwSrc = 'live'; saveCfg(); show('mode'); rwReplace(); }, () => fitPanel());
for (const [id, d] of Object.entries(DIFF)) { const b = addChoice($('diffSeg'), d.name, '', () => { cfg.diff = id; saveCfg(); syncMenu(); }); b.dataset.id = id; b.title = d.info || ''; }
for (const [id, d] of Object.entries(DMG)) addChoice($('dmgSeg'), d.name, '', () => { cfg.dmg = id; saveCfg(); syncMenu(); }).dataset.id = id;
for (const [id, d] of Object.entries(DRONES)) {
  const b = addChoice($('droneSeg'), d.name, '', () => { cfg.drone = { preset: id }; saveCfg(); syncMenu(); });
  b.dataset.id = id; b.classList.add('withico'); b.prepend(droneIcon(d));
}
document.querySelectorAll('#cellSeg button').forEach(b => b.prepend(batteryIcon(600 + +b.dataset.cells*400, +b.dataset.cells)));
document.querySelectorAll('#cellSeg button').forEach(b => b.addEventListener('click', () => { cfg.drone.cells = +b.dataset.cells; saveCfg(); syncMenu(); }));
document.querySelectorAll('#modeSeg button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
// Regler: eigener oder Betaflight (P4). Wechsel startet die Drohne neu, damit Betaflight sauber anläuft.
document.querySelectorAll('#fcSeg button').forEach(b => b.addEventListener('click', () => {
  cfg.fc = b.dataset.fc; saveCfg(); press('#fcSeg button', x => x.dataset.fc === cfg.fc);
  if (game.started) respawn();
}));
$('twr').addEventListener('input', e => { cfg.drone.twr = +e.target.value; $('twrV').textContent = cfg.drone.twr.toFixed(1); saveCfg(); });
$('twr').addEventListener('change', () => syncMenu());   // nach dem Loslassen: wirksamen Wert zeigen (begrenzt)
$('mass').addEventListener('input', e => { cfg.drone.mass = +e.target.value/1000; saveCfg(); syncMenu(); });
$('cap').addEventListener('input', e => { cfg.drone.cap = +e.target.value; saveCfg(); syncMenu(); });   // Akku ändert auch das Gewicht
$('huntX').addEventListener('input', e => { cfg.huntX = +e.target.value; $('huntXV').textContent = cfg.huntX + ' von ' + e.target.max; saveCfg(); });
$('batWarn').addEventListener('input', e => { cfg.batWarn = +e.target.value; $('batWarnV').textContent = cfg.batWarn.toFixed(2) + ' V'; saveCfg(); });
$('batMin').addEventListener('input', e => { cfg.batMin = +e.target.value; $('batMinV').textContent = cfg.batMin.toFixed(2) + ' V'; saveCfg(); });
$('fov').addEventListener('input', e => { cfg.fov = +e.target.value; $('fovV').textContent = cfg.fov + '°'; saveCfg(); });
$('vol').addEventListener('input', e => { cfg.vol = +e.target.value/100; $('volV').textContent = e.target.value + ' %'; saveCfg(); });
$('infBat').addEventListener('change', e => { cfg.infBat = e.target.checked; saveCfg(); });
$('ghost').addEventListener('change', e => { cfg.ghost = e.target.checked; saveCfg(); });
$('trail').addEventListener('change', e => { cfg.trail = e.target.checked; saveCfg(); });
for (const [id, st] of Object.entries(STYLES)) addChoice($('styleSeg'), st.name, '', () => { Object.assign(cfg, st.set); saveCfg(); syncMenu(); }).dataset.id = id;
$('autoRes').addEventListener('change', e => { cfg.autoRes = e.target.checked; saveCfg(); });
$('needArm').addEventListener('change', e => { cfg.needArm = e.target.checked; saveCfg(); });
$('tilt').addEventListener('input', e => { cfg.tilt = +e.target.value; $('tiltV').textContent = cfg.tilt + '°'; saveCfg(); });
// Raten: Zahl begrenzen, speichern und an Betaflight geben. Maximum nie unter der Mitte.
document.querySelectorAll('#rates input').forEach(el => el.addEventListener('change', () => {
  const [k, i] = el.dataset.r.split(','), r = cfg.rates[k];
  r[+i] = clamp(Math.round(+el.value || 0), +el.min, +el.max);
  if (r[1] < r[0]) r[1] = r[0];
  document.querySelectorAll('#rates input').forEach(x => { const [k2, j] = x.dataset.r.split(','); x.value = cfg.rates[k2][+j]; });
  saveCfg(); bfRates();
}));
$('sound').addEventListener('change', e => { cfg.sound = e.target.checked; saveCfg(); });
document.querySelectorAll('#gfxSeg button').forEach(b => b.addEventListener('click', () => { cfg.gfx = b.dataset.gfx; saveCfg(); syncMenu(); }));
document.querySelectorAll('#videoSeg button').forEach(b => b.addEventListener('click', () => { cfg.video = b.dataset.video; saveCfg(); syncMenu(); }));
document.querySelectorAll('#visionSeg button').forEach(b => b.addEventListener('click', () => { cfg.vision = b.dataset.vision; saveCfg(); syncMenu(); }));
// OSD-Stile: ein Klick setzt alle Häkchen und die Schrift
for (const [id, st] of Object.entries(OSD_STYLES)) {
  const b = addChoice($('osdStyleSeg'), st.name, '', () => { cfg.osdStyle = id; cfg.osd = { ...st.osd }; saveCfg(); syncMenu(); });
  b.dataset.style = id;
}
// Gruppen im OSD-Reiter: Überschrift vor dem ersten Eintrag jeder Gruppe (Reihenfolge wie OSD_ITEMS)
const OSD_GROUPS = { lq: 'Allgemein', volt: 'Akku', flytime: 'Flug', ahi: 'Anzeige', mapLayers: 'Echte Welt' };
for (const [id, name] of OSD_ITEMS) {
  if (OSD_GROUPS[id]) { const h = document.createElement('span'); h.className = 'osdgrp'; h.textContent = OSD_GROUPS[id]; $('osdList').appendChild(h); }
  const lab = document.createElement('label'), cb = document.createElement('input');
  lab.className = 'check'; cb.type = 'checkbox'; cb.dataset.osd = id;
  cb.addEventListener('change', () => { cfg.osd[id] = cb.checked; saveCfg(); });
  lab.append(cb, ' ' + name); $('osdList').appendChild(lab);
}
$('propsView').addEventListener('change', e => { cfg.propsView = e.target.checked; saveCfg(); });

// Zuordnung im Menü: Knüppel-Achsen (Reiter Steuerung) und Schalter-Funktionen (Reiter Schalter)
// Lernen: nach Klick wird die Achse mit der größten Bewegung (oder die gedrückte Taste) übernommen.
const learn = { fn: null, sw: false, base: null, btn: null };
function learnBtn(fn, sw) {
  const b = document.createElement('button'); b.className = 'learn'; b.textContent = 'Lernen'; b.dataset.learn = fn;
  b.addEventListener('click', () => {
    if (learn.fn === fn) { learn.fn = null; } else { learn.fn = fn; learn.sw = sw; learn.base = gp.axes.slice(); learn.btn = gp.buttons.map(x => x.pressed); }
    document.querySelectorAll('.learn').forEach(x => x.classList.toggle('on', x.dataset.learn === learn.fn));
  });
  return b;
}
function buildGpRows() {
  const box = $('gpRows'); box.textContent = '';
  for (const [fn, label] of GP_FN) {
    const row = document.createElement('div'); row.className = 'gprow';
    const lab = document.createElement('span'); lab.textContent = label;
    const sel = document.createElement('select'); sel.dataset.fn = fn; sel.setAttribute('aria-label', 'Achse für ' + label);
    for (let i = 0; i < 8; i++) { const o = document.createElement('option'); o.value = i; o.textContent = 'A' + i; sel.appendChild(o); }
    const inv = document.createElement('label');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.inv = fn;
    inv.title = 'umkehren'; inv.appendChild(cb); { const t = document.createElement('span'); t.className = 'invtxt'; t.textContent = 'umkehren'; inv.appendChild(t); }
    const bar = document.createElement('i'); bar.className = 'gpbar'; bar.dataset.bar = fn; bar.appendChild(document.createElement('b'));
    row.append(lab, sel, inv, bar, learnBtn(fn, false)); box.appendChild(row);
    sel.addEventListener('change', gpFromUI); cb.addEventListener('change', gpFromUI);
  }
  const sb = $('swRows'); sb.textContent = '';
  for (const [fn, label] of GP_SW) {
    const row = document.createElement('div'); row.className = 'gprow';
    const lab = document.createElement('span'); lab.textContent = label;
    const sel = document.createElement('select'); sel.dataset.sw = fn; sel.setAttribute('aria-label', 'Quelle für ' + label);
    const opt = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
    opt('', 'Aus'); for (let i = 0; i < 8; i++) opt('a' + i, 'A' + i); for (let i = 0; i < 16; i++) opt('b' + i, 'T' + i);
    const inv = document.createElement('label');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.swinv = fn;
    inv.title = 'umkehren'; inv.appendChild(cb); { const t = document.createElement('span'); t.className = 'invtxt'; t.textContent = 'umkehren'; inv.appendChild(t); }
    const lamp = document.createElement('i'); lamp.className = 'lamp'; lamp.dataset.lamp = fn;
    row.append(lab, sel, inv, lamp, learnBtn(fn, true)); sb.appendChild(row);
    const save = () => { cfg.gpSw = { ...cfg.gpSw, [fn]: { src: sel.value, inv: cb.checked } }; saveCfg(); };
    sel.addEventListener('change', save); cb.addEventListener('change', save);
  }
}
function syncGpRows() {
  const m = gpMap();
  document.querySelectorAll('#gpRows select').forEach(el => { el.value = m[el.dataset.fn][0]; });
  document.querySelectorAll('#gpRows input[type=checkbox]').forEach(el => { el.checked = m[el.dataset.inv][1]; });
  document.querySelectorAll('#swRows select').forEach(el => { el.value = (cfg.gpSw[el.dataset.sw] || {}).src || ''; });
  document.querySelectorAll('#swRows input[type=checkbox]').forEach(el => { el.checked = !!(cfg.gpSw[el.dataset.swinv] || {}).inv; });
}
function gpFromUI() {
  const m = {};
  for (const [fn] of GP_FN) m[fn] = [+document.querySelector(`#gpRows select[data-fn="${fn}"]`).value,
                                     document.querySelector(`#gpRows input[data-inv="${fn}"]`).checked];
  cfg.gpMap = m; cfg.gpPreset = 'custom'; $('gpPreset').value = 'custom'; saveCfg();
}
// Lernen auswerten (jedes Bild, solange das Menü offen ist)
function learnStep() {
  if (!learn.fn || !gp.connected) return;
  if (learn.sw) {
    const bi = gp.buttons.findIndex((x, i) => x.pressed && !learn.btn[i]);
    if (bi >= 0) return learnDone('b' + bi, false);
  }
  let best = -1, bd = 0.5;
  gp.axes.forEach((v, i) => { const d = Math.abs(v - (learn.base[i] || 0)); if (d > bd) { bd = d; best = i; } });
  if (best < 0) return;
  const up = gp.axes[best] - (learn.base[best] || 0) > 0;   // Knüppel nach oben/rechts oder Schalter auf „an“
  learnDone(learn.sw ? 'a' + best : best, !up);
}
function learnDone(src, inv) {
  const fn = learn.fn; learn.fn = null;
  document.querySelectorAll('.learn').forEach(x => x.classList.remove('on'));
  if (learn.sw) cfg.gpSw = { ...cfg.gpSw, [fn]: { src, inv } };
  else { const m = JSON.parse(JSON.stringify(gpMap())); m[fn] = [src, inv]; cfg.gpMap = m; cfg.gpPreset = 'custom'; $('gpPreset').value = 'custom'; }
  saveCfg(); syncGpRows();
}
// Kalibrieren: 6 s lang alle Knüppel in alle Ecken bewegen und Schalter umlegen; kleinster und größter Wert je Achse
const calib = { until: 0, min: [], max: [] };
$('bCal').addEventListener('click', () => {
  calib.until = performance.now() + 6000; calib.min = gp.axes.slice(); calib.max = gp.axes.slice();
  $('gpHint').textContent = 'Kalibrieren: 6 s lang alle Knüppel in alle Ecken bewegen und Schalter umlegen.';
});
$('bCalReset').addEventListener('click', () => { cfg.gpCal = {}; saveCfg(); $('gpHint').textContent = 'Kalibrierung gelöscht.'; });
function calibStep() {
  if (!calib.until) return;
  gp.axes.forEach((v, i) => { calib.min[i] = Math.min(calib.min[i] ?? v, v); calib.max[i] = Math.max(calib.max[i] ?? v, v); });
  if (performance.now() < calib.until) return;
  calib.until = 0;
  const cal = {};
  calib.min.forEach((mn, i) => { if (calib.max[i] - mn > 0.5) cal[i] = [mn, calib.max[i]]; });
  cfg.gpCal = cal; saveCfg();
  $('gpHint').textContent = 'Kalibriert: ' + Object.keys(cal).length + ' Achsen.';
}
$('gpPreset').addEventListener('change', e => {
  const prev = JSON.parse(JSON.stringify(gpMap()));
  cfg.gpPreset = e.target.value;
  if (cfg.gpPreset === 'custom' && !cfg.gpMap) cfg.gpMap = prev;
  syncGpRows(); saveCfg();
});
export function updGpUI() {
  learnStep(); calibStep();
  for (const [fn] of GP_SW) { const l = document.querySelector(`[data-lamp="${fn}"]`); if (l) l.classList.toggle('on', !!gp.sw[fn]); }
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
// Drohne: Feinwerte als eigene Ansicht statt der Vorlagen
function showFine(on) {
  document.querySelector('section[data-screen=drone] .basic').hidden = on;
  document.querySelector('section[data-screen=drone] .fine').hidden = !on;
  $('bFine').textContent = on ? '‹ Zurück zu Vorlage und Flugmodus' : 'Feinwerte ändern ›';
  fitPanel();
}
$('bFine').addEventListener('click', () => showFine(document.querySelector('section[data-screen=drone] .fine').hidden));
// Reiter in den Einstellungen
function showTab(id) {
  document.querySelectorAll('.tabs button[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === id)));   // nur Reiter der Einstellungen (nicht Welt, nicht Quellen)
  document.querySelectorAll('.tabpane').forEach(p => { p.hidden = p.dataset.pane !== id; });
  keyLearn.fn = null;
  fitPanel();
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
showTab('general');
// Reiter Steuerung: Funke / Gamepad oder Tastatur
function showCtl(id) {
  press('#ctlSeg button', b => b.dataset.ctl === id);
  $('ctlPad').hidden = id !== 'pad'; $('ctlKeys').hidden = id !== 'keys';
  keyLearn.fn = null; buildKeyRows();
  fitPanel();
}
document.querySelectorAll('#ctlSeg button').forEach(b => b.addEventListener('click', () => showCtl(b.dataset.ctl)));
// Tastenbelegung: Taste antippen, dann neue Taste drücken
function buildKeyRows() {
  const box = $('keyRows'); box.textContent = '';
  for (const [fn, label] of KEY_FN) {
    const lab = document.createElement('span'); lab.textContent = label;
    const b = document.createElement('button'); b.className = 'keybtn'; b.type = 'button';
    b.textContent = keyLearn.fn === fn ? 'Taste …' : keyName(keyOf(fn));
    b.classList.toggle('on', keyLearn.fn === fn);
    b.addEventListener('click', () => { keyLearn.fn = keyLearn.fn === fn ? null : fn; buildKeyRows(); });
    box.append(lab, b);
  }
  const r = document.createElement('button'); r.className = 'secondary keyreset'; r.type = 'button'; r.textContent = 'Standard-Tasten';
  r.addEventListener('click', () => { cfg.keys = {}; keyLearn.fn = null; saveCfg(); buildKeyRows(); });
  box.appendChild(r);   // im freien Feld neben der letzten Taste
  buildHelpKeys();
}
// Beim Lernen: Taste abfangen, bevor das Spiel sie sieht (Erfassungsphase)
addEventListener('keydown', e => {
  if (!keyLearn.fn) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.code === 'Escape') keyLearn.fn = null;
  else if (setKey(keyLearn.fn, e.code)) { keyLearn.fn = null; saveCfg(); }
  else $('keyHint').textContent = 'Esc und P sind für das Menü reserviert. Bitte eine andere Taste drücken.';
  buildKeyRows();
}, true);
// Hilfe: aktuelle Belegung
function buildHelpKeys() {
  const rows = [['thrUp', 'thrDown', 'Gas mehr / weniger'], ['yawL', 'yawR', 'Gieren links / rechts'], ['pitchF', 'pitchB', 'Nase runter / hoch'],
    ['rollL', 'rollR', 'Rollen links / rechts'], ['reset', null, 'Neustart'], ['cam', null, 'Kamera wechseln'], ['mode', null, 'Angle / Acro'],
    ['arm', null, 'Scharf schalten / aus (nur mit Gas unten)'], ['tiltUp', 'tiltDown', 'Kamerawinkel höher / tiefer'], ['rewind', null, '5 s zurückspulen'], ['freeze', null, 'Einfrieren / weiter (Lernen, Gott-Modus)'], ['vision', null, 'Bild: normal, Wärmebild, Nachtsicht']];
  const box = $('helpKeys'); box.textContent = '';
  const add = (k, t) => { const a = document.createElement('kbd'); a.textContent = k; const b = document.createElement('span'); b.textContent = t; box.append(a, b); };
  for (const [a, b, t] of rows) add(keyName(keyOf(a)) + (b ? ' / ' + keyName(keyOf(b)) : ''), t);
  add('+ / −', 'Blickfeld'); add('Esc / P', 'Einstellungen');
}
showCtl('pad');
$('bResume').addEventListener('click', resume);
$('bStart').addEventListener('click', start);
$('bBack').addEventListener('click', back);
$('bMenu').addEventListener('click', toggleMenu);
$('bReset').addEventListener('click', () => { respawn(); if (game.paused) resume(); });
$('bCam').addEventListener('click', toggleCam);
// App im Hintergrund oder Bildschirm gesperrt: Einstellungen zeigen, Simulation pausieren, Ton aus
function toBackground() { if (!game.paused) openMenu('settings'); audioPause(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) toBackground(); });
addEventListener('pagehide', toBackground);
addEventListener('freeze', toBackground);
