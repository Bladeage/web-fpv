# Abschluss der Entwicklung (Stand 13.11.2026)

Der Nutzer hat die Entwicklung vorerst abgeschlossen (Prompt 207: „polishen und erstmal abschließen“). Dieses Dokument sagt, was fertig ist, was bewusst offen bleibt und wie man wieder einsteigt. Einzelheiten zum Aufbau stehen in `docs/handover-2026-11-11.md`.

## Stand

- Seite: https://bladeage.github.io/web-fpv/ . Version im Hauptmenü: 1.237 oder höher.
- Eine Datei `dist/fpvsim.html`, 7,85 MB. Grenze im Test 7,9 MB.
- 342 Tests in Node bestanden, 1 übersprungen (`npm test`).
- Vom Nutzer abgenommen: Nachtmodus, Straßen und Verkehr, Boote, Foto 3D mit Kollision, Wirkmittel, Versuche und Missionsende, AXA Campus Köln, Ortssuche, Pause-Menü mit Speicher, G2 (Bild und Bildrate in Ordnung, Prompt 206).

## Zum Abschluss erledigt (Prompt 207)

| Punkt | Was | Gesichert durch |
|---|---|---|
| Plätze in Foto 3D | Landeplatz, Abhol- und Lieferplätze folgen alle 0,5 s dem Boden der Physik, wenn das Mesh nach dem Aufstellen kommt. Vorher konnte die Platte bis etwa 1 m im Mesh versinken oder schweben, und eine Landung auf dem Mesh zählte nicht. Nicht, solange die Drohne näher als 8 m ist. | `test/spots.test.mjs`; Präzisionslandung am AXA Campus in Headless-Chromium ohne Fehler |
| Fehlende Mesh-Teile | Antwortet der Dienst mit 404 oder 410, gilt das Teil als nicht vorhanden. Es wird nicht mehr alle 30 s neu angefragt. Der gröbere Teil darüber bleibt sichtbar. | `test/rwmesh.test.mjs` |
| Lücken im Gelände füllen (Prüfbericht Nr. 14) | Ein Durchlauf in Schichten statt Durchlauf für Durchlauf. Gemessen in Node bei einer zu 60 % leeren Umgebung (512²): 3 s vorher, 50 ms jetzt. Ergebnis Bit für Bit gleich. Die doppelte Fassung in `rwload.js` nutzt jetzt dieselbe aus `rwwms.js`. | `test/realworld.test.mjs` (Vergleich mit dem alten Verfahren) |
| Ortsname im OSD (Prüfbericht Nr. 10) | nur alle 0,5 s neu gesucht | Build und Tests |
| Speicher leeren | Alle Bereiche in einem Schritt statt zwölf. „Alles“ im Pause-Menü geprüft: alle Bereiche leer (Orte, Landesdaten, Kacheln, Gebäudekacheln, Mesh), Menü scrollt nicht, Flug läuft weiter. In der langsamen Testumgebung 1,1 s statt 21,6 s. | Headless-Chromium |

## Bewusst offen

Keiner dieser Punkte stört den heutigen Gebrauch (Einschätzung). Wer wieder einsteigt, nimmt sie bei Bedarf auf.

**Hängt an anderen (nicht hier lösbar)**
- DIS und VBS: Probe auf dem VBS-Rechner durch k5.2; eingefrorene Orte der VBS-Einheiten (Ursache in VBS offen); DIS-Plugin „universell, ohne VBS-Bezug“ (Vorgabe Fabian über k5.2, Umsetzung offen). WMS-Höhendienst: W4 und W5 erst nach dem Test mit dem echten Dienst. Einzelheiten: `docs/dis-drohne.md`, `docs/plan-gelaende-wms.md`.
- Browser-Test in der CI: Entscheidung des Nutzers (kostet CI-Minuten). Prüfbericht Nr. 8.

**Echte Welt**
- Dienste anderer Bundesländer sind nicht als Vorlage geprüft. UTM 32 und 33 werden in einem Gebiet nicht gemischt (Prüfbericht Nr. 11).
- Straßen und Verkehr für geladene Orte gibt es nur in NRW (ALKIS). Der Wunsch „global, wenn Straßen-Shapes da sind“ (Prompt 184) braucht je Land eine Straßenquelle.
- Schmale Gewässer sind im Basis-DLM nur Linien und fehlen deshalb. Brücken ohne LoD2 erscheinen als Bäume.
- Kleine Stufe am Rand zwischen Gebiet und Umgebung, bis 0,12 m (Prüfbericht Nr. 17, kaum sichtbar).

**Foto 3D**
- Fahrzeuge und Verkehr fahren auf der Höhe des Geländemodells, nicht des Meshes. Abweichung vermutlich unter 1 m, auf Straßen meist weniger (Annahme: Straßenflächen im Mesh liegen nah am Geländemodell; nicht gemessen).
- G3 (Grenzen nach Gerät) und G4 (gemeinsame Shader-Teile) nur bei Bedarf. Die Bildrate ist laut Nutzer in Ordnung.

**Flug**
- Der eigene Regler erreicht bei der Whoop etwa 86 % der eingestellten Rollrate (gemessen 05.11.2026). Klein; nur bei Rückmeldung.

**Technik**
- Dateigröße: etwa 55 KB bis zur Testgrenze. Für größere Zusätze das Luftbild AXA stärker packen (ändert das Bild leicht, Nutzer fragen).
- `render.js` hat 1 600 Zeilen. Nur aufteilen, wenn dort ohnehin gearbeitet wird.

**Ideen des Nutzers, nicht begonnen** (Prompt 178/179): Fotomodus, Tageszeit, Wolkenschatten, Morgendunst, Farbstimmungen. Slalom in der echten Welt (`docs/plan-taktischer-flug.md`).

## Wieder einsteigen

1. `CLAUDE.md` lesen, dann diese Datei, dann `docs/handover-2026-11-11.md` und das Ende von `docs/PLAN.md`.
2. `npm run build` und `npm test` laufen lassen. Beides muss ohne Fehler durchgehen (Node 22, nichts zu installieren).
3. Die Versionsnummer im Hauptmenü der Seite prüfen, bevor man Rückmeldungen des Nutzers deutet (Cache).
4. Die nächste Nummer in `docs/prompt-historie.md` ist 208.
