# Abwägung: Optionsmenü für die Geländedaten (08.11.2026, Prompt 166, Fable)

Frage des Nutzers: Optionsmenü in der echten Welt, um Geländedaten abzuwählen (Luftbild, Höhen, Häuser, Gewässer usw.); normales Menü oder Debug-Menü?

**Empfehlung (Fable):** kein verstecktes Debug-Menü. Dritter Reiter „Ebenen“ in „Echte Welt: Optionen“ (neben Daten und Quellen) mit fünf Schaltern: Luftbild, Gebäude, Bäume, Gewässer, Umgebung bis 10 km. Vorgabe alles an, Hinweis „Für Fehlersuche und schwache Geräte“. Höhen bleiben immer an.

**Begründung (gesichert im Code laut Fable):**
- Optionen der echten Welt sind schon die Expertenecke (WCS-Adressen), zwei Klicks tief; der normale Weg bleibt unberührt. Einen Debug-Bereich gibt es bisher nicht.
- Höhen nicht abwählbar: Physik, Gebäude (relativ zum Startplatz gepackt) und Lader brauchen sie; „eben“ gibt es schon (`rwFlat`).
- Luftbild ist der größte Posten im Grafikspeicher (am Handy wirksamster Schalter neben Gebäuden); ohne Bild zeichnet der Code schon heute den gerechneten Boden.
- Gebäude: größter Posten bei Laden und Speicher, aber Kollision, Startplatz und Platzierungsdienst hängen daran (Spiel ändert sich).
- Umgebung: guter Handy-Schalter, ohne sie stoppt aber das Nachladen.
- Vorhanden: Nachladen (Optionen, Daten), Gewässer und Orte als Landesdaten, Kartenlinien und Ortsnamen im OSD.

**Wirkung:** Schalter wirken beim Übernehmen und Zeichnen, nicht beim Laden. Der Speicherschlüssel eines Orts kennt die Ebenen nicht; ein ohne Gebäude geladener Ort läge sonst dauerhaft ohne Gebäude im Speicher. Spart Arbeits- und Grafikspeicher und Bildrate, nicht die Downloadzeit.

**Skizze:** Reiter [Daten | Quellen | Ebenen], Hinweis, fünf Schalter, Hinweis „Ohne Gebäude oder Umgebung keine Bestzeit“. Etwa 240 px, passt in vier Größen (vermutet).

**Aufwand (Schätzung):** S bis M. `rw.layers` in `realworld.js`, Abfragen in `rwApply`, `rwTileModels`, `rwLoadTile`; `cfg.rwLayers`; Reiter und Schalter in `index.html` und `srcui.js`; Luftbild-Pfad in `render.js`. Tests: Ebenen aus, 0 Dreiecke, 0 Bäume, `groundH` unverändert, `waterAt` falsch.

**Risiken:** Bestzeit mit Ebenen aus (Vorschlag: dann keine speichern); Startplatz ohne Wasser und Gebäude bleibt am gepackten Platz; Nachladen ohne Umgebung stoppt (Hinweis); eine Fassung, die schon vor dem Abruf abwählt, bräuchte einen erweiterten Speicherschlüssel.

**Umgesetzt (08.11.2026, Prompt 167/170):** Reiter „Debug“ (Wunsch des Nutzers: „Debug Schalter im Menü, keine url“) in „Echte Welt: Optionen“ neben Daten und Quellen, fünf Schalter (Luftbild, Gebäude, Bäume, Gewässer, Umgebung bis 10 km), gespeichert in `cfg.rwShow`, wirken sofort (`rwSetShow` übernimmt das Gebiet aus `rw.last` neu) und auf nachgeladene Kacheln. Höhen immer an. Mit ausgeblendeter Ebene keine Bestzeit (`bestOk` in `physics.js`), Hinweis beim Start. Bäume prüfen auch ohne Ebene Gewässer gegen das echte Wasser. Nebenbei behoben: Beim ersten Übernehmen eines Gebiets maß der Fuß der Bäume auf der groben Umgebung (7 von 2 962 Bäumen in Monschau anders). Test `test/rwshow.test.mjs`, Browser in vier Größen.

**Offene Entscheidungen (Vorschlag, entschieden: 1 sichtbar im Menü, 2 nur Darstellung, 3 ja, 4 ja):** 1. Sichtbar im Reiter „Ebenen“ (ja) oder nur mit `?debug=1`. 2. Nur Darstellung und Übernahme (ja) oder auch Download sparen. 3. Gebäude als Schalter (ja, mit Hinweis Bestzeit). 4. Höhen nie abwählbar (ja).
