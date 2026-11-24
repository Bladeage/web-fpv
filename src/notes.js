/* Versionshinweise und Quellen (Etappe F4). Ohne DOM. Die Versionshinweise stehen auch in docs/versionshinweise.md;
   der Test test/f4.test.mjs prüft, dass beide dieselben Überschriften und Punkte haben. */

// Neueste zuerst: [Überschrift, [Punkte]]
export const NOTES = [
  ['November 2026: Feinschliff', [
    'Einführung beim ersten Start, Hilfe in vier Abschnitten',
    'Lagebild vor dem Start und Auswertung nach dem Auftrag',
    'Neue Aufträge „Aufklärung“ und „Gemischt“',
    'Sprengladung fest mit den Aufträgen zum Zerstören verbunden, scharf ab 10 m über Grund',
    'Touch-Knöpfe für scharf schalten, Flugmodus und Zurückspulen',
    'Menüs neu gegliedert, Begriffe vereinheitlicht',
    'Über 40 Fehler behoben: Aufträge, echte Welt, Drohne und Steuerung']],
  ['November 2026: Echte Welt in ganz Deutschland und weltweit', [
    'Höhen, Luftbild und Gebäude für weitere Bundesländer',
    'Weltweite Höhen und Satellitenbild als Rückfall',
    'Straßen und Wald aus OpenStreetMap',
    'Zwischenspeicher nach Leistung des Geräts',
    'Karte zur Ortswahl mit Farben je Bundesland']],
  ['Oktober und November 2026: Grundlage', [
    'Parcours: Tore, Ringe, Slalom, Landung, Lieferung, Verfolgung',
    'Taktischer Flug: Fahrzeuge, Drohnen, Flugzeuge',
    'Echte Welt in NRW mit Gebäuden, Bäumen und 3D-Mesh',
    'Betaflight als Flugregler, Funke per USB']]
];

// Feste Quellen: [Was, Quelle und Lizenz]. Die Dienste der Länder kommen aus der Quellenliste dazu (creditRows).
export const CREDITS = [
  ['Programm', 'FPV-Simulator, GNU General Public License Version 3 (GPLv3). Quelltext: github.com/Bladeage/web-fpv'],
  ['Flugregler Betaflight', 'betaflight.com, GPLv3, als WebAssembly eingebaut'],
  ['Eingebautes Gebiet AXA Campus Köln', 'Geobasis NRW, Datenlizenz Deutschland – Zero 2.0'],
  ['3D-Mesh NRW (Grafik „Foto 3D“)', 'Digitaler Zwilling NRW, Geobasis NRW, Datenlizenz Deutschland – Zero 2.0'],
  ['Straßen in NRW', 'ALKIS vereinfacht, Geobasis NRW, Datenlizenz Deutschland – Zero 2.0'],
  ['Gewässer und Ortsnamen', 'Basis-DLM: Geobasis NRW (Datenlizenz Deutschland – Zero 2.0) und LGLN Niedersachsen (CC BY 4.0)'],
  ['Straßen und Wald außerhalb von NRW', '© OpenStreetMap-Mitwirkende, Open Database License (ODbL), Abruf über Overpass'],
  ['Ortssuche', '© OpenStreetMap-Mitwirkende, Open Database License (ODbL), Suche über Nominatim'],
  ['Satellitenbild, wo ein Luftbild fehlt', 'Enthält veränderte Copernicus-Sentinel-Daten (Sentinel-2), Abruf über Earth Search (Element 84)'],
  ['Grenzen der Bundesländer auf der Karte', '© BKG 2026, Datenlizenz Deutschland – Namensnennung 2.0 (dl-de/by-2-0), vereinfacht']
];
// Alle Zeilen für die Seite „Quellen und Lizenzen“: feste Quellen, dann jede Quelle der Liste mit ihrem Vermerk
export function creditRows(sources) {
  return [...CREDITS, ...sources.filter(s => s.attribution).map(s => [s.name, s.attribution])];
}
