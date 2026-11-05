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

### J1: Neue Luftziele für die Jagd (erledigt 04.11.2026 als eigener Modus „Jagd Flugzeuge“, hunt3)
- Starrflügler: kleine Flugzeug-Drohnen, Kreise und Achten in 30 bis 80 m Höhe, schnell.
- Hubschrauber-Drohne: ein Hauptrotor mit Heckrotor, fliegt Patrouille.
- Großer Multikopter: langsamer Sechs-Rotor, große Trefferfläche, schwebt an Wegpunkten.
- Jedes Ziel mit eigenem Modell, eigener Strecke (keine doppelt genutzt) und eigener Punktzahl.

### J0: Ballon-Modus und drei Schwierigkeitsstufen (Nutzer, 04.11.2026; Teil 1 erledigt)
- Drei Stufen: Leicht (mit Erleichterungen), Normal (ohne Hilfen, = altes „Leicht“), Schwer (strengere Bedingungen, = altes „Mittel“). Das alte „Schwer“ entfällt.
- Leicht, erledigt: In der Jagd (Luft und Boden) trägt jedes Ziel einen Ballon an einer Leine (`src/balloon.js`). Nur der Ballon zählt, er platzt mit Knall, das Ziel stürzt ab bzw. bleibt stehen, die eigene Drohne fliegt weiter. Ballon Radius 0,6 m, Leine 3 m (Schätzungen).
- Leicht, Runde 1 (erledigt): Ringe 3 m statt 2,2 m, Slalom 10 m, Tor zählt bis 0,8 m neben der Öffnung (Rahmen unverändert); Landeplatz und Lieferzonen doppelt so groß; Landehilfe unter 5 m (höchstens 1,2 m/s plus 0,5 m/s je Meter Höhe sinken); Abwurf im Überflug unter 12 m; Sinkraten-Anzeige in Landung und Lieferung; Verfolgung 30 % langsamer, Abstand bis 18 m. Allgemeine Hilfen (Höhe halten, Leitlinie, Zeitlupe, weiche Hindernisse) vom Nutzer nicht gewählt.
- Leicht, Runde 2 (erledigt, Vorschlag von Claude, Nutzer sieht das Ergebnis an): Ringe nur 3 bis 8 m hoch; Leuchtspur hinter dem Auto in der Verfolgung; Ballon-Treffer 0,3 m großzügiger; Ziele in der Jagd langsamer (0,55 statt 0,7).
- Leicht, offen: weitere Runden nach Bedarf.
- Vorgabe für die Demo: Normal.

Vorschlag Reihenfolge: J0, O2, V1, J1. J0 ist klein und macht die einfachen Modi sofort zugänglicher. Wärmebild (V1) wirkt am besten mit den neuen Luftzielen (J1).

## Feinwerte begrenzt (erledigt 04.11.2026, Fehler aus dem Test eines Kollegen)
- Vorher frei kombinierbar: 27 von 108 Grenzfällen unrealistisch (z. B. 5 Zoll mit 20 g: Schub zu Gewicht 364, Whoop mit 4S und 1,5 kg: Schweben bei 0,2 % Gas, teils negatives Schwebegas).
- Jetzt (`droneSpec` in drone.js, Schätzungen): Zellen nur passend zur Vorlage (Whoop 1S, sonst 4S/6S), Kapazität halb bis doppelt, Akkugewicht wächst mit Kapazität mal Zellen, Gewicht 75 bis 160 % der Vorlage mit diesem Akku, Schub 50 bis 160 % der Vorlage, Schub zu Gewicht 2 bis 16. Bei anderer Zellenzahl passende KV (gleiche Volllast-Drehzahl).
- Ergebnis über alle erlaubten Werte: Schweben 19 bis 74 %. Gespeicherte unsinnige Werte werden beim Laden begrenzt. Menü: Regler-Bereiche je Vorlage, unpassende Zellen gesperrt.
- J1 umgesetzt (`src/aircraft.js`): 6 Ziele, Flugverhalten nach realen Eigenschaften, verkleinert (Schätzungen):
  Starrflügler 2x (13 bis 15 m/s, nie schweben, Schräglage höchstens 35°, Kurvenradius über 25 m, Achte und Kreis in 22 bis 36 m, 3 Punkte);
  Hubschrauber 2x (höchstens 10 m/s und 3 m/s², neigt sich beim Beschleunigen, dreht höchstens 70°/s in Flugrichtung, 2 s Halt, 2 Punkte);
  Sechs-Rotor 2x (höchstens 5 m/s und 1,5 m/s², 4 s Halt, große Trefferzone, 1 Punkt). Alle über 16 m (höchstes Hindernis 15,1 m).
  Leicht: Ballons. Wärmebild: Motoren hell. Tests in `test/aircraft.test.mjs` messen Tempo, Schräglage, Kurvenradius, Beschleunigung, Drehrate, Schweben und Höhe nach.

