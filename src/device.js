/* Geräteprofil (Etappe G3, Prompt 213/214): Grenzen der Zwischenspeicher nach den Leistungsdaten des Rechners statt fester Zahlen.
   Ohne DOM, in Node testbar. Die Gerätedaten sammelt render.js (Grafikkarte) und menu.js (Platz im Browser) und reicht sie hier herein.
   Wahl des Nutzers in cfg.mem: 'auto' (Vorgabe), 'low' (Sparsam: eine Stufe tiefer, Browser-Speicher wie vor G3), 'high' (Viel: eine
   Stufe höher, mehr Browser-Speicher). Alle Zahlen sind Schätzungen; die Annahmen stehen an der Tabelle. */
import { RW_STREAM } from './realworld.js';
import { I3S } from './rwmesh.js';
import { RW_CAP } from './rwstore.js';

// Stufen 0 bis 3. Stufe 0 = die alten Handy-Grenzen (bis G3 I3S_LOW in rwmesh.js, nach docs/plan-3d-mesh.md 2.7), Stufe 1 = die festen Werte vor G3 (Rechner), außer den
// Kacheln im Flug (12 statt 8, Annahme: auch schwache Rechner tragen 4 Kacheln mehr). Stufe 2 und 3 nur mit eigener Grafikkarte.
// tiles: Kacheln im Arbeitsspeicher, drop: Abstand in m, ab dem eine Kachel aus dem Arbeitsspeicher geht (sie bleibt im Browser-Speicher).
// Annahme Grafikspeicher je Kachel: etwa 25 MB (Luftbild 2048² mit Mipmaps 21 MB, render.js, dazu Netz). Stufe 3: 36 Kacheln etwa 0,9 GB,
// dazu das Mesh 1,6 GB, zusammen etwa 2,5 GB. Mesh: gpuMB, maxNodes, keep (s ohne Zeichnen bis zur Freigabe), para (Abrufe), texMax.
export const DEV_LEVELS = [
  { name: 'Schwach', tiles: 8, drop: 1600, gpuMB: 90, maxNodes: 80, keep: 15, para: 4, texMax: 1024 },
  { name: 'Mittel', tiles: 12, drop: 2000, gpuMB: 400, maxNodes: 240, keep: 15, para: 6, texMax: 0 },
  { name: 'Stark', tiles: 24, drop: 3500, gpuMB: 1000, maxNodes: 500, keep: 40, para: 6, texMax: 0 },
  { name: 'Sehr stark', tiles: 36, drop: 5000, gpuMB: 1600, maxNodes: 800, keep: 60, para: 8, texMax: 0 }
];
// Browser-Speicher je Wahl: Anteil am Platz, den der Browser der Seite gibt (navigator.storage.estimate), für Kacheln und für das Mesh je
// einzeln, mindestens die Werte vor G3 (Kacheln 400 MB, Mesh 500 MB, Handy 150 MB), höchstens max MB. Sparsam: genau die Werte vor G3.
// Annahme: Zusammen 40 % (Viel 70 %) lassen Platz für gespeicherte Orte und Landesdaten; die Grenze bei 90 % (rwstore.js) bleibt.
export const DEV_STORE = { low: { share: 0, max: 0 }, auto: { share: 0.2, max: 4000 }, high: { share: 0.35, max: 16000 } };
// Was zuletzt galt (für die Anzeige und den Ruckelschutz)
export const dev = { info: null, mode: 'auto', p: null, cut: false };

