// Deutschlandkarte für die Auswahl eines Ortes (Etappe L2): Grenzen der Bundesländer, vereinfacht. Nur Node-Bordmittel.
// Quelle: BKG, Verwaltungsgebiete 1 : 2 500 000 (VG2500), Datenlizenz Deutschland Namensnennung 2.0.
// Quellenvermerk (Pflicht): © BKG 2026 dl-de/by-2-0, Datenquellen: https://sgx.geodatenzentrum.de/web_public/gdz/datenquellen/datenquellen_vg_nuts.pdf
// Veränderung: Umrisse vereinfacht (Douglas-Peucker 400 m), Koordinaten auf 100 m gerundet.
// Ergebnis: realworld/germany.json mit Ländern (Name, Ringe in UTM 32 als ganze Hektometer). Aufruf: node tools/germany.mjs
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipFile } from './water.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const VG = { url: 'https://daten.gdz.bkg.bund.de/produkte/vg/vg2500/aktuell/vg2500_01-01-2026.utm32s.shape.zip', tol: 400,
  attribution: '© BKG 2026 dl-de/by-2-0 (VG2500, vereinfacht)', sources: 'https://sgx.geodatenzentrum.de/web_public/gdz/datenquellen/datenquellen_vg_nuts.pdf' };
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  let k = 0, dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((pts[i][0] - a[0])*dy - (pts[i][1] - a[1])*dx)/l; if (d > dmax) { dmax = d; k = i; } }
  return dmax < tol ? [a, b] : simplify(pts.slice(0, k + 1), tol).slice(0, -1).concat(simplify(pts.slice(k), tol));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const shp = await zipFile(VG.url, 'VG2500_LAN.shp'), dbf = await zipFile(VG.url, 'VG2500_LAN.dbf');
  const hlen = dbf.readUInt16LE(8), rlen = dbf.readUInt16LE(10), fields = [];
  for (let o = 32, pos = 1; dbf[o] !== 0x0d; o += 32) { fields.push({ name: dbf.slice(o, o + 11).toString().replace(/\0.*$/, ''), pos, len: dbf[o + 16] }); pos += dbf[o + 16]; }
  const lands = new Map();
  for (let p = 100, k = 0; p + 8 <= shp.length; k++) {
    const len = shp.readInt32BE(p + 4)*2, c = p + 8, rec = {};
    for (const f of fields) rec[f.name] = dbf.slice(hlen + k*rlen + f.pos, hlen + k*rlen + f.pos + f.len).toString('utf8').trim();
    if (shp.readInt32LE(c) === 5 && rec.GF === '9') {   // GF 9: Landfläche (je Land ein Datensatz; GF 8 sind die Flächen mit Gewässern, geprüft 06.11.2026)
      const np = shp.readInt32LE(c + 36), nn = shp.readInt32LE(c + 40), parts = [];
      for (let i = 0; i < np; i++) parts.push(shp.readInt32LE(c + 44 + i*4));
      const pts = c + 44 + np*4, L = lands.get(rec.GEN) || { name: rec.GEN, rings: [] };
      for (let i = 0; i < np; i++) {
        const r = [];
        for (let q = parts[i]; q < (i + 1 < np ? parts[i + 1] : nn); q++) r.push([shp.readDoubleLE(pts + q*16), shp.readDoubleLE(pts + q*16 + 8)]);
        const s = simplify(r.slice(0, -1), VG.tol).map(([x, y]) => [Math.round(x/100), Math.round(y/100)]);
        if (s.length >= 4) L.rings.push(s);
      }
      lands.set(rec.GEN, L);
    }
    p = c + len;
  }
  const out = { attribution: VG.attribution, sources: VG.sources, unit: 'hm UTM32', lands: [...lands.values()] };
  writeFileSync(join(ROOT, 'realworld', 'germany.json'), JSON.stringify(out));
  console.log(fields.map(f => f.name).join(','), '|', out.lands.map(l => l.name + ' ' + l.rings.length + '/' + l.rings.reduce((s, r) => s + r.length, 0)).join(', '), '| Größe', JSON.stringify(out).length, 'B');
}
