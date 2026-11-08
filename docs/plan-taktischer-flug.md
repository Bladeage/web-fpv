# Plan „Taktischer Flug“ und Parcours in beiden Welten (Planung 08.11.2026, Fable, 2. Fassung)

Nur Planung, kein Code. Löst den Entwurf von k5.2 (`docs/taktischer-flug.md`) als Arbeitsplan ab; der Entwurf bleibt als Verlauf. Schritt 1 des Entwurfs (Einheiten nach dem Dead-Reckoning-Verfahren) ist erledigt. Der DIS-Abschluss steht in `docs/dis-abschluss.md` und ist hier Teil von Etappe T1.

2. Fassung nach Prompt 162: Welt und Flugart sind zwei unabhängige Wahlen. Jede Kombination geht: Parcours-Flug und Taktischer Flug, je auf der Spielkarte oder in der echten Welt. Dafür gibt es einen gemeinsamen Platzierungsdienst, damit jeder Modus einmal gebaut in beiden Welten läuft.

Einstufung: **gesichert** = im Code gelesen oder heute mit einem Abruf geprüft (Fundstelle dabei). **vermutet** = nicht geprüft. **Schätzung** = Spielwert mit Annahme.

## Wünsche des Nutzers

Prompt 161 (08.11.2026), wörtlich: „DIS war ein Proof of concept. Ich bin vor allem froh auf unsere echte Welt Darstellung. Taktischer Flug soll bitte trotzdem gerne umgesetzt werden, vor allem mit verschiedenen wirkmitteln. Diese wirkmittel sollen auch gegen Fahrzeuge und Flugzeuge in unseren vorgefertigten parkouren umsetzen. Ich will wie zuvor schon eine klare Menüführung haben. Idee: echte Welt parkours modus: random Ringe in der Luft. Fahrzeuge auf Straßen. Drohnen in der luft bzw Fluggeräte (angelehnt an unseren preset Parcours Map).“

Prompt 162 (08.11.2026), wörtlich: „Ich hätte gerne, dass der taktische Flug auch auf der nicht luftbildbasierten Karte möglich ist. Und Parcours soll auch in der echten Welt möglich sein. Ich möchte, wenn Parcours ausgewählt ist, dass bestimmte Modi, die sich dort wie random-basierte Events platzieren, nutzbar sind. Wie zum Beispiel fliegende Ringe, die kann man überall platzieren. Fliegende Drohnen mit Luftballons, die sich da hinterherziehen. Luftballons natürlich nur bei den einfachen Modi.“

Feste Vorgaben: leichtgewichtig (nur HTML, CSS, JS, WebGL2, keine Bibliotheken); Physik ohne DOM, Schrittweite 1/240 s; Menüs nicht größer, jede Seite ohne Scrollen bei 1280x720, 1366x650, 960x540 und 390x844; an VBS wird nichts geändert; DIS bleibt universell; Texte in einfachem Deutsch.

## Begriffe

- **Welt:** Spielkarte (die gebaute Karte mit Kurs, Stadt und Testecken, ohne Luftbild) oder echte Welt (Monschau eingebaut, geladener Ort, Ort einer DIS-Übung).
- **Flugart:** Parcours-Flug (Spiel: Berührung zählt, Ballons bei Leicht, Bestzeit) oder Taktischer Flug (Auftrag: Wirkmittel, Ziele beschädigt oder zerstört, Zähler eingesetzter Drohnen).
- **Modus:** die Aufgabe innerhalb der Flugart (Ringe, Jagd Drohnen, Ziele Boden ...).
- **Ereignis:** ein zufällig platziertes Element (Ring, Ziel, Fahrzeug, Platz).

## Was heute da ist (gesichert im Code, Version 1.176)

| Was | Fundstelle |
|---|---|
| 12 Modi, 10 Standard und 2 Spezial (`real`, `vbs`); DIS ist `real` mit `cfg.verbund`; Startort `cfg.rwSrc` kennt schon `emb`, `live` und `dis` | `src/scenario.js:19-32`, `src/menu.js:21`, `src/menu.js:89-108`, `src/menu.js:280`, `src/state.js:16` |
| Menüweg: Hauptmenü (Weiterfliegen, Neuer Flug, Einstellungen) → Modus (Reiter Standard, Spezial) → Drohne → Start | `src/index.html:22-69`, `src/index.html:118-174` |
| Feste Strecken: Kurs `COURSE` und Tore in `buildWorld` (einmalig, Referenz gegen `legacy/`); Slalom auf Kursabschnitten; Landeplatz `PAD` fest; Lieferung `PICKUP` und `DROPS` fest auf dem Kurs; Verfolgung auf `ROUTES[0]` | `src/world.js:104-125`, `src/scenario.js:103-157`, `src/vehicles.js:38-47`, `test/legacy-parity.test.mjs:38` |
| Zufällig schon heute, aber nur gegen die Quader der Spielkarte: Ringe (`makeRings`, `ringLayoutOk`, `clearOf`, `pathClear`), Slalom-Lage, Wegpunkte der Ziel-Drohnen (`newWaypoint`, `obstDist` über `colliders` und `town`) | `src/scenario.js:61-101`, `src/targets.js:25-57` |
| Feste Aufstellung: Ziel-Drohnen (Mitten und Bereiche), Luftziele (Kreise, Wegpunkte), Fahrzeuge (Plätze, Spuren) | `src/targets.js:14-23`, `src/aircraft.js:23-33`, `src/vehicles.js:38-69` |
| Ballons: je Ziel ein Ballon an 3 m Leine, platzt bei Berührung, nur Stufe Leicht (`diff().balloons`) | `src/balloon.js`, `src/scenario.js:47`, `src/scenario.js:254-263` |
| Treffer heute: Berührung (`hitsVehicle`, `sweptDist`); Zustände Fahrzeug `drive`, `park`, `hit`; Luftziel `fly`, `fall`, `down` | `src/vehicles.js:83-113`, `src/aircraft.js:101-119`, `src/targets.js:85-119` |
| Wirkmittel heute: `cfg.warhead` `none` oder `charge`, nur echte Welt; Zündung bei Kontakt mit DIS-Einheit oder Absturz; Explosion im Bild hängt an `rw.on` | `src/menu.js:144-146`, `src/main.js:41-57`, `src/verbund.js:213-234`, `src/render.js:905-958` |
| Schaden: Aufprall je Rotor, Beschuss leicht oder schwer; Paket nur als Masse ohne Schwerpunkt | `src/physics.js:446-480`, `src/physics.js:355`, `src/physics.js:627` |
| Echte Welt, Hindernisse: Gebäude-Dreiecke und Baum-Quader im 8-m-Raster, Abfrage `rwNear(x, z, R)`; Bodenhöhe `groundH`, Neigung `groundN`; Wasser `waterAt`; Kollision der Drohne `rwCollide` | `src/realworld.js:396-432`, `src/realworld.js:319-350`, `src/realworld.js:444`, `src/physics.js:577` |
| Freie Stelle suchen gibt es schon einmal: `rwDryHome` (Ringe um den Start, 4 m zum Wasser, 6 m zu Gebäuden, Neigung unter etwa 30°) | `src/realworld.js:47-69` |
| Straßen nur im eingebauten Monschau (92 Achsen, 84 mit Namen, etwa 10 km, Basis-DLM `ver01_l`); geladene Orte haben nur Ortsnamen | `realworld/monschau.features.json` (gezählt), `tools/features.mjs:60`, `src/realworld.js:149`, `src/realworld.js:539` |
| Tests laden Monschau komplett in Node (Höhen, Gebäude, Bäume, Wasser, Kartenebenen) | `test/realworld.test.mjs:20-25` |
| Menü passt sich per `fitPanel` an (Zoom 0,72 bis 1,15) | `src/menu.js:166-178` |