## Testecken auf der Karte (erledigt 04.11.2026, danach auf Wunsch verteilt)
- Erst als kleine Stadt westlich des Starts gebaut, dann auf Wunsch des Nutzers über die Karte verteilt (zu nah beieinander).
- Orte (Mitte x/z, alle auf freier Fläche, mindestens 100 m auseinander, über 80 m von Kurs, Strecken und Plattformen, außerhalb des Jagd-Gebiets):
  Offenes Haus West (-92/-74), Spielplatz Südwest (-110/75), Baustelle Nord (12/-165), Parkhaus Ost (190/-130), Ruine Süd (55/190).
- Inhalt wie zuvor: Spielplatz mit Übungsfenstern für Whoops, Baustelle mit Rohbau, Gerüst und Kran 14 m, offenes Haus mit 2 Geschossen,
  Parkhaus mit 3 offenen Decks, Ruine mit Turmrest. Eigene Hindernisliste `town` in `src/town.js`, `colliders` bleibt wie in legacy/.
- Freiflug startet wieder in der Mitte (TOWN.start), alle Ecken liegen rundherum. Alles unter 16 m. Tests: `test/town.test.mjs`.

## Ziele über die Karte verteilt (erledigt 04.11.2026)
- Jagd Luft: 6 bewegte Ziele mit eigenem Bereich (22 m) an den Testecken und in der Mitte (Kreis um das Parkhaus, Acht über der Ruine, Linie vor der Baustelle, zufällig um Haus und Spielplatz, ausweichend in der Mitte), 3 schwebende neben Baustelle, Ruine, Parkhaus. Neue Wegpunkte nur bei freiem Weg (2,5 m Abstand).
- Jagd Boden: Ringstraßen um Ruine, Spielplatz, Parkhaus und Baustelle (Ecken abgeschrägt, mindestens 6 m Abstand zu Hindernissen); fahrend auf drei Ringen und der Kursrunde, geparkt im Parkhaus, auf der Baustelle und vor dem Haus.
- Jagd Flugzeuge: größerer Radius. Achte aus zwei 60-m-Kreisen, Kreis mit 120 m; Hubschrauber patrouillieren von Ecke zu Ecke, Sechs-Rotoren über Ruine und Baustelle (über dem Kran).
- Tests: `test/spread.test.mjs` (keine Berührung von Hindernissen, Verteilung, Radius).

