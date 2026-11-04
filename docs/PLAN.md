# Etappenplan FPV-Simulator

Fassung 3 vom 30.10.2026. Jede Etappe ist eine abgeschlossene Einheit: umsetzen, prüfen, committen, berichten, anhalten.
Aufwand ist eine Schätzung. Annahme: „mittel“ ist eine Arbeitssitzung, „groß“ etwa zwei.

## Entscheidungen des Nutzers (30.10.2026)

- **Eine Karte, mehrere Szenarien.** Die bisherige Karte bleibt. Auf ihr liegen verschiedene Aufgaben: Tore am Boden, Ringe in der Luft, fliegende Ziel-Drohnen und weitere.
- **Ziel-Drohnen sind Ziele, keine Hindernisse.** Ein Treffer gibt Punkte. Die getroffene Drohne stürzt ab. Sind x Drohnen getroffen, ist die Aufgabe erfüllt.
- **Verhalten der Ziel-Drohnen ist unterschiedlich:** dumm, zufällig, ausweichend, verschieden schnell.
- **Grafik:** zuerst Farbe und Licht, dann Boden, Bäume und Gebäude.

Offene Details mit Vorschlag (gelten, bis der Nutzer anders entscheidet):

| Frage | Vorschlag |
|---|---|
| Anzahl Ziele und x | 6 Ziele, x = 5, im Menü 1 bis 6 |
| Wertung | 1 Punkt pro Treffer. Wertung ist die Zeit bis zur erfüllten Aufgabe. Bestzeit je Szenario. |
| Eigener Absturz im Szenario | Versuch endet. Neustart setzt alles zurück. |

## Entscheidungen Physik und Realitätsnähe (02.11.2026)

Vom Nutzer in drei Runden entschieden:

| Frage | Entscheidung |
|---|---|
| Grundrichtung | Echtes Betaflight als WebAssembly steuert die Drohne. Der eigene Regler bleibt als Rückfall („Einfach“). |
| Lizenz | GPLv3 für das ganze Projekt ist in Ordnung (LICENSE kommt mit P4). |
| Betaflight-Quelle | Selbst bauen: fester Betaflight-Stand, mit Emscripten in der CI kompiliert. |
| Einbettung | WASM als Base64 in die eine Datei (html und aspx bleiben je eine ASCII-Datei). |
| Motormodell | Drehzahl-Modell (KV, Spannung, Strom, Schub und Moment ~ Drehzahl²). |
| Aerodynamik | Schub sinkt mit Anströmung (inkl. Propwash), Rotorwiderstand, Widerstand nach Lage, Bodeneffekt. |
| Sensoren und Umwelt | Kreiselrauschen mit Motorvibration, Bild- und Funkverzögerung, Wind und Böen, Turtle-Modus. |
| Kollision | Abprallen mit Drehimpuls statt nur Gleiten. |
| Reihenfolge | Erst Motor und Aerodynamik, dann Betaflight. |
| Prüfung | Kalibrierung auf Datenblätter und Prüfstandsdaten; der Nutzer fliegt mit Funke und gibt Rückmeldung. |

## Abhängigkeiten

```
E0 Repo, Module, Build, Tests   (erledigt, dazu GitHub Pages)
 ├─ E1 LiPo-Modell (erledigt; Stick-HUD mit O1)
 ├─ E2 Physik 2.0 (erledigt) ─┬─ E3 Drohnen-Vorlagen (erledigt)
 │                 └─ E4 Schadmodell (erledigt)
 ├─ E5 Szenarien und Ringe (erledigt) ── E6 Ziel-Drohnen mit Verhalten (erledigt) ── Jagd Boden (erledigt)
 ├─ M1 Menü in Schritten, Drohnen-Vorlagen (erledigt)
 ├─ M2 Menü kompakt: passt ohne Scrollen, Reiter, Feinwerte als eigene Ansicht (erledigt)
 ├─ O1 OSD realistischer, Bildmodus, OSD-Optionen, Stick-Anzeige (erledigt)
 ├─ S1 Störsignale: Signalmodell mit Hindernissen, Bildfehler analog/digital (erledigt)
 ├─ G1 Grafik: Farbe und Licht (erledigt)
 └─ G2 Grafik: Boden, Bäume, Gebäude (erledigt)
```

