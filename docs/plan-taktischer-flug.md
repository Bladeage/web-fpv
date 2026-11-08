# Plan „Taktischer Flug“ (Planung 08.11.2026, Fable)

Nur Planung, kein Code. Löst den Entwurf von k5.2 (`docs/taktischer-flug.md`) als Arbeitsplan ab; der Entwurf bleibt als Verlauf. Schritt 1 des Entwurfs (Einheiten nach dem Dead-Reckoning-Verfahren) ist erledigt. Der DIS-Abschluss steht in `docs/dis-abschluss.md` und ist hier Etappe T1.

Einstufung in diesem Dokument: **gesichert** = im Code gelesen oder heute mit einem Abruf geprüft (Fundstelle dabei). **vermutet** = nicht geprüft. **Schätzung** = Spielwert mit Annahme.

## Wünsche des Nutzers (08.11.2026, Prompt 161)

Wörtlich: „DIS war ein Proof of concept. Ich bin vor allem froh auf unsere echte Welt Darstellung. Taktischer Flug soll bitte trotzdem gerne umgesetzt werden, vor allem mit verschiedenen wirkmitteln. Diese wirkmittel sollen auch gegen Fahrzeuge und Flugzeuge in unseren vorgefertigten parkouren umsetzen. Ich will wie zuvor schon eine klare Menüführung haben. Idee: echte Welt parkours modus: random Ringe in der Luft. Fahrzeuge auf Straßen. Drohnen in der luft bzw Fluggeräte (angelehnt an unseren preset Parcours Map).“

Feste Vorgaben: leichtgewichtig (nur HTML, CSS, JS, WebGL2, keine Bibliotheken); Physik ohne DOM, Schrittweite 1/240 s; Menüs nicht größer, jede Seite ohne Scrollen bei 1280x720, 1366x650, 960x540 und 390x844; an VBS wird nichts geändert; DIS bleibt universell; Texte in einfachem Deutsch.

## Was heute da ist (gesichert im Code, Version 1.176)

| Was | Fundstelle |
|---|---|
| 12 Modi, davon 10 Standard und 2 Spezial (`real`, `vbs`); DIS ist kein eigener Modus, sondern `real` mit `cfg.verbund` | `src/scenario.js:19-32`, `src/menu.js:21`, `src/menu.js:89-96`, `src/menu.js:295` |
| Menüweg: Hauptmenü (Weiterfliegen, Neuer Flug, Einstellungen) → Modus (Reiter Standard und Spezial) → Drohne → Start | `src/index.html:22-69`, `src/index.html:118-174` |
| Wirkmittel heute: `cfg.warhead` `none` oder `charge`, Zeile nur in der echten Welt | `src/state.js:16`, `src/menu.js:144-146`, `src/index.html:130-133` |
| Zündung bei Kontakt mit einer DIS-Einheit oder beim Absturz, Detonation-PDU, Explosion im Bild; nur in der echten Welt (`rw.on`) | `src/main.js:41-57`, `src/verbund.js:213-234`, `src/render.js:905-958` |
| Schaden an der Drohne: Aufprall je Rotor, Beschuss leicht (ein Motor minus 60 %) oder schwer (Absturz) | `src/physics.js:446-480` |
| Paket als Zusatzmasse ohne Schwerpunkt-Versatz (`game.payload`) | `src/physics.js:355`, `src/physics.js:627`, `src/scenario.js:280` |
| Jagd Fahrzeuge: 7 Fahrzeuge, Treffer = Berührung, Zustand `drive`, `park`, `hit` (kippt, wird dunkel) | `src/vehicles.js:63-113`, `src/render.js:880-884` |
| Jagd Flugzeuge: 6 Luftziele mit Punkten je Art, Zustand `fly`, `fall`, `down` | `src/aircraft.js:16-20`, `src/aircraft.js:101-119` |
| Jagd Drohnen: 9 Ziel-Drohnen, Zustand `fly`, `fall`, `down` | `src/targets.js:9-23`, `src/targets.js:85-119` |
| Nach einem Treffer startet die Drohne neu am Start (ohne Ballons) | `src/scenario.js:263` |
| Ringe mit Zufallsanordnung und Prüfung gegen die Hindernisse der Spielkarte (`colliders`) | `src/scenario.js:61-101` |
| Luftziele und Fahrzeuge nutzen feste Koordinaten der Spielkarte und `colliders`/`town` | `src/targets.js:14-23`, `src/aircraft.js:23-33`, `src/vehicles.js:38-47` |
| Echte Welt: Straßen nur im eingebauten Monschau (92 Achsen aus Basis-DLM `ver01_l`, 84 mit Namen, zusammen etwa 10 km); live geladene Orte haben nur Ortsnamen | `realworld/monschau.features.json` (heute gezählt), `tools/features.mjs:60`, `src/realworld.js:149`, `src/realworld.js:539` |
| Straßen heute nur als Anzeige (gelbe Bänder, Vorgabe aus) und Straßenname im OSD | `src/realworld.js:500-548`, `src/render.js:1091-1092` |
| Bodenhöhe `groundH`, Gebäude-Dreiecke im 8-m-Raster, Bäume als Quader, Wasser als Raster | `docs/echte-welt.md` RW2, Prompt 125 |
| Menü passt sich per `fitPanel` an (Zoom 0,72 bis 1,15), geprüft in vier Größen | `src/menu.js:166-178` |