## Flackern, Boden-Physik, Himmel (erledigt 05.11.2026, Prompt 65)
- Flackern: Der Boden wird zuerst und ohne Tiefen-Eintrag gezeichnet. Alles andere steht auf oder über ihm. Flache Platten können deshalb nicht mehr mit dem Boden flackern, auch bei grober Tiefe am Gerät. Platten und Markierungen darauf trennt ein kleiner Tiefen-Vorsprung je mm Höhe (Vertex-Shader).
- Boden-Physik: Auf den Füßen, Gas unten, Sticks mittig stoppt Reibung Gieren und Rutschen schneller (Abklingzeit 1/40 s, Schätzung). Betaflight: am Boden mit Gas unter 5 % höchstens etwa 1/3 des Gewichts als Schub; alle Motoren werden gleich gesenkt, Gieren dreht weiter. Der Betaflight-Schutz gegen Durchgehen beim Start (`runaway_takeoff_prevention`) ist in `sitl/platform.c` aus, sonst schaltet er sich bei dieser Grenze ab.
- Himmel: Wolken aus Rauschen ab Grafik „Mittel“ (langsam ziehend, lassen die Sonne frei), Sonnenscheibe. „Einfach“ bleibt ohne Wolken.
- Lens-Flare: ab „Mittel“, nur im normalen Bild, nur wenn die Sonne im Bild und nicht von Hindernissen verdeckt ist (Strahltest `rayBlocked`). Stärker nahe der Bildmitte, weich ein- und ausgeblendet. Additiv und schwach.
- Tests: `test/ground.test.mjs` (beide Regler, drei Drohnen: kein Hüpfen, kaum Nachdrehen, Betaflight bleibt scharf, Abheben danach; Strahltest; Boden zuerst im Netz).

## Wippen am Boden (erledigt 05.11.2026, Prompt 66)
- Ursache: Mehrere Bodenkontakte gaben einen gemeinsamen Stoß im einfachen Mittel der Kontaktpunkte, also immer unter der Mitte. Eine kleine Schieflage wurde nicht aufgerichtet und schaukelte sich auf (bis gut 1°, dauerhaft, auch ohne Motoren).
- Lösung: Kontaktpunkt nach Eindringtiefe gewichtet (plus 0,2 mm Grundgewicht). Der tiefere Fuß trägt mehr, die Drohne richtet sich auf.
- Test: `test/ground.test.mjs`, 12 s Stillstand mit und ohne Schieflage, scharf und aus. Schlägt mit dem alten Stand fehl.
- Offen zur Auswahl: Ostereier, Vögel, Gas-Anzeigen getrennt schaltbar.

## Ostereier und Gas-Balken (erledigt 05.11.2026, Prompt 67)
- 13 Ostereier in `src/eggs.js`, in jedem Modus und jeder Stufe an derselben Stelle: Sandkasten, Rutsche, Haus (Obergeschoss, Dach), Baustelle (Gerüst, Container, Kranausleger), Parkhaus (mittleres Deck), Ruine (Turm innen, Torbogen), Hochhausdach, Säule und Baum nahe dem Start.
- Berühren genügt. Meldung „Osterei gefunden! n/13“ mit Ton, gefundene Eier verschwinden. Gespeichert unter eigenem Schlüssel (`fpvsim1.eggs`), bleibt beim Zurücksetzen der Einstellungen erhalten.
- Gas-Balken links entfernt (Nutzer). THR unten und Stick-Anzeige bleiben.
- Tests: `test/eggs.test.mjs` (liegen auf einer Fläche, frei, Platz für die Drohne, Fund in mehreren Modi).

## Vögel (erledigt 05.11.2026, Prompt 68)
- 7 einzelne Vögel (`src/birds.js`), drei Arten nach Farbe (Taube, Spatz, Amsel). Keine Schwärme: jeder Landeplatz trägt höchstens einen Vogel.
- Bei jedem Start (`respawn`) neu und zufällig verteilt: sitzend auf Baumkronen und Dächern, pickend am Boden (Sandkasten, Spielplatz-Rasen, Innenhof der Ruine, freie Wiese) oder schon im Flug. Nicht am Startplatz.
- Verhalten: Sitzen und Umschauen (8 bis 25 s), am Boden Picken in Serien und kleine Hüpfer (6 bis 20 s), dann Flug zu einem anderen Ort 30 bis 180 m entfernt. Lange Flüge über 17 m Höhe (über Häuser und Kran), Flügelschlag mit Gleitphasen.
- Kommt die Drohne näher als 8 m, fliegen sie auf und suchen einen Ort mehr als 40 m von der Drohne entfernt.
- Keine Kollision: Vögel sind nicht Teil der Physik. Im Wärmebild hell (warmblütig).
- Werte als Schätzung nach einer Taube (8 m/s, 25 cm lang).
- Tests: `test/birds.test.mjs` (Anzahl, eigene Orte, alle Zustände, je Start anders, 3 min auf der Karte, Flucht, Flug unverändert).

