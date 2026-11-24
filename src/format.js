/* Zeitformate für OSD und Meldungen. Ohne DOM. */

export function fmtTime(t) {
  if (t === null || t === undefined) return '–:––.––';
  const c = Math.round(t*100), m = Math.floor(c/6000), s = (c - m*6000)/100;   // erst runden: sonst „0:60.00“
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
}
// Fehlermeldung beim Laden eines Orts in einfachem Deutsch: Ursache und was der Nutzer tun kann (F1). Die technische Meldung
// bleibt in Klammern dahinter, für die Fehlersuche.
export function loadErrText(msg) {
  const m = String(msg || ''), host = (m.match(/(?:zu|von) ([\w.-]+\.[a-z]{2,})/) || m.match(/^([\w.-]+\.[a-z]{2,}) /) || [])[1], who = host ? 'Der Dienst ' + host : 'Der Datendienst';
  const t = /Abgebrochen/.test(m) ? 'Laden abgebrochen.'
    : /Keine Verbindung/.test(m) ? who + ' ist nicht erreichbar. Prüfe deine Internetverbindung. Geht das Internet, ist der Dienst gestört: später noch einmal versuchen.'
    : /antwortet nicht/.test(m) ? who + ' antwortet zu langsam. Später noch einmal versuchen oder einen anderen Ort wählen.'
    : /antwortet \d+/.test(m) ? who + ' meldet einen Fehler. Später noch einmal versuchen oder einen anderen Ort wählen.'
    : /keine Quelle hinterlegt/i.test(m) ? 'Für diesen Ort sind keine Daten hinterlegt. Wähle einen anderen Ort auf der Karte.'
    : /Keine gültigen Höhen|nur Füllwerte/.test(m) ? 'Für diesen Ort liefert der Dienst keine Höhen. Der Ort liegt vermutlich am Rand oder außerhalb des Gebiets. Wähle einen Ort weiter innen.'
    : /Speicher|Quota/i.test(m) ? 'Der Speicher im Browser ist voll. Unter „Daten und Quellen“ alte Orte löschen.'
    : /meldet:/.test(m) ? who + ' lehnt die Anfrage ab. Einen anderen Ort wählen oder die Quelle unter „Daten und Quellen“ prüfen.'
    : 'Der Ort konnte nicht geladen werden. Noch einmal versuchen oder einen anderen Ort wählen.';
  return /Abgebrochen/.test(m) ? t : t + ' (Technisch: ' + m.slice(0, 140) + ')';
}
export function fmtClock(t) { const m = Math.floor(t/60), s = Math.floor(t - m*60); return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }

// Breite, Länge aus Text lesen: „50.5547, 6.2425“, „50,5547 6,2425“, „50.5547 N 6.2425 E“ (auch Komma als Dezimalzeichen).
// Rückgabe [Breite, Länge] in Grad oder null.
export function parseLatLon(t) {
  const s = String(t || '').replace(/[NnEeOo°]/g, ' ').trim();
  let m = s.match(/^(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)$/);   // Punkt als Dezimalzeichen
  if (!m) m = s.replace(/(\d),(\d)/g, '$1.$2').match(/^(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)$/);   // Komma als Dezimalzeichen
  if (!m) return null;
  const lat = +m[1], lon = +m[2];
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? [lat, lon] : null;
}