Heute per Abruf geprüft (gesichert, 08.11.2026, mit `Origin: https://bladeage.github.io`):
- Basis-DLM NRW (ZIP, 4,69 GB, Teilabruf erlaubt, CORS `*`): `ver01_l.shp` Straßenachsen 158,7 MB, `ver01_l.dbf` (Namen) 965 MB, `ver01_f.shp` Straßenverkehr-Flächen 27,2 MB, `ver02_l.shp` Wege 205 MB. Zum Vergleich: Gewässer `gew01_f.shp` 28,5 MB, Ortslagen `sie01_f.shp` 26,9 MB (die beiden laden wir heute als Landesdaten).
- ALKIS WFS „vereinfacht“ NRW (`https://www.wfs.nrw.de/geobasis/wfs_nw_alkis_vereinfacht`): Typ `ave:Nutzung`, für das Monschau-Gebiet 1 x 1 km 735 Flächen, 1,04 MB GML, darunter `nutzart` „Straßenverkehr“ 142 und „Weg“ 121. CORS erlaubt unsere Seite. Das sind Flächen, keine Achsen; keine Straßennamen in der Antwort.
- Einen WFS für das Basis-DLM gibt es unter den geratenen Adressen nicht (404). Landbedeckung-WMS: Rasterbild, 15 Klassen, für Straßen zu grob (vermutet).

## 1 Menüführung

### Gliederung

Zwei Einstiege im Hauptmenü statt „Neuer Flug“: **Parcours-Flug** (die Spielkarte mit den 10 Standard-Modi) und **Taktischer Flug** (echte Welt mit Aufgabe, Wirkmittel, DIS). Beide Wege haben dieselben zwei Schritte: 1 „Was und wo“, 2 „Drohne“. Der Reiter „Spezial“ entfällt; die echte Welt bekommt einen eigenen, klar benannten Einstieg.

Warum so: Der Nutzer unterscheidet heute schon „vorgefertigte Parcours“ und „echte Welt“. Ein Reiter versteckt die echte Welt hinter einem Fachwort. Zwei Knöpfe im Hauptmenü sind sofort verständlich. DIS wird eine Aufgabe im Taktischen Flug, nicht ein eigener Modus: Es ist dieselbe echte Welt plus Verbund (so ist es heute schon im Code, `cfg.verbund`).

Wo landet was:
- **Echte Welt**: Taktischer Flug, Schritt 1, Gruppe „Startort“ (wie heute: Monschau, Ort laden, Karte, Optionen).
- **DIS**: Taktischer Flug, Schritt 1, Aufgabe „DIS-Verbund (experimentell)“. Darunter wie heute Brücke, Port, Übung, „Dort fliegen“. Kennzeichnung „experimentell“ und ein Satz zu den Grenzen (siehe `docs/dis-abschluss.md`).
- **DIS-Grundtypen** (Vorschau der 18 Modelle): nicht mehr in der Modus-Liste. Erreichbar über einen kleinen Knopf „Grundtypen ansehen“ im DIS-Block. Vorschlag; Alternative: ganz entfernen (Modul bleibt, Tests bleiben).
- **Wirkmittel**: Schritt 2 „Drohne“, in beiden Wegen. Im Parcours-Flug nur in den drei Jagd-Modi sichtbar, im Taktischen Flug immer.

### Ablauf Seite für Seite (Skizze)

Höhen sind grobe Richtwerte bei Zoom 1 (Schätzung aus den CSS-Werten: Listenknopf 48 px je Zeile, Seg-Zeile 36 px, Hinweis 2 Zeilen 36 px, Nav 44 px, Titel 40 px). Die engste Fläche ist 960x540: Panel höchstens etwa 476 px hoch bei Zoom 1; `fitPanel` darf bis 0,72 verkleinern, also passen rechnerisch etwa 660 px Inhalt. Heute passt die Modus-Seite mit Reitern und 10 Knöpfen (etwa 480 px). Jede Seite unten bleibt darunter. Die endgültige Prüfung ist wie bisher im Browser in den vier Größen.

