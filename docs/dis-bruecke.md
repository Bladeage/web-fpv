# DIS-Brücke zu VBS4 (Planung, Stand 06.11.2026, noch nicht begonnen)

Konzept für das Senden unserer Drohne (Entity Type, Umrechnung, Zustände, Lizenz): `docs/dis-drohne.md` (07.11.2026).

Ziel: Der FPV-Simulator nimmt an einer VBS4-Übung teil. Der Simulator bleibt klein, ein separates Brückenprogramm übersetzt.
Keine zusätzlichen Lizenzen (nur VBS4 selbst). HLA nur über das Gateway eines Übungsverbunds, wir sprechen DIS.

## Aufbau

```
Browser (FPV)  --WebSocket, JSON, 20-30/s-->  Brücke (Node, nur Bordmittel)  --DIS/UDP-->  VBS4
               <--fremde Einheiten----------                                <------------
```

- FPV: Modul „Verbund“ (Schalter, Vorgabe Aus). Sendet Ort, Lage, Tempo in Kartenkoordinaten, zeigt fremde Einheiten.
- Brücke: WebSocket nur auf 127.0.0.1, Herkunft geprüft. Kartenkoordinaten <-> Erdkoordinaten (Kartenmitte als Breite/Länge, Nordrichtung), DIS Entity State PDU senden und empfangen, Bewegung vorhersagen (Dead Reckoning), Einheiten ohne Meldung entfernen (Zeitlimit je Art: Luft 12 s, Land 132 s; siehe `docs/dis-drohne.md`).
- VBS4: DIS mit gleicher Übungsnummer und Port, unsere Drohnenart einem VBS4-Modell zuordnen (Menüs beim Nutzer prüfen).

## Was wird wo dargestellt

### Von uns nach VBS4

| Was | Wie in DIS | Vorschlag |
|---|---|---|
| Eigene Drohne | Entity State: Plattform, Luft, kleines UAS (Multikopter). Ort, Lage, Tempo | immer |
| Absturz | Erscheinungsbild „zerstört“ | immer |
| Pilot mit Funke | Entity State: Lebewesen (Person), steht | optional |
| Eigene Ziele (Jagd, Fahrzeuge, Ballons) | eigene Einheiten | nein (nur lokal, sonst doppelt mit VBS4-Einheiten) |
| Tore, Ringe, Stadt, Bäume | nicht übertragbar (DIS kennt kein Gelände) | nein |
| Videobild der Drohne | nicht in DIS | nein |

### Von VBS4 zu uns

| VBS4 meldet | Darstellung bei uns | Hinweis |
|---|---|---|
| Fahrzeuge am Boden | vorhandenes Fahrzeugmodell, Farbe nach Seite (Freund/Feind/neutral) | auf Bodenhöhe 0 setzen |
| Flugzeuge | Flugzeugmodell aus „Jagd Flugzeuge“ | |
| Hubschrauber | Hubschraubermodell | |
| Drohnen (UAS) | Multikoptermodell | |
| Personen | Figur wie der Pilot, andere Farben | auf Bodenhöhe 0 setzen |
| Schiffe | einfaches Bootsmodell (neu) oder Quader | |
| Unbekannt | Quader nach gemeldeter Größe | |
| Zerstört | dunkel, schief (wie getroffene Fahrzeuge) | |
| Gelände, Gebäude, Wetter, Uhrzeit | nicht übertragen | Gelände muss getrennt zusammenpassen |

- Nur Einheiten im Umkreis (Vorschlag 1,5 km um die Kartenmitte), höchstens 50 gleichzeitig (Leistung).

## Offene Entscheidungen

- Gelände-Abgleich: VBS4-Gelände und unsere Karte passen nicht zusammen (Höhen, Gebäude). Möglichkeiten: flaches Gebiet in VBS4 wählen; Bodeneinheiten bei uns auf y = 0; später reale Karte am selben Ort.
- Pilot an VBS4 senden?
- Kollision mit VBS4-Einheiten bei uns?
- VBS4-Einheiten als Ziele für die Jagd?

## Antwort der VBS-Instanz k5.2 (06.11.2026, Teil 1, ohne Modellliste)

Anfrage: `docs/vbs-anfrage.md`. Quelle von k5.2: eigene Zusammenfassung des VBS-Gateway-Handbuchs 24.2.2 im Repo `bladeage/vbs-tools`. Am VBS-Rechner wurde nichts geändert. In Klammern die Einstufung von k5.2.

