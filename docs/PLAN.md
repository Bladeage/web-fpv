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
- ~~**Später:** Szenarien aus der SharePoint-Bibliothek laden.~~ Entfällt: SharePoint ist kein Ziel mehr (Nutzer, 07.11.2026, Prompt 131).
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
- Neu (06.11.2026, Prompt 126): Einfrieren mit Taste F (frei belegbar), nur in Lernen und Gott-Modus (genauer: Schaden aus und Akku unendlich, also auch nach Umschalten Angle/Acro). Drohne steht, Motorton aus, Hinweis im Bild; nochmals F fliegt mit derselben Lage und Fahrt weiter. Neustart löst; Wechsel des Spielstils ebenfalls.
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

## Feinschliff (05.11.2026, Prompt 74)
- Betaflight: Stand das Gas beim Start oben, blieb Betaflight aus, auch nach „Gas runter“ (es verlangt dann ein Umlegen des Scharf-Schalters). Jetzt legt der Simulator den Schalter in diesem Fall 20 ms aus und wieder an. OSD-Hinweis „BETAFLIGHT AUS: GAS GANZ RUNTER“, solange es nicht scharf ist.
- Rundgang durch alle Szenarien, beide Regler, Grafik Einfach und Schön, alle Bildmodi: keine Fehler in der Konsole.
- Erledigt: `main` ist Standard-Branch, die CI veröffentlicht auf GitHub Pages (Notiz am 13.11.2026 nachgetragen).

## Zwei Effekte aus SimITL (erledigt 05.11.2026, Prompt 75)
- Druckpunkt über dem Schwerpunkt (`PHYS.cpY`, 5 mm je Größe 1): Der Luftwiderstand des Rahmens greift oben an, im schnellen Vorwärtsflug hebt sich die Nase leicht. SimITL nutzt 2 cm; ab 1 cm hält unser eigener Regler die eingestellte Rate nicht mehr genau.
- Verzögerung im Motorregler (`PHYS.escDelay`, 1 ms): Der Motor bekommt den Befehl etwas später, gemischt zwischen letztem und jetzigem Befehl (kürzer als ein Physikschritt). SimITL nutzt 2 ms; damit schaukelte sich unser eigener Regler beim Aufsetzen auf.
- Test Wand-Abprall misst jetzt nach 0,25 s statt 0,4 s: Später kippt die Drohne über 90° und der eigene Schub zieht sie weg; das war kein Abprall mehr (auch ohne die neuen Effekte schon knapp an der Grenze).
- Tests: `test/simitl.test.mjs`. Ruhiges Stehen am Boden und Gieren am Boden unverändert geprüft.
- Möglicher nächster Schritt: eigenen Regler gegen Störungen stärker machen (I-Anteil, Vorsteuerung), dann könnten beide Werte näher an SimITL.

