# DIS-Brücke zu VBS4 (Planung, Stand 06.11.2026, noch nicht begonnen)

Ziel: Der FPV-Simulator nimmt an einer VBS4-Übung teil. Der Simulator bleibt klein, ein separates Brückenprogramm übersetzt.
Keine zusätzlichen Lizenzen (nur VBS4 selbst). HLA nur über das Gateway eines Übungsverbunds, wir sprechen DIS.

## Aufbau

```
Browser (FPV)  --WebSocket, JSON, 20-30/s-->  Brücke (Node, nur Bordmittel)  --DIS/UDP-->  VBS4
               <--fremde Einheiten----------                                <------------
```

- FPV: Modul „Verbund“ (Schalter, Vorgabe Aus). Sendet Ort, Lage, Tempo in Kartenkoordinaten, zeigt fremde Einheiten.
- Brücke: WebSocket nur auf 127.0.0.1, Herkunft geprüft. Kartenkoordinaten <-> Erdkoordinaten (Kartenmitte als Breite/Länge, Nordrichtung), DIS Entity State PDU senden und empfangen, Bewegung vorhersagen (Dead Reckoning), Einheiten ohne Meldung nach 12 s entfernen.
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