```
Hauptmenü
  FPV-Simulator (Titel)
  [Weiterfliegen]              nur nach dem ersten Flug
  [Parcours-Flug]              Spielkarte, Tore, Ringe, Jagd ...
  [Taktischer Flug]            echte Welt, Wirkmittel, DIS
  [Einstellungen]
  Bestzeit, Hinweis, Version
  -> ein Knopf mehr als heute (etwa +44 px), passt.

Parcours-Flug, Schritt 1 von 2: Modus
  Titel
  10 Knöpfe in 2 Spalten (5 Zeilen, 240 px)       heute: dazu Reiter (36 px) -> jetzt kleiner
  Hinweis zum Modus (36 px)
  Stufe [Leicht | Normal | Schwer] (36 px)        nicht bei Torkurs, Freiflug
  Nötige Treffer (Regler, 50 px)                  nur Jagd
  [Zurück] [Weiter]
  -> etwa 450 px, passt.

Taktischer Flug, Schritt 1 von 2: Einsatz
  Titel
  Aufgabe (5 Knöpfe in 2 Spalten, 3 Zeilen, 144 px):
    [Freier Flug] [Ringe]
    [Jagd Boden]  [Jagd Luft]
    [DIS-Verbund (experimentell)]
  Hinweis zur Aufgabe (36 px)
  Startort [Monschau | Ort laden | Optionen] (36 px)   wie heute
    Ort laden: Eingabe, Karte, Laden (40 px) + gespeicherte Orte (36 px)
  Meldung (36 px)
  DIS (nur bei DIS gewählt, ersetzt die Zeile „gespeicherte Orte“ nicht, kommt dazu):
    Zustand der Brücke (36 px), [Brücke herunterladen] oder Port, Übung, [Dort fliegen] (40 px)
    [Grundtypen ansehen] klein (28 px)
  [Zurück] [Weiter]
  -> ohne DIS etwa 420 px, mit DIS etwa 520 px: passt mit leichter Verkleinerung (heute ist der DIS-Block schon so groß).
  Stufe und Treffer-Regler: bei Jagd Boden und Jagd Luft nötig. Vorschlag: Stufe und Treffer in einer Zeile
  (Seg links, Regler rechts), 40 px. Sonst wird die Seite mit DIS zu hoch.

Schritt 2 von 2: Drohne (beide Wege)
  Titel
  Spielstil (4 Knöpfe, 36 px), Hinweis (36 px)
  Drohne (4 Vorlagen, 2 Zeilen, 100 px), Hinweis (36 px)
  [Angle | Acro] (36 px)
  Wirkmittel (2 x 2, 72 px):                          neu, statt 1 Zeile mit 2 Knöpfen
    [Aufklärung] [Sprengladung]
    [Hohlladung] [Splitter]
  Zünder [Aufschlag | Manuell] (36 px)                neu, aus bei Aufklärung und Hohlladung
  Hinweis zum Wirkmittel: Gewicht, Wirkung (36 px)
  Feinwerte ändern >
  [Zurück] [Start]
  -> etwa 560 px: passt mit Verkleinerung auf etwa 0,85 bei 960x540. Bei 390x844 reicht die Höhe,
  die Breite (etwa 358 px) trägt zwei Spalten mit „Sprengladung“ und „Hohlladung“ (geschätzt 95 px Text je Knopf).
  Vier Knöpfe in einer Zeile wären am Handy zu eng, darum 2 x 2.
```

Einstellungen (Esc), Karte, Quellen, Optionen bleiben wie heute.

Technik: `cfg.scen` bleibt `real` für alle Aufgaben der echten Welt, neu `cfg.rwTask` (`free`, `rings`, `ground`, `air`, `dis`). Grund: `menu.js` prüft an sechs Stellen `cfg.scen === 'real'` für das Laden (`start()`, `rwLock`, „Dort fliegen“); das bleibt so gültig. `TASKS.real.check` verteilt nach `cfg.rwTask`. Bestzeiten je Aufgabe (`state.js` `bestKey` um die Aufgabe ergänzen). Das Hauptmenü merkt sich den Weg (`cfg.way`), damit „Weiter“ und „Zurück“ auf der richtigen Seite landen.

## 2 Wirkmittel

Alles Spielwerte. Keine realen technischen Angaben zu Sprengstoffen. Gewichte als Anteil der Drohnenmasse, damit Whoop bis 7 Zoll stimmig bleiben (Annahme: Eine Drohne trägt höchstens etwa die Hälfte ihres Gewichts zusätzlich und bleibt flugfähig; heute trägt das Paket 25 %, `scenario.js:280`).