Heute per Abruf geprüft (gesichert, 08.11.2026, mit `Origin: https://bladeage.github.io`):
- Basis-DLM NRW (ZIP 4,69 GB, Teilabruf, CORS `*`): `ver01_l.shp` Straßenachsen 158,7 MB, `ver01_l.dbf` (Namen) 965 MB, `ver01_f.shp` Straßenverkehr-Flächen 27,2 MB, `ver02_l.shp` Wege 205 MB. Zum Vergleich die heutigen Landesdaten: `gew01_f.shp` 28,5 MB, `sie01_f.shp` 26,9 MB.
- ALKIS WFS „vereinfacht“ NRW (`https://www.wfs.nrw.de/geobasis/wfs_nw_alkis_vereinfacht`), Typ `ave:Nutzung`, Monschau 1 x 1 km: 735 Flächen, 1,04 MB GML, darunter `nutzart` „Straßenverkehr“ 142 und „Weg“ 121. CORS erlaubt unsere Seite. Flächen, keine Achsen, keine Namen.
- Ein WFS für das Basis-DLM: unter den geratenen Adressen 404. Landbedeckung-WMS: Raster, 15 Klassen, für Straßen zu grob (vermutet).

## 1 Menüführung

### Reihenfolge der Wahlen

Zuerst die **Flugart**, dann die **Welt**, dann der **Modus**, dann die Drohne. Begründung: Die Flugart bestimmt, welche Modi und welche Drohnen-Optionen es gibt (Wirkmittel nur taktisch). Die Welt filtert die Modi nur (einige gehen nur auf der Spielkarte). Flugart im Hauptmenü, Welt und Modus zusammen auf einer Seite: So bleiben es wie heute zwei Schritte, und die Welt-Umschaltung ersetzt die heutigen Reiter „Standard, Spezial“ an derselben Stelle (`#modeTabs`), nur mit klaren Namen.

Alternative (nicht vorgeschlagen): Welt zuerst im Hauptmenü. Dann hätten Spielkarte und echte Welt je zwei Unterwege, und der Nutzer müsste die Flugart auf der zweiten Seite wählen; die Drohnen-Seite wüsste erst spät, ob Wirkmittel dazukommen.

### Wo landet was

- **Echte Welt:** Schritt 1, Welt-Schalter „Echte Welt“, darunter die Gruppe „Startort“ wie heute.
- **DIS (experimentell):** Startort „DIS-Übung“ in der Gruppe Startort, neben Monschau und Ort laden. Das passt zum Code: `cfg.rwSrc === 'dis'` ist heute schon der Flug am Ort der Übung. DIS ist damit in beiden Flugarten wählbar (universell, nur der Ort und die Einheiten kommen vom Partner). Darunter wie heute: Zustand der Brücke, Download, Port, Übung, „Dort fliegen“. Kennzeichnung „experimentell“ im Knopf-Titel und im Hinweistext.
- **Grundtypen-Vorschau:** kleiner Knopf „Grundtypen ansehen“ im DIS-Block (zeigt die 18 Modelle auf der Spielkarte wie heute). Nicht mehr in der Modus-Liste. Vorschlag; Alternative: ganz entfernen, Modul und Tests bleiben.
- **Wirkmittel und Zünder:** Schritt 2 „Drohne“, nur im Taktischen Flug.
- **Stufe (Leicht, Normal, Schwer) und „Nötige Treffer“:** wie heute unter der Modus-Liste, in beiden Welten. Ballons gibt es nur bei Leicht und nur im Parcours-Flug.

### Modi je Flugart und Welt

| Modus | Parcours, Spielkarte | Parcours, echte Welt | Taktisch, beide Welten |
|---|---|---|---|
| Torkurs | ja (fest) | nein (Tore sind Teil der Karte, Referenz `legacy/`) | nein |
| Slalom | ja (fest auf Kursabschnitten) | nein (braucht 80 m gerade Freifläche; Vorschlag: später über den Dienst, offen) | nein |
| Landung | ja (fest, `PAD`) | ja, Platz zufällig auf flacher freier Stelle | nein |
| Ringe | ja (zufällig) | ja, zufällig in der Luft | nein |
| Lieferung | ja (fest) | ja, Abholplatz nahe Start, 3 von 4 Plätzen zufällig auf flachen Stellen | nein |
| Verfolgung | ja (feste Spur) | nur mit Straßen (Monschau heute); sonst ausgegraut mit Grund | nein |
| Jagd Drohnen | ja | ja, Bereiche zufällig, Ballons bei Leicht | als „Ziele Luft“ |
| Jagd Flugzeuge | ja | ja, Kreise und Wegpunkte zufällig, Ballons bei Leicht | als „Ziele Luft“ |
| Jagd Fahrzeuge | ja | nur mit Straßen; sonst stehende Fahrzeuge auf freien Flächen (Rückfall) | als „Ziele Boden“ |
| Freiflug | ja | ja (heute „Echte Welt“) | als „Aufklärung“ |
| Taktisch: Aufklärung, Ziele Boden, Ziele Luft, Gemischt | nein | nein | ja, Ziele zufällig (echte Welt) bzw. heutige Aufstellung (Spielkarte) |

