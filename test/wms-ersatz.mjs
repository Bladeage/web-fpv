// WMS-Ersatz für Tests (Etappe W1): kleiner OGC-WMS 1.3.0 mit Node-Bordmitteln. GetCapabilities mit festen Ebenen, GetMap der
// Höhenebene als unkomprimiertes Einkanal-GeoTIFF (32-Bit-Gleitkomma) einer bekannten Fläche. Prüft Achsenreihenfolge (EPSG:4326,
// Breite zuerst) und Größe. o: { fail (Fehler-XML), size (falsche Größe), empty (nur Füllwerte), log }
import { createServer } from 'node:http';

export const surface = (lat, lon) => 100 + 2000*(lat - 50.9) + 1500*(lon - 7.0) + 3*Math.sin(lat*2000) + 2*Math.cos(lon*1500);
export const ERSATZ_CAPS = `<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms"><Service><Name>WMS</Name><Title>Test Web Map Service</Title><MaxWidth>256</MaxWidth><MaxHeight>256</MaxHeight></Service>
<Capability><Request><GetCapabilities><Format>text/xml</Format></GetCapabilities><GetMap><Format>image/png</Format><Format>image/geotiff</Format><Format>image/tiff</Format></GetMap></Request>
<Layer><Title>Wurzel</Title><CRS>EPSG:4326</CRS><CRS>EPSG:3857</CRS>
<Layer queryable="0"><Name>Test_hgt_rgba</Name><Title>Hoehe RGBA</Title></Layer>
<Layer queryable="0"><Name>Test_photo</Name><Title>Luftbild</Title></Layer>
<Layer queryable="0"><Name>Test_hgt</Name><Title>Hoehe</Title></Layer>
</Layer></Capability></WMS_Capabilities>`;
// Unkomprimiertes TIFF, little endian, ein Streifen, float32
export function tiffF32(w, h, data, nodata = null) {
  const tags = [[256, 4, w], [257, 4, h], [258, 3, 32], [259, 3, 1], [262, 3, 1], [273, 4, 0], [277, 3, 1], [278, 4, h], [279, 4, w*h*4], [339, 3, 3]];
  const nd = nodata === null ? null : Buffer.from(String(nodata) + '\0');
  if (nd) tags.push([42113, 2, nd.length]);
  const ifd = 8, ifdLen = 2 + tags.length*12 + 4, extra = ifd + ifdLen, dataOff = extra + (nd && nd.length > 4 ? nd.length : 0);
  const b = Buffer.alloc(dataOff + w*h*4);
  b.write('II', 0); b.writeUInt16LE(42, 2); b.writeUInt32LE(ifd, 4); b.writeUInt16LE(tags.length, ifd);
  tags.forEach(([t, ty, v], i) => { const e = ifd + 2 + i*12; b.writeUInt16LE(t, e); b.writeUInt16LE(ty, e + 2);
    if (t === 42113) { b.writeUInt32LE(nd.length, e + 4); if (nd.length <= 4) nd.copy(b, e + 8); else { b.writeUInt32LE(extra, e + 8); nd.copy(b, extra); } return; }
    b.writeUInt32LE(1, e + 4); if (ty === 3) b.writeUInt16LE(t === 273 ? 0 : v, e + 8); else b.writeUInt32LE(t === 273 ? dataOff : v, e + 8); });
  for (let k = 0; k < w*h; k++) b.writeFloatLE(data[k], dataOff + k*4);
  return b;
}
export function startErsatz(o = {}) {
  const calls = [];
  const srv = createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), q = Object.fromEntries([...u.searchParams].map(([k, v]) => [k.toUpperCase(), v]));
    calls.push(q);
    if (q.REQUEST === 'GetCapabilities') { res.writeHead(200, { 'content-type': 'text/xml', 'access-control-allow-origin': '*' }); res.end(ERSATZ_CAPS); return; }
    if (q.REQUEST !== 'GetMap' || q.LAYERS !== 'Test_hgt' || q.CRS !== 'EPSG:4326' || o.fail) {
      res.writeHead(200, { 'content-type': 'text/xml' }); res.end('<?xml version="1.0"?><ServiceExceptionReport><ServiceException code="LayerNotDefined">Ebene unbekannt</ServiceException></ServiceExceptionReport>'); return;
    }
    const [minLat, minLon, maxLat, maxLon] = q.BBOX.split(',').map(Number), w = +q.WIDTH, h = +q.HEIGHT, W = o.size ? w - 1 : w, d = new Float32Array(W*h);
    for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) {
      const lat = maxLat - (y + 0.5)*(maxLat - minLat)/h, lon = minLon + (x + 0.5)*(maxLon - minLon)/w;
      d[y*W + x] = o.empty ? -9999 : surface(lat, lon);
    }
    res.writeHead(200, { 'content-type': 'image/tiff', 'access-control-allow-origin': '*' }); res.end(tiffF32(W, h, d, o.empty ? -9999 : null));
  });
  const ready = new Promise(r => srv.listen(o.port || 0, '127.0.0.1', r));
  return { ready, calls, get url() { return 'http://127.0.0.1:' + srv.address().port + '/ows'; }, close: () => srv.close() };
}
