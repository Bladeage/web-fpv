# Prompt-Historie

Jeder Prompt des Nutzers in gestraffter Form, in zeitlicher Reihenfolge.
Antworten auf Rückfragen (Mehrfachauswahl) stehen als eigene Einträge, weil sie Entscheidungen enthalten.
Datum nach Sitzungsstand. Spalte „Ergebnis“: Etappe oder Commit-Thema.

| Nr. | Datum | Prompt (gestrafft) | Ergebnis |
|---|---|---|---|
| 1 | 30.10.2026 | Startpaket übernehmen. `CLAUDE.md`, Übergabe und Plan lesen. Etappe E0 umsetzen: Module, Build zu `dist/fpvsim.html` und `dist/fpvsim.aspx`, Tests mit `node:test`, CI. Verhalten wie `legacy/fpv-sim-stufe1.html`. Danach committen, kurz berichten, anhalten. | E0 |
| 2 | 30.10.2026 | Ziel des Spiels: frei fliegende Drohnen in der Luft treffen. Grafik mit freien Mitteln aufwerten, Aspekte vorschlagen. Es bleibt bei einer Karte. | Plan E6 angepasst, Grafik-Vorschläge |
| 3 | 30.10.2026 | Jagd: Ein Treffer gibt Punkte, die getroffene Drohne stürzt ab. Sind x Drohnen getroffen, ist die Aufgabe erfüllt. | Plan E6 |
| 4 | 30.10.2026 | Eine Karte mit mehreren Szenarien: Tore am Boden, Ringe in der Luft, fliegende Drohnen, weitere. Andere Drohnen mit verschiedenem Verhalten: ausweichend, dumm, zufällig, verschieden schnell. Grafik: Farbe und Licht, Boden, Bäume, Gebäude. | Plan Fassung 3 (E5, E6, G1, G2) |
| 5 | 30.10.2026 | Tokensparend und langsam weiterentwickeln. Zuerst GitHub Pages einrichten, falls möglich. Danach in der vorgeschlagenen Reihenfolge. | CI-Veröffentlichung auf Pages |
| 6 | 30.10.2026 | (Screenshot) Pages-Job in der CI schlägt fehl. | Anleitung: Pages auf „GitHub Actions“ stellen |
| 7 | 30.10.2026 | Pages ist umgestellt, Veröffentlichung klappt. Weiter. | E5 Szenarien |
| 8 | 30.10.2026 | OSD fehlt noch. Startmenü übersichtlicher: Hauptmenü mit „Modus wählen“ und „Einstellungen“. Einstellungen von überall erreichbar (Esc oder Menü oben links). Ablauf: Parcours-Parameter, Drohnen-Parameter (5", 7", Trägheit, Gewicht), fliegen. | M1 Menü |
| 9 | 30.10.2026 | Antwort auf Rückfrage: OSD realitätsnäher, Bildmodus digital, analog oder ohne Rauschen; OSD-Einstellungen, Stick-Anzeige, mehr Werte. Drohnen-Menü jetzt bauen, Werte schrittweise ergänzen. | M1, Plan O1 |
| 10 | 30.10.2026 | Weiter. | O1 OSD |
| 11 | 30.10.2026 | Welche Punkte der Roadmap sind noch offen? Störsignale verbessern. | Übersicht, S1 Störsignale |
| 12 | 30.10.2026 | Mit einfachen Mitteln und wenig Tokens bis einschließlich E4 fertigstellen. | E6, G1, G2, E1, E2, E3, E4 |
| 13 | 02.11.2026 | Open-Source-Projekte als Orientierung suchen. Ziel: realitätsnahe Simulation, Physik hat Vorrang. Dazu mehr Polygone und eine bessere, günstige Auflösung. | Recherche mit Quellen und Vorschlägen |
| 14 | 02.11.2026 | Menü einfach halten: Es ist so groß, dass man scrollen muss. Es soll auf den Bildschirm passen und leicht bedienbar sein. | M2 Menü kompakt |
| 15 | 02.11.2026 | Die Entscheidungen zu Physik und Realitätsnähe in mehreren Runden vorlegen. | Drei Fragerunden |
| 16 | 02.11.2026 | Antworten, Runde 1: echtes Betaflight als WebAssembly; Motormodell mit Drehzahl; Aerodynamik mit Anströmung, Rotorwiderstand, Widerstand nach Lage und Bodeneffekt. | Plan |
| 17 | 02.11.2026 | Antworten, Runde 2: GPLv3 ist in Ordnung; Betaflight selbst bauen; als Base64 in die eine Datei; der eigene Regler bleibt als Rückfall. | Plan |
| 18 | 02.11.2026 | Antworten, Runde 3: Kreiselrauschen und Vibration, Bild- und Funkverzögerung, Wind und Böen, Turtle-Modus; Kollision mit Abprallen; erst Motor und Aerodynamik; Prüfung über Datenblätter und eigene Flüge mit der Funke. | Plan P1 bis P4 |
| 19 | 02.11.2026 | Weiter. | P1 Motor und Aerodynamik |
| 20 | 02.11.2026 | Bei der Auswahl der Teile passende Symbole zeigen: Akku klein bei kleiner Kapazität, größer werdend; ebenso bei der Drohnengröße. Langsame Rotoren blau, schnelle rot. | Menü-Symbole |
| 21 | 02.11.2026 | Weiteren Jagdmodus mit Bodenzielen (Fahrzeugen). Sie stehen oder fahren langsam bis schnell. | Jagd Boden |
| 22 | 02.11.2026 | Tastenbelegung: Arming und Disarming mit der Tastatur, Kamerawinkel mit Bild auf und Bild ab, Blickfeld mit Plus und Minus. | Tasten |
| 23 | 02.11.2026 | Jagd Luft: auch einige stehende (schwebende) Drohnen. Am Boden und in der Luft nutzt keine KI eine Strecke doppelt. Weitere grafische Feinjustierung; die Stufe „Einfach“ bleibt erhalten (läuft auf schwächsten PCs in Edge), „Schön“ verliert dort Bilder. Weitere Modi vorschlagen, bestehende Modi auf Verbesserungen prüfen. Als Mehrfachauswahl. | Schwebende Ziele, eigene Strecken, Fragerunde |
| 24 | 02.11.2026 | Antworten: „Schön“ schneller machen, Stufe „Mittel“, Auflösung automatisch. Neue Modi Paketlieferung und Verfolgung. Ringe und Slalom bei jedem Start neu anordnen, mit Prüfung. Zuerst Grafik-Leistung. | G3, Plan M3 |
| 25 | 02.11.2026 | Jagd: Nach einem Treffer startet die eigene Drohne neu, im Bild erscheint „Ziel erfüllt“. Kein Einschlag im Boden nach dem Anflug auf ein Bodenziel. | Neustart nach Treffer, Treffer-Text |
| 26 | 02.11.2026 | M3 umsetzen. | M3 |
| 27 | 02.11.2026 | Neue Regel: Jeden Prompt gestrafft in einer Prompt-Historie im Repository ablegen, rückwirkend ab dem ersten. | Diese Datei, Regel in `CLAUDE.md` |
| 28 | 02.11.2026 | P2 vor der Umsetzung noch einmal erklären. | Erklärung P2, Entscheidungsvorschläge |
| 29 | 02.11.2026 | P2: Abprallen mit Drehung und genauere Hitbox umsetzen. Turtle-Modus nach hinten stellen, stattdessen andere Weiterentwicklung. | P2 Teil 1 |
| 30 | 02.11.2026 | Als Nächstes R1 (Grafik-Details). P3 und P4 im Detail erklären. | R1, Erklärung P3/P4 |
| 31 | 02.11.2026 | Schadmodell standardmäßig aus; im Modus „Aus“ kein Absturz (kein Standbild). Checkbox „Akku unendlich“. Weitere Einstellungen zum Lernen oder als Gott-Modus vorschlagen, Darstellung als Presets. Ein Nutzer wünscht einen Editor; Gestaltung offen. | Schaden aus ohne Absturz, Akku unendlich, Vorschläge |
| 32 | 02.11.2026 | Antworten: Lernhilfen „Durch Hindernisse fliegen“ sowie „Flugspur und Zurückspulen“. Präsentation als Spielstil-Karten. Editor später entscheiden. | Plan L1 |