Modi ohne nötige Daten (Verfolgung und Jagd Fahrzeuge ohne Straßen) bleiben sichtbar, aber gesperrt, mit Hinweis „Für diesen Ort gibt es keine Straßen“. Vorschlag; Alternative: Rückfall auf freie Flächen.

### Ablauf Seite für Seite (Skizze)

Höhen als Richtwerte bei Zoom 1 (Schätzung aus den CSS-Werten: Listenknopf 48 px je Zeile bei 2 Spalten, Seg-Zeile 36 px, Hinweis 2 Zeilen 36 px, Eingabezeile 40 px, Nav 44 px, Titel mit Schrittzahl 40 px). Engste Fläche 960x540: Panel etwa 476 px bei Zoom 1; `fitPanel` darf bis 0,72 verkleinern, also passen rechnerisch etwa 660 px Inhalt. Die heutige Modus-Seite hat etwa 480 px. Die Endprüfung bleibt im Browser in den vier Größen.

```
Hauptmenü
  FPV-Simulator
  [Weiterfliegen]                       nur nach dem ersten Flug
  [Parcours-Flug]   Tore, Ringe, Jagd, Lieferung. Spielkarte oder echte Welt.
  [Taktischer Flug] Wirkmittel gegen Ziele. Spielkarte oder echte Welt.
  [Einstellungen]
  Bestzeit, Hinweis, Version
  -> ein Knopf mehr als heute (+44 px), passt.

Schritt 1 von 2: Welt und Modus   (gleiche Seite für beide Flugarten, Titel „Parcours“ oder „Taktischer Flug“)
  Titel (40)
  Welt  [Spielkarte | Echte Welt]  (36, ersetzt die Reiter Standard/Spezial)
  Modus-Liste in 2 Spalten:
    Parcours, Spielkarte: 10 Knöpfe (5 Zeilen, 240)
    Parcours, echte Welt:  8 Knöpfe (4 Zeilen, 192), 2 davon ohne Straßen gesperrt
    Taktisch, beide:       4 Knöpfe (2 Zeilen, 96): Aufklärung, Ziele Boden, Ziele Luft, Gemischt
  Hinweis zum Modus (36)
  Stufe [Leicht | Normal | Schwer] und „Nötige Treffer“ in einer Zeile (40; heute zwei Zeilen, 86)
  nur echte Welt:
    Startort [Monschau | Ort laden | DIS-Übung] (36), daneben kleiner Text-Knopf „Optionen ›“ in der Meldungszeile
    Ort laden: Eingabe, Karte, Laden (40) + gespeicherte Orte (36)
    DIS-Übung: Zustand der Brücke (36), Download oder Port, Übung, Dort fliegen (40), „Grundtypen ansehen“ klein (28)
    Meldung (36)
  [Zurück] [Weiter] (44)
  Summen: Parcours Spielkarte 472 (passt bei Zoom 1).
          Parcours echte Welt mit Ort laden 536 (Zoom etwa 0,89 bei 960x540; heute hat die Spezial-Seite mit Ort laden etwa 440).
          Taktisch echte Welt mit DIS 476 bis 512 (Zoom etwa 0,93).
  Am Handy (390 x 844): Höhe reicht, Breite etwa 358 px: Stufe und Treffer in einer Zeile wird eng,
  darum dort untereinander (CSS-Umbruch wie bei „segpair“), die Höhe ist am Handy kein Problem.

Schritt 2 von 2: Drohne (beide Flugarten)
  Titel, Spielstil (36), Hinweis (36), Drohne 4 Vorlagen (100), Hinweis (36), [Angle | Acro] (36)
  nur Taktisch:
    Wirkmittel 2 x 2 (72): [Aufklärung] [Sprengladung] / [Hohlladung] [Splitter]
    Zünder [Aufschlag | Manuell] (36), aus bei Aufklärung und Hohlladung
    Hinweis Gewicht und Wirkung (36)
  Feinwerte ändern ›  (28)
  [Zurück] [Start] (44)
  Summen: Parcours 392 (wie heute ohne Wirkmittel-Zeile). Taktisch 536 (Zoom etwa 0,89 bei 960x540).
  Vier Wirkmittel in einer Zeile wären am Handy zu eng (geschätzt 95 px Text je Knopf bei 358 px Breite), darum 2 x 2.
```

Einstellungen (Esc), Karte, Quellen, Optionen bleiben.

Technik:
- `cfg.flight` (`course` | `tactical`), `cfg.world` (`map` | `real`), `cfg.scen` bleibt der Modus. `cfg.scen === 'real'` entfällt als Modus; stattdessen `cfg.world === 'real'`. `menu.js` prüft heute an sechs Stellen `cfg.scen === 'real'` fürs Laden (`start()`, `rwLock`, „Dort fliegen“, Ladehinweis); das wird `cfg.world === 'real'`. Alte gespeicherte Einstellungen: `scen: 'real'` → `world: 'real'`, `scen: 'free'`; `verbund: true` → `rwSrc: 'dis'`.
- `setScenario(id)` setzt `rw.on` nach `cfg.world`, nicht mehr nach dem Modus (`scenario.js:330`). `game.home`: Spielkarte wie heute, echte Welt `rw.meta.home`.
- Bestzeiten je Flugart, Welt und Modus (`state.js` `bestKey`), in der echten Welt ohne Ort (Vorschlag).
- Die Modus-Liste wird aus `SCENARIOS` mit zwei Flaggen gebaut: `worlds` (`map`, `real`, beide) und `flight` (`course`, `tactical`). Gesperrt mit Grund über eine Funktion `scenAvailable(id, world)` (prüft `rw.features.roads`).

