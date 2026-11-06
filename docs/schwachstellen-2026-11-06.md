# Prüfbericht Schwachstellen (06.11.2026, Version 1.118, Prompt 122)

Vorgehen: Die Hauptsitzung hat 11 Kandidaten gesammelt (Codelänge, Messungen, Lesen). Eine zweite Instanz (Fable) hat jeden Punkt im Code geprüft, Laufzeiten gemessen, bewertet und 3 Punkte ergänzt. Nichts davon ist umgesetzt, außer wo vermerkt.

Legende: **G** = gesichert (im Code oder durch Lauf geprüft), **V** = vermutet. Schwere: hoch, mittel, niedrig. Aufwand: S klein, M mittel, L groß.

## Kandidaten

| Nr | Stelle | Problem | Schwere | Wahrsch. | Aufwand | Empfehlung |
|---|---|---|---|---|---|---|
| 1 | `realworld.rwMesh` gegen `groundH`; nur die FPV-Kamera nutzt `rwSurfaceH` | **G.** Physik und Bild nutzen zwei Flächen. Die Drohne sinkt am Hang sichtbar ein; Verfolgerkamera, Bäume, Vögel, Pilot ebenso. | mittel | hoch | M | **Erledigt** (1.121): `groundH` ist die gezeichnete Fläche; die Netze bauen auf den Messwerten (`rwSampleH`). Dabei gefunden: 8 % des Wasserspiegels mitten im Fluss lagen unter dem gezeichneten Gelände, jetzt nicht mehr. |
| 2 | `rwLoadTile` → `rwFetchArea` (TIFF, Bäume, Packen); `render.drawTerrain` | **G.** Ruckler beim Nachladen. Nur LoD2 ist in Häppchen geteilt. | hoch | hoch | L | Später Web Worker (machbar im Einzeldatei-Paket). Vorher billig: `rwMesh` liest Höhen direkt aus dem Raster (V: 3 bis 5 mal schneller). |
| 3 | `render.loadPhoto`; kein Handler für Grafik-Kontextverlust | **G.** Grafikspeicher grob 280 MB (Schätzung). Verlust des Kontexts gibt ein schwarzes Bild ohne Hinweis. Bilder werden nicht freigegeben. | mittel | mittel (Handy, alte Grafik) | S bis M | **Erledigt** (1.123): Grafikverlust mit Hinweis, Flug ruht, Neuaufbau bei Rückkehr (dabei gefunden: Tore wurden doppelt angelegt, behoben). Handy und Geräte bis 4 GB: Startgebiet 2048², Umgebung und Kacheln 1024² (Schätzung etwa 70 statt 280 MB). Bilder nach dem Hochladen freigegeben. |
| 4 | `rwstore.storeArea`, `tx` | **G.** Speicher wächst ohne Grenze, nichts wird verdrängt, Fehlschlag fast unsichtbar. | mittel | mittel (nach 10 bis 20 Orten) | M | **Erledigt** (1.123): Kacheln höchstens 400 MB (Schätzung), die am längsten nicht genutzten gehen zuerst; bei knappem Platz zuerst Kacheln, dann Gebäudekacheln; Schreiben schlägt fehl: Platz schaffen, nochmals versuchen, sonst Meldung im Menü. Eigene Orte und Landesdaten löscht nur der Nutzer. Optionen → Daten zeigt den freien Platz. |
| 5 | `rwLoadTile` (`rwNet()` ohne Abbruch), `rwStreamStep` | **G.** Ein hängender Abruf stoppt das Nachladen still. Fehler der Kacheln werden nie gezeigt. | mittel | mittel (Firmennetz, Handy) | S | **Erledigt** (1.120): Abbruch nach 30 s ohne Daten, Abbruch bei Gebietswechsel, Fehler einmal im Flug angezeigt. |
| 6 | `rwLoadTile`, `rwModels` | **G.** Bäume am Kachelrand schweben oder sinken leicht. | niedrig | hoch, kaum sichtbar | S | **Erledigt** (1.121) beim Laden der Kachel. Rest: Lädt später ein Nachbar, behalten Bäume im 30-m-Saum ihre Höhe (Zentimeter bis wenige Dezimeter, V). |
| 7 | `render.js` 1065 Zeilen, `render()` 287, `physics.step` 230, `realworld.js` 660 | **G.** Lesbar, aber jede Änderung berührt viel. Kein Fehler. | niedrig | – | M | Nur aufteilen, wenn ohnehin angefasst. |
| 8 | CI nur mit Node-Tests | **G.** Grafikfehler fallen erst beim Nutzer auf. | mittel | – | M | Browser-Test in CI (Playwright nur als Prüfwerkzeug, nicht im Produkt). Entscheidung des Nutzers. |
| 9 | `tools/build.mjs`; Datei 8,0 MB | **G.** Langsamer erster Start, besonders SharePoint. | mittel | hoch | M | Luftbild Monschau 2048² (spart etwa 2,5 MB), Umgebung 1024²; Größe im Test prüfen. |
| 10 | `hud.drawHud` → `rwPlace`; Propeller | **Teils falsch.** `rwPlace` gemessen 0,22 ms je Bild, unerheblich. Rest V, gering. | niedrig | niedrig | S | `rwPlace` alle 0,5 s zwischenspeichern. Sonst lassen. |
| 11 | `rwPlan`, `rwLoadTile` | **G.** UTM 33 wird sauber ausgelassen, nicht gemischt. | niedrig | niedrig | L | So lassen, bis jemand an der Ostgrenze fliegt. |