E5, E6, G1 und G2 hängen nicht an E1 bis E4 und können vorgezogen werden.
Vorgeschlagene Reihenfolge: E6, G1, G2, danach E1 bis E4.
G1 und G2 ändern nur das Aussehen. Hindernisse und Kollision bleiben gleich.

---

## E0: Repo, Module, Build, Tests (mittel)

**Ziel:** Gleiches Verhalten wie `legacy/fpv-sim-stufe1.html`, aber in Modulen mit Build und Tests.

- Quellen in `src/` aufteilen, zum Beispiel: `math.js`, `world.js`, `physics.js`, `render.js`, `input.js`, `gamepad.js`, `hud.js`, `audio.js`, `menu.js`, `main.js`, dazu `index.html` und `style.css`.
- Build-Skript ohne Abhängigkeiten (Node, nur Standardmodule). Es fügt alles zu `dist/fpvsim.html` zusammen und erzeugt `dist/fpvsim.aspx` über die Logik aus `tools/to_aspx.py`. Den Konverter dafür nach Node portieren oder Python in der CI nutzen.
- Physik ohne DOM und WebGL lauffähig machen, damit Tests in Node laufen.
- Tests mit `node:test`:
  - Schwebegas ergibt nach 3 s eine Steiggeschwindigkeit nahe 0.
  - Vollgas 1 s steigt.
  - Angle-Modus mit Nicken nach vorn fliegt in -Z.
  - Tor-Durchflug zählt.
  - Treffer auf Torpfosten ergibt Absturz.
  - Akku verbraucht Strom.
  - Gamepad-Zuordnung (RadioMaster-Vorlage) liefert die richtigen Werte.
- CI (GitHub Actions): Build und Tests bei jedem Push. `dist/` als Artefakt.
- Check im Build: `.aspx` ist reines ASCII und enthält kein `<%`.
- `legacy/` bleibt als Referenz, wird aber nicht mehr geändert.

**Abnahme:**
- `dist/fpvsim.html` verhält sich wie die Referenz: Sichtprüfung, Tests grün.
- Die CI ist grün.

## E1: Stick-HUD und LiPo-Modell (klein)

**Stick-HUD:**
- Zwei kleine Quadrate im OSD mit Punkt für die Knüppelstellung. Links Gas/Gieren, rechts Nicken/Rollen.
- Bei Touch aus. Im Menü schaltbar.

**LiPo:**
- Ruhespannung pro Zelle aus einer Tabelle über den Ladestand. Steil oben und unten, flach in der Mitte. Tabellenwerte als Schätzung kennzeichnen.
- Spannungserholung nach Last mit Zeitkonstante, zum Beispiel ein RC-Glied.
- Schub ungefähr proportional zum Quadrat der Spannung, bezogen auf die Nennspannung.
- Einstellbar: Zellen (4S, 6S), Kapazität, Warnschwelle (Vorgabe 3,5 V/Zelle), Minimum (Vorgabe 3,3 V/Zelle).
- OSD: zusätzlich die niedrigste Spannung des Fluges.

**Abnahme:**
- Test: Spannung fällt unter Last und erholt sich ohne Last.
- Test: Bei 6S ist mehr Schub verfügbar als bei 4S, sonst gleich.

## E2: Physik 2.0 (groß, Fundament)

**Ziel:** Kräfte und Momente pro Motor statt direkt gesetzter Drehraten.

- **4 Motoren:** Position (Armlänge), Drehrichtung, Hochlaufzeit, Schub zwischen 0 und Maximalschub.
- **Moment um Nick- und Rollachse:** Armlänge mal Schubdifferenz. Moment um die Hochachse aus dem Propellerwiderstand, proportional zum Schub mit Faktor k.
- **Trägheit als Diagonaltensor:** aus Geometrie berechnet. Motoren als Punktmassen, Rumpf und Akku als Quader.
- **Rate-PID pro Achse** (P, I, D mit I-Begrenzung) und **Mischer** wie bei einem Quad-X. Motorausgabe auf 0 bis 1 begrenzt. Bei Sättigung bleibt die Lageregelung vorn, wie Airmode.
- **Angle-Modus:** äußerer Regler auf Neigung, der Sollraten an den Rate-PID gibt.
- **Bisherige Eingaben, Modi und OSD bleiben.**
- Feste Schrittweite bleibt 1/240 s. Bei instabilen PID-Werten eventuell Unterschritte.