## 2 Platzierungsdienst (gemeinsame Grundlage)

Ein Modul `src/place.js`, ohne DOM, in Node testbar. Es kennt die Welt nur über eine kleine Schnittstelle und liefert Orte für Ereignisse. Jeder Modus fragt den Dienst, statt feste Koordinaten oder `colliders` zu kennen.

### Schnittstelle „Welt“ (ein Objekt je Welt)

```
W = {
  groundH(x, z)       Bodenhöhe (Spielkarte: 0; echte Welt: groundH)
  groundN(x, z)       Normale (Spielkarte: [0,1,0]; echte Welt: groundN) für „flach“
  wet(x, z)           Wasser (Spielkarte: false; echte Welt: waterAt)
  free(p, r)          Kugel um p mit Radius r berührt kein Hindernis
                      Spielkarte: boxDist gegen colliders und town (wie heute clearOf/obstDist)
                      echte Welt: rwNear(x, z, r) -> Punkt-Dreieck-Abstand für Gebäude, Quader-Abstand für Bäume
  bounds              erlaubtes Rechteck (Spielkarte: Karte ±220 m; echte Welt: Gebiet ±480 m, bei Kacheln größer)
  roads()             Straßen als Linienzüge [[x, z], ...] mit Namen (Spielkarte: ROUTES als Linien; echte Welt: rw.features.roads oder [])
  home                Startpunkt [x, z]
}
```

Zwei Fabriken: `placeMap()` in `world.js` oder `town.js` (kennt `colliders`, `town`, `ROUTES`), `placeReal()` in `realworld.js` (kennt `rwNear`, `groundH`, `waterAt`). `place.js` selbst importiert keine Welt. Neu nötig: Punkt-Dreieck-Abstand (etwa 25 Zeilen in `math.js`); alles andere gibt es (`rwNear`, `boxDist` aus `scenario.js:63-66`, `obstDist` aus `targets.js:26-33`).

### Funktionen (alle mit Zufallsquelle `R` aus `rng(seed)`, für Tests fester Startwert wie `setLayoutSeed`)

- `pathClear(W, a, b, r, step)`: Weg frei (Proben alle `step` m; heute `pathClear` in `scenario.js:69-73` und `flightClear` in `targets.js:35-39`, zwei Fassungen desselben).
- `freeAir(W, c, rMin, rMax, hMin, hMax, r)`: zufälliger Punkt im Ring um c, Höhe `hMin` bis `hMax` über `W.groundH`, Kugel `r` frei, nicht im Hang (vier Proben um den Punkt liegen unter ihm).
- `flatSpot(W, c, rMax, r, need)`: freier flacher Platz (Normale y über 0,97, Schätzung: unter etwa 14° Neigung), trocken im Umkreis `r` + 4 m, `need` m zu Gebäuden; Suche in Ringen wie `rwDryHome`. Für Landeplatz, Lieferplätze, stehende Fahrzeuge, Startplatz.
- `ringChain(W, c, n, opts)`: Kette von n Ringen mit den Regeln von `ringLayoutOk` (Höhe über Boden, Abstand, Neigung der Ringebene, Weg frei), bis 400 Versuche, sonst Rückfall Kreis über c. Ersetzt `makeRings` auf beiden Welten (Spielkarte bleibt gleich: gleiche Regeln, gleiche Zufallsfolge wie heute prüft der Test).
- `airRegions(W, c, n, R, hMin, hMax)`: n Bereiche (Mitte, Radius) für Ziel-Drohnen, überschneidungsfrei, Mitte frei.
- `airCircles(W, c, radii, margin)`: Kreisbahnen für Starrflügler; Höhe = höchster Boden auf dem Kreis (Proben alle 10 m) plus `margin`, Kreis im Rechteck.
- `airWaypoints(W, c, n, hMin, hMax)`: Wegpunkte mit freien Wegen für Hubschrauber und Sechs-Rotor.
- `roadRoutes(W, c, rMax, minLen)`: Fahrspuren aus `W.roads()` im Umkreis, mindestens `minLen` lang, nicht durch Wasser, um 1,5 m nach rechts versetzt; Format wie `makeRoute` (`vehicles.js:21-26`). Spielkarte: die heutigen `ROUTES` unverändert.
- `parkSpots(W, c, n)`: Plätze für stehende Fahrzeuge an Straßenenden oder über `flatSpot`.

### Wer den Dienst nutzt

- `scenario.js`: Ringe, Landeplatz, Lieferplätze (echte Welt), Verfolgung (Spur aus `roadRoutes`).
- `targets.js`, `aircraft.js`, `vehicles.js`: `initX(speed, layout)` bekommt eine Aufstellung von außen. Die Spielkarte liefert die heutige feste Aufstellung (Datei unverändert, Tests `spread.test.mjs` bleiben grün), die echte Welt eine aus dem Dienst. Die Hindernisprüfung im Flug (`newWaypoint`) ruft `W.free` statt `obstDist`.
- Höhe im Bild: Fahrzeuge bekommen `v.y` (`render.js:882` setzt y heute aus dem Kippwinkel), Platten und Plätze stehen auf `groundH`.
- Tests: `test/place.test.mjs` mit beiden Welten: Spielkarte (gleiche Ringe wie heute bei gleichem Startwert, alle Ereignisse frei), Monschau aus `realworld/` wie in `test/realworld.test.mjs:20-25` (Ringe frei und über dem Boden, Plätze flach und trocken, Straßenspuren folgen den Achsen, Luftkreise über dem höchsten Boden, Dauer unter 50 ms je Aufstellung).

### Leistung (vermutet, zu messen)

Aufstellung einmal je Start: Ring-Kette bis 400 Versuche mit je 8 Kugeln und 8 Wegen (je etwa 20 Proben), also bis etwa 70 000 Abfragen von `W.free`. In der echten Welt kostet eine Abfrage `rwNear` (Zellen im 8-m-Raster) plus Dreiecks-Abstände; in der Altstadt liegen je Zelle bis einige hundert Dreiecke. Ziel unter 50 ms je Aufstellung; wenn nicht, zuerst gegen die Quader der Gebäude (Umkreis aus `bldInfo`) prüfen und nur bei Nähe gegen Dreiecke. Im Flug ändert sich nichts Wesentliches: Fahrzeuge `routeAt` mit vorberechneten Längen, `groundH` 0,6 µs (gemessen, Prompt 125).

