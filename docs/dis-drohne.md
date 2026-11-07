# Unsere Drohne in VBS4: Konzept (Stand 07.11.2026, Prompt 133)

Nur Planung, noch kein Code. Grundlage: Recherche zu SISO-REF-010, DIS 7 und Höhenbezug sowie die Antworten von k5.2 (`docs/dis-bruecke.md`).
Einstufung: **gesichert** = in der Quelle gelesen (Quellen am Ende). **vermutet** = nicht selbst geprüft.

Werte für Entity Type, Force ID, Dead Reckoning und Appearance stammen aus SISO-REF-010 v37 (25.05.2026). Reprinted with permission from SISO Inc.

## Weg der Daten

```
Simulator (Browser) --WebSocket, JSON, bis 30/s--> Brücke (Node, nur Bordmittel) --DIS 7, UDP--> VBS Gateway --> VBS4
```

- Der Simulator kennt nur seine Kartenkoordinaten (Mitte des Gebiets, x Osten, z Süden, y Höhe über dem Start). Daraus rechnet er Breite, Länge und Höhe über NHN (das kann er schon für das OSD).
- Die Brücke rechnet in Erdkoordinaten (ECEF) um, baut die Entity State PDU und sendet sie per UDP. Sie empfängt auch die PDUs von VBS und gibt sie als JSON an den Browser.
- Warum eine Brücke: Ein Browser kann kein UDP senden (gesichert, Web-Plattform). Die Brücke läuft auf dem Rechner neben dem Browser.

## Was wir senden: Entity State PDU

144 Byte, Netzwerk-Bytefolge (gesichert aus freiem Quelltext open-dis; die Norm IEEE 1278.1-2012 ist nicht frei, nicht gelesen).

| Feld | Unser Wert |
|---|---|
| Protokollversion | 7 (DIS 7). Beim Empfang auch 6 annehmen (gleiche Länge, Byte 10 ignorieren) |
| Übungsnummer, Site, Application | von der VBS-Übung (offen, Fabian/k5.2) |
| Force ID | 1 = Freund (einstellbar: 2 Feind, 3 neutral) |
| Entity Type | **1.2.78.50.7.0.0**: Plattform, Luft, Deutschland, unbemannt, AirRobot AR 100-B (deutscher Quadrokopter, seit Jahren in der Liste, gesichert). Ersatz: **1.2.0.50.1.0.0** „Generic UAV“ |
| Ort | X, Y, Z in Metern, geozentrisch (ECEF, WGS84) |
| Geschwindigkeit | m/s in ECEF |
| Lage | psi, theta, phi in Radiant, bezogen auf ECEF |
| Dead Reckoning | 4 = RVW (Lage dreht mit, Weg mit Beschleunigung, Weltachsen). Rückfall 2 = FPW, falls VBS ruckelt |
| Marking | „FPV1“ (ASCII, 11 Zeichen) |
| Appearance | siehe Zustände |

Wichtig: Eine Drohne erscheint in VBS nur, wenn ihr 7er-Wert in der Zuordnung des Gateways steht (gesichert, k5.2). Vor dem ersten Test prüft k5.2 mit `sisocheck` und der privaten Modellliste, ob VBS für 1.2.78.50.7 ein Modell hat. Sonst nehmen wir den Ersatzwert oder einen Wert, den VBS kennt. Die neuen Werte „Group 1 UAS“ aus v37 kennt VBS 26.1 vermutlich noch nicht.

## Umrechnung

1. **Ort:** Kartenkoordinate → UTM 32 → Breite und Länge (vorhanden: `realworld.rwLatLon`).
2. **Höhe:** DIS braucht die Höhe über dem Ellipsoid. Unsere Höhen sind Normalhöhen (NHN, DHHN2016). Ellipsoidische Höhe = NHN-Höhe + Quasigeoidhöhe (BKG, Modell GCG2016, gesichert). In NRW liegt der Wert zwischen 42,5 m (Minden-Lübbecke) und 48,5 m (südlich Siegen), gesichert. Wir setzen einen festen Wert je Gebiet (Schätzung für die Eifel um Monschau: etwa 47 m, Annahme: Lage zwischen Rheinland und Siegen). Ohne diesen Wert flöge die Drohne in VBS etwa 45 m zu tief.
3. **ECEF:** Breite, Länge, Höhe nach WGS84 in X, Y, Z (Standardformel). ETRS89 und WGS84 weichen unter 1 m ab (vermutet).
4. **Lage:** Aus Kurs, Nicken und Rollen die Drehmatrix Körper → Nord-Ost-Unten bilden, mit der Matrix Nord-Ost-Unten → ECEF (aus Breite und Länge) multiplizieren, daraus psi = atan2(m21, m11), theta = −asin(m31), phi = atan2(m32, m33). Die Formeln in open-dis passen dazu (gesichert gelesen). Vor dem Einsatz mit einem Test hin und zurück rechnen.
5. **Geschwindigkeit:** von Karte (Osten, Süden, oben) nach Nord-Ost-Unten, dann nach ECEF.

## Wann wir senden

- Wenn die Vorhersage von VBS (Dead Reckoning) mehr als 1 m oder 3° von unserer Lage abweicht, sonst spätestens alle 5 s (Herzschlag Luft). Werte aus dem Quelltext von KDIS, nicht aus der Norm gelesen.
- Höchstens 30 PDUs je Sekunde (Vorschlag; unsere Physik rechnet 240-mal je Sekunde).

