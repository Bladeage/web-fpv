// HTML in reines ASCII-ASPX umwandeln. Node-Port von tools/to_aspx.py.
// Script-Teile bekommen \uXXXX (UTF-16, Zeichen über U+FFFF als Ersatzpaar),
// Style-Teile CSS-Escapes \XXXXXX, der Rest &#x..;. Zeilenenden werden CRLF.
// Bricht ab bei Nicht-ASCII im Ergebnis oder bei "<%" (SharePoint deutet das als Servercode).

const hex = (n, w) => n.toString(16).toUpperCase().padStart(w, '0');

function htmlPart(t) {
  let o = '';
  for (const c of t) { const n = c.codePointAt(0); o += n < 128 ? c : '&#x' + hex(n, 1) + ';'; }
  return o;
}
function jsPart(t) {
  let o = '';
  for (let i = 0; i < t.length; i++) { const n = t.charCodeAt(i); o += n < 128 ? t[i] : '\\u' + hex(n, 4); }
  return o;
}
function cssPart(t) {
  let o = '';
  for (const c of t) { const n = c.codePointAt(0); o += n < 128 ? c : '\\' + hex(n, 6); }
  return o;
}

export function toAspx(src) {
  src = src.replace(/\r\n?/g, '\n');
  const re = /(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/g;
  let out = '', pos = 0, m;
  while ((m = re.exec(src))) {
    const start = m.index + m[1].length;
    out += htmlPart(src.slice(pos, start));
    out += m[2] === 'script' ? jsPart(m[3]) : cssPart(m[3]);
    pos = start + m[3].length;
  }
  out += htmlPart(src.slice(pos));
  checkAspx(out);
  return out.replace(/\n/g, '\r\n');
}

export function checkAspx(s) {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127) throw new Error('ASPX: Nicht-ASCII-Zeichen an Position ' + i);
  }
  if (s.includes('<%')) throw new Error('ASPX: "<%" gefunden. SharePoint würde es als Servercode deuten.');
}
