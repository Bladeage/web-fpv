# Plan „Gelände aus einem WMS-Höhendienst“ (Planung 08.11.2026, Fable)

Nur Planung, kein Code. Auftrag des Nutzers über k5.2: Das Gelände des DIS-Partners soll in die Simulation kommen, auch wenn DIS als Proof of Concept abgeschlossen ist (`docs/dis-abschluss.md`). An VBS wird nichts geändert. Zusatzsoftware ist höchstens die Brücke (`bruecke/fpv-dis-bruecke.cmd`, Node-Gegenstück `tools/dis-bruecke.mjs`). Der Simulator bleibt universell: im Code heißt die Quelle „WMS-Höhendienst“, ohne Bezug auf ein bestimmtes Programm. Der Partner liefert sein Gelände über einen OGC-Dienst, den jedes GIS-Programm kennt. Darum passt die Quelle auch für andere Dienste, zum Beispiel einen eigenen GeoServer mit einem Höhenmodell.

Einstufung: **gesichert** = gemessen (k5.2 oder Nutzer) oder im Code gelesen (Fundstelle genannt). **vermutet** = nicht geprüft. **Schätzung** = Zahl mit genannter Annahme.

## 1 Ziel und Nutzen

### Gesichert (Messungen k5.2, 08.11.2026, nur lesend am World Server; Code-Stellen im Repo)

- Der Partner (VBS 26.1.3 mit World Server) bietet einen OGC WMS 1.3.0 unter `http://<Rechner>:7071/ows`, Titel „Blue Data Pipeline Web Map Service“. Koordinatensysteme EPSG:4326 und EPSG:3857, Ausdehnung weltweit. GetMap-Formate: image/png, image/geotiff, image/tiff, image/tiff8, text/xml, gml.
- Ebene `Blue_hgt` liefert Höhen als GeoTIFF mit 32-Bit-Gleitkomma. Die Höhe ist schon die Höhe über dem Ellipsoid: Cologne Airport 123,04 m = 75,74 m über NN + 47,25 m Geoidhöhe. Eine Kachel 256 x 256 ist 263 KB groß und braucht 0,35 s auf demselben Rechner. 256 x 256 x 4 Byte sind 262 144 Byte, die Kachel ist also unkomprimiert (vermutet aus der Größe; unser TIFF-Leser kann ohne Kompression und LZW, `src/geo.js:24`).
- Weitere Ebenen: `Blue_hgt_rgba` (Höhe als RGBA-PNG, 0,15 s, Kodierung ungeprüft), `Blue_ortho_photo` (Luftbild, PNG, 5,6 s je Kachel 256 x 256), `Blue_alb`, `Blue_srf`, `Blue_shaded_relief`, `Blue_ortho_height`, `Blue_ortho_height_no_veg_rgb`, `Blue_ortho_vegetation_height_rgb`.
- Browser-Test aus `https://bladeage.github.io/web-fpv/`: `fetch` auf `http://localhost:7071/ows` GetCapabilities 200 in 4 ms, GetMap `Blue_hgt` als GeoTIFF 200, auch über 127.0.0.1. Der Dienst sendet `Access-Control-Allow-Origin: https://bladeage.github.io`. Auf demselben Rechner braucht es also weder Brücke noch Proxy. Chrome fragt einmal nach dem Zugriff auf das lokale Netz (dieselbe Frage wie bei der Brücke, `src/menu.js:336-339`).
- Höhen heute: Unser Gelände kommt aus dem NRW-DGM1 (Höhe über NHN). Für DIS rechnen wir mit fester Geoidhöhe 47 m (`src/verbund.js:24`, `undulation`). Die VBS-Standardkarte liegt am Flughafen Köln/Bonn 2,2 m über dem DGM1, das Inset aus NRW-Daten 0,3 bis 0,6 m darunter (`docs/dis-drohne.md`, „Ursache des Höhenunterschieds“). Eine gelandete Drohne lag in VBS bis 2,5 m im Boden.
- Der Bezugspunkt der VBS-Einheiten ist praktisch der Boden (minus 0,11 bis 0 m, gemessen).
- Die ebene Fläche am Ort der Übung (`rwFlat`, `src/realworld.js:216-224`) kennt keine Hügel, keine Täler.

### Nutzen (Folgerung aus den Messungen)

- Fliegt unsere Drohne auf dem Gelände des Partners, stehen seine Einheiten und unsere Drohne auf demselben Boden. Der Unterschied von 2,2 m (Standardkarte) oder 0,3 bis 0,6 m (Inset) verschwindet. Das ist eine Folgerung, noch nicht gemessen. Messen kann k5.2 nach Etappe W3.
- Wichtig für den Höhenbezug: Wir ziehen beim Laden die Geoidhöhe ab und zählen sie beim Senden wieder dazu (`src/verbund.js:81`, `hNhn + undulation`). Der feste Wert 47 m kürzt sich für DIS also heraus. Die Drohne meldet genau die Höhe des Partner-Geländes plus ihre Flughöhe, egal, wie genau 47 m stimmt. Der Wert zählt nur noch, wenn wir Gebäude aus NRW (Höhe über NHN) auf das Partner-Gelände stellen (Abschnitt 2.6).
- Ohne Kartendaten (Ort außerhalb Deutschlands, erfundenes Gelände des Partners) gibt es statt der ebenen Fläche echtes Relief.
- Universell: Jeder WMS, der eine Höhenebene als Gleitkomma-TIFF liefert, kann so Gelände liefern. Die Quelle ist eine normale Quelle unter Optionen → Quellen.

### Vermutet

- Der Dienst enthält die Insets (NRW-Höhen bei Köln). k5.2 hat die Höhe am Flughafen gemessen, nicht beim Inset.
- Die Auflösung der Ebene `Blue_hgt` ist nicht gemessen. Beim Inset vermutlich fein (aus DGM1), sonst grob (Standardkarte).
- Läuft der World Server auf einem anderen Rechner im LAN, blockt der Browser `http://192.168.x.y` von unserer https-Seite als „Mixed Content“ (Browser-Regel, nicht gemessen). Dann muss die Brücke die Kacheln durchreichen (Etappe W4).
- Firefox und Edge lassen `http://localhost` von https-Seiten ebenfalls zu (Regel „potentially trustworthy“, nicht gemessen). Eingebettete Browser blockieren localhost (gesichert bei der Brücke, Einschränkung 9 in `docs/dis-abschluss.md`).
- Der WFS des Dienstes antwortet mit 500. Wir brauchen ihn nicht.
- Lizenz: Die Geländedaten des World Servers sind Herstellerdaten. Der Nutzer klärt, was erlaubt ist. Bis dahin gilt: nur anzeigen, nicht speichern, nicht exportieren, nicht einbetten.