| Wirkmittel | Gewicht (Schätzung) | Schwerpunkt | Wirkradius (Schätzung) | Wirkung je Zielart | Zünder |
|---|---|---|---|---|---|
| Aufklärung | 0 | unverändert | keiner | keine; Berührung zählt wie heute (Jagd) | keiner |
| Sprengladung (klein, allgemein) | 25 % | 3 cm unter der Mitte (Annahme: hängt unter dem Rahmen) | 3 m | Fahrzeug: Kontakt oder bis 1,5 m beschädigt, zweiter Treffer zerstört. Flugzeug, Drohne: bis 1,5 m zerstört, bis 3 m beschädigt. Person: bis 3 m außer Gefecht | Aufschlag oder manuell |
| Hohlladung (gegen Fahrzeuge) | 40 % | 5 cm unter der Mitte, 3 cm nach vorn (Annahme: länglich, nach vorn gerichtet) | keiner (gerichtet) | Fahrzeug: Kontakt von oben oder von der Seite zerstört, flacher Auftreffwinkel (unter 25° zur Fläche) nur beschädigt. Flugzeug, Drohne: nur bei Kontakt zerstört. Person: nur bei Kontakt | nur Aufschlag |
| Splitter (gegen Drohnen und Personen) | 30 % | 3 cm unter der Mitte | 6 m | Flugzeug, Drohne: bis 4 m zerstört, bis 6 m beschädigt. Person: bis 8 m außer Gefecht. Fahrzeug: bis 3 m beschädigt, nie zerstört | Aufschlag oder manuell |

Später, als eigene kleine Etappe (aus dem Entwurf von k5.2): Kontaktdrähte (zünden 0,3 m vor der Drohne, verdecken den unteren Bildrand, Schwerpunkt nach vorn) und Näherungszünder.

Wirkung aufs Flugmodell:
- Masse: `game.payload` gibt es (nur Masse). Neu `game.load = { m, dy, dz }` mit Versatz. `computeInertia` rechnet die Zusatzmasse als Punktmasse mit (Steiner-Anteil), der Regler bleibt auf die leere Drohne abgestimmt (`Itune`), die Drohne wird also träger, so wie heute bei mehr Gewicht.
- Schwerpunkt: Der Versatz wirkt als dauerhaftes Moment um die Mitte (Gewicht mal Hebel). In Angle hält der I-Anteil die Lage, die Drohne hängt leicht nach vorn, Schweben braucht mehr Gas. In Acro driftet sie ohne Gegensteuern. Nur eine Zeile Physik (Moment in `step`), kein neues Modell. Vorsicht (Erkenntnis aus Prompt 81): Der eigene Regler reagiert empfindlich auf Störmomente. Darum: Werte klein halten und mit Flugtest des Nutzers abnehmen.
- Betaflight bekommt nichts Neues; die Masse wirkt über die Physik.

Zünder:
- Aufschlag: Kontakt mit Ziel, Boden, Gebäude, Baum, Wasser oder Absturz. Wie heute `combat()` in `main.js`, erweitert um die Ziele der Parcours.
- Manuell: Taste „X“ (frei belegbar, `KEY_FN`) oder Schalter „Zünden“ (`GP_SW`). Zündet in der Luft am Ort der Drohne. Danach ist die Drohne weg: Meldung „Wirkmittel gezündet“, Zustand wie Absturz. Kein eigener Scharf-Schalter (klein halten); der normale Scharf-Zustand genügt.
- Sprengladung und Splitter zünden auch beim Absturz, Hohlladung nur bei echtem Kontakt mit einem Ziel (sonst „Blindgänger“, Absturz wie heute). Vorschlag; macht die Hohlladung zum Präzisionsmittel.

Anzeige:
- OSD neue Zeile `weapon`: „SPRENG · AUFSCHLAG“ oder „SPLITTER · MANUELL“ unten links, Vorgabe an, in `OSD_ITEMS` als Gruppe „Wirkmittel“.
- Explosion im Bild: Feuerball und Rauch wie heute (`render.js:925-936`), dazu Ton und Vibration über `fx` (neu `fx.boom`; die Physik erreicht Ton nur über `fx`, Regel in `CLAUDE.md`).
- Die Effekt-Liste `vb.fx` hängt heute an `rw.on` (`render.js:905`). Sie zieht in eine neutrale Liste (`game.fx` in `state.js`), damit Explosionen auch auf der Spielkarte gezeichnet werden. `verbund.js` schreibt in dieselbe Liste.

Code: neues Modul `src/warhead.js` (ohne DOM): Tabelle `WARHEADS`, `warheadLoad(kind, mass)`, `warheadEffect(kind, dist, targetKind, contact, angle)` → `none`, `damaged`, `destroyed`. Tests in `test/warhead.test.mjs`.

## 3 Wirkung in den vorhandenen Jagd-Parcours

Gilt für Jagd Drohnen (`hunt`), Jagd Flugzeuge (`hunt3`), Jagd Fahrzeuge (`hunt2`) auf der Spielkarte, später gleich für Jagd Boden und Jagd Luft in der echten Welt.

