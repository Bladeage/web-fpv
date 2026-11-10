/* Sichtprobe 3D-Mesh NRW (Nutzer, Prompt 189/190, Etappe M0; Plan docs/plan-3d-mesh.md, Prüfung docs/pruefung-3d-mesh.md).
   Texturiertes Mesh des Digitalen Zwillings NRW (I3S 1.7, Lizenz dl-de/zero-2.0), live geladen, nichts gespeichert. Nur zum
   Vergleich mit der heutigen Optik: aktiv nur mit dem Zusatz ?mesh=1 in der Adresse, in der echten Welt, nicht in DIS.
   Dieses Modul: Knoten und Seiten verwalten, Sichtkegel, Wahl der Detailstufe (Node-Switching wie I3S), Freigabe. Ohne DOM.
   Laden (fetch, Bilder) und Zeichnen macht render.js. */

// url Ebene 0 des Dienstes; q Qualität (1 = Schwelle des Dienstes, größer = gröber); maxNodes, gpuMB Grenzen; para gleichzeitige
// Abrufe; keep Sekunden ohne Zeichnen bis zur Freigabe; nearR Umkreis der Kamera, der auch außerhalb des Bildes lädt. Schätzungen.
export const I3S = { url: 'https://www.gis.nrw.de/geobasis/3D_mesh/SceneServer/layers/0', pageN: 64, q: 1, maxNodes: 160, gpuMB: 260, para: 6, keep: 8, nearR: 150, sink: 4 };
// nodes: Nummer -> Knoten; pages: Seite -> 'load' | 'ok' | 'fail'; l1: Kinder der Wurzel (bekannt, sobald alle 108 Seiten da sind)
export const i3s = { nodes: new Map(), pages: new Map(), l1: null, root: null, drawn: [], gpu: 0, err: '', jobs: 0, loaded: 0, mb: 0 };
export const i3sPageOf = idx => Math.floor(idx/I3S.pageN);
export const i3sPageUrl = p => I3S.url + '/nodepages/' + p;
export const i3sGeoUrl = res => I3S.url + '/nodes/' + res + '/geometries/0';   // Puffer 0: ungepackt (per gzip übertragen), nicht Draco
export const i3sTexUrl = res => I3S.url + '/nodes/' + res + '/textures/0';
export function i3sReset() { i3s.nodes.clear(); i3s.pages.clear(); i3s.l1 = null; i3s.root = null; i3s.drawn = []; i3s.gpu = 0; i3s.err = ''; i3s.jobs = 0; i3s.loaded = 0; i3s.mb = 0; }
// Knoten einer Seite übernehmen (I3S nodePages): Mitte der Box (Ost, Nord, Höhe über NHN), Hüllkugel, Schwelle, Kinder, Ressourcen
export function i3sAddPage(p, json) {
  i3s.pages.set(p, 'ok');
  for (const n of json.nodes || []) {
    if (i3s.nodes.has(n.index)) continue;
    const h = n.obb.halfSize, m = n.mesh;
    i3s.nodes.set(n.index, { idx: n.index, c: n.obb.center, r: Math.hypot(h[0], h[1], h[2]), lod: n.lodThreshold || 0, ch: n.children || [],
      res: m && m.geometry ? m.geometry.resource : null, tex: m && m.material ? m.material.resource : null, vc: m && m.geometry ? m.geometry.vertexCount : 0,
      texel: m && m.material ? m.material.texelCountHint || 0 : 0, st: m ? 'idle' : 'none', t: 0, gl: null, fail: 0 });
  }
}
// Kartenkoordinaten (Mitte des Gebiets = Ursprung, x Ost, z Süd, y = Höhe über dem Startplatz): o = { ec, nc, h }
export const i3sToMap = (c, o) => [c[0] - o.ec, c[2] - o.h, -(c[1] - o.nc)];
// Sechs Ebenen des Sichtkegels aus der Matrix vp (spaltenweise wie WebGL), normiert; Kugeltest
export function i3sPlanes(m) {
  const row = i => [m[i], m[4 + i], m[8 + i], m[12 + i]], r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3), out = [];
  for (const [a, s] of [[r0, 1], [r0, -1], [r1, 1], [r1, -1], [r2, 1], [r2, -1]]) {
    const p = [r3[0] + s*a[0], r3[1] + s*a[1], r3[2] + s*a[2], r3[3] + s*a[3]], l = Math.hypot(p[0], p[1], p[2]) || 1;
    out.push([p[0]/l, p[1]/l, p[2]/l, p[3]/l]);
  }
  return out;
}
export const i3sSeen = (P, c, r) => P.every(p => p[0]*c[0] + p[1]*c[1] + p[2]*c[2] + p[3] > -r);
// Maß für die Detailstufe (maxScreenThresholdSQ): Fläche der Hüllkugel auf dem Bildschirm in Pixel². f = Bildhöhe/(2 tan(vf/2)).
export const i3sMetric = (r, d, f) => { const D = 2*r*f/Math.max(d - r, 1); return Math.PI/4*D*D; };