// Grafikkarte aus dem Namen, den WebGL meldet: 0 Software oder Handy, 1 eingebaut oder unbekannt, 2 eigene Grafikkarte.
// Firefox meldet den Namen vereinfacht (zum Beispiel „NVIDIA GeForce GTX 980, or similar“ für viele NVIDIA-Karten; vermutet nach
// Firefox-Doku); deshalb reichen grobe Muster.
export function devGpuClass(name) {
  const s = String(name || '');
  if (/SwiftShader|llvmpipe|softpipe|Software|Basic Render|Mali|Adreno|PowerVR|Apple GPU/i.test(s)) return 0;
  if (/GeForce|RTX|Quadro|NVIDIA [A-Z]?\d{3,}|Radeon (RX|R9|Pro|VII)|\bRX ?\d{3,4}\b|Arc(\(TM\))? A\d|Apple M\d (Pro|Max|Ultra)/i.test(s)) return 2;
  return 1;
}
// Stufe aus den Gerätedaten: info = { coarse (Touch als Hauptzeiger), mem (GB, nur Chromium, sonst 0), cores, gpu (Name) }.
// Touch oder höchstens 4 GB (wie LOW_MEM in render.js) und Software-Grafik: 0. Sonst die Klasse der Grafikkarte, mindestens 1.
export function devLevel(info) {
  const g = devGpuClass(info.gpu);
  if (info.coarse || (info.mem > 0 && info.mem <= 4) || (info.cores > 0 && info.cores <= 2) || g === 0) return 0;
  return g;
}
// Grenzen für Gerät und Wahl. quota: Platz für die Seite in Bytes (0: unbekannt). Liefert { lv, name, ...Stufe, tileMB, meshMB }.
export function devProfile(info, mode = 'auto', quota = 0) {
  const base = devLevel(info), lv = Math.max(0, Math.min(3, base + (mode === 'low' ? -1 : mode === 'high' ? 1 : 0)));
  const L = DEV_LEVELS[lv], S = DEV_STORE[mode] || DEV_STORE.auto, min = { tile: 400, mesh: lv === 0 ? 150 : 500 };
  const share = q => Math.round(Math.min(S.max, Math.max(0, q*S.share/1e6)));
  return { lv, base, ...L, tileMB: Math.max(min.tile, share(quota)), meshMB: Math.max(min.mesh, share(quota)) };
}
// Grenzen setzen. Der Ruckelschutz (devAdapt) kann die Kacheln im Flug danach wieder senken.
export function devApply(info, mode = 'auto', quota = 0) {
  const p = devProfile(info, mode, quota);
  Object.assign(dev, { info, mode, p, cut: false });
  Object.assign(RW_STREAM, { max: p.tiles, drop: p.drop });
  Object.assign(I3S, { gpuMB: p.gpuMB, maxNodes: p.maxNodes, keep: p.keep, para: p.para, texMax: p.texMax || undefined });
  Object.assign(RW_CAP, { tileMB: p.tileMB, meshMB: p.meshMB });
  return p;
}
// Ruckelschutz: Läuft das Bild im Sparmodus (frameStat.lite, render.js: zu langsam trotz kleinerer Auflösung), halten wir höchstens
// 60 % der Kacheln (mindestens 8) und laden ab 75 % des Abstands nicht mehr nach. Ist der Sparmodus aus, gelten wieder die Grenzen der Stufe.
export function devAdapt(lite) {
  if (!dev.p || lite === dev.cut) return false;
  dev.cut = lite;
  RW_STREAM.max = lite ? Math.max(8, Math.round(dev.p.tiles*0.6)) : dev.p.tiles;
  RW_STREAM.drop = lite ? Math.max(1600, Math.round(dev.p.drop*0.75)) : dev.p.drop;
  return true;
}
// Eine Zeile für den Reiter „Daten“
export function devText(p = dev.p, info = dev.info) {
  if (!p) return '';
  const GB = mb => mb >= 1000 ? (mb/1000).toFixed(1).replace('.', ',') + ' GB' : mb + ' MB';
  let g = info && info.gpu ? String(info.gpu) : '';
  if (g.length >= 48) g += '…';   // render.js kürzt lange Namen
  g += ')'.repeat(Math.max(0, (g.match(/\(/g) || []).length - (g.match(/\)/g) || []).length));   // gekürzt: offene Klammern schließen
  return 'Stufe ' + p.name + (g ? ' (' + g + ')' : '') + ': im Flug bis ' + p.tiles + ' Kacheln, bis ' + (p.drop/1000).toFixed(1).replace('.', ',') + ' km'
    + ', 3D-Mesh ' + GB(p.gpuMB) + ' Grafik. Im Browser gespeichert: Kacheln ' + GB(p.tileMB) + ', 3D-Mesh ' + GB(p.meshMB) + '.' + (dev.cut ? ' Ruckelschutz aktiv: weniger Kacheln.' : '');
}