## 2 Architektur

### 2.1 Neue Quellenart „WMS-Höhendienst“

Heute hat eine Quelle die Felder `crs` (nur EPSG:25832 oder 25833, `src/rwload.js:244`), `dgm` (WCS), `dom` (WCS), `dop` (WMS), `lod2`, `dlm`, `land`, `box` (`src/rwload.js:8-17`). Neu kommt eine Quelle mit `kind: 'wms'` dazu:

```
{ id, kind: 'wms', name: 'WMS-Höhendienst (lokaler Rechner)',
  hgt: { url: 'http://localhost:7071/ows', layer: '', crs: 'EPSG:4326', format: 'image/tiff', tile: 256 },
  dop: null,                      // optional: { url, layer } Luftbild des Dienstes (langsam, Abschnitt 2.5)
  vref: 'ellipsoid',              // 'ellipsoid' (Höhe über dem Ellipsoid) oder 'msl' (Meereshöhe, wie NHN)
  use: 'dis',                     // 'dis' (nur für den Startort DIS-Übung) oder 'all' (auch Ort laden, weltweit)
  store: false,                   // nie im Browser speichern (Lizenz), nur Arbeitsspeicher
  land: '', box: null,            // gilt überall
  attribution: 'Gelände des WMS-Höhendienstes' }
```

- `layer: ''` heißt: automatisch wählen (Abschnitt 3.3). Nach einer erfolgreichen Wahl trägt das Programm den Namen in die Laufzeit ein, nicht in die gespeicherte Quelle.
- `tile: 256`: Kachelgröße je Abruf. GetCapabilities nennt oft `MaxWidth` und `MaxHeight`; wenn ja, nehmen wir bis 1024. k5.2 hat nur 256 gemessen.
- Eine Vorlage dieser Art kommt in `RW_SOURCES` (`src/rwload.js:8`) mit `use: 'dis'`. So geht der DIS-Fall ohne einen Klick. Der Nutzer kann sie kopieren und auf `use: 'all'` stellen.
- `rwSourcesParse` (`src/rwload.js:236-255`) nimmt `kind: 'wms'` an und prüft: `hgt.url` ist eine http- oder https-Adresse, `vref` ist `ellipsoid` oder `msl`. Ohne `kind` gilt wie heute die Landesquelle.
- `rwSourceAt` (`src/rwload.js:45-48`) verlangt heute ein Rechteck `box`. Neu: `box: null` passt überall. `rwPlan` (`src/realworld.js:80-94`) nimmt WMS-Quellen mit `use: 'all'` als Hauptquelle, wenn keine Landesquelle am Ort liegt, oder wenn der Nutzer sie nach vorn gestellt hat (eigene Quellen gelten vor Vorlagen, `src/realworld.js:74-76`). Für den Startort „DIS-Übung“ gilt die Reihenfolge aus Abschnitt 3.1.

### 2.2 Unser Kartengitter bleibt UTM

Alles im Simulator rechnet in Metern: Mitte des Gebiets = Ursprung, x Ost, z Süd, y über dem Start, Gebiet 1 x 1 km mit 512² Höhen, Umgebung 10 x 10 km mit 401², Kacheln 1 km (`src/rwload.js:19-23`, `src/realworld.js:272-350`). `meta.crs` muss `EPSG:258xx` bleiben, denn mehrere Stellen lesen die Zone daraus (`src/realworld.js:697`, `src/realworld.js:791`, `src/realworld.js:856`, `src/verbund.js:29`). Die UTM-Zone kommt aus der Länge wie bei `rwFlat` (`src/realworld.js:217`), damit auch Orte außerhalb Deutschlands gehen.

Der WMS liefert in EPSG:4326. Darum rechnen wir um, nicht das Gitter:

1. **Geografisches Rechteck zum UTM-Quadrat:** Die vier Ecken des UTM-Quadrats mit `fromUtm` (`src/geo.js:99`) nach Breite und Länge, davon Minimum und Maximum, plus Rand von 2 Zellen. Bei Köln ist das Quadrat um die Meridiankonvergenz gedreht (etwa 1,5°, Zone 32 bei 7° Ost), der Rand fängt das auf (etwa 26 m je Seite bei 1 km).
2. **Abruf:** `GetMap` mit `CRS=EPSG:4326`. Achtung bei WMS 1.3.0: Für EPSG:4326 steht die Breite zuerst, also `BBOX=minLat,minLon,maxLat,maxLon`. `WIDTH` und `HEIGHT` getrennt aus der Ausdehnung in Metern geteilt durch unsere Zellgröße (Breite: 1° ≈ 111 320 m, Länge: 1° ≈ 111 320 m x cos(Breite)). Für 1 km bei 2 m Zellen etwa 540 x 540 Bildpunkte, aufgerundet auf Kacheln von 256: 3 x 3 Kacheln. Umgebung 10 km bei 25 m: etwa 430 x 430, also 2 x 2 Kacheln.
3. **Kacheln zusammensetzen** zu einem Raster in Grad (Zeile = Breite, Spalte = Länge).
4. **Umrechnen ins UTM-Gitter:** Für jeden Gitterpunkt (i, j) Breite und Länge, dann bilinear aus dem geografischen Raster lesen. `fromUtm` 262 144-mal zu rufen ist zu teuer im Hauptprogramm (Schätzung: 1 µs je Aufruf, 0,3 s). Darum: `fromUtm` nur auf einem Stützgitter 17 x 17, dazwischen linear. Fehler unter 1 cm bei 1 km (Schätzung, die Abbildung ist über 1 km fast linear; der Test prüft es gegen die genaue Rechnung).
5. **Ungültige Werte** (NoData-Tag 42113, NaN, unter minus 1000 m, Meer bei 0 ist gültig) wie heute mit `rwFillGaps` füllen (`src/rwload.js:321-334`).

Ergebnis ist ein Raster wie aus dem WCS. Alles danach (`rwPack`, `rwApply`, Netze, Physik, Kacheln, Umgebung) bleibt unverändert.

### 2.3 Kachelraster und Auflösung

