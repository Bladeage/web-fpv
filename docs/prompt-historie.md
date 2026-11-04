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
| 33 | 02.11.2026 | L1 umsetzen. Arm-Schalter an der Funke frei belegbar wie alle anderen Funktionen. Achsen sollen mit verschiedenen Funken funktionieren (später Bluetooth-Controller am Handy). Am Handy in Chrome ruckelt es stark. | Funke-Belegung, L1, Handy |
| 34 | 02.11.2026 | Ohne Schadmodell: Liegt die Drohne auf dem Kopf, soll sie sich umdrehen können. Ist das der Turtle-Modus? Falls ja, möglichst automatisch einschalten. Möglichkeiten prüfen (Vorbild: Uncrashed). | Handy-Leistung, Möglichkeiten Turtle-Modus |
| 35 | 02.11.2026 | Am Handy hakte es mit „Auflösung automatisch“, teils 10 Bilder pro Sekunde und weniger. Vermutung: rechnet auf die höchste Auflösung hoch und passt nicht nach unten an. Prüfen, ob die Funktion bleibt oder standardmäßig aus ist. | Ursache Weichzeichnen im OSD, Auflösung automatisch überarbeitet, Sparmodus |
| 36 | 02.11.2026 | Auflösung automatisch bleibt eingeschaltet. Turtle-Modus Variante 1 (schaltet sich auf dem Kopf von selbst ein). OSD-Häkchen für Uhrzeit und Bildrate, standardmäßig aus. | Turtle-Modus |
| 37 | 02.11.2026 | Gerät die App in den Hintergrund (Bildschirm gesperrt), soll das Einstellungsbild kommen und die Simulation pausieren. Bisher läuft der Ton weiter, vermutlich auch die Simulation. | Ton aus im Hintergrund und im Menü |
| 38 | 02.11.2026 | Hitbox-Füße reparieren. | Hitbox-Füße, flache Platten |
| 39 | 02.11.2026 | Die FPV-Kamera liegt am Boden auf Kante, man sieht durch die Karte. Die Drohne soll sich am Boden bewegen, wenn man sie drehen will (wie in Uncrashed). | Kamera höher, nahe Bildebene; Regler am Boden mit Stick aktiv |
| 40 | 02.11.2026 | Standardwerte setzen, die Anwendung startet meist als Demo: Was bietet sich an? Sounds verbessern, gern komplett neu. | Fragerunde |
| 41 | 02.11.2026 | Antworten: Demo startet mit dem Torkurs (wie bisher), Spielstil „Lernen“, Bild ohne Rauschen, Zielmarker bleiben. Sound komplett neu, aus der Physik berechnet. | Demo-Vorgaben, Ton neu |
| 42 | 02.11.2026 | Angle und Acro im Spiel umschaltbar, per Tastatur und Controller belegbar. Rückmeldung: BetaFPV LiteRadio 4 und Radiomaster Pocket (Crush) funktionieren am Handy und PC in Chromium sehr gut. | Taste schaltet um (Angle/Acro, Scharf), Schalter nach Stellung |
| 43 | 02.11.2026 | Rückmeldung: Der neue Ton klingt am Handy in Ordnung. | Keine Änderung |
| 44 | 02.11.2026 | (Screenshot Handy, 7 Zoll, Acro) Nach der Landung und nach dem Turtle-Modus wackelt die Drohne am Boden und dreht sich im Kreis, bis sie stabil steht. | Bodenkontakt: nahe Füße zählen mit, kein Einfrieren; Regler am Boden erst nach Loslassen |
| 45 | 02.11.2026 | P3 im Detail erklären, in einfachem technischem Englisch. | Erklärung P3 (Englisch) |
| 46 | 03.11.2026 | (Foto) Bug: „Turtle-Modus: Stick zum Umdrehen“ erscheint dutzendfach übereinander. | Turtle startet nur mit Gas unten, gleiche Meldungen stapeln sich nicht |
| 47 | 03.11.2026 | Menüpunkt „Funke“ in „Steuerung“ umbenennen. Dort soll einheitlich die Steuerung angepasst werden, egal ob Funke, Gamepad oder Tastatur. | Reiter „Steuerung“ |
| 48 | 03.11.2026 | Freie Tastenbelegung im Reiter „Steuerung“ bauen (Option 1). SITL ist das nächste große Thema. | Tastenbelegung; Plan: SITL (P4) als nächste große Etappe |
| 49 | 03.11.2026 | Mit Option 1 weiter: Machbarkeit SITL prüfen. | `docs/sitl-machbarkeit.md`; Emscripten-Installation von der Umgebung blockiert |
| 50 | 03.11.2026 | Den Weg wählen, bei dem die GitHub-Seite weiter funktioniert. | Weg 2 (clang ohne Emscripten), fertige WebAssembly-Datei im Repository; Betaflight läuft in Node |
| 51 | 03.11.2026 | Betaflight mit dem Vorschlag einbauen und ausprobieren. Falls es scheitert, zurück auf den Stand davor. | P4 Teil 2: Betaflight als wählbarer Regler im Simulator |
| 52 | 04.11.2026 | (18 Beispielbilder aus anderen Simulatoren) Beispiele für OSD und weitere Ziele in der Luft. | Fragerunde |
| 53 | 04.11.2026 | Antworten: OSD mit Kompassband, Sucher-Rahmen, Brillenrand und Rec.; drei OSD-Stile; Bildmodi Wärmebild und Nachtsicht; Luftziele Starrflügler, Hubschrauber-Drohne, großer Multikopter. | Plan O2, V1, J1 |
| 54 | 04.11.2026 | Einfache Modi noch einfacher: Ziele tragen Luftballons, die getroffen werden müssen. Luftziele ziehen sie hinter sich her, Bodenziele tragen sie über sich (wie der Ballon-Kampf in Mario Kart). Das neue „Mittel“ ist das alte „Leicht“. | Plan J0 |