**Abnahme:**
- Test: Schweben bei passendem Gas ist stabil, ohne Aufschwingen über 10 s.
- Test: Doppelte Trägheit ergibt eine langsamere Antwort auf einen Rate-Sprung.
- Test: Bei Vollgas plus vollem Rollbefehl bleibt mindestens ein Motor unter 100 %. Die Sättigung wird korrekt behandelt.
- Fluggefühl in Angle und Acro ähnlich wie vorher. Der Nutzer prüft das am echten Gerät.

## E3: Drohnen-Vorlagen (mittel)

- Vorlagen: Tinywhoop 65 mm, 3-Zoll-Cinewhoop, 5-Zoll-Freestyle, 7-Zoll-Langstrecke.
- Einstellbar: Gewicht, Propellergröße, Armlänge, Maximalschub pro Motor, Akku.
- Werte als Schätzung markieren, mit Quelle oder Annahme im Code.
- Größe wirkt auf Modell, Propeller, Kollisionsradius und Kameraposition.
- Auswahl im Menü, gespeichert in `localStorage`.

**Abnahme:**
- Test je Vorlage: Schwebegas liegt zwischen 10 % und 50 %.
- Die Trägheit steigt mit der Größe.

## E4: Schadmodell pro Rotor (mittel)

- **Zustand je Rotor:** 0 bis 1. Er senkt den Maximalschub und erzeugt Unwucht (Zittern).
- **Treffer:** Die Richtung im Körpersystem bestimmt die betroffenen Rotoren. Die Aufprallenergie bestimmt den Schaden. Leichte Treffer geben Schaden statt Absturz.
- **Ausfall eines Rotors:** führt zum unkontrollierten Absturz. Kein Spezialregler für Flug mit 3 Rotoren.
- **Anzeige:** OSD-Warnung je Motor, Kamerazittern, verändertes Motorgeräusch, kaputter Propeller in der Verfolgerkamera.
- **Einstellung:** aus, nachsichtig (Standard), realistisch. Neustart repariert alles.

**Abnahme:**
- Test: Schaden an einem Rotor wird vom Regler ausgeglichen, solange Reserve da ist.
- Test: Ein Rotor auf 0 führt zu Drehung und Höhenverlust.

## E5: Szenarien auf einer Karte, Ringe (mittel)

**Ziel:** Die Karte bleibt. Szenarien legen fest, welche Aufgabe darauf liegt.

- **Szenario als Daten:** Name, Liste von Elementen, Ziel (Runde, Anzahl Treffer, Landung ...).
  Element: `type`, Position, Ausrichtung, Größe. Typen in E5: `gate`, `ring`, `pole`, `flag`, `pad`.
- **Ring:** frei schwebend, beliebig geneigt. Kollision analytisch über den Abstand zur Kreislinie (Torus). Durchflug über die Ringebene.
- **Szenarien in E5:**
  - Torkurs: die bisherigen 8 Tore am Boden. Verhält sich genau wie bisher.
  - Ringparcours: Ringe in der Luft mit Höhenwechseln und Neigung.
  - Slalom: um Pfeiler und Fahnen, abwechselnd links und rechts.
  - Präzisionslandung: auf einer kleinen Plattform landen, möglichst sanft und schnell.
  - Freiflug: ohne Aufgabe.
- **Menü:** Szenario-Auswahl. Bestzeit je Szenario in `localStorage`.
- **OSD:** Fortschritt passend zum Szenario (Tor 3/8, Ring 2/10, Treffer 1/5).
- **Später:** Szenarien aus der SharePoint-Bibliothek laden. Das setzt ein positives Ergebnis der Technik-Probe für `.json` voraus.
- **Nicht in E5:** Tunnel. Er bräuchte neue Geometrie in der Karte. Kann später als eigenes Element kommen.

**Abnahme:**
- Test: Durchflug durch einen geneigten Ring zählt. Treffer auf den Ring ergibt Absturz.
- Test: Slalom zählt nur auf der richtigen Seite.
- Test: Landung zählt nur unter einer Grenzgeschwindigkeit auf der Plattform.
- Test: Torkurs verhält sich unverändert (Vergleich mit der Referenz aus E0).

## E6: Ziel-Drohnen mit Verhalten (mittel bis groß)

**Ziel:** Szenario „Jagd“: fliegende Drohnen treffen.

