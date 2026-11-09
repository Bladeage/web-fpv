# Prüfung: 3D-Mesh NRW für die echte Welt (Prompt 181, 09.11.2026)

Frage: Können Kölner Dom, Hohenzollernbrücke und Schiffe so aussehen wie im Digitalen Zwilling NRW?
Ergebnis: Ja, technisch und rechtlich möglich. Noch nichts gebaut.

## Gesichert (am Dienst gemessen)

- Dienst: `https://www.gis.nrw.de/geobasis/3D_mesh/SceneServer`, Ebene 0 „Mesh“, Typ IntegratedMesh, I3S Version 1.7.
- Abdeckung: ganz NRW (Ausdehnung 280 bis 532 km Ost, 5576 bis 5822 km Nord).
- Lizenz laut Dienst: „Datenlizenz Deutschland Zero 2.0“. Jede Nutzung ist ohne Bedingungen erlaubt.
- Zugriff aus dem Browser erlaubt (`Access-Control-Allow-Origin: *`).
- Koordinaten: UTM 32 (EPSG 25832), Höhe über NHN. Das ist dasselbe System wie unsere Landesdaten.
- Geometrie: Dreiecke ohne Index, je Punkt Lage (3 × Float32, relativ zur Mitte des Knotens) und Texturkoordinate (2 × Float32).
  Puffer 0 ist ungepackt, aber per gzip übertragen. Puffer 1 ist mit Draco gepackt (bräuchte eine Bibliothek, also nicht nutzen).
  gzip entpackt der Browser selbst (`DecompressionStream`), ohne Bibliothek.
- Texturen: JPEG, 512² bis 2048 × 1024 Bildpunkte je Knoten.
- Baum aus Knoten mit Detailstufen (Knotenseiten zu je 64 Knoten). Am Dom gemessen:

| Stufe | Kantenlänge etwa | Punkte | Geometrie (gzip) | Textur |
|---|---|---|---|---|
| 15 | 900 m | 57 207 | 470 KB | 406 KB (2048 × 1024) |
| 16 | 450 m | 69 987 | 603 KB | 420 KB (2048 × 1024) |
| 18 | 60 m | 42 504 | | 1024 × 1024 |
| 19 | 25 m | 5 298 | | 512 × 512 |

- Probe: Der Knoten am Dom (Stufe 16) reicht bis 207 m über NHN. Domspitze etwa 157 m über einem Boden von etwa 53 m: passt.
- Ladezeit je Datei etwa 1 s aus dieser Umgebung.

## Vermutet und geschätzt

- Laut Katalog ist das Mesh 2,5D: je Lage nur eine Höhe. Überhänge (Fachwerk der Brücke, Unterseite der Brücke) sind
  vermutlich „verhängt“, wie im Bild des Nutzers zu sehen.
- Datenmenge für einen Flug: Schätzung 20 bis 60 MB je Gebiet mit 1 bis 2 km Sicht.
  Annahme: 20 bis 60 Knoten im Bild, je etwa 1 MB (Geometrie und Textur), Detail nach Abstand.
- Leistung: Schätzung 0,5 bis 1,5 Mio. Dreiecke im Bild. Für Chromium mit WebGL2 machbar, auf schwachen Geräten knapp.
- Kollision: Die Physik nutzt weiter LoD2 und das Geländemodell. Bäume, Schiffe und Brückenfachwerk aus dem Mesh wären
  zunächst nur Bild, ohne Kollision. Das kann verwirren.

## Vorschlag für den Bau (Etappe M1, Aufwand M bis L)

1. Neues Modul `rwmesh.js` (ohne DOM): Knotenseiten laden, Knoten nach Abstand und Bildschirmfehler wählen, Puffer 0 lesen.
2. Darstellung: eigener Shader-Zweig mit Textur je Knoten; höchstens etwa 40 Knoten zugleich, alte wieder freigeben.
3. Schalter „3D-Mesh“ in der echten Welt (nur NRW, nicht DIS). Ist er an, entfallen dort LoD2-Häuser, eigene Bäume und Luftbild.
4. Nichts speichern, nur live laden (einfacher, kein Speicherplatz nötig).
5. Später: Kollision grob aus dem Mesh (Höhe je Rasterpunkt), damit Bild und Physik passen.
