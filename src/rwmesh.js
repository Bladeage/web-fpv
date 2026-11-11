/* Sichtprobe 3D-Mesh NRW (Nutzer, Prompt 189/190, Etappe M0; Plan docs/plan-3d-mesh.md, Prüfung docs/pruefung-3d-mesh.md).
   Texturiertes Mesh des Digitalen Zwillings NRW (I3S 1.7, Lizenz dl-de/zero-2.0), live geladen, nichts gespeichert. Nur zum
   Vergleich mit der heutigen Optik: aktiv nur mit dem Zusatz ?mesh=1 in der Adresse, in der echten Welt, nicht in DIS.
   Dieses Modul: Knoten und Seiten verwalten, Sichtkegel, Wahl der Detailstufe (Node-Switching wie I3S), Freigabe. Ohne DOM.
   Laden (fetch, Bilder) und Zeichnen macht render.js. */

// url Ebene 0 des Dienstes; q Qualität (1 = Schwelle des Dienstes, größer = gröber); maxNodes, gpuMB Grenzen; para gleichzeitige
// Abrufe; keep Sekunden ohne Zeichnen bis zur Freigabe; nearR Umkreis der Kamera, der auch außerhalb des Bildes lädt. Schätzungen.
export const I3S = { url: 'https://www.gis.nrw.de/geobasis/3D_mesh/SceneServer/layers/0', pageN: 64, q: 1, maxNodes: 240, gpuMB: 400, para: 6, keep: 15, nearR: 150, sink: 4 };
// nodes: Nummer -> Knoten; pages: Seite -> 'load' | 'ok' | 'fail'; l1: Kinder der Wurzel (bekannt, sobald alle 108 Seiten da sind)
export const i3s = { nodes: new Map(), pages: new Map(), l1: null, root: null, drawn: [], gpu: 0, err: '', jobs: 0, loaded: 0, mb: 0, qa: 1, up: [] };
// Grenzen am Handy (LOW_MEM, Prüfbericht Nutzer 10.11.: 701 MB Grafik, 1157 MB geladen am Handy): Schätzung nach docs/plan-3d-mesh.md 2.7
export const I3S_LOW = { maxNodes: 80, gpuMB: 90, para: 4, texMax: 1024 };
export const i3sPageOf = idx => Math.floor(idx/I3S.pageN);
// Schneller Start (Prompt 196): die 108 Kinder der Wurzel (Stufe 1, je etwa 25 x 25 km, ohne eigenes Mesh) stehen hier, statt sie
// über 108 Seiten zu laden (gemessen hier 50 bis 73 s bis zum ersten Teil). Stand des Dienstes 11.11.2026. Je Eintrag: Nummer, Mitte
// Ost, Nord, Höhe, Radius der Hüllkugel, Schwelle, Kinder. Beim Start prüft Seite 0, ob die Wurzel noch dieselben Kinder hat; sonst
// lädt das Programm die Seiten wie bisher.
export const I3S_L1 = [[64,435006.7,5618997.6,459.5,8627.4,0,[50133]],[50176,438996.9,5652994.1,517.2,29456.7,0,[478895]],[478912,413009.7,5696004.0,323.7,12562.6,0,[530497,665091]],[665152,439998.5,5641009.2,518.0,25034.2,0,[1084854]],[1084864,321038.1,5690768.0,74.3,21837.4,0,[1343935]],[1343936,472450.5,5791098.3,155.1,12035.8,0,[1535635]],[1535680,488986.5,5801974.4,77.0,9347.8,0,[1567743,1572724,1645951,1657804]],[1657856,494145.0,5787196.0,74.5,15913.7,0,[1977970]],[1977984,312180.0,5678964.7,54.3,19983.6,0,[2174993,2293463]],[2293504,330059.3,5684999.8,45.9,4254.9,0,[2300769,2302096]],[2302144,477364.6,5741183.4,288.1,22490.1,0,[2811402,2814099]],[2814144,372676.0,5715327.7,76.8,20946.8,0,[3215466]],[3215488,306978.0,5744989.9,54.5,22020.6,0,[3219876,3228804,3237517,3241500,3245890,3258046,3264120,3269081,3275150,3275840,3283458,3289533,3293412,3296187,3297366,3302599,3308786,3325387,3325958,3334632,3339023,3342593,3343479,3347287,3354552,3358713,3371571,3377476,3383105,3386852,3391389,3395392,3405409,3410387,3411437,3412025,3422283,3422645,3435871,3449017,3449524,3455046,3460281,3465776,3466468,3477345,3496693,3498465,3506825,3512270,3512705,3518192,3522993,3527898,3528731,3535703,3536641,3540869,3546113,3550481,3552435,3557404,3560168,3564127,3569611,3575768,3580259,3581707,3584899,3587510,3587729,3591519,3593071,3597422,3604805,3608713]],[3608768,467004.3,5815997.2,74.5,16187.8,0,[3700370,3713180]],[3713216,467007.3,5803004.2,86.3,16584.5,0,[3878155,3912160]],[3912192,501992.2,5800008.4,137.4,7241.1,0,[3970266]],[3970304,503007.4,5810995.0,91.2,9930.6,0,[4048975]],[4049024,457994.6,5746997.3,138.1,16793.0,0,[4133997,4272527]],[4272576,454000.7,5736997.6,128.2,13038.8,0,[4286032,4398376]],[4398400,513992.4,5744973.9,321.4,18283.5,0,[4591408]],[4591424,514002.8,5733001.8,260.0,20157.3,0,[4836200,5106627]],[5106688,306003.7,5725001.4,73.3,15041.3,0,[5131711,5197032,5216379,5273435]],[5273472,339000.8,5707999.4,142.8,17038.9,0,[5567360]],[5567424,415989.3,5783998.7,133.0,19004.6,0,[5654672,5821068]],[5821120,416998.0,5770997.6,96.4,25979.0,0,[6031273,6131697]],[6131712,515989.5,5721010.3,293.5,16337.7,0,[6164682,6183821,6234732,6272479]],[6272512,512995.7,5708014.2,286.5,16451.1,0,[6409997,6498937]],[6498944,349007.6,5698992.2,106.5,22880.9,0,[6680090,6816116]],[6816128,509994.8,5749999.0,266.0,14162.6,0,[6865134,6913505]],[6913536,313003.4,5711000.3,89.7,12113.5,0,[6931176,7007163]],[7007168,316001.0,5701001.4,74.7,13042.8,0,[7018168,7119377]],[7119424,479999.9,5727997.2,221.6,20418.6,0,[7279944,7281369]],[7281408,420001.3,5757995.7,102.6,22837.5,0,[7583456]],[7583488,419992.1,5744009.0,120.1,23449.7,0,[7871702]],[7871744,410997.5,5734002.6,132.6,31591.3,0,[8066432]],[8066496,395007.0,5742007.3,86.7,15158.5,0,[8103936]],[8104000,477998.5,5756000.0,222.5,16526.2,0,[8321957]],[8321984,414992.9,5794003.8,224.0,17492.3,0,[8379076,8479625]],[8479680,350997.2,5737001.5,91.8,5130.6,0,[8490228]],[8490240,343011.9,5746003.6,118.1,24385.2,0,[8728616,8787620]],[8787648,382002.1,5748004.4,86.3,17126.0,0,[8975480]],[8975488,381995.1,5758994.5,185.4,16805.6,0,[9139967]],[9139968,352008.3,5759008.5,111.4,14897.5,0,[9203039,9243721]],[9243776,452010.7,5768990.0,214.4,13510.1,0,[9253973,9409590,9448304]],[9448320,452023.7,5756001.9,101.7,10828.3,0,[9454715,9553769]],[9553792,372999.7,5724000.9,92.4,19129.3,0,[9565067,9652521]],[9652544,335991.2,5733999.0,72.4,19727.5,0,[9939259]],[9939264,371958.0,5733995.7,103.5,19770.1,0,[9983197,10317075]],[10317120,333999.7,5721001.6,99.9,20647.1,0,[10557728]],[10557760,470999.8,5782004.5,124.7,11742.3,0,[10638621,10640325]],[10640384,408003.0,5811997.3,99.6,7243.3,0,[10667335,10675473]],[10675520,410994.3,5802995.4,71.0,19677.4,0,[10806576]],[10806592,503997.9,5769996.0,251.3,12844.6,0,[10945329,11014920,11029699]],[11029760,475993.7,5772952.9,175.5,18734.8,0,[11122150,11219253,11220319,11228388]],[11228416,478000.2,5764005.7,158.9,16527.9,0,[11375732]],[11375744,508998.1,5755015.9,269.1,15332.1,0,[11448696,11489741]],[11489792,506999.6,5760000.0,221.2,13185.0,0,[11534057,11550136]],[11550144,447998.4,5724007.3,139.9,25321.8,0,[11595150,11830767]],[11830784,495994.6,5706996.0,296.8,4153.2,0,[11846197]],[11846208,477001.2,5715005.3,310.7,11068.2,0,[11876134]],[11876160,448999.6,5696986.2,415.4,19672.7,0,[11906184,12167374]],[12167424,476993.5,5707999.2,392.0,12577.7,0,[12391172]],[12391232,485998.5,5713004.3,326.5,14901.2,0,[12546205]],[12546240,443004.0,5707998.9,252.3,23813.1,0,[12580992,12845745]],[12845760,442996.8,5716005.6,148.7,23108.5,0,[12852027,12906106]],[12906112,486002.0,5721011.1,312.1,14340.7,0,[13018062]],[13018112,377004.7,5788003.9,110.1,25107.4,0,[13028728,13337755]],[13337792,370002.3,5770888.0,113.6,31104.3,0,[13414994,13451370,13606339,13715134]],[13715136,304015.0,5623694.0,297.4,19871.7,0,[14047429,14377353]],[14377408,310005.4,5611006.3,438.9,13033.1,0,[14595941,14686476]],[14686528,311008.8,5594999.8,536.6,17061.8,0,[14776865,15244835]],[15244864,317010.6,5580015.3,607.4,8092.1,0,[15273751,15315933]],[15315968,418997.4,5723001.0,177.2,14252.3,0,[15338262,15555579]],[15555584,390998.7,5718002.6,176.2,19765.5,0,[15837756]],[15837760,399001.0,5729999.7,132.2,9255.8,0,[15900321]],[15900352,395016.9,5709997.5,138.4,26285.3,0,[16191568,16266668]],[16266688,387002.8,5696998.8,189.8,17756.3,0,[16663626]],[16663680,386997.3,5685001.2,320.1,16589.7,0,[17058906]],[17058944,340994.6,5681995.7,127.9,13637.7,0,[17262649]],[17262656,336995.5,5667000.8,110.0,18418.1,0,[17515078]],[17515136,334999.3,5649010.1,116.2,18652.6,0,[17937075]],[17937088,335032.1,5633991.9,126.7,15641.2,0,[17953577,18074408]],[18074432,310994.5,5672986.6,120.3,20306.1,0,[18146955,18326723]],[18326784,300000.0,5657000.0,82.2,21971.7,0,[18423879,18660034]],[18660096,303005.7,5639974.7,170.7,18837.9,0,[18821461,18936243]],[18936256,336001.6,5625997.8,171.1,15270.1,0,[19086808]],[19086848,337000.3,5611004.8,333.0,17541.9,0,[19526944]],[19526976,337991.0,5590003.0,467.5,20038.6,0,[20246188]],[20246208,361002.2,5641983.9,114.4,17745.6,0,[20255054,20400193,20419944,20695551]],[20695552,366998.7,5620993.3,239.4,21065.5,0,[21095313]],[21095360,367992.0,5607002.9,258.6,16787.2,0,[21256848]],[21256896,392001.0,5655004.9,327.2,19348.9,0,[21618723,21622778]],[21622784,394986.7,5643009.8,251.8,21632.8,0,[21927602,21975802]],[21975808,392828.2,5627691.9,221.3,23594.9,0,[22345325,22518257,22519218,22544362]],[22544384,434999.6,5628984.5,445.7,13961.5,0,[22634681,22671148]],[22671168,363006.9,5681988.5,171.3,19775.5,0,[22740782,22793589,22898401,23099240]],[23099264,371004.9,5668001.1,259.3,25108.6,0,[23602777]],[23602816,364995.4,5656010.6,154.5,17145.7,0,[23698021]],[23698048,413006.7,5685027.7,376.4,12128.7,0,[23750039,23774317,23855461,23893874]],[23893888,419000.4,5674994.7,430.2,25522.3,0,[24025521,24317912]],[24317952,430990.7,5664010.1,435.2,37514.8,0,[24979860,25107014]],[25107072,432999.0,5695992.2,279.5,10843.7,0,[25230494]],[25230528,433000.1,5687003.7,397.1,9522.1,0,[25281648,25308620]],[25308672,433023.2,5681006.3,451.9,9553.0,0,[25314144,25359030,25362934,25390957]],[25390976,461994.7,5683982.8,548.9,21584.8,0,[25503372,25641106,25768306,25886190]],[25886208,464000.5,5668000.1,638.5,21564.0,0,[26186130,26327608]],[26327616,469000.5,5696009.8,493.9,12549.0,0,[26466437,26483714]],[26483776,489004.0,5699988.7,406.4,13505.7,0,[26641493]]];
export function i3sAddL1(rootKids) {
  if (rootKids.length !== I3S_L1.length || rootKids.some((k, i) => k !== I3S_L1[i][0])) return false;
  for (const [idx, e, n, h, r, lod, ch] of I3S_L1) if (!i3s.nodes.has(idx)) i3s.nodes.set(idx, { idx, c: [e, n, h], r, lod, ch, res: null, tex: null, vc: 0, texel: 0, st: 'none', t: 0, gl: null, fail: 0 });
  return true;
}

