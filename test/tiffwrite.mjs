// Hilfe für Tests (kein Test): kleines TIFF schreiben (Etappe Q1).
import { deflateSync } from 'node:zlib';

// Kleines TIFF schreiben. levels: [{ w, h, tw, th, vals(c, r) }]; bps 16 oder 32, fmt 1/2/3, comp 1 oder 8, pred 1/2/3.
export function tiff({ levels, bps = 32, fmt = 3, le = true, comp = 1, pred = 1, geo = null, spp = 1 }) {
  const B = bps/8*spp, parts = [], ifds = [];
  let pos = 8;
  const put = u8 => { const at = pos; parts.push(u8); pos += u8.length; return at; };
  for (const L of levels) {
    const across = Math.ceil(L.w/L.tw), down = Math.ceil(L.h/L.th), offs = [], cnts = [];
    for (let ty = 0; ty < down; ty++) for (let tx = 0; tx < across; tx++) {
      const raw = new Uint8Array(L.tw*L.th*B), dv = new DataView(raw.buffer);
      for (let y = 0; y < L.th; y++) for (let x = 0; x < L.tw; x++) {
        const c = Math.min(L.w - 1, tx*L.tw + x), r = Math.min(L.h - 1, ty*L.th + y), v = L.vals(c, r), o = (y*L.tw + x)*B;
        if (spp > 1) v.forEach((x, k) => { raw[o + k] = x; }); else if (fmt === 3) dv.setFloat32(o, v, pred === 3 ? false : le); else if (B === 2) dv.setInt16(o, v, le); else dv.setInt32(o, v, le);
      }
      let enc = raw;
      if (pred === 2) {   // waagrecht als ganze Zahl der Wertbreite
        enc = raw.slice(); const ev = new DataView(enc.buffer), g = o => B === 2 ? dv.getUint16(o, le) : dv.getUint32(o, le);
        for (let y = 0; y < L.th; y++) for (let x = L.tw - 1; x > 0; x--) { const o = (y*L.tw + x)*B, d = (g(o) - g(o - B) + 2**bps) % 2**bps; B === 2 ? ev.setUint16(o, d, le) : ev.setUint32(o, d, le); }
      } else if (pred === 3) {   // Bytes nach Wertigkeit, dann waagrecht differenziert
        enc = new Uint8Array(raw.length);
        for (let y = 0; y < L.th; y++) {
          const row = L.tw*B, tmp = new Uint8Array(row);
          for (let x = 0; x < L.tw; x++) for (let b = 0; b < B; b++) tmp[b*L.tw + x] = raw[y*row + x*B + b];
          for (let i = row - 1; i >= 0; i--) enc[y*row + i] = (tmp[i] - (i ? tmp[i - 1] : 0)) & 255;
        }
      }
      if (comp === 8) enc = new Uint8Array(deflateSync(enc));
      offs.push(put(enc)); cnts.push(enc.length);
    }
    const tags = [[256, 4, [L.w]], [257, 4, [L.h]], [258, 3, spp > 1 ? Array(spp).fill(bps) : [bps]], [259, 3, [comp]], [277, 3, [spp]], [317, 3, [pred]], [322, 4, [L.tw]], [323, 4, [L.th]], [324, 4, offs], [325, 4, cnts], [339, 3, [fmt]], [42113, 2, [...'-9999\0'].map(c => c.charCodeAt(0))]];
    if (geo && !ifds.length) tags.push([33550, 12, [geo.dx, geo.dx, 0]], [33922, 12, [0, 0, 0, geo.x, geo.y, 0]]);
    ifds.push(tags.sort((a, b) => a[0] - b[0]));
  }
  // Verzeichnisse hinten anhängen (Werte über 4 Byte davor)
  const S = { 2: 1, 3: 2, 4: 4, 12: 8 }, out = [], ifdAt = [];
  for (const tags of ifds) {
    const ext = tags.map(([, t, v]) => { if (S[t]*v.length <= 4) return null; const u = new Uint8Array(S[t]*v.length), d = new DataView(u.buffer);
      v.forEach((x, i) => t === 3 ? d.setUint16(i*2, x, le) : t === 4 ? d.setUint32(i*4, x, le) : t === 12 ? d.setFloat64(i*8, x, le) : d.setUint8(i, x)); return put(u); });
    const u = new Uint8Array(2 + tags.length*12 + 4), d = new DataView(u.buffer);
    d.setUint16(0, tags.length, le);
    tags.forEach(([tag, t, v], i) => { const e = 2 + i*12; d.setUint16(e, tag, le); d.setUint16(e + 2, t, le); d.setUint32(e + 4, v.length, le);
      if (ext[i] !== null) d.setUint32(e + 8, ext[i], le); else v.forEach((x, k) => t === 3 ? d.setUint16(e + 8 + k*2, x, le) : t === 4 ? d.setUint32(e + 8, x, le) : d.setUint8(e + 8 + k, x)); });
    ifdAt.push(put(u)); out.push(u);
  }
  ifds.forEach((tags, i) => new DataView(out[i].buffer).setUint32(2 + tags.length*12, i + 1 < ifds.length ? ifdAt[i + 1] : 0, le));
  const all = new Uint8Array(pos), hv = new DataView(all.buffer);
  all.set(le ? [0x49, 0x49] : [0x4d, 0x4d]); hv.setUint16(2, 42, le); hv.setUint32(4, ifdAt[0], le);
  let o = 8; for (const p of parts) { all.set(p, o); o += p.length; }
  return all;
}