// Auswahl je Bild. cam [x, y, z] (Karte), f wie oben, P Ebenen, o Ursprung. Liefert { draw: [Knoten], want: [[Knoten, Vorrang]],
// pages: [Seiten] }. Node-Switching: ein Knoten wird gezeichnet oder ganz durch seine Kinder ersetzt; die Kinder erst, wenn alle
// sichtbaren fertig sind (sonst zeichnet der Knoten selbst weiter und die Kinder laden).
export function i3sSelect(cam, f, P, o, q = I3S.q) {
  const draw = [], want = [], pages = new Set();
  const need = idx => { const n = i3s.nodes.get(idx); if (!n) pages.add(i3sPageOf(idx)); return n; };
  const look = n => { const c = i3sToMap(n.c, o), d = Math.hypot(c[0] - cam[0], c[1] - cam[1], c[2] - cam[2]); return { d, vis: i3sSeen(P, c, n.r) || d - n.r < I3S.nearR }; };
  const visit = (n, L) => {
    const m = i3sMetric(n.r, L.d, f), refine = n.ch.length > 0 && (!n.res || n.lod === 0 || m > n.lod*q);
    if (refine) {
      const kids = n.ch.map(need);
      const prio = m + (L.d < I3S.nearR ? 1e12 : 0);
      if (kids.every(Boolean)) {
        const looks = kids.map(look), ready = kids.every((k, i) => !looks[i].vis || !k.res || k.st === 'ready');
        // weiter nach unten: Kinder fertig, Knoten ohne Mesh (obere Stufen), oder Knoten viel zu grob für den Abstand (Faktor 50,
        // Schätzung): dann wird er gar nicht erst geladen (sonst dauert der Weg über etwa 17 Stufen viele Sekunden)
        if (ready || !n.res || (n.st !== 'ready' && m > n.lod*q*50)) {
          kids.forEach((k, i) => { if (looks[i].vis) visit(k, looks[i]); });
          return;
        }
        // von grob nach fein: erst wenn der Knoten selbst da ist, die Kinder laden
        if (n.st === 'ready') kids.forEach((k, i) => { if (looks[i].vis && k.res && k.st !== 'ready') want.push([k, m + (looks[i].d < I3S.nearR ? 1e12 : 0)]); });
      }
      if (n.res) { if (n.st === 'ready') draw.push(n); else want.push([n, prio]); }
      return;
    }
    if (!n.res) return;
    if (n.st === 'ready') draw.push(n); else want.push([n, m + (L.d < I3S.nearR ? 1e12 : 0)]);
  };
  for (const idx of i3s.l1 || []) { const n = need(idx); if (!n) continue; const L = look(n); if (L.vis) visit(n, L); }
  want.sort((a, b) => b[1] - a[1]);
  draw.sort((a, b) => look(a).d - look(b).d);   // nah zuerst: früher Tiefentest
  return { draw, want, pages: [...pages] };
}
// Grafikspeicher eines Knotens (Schätzung): Puffer 20 Byte je Punkt, Textur RGBA mit Mipmaps
export const i3sBytes = n => n.vc*20 + n.texel*4*1.33;
// Freigabe: lange nicht gezeichnete Knoten (feinste zuerst), bis Zahl und Speicher in den Grenzen liegen. Liefert die Knoten,
// deren Grafik render.js löschen muss.
export function i3sEvict(now, keepSet) {
  const ready = [...i3s.nodes.values()].filter(n => n.st === 'ready'), out = [];
  let count = ready.length, mb = ready.reduce((s, n) => s + i3sBytes(n), 0)/1e6;
  const old = ready.filter(n => !keepSet.has(n) && now - n.t > I3S.keep).sort((a, b) => a.t - b.t);
  for (const n of old) {
    if (count <= I3S.maxNodes && mb <= I3S.gpuMB) break;
    out.push(n); n.st = 'idle'; count--; mb -= i3sBytes(n)/1e6;
  }
  i3s.gpu = mb;
  return out;
}
// Geometrie (Puffer 0) prüfen: Kopf vertexCount, featureCount (UInt32), dann Lagen (Float32 x 3) und Texturkoordinaten (Float32 x 2)
export function i3sGeometry(bytes) {
  const b = bytes.byteOffset % 4 ? bytes.slice() : bytes, v = new DataView(b.buffer, b.byteOffset, b.byteLength), vc = v.getUint32(0, true);
  if (b.byteLength < 8 + 20*vc) throw new Error('Mesh-Geometrie zu kurz');
  return { vc, pos: new Float32Array(b.buffer, b.byteOffset + 8, vc*3), uv: new Float32Array(b.buffer, b.byteOffset + 8 + 12*vc, vc*2) };
}