## 3 Wirkmittel (Taktischer Flug, beide Welten)

Alles Spielwerte. Keine realen technischen Angaben. Gewichte als Anteil der Drohnenmasse, damit Whoop bis 7 Zoll stimmig bleiben (Annahme: höchstens etwa die Hälfte des Gewichts als Zuladung; heute trägt das Paket 25 %, `scenario.js:280`).

| Wirkmittel | Gewicht (Schätzung) | Schwerpunkt | Wirkradius (Schätzung) | Wirkung je Zielart | Zünder |
|---|---|---|---|---|---|
| Aufklärung | 0 | unverändert | keiner | keine; Berührung ist ein Zusammenstoß (Absturz nach Schadmodell) | keiner |
| Sprengladung (klein, allgemein) | 25 % | 3 cm unter der Mitte (Annahme: hängt unter dem Rahmen) | 3 m | Fahrzeug: Kontakt oder bis 1,5 m beschädigt, zweiter Treffer zerstört. Flugzeug, Drohne: bis 1,5 m zerstört, bis 3 m beschädigt. Person: bis 3 m außer Gefecht | Aufschlag oder manuell |
| Hohlladung (gegen Fahrzeuge) | 40 % | 5 cm unter der Mitte, 3 cm nach vorn (Annahme: länglich, nach vorn gerichtet) | keiner (gerichtet) | Fahrzeug: Kontakt von oben oder von der Seite zerstört; flacher Auftreffwinkel (unter 25° zur Fläche) nur beschädigt. Flugzeug, Drohne: nur bei Kontakt zerstört. Person: nur bei Kontakt | nur Aufschlag, nur am Ziel |
| Splitter (gegen Drohnen und Personen) | 30 % | 3 cm unter der Mitte | 6 m | Flugzeug, Drohne: bis 4 m zerstört, bis 6 m beschädigt. Person: bis 8 m außer Gefecht. Fahrzeug: bis 3 m beschädigt, nie zerstört | Aufschlag oder manuell |

Später, eigene kleine Etappe (aus dem Entwurf von k5.2): Kontaktdrähte (zünden 0,3 m vor der Drohne, verdecken den unteren Bildrand, Schwerpunkt nach vorn), Näherungszünder.

Flugmodell: `game.payload` (nur Masse) wird `game.load = { m, dy, dz }`. `computeInertia` nimmt die Zuladung als Punktmasse mit Versatz (Steiner-Anteil); der Regler bleibt auf die leere Drohne abgestimmt (`Itune`), die Drohne wird träger. Der Versatz wirkt als dauerhaftes Moment um die Mitte (Gewicht mal Hebel, eine Zeile in `step`): In Angle hält der I-Anteil die Lage, die Drohne hängt leicht nach vorn, Schweben braucht mehr Gas; in Acro driftet sie ohne Gegensteuern. Vorsicht (Prompt 81): Der eigene Regler reagiert empfindlich auf Störmomente. Werte klein halten, Zahlen erst nach Flugtest des Nutzers festlegen. Betaflight bekommt nichts Neues.

Zünder: Aufschlag = Kontakt mit Ziel, Boden, Gebäude, Baum, Wasser oder Absturz (wie heute `combat()` in `main.js`, erweitert um die Ziele beider Welten). Manuell = Taste „X“ (frei belegbar, `KEY_FN`) oder Schalter „Zünden“ (`GP_SW`): zündet in der Luft am Ort der Drohne, danach ist die Drohne weg (Meldung „Wirkmittel gezündet“, Zustand wie Absturz). Hohlladung zündet nur bei echtem Kontakt mit einem Ziel, sonst „Blindgänger“ und Absturz wie heute (Vorschlag, macht sie zum Präzisionsmittel).

Anzeige: OSD-Zeile `weapon` („SPRENG · AUFSCHLAG“), Gruppe „Wirkmittel“ in `OSD_ITEMS`, Vorgabe an. Explosion: Feuerball und Rauch wie heute (`render.js:925-936`), dazu Ton und Vibration über `fx.boom` (Physik erreicht Ton nur über `fx`). Die Effektliste zieht von `vb.fx` nach `game.fx` (`state.js`), damit sie auf der Spielkarte gezeichnet wird (`render.js:905` hängt heute an `rw.on`); `verbund.js` schreibt in dieselbe Liste.

Code: `src/warhead.js` (ohne DOM): `WARHEADS`, `warheadLoad(kind, mass)`, `warheadEffect(kind, dist, targetKind, contact, angle)` → `none`, `damaged`, `destroyed`. Tests `test/warhead.test.mjs`.

## 4 Ziele im Taktischen Flug

Ziele sind die vorhandenen Fahrzeuge, Luftziele und Ziel-Drohnen, dazu DIS-Einheiten, wenn der Startort die DIS-Übung ist. Auf der Spielkarte in der heutigen Aufstellung, in der echten Welt zufällig über den Dienst.