export const i3sPageUrl = p => I3S.url + '/nodepages/' + p;
export const i3sGeoUrl = res => I3S.url + '/nodes/' + res + '/geometries/0';   // Puffer 0: ungepackt (per gzip übertragen), nicht Draco
export const i3sTexUrl = res => I3S.url + '/nodes/' + res + '/textures/0';
export function i3sReset() { i3s.nodes.clear(); i3s.pages.clear(); i3s.l1 = null; i3s.root = null; i3s.drawn = []; i3s.gpu = 0; i3s.err = ''; i3s.jobs = 0; i3s.loaded = 0; i3s.mb = 0; i3s.qa = 1; i3s.up = []; }
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
// Soll das Mesh geladen werden? 'on' oder der Grund dagegen: 'off' (Preset nicht Foto 3D), 'map' (Spielkarte), 'dis' (DIS-Übung),
// 'land' (nicht NRW). probe: Adresse mit ?mesh=1 (Diagnose, erzwingt das Mesh). nrw: Gebiet liegt (teils) in NRW, in UTM 32.
export function i3sWanted(gfx, probe, rwOn, verbund, nrw) {
  if (gfx !== 'mesh' && !probe) return 'off';
  if (!rwOn) return 'map';
  if (verbund) return 'dis';
  return nrw ? 'on' : 'land';
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
  const look = n => { const c = i3sToMap(n.c, o), d = n.d = Math.hypot(c[0] - cam[0], c[1] - cam[1], c[2] - cam[2]); return { d, vis: i3sSeen(P, c, n.r) || d - n.r < I3S.nearR }; };
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
  draw.sort((a, b) => a.d - b.d);   // nah zuerst: früher Tiefentest (Abstand n.d einmal je Bild in look gerechnet, G2)
  return { draw, want, pages: [...pages] };
}
// Hochladen begrenzen (G2, Plan Grafik-Presets 3.3 Nr. 1): fertig geladene Teile warten in i3s.up ([{ n, ... }]). Je Bild lädt
// render.js höchstens eines in die Grafik, das der Kamera nächste zuerst (n.d aus der letzten Auswahl; ohne Abstand zuletzt).
// Nimmt es aus der Liste und liefert es, sonst null.
export function i3sNextUpload(q = i3s.up) {
  if (!q.length) return null;
  let k = 0;
  for (let i = 1; i < q.length; i++) if ((q[i].n.d ?? Infinity) < (q[k].n.d ?? Infinity)) k = i;
  return q.splice(k, 1)[0];
}
// Grafikspeicher eines Knotens (Schätzung): Puffer 20 Byte je Punkt, Textur RGBA mit Mipmaps
export const i3sBytes = n => n.vc*20 + n.texel*4*1.33;
// Speicher nachführen (Prüfbericht 10.11.): Braucht schon das Bild selbst mehr als drei Viertel der Grenzen, wird die Auswahl gröber
// (Faktor qa auf die Schwelle, um 25 % je Bild, höchstens 64); unter 45 % langsam wieder feiner (5 % je Bild). Vorher wuchs der
// Speicher über die Grenze, weil nur Teile außerhalb des Bildes freigegeben werden dürfen, und Teile luden immer wieder neu.
export function i3sAdapt(draw) {
  const mb = draw.reduce((s, n) => s + i3sBytes(n), 0)/1e6, n = draw.length;
  if (mb > 0.75*I3S.gpuMB || n > 0.75*I3S.maxNodes) i3s.qa = Math.min(64, i3s.qa*1.25);
  else if (mb < 0.45*I3S.gpuMB && n < 0.45*I3S.maxNodes) i3s.qa = Math.max(1, i3s.qa/1.05);
  return i3s.qa;
}
// Neue Abrufe nur, solange Zahl und Speicher der geladenen Teile unter den Grenzen liegen
export const i3sRoom = () => { let n = 0; for (const x of i3s.nodes.values()) if (x.st === 'ready' || x.st === 'load') n++; return n < I3S.maxNodes && i3s.gpu < I3S.gpuMB; };
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