- **Ohne Wirkmittel (Aufklärung):** alles wie heute. Berührung zählt, Ballons bei Leicht. So bleiben Bestzeiten vergleichbar.
- **Mit Wirkmittel:** Kontakt (oder manuelles Zünden) zündet. Alle Ziele im Wirkradius bekommen ihre Wirkung nach der Tabelle. Danach startet eine neue Drohne am Start (wie heute `game.pendingRespawn`), der Zähler „Drohnen eingesetzt“ steigt.
- **Zustände:**
  - Fahrzeug: `drive`/`park` → `damaged` (fährt mit halbem Tempo, hängt 0,1 rad schief, dunkler, Rauchfahne) → `destroyed` (steht, schwarz, Feuer 3 s, dann Rauch; wie heute `hit`). Ein zerstörtes Fahrzeug bleibt Hindernis für die Sicht, nicht für die Physik (wie heute).
  - Flugzeug, Hubschrauber, Sechs-Rotor: `fly` → `damaged` (Rauchfahne, Starrflügler sinkt 1 m/s und fliegt weiter, Rotor-Ziele wackeln und halten 30 % weniger Tempo) → `fall` (wie heute). Beschädigt bleibt treffbar.
  - Ziel-Drohne (klein): nur `fly` → `fall`. Beschädigt gibt es hier nicht (zu klein, zu schnell weg).
  - Person (nur DIS und später echte Welt): außer Gefecht = liegt, dunkel.
- **Wertung:** zerstört = volle Punkte (Flugzeuge wie heute 3/2/1, Fahrzeuge und Drohnen 1), beschädigt = halbe Punkte. „Nötige Treffer“ zählt zerstörte Ziele. Zeit wie heute. Am Ende Banner „AUFGABE ERFÜLLT“ mit Zeit und „n Drohnen eingesetzt“. Bestzeit nur, wenn höchstens so viele Drohnen wie nötige Treffer verbraucht wurden (Vorschlag: sonst zählt die Zeit nicht als Bestzeit).
- **Anzeige:** Banner „FAHRZEUG ZERSTÖRT“ / „FLUGZEUG BESCHÄDIGT  +1 Punkt“; Aufgabenzeile „TREFFER 2/5 · 3 DROHNEN“. Zielmarker zeigt weiter das nächste nicht zerstörte Ziel (`scenTarget`, `scenario.js:355-379`, Zustand `damaged` zählt als offen).
- **Treffer-Prüfung:** Fahrzeuge haben `hitsVehicle` (Strecke gegen Kasten), Luftziele `sweptDist`. Für den Wirkradius kommt je Ziel ein Abstand zum Zündort dazu (Mittelpunkt des Kastens oder `t.p`). Hohlladung: Auftreffwinkel aus Flugrichtung der Drohne gegen die Normale der getroffenen Kastenfläche (aus dem Slab-Test ablesbar).
- Tests: `test/vehicles.test.mjs` (Zustände, Radius, zweiter Treffer), `test/aircraft.test.mjs` (beschädigt fliegt weiter), `test/scenario.test.mjs` (Wertung, Drohnen-Zähler), `test/legacy-parity.test.mjs` unverändert (Hindernisse, Tore, Propeller).

## 4 Echte-Welt-Parcours

Angelehnt an die Spielkarte: Ringe, Fahrzeuge, Luftziele. Alles bei jedem Start neu um den Startplatz.

### Ringe in der Luft (`rwTask` `rings`)

- 8 Ringe als Kette wie `makeRings` (`scenario.js:90-101`), Mitte im Umkreis von 60 bis 250 m um den Start, Abstand 12 bis 70 m zwischen den Ringen, Höhe 4 bis 15 m über `groundH` an der Ringmitte (Schätzung: tief genug für Häuser, hoch genug für Hänge).
- Sicher platzieren: neue Hilfe `rwFreeSphere(p, r)` in `realworld.js`: Kugel gegen Gebäude-Dreiecke im 8-m-Raster, Bäume (Quader), Gelände (`groundH` unter dem Ring plus Radius), Wasser egal (Drohne fliegt). Prüfung je Ring: Kugel Ringradius + 1,5 m frei, Weg zum nächsten Ring alle 2 m mit 1,5 m frei (wie `pathClear`). Dazu Hang: Ring nicht in einen Hang (Ringebene schneidet das Gelände nicht; Höhe an vier Punkten der Ringebene prüfen). Bis 400 Versuche, sonst Rückfall: 8 Ringe im Kreis mit 40 m Radius 12 m über dem höchsten Boden im Kreis (Innenstadt). Je Versuch rund 8 Kugel-Prüfungen und 8 Wege mit je etwa 20 Proben; Kosten geschätzt unter 50 ms in Node. Messen im Test wie bei RW2.
- Ringe im Bild: `buildScenario` zeichnet den Torus wie heute, nur in der echten Welt mit `rw.on`.
- Wertung wie Ringparcours (Zeit, Bestzeit je Aufgabe und Ort? Vorschlag: Bestzeit je Aufgabe, nicht je Ort; Orte sind beliebig viele).