- **Modi:** Aufklärung (keine Ziele, Wirkmittel trotzdem wählbar), Ziele Boden (7 Fahrzeuge), Ziele Luft (9 Ziel-Drohnen und 6 Luftziele), Gemischt (alles). Keine Ballons, keine Stufe „Leicht“-Hilfen außer der Zielgeschwindigkeit.
- **Zustände:** Fahrzeug `drive`/`park` → `damaged` (halbes Tempo, 0,1 rad schief, dunkler, Rauchfahne) → `destroyed` (steht, schwarz, Feuer 3 s, dann Rauch; wie heute `hit`). Luftziel `fly` → `damaged` (Rauchfahne; Starrflügler sinkt 1 m/s und fliegt weiter, Rotor-Ziele wackeln, 30 % weniger Tempo) → `fall`. Ziel-Drohne nur `fly` → `fall` (zu klein für „beschädigt“). Person (DIS) außer Gefecht = liegt, dunkel.
- **Wertung:** zerstört volle Punkte (Flugzeuge 3/2/1 wie heute, Fahrzeuge und Drohnen 1), beschädigt halbe. „Nötige Treffer“ zählt zerstörte Ziele. Nach jeder Zündung neue Drohne am Start (wie heute `game.pendingRespawn`), Zähler „Drohnen eingesetzt“. Ende: Banner „AUFTRAG ERFÜLLT“ mit Zeit und „n Drohnen eingesetzt“. Bestzeit nur, wenn höchstens so viele Drohnen wie nötige Treffer eingesetzt wurden (Vorschlag).
- **Anzeige:** Banner „FAHRZEUG ZERSTÖRT“, „FLUGZEUG BESCHÄDIGT  +1 Punkt“; Aufgabenzeile „ZIELE 2/5 · 3 DROHNEN“. Zielmarker: nächstes nicht zerstörtes Ziel (`scenTarget`, `scenario.js:355-379`; `damaged` zählt als offen).
- **Treffer-Prüfung:** Fahrzeuge `hitsVehicle` (Strecke gegen Kasten), Luftziele `sweptDist`, DIS `vbContact`; für den Wirkradius je Ziel der Abstand zum Zündort. Hohlladung: Auftreffwinkel aus Flugrichtung gegen die Normale der getroffenen Kastenfläche (aus dem Slab-Test ablesbar).
- **Parcours-Flug bleibt wie heute:** Berührung zählt, Ballons bei Leicht, Bestzeiten vergleichbar.

## 5 Parcours in der echten Welt

Was fürs zufällige Platzieren fehlt und wie der Dienst es löst:

| Modus | Heute platziert durch | Fehlt in der echten Welt | Lösung über den Dienst |
|---|---|---|---|
| Ringe | `makeRings` auf Kursabschnitten, Prüfung gegen Quader | Boden ist nicht 0, Gebäude als Dreiecke, Bäume, Hänge | `ringChain(W, home, 8, { rMin: 60, rMax: 250, hMin: 4, hMax: 15 })`; Höhe über `groundH` an der Ringmitte, Ringebene schneidet den Hang nicht, Kugel Ringradius + 1,5 m frei, Weg 1,5 m frei. Rückfall: Kreis 40 m Radius, 12 m über dem höchsten Boden |
| Jagd Drohnen (mit Ballons bei Leicht) | 6 feste Bereiche, 3 feste Schweber, `obstDist` | Bereiche, Höhen, freie Wege | `airRegions(W, home, 6, 22, 9, 16)` und 3 freie Schwebepunkte; `newWaypoint` mit `W.free`; Ballon-Mechanik unverändert (hängt am Ziel) |
| Jagd Flugzeuge (mit Ballons bei Leicht) | 2 feste Kreisbahnen, 4 feste Wegpunktlisten | Kreise über Hängen, Wegpunkte frei | `airCircles` (60 und 120 m, Höhe höchster Boden + 25 m), `airWaypoints` (18 bis 30 m über Boden, Wege frei, Radius 3 m) |
| Jagd Fahrzeuge | 3 feste Plätze, 4 feste Spuren | Straßen, Höhe, Neigung | `roadRoutes` aus `rw.features.roads` (Monschau), `parkSpots`; Höhe `groundH`, Nicken aus der Höhendifferenz 2 m voraus. Ohne Straßen: gesperrt oder nur stehende Fahrzeuge (Entscheidung) |
| Verfolgung | `ROUTES[0]` fest | Straße | `roadRoutes`, längste Spur; ohne Straßen gesperrt |
| Landung | `PAD` fest | flacher trockener Platz | `flatSpot(W, home, 150, 3, 6)`; Platte auf `groundH` |
| Lieferung | `PICKUP`, `DROPS` fest | 4 flache Plätze | Abholplatz `flatSpot` 15 m vom Start, 4 Lieferplätze `flatSpot` 60 bis 200 m, 3 davon zufällig |
| Freiflug | Start `TOWN.start` | nichts | wie heute „Echte Welt“ |
| Torkurs, Slalom | Teil der Karte / Kursabschnitte | feste Strecke | bleiben Spielkarte |

Straßen für geladene Orte (nicht Monschau), gesichert geprüft, siehe oben:
- **ALKIS WFS „vereinfacht“** (NRW): Flächen „Straßenverkehr“ und „Weg“, etwa 1 MB je km², CORS geht. Flächen ins 1-m-Raster (wie `dlmWater`), daraus ein Abstandsfeld; Fahrzeuge fahren auf dem Raster entlang des größten Abstands zum Rand, biegen an Kreuzungen zufällig ab. Keine Achsen, keine Namen, nur NRW als Vorlage (andere Länder bräuchten ein eigenes Feld im Quellen-Formular). **Vorschlag.**
- **Basis-DLM Achsen** `ver01_l.shp`: 158,7 MB für ganz NRW einmal laden wie die Landesdaten (heute 60 MB). Namen (DBF 965 MB) nicht machbar. Nicht empfohlen (Speichergrenze 400 MB, Ladezeit vermutet 10 bis 30 s).
- **Nur Monschau:** kleinster Aufwand, geladene Orte ohne Fahrzeuge auf Straßen.

## 6 Etappen und Reihenfolge

Aufwand (Schätzung): S = unter einer Sitzung, M = eine Sitzung, L = zwei Sitzungen. Je Etappe: umsetzen, `npm run build`, `npm test`, Browser in vier Größen, committen, berichten, anhalten.

