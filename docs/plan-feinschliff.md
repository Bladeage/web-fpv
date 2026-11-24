# Plan Feinschliff zum finalen Release

Stand 24.11.2026. Auswahl des Nutzers (Prompt 240, Mehrfachauswahl je Etappe). Pro Sitzung eine Etappe: umsetzen, prüfen, committen, berichten, auf Freigabe warten.

## F1 Erster Eindruck (erledigt 24.11.2026)

Umgesetzt: Einführung in drei Schritten je Gerät (`cfg.intro`, erneut über Hilfe); nächster Schritt des Auftrags als Zeile im Flug (`scenHint`), Touch-Hinweise schon vor der ersten Berührung; Fehlermeldungen beim Laden über `loadErrText` (Ursache, was zu tun ist, technische Meldung dahinter); Hilfe in vier Abschnitten. Wer den Simulator schon benutzt hat, sieht die Einführung nicht von selbst. Tests: `test/f1.test.mjs`.

1. Einführung beim ersten Start: drei kurze Schritte (steuern, Auftrag wählen, Hilfe finden). Danach nie wieder, abschaltbar.
2. Hinweise im Flug: je Gerät (Tastatur, Touch, Funke) die passenden Tasten und der nächste Schritt.
3. Klare Fehlermeldungen beim Laden von Orten: Ursache in einfachem Deutsch und was der Nutzer tun kann.
4. Hilfe neu ordnen: Abschnitte Steuerung, Aufträge, echte Welt, Funke.

## F2 Aufträge (erledigt 24.11.2026)

Umgesetzt: Auswertung am Ende (`scenResultLines`: Zeit mit Vergleich zur Bestzeit, Versuche, Treffer, Drohnen, Punkte); Lagebild auf Schritt 2 vor dem Start (`scenBrief`: Ziel und Regeln); Auftrag „Gemischt“ (`hunt4`: 7 Fahrzeuge und 9 Ziel-Drohnen, mit Sprengladung, in der echten Welt nur mit Straßen); Aufklärung mit stehenden Fahrzeugen und Booten (echte Welt), Gebäude aus LoD2 verdecken die Sicht (`rwSegHit`, Prüfung höchstens alle 0,1 s). Nicht im Browser nachgestellt: ein Boot aufklären, Sicht hinter einem echten Gebäude. Tests: `test/f1.test.mjs` (F2-Teil), `test/recon.test.mjs`.

1. Auswertung am Ende: Zeit, Versuche, Treffer, Vergleich mit der Bestzeit.
2. Lagebild vor dem Start: Ziel, Zahl der Ziele, Regeln.
3. Auftrag „Gemischt“: Ziele am Boden und in der Luft.
4. Aufklärung ausbauen: mehr Zielarten (stehende Fahrzeuge, Boote); in der echten Welt verdecken auch Gebäude die Sicht.

## F3 Bedienung und Technik (erledigt 24.11.2026)

Umgesetzt: Touch-Knöpfe oben (scharf schalten, Flugmodus, zurückspulen; mit Maus ausgeblendet). Betaflight neu gebaut mit `bf_set_att` (`sitl/platform.c`): Zurückspulen setzt die Lage direkt in Betaflight, die Sperre ist weg; gemessen 2 m Drift statt 79 m und Absturz. Der Build geht in der Arbeitsumgebung (clang 18, wasm-ld, Betaflight-Quellcode vom festgelegten Commit, kein Emscripten nötig). Begriffe vereinheitlicht: „Auftrag“ statt „Mission“ und „Aufgabe“, „Sprengladung“ statt „Wirkmittel“. Test: `test/f3.test.mjs`.

1. Touch-Knöpfe: Scharf schalten, Flugmodus, Zurückspulen.
2. Betaflight-Rest: Zurückspulen mit Betaflight richtig lösen. Braucht einen neuen Build von `sitl/`; erst prüfen, ob das in der Arbeitsumgebung geht.
3. Einheitliche Texte: derselbe Begriff für dieselbe Sache, keine Fachwörter ohne Erklärung.

Nicht gewählt: Leistung auf Handys messen und verbessern.

## F4 Abnahme und Release

1. Test-Liste für den Nutzer auf echten Geräten (Handy, PC, Funke, drei Orte); Auffälligkeiten beheben.
2. Quellen und Lizenzen: eine Seite im Programm, vollständig und geprüft.
3. Anleitung im Repository (README): starten, steuern, echte Welt, Funke anschließen.
4. Versionshinweise: Neuerungen je Version im Programm und im Repository.
