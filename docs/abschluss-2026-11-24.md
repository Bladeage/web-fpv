# Abschluss 24.11.2026

Stand nach dem Feinschliff zum Release. Wer weiterarbeitet, liest zuerst dieses Dokument, dann `docs/plan-feinschliff.md` und `docs/pruefung-2026-11-24.md`.

## Was seit dem 13.11.2026 dazukam

- **Quellen der echten Welt (Q1 bis Q7, `docs/plan-quellen.md`):** Leser für TIFF, COG und ZIP; weltweite Höhen (AWS Terrain Tiles) und Sentinel-2 als Rückfall; Höhen, Luftbild und Gebäude für weitere Bundesländer; Straßen und Wald aus OpenStreetMap; Zwischenspeicher nach Leistung des Geräts; Karte mit vier Farbstufen je Land.
- **Aufträge:** Sprengladung fest an den Aufträgen zum Zerstören (scharf ab 10 m über Grund); Aufklärung als eigener Auftrag; „Gemischt“ (`hunt4`); Lagebild vor dem Start; Auswertung am Ende. Die DIS-Übung ist versteckt (10 Klicks auf den Hintergrund des Hauptmenüs).
- **Prüfung der Funktionen (`docs/pruefung-2026-11-24.md`):** drei Durchsichten, 32 Fehler gemeldet, alle behoben oder entschärft. Tests dazu in `test/pruefung.test.mjs`.
- **Feinschliff F1 bis F4 (`docs/plan-feinschliff.md`):** Einführung, Hinweise im Flug, klare Fehlermeldungen, Hilfe in vier Abschnitten; Touch-Knöpfe; Zurückspulen mit Betaflight (neuer Build, `bf_set_att`); einheitliche Begriffe; Seite „Über das Programm“ mit Neuerungen, Quellen und Lizenzen; Anleitung im README; Versionshinweise; Test-Liste.
- **Menüs:** Überschriften je Gruppe; Einstellungen mit den Reitern Bild, Spiel, Steuerung, OSD, Hilfe.
- **Optik:** echte Welt mit Bodenmuster bis 70 m, plastischeren Bäumen und kräftigeren Farben.

## Zahlen

- 385 Tests, alle grün (`npm test`). Stand 25.11.2026: 391 Tests, 390 grün, 1 übersprungen (Windows-Brücke, braucht PowerShell).
- `dist/fpvsim.html`: 7,77 MB, Grenze im Test 7,9 MB. Der Build lässt reine Kommentarzeilen weg; das sparte etwa 155 KB.
- Betaflight lässt sich in der Arbeitsumgebung neu bauen: `node sitl/build.mjs <Pfad zum Betaflight-Quellcode>` (clang 18, wasm-ld; Commit steht in `sitl/build.mjs`).

## Nachtrag 25.11.2026

- Handy-Korrekturen (Scharfschalten, Knopf Einfrieren, Zündung beim Aufprall) und robusteres Ausliefern sind übernommen (PR #24, #25).
- Funktionsprüfung des gebauten Stands im Test-Browser: kein Fehler im Programm. Protokoll: `docs/pruefung-2026-11-25.md`.

## Offen

1. **Abnahme durch den Nutzer** nach `docs/test-liste.md` (PC, Handy, Funke, drei Orte). Auffälligkeiten danach beheben.
2. **Nicht mit echtem Netz oder Gerät geprüft:** Overpass (Straßen, Wald, Kreuzungen), fehlende Gebäude-Kachel ohne CORS (Brandenburg), Boot als Ziel der Aufklärung, Sicht hinter echten Gebäuden, Funke (Kalibrierung, Failsafe), DIS-Partner.
3. **Rechenzeit der Optik** nicht auf einer echten Grafikkarte gemessen (Punkt B8 der Test-Liste).
4. **Lizenzangaben** nicht rechtlich geprüft. Unsicher: Saarland (Dienst nennt keine Lizenz), Basis-DLM Niedersachsen (CC BY 4.0 vom Land übernommen).
5. **Kleinigkeiten:** Löcher in Waldflächen (innere Ringe) bekommen Bäume. Nach dem Zurückspulen mit Betaflight kippt die Drohne kurz um etwa 20 Grad (Ursache vermutet: Reaktion auf das Loslassen des Knüppels). „Leistung auf Handys“ und „Propeller dezenter“ hat der Nutzer nicht gewählt.

## Arbeitsweise (unverändert, siehe `CLAUDE.md`)

Eine Etappe je Sitzung, vor jedem Commit `npm run build` und `npm test`, jeder Prompt in `docs/prompt-historie.md`. Änderungen gehen über einen Entwurfs-PR; übernommen wird erst auf Wunsch des Nutzers.