## Housekeeping (05.11.2026, Prompt 69)
- Ostereier: Meldung zweizeilig, „Osterei gefunden!“ und darunter „n von 13 gefunden“.
- Ungenutzter Code entfernt: `bfArmed`, `huntHits`, `CFG_DEFAULT`, `BEHAVIOR_NAME`, `aliveCount`, `vehiclesLeft`.
- Commits ohne Claude: Autor ist der Nutzer, Zeilen `Co-Authored-By` und `Claude-Session` entfernt. Neuer Branch `main`; der alte Branch `claude/…` wird gelöscht, sobald `main` Standard-Branch ist.

## Lizenzdatei (erledigt 05.11.2026, Prompt 72)
- `LICENSE` mit dem GPLv3-Text (aus dem Betaflight-Quellcode übernommen), Abschnitt „Lizenz“ im README. Nachgezogen aus P4.

## Raten, Bildmodus-Reset, README (erledigt 05.11.2026, Prompt 73)
- Raten wie Betaflight „Actual“ (Mitte, Maximum, Expo), getrennt für Rollen/Nicken und Gieren, im Drohnen-Menü unter „Feinwerte“. Gelten für beide Regler. Betaflight bekommt sie über `bf_set_rates` (neu in `sitl/platform.c`, WASM neu gebaut). Vorgabe 250/450/45 und 190/290/30, nahe der früheren Kurve; ältere Einstellung „Max. Drehrate“ wird umgerechnet.
- Neustart (R, Neuer Flug, Programmstart) setzt Wärmebild und Nachtsicht auf normal.
- README: Link zu GitHub Pages ganz oben, Lizenzabschnitt, Liste der DOM-freien Module aktualisiert.
- Tests: `test/rates.test.mjs` (Formel, beide Regler drehen mit der eingestellten Rate, Bildmodus-Reset).

## Vergleich mit SimITL (05.11.2026, nur Bericht)
- SimITL (GPLv3, Physik in `src/sim/physics.cpp`): Euler mit 8 kHz, Motor mit Gegenspannung, 2 ms ESC-Verzögerung plus Filter, Motortemperatur, Schub abhängig von der Anströmung, Bodeneffekt, Propwash mit Rauschen, Akku-Spannungseinbruch als Faustformel, quadratischer Luftwiderstand je Achse, Druckpunkt 2 cm versetzt (Pendelmoment), Flattern ab 2 m/s, Kreisel-Rauschen nach Drehzahl. Keine Kollision (macht die Engine).
- Bei uns schon vorhanden: Motor mit Gegenspannung und Hochlaufzeit, Schub nach Anströmung, Bodeneffekt, Wirbelring/Propwash, Akku mit Innenwiderstand (genauer als SimITL), Rotorwiderstand, Luftwiderstand nach Lage, Stöße mit Drehung.
- Nur bei SimITL: ESC-Verzögerung, Motortemperatur, Druckpunkt-Versatz, Flattern, Kreisel-Rauschen (vom Nutzer vorerst nicht gewünscht), 8 kHz.
- Empfehlung: nicht übernehmen. Höchstens klein und einzeln: Druckpunkt-Versatz (Drohne richtet sich im schnellen Flug leicht auf) und ESC-Verzögerung (2 ms).