- **Treffer:** Kugel gegen Kugel über den Bewegungsweg des Schritts, nicht nur den Endpunkt.
  Ein Treffer zählt einen Punkt. Die getroffene Drohne fällt mit Drehung zu Boden und bleibt liegen. Sie zählt nicht noch einmal.
  Die eigene Drohne fliegt weiter. Ab E4 optional Schaden bei hartem Treffer.
- **Aufgabe:** x Treffer. Danach Meldung mit benötigter Zeit. Bestzeit wird gespeichert.
- **Verhalten je Ziel-Drohne:**
  - dumm: feste Route (Kreis, Acht, Hin und Her), gleichmäßiges Tempo.
  - zufällig: wählt neue Wegpunkte im Gebiet, wechselt Richtung und Höhe unvorhersehbar.
  - ausweichend: flieht, wenn der Spieler nahe kommt, mit begrenzter Beschleunigung und Wendigkeit. Bleibt im Gebiet und meidet Hindernisse grob.
  - Tempo je Drohne einstellbar.
  Alle Ziele bewegen sich kinematisch (nicht voll simuliert), mit Schräglage in Kurven. Ziele verfolgen den Spieler nicht.
- **Optik:** eigenes Farbschema je Verhalten, drehende Propeller.
- **OSD:** Trefferzähler, Marker zum nächsten Ziel wie der Tormarker.
- **Zufall mit festem Startwert,** damit Tests und Bestzeiten vergleichbar bleiben.

**Abnahme:**
- Test: Frontalbegegnung mit 40 m/s Annäherung wird erkannt und nicht durchflogen.
- Test: Treffer zählt genau einmal, das Ziel stürzt ab und liegt danach am Boden.
- Test: Nach x Treffern ist die Aufgabe erfüllt.
- Test: Ausweichende Drohne vergrößert den Abstand, wenn der Spieler sich nähert. Dumme Drohne nicht.
- Test: Zufällige Drohne bleibt im Gebiet.

## M1: Menü in Schritten, Drohnen-Vorlagen (erledigt)