### Fahrzeuge auf Straßen (`rwTask` `ground`)

Woher kommen Straßen (gesichert, siehe oben):
1. **Monschau eingebaut:** 92 Straßenachsen mit Namen, etwa 10 km, liegen schon im Programm (`rw.features.roads`, Punkte in Kartenkoordinaten). Sofort nutzbar.
2. **Live geladene Orte:** heute keine Straßen. Drei Wege:
   - **ALKIS WFS „vereinfacht“** (NRW): Flächen „Straßenverkehr“ und „Weg“, etwa 1 MB je km², CORS geht. Flächen ins 1-m-Raster wie das Wasser (`dlmWater` als Vorbild), daraus ein Abstandsfeld (Abstand zum Fahrbahnrand). Fahrzeuge fahren auf dem Raster: vorwärts entlang des größten Abstands, an Kreuzungen zufällig abbiegen, Wendepunkt am Ende. Keine Achsen, keine Namen; braucht keinen Linienalgorithmus. Nur NRW als Vorlage; andere Länder bräuchten eine eigene Quelle mit anderem Feld (offen, wie bei den Landesdaten heute). **Vorschlag.**
   - **Basis-DLM Achsen** `ver01_l.shp`: 158,7 MB einmal laden und speichern wie die Landesdaten (heute 60 MB). Machbar, aber schwer: 400-MB-Grenze des Speichers, Ladezeit vermutet 10 bis 30 s im Worker. Namen (DBF 965 MB) nicht machbar. Nicht empfohlen.
   - **Straßenverkehr-Flächen** `ver01_f.shp` (27 MB): vermutet nur breite Straßen und Plätze, nicht flächendeckend. Nicht geprüft.
3. Laden im Worker wie Gebäude, speichern je Ort (`rwstore`), auch für Nachladekacheln.

Fahrzeuge: 7 wie Jagd Fahrzeuge (`VEH_SETUP`), Routen aus den Straßen statt `ROUTES`: Achsen als `makeRoute(pts, loop=false)` (hin und her), um 1,5 m nach rechts versetzt, Höhe `groundH(x, z)` am Fahrzeug, Neigung aus der Steigung (Nicken aus der Höhendifferenz, 2 m voraus). Geparkte Fahrzeuge an Straßenenden. Nur Straßen im Umkreis 500 m um den Start, mindestens 100 m lang, nicht durch Wasser (Raster prüfen). Rückfall ohne Straßen (Ort ohne Daten): Fahrzeuge stehen auf freien Flächen (wie `rwDryHome` die Startstelle findet).

Fahrzeuge brauchen eine Höhe im Bild: `render.js:882` setzt y aus dem Kippwinkel; dazu kommt `v.y`.

### Drohnen und Fluggeräte in der Luft (`rwTask` `air`)

- Ziel-Drohnen (9) und Luftziele (6) wie `targets.js` und `aircraft.js`, aber: Mitte = Start, Höhen relativ zum Gelände. Beide Module nehmen heute feste Koordinaten und `colliders`/`town` (`targets.js:26-33`, `aircraft.js:23-33`). Umbau: `initTargets(speed, layout)` und `initAircraft(speed, layout)` bekommen eine Aufstellung (Mitten, Höhen, Hindernis-Prüfer). Die Spielkarte liefert die heutige Aufstellung, die echte Welt eine zufällige um den Start mit `rwFreeSphere` und `groundH`.
- Starrflügler: Kreisbahn bleibt waagrecht; Höhe = höchster Boden auf dem Kreis (Proben alle 10 m) plus 25 m. Kreise 60 und 120 m Radius um den Start, nur wenn der Kreis im Gebiet liegt (1 km).
- Hubschrauber und Sechs-Rotor: Wegpunkte 18 bis 30 m über dem Boden am Punkt, Weg dazwischen frei (`rwFreeSphere` alle 5 m, Radius 3 m).
- Ziel-Drohnen: Bereiche (Radius 22 m) um freie Punkte, Höhe 9 bis 16 m über Boden, `newWaypoint` prüft mit `rwFreeSphere` statt `obstDist`.
- Wärmebild: Ziele hell wie heute.

### Leistung am Handy (vermutet, zu messen)