- Wir übernehmen nicht das Raster des Dienstes, sondern tasten es auf unsere Gitter ab: Startgebiet 2 m (512²), Umgebung 25 m (401²), Nachladekacheln 2 m. Ist der Dienst grober (Standardkarte, vermutet 30 m), entstehen Treppen, die unsere bilineare Abtastung glättet. Ist er feiner als 2 m, verlieren wir Detail, wie heute beim DGM1 (1 m) auch.
- Zeit je Gebiet (Schätzung aus 0,35 s je Kachel): Startgebiet 9 Kacheln 3 s, Umgebung 4 Kacheln 1,5 s, Nachladekachel 9 Kacheln 3 s. Abrufe nacheinander, höchstens 4 gleichzeitig. Das läuft im Hintergrund-Thread (`src/rwworker.js`, Modul `rwwms.js` kommt in `WK_MODS`, `src/rwthread.js:10`).
- Offen von k5.2: „Kachelraster und Auflösung passend zum NRW-Gelände“. Vorschlag: k5.2 misst die echte Auflösung von `Blue_hgt` am Inset (1 km als 256² und als 1024² abrufen; ist das 1024er-Bild nur eine Treppe des 256ers, ist die Quelle grob). Danach legen wir fest, ob 2 m sinnvoll sind oder 5 m reichen.

### 2.4 Höhenbezug

- `vref: 'ellipsoid'`: Beim Laden ziehen wir die Geoidhöhe ab: `hNHN = hEll − N`. N ist heute fest 47 m in `VB.undulation` (`src/verbund.js:24`). `rwload.js` darf `verbund.js` nicht importieren (Kreis: `verbund.js` importiert `realworld.js`). Darum wandert die Zahl als `GEOID_FIX = 47` nach `src/geo.js` (ohne DOM), und `VB.undulation` liest sie dort. Kein Name doppelt (Regel in `CLAUDE.md`). Die Zahl ist eine Schätzung (NRW 42,5 bis 48,5 m).
- `vref: 'msl'`: Höhe bleibt, wie sie kommt.
- `meta.hRef` hält fest, was angewendet wurde (`'ell-47'` oder `'msl'`), für Anzeige und Tests.
- Folge für DIS: Unsere Drohne sendet `hHome + y + 47` (`src/verbund.js:81`, `:217`). Mit `hNHN = hEll − 47` ist das genau `hEll(Gelände) + y`. Der Fehler des festen Werts hebt sich auf. Einheiten des Partners kommen mit `he − 47` an (`src/verbund.js:105`) und stehen am Boden ohnehin auf unserem Gelände (`vbPlace`). Luftfahrzeuge: gleiche Konstante, gleicher Effekt. Die Drohne liegt also nur noch so weit vom Boden des Partners, wie seine Abtastung und unsere Umrechnung abweichen (Schätzung unter 0,3 m bei einem 2-m-Gitter).
- Später möglich, nicht geplant: Geoidhöhe je Ort (BKG GCG2016 grob als Raster, etwa 1 km Maschen). Nur nötig, wenn Gebäude aus NRW auf das Partner-Gelände kommen und der Versatz stört.

### 2.5 Luftbild

- Das Luftbild des Dienstes ist langsam: 5,6 s je Kachel 256² (gesichert). Für das Startgebiet in heutiger Schärfe (4096², `src/rwload.js:19`) wären das 256 Kacheln, etwa 24 Minuten (Schätzung). Grob 512²: 4 Kacheln, etwa 22 s. Umgebung 1024²: 16 Kacheln, etwa 90 s.
- Vorschlag: In den ersten Etappen ohne Luftbild des Dienstes. Boden = Schattierung aus den Höhen (Sonne wie heute im Süden, `docs/echte-welt.md`, Abschnitt Licht) mal Grasbild (`rwFlatImage`, `src/realworld.js:227-239`). Die Schattierung rechnet der Simulator aus dem Raster, ohne Abruf. So sieht man das Relief.
- Option später (Etappe W5): „Luftbild des Dienstes (grob, langsam)“ als Schalter in der Quelle, nur Startgebiet 512². Und: Liegt der Ort in einem Land mit Landesquelle (NRW), das Luftbild der Landesquelle nehmen (Abschnitt 2.6).

### 2.6 Gebäude und Bäume

- Der Dienst hat keine Gebäude als 3D-Daten. Die Ebenen `Blue_ortho_height` und `Blue_ortho_vegetation_height_rgb` sind Raster, vermutlich Oberflächenhöhen (ungeprüft). Daraus ließen sich Bäume wie heute aus DOM minus DGM ableiten (`findTrees`, `src/rwload.js:91-108`). Kodierung unbekannt, darum nicht geplant.
- Vorschlag (Etappe W5, Entscheidung des Nutzers): Liegt der Ort in einem Land mit Landesquelle, nehmen wir Gebäude (LoD2), Bäume (DOM minus Landes-DGM) und Luftbild aus der Landesquelle, aber die Höhen vom WMS. Technisch ist das eine zusammengesetzte Quelle: `{ ...landesquelle, hgt: wms.hgt, vref, store: false }`. `rwFetchArea` holt heute jede Ebene einzeln aus `srcs[0]` (`src/rwload.js:155-167`); neu entscheidet eine Funktion `fetchHeights(s, ...)`: `s.hgt` vorhanden, dann WMS, sonst WCS. Bäume: nDOM = DOM minus Landes-DGM (sonst entstehen aus dem Unterschied der beiden Geländemodelle falsche Bäume); der Fuß steht auf unserem Boden.
- Bekannter Versatz dabei: Das Inset liegt 0,3 bis 0,6 m unter dem DGM1 (gesichert), dazu bis 0,25 m aus der festen Geoidhöhe. Gebäude können also bis etwa 0,8 m im Boden stehen oder schweben. Gebäude sind relativ zum Startplatz gepackt (`src/rwload.js:278`); ein Ausgleich je Gebäude (Sockel auf den Boden setzen) wäre eine kleine Zusatzregel in `rwPack`, nicht geplant.
- Ohne Landesquelle: keine Gebäude, keine Bäume. Nur Relief.
- Die zusammengesetzte Quelle speichert nichts (`store: false` erbt vom WMS-Teil), auch nicht die NRW-Anteile. Der Zwischenspeicher der Gebäudekacheln (`lod2`, nur NRW-Daten) darf weiter genutzt und gefüllt werden.

### 2.7 Speicherverbot (nur Arbeitsspeicher)