## Ergänzt durch Fable

| Nr | Stelle | Problem | Schwere | Wahrsch. | Aufwand | Empfehlung |
|---|---|---|---|---|---|---|
| 12 | `realworld.rwSetTris` (ein 8-m-Raster über alle Kacheln) | **G, gemessen:** Kachel 1 km weg: 43 ms, 24 MB. Kachel 4 km weg: 250 ms und 165 MB, bei jeder neuen Kachel. | hoch | hoch (Flug über 2 bis 4 km) | S | **Erledigt** (1.120): nur belegte Zellen. Gemessen: Kachel 4 km weg 23 ms und 16 MB statt 265 ms und 164 MB; Kosten hängen jetzt nur vom Inhalt ab, nicht von der Entfernung. |
| 13 | `rwstore.db` ohne `onblocked` | **G.** Zweiter Tab mit alter Speicher-Version: Laden hängt ohne Meldung. | niedrig | niedrig | S | **Erledigt** (1.120). |
| 14 | `rwload.rwFillGaps` | **V.** Umgebung halb außerhalb (Grenze, Küste): bis etwa 1 s blockiert. | niedrig | mittel (Grenzorte) | S | Lücken in einem Durchlauf füllen. |
| 16 | Umgebung (`RW_FAR`, `RW_STREAM.reach`) | **G.** Fester Kartenrand: Umgebung 10 x 10 km um den Start (±5 km), Nachladen bis 4,5 km. Dahinter gerechnete Felder (Nutzer hat ihn gefunden, Prompt 124). | mittel | mittel (lange Flüge) | M bis L | Umgebung mitwandern lassen: beim Annähern an den Rand neu um die Drohne laden. |
| 17 | Rand Gebiet und Umgebung (`rwMesh`, `rwFarMesh`) | **G, gemessen:** Die Netze treffen sich mit verschieden dichten Ecken (4 m und 25 m). Kleine Stufe bis 0,12 m (Monschau); möglich sind feine Lichtpunkte am Rand (V). | niedrig | hoch, kaum sichtbar | S bis M | Randzeile des feinen Netzes auf die Umgebungskante legen oder eine kurze Schürze nach unten. |
| 15 | `rwLoadLive` (gespeicherter Ort) | **G.** Gespeicherte Orte ohne Umgebung luden nie nach (Prompt 123). | hoch | hoch | S | **Erledigt** (Version 1.119): Umgebung wird beim Öffnen nachgeholt. |

## Vorgeschlagene Reihenfolge

1. **Nachladen stabil und flüssig** (Nr. 12, 5, 13). **Erledigt** in Version 1.120. Kleine Eingriffe, großer Effekt. Prüfen: Messung in Node unter 20 ms bei Kachel 4 km; Test mit Abruf, der nie antwortet.
2. **Eine Bodenfläche** (Nr. 1, 6). **Erledigt** in Version 1.121. Physik gleich Bild. Prüfen: Test „Drohne am Hang: Abstand zur gezeichneten Fläche unter 1 cm“.
3. **Grafik und Speicher robust** (Nr. 3, 4). **Erledigt** in Version 1.123. Prüfen: Kontextverlust im Browser auslösen; vollen Speicher simulieren.
4. **Startgröße** (Nr. 9). Prüfen: Build-Test unter 5 MB.
5. **Rechenarbeit auslagern** (Nr. 2). Erst nach 1 bis 3. Prüfen: Bildzeit beim Nachladen unter 30 ms.

Nr. 7 und 8 nur im Zuge dieser Etappen. Offen für den Nutzer: Nr. 8 (Browser-Test in CI).
