# Plan Feinschliff zum finalen Release

Stand 24.11.2026. Auswahl des Nutzers (Prompt 240, Mehrfachauswahl je Etappe). Pro Sitzung eine Etappe: umsetzen, prüfen, committen, berichten, auf Freigabe warten.

## F1 Erster Eindruck (erledigt 24.11.2026)

Umgesetzt: Einführung in drei Schritten je Gerät (`cfg.intro`, erneut über Hilfe); nächster Schritt des Auftrags als Zeile im Flug (`scenHint`), Touch-Hinweise schon vor der ersten Berührung; Fehlermeldungen beim Laden über `loadErrText` (Ursache, was zu tun ist, technische Meldung dahinter); Hilfe in vier Abschnitten. Wer den Simulator schon benutzt hat, sieht die Einführung nicht von selbst. Tests: `test/f1.test.mjs`.

1. Einführung beim ersten Start: drei kurze Schritte (steuern, Auftrag wählen, Hilfe finden). Danach nie wieder, abschaltbar.
2. Hinweise im Flug: je Gerät (Tastatur, Touch, Funke) die passenden Tasten und der nächste Schritt.
3. Klare Fehlermeldungen beim Laden von Orten: Ursache in einfachem Deutsch und was der Nutzer tun kann.
4. Hilfe neu ordnen: Abschnitte Steuerung, Aufträge, echte Welt, Funke.

## F2 Aufträge

1. Auswertung am Ende: Zeit, Versuche, Treffer, Vergleich mit der Bestzeit.
2. Lagebild vor dem Start: Ziel, Zahl der Ziele, Regeln.
3. Auftrag „Gemischt“: Ziele am Boden und in der Luft.
4. Aufklärung ausbauen: mehr Zielarten (stehende Fahrzeuge, Boote); in der echten Welt verdecken auch Gebäude die Sicht.

## F3 Bedienung und Technik

1. Touch-Knöpfe: Scharf schalten, Flugmodus, Zurückspulen.
2. Betaflight-Rest: Zurückspulen mit Betaflight richtig lösen. Braucht einen neuen Build von `sitl/`; erst prüfen, ob das in der Arbeitsumgebung geht.
3. Einheitliche Texte: derselbe Begriff für dieselbe Sache, keine Fachwörter ohne Erklärung.

Nicht gewählt: Leistung auf Handys messen und verbessern.

## F4 Abnahme und Release

1. Test-Liste für den Nutzer auf echten Geräten (Handy, PC, Funke, drei Orte); Auffälligkeiten beheben.
2. Quellen und Lizenzen: eine Seite im Programm, vollständig und geprüft.
3. Anleitung im Repository (README): starten, steuern, echte Welt, Funke anschließen.
4. Versionshinweise: Neuerungen je Version im Programm und im Repository.