- `store: false` an der Quelle. Wirkung: `rwLoadLive` ruft `store.put` nicht (`src/realworld.js:206-210`), `rwLoadTile` nicht (`src/realworld.js:809`), `rwLoadFar` nicht (`src/realworld.js:868`). Lesen aus dem Speicher ist dann ebenfalls aus (es gäbe nichts). Der Export (`storeExportAll`, `src/rwstore.js:126`) kann nichts davon enthalten. `tools/realworld.mjs` bettet nichts aus einer WMS-Quelle ein (Werkzeug lehnt `kind: 'wms'` ab).
- Was im Arbeitsspeicher liegt: Startgebiet, Umgebung, bis 8 Kacheln (`RW_STREAM.max`, `src/realworld.js:772`). Das ist heute schon so. Ohne Speicher lädt jede Kachel beim Zurückkommen neu (3 s, lokal; akzeptabel).
- Menü: Unter Optionen → Daten erscheinen keine Einträge für diese Orte. Der Hinweis im Menü sagt „nicht gespeichert (Lizenz der Quelle)“.
- Test: Ladeablauf mit einem Speicher-Attrappen-Objekt, das jedes `put` zählt; mit `store: false` bleibt die Zahl 0.

### 2.8 Fehlerfälle

| Fall | Erkennung | Verhalten |
|---|---|---|
| Dienst nicht erreichbar | `fetch` wirft, oder 2 s ohne Antwort beim Prüfen | DIS-Übung: nächste Stufe der Reihenfolge (Landesquelle, sonst eben), Hinweis „Höhendienst nicht erreichbar, fliege auf …“. Ort laden: Fehlermeldung wie heute |
| Dienst antwortet mit Fehler-XML statt Bild | erstes Byte `<`, Text aus `ServiceException` | Meldung mit dem Text des Dienstes (wie heute `rwNet`, `src/realworld.js:104-108`) |
| TIFF mit mehreren Kanälen oder 8 Bit | `readTiff` wirft „Nur ein Kanal“ (`src/geo.js:23`) | Ebene gilt nicht als Höhenebene; nächste Kandidatin oder Auswahl im Formular |
| TIFF mit Deflate-Kompression (Tag 259 = 8) | `readTiff` wirft heute | Erweiterung in `readTiff`: Deflate mit `DecompressionStream` (Browser und Node 22, Bordmittel). Nur, wenn ein Dienst es braucht; k5.2 prüft das Tag |
| Rastergröße stimmt nicht | `t.w`, `t.h` gegen Anfrage | Kachel verwerfen, Meldung |
| Nur Füllwerte im Gebiet | alle Werte NaN oder unter minus 1000 | „Der Dienst hat für diesen Ort keine Höhen“ (wie `rwCheckSource`, `src/rwload.js:226`) |
| Chrome fragt nach dem lokalen Netz | `navigator.permissions` wie heute (`src/menu.js:338`) | Hinweis „Bitte Zulassen wählen“ |
| Gemischte Inhalte (Dienst auf anderem Rechner) | `fetch` wirft sofort „TypeError“ ohne Antwort, Adresse ist nicht localhost | Umschalten auf die Brücke (Abschnitt 3.4); ohne Brücke Hinweis „Dienst auf anderem Rechner: Brücke starten“ |
| Stillstand im Flug | `rwNet` bricht nach 30 s ab (`RW_STALL`), für lokale Dienste 15 s | Kachel 60 s später erneut (`RW_STREAM.retry`), Hinweis im Bild wie heute |

## 3 Automatische Aushandlung

### 3.1 Reihenfolge beim Startort „DIS-Übung“, Knopf „Dort fliegen“

Heute (`src/menu.js:393-402`): Kartendaten, wenn `rwPlan` eine Landesquelle findet, sonst ebene Fläche. Neu:

1. **WMS-Höhendienst** (Vorlage oder eigene Quelle mit `use: 'dis'` oder `'all'`), wenn die Aushandlung ihn gefunden hat. Mit Ergänzung aus der Landesquelle, wenn der Ort in einem Land mit Quelle liegt (W5, Entscheidung).
2. **Landesquelle** wie heute.
3. **Ebene Fläche** wie heute.

Die Meldungszeile nennt die gewählte Stufe. Der Nutzer kann in der WMS-Quelle `use` auf „nie“ stellen; dann gilt die alte Reihenfolge.

### 3.2 Was der Browser allein kann

- **Direkt prüfen:** `GET <url>?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0` für jede WMS-Quelle, zuerst die mit Adresse `localhost`, dann `127.0.0.1` als Ersatz (gesichert: beide gehen). Zeitgrenze 2 s je Adresse. Antwort als XML lesen (ohne Bibliothek, mit regulären Ausdrücken auf `<Layer>`, `<Name>`, `<Title>`, `<Format>`, `<CRS>`, `MaxWidth`, `MaxHeight`; wie `readLod2` arbeitet, `src/geo.js:153-179`).
- **Ebene wählen** (Abschnitt 3.3) und mit einem kleinen GetMap 16 x 16 als Gleitkomma-TIFF bestätigen (wie „Prüfen“ heute, `src/rwload.js:225-227`).
- **Wann:** beim Öffnen des DIS-Blocks einmal, dann alle 30 s, solange nichts gefunden ist, und beim Klick auf „Dort fliegen“ noch einmal, wenn das Ergebnis älter als 60 s ist. Das Ergebnis liegt in `rw.wms = { url, layer, title, via: 'direkt' | 'bruecke', t }` (Laufzeit, nicht gespeichert).
- **Grenzen:** Nur Adressen, die der Browser erreichen darf: `localhost`, `127.0.0.1`, https-Adressen. Andere Rechner im LAN gehen nur über die Brücke. Eine lokal geöffnete Datei (`file://`, Origin `null`) erreicht den Dienst nicht direkt, weil er nur unsere GitHub-Seite freigibt (gesichert); auch dann hilft die Brücke.

### 3.3 Höhenebene wählen

1. Kandidatinnen: Ebenen, deren Name oder Titel `hgt`, `elev`, `dem`, `height`, `hoehe` oder `höhe` enthält (Groß und Klein egal), ohne `rgb`, `rgba`, `shaded`, `ortho_photo`, `veg` im Namen. Reihenfolge wie in den Capabilities.
2. Format: `image/tiff` oder `image/geotiff` muss der Dienst für GetMap nennen.
3. Bestätigung: GetMap 16 x 16 in EPSG:4326 am Ort der Übung (oder in der Mitte des Gebiets der Ebene), `readTiff` liefert ein Einkanal-Gleitkommaraster mit mindestens einem gültigen Wert.
4. Keine Kandidatin: Die Quelle meldet „Höhenebene wählen“ und das Formular zeigt die Ebenenliste als Auswahl. Mehrere Kandidatinnen: die erste, die die Bestätigung besteht. Der Name der Ebene wird in `rw.wms.layer` gehalten und im Menü genannt, der Nutzer kann ihn in der Quelle festschreiben.

