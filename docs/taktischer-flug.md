# Plan „Taktischer Flug“ (Entwurf, 08.11.2026)

Quelle: Plan von k5.2 nach Fabians Auftrag (Nachricht vom 08.11.2026). Noch nicht freigegeben; Umsetzung schrittweise, je Schritt eine Etappe. Vorgaben Fabian laut k5.2: großes Bild, schrittweise, universell, ohne VBS-Bezug im Code.

## Ziel
- Einheiten eines DIS-Partners richtig darstellen: Ort, Lage, Tempo, Richtung, Typ, Zustand.
- Wahl zwischen einfacher Aufklärungsdrohne und Drohne mit Wirkmittel, das beim Aufprall wirkt. Zuerst einfache Wirkmittel.

## Menü
- Hauptmenü: „Parcours-Flug“ (die heutigen Modi) oder „Taktischer Flug“.
- Taktischer Flug: erst Ort (Echte Welt oder DIS-Übung mit „Dort fliegen“), dann Drohne mit Wirkmittel.

## Funktionsumfang (nur als Liste von Funktionen; nichts im Aussehen oder in Namen von einem bestehenden Produkt übernehmen)
- Drohnen-Voreinstellung: Größe, Landegestell; wirkt auf Gewicht, Schwerpunkt, Flugverhalten.
- Wirkmittel: keins (Aufklärung) und einfache Arten; Zünder manuell oder bei Aufschlag; Kontaktdrähte (verdecken Bild, Schwerpunkt nach vorn). Wirkmittel machen schwerer, Schwerpunkt nach unten.
- Sensor: Tag, Wärmebild (weiß-heiß, schwarz-heiß), Nachtsicht, im Flug umschaltbar; Bildwinkel, Kamerawinkel, analoge Verzerrung, OSD-Varianten.
- Akku: Größe, Kapazität, Leistungsabfall, Temperatur.
- Datenlink: Funk (Antenne, Gewinn, Störung getrennt für Steuerung und Bild) oder Glasfaser (Spulenlänge, nicht störbar, Abbruch am Spulenende).
- Mission: Startpunkt, Funk- und Störsender, Umgebungsrauschen, Zeit, Wetter, Temperatur, Zahl der Drohnen.
- Auswertung: Flugbahn 3D, Flugzeit, Strecke, Restakku, Wirkmittel, Schaden je Ziel; Versuche speichern und vergleichen.

## DIS
- Einheiten: Ort (ECEF), Lage (psi, theta, phi), Tempo; Weiterrechnen nach dem Dead-Reckoning-Verfahren aus der PDU (heute nur linear); Typklassen aus SISO-REF-010 (Grundtypen gibt es schon, `src/distypes.js`); Seite, Marking, Zustand (zerstört, beschädigt, abgemeldet); Plausibilitätsfilter (Höhe, Tempo je Bereich).
- Wirkung: beim Einschlag Detonation PDU (Ort, Munitionsart nach SISO, Zünder, Ergebnis), danach eigener Zustand „zerstört“, dann abmelden. Ob der Partner Schaden und Effekt aus einer fremden Detonation zeigt, testet k5.2.
- Gelände gleich zum Partner: allgemeine Geländequelle „WMS-Höhendienst (URL)“. Gemessen bei VBS: Höhe als float32-GeoTIFF, schon über dem Ellipsoid (Cologne Airport 123,04 m). Abruf vermutlich über die Brücke (anderer Rechner, http), CORS ungeprüft.

## Reihenfolge (Vorschlag k5.2; Aufwand geschätzt)
1. Einheiten richtig darstellen (Dead Reckoning, Lage, Typklassen, Zustand, Filter). Mittel.
2. Menü: Parcours-Flug und Taktischer Flug. Klein.
3. Drohnen-Voreinstellungen mit Wirkmittel, Zünder, Sensor, Akku, mit Wirkung aufs Flugmodell. Mittel.
4. Einschlag und Wirkung: lokal Effekt und Treffer, über DIS die Detonation PDU. Mittel.
5. Gelände per WMS über die Brücke. Mittel.
6. Datenlink, Störsender, Glasfaser. Mittel.
7. Auswertung nach dem Flug. Mittel.

## Anmerkungen web-fpv
- Tempo-Grenze 300 m/s ist für Luftfahrzeuge zu niedrig; Vorschlag: je Bereich (Boden etwa 150 m/s, Luft etwa 1000 m/s).
- Schritt 5 löst den Höhenunterschied zur VBS-Standardkarte an der Wurzel (gleiches Gelände); der automatische Höhenabgleich wäre dann nur Rückfall.