| Nr. | Etappe | Ziel | Umfang | Dateien | Tests | Aufwand | Risiko |
|---|---|---|---|---|---|---|---|
| T1 | Menü und DIS-Abschluss | Hauptmenü „Parcours-Flug“ und „Taktischer Flug“; Schritt 1 mit Welt-Schalter und gefilterter Modus-Liste; Startort mit „DIS-Übung (experimentell)“; „Grundtypen ansehen“ als Knopf; Stufe und Treffer in einer Zeile; DIS-Texte und Doku | Nur Menü und Texte, keine Physik. `cfg.flight`, `cfg.world`, Umstellung alter Einstellungen. Taktische Modi erscheinen schon, verhalten sich bis T4 wie die Jagd-Modi (Hinweis „kommt mit Etappe T4“); Parcours in der echten Welt zeigt nur Freiflug, bis T2 und T3 die Modi freischalten | `src/index.html`, `src/menu.js`, `src/style.css`, `src/scenario.js` (Flaggen, Label), `src/state.js`, README, `docs/PLAN.md`, `docs/dis-abschluss.md`, `docs/dis-drohne.md` (Vermerk) | `test/scenario.test.mjs` (Liste je Flugart und Welt, Umstellung alter Einstellungen), `test/build.test.mjs`; Browser vier Größen; DIS-Weg mit `node tools/dis-bruecke.mjs` und DIS-Ersatz | S bis M | Platz auf Schritt 1 mit Ort laden (Zoom etwa 0,89); alte Einstellungen `scen: 'real'` und `verbund` sauber abbilden |
| T2 | Platzierungsdienst und Ringe in der echten Welt | `place.js` mit den zwei Welt-Objekten, Punkt-Dreieck-Abstand, `ringChain`; Ringparcours in beiden Welten über den Dienst (Spielkarte unverändert) | Erster sichtbarer Parcours in der echten Welt | neu `src/place.js`, `src/math.js`, `src/world.js` oder `src/town.js` (`placeMap`), `src/realworld.js` (`placeReal`), `src/scenario.js`, `src/render.js` (Ringe mit `rw.on`) | neu `test/place.test.mjs` (beide Welten, Monschau aus `realworld/`), `test/scenario.test.mjs` (Ringe der Spielkarte wie bisher bei festem Startwert), Dauer unter 50 ms | M | Innenstadt ohne freie Kette: Rückfall muss immer gehen; Rechenzeit der Dreiecks-Abstände |
| T3 | Luftziele in der echten Welt | Jagd Drohnen und Jagd Flugzeuge über `airRegions`, `airCircles`, `airWaypoints`; Ballons bei Leicht; Aufstellung von außen in `targets.js` und `aircraft.js`; Landung und Lieferung über `flatSpot` | Parcours in der echten Welt: Ringe, Jagd Drohnen, Jagd Flugzeuge, Landung, Lieferung, Freiflug | `src/place.js`, `src/targets.js`, `src/aircraft.js`, `src/scenario.js`, `src/render.js` (Platten auf `groundH`) | `test/targets.test.mjs`, `test/aircraft.test.mjs`, `test/spread.test.mjs` (Spielkarte unverändert), `test/place.test.mjs` (Kreise über dem Boden, Plätze flach und trocken) | M | Starrflügler am Hang sehr hoch (Kreis über dem höchsten Boden); Lieferplätze in dichter Bebauung nicht gefunden: Rückfall weniger Plätze |
| T4 | Wirkmittel-Grundlage, Taktischer Flug auf der Spielkarte | `warhead.js`; Masse und Schwerpunkt im Flugmodell; Zünder Aufschlag; Explosion und Ton überall (`game.fx`); Modi Aufklärung und Ziele Boden mit Sprengladung (beschädigt, zerstört, Wertung, Drohnen-Zähler); OSD-Zeile | Sprengladung komplett; Hohlladung und Splitter noch gesperrt | neu `src/warhead.js`; `src/physics.js`, `src/main.js`, `src/vehicles.js`, `src/scenario.js`, `src/render.js`, `src/audio.js`, `src/osd.js`, `src/state.js`, `src/menu.js`, `src/index.html`, `src/verbund.js` (Effektliste) | `test/warhead.test.mjs` (Tabelle, Masse, Schwerpunkt: Schweben bleibt waagrecht in Angle), `test/vehicles.test.mjs`, `test/scenario.test.mjs`, `test/physics.test.mjs` | M | Flugverhalten mit Schwerpunkt-Versatz: Werte klein, Flugtest des Nutzers vor dem Festlegen |
| T5 | Alle Wirkmittel, Ziele Luft und Gemischt, beide Welten | Hohlladung, Splitter, manueller Zünder (Taste, Schalter); Wirkung gegen Flugzeuge und Ziel-Drohnen mit `damaged`; Ziele in der echten Welt über den Dienst (aus T3); DIS-Einheiten als Ziele am Startort DIS-Übung | Taktischer Flug vollständig in beiden Welten (Ziele Boden in der echten Welt erst mit T6) | `src/warhead.js`, `src/aircraft.js`, `src/targets.js`, `src/scenario.js`, `src/state.js`, `src/gamepad.js`, `src/menu.js`, `src/verbund.js` | `test/aircraft.test.mjs`, `test/targets.test.mjs`, `test/keys.test.mjs`, `test/gamepad.test.mjs`, `test/verbund.test.mjs` | M | Auftreffwinkel der Hohlladung sinnvoll messen |
| T6 | Fahrzeuge auf Straßen (Monschau) | `roadRoutes`, `parkSpots`; Jagd Fahrzeuge, Verfolgung, Ziele Boden in der echten Welt mit Höhe und Neigung; ohne Straßen gesperrt mit Grund | eingebautes Monschau | `src/place.js`, `src/vehicles.js`, `src/scenario.js`, `src/render.js`, `src/menu.js` | `test/vehicles.test.mjs` (folgt der Achse, bleibt auf dem Boden, nicht im Wasser), `test/place.test.mjs` | M | Achsen durch Gebäude (im Basis-DLM nicht zu erwarten, vermutet): mit `W.free` prüfen und Stücke verwerfen |
| T7 | Straßen für geladene Orte | ALKIS-WFS „Nutzung“ im Worker laden, Flächen „Straßenverkehr“ und „Weg“ rastern, Abstandsfeld, Fahrspuren, speichern je Ort und Kachel; Feld „Straßen, WFS“ im Quellen-Formular | NRW-Vorlage | `src/rwload.js`, `src/rwworker.js`, `src/realworld.js`, `src/rwstore.js`, `src/place.js`, `src/srcui.js`, `src/index.html` | `test/rwload.test.mjs` (GML-Probe), neuer Test Raster und Abstandsfeld, Fahrt bleibt auf der Fläche | L | WFS-Grenzen (Anzahl je Antwort, Zeit); andere Länder ohne Quelle; GML-Polygon-Leser neu (Vorbild `readLod2`) |
| T8 | Ergebnis-Seite | Nach erfüllter Aufgabe oder Absturz: Zeit, Treffer je Zustand, Drohnen eingesetzt, Restakku, Strecke; „Noch einmal“, „Hauptmenü“ | beide Flugarten | `src/menu.js`, `src/index.html`, `src/scenario.js` | Browser vier Größen; Node-Test der Zusammenfassung | M | Platz: nur Zahlen |