### 3.4 Was die Brücke braucht

Die Brücke läuft nur für DIS. Sie bekommt zwei Zusätze, beide in `.cmd` (PowerShell 5.1) und `tools/dis-bruecke.mjs` gleich:

**(a) Suche und Meldung.** Kandidaten in dieser Reihenfolge, je 2 s Zeitgrenze, alle 30 s wiederholt, solange nichts gefunden ist, und erneut, wenn neue Absender auftauchen:
1. Umgebungsvariable `FPVB_WMS` (vollständige Adresse, vom Nutzer gesetzt; Vorbild `FPVB_PORT`, `bruecke/fpv-dis-bruecke.cmd:15`).
2. `http://localhost:7071/ows` und `http://127.0.0.1:7071/ows`.
3. Absender-Adressen der empfangenen DIS-Pakete (UDP `remoteAddress`), je `http://<Adresse>:7071/ows`. Universell: Der Partner, der Einheiten sendet, hat wahrscheinlich auch das Gelände.
4. Nicht geplant: Kommandozeilen laufender Prozesse nach einem Schalter wie `-worldServer=` durchsuchen (Vorschlag k5.2). Das wäre Wissen über ein bestimmtes Programm in der Brücke; der Test verlangt „universell“ (`test/bruecke-ps.test.mjs:20`). Ersatz ist `FPVB_WMS` (Abschnitt 6).

Prüfung je Kandidat: GetCapabilities liefert 200 und enthält `WMS_Capabilities`. Mehr prüft die Brücke nicht; die Ebenenwahl macht der Browser. Meldung an jeden verbundenen Browser als Text:

```
{"t":"wms","url":"http://192.168.1.20:7071/ows","local":false,"relay":"http://localhost:8642/wms?u="}
```

`local: true` heißt: Der Browser kann die Adresse selbst holen. `relay` ist die Adresse des Durchreichens (b). Die Info-Nachricht bekommt `"version":3`. Der Browser nimmt eine `wms`-Meldung wie eine gefundene Quelle und prüft sie wie in 3.2 (direkt, wenn `local`, sonst über `relay`).

**(b) Durchreichen als HTTP, nicht als WebSocket.** Die Brücke hat schon einen HTTP-Server für den WebSocket-Aufbau (`tools/dis-bruecke.mjs:71`, `.cmd:29-33`, HttpListener). Neu beantwortet sie `GET /wms?u=<kodierte Zieladresse>`: Sie holt die Zieladresse mit GET und gibt Status, `Content-Type` und Inhalt zurück, mit `Access-Control-Allow-Origin: <Origin der Anfrage>`. Für den Browser ist das dann wieder ein Abruf auf `localhost`, also keine gemischten Inhalte, und unser Lade-Code bleibt derselbe (`get(url)` in `rwNet`); nur die Adresse wird vorangestellt.

Warum nicht über den WebSocket: Dort sind Binärrahmen DIS-PDUs (`src/verbund.js:137`). Kacheln müssten mit einer Kennung multiplexed werden, in PowerShell mit Teilstücken bis 64 KB (`.cmd:85`). HTTP ist einfacher, und `fetch` kann parallel laden und abbrechen.

**Sicherheit:**
- Der HTTP-Server hört weiter nur auf `127.0.0.1` beziehungsweise `localhost` (`tools/dis-bruecke.mjs:93`, `.cmd:31`).
- `Origin` muss in der Liste stehen wie beim WebSocket (`tools/dis-bruecke.mjs:51`, `.cmd:25`). Ohne `Origin` (direkt in die Adresszeile getippt) 403.
- Zieladresse nur aus der Liste gefundener oder per `FPVB_WMS` gesetzter Dienste (Host und Port müssen passen) und nur mit Pfad `?SERVICE=WMS`. Alles andere 403. So wird die Brücke kein offener Proxy.
- Nur GET, Antwort höchstens 20 MB, Zeitgrenze 20 s, höchstens 4 gleichzeitig, sonst 429.
- Keine Weitergabe von Cookies oder Headern des Browsers an das Ziel.

**Änderungen:** `tools/dis-bruecke.mjs` etwa 60 Zeilen (Suche mit `fetch` aus Node 22, Relais mit `http.request`), `.cmd` etwa 80 Zeilen (Suche mit `System.Net.WebClient` oder `HttpWebRequest` mit Timeout, Relais im Hauptschleifen-Takt; Abrufe asynchron als Task wie `ReceiveAsync`, damit der 10-ms-Takt bleibt, `.cmd:131`). ASCII-Regel bleibt (`tools/build.mjs:107`).

### 3.5 Zeitgrenzen (Zusammenfassung)

| Schritt | Grenze |
|---|---|
| GetCapabilities direkt oder über die Brücke | 2 s je Adresse |
| Bestätigung mit GetMap 16 x 16 | 3 s |
| Warten auf die Brücke nach dem Verbinden, bevor „kein Dienst“ gilt | 5 s |
| Wiederholung der Suche ohne Fund | 30 s |
| Kachelabruf im Flug, Stillstand | 15 s (lokal), sonst `RW_STALL` 30 s |
| Neuer Versuch nach einem Fehler | 60 s (`RW_STREAM.retry`) |

## 4 Menü

Grundsatz: keine neue Seite, kein neuer Knopf in der Hauptspalte. Alle vier Größen bleiben ohne Scrollen (1280 x 720, 1366 x 650, 960 x 540, 390 x 844). Richtwerte bei Zoom 1 wie in `docs/plan-taktischer-flug.md`: Titel mit Schrittzahl 40, Seg-Zeile 36, Hinweis 2 Zeilen 36, Eingabezeile 40, Nav 44, Listenknopf 48 je Zeile, Linkknopf 28. Engste Fläche 960 x 540: etwa 476 px bei Zoom 1, bis 660 px bei Zoom 0,72 (`fitPanel`, `src/menu.js:182-194`).

### 4.1 Verankerung A: Startort „DIS-Übung“ (automatisch, Anzeige der Quelle)

Der DIS-Block (`src/index.html:44-49`) bleibt in seiner Höhe. Die vorhandene Meldungszeile `rwMsg` (`src/index.html:55`), die heute „Start am Ort der Übung: …, ebene Fläche ohne Kartendaten.“ zeigt (`src/menu.js:119`), nennt das Gelände und bekommt einen kleinen Linkknopf wie „Geodaten importieren“ (`src/menu.js:250-252`):

