# Etappenplan FPV-Simulator

Fassung 2 vom 30.10.2026 (E6 neu als Jagd-Modus, Entscheidung des Nutzers). Jede Etappe ist eine abgeschlossene Einheit: umsetzen, prüfen, committen, berichten, anhalten.
Aufwand ist eine Schätzung. Annahme: „mittel“ ist eine Arbeitssitzung, „groß“ etwa zwei.

## Abhängigkeiten

```
E0 Repo, Module, Build, Tests   (erledigt)
 ├─ E1 Stick-HUD, LiPo-Modell
 ├─ E2 Physik 2.0 ─┬─ E3 Drohnen-Vorlagen
 │                 └─ E4 Schadmodell
 ├─ E5 Streckenformat, Tunnel, Ringe
 └─ E6 Jagd-Modus: Ziel-Drohnen treffen
```

E5 und E6 hängen nur an E0 und können vorgezogen werden.

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

## E5: Streckenformat, Tunnel, Ringe (mittel)

- **Strecke als Daten:** Liste von Elementen mit `type`, Position, Ausrichtung, Größe. Typen: `gate`, `ring`, `tunnel`, `pole`, `flag`.
- **Ring:** frei schwebend, beliebig geneigt. Kollision analytisch über den Abstand zur Kreislinie (Torus). Durchflug über die Ringebene.
- **Tunnel:** gerade Segmente mit Boden, Wänden und Decke. Durchflug über Ein- und Ausfahrt. Innen dunklere Farben und Lichtstreifen.
- **Drei Beispielstrecken:** bisherige Tore, Ringparcours mit Höhenwechseln, Tunnelstrecke mit Kurve.
- **Menü:** Streckenauswahl. Bestzeit je Strecke.
- **Später:** Strecken aus der SharePoint-Bibliothek laden. Das setzt ein positives Ergebnis der Technik-Probe für `.json` voraus.

**Abnahme:**
- Test: Durchflug durch Ring und Tunnel zählt. Treffer auf Ring oder Wand ergibt Absturz oder Schaden.

## E6: Jagd-Modus, Ziel-Drohnen treffen (mittel)

Entscheidung des Nutzers vom 30.10.2026: Die frei fliegenden Drohnen sind Ziele, keine Hindernisse.
Ein Treffer gibt Punkte. Die getroffene Drohne stürzt ab. Sind x Drohnen getroffen, ist die Aufgabe erfüllt.

- **Modus im Menü:** Torkurs (bisher) oder Jagd. Gleiche Karte.
- **Ziel-Drohnen:** feste Routen aus Wegpunkten: Kreis, Acht, Hin und Her. Geschwindigkeit je Drohne.
  Bewegung kinematisch, nicht voll simuliert, mit Schräglage in Kurven. Eigenes Farbschema, drehende Propeller.
- **Treffer:** Kugel gegen Kugel über den Bewegungsweg des Schritts, nicht nur den Endpunkt.
  Ein Treffer zählt einen Punkt. Die getroffene Drohne fällt mit Drehung zu Boden und bleibt dort liegen. Sie zählt nicht noch einmal.
- **Eigene Drohne:** fliegt nach einem Treffer weiter. Ab E4 optional Schaden bei hartem Treffer.
- **Aufgabe:** x Treffer. Danach Meldung mit benötigter Zeit. Bestzeit wird gespeichert.
- **OSD:** Trefferzähler und Marker zum nächsten Ziel, wie der Tormarker.
- **Neustart (R):** setzt Drohne, Akku, Ziele und Zähler zurück.

**Abnahme:**
- Test: Frontalbegegnung mit 40 m/s Annäherung wird erkannt und nicht durchflogen.
- Test: Treffer zählt genau einmal, das Ziel stürzt ab und liegt danach am Boden.
- Test: Nach x Treffern ist die Aufgabe erfüllt.
- Test: Torkurs verhält sich unverändert.