- Hauptmenü: Neuer Flug, Einstellungen, Weiterfliegen (wenn ein Flug läuft).
- Neuer Flug: Modus -> Parcours (Schwierigkeit) -> Drohne (Vorlage 3"/5"/7", Schub, Akku, Zellen, Flugmodus) -> Start.
- Einstellungen über Esc, P oder ☰ oben links, von überall.
- Trägheit, Gewicht und Größe der Drohne folgen mit E2/E3.

## O1: OSD realistischer, Bildmodus, OSD-Optionen (erledigt)

Wunsch des Nutzers vom 30.10.2026.

- Bildmodus: Analog (Rauschen, Störstreifen), Digital (sauber, bei schwachem Signal Klötzchen und Standbild), ohne Effekte.
- OSD-Stil passend zum Bildmodus: Analog im Betaflight-Look (Zeichensatz, Symbole), Digital feiner und schärfer.
- OSD-Elemente im Menü einzeln ein- und ausschalten.
- Stick-Anzeige: zwei kleine Quadrate mit der Knüppelstellung (aus E1 vorgezogen).
- Mehr Werte: zum Beispiel Neigung, Drehrate, Uhrzeit, Verbrauch pro Minute. Auswahl im Menü.

**Abnahme:**
- Sichtprüfung je Bildmodus am PC und mobil.
- Test: ausgeschaltete OSD-Elemente werden nicht gezeichnet.

## G1: Grafik, Farbe und Licht (klein bis mittel)

- Richtige Farbrechnung: lineares Licht, Tone-Mapping, Ausgabe in sRGB. Farben danach neu abstimmen.
- Himmelslicht und Sonnenlicht getrennt, wärmeres Sonnenlicht, kühlere Schattenseite.
- Vorberechnete Abdunklung (Ambient Occlusion pro Vertex): unter Kronen, am Fuß von Gebäuden und Pfeilern, in Ecken.
- Leichter Dunst nahe dem Boden, Nebelfarbe passend zum Himmel.
- Im Menü abschaltbar (Grafik: einfach / schön).

**Abnahme:**
- Sichtprüfung: Vorher-Nachher-Bilder am PC und mobil.
- Bildrate in Headless-Chromium nicht deutlich schlechter. Messung im Bericht.
- Physik-Tests unverändert grün.

## G2: Grafik, Boden, Bäume, Gebäude (mittel)

- Boden: Gras und Erde aus Rauschmustern im Shader, Wege zwischen den Toren, Startplatz deutlicher.
- Bäume: runde oder kegelförmige Kronen aus mehreren Flächen, Farbschwankung je Baum. Kollision bleibt der Quader.
- Gebäude: Fenster und Türen im Shader, Dachkante, leichte Verschmutzung am Fuß.
- Alles mit festem Startwert 1949. Die Lage aller Objekte bleibt gleich.

**Abnahme:**
- Sichtprüfung: Vorher-Nachher-Bilder.
- Test: Hindernisse (Lage und Größe) gleich wie in der Referenz aus E0.
- Bildrate wie bei G1 gemessen.

## P1: Motor und Aerodynamik (erledigt)

- Motor mit KV, Innenwiderstand, Leerlaufstrom; Drehzahl aus Spannung und Last; Schub und Moment ~ Drehzahl².
- Kalibrierung auf veröffentlichte Prüfstandsdaten (z. B. 2207-Motor mit 5-Zoll-Propeller), Quellen im Code.
- Schub abhängig von der Anströmung durch den Rotor; Sinkflug in den eigenen Abwind wird unruhig (Propwash, vereinfacht).
- Rotorwiderstand je Rotor (~ Geschwindigkeit × Drehzahl, nach RotorPy), Rumpfwiderstand je nach Lage, Bodeneffekt.

**Abnahme:** Tests für Schub über Drehzahl gegen die Tabelle, Schubverlust im Steigflug, Bodeneffekt, Bremsweg; Nutzer fliegt.

## P2: Kollision (Teil 1 erledigt) und Turtle-Modus (erledigt)

- Abprallen mit Drehimpuls aus Stoßpunkt und Normale; Schaden wie E4.
- Erledigt: Hitbox aus 4 Füßen, Rahmen und 4 Propellerkreisen; Stoß am Kontaktpunkt mit Masse und Trägheit (Rückprall 30 %, Reibung 0,5, Schätzwerte); ein gemeinsamer Stoß je Hindernis; harte Treffer bleiben Absturz; Hinweis UMGEDREHT.
- Turtle-Modus (Nutzer, 02.11.2026, Variante 1): schaltet sich von selbst ein, wenn die Drohne scharf geschaltet still auf dem Kopf liegt. Motoren drehen rückwärts (Schätzung 50 % Schub), Nicken oder Rollen kippt über die Kante in Stick-Richtung. Aufrecht oder 1 s in der Luft: normal weiter. Gilt in allen Schadmodi, auch in Seitenlage. Vereinfacht: Stick gibt eine Kipp-Drehrate vor.
- Hitbox-Füße (erledigt 02.11.2026): Füße auf Höhe der Rahmen-Unterseite (PHYS.foot = 1 cm je Größe 1, wie im Modell), Propeller als flache Scheiben, Oberseite als kleine Kugel. Boden-Bezüge (Start, Höhe, Bodeneffekt, Landung, Schatten) nutzen PHYS.foot; PHYS.radius bleibt für Ringe und Treffer. Bodenkontakt mit Gas unten dämpft die Drehung (Schätzung 0,1 s). Platten am Boden flach, Boden in 30-m-Kacheln (Tiefengenauigkeit).

## P3: Sensoren und Umwelt (mittel)

- Kreisel mit Rauschen und Motorvibration (für die echten Betaflight-Filter in P4).
- Bildverzögerung (analog ca. 20 ms, digital 25 bis 40 ms) und Funkverzögerung nach Paketrate (Schätzungen).
- Wind und Böen, stärker in der Höhe, im Menü einstellbar.

## P4: Betaflight als WebAssembly (groß)

- Fester Betaflight-Stand (4.5.x), Emscripten-Build in der CI, Anbindung: Kreisel/Beschleunigung rein, Motorbefehle raus.
- Base64-Einbettung in fpvsim.html und fpvsim.aspx; Größe messen und im Bericht nennen.
- LICENSE (GPLv3) ins Repo. Eigener Regler bleibt als Rückfall, Auswahl im Menü.
- Turtle-Modus dann über Betaflight selbst.

## R1: Grafik-Details (erledigt)

- Sonnenschatten von Bäumen, Gebäuden, Pfeilern und Toren: einmal beim Start in die Bodentextur gerechnet (nur Schön, keine Laufzeitkosten).
- Weiche Schatten unter Drohne, Ziel-Drohnen und Autos (Mittel und Schön).
- Detailliertere Modelle: Drohne (Platten, Arme, Motorglocken, Kamera mit Linse, Akku mit Gurt, Antenne), Autos (Räder mit Felgen, Fensterband, Lichter), Baumkronen aus drei Teilen.
- Nicht gemacht, weil derzeit ohne Nutzen: Instancing und Detailstufen (wenige Zeichenaufrufe, Kosten liegen bei den Pixeln), FXAA (Kantenglättung des Browsers ist an; Auflösung automatisch gibt es seit G3).

## Entscheidungen Grafik und Modi (02.11.2026)

- Grafik: „Einfach“ bleibt unverändert. „Schön“ schneller (Bodenmuster vorab als Textur), neue Stufe „Mittel“, Auflösung automatisch. (G3, erledigt)
- Neue Modi: Paketlieferung, Verfolgung.
- Ringe und Slalom: bei jedem Start eine neue Anordnung, mit Prüfung (keine Hindernisse im Weg, fliegbar).
- Reihenfolge: erst Grafik-Leistung, dann Modi, dann P2.

## M3: Neue Modi und Varianten (erledigt)

- Paketlieferung: Paket an einer Stelle aufnehmen (tief anfliegen, kurz halten), an Plattformen abliefern. Zeit und Präzision zählen.
- Verfolgung: einem Fahrzeug oder einer Drohne folgen, Abstand im Zielband halten; Wertung = Zeit im Band.
- Ringe und Slalom: zufällige Anordnung bei jedem Start; Prüfung: freie Durchflüge, Abstände, Höhen, keine Hindernisse im Weg.

## L1: Spielstil-Karten und Lernhilfen (erledigt)

Entscheidung des Nutzers vom 02.11.2026.

- Spielstil-Karten im Schritt „Drohne“ mit Symbol: Lernen, Normal, Realistisch, Gott-Modus. Eine Karte setzt mehrere Einstellungen auf einmal; einzelne Änderungen danach ergeben „Eigene“.
  - Lernen: Angle, Schaden aus, Akku unendlich, Flugspur an.
  - Normal: Angle, Schaden aus, Akku normal (heutiger Standard).
  - Realistisch: Acro, Schaden realistisch, Akku normal, Scharfschalten nötig.
  - Gott-Modus: Durch Hindernisse fliegen, Schaden aus, Akku unendlich, Flugspur an.
- Neu: Durch Hindernisse fliegen (Geist-Modus; Boden bleibt fest).
- Neu: Flugspur der letzten Sekunden und Zurückspulen um 5 s per Taste.
- Später entscheiden: Strecken-Editor (Ideen: Platzieren im Flug, Karte von oben).

## Demo-Vorgaben und Ton (erledigt 02.11.2026)
- Erster Start: Torkurs, Spielstil „Lernen“ (Angle, kein Schaden, Akku unendlich, Flugspur), Bild ohne Rauschen, Lautstärke 70 %. Gespeicherte Einstellungen bleiben.
- Ton neu (audio.js): je Motor Propeller-Brummen (Drehzahl × 3 Blätter) und Motorpfeifen (Drehzahl × 7 Polpaare, Schätzung), Rauschen für Propeller, Fahrtwind und Propwash, Aufprall und Absturz, weiche Signaltöne, Lautstärke-Regler. Nur WebAudio.

## Steuerung und Tasten (erledigt 03.11.2026)
- Reiter „Steuerung“ (vorher „Funke“): oben Umschaltung „Funke / Gamepad“ und „Tastatur“.
- Freie Tastenbelegung für 15 Funktionen (cfg.keys, nur Abweichungen), Lernen per Antippen, belegte Tasten tauschen, Esc und P reserviert, + und − (Blickfeld) fest. Hilfe zeigt die aktuelle Belegung.

## Nächste große Etappe (Nutzer, 03.11.2026)
- SITL: echtes Betaflight als WebAssembly (P4). P3 (Wind, Verzögerung, Kreisel) danach oder nach Bedarf.
- P4 Teil 1 (erledigt 03.11.2026): Betaflight als WebAssembly ohne Emscripten gebaut (`sitl/`), läuft in Node. Ausnahme von „keine externen Quellen“: Betaflight (GPLv3), vom Nutzer so entschieden. Die fertige Datei liegt im Repository, damit die CI ohne C-Compiler baut und die GitHub-Seite weiter funktioniert. Details: `docs/sitl-machbarkeit.md`.
- P4 Teil 2 (erledigt 03.11.2026): Betaflight im Simulator. `sitl/betaflight.wasm` kommt beim Build als Base64 in die HTML-Datei (Platzhalter in `src/bf.js`, HTML etwa 815 KB). Wahl unter Drohne → Feinwerte: „Eigener Regler“ (Vorgabe) oder „Betaflight“. Achsen: unser Körper (x rechts, y oben, z hinten) zu Betaflight (x vorne, y links, z oben); Beschleunigungssensor aus der Geschwindigkeitsänderung; Funk AETR, AUX1 scharf, AUX2 Angle. Startpause aus, Kreisel-Abgleich 0,1 s, 1,5 s Vorlauf bei jedem Neustart. Fällt Betaflight aus, fliegt der eigene Regler. Betaflight nutzt seine eigenen Standard-Raten.

## Nächste Etappen aus den Beispielbildern (Nutzer, 04.11.2026)

### O2: OSD erweitern (erledigt 04.11.2026)
- Kompassband oben (N, O, S, W mit Gradstrichen, dreht mit der Blickrichtung).
- Sucher-Rahmen: eckige Klammern um die Bildmitte, großes Fadenkreuz.
- Brillenrand: runder dunkler Rand wie in einer Videobrille, roter Rec.-Punkt.
- Jedes Element einzeln im OSD-Reiter abschaltbar.
- Drei OSD-Stile als Vorlage: Betaflight analog (wie heute), Digital-Brille (klare Schrift, große Werte rechts), Racer minimal (Modus, Gas, Höhe, Zeit).

### V1: Bildmodi (erledigt 04.11.2026)
- Wärmebild: Graustufen, Fahrzeuge und Ziel-Drohnen hell. Einfacher Shader, Stufe „Einfach“ bleibt schnell.
- Nachtsicht: grün, verrauscht, Szene dunkler.
- Umschalten reihum mit Taste N (frei belegbar), Funk-/Gamepad-Schalter „Wärme/Nacht“, Menü Allgemein. Wärme je Objekt über uHeat im Shader (Ziel-Drohnen 0,9, fahrende Autos 0,85, eigene Drohne 0,7, Ballons 0,35).

### J1: Neue Luftziele für die Jagd
- Starrflügler: kleine Flugzeug-Drohnen, Kreise und Achten in 30 bis 80 m Höhe, schnell.
- Hubschrauber-Drohne: ein Hauptrotor mit Heckrotor, fliegt Patrouille.
- Großer Multikopter: langsamer Sechs-Rotor, große Trefferfläche, schwebt an Wegpunkten.
- Jedes Ziel mit eigenem Modell, eigener Strecke (keine doppelt genutzt) und eigener Punktzahl.

### J0: Ballon-Modus und drei Schwierigkeitsstufen (Nutzer, 04.11.2026; Teil 1 erledigt)
- Drei Stufen: Leicht (mit Erleichterungen), Normal (ohne Hilfen, = altes „Leicht“), Schwer (strengere Bedingungen, = altes „Mittel“). Das alte „Schwer“ entfällt.
- Leicht, erledigt: In der Jagd (Luft und Boden) trägt jedes Ziel einen Ballon an einer Leine (`src/balloon.js`). Nur der Ballon zählt, er platzt mit Knall, das Ziel stürzt ab bzw. bleibt stehen, die eigene Drohne fliegt weiter. Ballon Radius 0,6 m, Leine 3 m (Schätzungen).
- Leicht, Runde 1 (erledigt): Ringe 3 m statt 2,2 m, Slalom 10 m, Tor zählt bis 0,8 m neben der Öffnung (Rahmen unverändert); Landeplatz und Lieferzonen doppelt so groß; Landehilfe unter 5 m (höchstens 1,2 m/s plus 0,5 m/s je Meter Höhe sinken); Abwurf im Überflug unter 12 m; Sinkraten-Anzeige in Landung und Lieferung; Verfolgung 30 % langsamer, Abstand bis 18 m. Allgemeine Hilfen (Höhe halten, Leitlinie, Zeitlupe, weiche Hindernisse) vom Nutzer nicht gewählt.
- Leicht, offen: weitere Runden nach Bedarf.
- Vorgabe für die Demo: Normal.

Vorschlag Reihenfolge: J0, O2, V1, J1. J0 ist klein und macht die einfachen Modi sofort zugänglicher. Wärmebild (V1) wirkt am besten mit den neuen Luftzielen (J1).