```
Schritt 1 von 2: Taktischer Flug           (gleich im Parcours-Flug)
  Titel (40)
  Welt  [Spielkarte | Echte Welt]  (36)
  Modus: Aufklärung, Ziele Boden, Ziele Luft, Gemischt  (2 Zeilen, 96)
  Hinweis zum Modus (36)
  STARTORT                 Optionen ›          (24)
  [Monschau | Ort laden | DIS-Übung]           (36)
  Brücke läuft. Übung 1: 5 Einheiten bei …     (36)
  Port [3000]  Übung [1]  [Dort fliegen]       (40)
  Grundtypen ansehen ›                         (28)
  Start am Ort der Übung: 50.86, 7.14.         (54, bisher 36)
  Gelände: Höhendienst des Partners
  (localhost:7071, Blue_hgt, 2 m). Gelände ›
  [Zurück] [Weiter]                            (44)
  Summe etwa 506 px (heute etwa 488): Zoom etwa 0,94 bei 960 x 540. Passt.
```

Texte der Geländezeile (einfach, kurz):
- „Gelände: Höhendienst des Partners (localhost:7071, Blue_hgt). Nicht gespeichert.“
- „Gelände: Kartendaten NRW. Kein Höhendienst gefunden.“
- „Gelände: ebene Fläche. Kein Höhendienst, keine Kartendaten.“
- „Höhendienst auf anderem Rechner. Die Brücke reicht die Kacheln durch.“
- „Höhendienst gefunden, aber keine Höhenebene erkannt. Unter Gelände › wählen.“

„Gelände ›“ öffnet Optionen → Quellen → Formular der WMS-Quelle (Verankerung B). Der Zustand der Aushandlung läuft über `syncDis` (`src/menu.js:345-365`) mit, das sich ohnehin jede Sekunde erneuert.

### 4.2 Verankerung B: Optionen → Quellen → Quellenart „WMS-Höhendienst“

Die Liste unter „Quellen“ (`src/index.html:88-96`) zeigt die neue Vorlage „WMS-Höhendienst (lokaler Rechner) · Vorlage“ neben NRW. „Neu“ fragt zuerst die Art. Das Formular (`src/index.html:102-114`) bekommt oben eine Seg-Zeile „Art: [Landesdienste | WMS-Höhendienst]“ und zeigt je Art andere Felder. Für den WMS-Höhendienst ist es kürzer als heute:

```
Quelle bearbeiten                                       (40)
  Art  [Landesdienste | WMS-Höhendienst]                (36)
  Name            [WMS-Höhendienst (lokaler Rechner)]   (40)
  Adresse (WMS)   [http://localhost:7071/ows]           (40)
  Höhenebene      [automatisch ▾]  (Liste nach Prüfen)  (40)
  Höhenbezug      [Ellipsoid | Meereshöhe]              (36)
  Luftbildebene   [keine ▾]  (langsam)                  (40)   nur mit W5
  Gilt für        [DIS-Übung | Überall | Nie]           (36)
  Quellenvermerk  [Gelände des WMS-Höhendienstes]       (40)
  Hinweis: „Nicht gespeichert: Daten dieser Quelle      (36)
  bleiben im Arbeitsspeicher (Lizenz).“
  [Zurück] [Löschen] [Prüfen] [Speichern]               (44)
  Summe etwa 428 px, kleiner als das heutige Formular (etwa 470).
```

„Prüfen“ holt GetCapabilities, füllt die Ebenenlisten, wählt die Höhenebene automatisch, holt 16 x 16 und meldet: „Dienst: Blue Data Pipeline Web Map Service · Höhen: Blue_hgt, ok, 123,0 m über dem Ellipsoid (76,0 m NHN) · 0,4 s je Kachel“. Zahlen sind Beispiele.

Vorlage bedeutet: Ohne Eingriff gilt für die DIS-Übung „automatisch auf dem lokalen Rechner suchen“. Wer den Dienst anders nutzen will (anderer Port, anderer Rechner, „Überall“ für Ort laden), kopiert die Vorlage und ändert die Felder. Das ist dasselbe Muster wie bei NRW (`src/srcui.js:32`).

### 4.3 Verankerung C: „Ort laden“ (nur mit „Gilt für: Überall“)

Nichts Neues im Menü. `rwPlan` nimmt die WMS-Quelle, wenn sie „Überall“ gilt und keine Landesquelle vor ihr steht. Der Ladehinweis zeigt dann „Geladen: 50.86, 7.14 (Höhendienst), 0 Gebäude, 0 Bäume, nicht gespeichert.“ Die Deutschlandkarte sperrt „Laden“ heute außerhalb von Ländern mit Quelle (`docs/echte-welt.md`, L2); mit einer „Überall“-Quelle ist „Laden“ überall frei. Koordinaten außerhalb Deutschlands gehen über das Eingabefeld.

### 4.4 Hilfe

Einstellungen → Hilfe, Absatz „Echte Welt“ (`src/index.html:245`) bekommt einen Satz: „Ein WMS-Höhendienst (zum Beispiel vom DIS-Partner) kann das Gelände liefern: Optionen → Quellen.“

## 5 Etappen

Aufwand (Schätzung): S = unter einer Sitzung, M = eine Sitzung, L = zwei Sitzungen. Je Etappe: umsetzen, `npm run build`, `npm test`, Browser in vier Größen, committen, berichten, anhalten. Tests ohne VBS laufen gegen einen kleinen Node-WMS-Ersatz; die Prüfung mit dem echten Dienst macht k5.2 nach W2 und W3.

### WMS-Ersatz für Tests (Teil von W1)

`test/wms-ersatz.mjs` (nur Node-Bordmittel, `node:http`): antwortet auf GetCapabilities mit einem festen XML (Ebenen `Test_hgt`, `Test_hgt_rgba`, `Test_photo`, Formate wie beim Partner, MaxWidth 256) und auf GetMap `Test_hgt` mit einem unkomprimierten Einkanal-GeoTIFF (32-Bit-Gleitkomma, Tags 256, 257, 258, 259, 262, 273, 277, 278, 279, 339, 42113) einer bekannten Fläche, zum Beispiel `h = 100 + 2000·(lat − 50,9) + 1500·(lon − 7,0)` plus eine Welle. Prüft die BBOX-Reihenfolge (Breite zuerst) und `WIDTH`, `HEIGHT`. Kann auf Wunsch Fehler-XML, falsche Größe, Deflate oder langsame Antworten liefern. Ein TIFF-Schreiber dafür sind etwa 40 Zeilen. Der Ersatz dient auch den Brücken-Tests (W4).

