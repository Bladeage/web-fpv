/* Ortssuche (Nutzer, Prompt 192): Namen und Adressen in Breite und Länge, etwa „Kölner Dom“ oder „51643 Bergisch Gladbach,
   Josef-Roemer-Str.“. Dienst: Nominatim (OpenStreetMap), frei, ohne Schlüssel, Zugriff aus dem Browser erlaubt (gesichert
   10.11.2026: beide Beispiele gefunden, Access-Control-Allow-Origin *). Daten © OpenStreetMap-Mitwirkende, ODbL. Regeln des
   Dienstes: höchstens eine Anfrage je Sekunde, keine Vorschläge während des Tippens; darum nur auf Enter oder Knopf.
   Ohne DOM, in Node testbar. */
export const GEOSEARCH = { url: 'https://nominatim.openstreetmap.org/search', gap: 1100, limit: 5, attribution: '© OpenStreetMap-Mitwirkende (ODbL), Suche über Nominatim' };
const gs = { last: 0 };
export const geoSearchUrl = q => GEOSEARCH.url + '?format=jsonv2&addressdetails=1&countrycodes=de&accept-language=de&limit=' + GEOSEARCH.limit + '&q=' + encodeURIComponent(q.trim());
// Kurzer Name aus dem langen Treffertext: die ersten zwei Teile, ohne Hausnummer allein („Kölner Dom, Köln“)
export function geoShortName(r) {
  const parts = String(r.display_name || '').split(',').map(s => s.trim()).filter(s => s && !/^\d+[a-z]?$/i.test(s));
  const city = (r.address && (r.address.city || r.address.town || r.address.village)) || '';
  const head = parts.slice(0, 2);
  if (city && !head.includes(city)) head[1] = city;
  return head.filter(Boolean).join(', ');
}
// Suchen: liefert [{ lat, lon, name, full }] (höchstens 5, nur Deutschland). net: rwNet(signal) mit text(url). Wartet bei Bedarf,
// damit zwischen zwei Anfragen mindestens 1,1 s liegen. now und wait sind für Tests austauschbar.
export async function geoSearch(q, net, now = () => Date.now(), wait = ms => new Promise(r => setTimeout(r, ms))) {
  if (!String(q || '').trim()) return [];
  const d = gs.last + GEOSEARCH.gap - now();
  if (d > 0) await wait(d);
  gs.last = now();
  const t = await net.text(geoSearchUrl(q));
  const list = JSON.parse(t || '[]');
  return list.map(r => ({ lat: +r.lat, lon: +r.lon, name: geoShortName(r), full: r.display_name || '' })).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon));
}