## Plausibilitäts-Prüfung über viele Einstellungen (05.11.2026, Prompt 76)
- Geprüft: alle Vorlagen (Whoop, 3", 5", 7"), andere Zellenzahl, schwer (Gewicht max., Schub zu Gewicht 2, Akku groß) und leicht (Gewicht min., Schub zu Gewicht 16, Akku klein), je mit eigenem Regler und Betaflight. Je: Ruhe am Boden, Start, Schweben, Vollgas vorwärts (Angle), Aufrichten, Acro-Rollrate, Landung, Akku unter Last.
- Fehler gefunden und behoben: Der Kreisel bekam die Drehrate nach dem Bodenstoß. Kippte die Drohne am Boden (Motoren drehen sie, der Bodenstoß bremst die Rate danach wieder auf fast 0), sah der Regler das nicht. Betaflight kippte nach der Landung unbemerkt bis 60° um und richtete sich nach starkem Beschleunigen nur auf 6 bis 9° auf. Jetzt misst der Kreisel die Drehrate, mit der sich die Lage im Schritt wirklich gedreht hat (`s.wq`), für beide Regler.
- Betaflight am Boden in Ruhe (Gas unten, Sticks mittig): Leerlauf wie beim eigenen Regler.
- `bf_flag(3/4)`: geschätzte Lage von Betaflight (für Tests).
- Plausibel, kein Fehler: Whoop und schwere 3" verlieren bei voller Neigung im Angle-Modus Höhe (kleine Propeller verlieren bei Vorwärtsfahrt viel Schub, wenig Schubreserve). Betaflights Lageschätzung hinkt bei starkem Beschleunigen einige Grad nach (wie echt). Zellspannung fällt bei 5 s Vollgas auf 2,7 bis 2,9 V (hoher Strom bei 5" und 7", Akku als unendlich abgeschaltet).
- Offen, klein: Eigener Regler erreicht bei der Whoop etwa 86 % der eingestellten Rollrate.
- Test: `test/ground.test.mjs` (Betaflight sinkt auf den Boden und bleibt gerade, 3", 5", 7").

## Karte außerhalb des Orts (erledigt 05.11.2026, Prompt 80)
- Ursache der Streifen: Das vorberechnete Bodenmuster („Schön“) deckt nur 400 x 400 m ab (x -170 bis 230, z -190 bis 210). Außerhalb wurde der Texturrand weitergezogen.
- Jetzt rechnet der Shader den Boden außerhalb selbst (`groundProc`, gleiches Gras wie im Bodenmuster), mit 30 m weichem Übergang. Ab etwa 250 m von der Mitte Felder (Wiese, Weizen, Acker, dunkle Wiese, je 60 x 40 m, leicht gedreht) mit Saatreihen und Hecken.
- „Mittel“ nutzt denselben gerechneten Boden (sparsamer, weniger Rauschen) statt Schachbrett. „Einfach“ unverändert.
- Nebel bei Mittel und Schön dünner (1/380 statt 1/260), Bodendunst schwächer. Boden reicht jetzt bis 1500 m (Sichtweite), außen in 300-m-Kacheln.
- Hügel am Horizont: runde Glockenform statt 7-eckiger Kegel, nur über dem Boden (der Boden wird ohne Tiefe gezeichnet). Gleiche Zufallsfolge, die übrige Welt bleibt gleich.
- Vermutet: Der gerechnete Boden kostet bei „Mittel“ auf dem Handy etwas Leistung; die automatische Auflösung gleicht das aus.

## Physik zurück auf den Stand vor dem SimITL-Vergleich (05.11.2026, Prompt 81)
- Nutzer: Flug mit dem eigenen Regler war vorher deutlich besser. Zurückgenommen: Druckpunkt-Versatz, ESC-Verzögerung (beide aus Prompt 75) und die Kreisel-Korrektur für den eigenen Regler (Prompt 76). `src/physics.js` entspricht für den eigenen Regler wieder genau dem Stand von Commit 632a804. `test/simitl.test.mjs` entfernt.
- Bleibt, nur für Betaflight (ändert am eigenen Regler nichts): Kreisel bekommt die Drehrate, mit der die Lage gedreht wurde (`s.wq`, sonst kippt Betaflight nach der Landung unbemerkt um), und Leerlauf in Ruhe am Boden.
- Test Betaflight-Landung: Grenze 8° (Hüpfen im Bodeneffekt bei 75 % Schwebegas), der alte Fehler kippte bis 60°.
- Erkenntnis: Der eigene Regler reagiert empfindlich auf zusätzliche Verzögerung und Störmomente. Neue Physik-Effekte künftig erst mit Flugtest des Nutzers übernehmen.

## Menüs größer, Version (erledigt 05.11.2026, Prompt 83/84)
- Mehr Abstand und größere Flächen in allen Menüs. `fitPanel` (menu.js) vergrößert das Menü per CSS-zoom bis 1,35-fach, so weit Breite und Höhe erlauben; passt es nicht, verkleinert es in 3-%-Schritten (bis 0,72). Geprüft: 1280x720, 1366x650, 960x540, 390x844 ohne Scrollen.
- Version: `Version 1.<Anzahl Commits> (Datum, Kurz-Hash)`, beim Build aus git eingesetzt (`%%VERSION%%` in state.js), hellgrau im Hauptmenü. Zählt mit jedem Commit auf `main` (es gibt keine Merges, gepusht wird direkt). CI holt dafür die ganze Historie (`fetch-depth: 0`).
- Wind: vom Nutzer abgelehnt.
- Erkenntnis (Prompt 86): Nach einem Push dauert die Veröffentlichung 1 bis 2 Minuten, GitHub Pages lässt Browser bis 10 Minuten zwischenspeichern. Beim Testen immer die Version im Hauptmenü prüfen. Das „komische“ Fluggefühl vor der Physik-Rücknahme kam vermutlich von einer alten, zwischengespeicherten Fassung.

## Gemerkt, nicht einbauen (Nutzer, 05.11.2026)
- SimITL-Effekte (Druckpunkt-Versatz, ESC-Verzögerung): bleiben draußen. Wind: nein.

## Pilot, Signal-Logik, Digital-Störungen (erledigt 05.11.2026, Prompt 87)
- Pilot (`src/pilot.js`): Figur im Stil der Stadt (Hoodie, Jeans, kurze Haare, FPV-Brille auf der Stirn), 1,78 m, steht 1,6 m links und 3,6 m hinter dem Startpunkt. Funke flach in den Händen: Gehäuse, zwei Sticks, Bildschirm, Antenne. Körper dreht langsam zur Drohne (höchstens 1,2 rad/s, erst ab 20° Abweichung), Kopf folgt schneller (bis ±50°) und schaut nach oben. Keine Kollision (Nutzer: bleibt so). Im Wärmebild warm.
- Signal: geht von der Funke des Piloten aus (1,35 m hoch). Abstand im Raum (Höhe zählt). Logarithmisch: je doppelte Entfernung Video -38 Punkte ab 90 m, Steuerung -25 Punkte ab 180 m (Schätzungen). Hindernisse und Bodennähe wie bisher. Schwanken wächst mit dem Abstand zum Piloten (vorher fälschlich zur Kartenmitte).
- Digital: bleibt bis etwa 45 % sauber, darunter Einbruch. Keine Verpixelung mehr. Stattdessen 16-px-Blöcke mit altem Inhalt, einfarbige Blöcke, verschobene Blöcke, Fehler laufen in der Zeile nach rechts, verschobene Streifen, Ruckler (einzelne Bilder fallen aus) und Standbilder; unter 4 % Standbild, das dunkel wird. Analog unverändert (wird nach und nach verrauscht).
- Tests: `test/pilot.test.mjs`.

## Idee: Anbindung an Simulationsverbünde und reale Karten (Einschätzung 06.11.2026, Prompt 89, nicht begonnen)
- Browser kann kein UDP (DIS) und keine RTI-Bibliothek (HLA). Nötig ist eine Brücke: entweder eigenes kleines Node-Programm (DIS über UDP <-> WebSocket) oder ein WebLVC-Server (JSON über WebSocket, Brücke zu DIS und HLA; z. B. MÄK, kostenpflichtig).
- Vorschlag Reihenfolge: (1) DIS senden (eigene Drohne als Entity State PDU, Georeferenz Lat/Lon), (2) DIS empfangen (fremde Einheiten anzeigen), (3) VBS4 über DIS testen (Lizenz und Windows-Rechner beim Nutzer), (4) HLA über WebLVC oder DIS-HLA-Gateway, (5) reale Karte: erst flach aus OSM-Gebäuden und Landnutzung (Umwandlung vorab, eingebettet), danach Gelände mit Höhen (Physik braucht Bodenhöhe).

## Modus „Echte Welt“ (Planung 06.11.2026, Prompt 92)
- Plan und geprüfte Quellen: `docs/echte-welt.md`. Nächste Etappe RW1.
- RW1 erledigt (06.11.2026): siehe `docs/echte-welt.md`. Nächste Etappe RW2 (LoD2-Gebäude, Bäume).
- RW2 erledigt (06.11.2026): Gebäude und Bäume mit Kollision, siehe `docs/echte-welt.md`. Nächste Etappe RW3 (eigene Dienste).
- 3D-Mesh M1 (06.11.2026, Prompt 96) eingebettet, mit Prompt 99 wieder ersetzt; M2 zurückgestellt.
- Neue Gestaltung erledigt (06.11.2026, Prompt 99): Luftbild 0,25 m auf Höhenmodell, LoD2-Gebäude mit Fassaden und Fenstern, Bäume in Luftbildfarbe, Vögel; 3D-Mesh nicht eingebettet. Siehe `docs/echte-welt.md`.
- OSD Koordinaten und nächster Ort erledigt (06.11.2026, Prompt 101), siehe `docs/echte-welt.md`.
- Live-Quellen geplant (L1 bis L5) und L1 erledigt (06.11.2026, Prompt 106): Ort in NRW per Koordinate laden. Siehe `docs/echte-welt.md`.
- L2 erledigt (06.11.2026, Prompt 107/108): Deutschlandkarte zum Auswählen. Siehe `docs/echte-welt.md`.
- Propeller im Kamerabild ganz statt angeschnitten (06.11.2026, Prompt 109): eigener Durchgang, Kamera fest am Rahmen hinter und unter den vorderen Propellern (render.js, drawPropsFpv).
- Propeller im Kamerabild wieder am Bildrand (06.11.2026, Prompt 113, Optik von Fable): eigener Durchgang mit derselben Kamera wie das Bild, naher Bildebene 3 mm (keine Schnittkante), drei verjüngte, angestellte Blätter (buildRotorMesh), weiche Unschärfescheibe aus 20 Ringen (buildRotorBlur). Ersetzt die schwebende Darstellung aus Prompt 109.
- L3 erledigt (06.11.2026, Prompt 109): eigene Quellen, Prüfen, Import/Export, mehrere Quellen an Landesgrenzen. Siehe `docs/echte-welt.md`.
- Polieren (Prompt 110) und L4 erledigt (06.11.2026, Prompt 111): Speichern im Browser, Gewässer und Ortsnamen einmal laden. Siehe `docs/echte-welt.md`.
- Housekeeping (06.11.2026, Prompt 112): README-Aufbau vollständig, neue Übergabe `docs/handover-2026-11-06.md`, CLAUDE.md zeigt darauf, CI veröffentlicht die Seite ohne doppelte 6,5 MB und mit 20 Minuten Zeitgrenze. Nächste Etappe: L5 nach Tests des Nutzers.
- L4b erledigt (06.11.2026, Prompt 117): Optionen der echten Welt mit Reiter „Daten“ (Übersicht, Export, Import). Nächste Etappe L5.
- L5a erledigt (06.11.2026, Prompt 118): Umgebung 10 x 10 km (grobes Gelände und Luftbild bis zum Horizont). Nächste Etappe L5b: Nachladen von Gebäuden und Bäumen.
- L5b erledigt (06.11.2026, Prompt 118): Gebäude, Bäume und feines Gelände in 1-km-Kacheln beim Fliegen nachladen; Kamera nie unter der gezeichneten Fläche; Bäume über Wasser verworfen (Prompt 119/120).
- Landesdaten automatisch, Gebäudekacheln wiederverwenden (06.11.2026, Prompt 121). Siehe `docs/echte-welt.md`.
- Prüfbericht Schwachstellen (Prompt 122, `docs/schwachstellen-2026-11-06.md`): Etappe 1 Nachladen stabil (Prompt 124), Etappe 2 eine Bodenfläche (Prompt 125) erledigt. Taste F Einfrieren (Prompt 126). Etappe 3 Grafik und Speicher robust (Prompt 127) erledigt. Etappe 4 Startgröße ohne Qualitätsverlust (Prompt 128) erledigt. Etappe 5 Rechenarbeit im Hintergrund (Prompt 129) großteils erledigt. Nr. 16 Umgebung wandert mit (Prompt 132) erledigt. Politur der Menüs für das fertige Produkt (Prompt 133) erledigt; Konzept „Drohne an VBS“ in `docs/dis-drohne.md`. VBS-Fragen mit k5.2 geklärt (Prompt 134), Entscheidungen von Fabian (Prompt 135), Etappe D1 DIS-Kodierer (`src/dis.js`) erledigt. VBS-Grundtypen vorgebaut mit Vorschau unter Spezial (Prompt 136). Mitschnitt und Port-Probe von k5.2: Empfangen lokal geht, Senden lokal nicht (Entscheidung Fabian: Probe mit AllowLoopback 1 im Testprofil oder zweiter Rechner). D2 Brücke (`tools/dis-bruecke.mjs`) erledigt (Prompt 140). D3 Simulator im Verbund (Prompt 142) erledigt. Windows-Brücke (`bruecke/fpv-vbs-bruecke.cmd`) und DIS-Modus unter Spezial mit Erkennung und Download (Prompt 143) erledigt; Logik jetzt im Simulator, Brücke nur Relais. D4 mit VBS: Brücke und Drohne gehen, Einheiten lagen 700 km weg. DIS-Modus universell ohne VBS-Bezug, Port und Übung einstellbar, Flug am Ort der Übung (ebene Fläche ohne Kartendaten) (Prompt 145). Nächste: D4 Probe mit VBS über k5.2. Offen aus dem Bericht: Nr. 17 (Stufe am Rand), Rest von Nr. 2 (Neuaufbau Umgebung und Startgebiet), Nr. 8 (Browser-Tests in CI, Entscheidung Nutzer).
- Taktischer Flug (Plan `docs/plan-taktischer-flug.md`, 2. Fassung mit Fable): Etappe T1 erledigt (Prompt 163): Hauptmenü „Parcours-Flug“ und „Taktischer Flug“, Schritt 1 mit Welt-Schalter Spielkarte/Echte Welt und gefilterter Modus-Liste, Startort mit „DIS-Übung (experimentell)“, „Grundtypen ansehen“ im DIS-Block, Wirkmittel nur im Taktischen Flug. DIS als Proof of Concept abgeschlossen (`docs/dis-abschluss.md`). Nächste: T2 Platzierungsdienst und Ringe in der echten Welt.
- Gelände vom WMS-Höhendienst (Plan `docs/plan-gelaende-wms.md`): W1 (Prompt 166), W2 (Prompt 167) und W3 (Prompt 170) erledigt. Startort DIS-Übung sucht den Höhendienst selbst und fliegt auf seinem Gelände. Nächste: Test mit dem echten Dienst durch k5.2, danach Entscheidung über W4 (Brücke) und W5 (Gebäude und Luftbild dazu). Reiter Einstellungen „Knüppel“ und „Funktionen“ (Prompt 169).
- Reiter „Debug“ in Echte Welt: Optionen (Prompt 170, `docs/plan-ebenen.md`): Ebenen ausblenden, Höhen bleiben. Nächste: T3.
- T3 erledigt (Prompt 170): Parcours in der echten Welt mit Landung, Jagd Drohnen, Jagd Flugzeuge, Lieferung (Platzierungsdienst, bei jedem Start neu). Nächste: T4 (Wirkmittel-Grundlage) nach Plan `docs/plan-taktischer-flug.md`.
- Menü neu geordnet (Prompt 174, Plan von Fable `docs/plan-menue.md`): DIS-Übung als dritte Flugart im Hauptmenü mit eigener Seite; Reiter Knüppel und Funktionen zu „Steuerung“ zusammengelegt (Gerät und Bereich). Präsentation des Projekts als PowerPoint (nicht im Repo).
- Ideen für später (Prompt 178/179, Nutzer): Fotomodus; Tageszeit, Wolkenschatten, Morgendunst; Bäume im Wind, Boote, Heißluftballon; Farbstimmungen; **Nachtmodus** (dunkler Himmel mit Mond und Sternen, zufällig beleuchtete Fenster in den vorhandenen Fassaden, Straßenlaternen, Scheinwerfer; wirkt auf Nachtsicht und Wärmebild); **Autos auf Straßen** (Monschau hat Straßen aus dem Basis-DLM; geladene Orte brauchen eine Straßenquelle, Vorschlag ALKIS-WFS NRW wie Plan T7).
- Umsetzung nach `docs/plan-nacht-strassen.md` (Prompt 180): **L1** Baumkronen im Wind (1.209). **N1** Nachtmodus: Häkchen „Nachtmodus“ in Einstellungen → Allgemein (auch im Pause-Menü, bleibt nach Neustart), Modul `src/daylight.js` (Mond Südost 35°, dunkler Nebel und Himmel), Sterne ab Mittel, Mondhof und Funkeln in Schön, Wolken dunkel, Flugzeuge blinken statt Kondensstreifen, Licht gedimmt und bläulich, beleuchtete Fenster (echte Welt: Wohnhaus 35 %, Gewerbe und Amt 20 %; Spielkarte in Schön 30 %), Lichtkennung Alpha 0,75 (Scheinwerfer, Rücklichter), kein Lens-Flare, schwache Schatten, nachts keine Schwärme und Greifvögel. Nachtsicht verstärkt nachts (4,5) und lässt Lichter überstrahlen, Wärmebild zeigt Lichter warm. Abweichung vom Plan: Häkchen statt Schalterzeile „Tageszeit“, weil die Zeile am Handy das Menü höher machte. Test `test/night.test.mjs`.
- 3D-Mesh NRW (Prompt 181 bis 183): geprüft in `docs/pruefung-3d-mesh.md`, Plan für Darstellung (M1) und Kollision (M2) in `docs/plan-3d-mesh.md` (Fable). Reihenfolge: erst Nachtmodus, Mesh später.
- **S1** Straßen und Verkehr (Prompt 184): neue Module `src/roads.js` (Graph aus beliebigen Straßenlinien, T-Kreuzungen, Zufallswege, Spur rechts, Höhenprofil mit Brückendeck aus LoD2, Ausweichen zur Mitte in engen Gassen, Furt bis 12 m) und `src/traffic.js` (bis 8 Zufallsautos 150 bis 600 m um die Drohne, 25 bis 47 km/h, bergauf langsamer, keine Kollision, nicht in DIS). Debug-Schalter „Verkehr (Autos)“ (sperrt keine Bestzeit). Quelle heute nur Monschau (Basis-DLM-Achsen); `rwRoads()` nimmt schon Linien je Kachel (`T.roads`), damit S2 und spätere Quellen anderer Länder nur Linien liefern müssen (Nutzer: Straßen und Autos überall, wo es Straßenlinien gibt). Abweichung vom Plan: Breite `BRF` nicht nachgeladen (Werkzeug bräuchte das 4,7-GB-Paket), feste 5,5 m. Test `test/roads.test.mjs`.
- **N2** Lichter in der Stadt (Prompt 185): Straßenlaternen alle 35 m in Ortslagen, Seite wechselnd, neben der Fahrbahn, nicht im Wasser oder in Gebäuden (`lampSpots`, `lampMesh`, `rwLamps` in `src/roads.js`); Mast 5 m, leuchtender Kopf, Lichtfläche 6 m auf dem Boden (additiv, weich zum Rand). Ab Grafik Mittel; in Schön dazu Lichtkegel vor den Autos. Wärmebild ohne Lichtflächen. Debug-Schalter „Straßenlaternen“ (sperrt keine Bestzeit). Monschau: 188 Laternen, 6 016 Dreiecke, Aufbau 118 ms in Node (gemessen; Test: 60 bis 400). Dateigrenze im Build-Test auf 7,9 MB gehoben.
- **S2** Straßen für geladene Orte (Prompt 186): ALKIS vereinfacht NRW per WFS (POST mit Filter Nutzung = Straßenverkehr; Feldnamen brauchen den Präfix `ave:`, ohne ihn antwortet der Dienst 400), Rückfall GET mit Rechteck. Neues Modul `src/rwroads.js`: Flächen auf 1-m-Raster, schließen, ausdünnen (Zhang-Suen, Treppen nach Yokoi), Stummel unter 12 m weg, Linien verfolgen, vereinfachen, Breite und Name je Linie, auf das Gebiet zuschneiden. Monschau zum Vergleich: 141 Linien, 9,6 km (Basis-DLM 10,1 km), 72 % der Punkte innerhalb 4 m einer DLM-Achse, 0,2 s. Läuft im Worker (Auftrag `roads`), nach dem Laden im Hintergrund: Ort sofort, Straßen einige Sekunden später; gespeichert im Ort (`features.roads`) und je Kachel (`roads`, relativ zur Kachelmitte). Ältere gespeicherte Orte holen die Straßen beim nächsten Öffnen nach. Im Browser: Aachen live 49 s, Straßen 2 s später (292 Linien), 8 Autos. Bekannt: an Verkehrsinseln kleine „Leitern“ aus parallelen Linien. Nebenbei behoben: Laden eines Orts außerhalb der DIS-Übung lief seit dem Menü-Umbau in eine Endlosschleife (`msgEl`).
- **L2** Mehr Leben (Prompt 187): Boote (`src/boats.js`): bis 3 im Umkreis 100 bis 600 m auf dem Wasser, Art nach Breite des Gewässers (Kanu mit Paddler ab 6 m, Motorboot ab 30 m statt 20 m wie im Plan, weil die Rur in Monschau 18 bis 27 m breit und flach ist; Frachter mit Containern ab 120 m), weichen dem Ufer aus (±20/40/60°, sonst wenden), auch nachts mit Positionslicht, ohne Ebene Gewässer keine. Heißluftballon (erster nach 20 bis 90 s, dann alle 3 bis 8 min, 120 bis 350 m hoch, zieht 2,5 km mit dem Wind wie die Baumkronen) und Segelflieger (15 m Spannweite, kreist mit 30° Schräglage in der Thermik, gleitet nach 2 bis 4 Kreisen zur nächsten) in `src/ambient.js`. Nachts weder Ballon noch Segler. Nicht in DIS. Abweichung: eigener Segler statt des 1,6fach vergrößerten Jagd-Modellflugzeugs (das hätte nur 3,5 m Spannweite). Test `test/boats.test.mjs`.
- **S3** Fahrzeuge und Verfolgung auf Straßen (Prompt 188): Taktischer Flug → Echte Welt → „Fahrzeuge“ und Parcours → Echte Welt → „Verfolgung“ sind frei, wenn das Startgebiet mindestens 500 m Straße hat (Monschau eingebaut; geladene NRW-Orte einige Sekunden nach dem Laden, das Menü aktualisiert sich selbst), sonst gesperrt mit Grund. Aufstellung je Start neu: 3 Autos am Straßenrand (eben, frei, trocken, 60 bis 400 m vom Start), 4 fahrende auf Zufallswegen 300 bis 800 m mit Höhenprofil (`roadRoutes`, `parkSpots`, `roadLenNear` in `src/roads.js`); Treffer und Zielmarker in der Höhe des Autos. Verfolgung: Auto auf einem Weg von 1,5 bis 3,5 km, der nah am Start beginnt; Höhenband über der Straße. Während Jagd und Verfolgung kein Zufallsverkehr. Fehler dabei behoben: Prüfkugel für Parkplätze steckte im Boden (nie frei). Test `test/s3.test.mjs`. Damit ist `docs/plan-nacht-strassen.md` umgesetzt.
- **M0** Sichtprobe 3D-Mesh NRW (Prompt 190/191): Der Nutzer will das Mesh nur bei sichtbarer Verbesserung, bei zu hohen Kosten als eigenes Grafik-Preset. Deshalb erst eine Probe, nur mit `?mesh=1` in der Adresse (ohne Zusatz unverändert): Kern `src/rwmesh.js` (Knotenseiten, Sichtkegel, Detailstufe von grob nach fein, sehr grobe Knoten übersprungen, Freigabe nach 8 s ohne Zeichnen, Grenzen 160 Knoten und 260 MB), Laden im Hauptprogramm (6 Abrufe zugleich), eigenes Shader-Programm mit Licht wie das Luftbild, Gelände 4 m abgesenkt, Häuser, eigene Bäume, Wasser und Kartenlinien aus, sobald Mesh-Teile zu sehen sind; Physik unverändert (LoD2, DGM). Anzeige oben: Teile, Grafikspeicher, geladene MB, Bilder je Sekunde. Gemessen in dieser Umgebung (Software-Grafik, Bildrate nicht aussagekräftig): Monschau Markt 14 bis 21 Teile, Burg 40 Teile; Köln Dom 28 Teile, 50 MB in einer Minute; Brücke 46 Teile, 95 MB; Grafikspeicher erreicht die Grenze von 260 MB. Eindruck: Dom, Altstadt, Dächer und Wald deutlich echter; Hohenzollernbrücke aus der Nähe verschmiert (2,5D, Fachwerk hängt herab); Hänge in Monschau braun und kahl (Befliegung vermutlich ohne Laub). Test `test/rwmesh.test.mjs`. Entscheidung des Nutzers offen: Schalter, eigenes Preset oder verwerfen.
- Spielstil (Prompt 192): Lernen, Normal, Realistisch, Gott-Modus stellen den Flugmodus (Angle, Acro) nicht mehr um.
- Ortssuche (Prompt 192): Suchfeld oben in der Karte (über dem Bild, Menü bleibt gleich hoch) und das Feld auf Schritt 1 nehmen Namen und Adressen („Kölner Dom“, „51643 Bergisch Gladbach, Josef-Roemer-Str.“). Dienst Nominatim (OpenStreetMap, ODbL, Vermerk unter der Karte), nur auf Enter oder Knopf, höchstens eine Anfrage je 1,1 s (Regeln des Dienstes). Karte: Treffer anspringen und Punkt setzen, Enter noch einmal: nächster Treffer. Schritt 1: suchen und gleich laden. Modul `src/geosearch.js`, Test `test/geosearch.test.mjs`.
- **G1** Grafik-Preset „Foto 3D“ (Prompt 193, Plan `docs/plan-grafik-presets.md`): vierter Knopf vorn in Einstellungen → Allgemein → Grafik (`[Foto 3D] [Schön] [Mittel] [Einfach]`, eine Zeile, Zoom in allen vier Größen gleich wie vorher). Foto 3D = Schön plus 3D-Mesh NRW; ohne Mesh am Ort (Spielkarte, außerhalb NRW, DIS, Dienst nicht erreichbar) wie Schön, Hinweis einmal je Ort, Knopf nie gesperrt. NRW-Erkennung über die Landesgrenzen (`deLandAt`, Mitte und Ecken des Gebiets) statt nur UTM 32. `?mesh=1` bleibt Diagnose mit Anzeige. Neu: `GFX_IDS`, `gfxLevel` (state.js), `i3sWanted` (rwmesh.js); `cfgMigrate` setzt ungültige Werte auf Schön. Mesh-Grenzen wie die Probe. Test `test/gfx.test.mjs`. Messung des Nutzers: Zen rechnet WebGL auf der Intel-Grafik (RPL-S), die RTX 4080 ist inaktiv; das erklärt vermutlich den großen Teil des Einbruchs.
- Foto 3D, Speicher (Prompt 194/195): Bericht des Nutzers vom Handy (Gummersbach): 701 MB Grafik, 1157 MB geladen. Ursache (gesichert im Code): Freigabe nur außerhalb des Bildes, das Bild selbst überschritt die Grenze; Teile luden immer wieder neu. Jetzt: Auswahl wird gröber, sobald das Bild drei Viertel der Grenzen braucht (`i3sAdapt`, Faktor bis 64), keine neuen Abrufe über der Grenze (`i3sRoom`), Handy: 80 Teile, 90 MB, Texturen höchstens 1024 breit, 4 Abrufe. Nachgestelltes Handy, 90 s Flug Monschau: höchstens 85 MB Grafik, 29 MB geladen. Offen: die ersten Teile kommen erst nach den 108 Übersichtsseiten (hier etwa 50 s; Fable-Entscheidung 3, Boxen einbetten). Gemessen: Mesh gegen Physik in Monschau, Startplatz (Feld) im Mittel 6 cm, Markt Boden 0,35 m (jeder zehnte Punkt über 2,5 m), Dächer 6 cm (jeder zehnte über 8 m).
- **M2** Kollision aus dem Mesh (Prompt 195): in Foto 3D (und mit `?mesh=1`) kommen Boden und Wände der Physik aus dem 3D-Mesh, wo feine Teile (Hüllkugel bis 120 m) um die Drohne geladen sind: je Teil beim Laden ein Höhenraster (0,5 m, höchstens 256 je Seite; höchste flache Fläche: Straße, Dach, Krone) und die steilen Dreiecke in 4-m-Zellen (`i3sPhysBuild`, `i3sGroundAt`, `i3sTrisNear`, `i3sPhysList` in `src/rwmesh.js`). Die Grafik setzt je Bild `rw.meshPhys`; die Physik fragt `physGroundH`/`physGroundN` (Boden, Startplatz, Rotorhöhe) und nimmt in `rwCollide` die Mesh-Dreiecke statt LoD2 und Baum-Quadern. Ohne feine Teile wie bisher. Foto 3D in der echten Welt hat eigene Bestzeiten (Schlüssel mit `.3d`). Test `test/meshphys.test.mjs` (Landung auf einem Mesh-Dach, das LoD2 nicht kennt; Wand bei 5 und 40 m/s). Im Browser Monschau: Drohne steht auf dem Mesh (0,08 m gegen 0,07 m). Offen: Ziele, Ringe und Plätze stellt der Platzierungsdienst noch nach LoD2 auf; die ersten Teile kommen erst nach 108 Übersichtsseiten (hier 73 s).
- Foto 3D, schneller Start (Prompt 196): die 108 Einträge der Stufe 1 sind eingebettet (`I3S_L1`, 7,6 KB, Stand 11.11.2026); Seite 0 prüft, ob die Wurzel noch dieselben Kinder hat, sonst wie bisher. Gemessen hier: erstes Teil etwa 10 s nach Seite 0 statt 50 s.
- Foto 3D, Ziele und Plätze (Prompt 196): neue gemeinsame Höhe `solidH` in `src/realworld.js` (Mesh, wo fein geladen, sonst Gelände); Physik (`physGroundH`), Platzierungsdienst (`placeReal`: Boden und Freiraum mit den steilen Mesh-Dreiecken) und die Höhen der Ziele (Drohnen, Luftziele, Landeplatz, Lieferplätze) nutzen sie. Kommt das Mesh erst nach dem Start, wird die Aufstellung einmal je Gebiet neu gemacht, solange die Drohne am Startplatz steht. Grenze: Weiter entfernte Ziele stehen auf dem Mesh nur, wenn dort feine Teile geladen sind; sonst nach LoD2 (Unterschied meist unter 1 m, an Bäumen mehr). Test in `test/meshphys.test.mjs`.
- **W1** Wirkmittel im Taktischen Flug (Prompt 196): mit Wirkmittel „Sprengladung“ in den Modi Fahrzeuge, Drohnen, Flugzeuge hängt eine Ladung unter der Drohne (olivgrün, 30 % der Drohnenmasse, Schätzung). Landung auf dem Ziel oder Berührung zündet sie: Treffer, Explosion (Feuerball, dann Rauch, 1,4 s), Anzeige „GEZÜNDET“. Ein Absturz zündet sie ohne Treffer. Nach 1,5 s startet eine neue Drohne mit vollem Akku und neuer Ladung am Startplatz; Zeit und Treffer laufen weiter, das OSD zählt die Drohnen („TREFFER 1/5 DROHNE 2“). Stufe Leicht mit Ballons wie bisher. Funktionen `chargeOn`, `chargeDue`, `chargeNext`, `chargeBoom` in `src/scenario.js`, `respawnDrone(true)` (frischer Akku). Test `test/charge.test.mjs`. Nur Spiel und Darstellung.
- Versuche und Missionsende (Prompt 197, für alle Aufgaben mit Ziel): `game.tries` zählt die Versuche der Mission (Start 1, jeder Neustart nach Absturz und jede neue Drohne des Wirkmittels +1, neue Mission über das Menü oder nach dem Ziel: wieder 1); das OSD zeigt sie live unter der Aufgabe („VERSUCH 2“, gehört zum Element Aufgabe). Ist das Ziel erreicht, steht 2,5 s später alles still (`game.state 'done'`, `missionEnd`): Anzeige „MISSION ERFÜLLT“ mit Zeit und Versuchen, R, Taste an der Funke oder Tippen beginnt eine neue Mission. Ein Treffer des Wirkmittels zählt nicht als Absturz. Tests in `test/charge.test.mjs`.
- **Eingebautes Gebiet AXA Campus Köln** (Prompt 199 bis 201): statt Monschau ist der AXA Campus Köln eingebaut (geht ohne Netz). Start genau auf 50.96170, 7.05731 (Wiese am Campus), Gebiet 1 x 1 km um diesen Punkt (E 363075 bis 364075, N 5646862 bis 5647862), Umgebung bis 5 km, Blick beim Start 270° (West; aus dem Bild des Nutzers: Heimpfeil 35° rechts bei Heimweg 305°, Bäume rechts). Werkzeuge: `RW_AREA=axa node tools/realworld.mjs`, dann `tools/water.mjs`, `tools/features.mjs`; neu `startExact` (Start ohne Suche eines flachen Platzes) und `startYaw` (Grad nach Kompass, `meta.homeYaw`). Monschau bleibt im Repo als Prüfdaten der Tests. Datei 7,83 MB (vorher 7,86). Blickrichtung beim Start sonst weiter zur Mitte des Gebiets.
- Foto 3D, Start im Mesh (Prompt 202): am AXA-Startpunkt liegt das Mesh 1,24 m über dem Geländemodell (vermutet: hohes Gras oder Getreide). Die Physik nutzte nur die feinsten Teile; solange nur gröbere sichtbar waren, stand die Drohne bis 30 s im Mesh. Jetzt bekommen auch gröbere Teile Physik (Hüllkugel bis 2000 m, Handy 600 m), die feinsten zählen zuerst; Bild und Physik passen vom ersten Teil an. Kamera-Grenzen und Schatten nutzen `solidH` (Mesh, wo geladen).
- Blickrichtung beim Start wählbar (Prompt 202): auf der Karte vom gewählten Punkt weg ziehen (Pfeil, „Blick 92° (O)“ in der Zeile unter der Karte); `cfg.rwYaw` wird nach dem Laden zu `rw.meta.homeYaw`. Getippter Ort oder neuer Punkt: wieder zur Gebietsmitte. Kartenmarke des eingebauten Gebiets zeigt den AXA Campus. Test `test/yaw.test.mjs`.
- Foto 3D, Mesh nicht doppelt laden (Prompt 203): Ursache gemessen: nach Neustart wurden die Teile eines verlassenen Gebiets bei vollem Grafikspeicher (253 von 260 MB) freigegeben und beim Zurückfliegen aus dem Netz neu geladen (48 Teile). Jetzt: (1) Zwischenspeicher im Browser (IndexedDB, Speicher `mesh` und `meshidx`, Datenbank Version 3): Rohdaten je Teil (Geometrie entpackt, Textur JPEG), Grenze 500 MB am Rechner, 150 MB am Handy, die am längsten nicht genutzten gehen zuerst; Daten und Verzeichnis in einem Schritt geschrieben; gilt auch nach Neuladen der Seite (gemessen: 28 Teile aus dem Speicher). Lizenz dl-de/zero-2.0. (2) Grafikgrenzen am Rechner 400 MB, 240 Teile, Freigabe nach 15 s (vorher 260 MB, 160, 8 s; Vorschlag aus `docs/plan-grafik-presets.md`). (3) Ein Gebietswechsel verwirft das Mesh nicht mehr (vorher ohne Freigabe des Grafikspeichers). Anzeige `?mesh=1`: „n aus Speicher (MB)“.
- Speicher in der Pause (Prompt 204): im Flug in der echten Welt zeigt das Pause-Menü rechts neben „Pause“ (ohne Mehrhöhe; Zoom in allen vier Größen wie vorher) „17,3 MB geladen · 2,9 MB gespeichert“: geladen = alle Abrufe der echten Welt in dieser Sitzung (`netStat` in `realworld.js`, der Hintergrund-Thread meldet seine Bytes mit jeder Antwort), gespeichert = belegter Speicher im Browser. „Leeren“ fragt: „Zwischenspeicher“ (3D-Mesh, nachgeladene Kacheln, Gebäudekacheln) oder „Alles“ (dazu gespeicherte Orte und Landesdaten); `storeClear`, `storeClearMesh` in `rwstore.js`. Daten-Reiter: neue Zeile „3D-Mesh NRW (Zwischenspeicher)“ mit Löschen. Im Pause-Menü startet das Mesh keine neuen Abrufe. Gemessen: Leeren des Mesh dauert hier etwa 7,5 s (große Datenblöcke).
- **G2 (Grafik-Presets)** Messen und ruckelfrei (Prompt 205, Plan `docs/plan-grafik-presets.md` Abschnitt 3.3, Hebel 1, 2 und 6). Nicht zu verwechseln mit der alten Etappe G2 „Boden, Bäume, Gebäude“. (1) Fertig geladene Mesh-Teile warten in `i3s.up`; je Bild lädt `meshStep` höchstens eines in die Grafik, das der Kamera nächste zuerst (`i3sNextUpload` in `rwmesh.js`, getestet). Wartende Teile zählen zur Grenze `para`, so liegen höchstens 6 entpackte Bilder im Speicher. Folge: bei 30 Bildern je Sekunde bis 30 Teile je Sekunde, bei sehr langsamer Grafik entsprechend weniger (gesichert in Headless-Chromium mit Software-Grafik: 1 bis 2 Bilder je Sekunde, 1 bis 2 Teile je Sekunde). (2) Foto 3D zeichnet das Mesh vor dem Gelände; der Tiefentest verwirft das abgesenkte Gelände vor der Farbrechnung. Bild gleich (Sichtprobe AXA Campus). (3) Anisotropie: Erweiterung und Obergrenze einmal in `initGL` (`anisoGl`, `texAniso`), nicht mehr je Teil und je Luftbild. Abstand je Knoten einmal je Bild (`n.d`), die Sortierung nutzt ihn. (4) Anzeige mit `?mesh=1` hat eine zweite Zeile: Grafikkarte (`RENDERER`, in Chromium über `WEBGL_debug_renderer_info`), Bilder je Sekunde, längstes Bild der letzten Sekunde, Hochladen je Sekunde mit längster Dauer im Hauptprogramm, Auflösung des 3D-Bilds in % (mit „Spar“ im Sparmodus); oben zusätzlich „wartet n“. Messung beim Nutzer steht aus (Plan 4.3), danach G3.
- Aufräumen (Prompt 205): drei unbenutzte Importe entfernt (`rings` in hud.js, `groundH` in render.js, `airRegions` in scenario.js). Veraltete Kommentare zum Mesh („nur ?mesh=1“, „Physik unverändert“) an Foto 3D angepasst. Versehentlich eingecheckte Bildschirmfotos `mstart.png` und `s3menu.png` entfernt. Altes Mesh-Werkzeug `tools/mesh.mjs` und `realworld/monschau-mesh.*` (3 MB, seit Prompt 99 nicht eingebettet, durch Foto 3D ersetzt) entfernt, wie in der Übergabe vom 06.11. vorgeschlagen; alter Stand in der Git-Historie. Neuer Test `test/domfree.test.mjs` prüft die Regel „Module ohne DOM“ (kein `document`/`window`, Importe nur untereinander); Liste um `rwwms`, `place`, `rwstore` ergänzt (CLAUDE.md, README). Neue Übergabe `docs/handover-2026-11-11.md`, CLAUDE.md und README zeigen darauf.
- Abnahme G2 (Prompt 206, 13.11.2026): Nutzer findet Bild und Bildrate mit Foto 3D in Ordnung. G3 (Grenzen nach Gerät, Deckel der Bildhöhe) ist damit kein Muss mehr; nur bei neuen Klagen über Ruckeln oder Speicher.
- **Abschluss** (Prompt 207, 13.11.2026): Nutzer schließt die Entwicklung vorerst ab. Erledigt: Plätze folgen in Foto 3D dem Mesh (`spotsFollow`), fehlende Mesh-Teile (404/410) als `'dead'` (`i3sFailState`), Lückenfüllung in einem Durchlauf (Prüfbericht Nr. 14, 3 s auf 50 ms), Ortsname im OSD alle 0,5 s (Nr. 10), Speicher leeren in einem Schritt („Alles“ im Browser geprüft). Bewusst offene Punkte und Wiedereinstieg: `docs/abschluss-2026-11-13.md`.
