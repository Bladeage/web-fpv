// Gebiet für den Modus „Echte Welt“ laden und kompakt ablegen (realworld/<name>.*). Nur Node-Bordmittel.
// Aufruf: node tools/realworld.mjs   (Gebiet unten in AREA; Ergebnis liegt im Repository, die CI lädt nichts nach)
// Laden und Packen macht src/rwload.js, derselbe Code wie beim Laden per Koordinate im Browser (Etappe L1).
// Quellen: Geobasis NRW, Lizenz „Datenlizenz Deutschland – Zero 2.0“ (jede Nutzung ohne Bedingungen).
// Danach node tools/water.mjs (schreibt meta.water wieder in die Beschreibung).
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { RW_SOURCES, rwFetchArea } from '../src/rwload.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), OUT = join(ROOT, 'realworld');
// Gebiete (1 x 1 km in UTM 32, EPSG:25832). Wahl über die Umgebungsvariable RW_AREA (Vorgabe monschau).
// Monschau (Eifel): Altstadt im Rurtal, Start Wiese oberhalb der Altstadt. Bleibt im Repository für die Tests.
// AXA Campus Köln (Nutzer, Prompt 199/200): Start genau auf 50.96170, 7.05731 (Wiese am Campus, E 363575,4, N 5647362,5), Gebiet um
// diesen Punkt; Blick beim Start nach startYaw Grad (Kompass, 0 Nord, 90 Ost). startExact: kein Suchen eines flachen Platzes.
export const AREAS = {
  monschau: { name: 'monschau', place: 'Monschau (Eifel, NRW)', crs: 'EPSG:25832', bbox: [304200, 5603500, 305200, 5604500],
    startNear: [304814, 5604314], attribution: 'Geobasis NRW, Datenlizenz Deutschland – Zero 2.0' },
  axa: { name: 'axa', place: 'AXA Campus Köln', crs: 'EPSG:25832', bbox: [363075, 5646862, 364075, 5647862],
    startNear: [363575.4, 5647362.5], startExact: true, startYaw: 270, attribution: 'Geobasis NRW, Datenlizenz Deutschland – Zero 2.0' }
};
export const AREA = AREAS[process.env.RW_AREA || 'monschau'];
if (!AREA) throw new Error('Unbekanntes Gebiet RW_AREA=' + process.env.RW_AREA);
async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status + ' ' + url);
  return new Uint8Array(await r.arrayBuffer());
}
// Gebäude-Kacheln zwischenspeichern (tools/.cache), damit wiederholte Läufe schnell sind
async function text(url) {
  const f = join(ROOT, 'tools', '.cache', url.split('/').pop());
  if (existsSync(f)) return readFileSync(f, 'utf8');
  const r = await fetch(url);
  if (!r.ok) return null;
  const t = await r.text();
  mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, t);
  return t;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = AREA, src = RW_SOURCES.find(s => s.id === 'nrw');
  if (src.kind === 'wms' || src.store === false) throw new Error('Quellen mit store:false (WMS-Höhendienst) werden nie abgelegt.');
  const p = await rwFetchArea(a, src, get, text, s => console.log('…', s));
  mkdirSync(OUT, { recursive: true });
  const old = existsSync(join(OUT, a.name + '.json')) ? JSON.parse(readFileSync(join(OUT, a.name + '.json'), 'utf8')) : {};
  if (old.water) p.meta.water = old.water;   // Gewässer (tools/water.mjs) bleiben erhalten
  writeFileSync(join(OUT, a.name + '.bld'), deflateSync(Buffer.from(p.b16.buffer), { level: 9 }));
  writeFileSync(join(OUT, a.name + '.trees'), deflateSync(Buffer.from(p.t16.buffer), { level: 9 }));
  writeFileSync(join(OUT, a.name + '.dgm'), deflateSync(Buffer.from(p.q.buffer), { level: 9 }));
  writeFileSync(join(OUT, a.name + '.jpg'), p.dop);
  if (p.far) {   // Umgebung 10 x 10 km (L5a)
    p.meta.far = p.far.meta;
    writeFileSync(join(OUT, a.name + '.far'), deflateSync(Buffer.from(p.far.q.buffer), { level: 9 }));
    if (p.far.dop) writeFileSync(join(OUT, a.name + '.far.jpg'), p.far.dop);
  }
  if (a.startExact) {   // Start genau auf dem Punkt (Kartenkoordinaten: Mitte = Ursprung, z nach Süden). hHome bleibt: Gebäude und
    // Bäume sind relativ dazu gepackt (rwload.js), nur der Startplatz wandert
    const ec = (a.bbox[0] + a.bbox[2])/2, nc = (a.bbox[1] + a.bbox[3])/2;
    p.meta.home = [Math.round((a.startNear[0] - ec)*10)/10, Math.round(-(a.startNear[1] - nc)*10)/10];
  }
  if (a.startYaw !== undefined) p.meta.homeYaw = a.startYaw;   // Blickrichtung beim Start in Grad (Kompass)
  writeFileSync(join(OUT, a.name + '.json'), JSON.stringify(p.meta, null, 1) + '\n');
  console.log(p.meta, 'Luftbild', p.dop.length, 'B');
}
