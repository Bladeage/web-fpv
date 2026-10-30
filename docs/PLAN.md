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

## Abhängigkeiten

```
E0 Repo, Module, Build, Tests   (erledigt)
 ├─ E1 Stick-HUD, LiPo-Modell
 ├─ E2 Physik 2.0 ─┬─ E3 Drohnen-Vorlagen
 │                 └─ E4 Schadmodell
 ├─ E5 Szenarien und Ringe ── E6 Ziel-Drohnen mit Verhalten
 ├─ G1 Grafik: Farbe und Licht
 └─ G2 Grafik: Boden, Bäume, Gebäude
```

E5, E6, G1 und G2 hängen nicht an E1 bis E4 und können vorgezogen werden.
Vorgeschlagene Reihenfolge: E5, E6, G1, G2, danach E1 bis E4.
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