- **Umgebung:** VBS4 26.1.3, VBS Gateway installiert (gesichert). Ob die Lizenz das Gateway freischaltet: offen. DIS senden und empfangen über den DIS-Adapter des Gateways, dazu HLA RPR1/RPR2 und NETN4 (gesichert). Start mit `-gateway`, Einstellungen in `<VBS>\Settings\Gateway_Settings.xml` und über die Weboberfläche. DIS 6 oder 7: ungeprüft.
- **Netz:** Unicast, Multicast oder Broadcast; getrennte Ports für Senden und Empfangen; Exercise ID überall gleich; Application ID je Gateway eindeutig (gesichert). Bewährt: Unicast an feste IP, feste Ports je Richtung (beobachtet). Konkrete Werte gibt es noch nicht. Firewall-Freigabe für ein eigenes Programm entscheidet Fabian.
- **PDUs:** Entity State, Designator, Fire, Detonation, Electromagnetic Emission, IFF, SetData (gesichert). Heartbeat je Einheit einstellbar; Dead Reckoning ausgehend wählbar (1 Static bis 9 FVB), eingehend geglättet (gesichert). Schaden kommt nur in Stufen 100/66/33/0 an (beobachtet).
- **Modellliste:** noch nicht geliefert, braucht Fabians OK. Die Zuordnung VBS-Modell zu DIS liegt im Gateway (`VBS_to_SISO.dbo`, `EntityClasses.dbo`), CSV-Export über die Mapping-Seite der Gateway-Oberfläche. Herstellerinhalt, geht nie ins Repo. Die SISO-Tabelle (SISO-REF-010) hat eine eigene Lizenz: Weitergabe nur mit dem Vermerk „Reprinted with permission from SISO Inc.“.
- **Unsere Drohne in VBS:** Eine eingehende Einheit erscheint nur, wenn ihr 7er-Wert in der Mapping-Tabelle steht (gesichert). Mit „Show Unknown Entities“ erscheint sonst ein Platzhalter (roter Pfeil), ohne die Option gar nichts (gesichert). Passendes Multikopter-Modell: ungeprüft. Sendewert vermutet Plattform/Luft (1.2.x), genaue Kategorie aus SISO-REF-010; k5.2 hat das Werkzeug `sisocheck` zum Prüfen.
- **Gelände:** k5.2 baut eigene Gelände aus offenen Daten (`aoi2vbs4`, EPSG:4326; Höhen Client ellipsoidisch, World Server EGM96). Welches Gelände die Übung nutzt, sagt Fabian. VBS zeigt MGRS und Breite/Länge, geozentrische Koordinaten vermutlich nicht. Also rechnen wir WGS84 nach ECEF selbst.
- **Testmaterial:** DIS-Mitschnitt (pcap) nur mit Fabians OK. Lieferbar: Doku-Auszüge, `sisocheck` für unsere 7er-Werte, Proben im laufenden VBS über das Modul `bruecke` (Testclient).
- **Grundtypen:** passen. Ergänzen: Schützenpanzer Rad neben Kette, Sammeltyp Pionier/Bergepanzer. Wichtig: nach Kategorie (4. Feld) und Unterkategorie gruppieren, nicht nach Klassennamen; unscharfe Zuordnung hat im Test Kategorien verwechselt (beobachtet).

Folgerungen für die Brücke (vermutet, noch nicht umgesetzt):
- Höhenbezug klären: unsere Höhen sind NHN (DGM NRW), VBS-Client ellipsoidisch, World Server EGM96. Für die Höhe im Entity State ist der Unterschied in NRW etwa 45 m (Geoidundulation, Schätzung) und darf nicht fehlen.
- Gelände gemeinsam: k5.2 kann mit `aoi2vbs4` dasselbe 1-km-Gebiet als VBS-Gelände bauen. Dann passen Ort und Gebäude zusammen.
- Offene Freigaben bei Fabian: Modellliste (Auszug), pcap, Firewall, Gateway-Lizenz.

## Modellliste von k5.2 (06.11.2026, Teil 2)

- Fabian hat die volle Liste freigegeben; sie kommt als Datei `vbs4-26.1-modelle.csv` (1,5 MB, 9 882 Zeilen) über Fabian.
- **Nicht öffentlich machen.** Dieses Repo ist öffentlich (GitHub Pages). Die Datei gehört nur nach `private/` (in `.gitignore`), nie in einen Commit. Auch daraus abgeleitete Tabellen mit SISO-Werten nicht einchecken, bevor die Lizenzfrage geklärt ist (SISO-REF-010: „Reprinted with permission from SISO Inc.“).
- Spalten: klasse, anzeigename, art, simulation, vehicleclass, faction, seite (EAST, WEST, GUER, CIV), siso, kind, domain, country, category, subcategory, specific, extra, tuerme, mitfahrer, max_kmh. Keine Maße (nur im laufenden VBS messbar, k5.2 macht das auf Wunsch).
- Mengen (davon mit SISO-Wert): Kettenfahrzeug 1 234 (924), Radfahrzeug 2 222 (1 749), Krad 20 (18), Flugzeug 217 (165), Hubschrauber 166 (136), UAV Fläche 39 (28), UAV Hubschrauber 15 (14), UAV Kette 19 (11), UAV Rad 4 (2), Wasserfahrzeug 201 (151), U-Boot 20 (20), Luftkissenfahrzeug 4 (3), Person 5 721 (1 146).
- Gruppieren: nach domain + category (+ subcategory); ohne SISO-Wert nach art und vehicleclass. Fehlende SISO-Felder als 0 lesen. Was das Gateway wirklich sendet, kann abweichen (eigene Zuordnungen im Gateway).
- Vorschlag: Die Brücke ordnet zur Laufzeit zu (nach den Feldern der empfangenen Entity State PDU). Im Simulator liegen nur die etwa 18 Grundtypen; keine VBS-Namen, keine Liste.