- Zusätzlich gezeichnet: 7 Fahrzeuge, 15 Luftziele, 8 Ringe, Explosionen. Gegen 100 000 Gebäude-Dreiecke einer Innenstadt fällt das nicht auf.
- Rechnen je Physikschritt (240/s): Fahrzeuge `routeAt` mit vorberechneten Längen, `groundH` 0,6 µs je Aufruf (gemessen, Prompt 125), Luftziele wie heute. Geschätzt unter 0,1 ms je Schritt.
- Einmal beim Start: Ring-Anordnung und Aufstellung (siehe oben, unter 50 ms angestrebt). Straßen-Raster für Live-Orte (1 km², 1 m): 1 Million Zellen, Abstandsfeld im Worker, einmal je Ort, danach gespeichert.
- Grafikspeicher: unverändert.

## 5 Etappen und Reihenfolge

Aufwand (Schätzung): S = unter einer Sitzung, M = eine Sitzung, L = zwei Sitzungen. Jede Etappe: umsetzen, `npm run build`, `npm test`, Browser in vier Größen, committen, berichten, anhalten.

| Nr. | Etappe | Ziel | Umfang | Dateien | Tests | Aufwand | Risiko |
|---|---|---|---|---|---|---|---|
| T1 | Menü und DIS-Abschluss | Hauptmenü „Parcours-Flug“ und „Taktischer Flug“; Seite „Einsatz“; DIS als Aufgabe „experimentell“; Grundtypen-Vorschau aus der Liste; Texte und Doku zum DIS-Abschluss | Nur Menü und Texte, keine Physik. `cfg.way`, `cfg.rwTask` (erst `free` und `dis`) | `src/index.html`, `src/menu.js`, `src/style.css`, `src/scenario.js` (Label), README, `docs/PLAN.md`, `docs/dis-abschluss.md` | `test/scenario.test.mjs` (Label je Aufgabe), `test/build.test.mjs`; Browser vier Größen, DIS-Weg mit Node-Brücke und DIS-Ersatz | S bis M | Platz auf der Einsatz-Seite mit DIS-Block; gespeicherte Einstellungen alter Stände (`cfg.scen`, `cfg.verbund`) sauber übernehmen |
| T2 | Wirkmittel-Grundlage und Sprengladung gegen Fahrzeuge | Modul `warhead.js`; Masse und Schwerpunkt im Flugmodell; Zünder Aufschlag; Explosion und Ton überall (`game.fx`); Jagd Fahrzeuge mit beschädigt und zerstört, Wertung, Drohnen-Zähler; OSD-Zeile | Sprengladung komplett, Hohlladung und Splitter noch nicht wählbar | neu `src/warhead.js`; `src/physics.js`, `src/main.js`, `src/vehicles.js`, `src/scenario.js`, `src/render.js`, `src/audio.js`, `src/osd.js`, `src/state.js`, `src/menu.js`, `src/index.html`, `src/verbund.js` (fx-Liste) | `test/warhead.test.mjs` (Tabelle, Masse, Schwerpunkt: Schweben bleibt waagrecht in Angle), `test/vehicles.test.mjs`, `test/scenario.test.mjs`, `test/physics.test.mjs` | M | Flugverhalten mit Schwerpunkt-Versatz (eigener Regler empfindlich): Werte klein, Flugtest des Nutzers vor dem Commit der Zahlen |
| T3 | Hohlladung, Splitter, Luftziele, manueller Zünder | Alle vier Wirkmittel; Wirkung gegen Flugzeuge und Ziel-Drohnen mit beschädigt; Taste und Schalter „Zünden“; Punkte halbe/volle | Jagd Drohnen und Jagd Flugzeuge | `src/warhead.js`, `src/aircraft.js`, `src/targets.js`, `src/scenario.js`, `src/state.js` (Taste), `src/gamepad.js` (Schalter), `src/menu.js` | `test/aircraft.test.mjs`, `test/targets.test.mjs`, `test/keys.test.mjs`, `test/gamepad.test.mjs` | M | Auftreffwinkel der Hohlladung sinnvoll messen (Normale aus dem Slab-Test) |
| T4 | Ringe in der echten Welt | Aufgabe „Ringe“ mit `rwFreeSphere`, Zufallsanordnung mit Prüfung, Rückfall, Wertung | Monschau und Live-Orte | `src/realworld.js` (`rwFreeSphere`), `src/scenario.js`, `src/render.js`, `src/menu.js` | `test/realworld.test.mjs` (Kugel frei/belegt an Gebäude, Baum, Hang), neuer Test Ringe (alle frei, Höhe über Boden, Zeit unter 50 ms) | M | Innenstädte ohne freie Kette: Rückfall muss immer gehen |
| T5 | Fahrzeuge auf Straßen, Monschau | Aufgabe „Jagd Boden“ mit Routen aus `rw.features.roads`, Höhe und Neigung, Wirkmittel aus T2/T3 | nur eingebautes Monschau; Live-Orte zeigen „Ohne Straßendaten: Fahrzeuge auf freien Flächen“ | `src/vehicles.js` (Routen von außen), `src/scenario.js`, `src/render.js`, `src/menu.js` | `test/vehicles.test.mjs` (Route folgt Straße, bleibt auf dem Boden, nicht im Wasser) | M | Straßenachsen laufen durch Gebäude? Im Basis-DLM nicht zu erwarten (vermutet); prüfen mit Kollisionsraster |
| T6 | Straßen für Live-Orte | ALKIS-WFS „Nutzung“ im Worker laden, Flächen „Straßenverkehr“ und „Weg“ rastern, Abstandsfeld, Fahrspuren daraus, speichern je Ort und Kachel | NRW-Vorlage; Feld für die Quelle („Straßen, WFS“) im Quellen-Formular | `src/rwload.js` (Quelle, Abruf), `src/rwworker.js`, `src/realworld.js`, `src/rwstore.js`, `src/vehicles.js`, `src/srcui.js`, `src/index.html` | `test/rwload.test.mjs` (GML lesen mit selbst gebauter Probe), neuer Test Raster und Abstandsfeld, Fahrt bleibt auf der Fläche | L | WFS-Grenzen (Anzahl je Antwort, Zeit), andere Länder ohne Quelle; GML-Leser (es gibt `readLod2` für CityGML, Polygon-Leser ähnlich) |
| T7 | Luftziele in der echten Welt | Aufgabe „Jagd Luft“: Aufstellung um den Start, Höhen über Gelände, Wege frei | Monschau und Live-Orte | `src/targets.js`, `src/aircraft.js` (Aufstellung von außen), `src/scenario.js`, `src/render.js` | `test/aircraft.test.mjs`, `test/targets.test.mjs`, `test/spread.test.mjs` (Spielkarte unverändert) | M | Starrflügler am Hang: Kreis liegt über dem höchsten Boden, sonst sehr hoch |
| T8 | Auswertung nach dem Flug | Seite „Ergebnis“ nach erfüllter Aufgabe oder Absturz: Zeit, Treffer je Zustand, Drohnen eingesetzt, Restakku, Strecke; Knöpfe „Noch einmal“, „Hauptmenü“ | beide Wege | `src/menu.js`, `src/index.html`, `src/scenario.js` | Browser vier Größen; Node-Test für die Zusammenfassung | M | Platz: nur Zahlen, kein Diagramm |