// ---------- Kollision aus dem Mesh (M2, Nutzer Prompt 194/195) ----------
// Das Mesh ist 2,5D (eine Höhe je Lage, vermutet nach Katalog). Darum zwei Formen je feinem Teil, im eigenen Bezug des Teils
// (Ost, Nord, Höhe relativ zur Mitte der Box, unabhängig vom Gebiet): ein Höhenraster für alles Flache (Straße, Dach, Krone; Zelle
// 0,5 m, bei großen Teilen gröber, höchstens 256 je Seite) und die steilen Dreiecke (Wände, Stämme, Pfeiler) in 4-m-Zellen.
// physR: Teile bis zu diesem Radius bekommen Physik (Prompt 202: auch gröbere, damit Bild und Physik vom ersten sichtbaren Teil an
// passen; vorher nur bis 120 m, die Drohne stand bis zu 30 s 1,2 m im Mesh). Handy: physRLow (Speicher: Raster bis 256 KB je Teil).
export const I3S_PHYS = { cell: 0.5, maxCells: 256, steep: 0.5, flat: 0.3, grid: 4, physR: 2000, physRLow: 600, near: 150 };
export function i3sPhysBuild(pos, vc) {
  let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  for (let i = 0; i < vc; i++) { const e = pos[i*3], n = pos[i*3 + 1]; if (e < e0) e0 = e; if (e > e1) e1 = e; if (n < n0) n0 = n; if (n > n1) n1 = n; }
  const cs = Math.max(I3S_PHYS.cell, (e1 - e0)/I3S_PHYS.maxCells, (n1 - n0)/I3S_PHYS.maxCells), W = Math.max(1, Math.ceil((e1 - e0)/cs)), H = Math.max(1, Math.ceil((n1 - n0)/cs));
  const h = new Float32Array(W*H).fill(NaN), steep = [], G = I3S_PHYS.grid, cells = new Map();
  for (let t = 0; t + 2 < vc; t += 3) {
    const a = t*3, b = a + 3, c = a + 6, ax = pos[a], ay = pos[a + 1], az = pos[a + 2], bx = pos[b], by = pos[b + 1], bz = pos[b + 2], cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx, nl = Math.hypot(nx, ny, nz); if (nl < 1e-9) continue;
    const up = Math.abs(nz)/nl;   // Anteil nach oben (Höhe ist die dritte Achse)
    if (up < I3S_PHYS.steep) {   // steil: als Dreieck behalten, in die Zellen seines Grundrisses
      const k = steep.length/9; steep.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      for (let j = Math.floor((Math.min(ay, by, cy) - n0)/G); j <= Math.floor((Math.max(ay, by, cy) - n0)/G); j++)
        for (let i = Math.floor((Math.min(ax, bx, cx) - e0)/G); i <= Math.floor((Math.max(ax, bx, cx) - e0)/G); i++) { const key = j*4096 + i; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(k); }
    }
    if (up < I3S_PHYS.flat) continue;
    // flach genug: Zellmitten im Dreieck bekommen die höchste Höhe
    const den = (by - cy)*(ax - cx) + (cx - bx)*(ay - cy); if (Math.abs(den) < 1e-12) continue;
    for (let j = Math.max(0, Math.floor((Math.min(ay, by, cy) - n0)/cs)); j <= Math.min(H - 1, Math.floor((Math.max(ay, by, cy) - n0)/cs)); j++)
      for (let i = Math.max(0, Math.floor((Math.min(ax, bx, cx) - e0)/cs)); i <= Math.min(W - 1, Math.floor((Math.max(ax, bx, cx) - e0)/cs)); i++) {
        const px = e0 + (i + 0.5)*cs, py = n0 + (j + 0.5)*cs, u = ((by - cy)*(px - cx) + (cx - bx)*(py - cy))/den, v = ((cy - ay)*(px - cx) + (ax - cx)*(py - cy))/den;
        if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
        const z = az*u + bz*v + cz*(1 - u - v), o = j*W + i; if (!(h[o] >= z)) h[o] = z;
      }
  }
  return { e0, n0, cs, W, H, h, steep: new Float32Array(steep), cells };
}
// Höhe des Mesh an (x, z) in Kartenkoordinaten (o: Ursprung des Gebiets), aus den Physik-Teilen (feinster zuerst); NaN ohne Abdeckung.
// Bilinear zwischen den Zellmitten, leere Zellen zählen nicht.
export function i3sGroundAt(list, x, z, o) {
  for (const n of list) {
    const P = n.phys, le = x + o.ec - n.c[0], ln = -z + o.nc - n.c[1], fx = (le - P.e0)/P.cs - 0.5, fy = (ln - P.n0)/P.cs - 0.5;
    if (fx < -0.5 || fy < -0.5 || fx > P.W - 0.5 || fy > P.H - 0.5) continue;
    const i0 = Math.max(0, Math.min(P.W - 1, Math.floor(fx))), j0 = Math.max(0, Math.min(P.H - 1, Math.floor(fy))), i1 = Math.min(P.W - 1, i0 + 1), j1 = Math.min(P.H - 1, j0 + 1);
    const tx = Math.max(0, Math.min(1, fx - i0)), ty = Math.max(0, Math.min(1, fy - j0));
    let s = 0, w = 0;
    for (const [i, j, k] of [[i0, j0, (1 - tx)*(1 - ty)], [i1, j0, tx*(1 - ty)], [i0, j1, (1 - tx)*ty], [i1, j1, tx*ty]]) { const v = P.h[j*P.W + i]; if (v === v && k > 0) { s += v*k; w += k; } }
    if (w > 0) return s/w + n.c[2] - o.h;
    const v = P.h[Math.round(fy)*P.W + Math.round(fx)]; if (v === v) return v + n.c[2] - o.h;
  }
  return NaN;
}
// Steile Dreiecke im Umkreis R um (x, z), als Feld zu je 9 Werten in Kartenkoordinaten (out wird wiederverwendet)
export function i3sTrisNear(list, x, z, R, o, out = []) {
  out.length = 0;
  for (const n of list) {
    const P = n.phys, G = I3S_PHYS.grid, le = x + o.ec - n.c[0], ln = -z + o.nc - n.c[1], seen = new Set();
    for (let j = Math.floor((ln - R - P.n0)/G); j <= Math.floor((ln + R - P.n0)/G); j++) for (let i = Math.floor((le - R - P.e0)/G); i <= Math.floor((le + R - P.e0)/G); i++) {
      for (const k of P.cells.get(j*4096 + i) || []) {
        if (seen.has(k)) continue; seen.add(k);
        const T = P.steep, b = k*9;
        for (let q = 0; q < 3; q++) out.push(T[b + q*3] + n.c[0] - o.ec, T[b + q*3 + 2] + n.c[2] - o.h, -(T[b + q*3 + 1] + n.c[1] - o.nc));
      }
    }
  }
  return out;
}
// Teile für die Physik um (x, z): fertig, mit Raster, Hüllkugel bis physR, Mitte bis near + r weg; feinste (kleinste) zuerst
export function i3sPhysList(x, z, o) {
  const out = [];
  for (const n of i3s.nodes.values()) {
    if (n.st !== 'ready' || !n.phys) continue;
    const cx = n.c[0] - o.ec, cz = -(n.c[1] - o.nc);
    if (Math.hypot(cx - x, cz - z) < I3S_PHYS.near + n.r) out.push(n);
  }
  return out.sort((a, b) => a.r - b.r);
}