## Zustände (Appearance, Luft)

| Bei uns | In DIS (Bits gesichert) |
|---|---|
| Fliegt | Damage 0, Power Plant On (Bit 22) |
| Absturz | Damage 3 = zerstört (Bit 3–4), Propulsion Killed (Bit 1), Power Plant aus, Dead Reckoning 1 (Static) |
| Eingefroren (Taste F) | Is Frozen (Bit 21): VBS sagt nichts voraus |
| Flug beendet | einmal State = deaktiviert (Bit 23) senden (vermutet übliche Praxis) |

## Was wir empfangen

- Alle Entity State PDUs der Übung. Anzeige im Umkreis (Vorschlag 1,5 km), höchstens 50 Einheiten.
- **Zeitlimit je Art statt fester 12 s:** 2,4 × Herzschlag, also Luft 12 s, Land 132 s (Werte aus KDIS). Mit festen 12 s würden stehende Fahrzeuge verschwinden. Der Herzschlag in VBS ist einstellbar; Wert am Gateway erfragen. Ändert den Plan in `docs/dis-bruecke.md`.
- Darstellung über unsere Grundtypen (nächste Etappe). Zuordnung nach Kind, Domain, Kategorie und Unterkategorie. Gesichert: Die Kategorie trennt Kette und Rad nicht (Puma, Marder, Fennek sind Kategorie 2; Boxer, Fuchs, Dingo und Bergepanzer Kategorie 3; MARS Kategorie 4). Für Kette und Rad braucht es die Unterkategorie je Land oder eine Annahme. Was nicht passt, wird ein Quader nach Domain.

## Lizenz: was ins öffentliche Repo darf

- **Ja:** einzelne SISO-Werte und unsere Zuordnung zu den Grundtypen, mit dem Vermerk „Reprinted with permission from SISO Inc.“ im Code und in diesem Dokument. Grund: SISO-REF-010 erlaubt Kopie und abgeleitete Werke mit diesem Vermerk (XML für alle Zwecke, Dokumentation nichtkommerziell; gesichert). Keine Rechtsberatung.
- **Nein:** die VBS-Modellliste und alles mit VBS-Klassennamen (Herstellerinhalt, nur in `private/`). Hinweis: In diesem Container ist `private/` leer; die Liste liegt bei Fabian.
- **Nicht nötig:** die ganze SISO-XML, fremder Quelltext. Den Kodierer schreiben wir selbst.

## Etappen (Vorschlag)

1. **D1 Kodierer:** Modul ohne DOM (`dis.js`): Entity State bauen und lesen, ECEF und Lage hin und zurück, Zustände. Tests in Node, ohne Netz.
2. **D2 Brücke:** `tools/dis-bruecke.mjs` mit Node-Bordmitteln (UDP über `dgram`, WebSocket selbst, nur 127.0.0.1). Test mit einem eigenen UDP-Empfänger.
3. **D3 Simulator:** Schalter „Verbund“ (Vorgabe aus), Senden der eigenen Drohne, fremde Einheiten als Grundtypen.
4. **D4 Probe mit VBS:** über k5.2 (Testclient `bruecke`), erst nach Freigaben.

## Offene Fragen (an Fabian oder k5.2)

Am 07.11.2026 als 14 Fragen direkt an k5.2 geschickt (Prompt 134): Zuordnung unserer Drohne (sisocheck), unbekannte Einheiten, DIS-Version, Ports, Exercise/Site/Application, Herzschlag und Zeitlimit, Lizenz des Gateways, Ort der Brücke und Firewall, Dead Reckoning 4, Appearance-Bits, Höhenbezug, Testgelände Monschau, Regel Kette/Rad je Kategorie (nur Zahlen), Testclient und Mitschnitt. Antwort steht aus.


- Hat VBS ein Modell für 1.2.78.50.7 oder 1.2.0.50.1? (`sisocheck`)
- Ports, Übungsnummer, Site und Application, DIS 6 oder 7, Herzschlag am Gateway.
- Ist das Gateway lizenziert? Darf die Brücke auf dem Rechner laufen (Firewall)?
- Welches Gelände nutzt die Übung? Gleiches Gebiet wie bei uns (k5.2 kann es mit `aoi2vbs4` bauen)?

## Quellen

- SISO-REF-010 v37 (XML, Lizenztext im Kopf), Spiegel: https://github.com/ngjunsiang/siso-ref-010-xml ; offiziell: https://www.sisostandards.org/page/ReferenceDocuments
- SISO-REF-010 v28 (PDF, Lizenz S. 2): https://www.mixr.dev/assets/pages/interop/siso-ref-010-v28.pdf
- Aufbau der PDU: open-dis-python, https://github.com/open-dis/open-dis-python ; Lage: open-dis Java `EulerConversions.java`, https://github.com/open-dis/opendis7-java
- Herzschlag und Schwellen: KDIS, https://kdis.sourceforge.net/classdoc/_k_symbolic_names_8h_source.html
- Höhe: BKG zu GCG2016, https://sg.geodatenzentrum.de/web_public/gdz/dokumentation/eng/quasigeoid_eng.pdf ; Bezirksregierung Köln, Normalhöhen in NRW (Stand 3/2016), https://www.duesseldorf.de/fileadmin/Amt62/vermessung/pdf/pub_geobasis_normalhoehen.pdf