| Nr. | Etappe | Ziel | Umfang | Dateien | Tests | Aufwand | Risiko |
|---|---|---|---|---|---|---|---|
| W1 | Leser und Umrechnung, ohne Menü | Aus einem WMS 1.3.0 in EPSG:4326 ein Höhenraster auf unserem UTM-Gitter | Neues Modul `src/rwwms.js` (ohne DOM): Capabilities lesen (`wmsCapsParse`), Höhenebene wählen (`wmsPickHeight`), geografisches Rechteck zum UTM-Quadrat (`geoBoxOf`), GetMap-Adressen mit richtiger Achsenreihenfolge (`wmsHgtUrl`), Kacheln holen und zusammensetzen, Umrechnung auf das Gitter (`resampleToUtm`, Stützgitter 17 x 17), Höhenbezug (`GEOID_FIX` in `geo.js`), Lücken füllen. Dazu der WMS-Ersatz | neu `src/rwwms.js`, `src/geo.js` (`GEOID_FIX`, optional Deflate), `src/verbund.js` (liest `GEOID_FIX`), neu `test/wms-ersatz.mjs` | neu `test/rwwms.test.mjs`: Capabilities des Ersatzes und ein Capabilities-Auszug mit den Ebenennamen des Partners (nur Namen, als Testdaten) richtig gelesen; Ebenenwahl trifft `*_hgt`, nicht `*_rgba`; BBOX Breite zuerst; Rechteck umschließt das gedrehte Quadrat; Raster 512² gegen die bekannte Fläche unter 0,1 m, Stützgitter gegen genaue Rechnung unter 1 cm; Kachelnähte ohne Sprung; Fehler-XML, falsche Größe, nur Füllwerte, Ellipsoid minus 47 | S bis M | gering. Achsenreihenfolge und Konvergenz sind die Fallen, der Test deckt beide |
| W2 | Quelle und Laden | WMS-Quelle als Quellenart, Laden von Startgebiet, Umgebung und Kacheln, nichts speichern, Formular | `rwSourcesParse`, `rwCheckSource`, `rwFetchArea`, `rwFetchFar` mit `fetchHeights` (WCS oder WMS); `rwSourceAt` mit `box: null`; `rwPlan` mit UTM-Zone aus der Länge und WMS-Quellen „Überall“; `store: false` in `rwLoadLive`, `rwLoadTile`, `rwLoadFar`; Werkzeug lehnt WMS ab; Formular mit Art-Schalter, Ebenenlisten, Höhenbezug, Gilt für; Vorlage in `RW_SOURCES`; Boden ohne Luftbild = Schattierung mal Gras; `rwwms.js` in `WK_MODS` | `src/rwload.js`, `src/realworld.js`, `src/rwthread.js`, `src/rwworker.js`, `src/srcui.js`, `src/index.html`, `src/style.css`, `src/render.js` (Schattierung), `tools/realworld.mjs`, README | `test/rwload.test.mjs` (Quelle lesen und ablehnen, `rwCheckSource` gegen den Ersatz), `test/realworld.test.mjs` (Plan außerhalb Deutschlands, Laden gegen den Ersatz, Speicher-Attrappe zählt 0 `put`, Umgebung und Kachel vom Ersatz), `test/rwworker.test.mjs` (Worker-Quelle enthält `rwwms.js`), `test/build.test.mjs` | M | mittel. Viele kleine Stellen im Ladeweg; die Monschau-Dateien müssen Byte für Byte gleich bleiben (`git status realworld/` leer) |
| W3 | Aushandlung im Browser und DIS-Startort | „Dort fliegen“ nimmt automatisch den Höhendienst, Anzeige der Quelle, Rückfall | `wmsProbe(urls, get, ms)` in `rwwms.js`; `rw.wms` als Laufzeitzustand; Suche alle 30 s im DIS-Block; Reihenfolge Höhendienst, Landesquelle, eben in `disHere`; Geländezeile mit „Gelände ›“; Hilfe-Satz; Doku | `src/rwwms.js`, `src/menu.js`, `src/index.html`, `docs/echte-welt.md`, `docs/dis-abschluss.md` (Vermerk: Gelände kommt doch, universell), `docs/PLAN.md` | `test/rwwms.test.mjs` (Probe: zwei Adressen, eine tot, Zeitgrenze, Ergebnis nennt Ebene), Browser: DIS-Ersatz aus `test/verbund.test.mjs` plus WMS-Ersatz auf Port 7071, Weg Taktischer Flug → Echte Welt → DIS-Übung → Dort fliegen, vier Größen. Danach k5.2 mit dem echten Dienst: Drohne gelandet in VBS sichtbar, Höhenunterschied zu den Einheiten unter 0,3 m (Ziel) | M | mittel. Das Zusammenspiel von Suche, Menüzustand und Laden; der Hinweis muss in jeder Lage stimmen |
| W4 | Brücke: Suche und Durchreichen | Dienst auf einem anderen Rechner im LAN | Suche (`FPVB_WMS`, localhost, DIS-Absender), Meldung `{"t":"wms",...}`, `GET /wms?u=` mit Origin-Prüfung, Ziel-Liste, Grenzen; `info` Version 3; Browser nutzt `relay`, wenn `local` falsch ist oder der direkte Abruf scheitert | `tools/dis-bruecke.mjs`, `bruecke/fpv-dis-bruecke.cmd`, `src/verbund.js` (Meldung lesen, `vb.wms`), `src/menu.js`, `docs/dis-bruecke.md` | `test/bruecke.test.mjs` (Suche findet den Ersatz, Relais liefert die Kachel byteweise gleich, fremde Ziele 403, fremde Origin 403, zu groß abgebrochen), `test/bruecke-ps.test.mjs` (dasselbe mit PowerShell, übersprungen ohne `pwsh`), ASCII-Regel | M bis L | mittel bis hoch. PowerShell 5.1: HTTP-Abrufe asynchron im 10-ms-Takt, Zeitgrenzen, Fehler ohne Absturz der Brücke. Zweiter Rechner ist nie geprüft (`docs/dis-abschluss.md`, offene Fragen) |
| W5 | Ergänzungen (je nach Entscheidung) | Gebäude, Bäume und Luftbild aus der Landesquelle über dem Partner-Gelände; optional grobes Luftbild des Dienstes | Zusammengesetzte Quelle in `rwPlan`; `findTrees` mit Landes-DGM; Luftbild-Schalter 512² nur Startgebiet | `src/realworld.js`, `src/rwload.js`, `src/rwwms.js`, `src/srcui.js`, `src/index.html` | `test/realworld.test.mjs` (zusammengesetzte Quelle: Höhen vom Ersatz, Gebäude aus der Testquelle, Bäume nicht aus dem Geländeunterschied), Browser in Köln mit k5.2 | M | mittel. Versatz der Gebäude bis 0,8 m; Luftbild sehr langsam |