Später, nicht geplant: Slalom in der echten Welt (gerade Freifläche über den Dienst), Kontaktdrähte, Näherungszünder, Datenlink mit Störsender und Glasfaser, Wetter. Entfallen mit dem DIS-Abschluss: Gelände per WMS über die Brücke, Wirkung in VBS.

### Begründung der Reihenfolge

- **T1 zuerst:** klein, sofort sichtbar, ohne Physik. Beide Wahlen stehen im Menü, DIS ist sauber eingeordnet. Alles Spätere füllt nur Knöpfe, die es dann schon gibt.
- **T2 vor allem anderen Fachlichen:** Der Dienst ist die gemeinsame Grundlage für T3, T5, T6. Ringe sind das kleinste Ereignis ohne Datenbedarf und zeigen sofort den Nutzen (Wunsch „Ringe überall“).
- **T3 vor T4:** Parcours in der echten Welt mit Ballons war der ausdrückliche Wunsch aus Prompt 162 und braucht nur den Dienst, keine neue Physik.
- **T4 vor T5:** erst ein Wirkmittel gegen ein Ziel auf der Spielkarte (dort gibt es alles schon, keine Platzierung nötig). Der Schwerpunkt-Versatz ist der riskante Teil und braucht einen Flugtest, bevor mehr darauf aufbaut.
- **T6 nach T5:** Fahrzeuge in der echten Welt brauchen Straßen und Höhe; Monschau hat beides. T7 ist die einzige Etappe mit neuer Datenquelle und darum die unsicherste, deshalb spät.
- **T8 am Ende:** rundet ab, hängt von allem ab.

## Stand der Etappen

- **T1 erledigt** (Prompt 163, Version 1.180): Menü mit Flugart und Welt, DIS-Übung als experimenteller Startort.
- **T3 erledigt** (Prompt 170, „Mache die nächsten Schritte autark“): Parcours in der echten Welt mit Ringen, Präzisionslandung, Jagd Drohnen, Jagd Flugzeuge, Paketlieferung und Freiflug. `place.js`: `freeAir`, `airRegions`, `airCircle`, `airWaypoints`, `flatSpot` (eben auf ±3 m unter 0,25 m, trocken, frei). `targets.js` und `aircraft.js` nehmen eine Aufstellung von außen (`initTargets(speed, lay)`, `initAircraft(speed, lay)`), Höhen und Absturz relativ zum Boden; ohne Aufstellung die Spielkarte unverändert (gleiche Zufallsfolge). `scenario.js`: `huntLayoutReal` (6 Bereiche 40 bis 320 m, feste Strecken ganz frei, 3 Schweber), `airLayoutReal` (Achte und Kreis 25 m über dem höchsten Boden, Rotoren auf freien Wegen), Landeplatz 60 bis 150 m und Lieferplätze über `flatSpot`, Platten und Prüfungen relativ zur Platzhöhe, Landehilfe relativ zum Boden. Bei jedem Start neu verteilt; Ballons bei Leicht wie auf der Karte. Abweichung: `groundN` nicht nötig (Ebenheit über 9 Höhenproben); Bestzeit weiter je Welt, nicht je Ort. Tests `test/place-luft.test.mjs`; über 20 Startwerte in Monschau immer alle Ziele und ein Landeplatz, 1 bis 15 ms.
- **T2 erledigt** (Prompt 164): `src/place.js` (Ringkette, Kreis als Rückfall, freier Weg), `placeReal()` in `realworld.js` (Gebäude-Dreiecke über `ptTriDist` in `math.js`, Bäume als Quader, Boden), Ringparcours in der echten Welt (Kette um den Start, Monschau etwa 7 ms), Bestzeit je Welt (`rings.real`). Abweichung vom Plan: Die Spielkarte nutzt weiter `makeRings` unverändert (sicher gleiche Anordnung); `placeMap()` folgt, wenn ein Modus sie braucht (T3).

## 7 Offene Entscheidungen (mit Vorschlag)

Aus der 1. Fassung, gelten weiter:
1. **Grundtypen-Vorschau:** kleiner Knopf „Grundtypen ansehen“ im DIS-Block (Vorschlag) oder ganz aus dem Menü. Gilt weiter, nur der Ort hat sich geändert (DIS ist jetzt ein Startort).
2. **Hohlladung am Boden:** nur bei Zielkontakt zünden, am Boden Blindgänger (Vorschlag) oder auch am Boden zünden. Gilt weiter, unabhängig von der Welt.
3. **Straßen für geladene Orte:** ALKIS-WFS-Flächen (Vorschlag, T7) oder Basis-DLM-Achsen (159 MB) oder nur Monschau. Gilt weiter; mit „nur Monschau“ entfällt T7, und Jagd Fahrzeuge, Verfolgung und Ziele Boden bleiben an geladenen Orten gesperrt.

Neu aus der 2. Fassung:
4. **Reihenfolge der Wahlen:** Flugart im Hauptmenü, Welt auf Schritt 1 (Vorschlag) oder Welt zuerst.
5. **DIS in beiden Flugarten:** Startort „DIS-Übung“ auch im Parcours-Flug (Vorschlag: ja, universell und ohne Sonderfall) oder nur taktisch.
6. **Modi ohne Daten:** gesperrt mit Grund (Vorschlag) oder Rückfall (stehende Fahrzeuge auf freien Flächen).
7. **Bestzeiten:** je Flugart, Welt und Modus, in der echten Welt ohne Ort (Vorschlag) oder je Ort.
8. **Bestzeit im Taktischen Flug** nur, wenn höchstens so viele Drohnen wie nötige Treffer eingesetzt wurden (Vorschlag), oder immer.
9. **Namen der taktischen Modi:** Aufklärung, Ziele Boden, Ziele Luft, Gemischt (Vorschlag).