Später, nicht geplant: Kontaktdrähte, Näherungszünder, Datenlink mit Störsender und Glasfaser, Wetter (aus dem Entwurf von k5.2). Entfallen mit dem DIS-Abschluss: Gelände per WMS über die Brücke, Wirkung in VBS.

### Begründung der Reihenfolge

- **T1 zuerst:** klein, sofort sichtbar, ohne Physik. Räumt das Menü auf und schließt DIS sauber ab, bevor neue Aufgaben dazukommen. Ohne T1 müsste jede spätere Etappe in das heutige Reiter-Menü eingebaut und später wieder umgebaut werden.
- **T2 vor T3:** Erst eine Sprengladung gegen Fahrzeuge (ein Ziel, ein Mittel), dann die Tabelle vervollständigen. Das Flugmodell mit Schwerpunkt ist der riskante Teil und braucht einen Flugtest des Nutzers, bevor mehr darauf aufbaut.
- **T4 vor T5 und T7:** Ringe brauchen nur `rwFreeSphere`, das T5 und T7 ebenfalls nutzen. Ringe sind der Wunsch mit dem kleinsten Datenbedarf (keine Straßen).
- **T5 vor T6:** Monschau hat Straßen; so sieht der Nutzer Fahrzeuge auf echten Straßen, bevor der große Datenteil (T6) kommt. T6 ist die einzige Etappe mit neuer Datenquelle und darum die unsicherste.
- **T7 danach:** Luftziele brauchen nur die Aufstellung; mit T3 sind die Wirkmittel fertig.
- **T8 am Ende:** rundet das Produkt ab, hängt von allem ab.

## Offene Entscheidungen (mit Vorschlag)

1. DIS-Grundtypen: kleiner Knopf im DIS-Block (Vorschlag) oder ganz aus dem Menü.
2. Zünder bei Hohlladung nur Aufschlag und nur bei Zielkontakt (Vorschlag) oder auch am Boden.
3. Bestzeit mit Wirkmittel nur, wenn höchstens so viele Drohnen wie nötige Treffer eingesetzt wurden (Vorschlag), oder Bestzeit immer.
4. Straßen für Live-Orte über den ALKIS-WFS (Vorschlag) oder Basis-DLM-Achsen (159 MB) oder vorerst nur Monschau.
5. Bestzeit je Aufgabe in der echten Welt ohne Ort (Vorschlag) oder je Ort.
6. Stufe und Treffer-Regler auf der Einsatz-Seite in einer Zeile (Vorschlag), sonst wird die Seite mit DIS-Block zu hoch.