### Begründung der Reihenfolge

- **W1 zuerst und klein:** Die Umrechnung ist der fachliche Kern und ohne Netz testbar. Der WMS-Ersatz trägt alle weiteren Tests. Noch nichts im Menü, kein Risiko für den heutigen Ablauf.
- **W2 vor W3:** Erst muss Laden mit einer von Hand eingetragenen Quelle gehen („Ort laden“ mit „Überall“). Das ist der universelle Fall und reicht schon für einen ersten Test mit dem echten Dienst durch k5.2.
- **W3 bringt den Nutzen für die DIS-Übung** ohne Brücken-Änderung, weil der gemessene Aufbau (ein Rechner) direkt geht.
- **W4 zuletzt unter den Pflichtteilen:** Nur nötig für zwei Rechner, und die Brücke ist der schwierigste Teil (PowerShell). Wenn der Nutzer immer auf einem Rechner arbeitet, kann W4 warten.
- **W5 nach Entscheidung** des Nutzers (Abschnitt 6).

### Prüfliste für k5.2 mit dem echten Dienst (nach W2 und W3)

1. Tag 259 (Kompression) und 339 (Format) einer `Blue_hgt`-Kachel nennen. Erwartet: 1 und 3.
2. Auflösung von `Blue_hgt` am Inset messen (256² gegen 1024² für 1 km).
3. GetCapabilities: `MaxWidth`, `MaxHeight`, Ebenenliste als Datei an uns (nur Namen und Titel).
4. Nach W2: Ort laden mit einer Quelle „Überall“ bei Köln (50.86, 7.14): Ladezeit, Bild, Höhe am Startplatz gegen `Blue_hgt` an derselben Stelle.
5. Nach W3: DIS-Übung am Inset, Drohne landen, Höhenunterschied zu einem Fahrzeug daneben (Ziel unter 0,3 m), Drohne in VBS sichtbar.
6. Nach W4: World Server auf einem zweiten Rechner, Brücke auf dem Browser-Rechner, Kacheln kommen durch.

## 6 Offene Entscheidungen für den Nutzer (mit Vorschlag)

1. **Lizenz und Speichern.** Die Geländedaten des Dienstes sind Herstellerdaten. Vorschlag: nur im Arbeitsspeicher, kein Speichern im Browser, kein Export, kein Einbetten (`store: false`, fest für die Quellenart). Wenn der Hersteller mehr erlaubt, kommt später ein Schalter „Speichern erlaubt“ an die Quelle.
2. **Luftbild des Dienstes.** 5,6 s je Kachel ist zu langsam für unsere Schärfe. Vorschlag: nein. Boden aus Schattierung der Höhen mal Grasbild. Später optional grob 512² nur für das Startgebiet (etwa 22 s, Schätzung), als Schalter in der Quelle (W5).
3. **Gebäude und Bäume.** Der Dienst hat keine. Vorschlag: aus der Landesquelle, wenn der Ort in einem Land mit Quelle liegt (W5), mit Luftbild der Landesquelle; Versatz bis 0,8 m in Kauf nehmen. Sonst nur Relief. Alternative: immer ohne, dann entfällt W5.
4. **Dienst auf einem anderen Rechner (Mixed Content).** Vorschlag: Durchreichen über die Brücke als HTTP-Relais mit Ziel-Liste (W4). Alternative: nicht bauen, nur ein Rechner wird unterstützt; dann entfällt W4.
5. **Prozess-Kommandozeilen durchsuchen (Vorschlag k5.2, Schalter `-worldServer=`).** Vorschlag: nein, weil das Wissen über ein bestimmtes Programm in die Brücke bringt und der Test „universell“ verlangt. Ersatz: Umgebungsvariable `FPVB_WMS` mit der Adresse und die Absender-Adressen der DIS-Pakete.
6. **Höhenbezug.** Vorschlag: feste Geoidhöhe 47 m (Schätzung) als `GEOID_FIX`, Wahl „Ellipsoid“ oder „Meereshöhe“ je Quelle. Für DIS kürzt sich der Wert heraus. Geoid je Ort (GCG2016) erst, wenn Gebäude aus NRW auf dem Partner-Gelände sichtbar falsch stehen.
7. **Automatische Ebenenwahl.** Vorschlag: Name oder Titel mit `hgt`, `elev`, `dem`, `height`, `hoehe`, `höhe`, ohne `rgb`, `shaded`, `photo`, `veg`; bestätigt mit einem 16 x 16 GetMap als Gleitkomma-TIFF. Sonst Auswahl im Formular.
8. **Gilt für.** Vorschlag: Die Vorlage gilt nur für die DIS-Übung. „Überall“ (auch Ort laden, Orte außerhalb Deutschlands) stellt der Nutzer in einer Kopie ein.
9. **Auflösung.** Vorschlag: unsere Gitter beibehalten (2 m im Gebiet, 25 m Umgebung). Nach der Messung von k5.2 (Prüfliste Punkt 2) gegebenenfalls 5 m im Gebiet, wenn der Dienst grob ist. Das spart Abrufe (1 Kachel statt 9).
10. **Umfang.** Vorschlag: W1 bis W3 bauen, danach Test mit k5.2, dann über W4 und W5 entscheiden.

## 7 Was nicht geplant ist

- Übernahme des Rasters des Dienstes als eigenes Gitter (wir tasten ab).
- Ebenen `Blue_hgt_rgba`, `Blue_ortho_height*` (Kodierung unbekannt).
- WFS des Dienstes (antwortet 500).
- Änderungen an VBS oder an seinem Gateway.
- Speichern, Export oder Einbetten von Daten des Dienstes.
- Weitere DIS-Funktionen (Regel aus `docs/dis-abschluss.md`). Das Gelände ist eine Funktion der echten Welt, nicht von DIS; DIS nutzt sie nur.
