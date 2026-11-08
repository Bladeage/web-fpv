# DIS-Abschluss als Proof of Concept (Planung 08.11.2026, Fable)

Nur Planung, kein Code. Der Nutzer (08.11.2026, Prompt 161): „DIS war ein Proof of concept.“ An VBS wird nichts geändert (Prompt 158, 160). DIS bleibt universell (Prompt 145). Dieses Dokument legt fest, was im Produkt bleibt, wie es gekennzeichnet wird, welche Grenzen gelten und wie ein Test mit VBS geht. Die Umsetzung ist Etappe T1 in `docs/plan-taktischer-flug.md`.

Einstufung: **gesichert** = gemessen oder im Code gelesen (Fundstelle in `docs/dis-drohne.md`, Abschnitt genannt). **vermutet** = nicht geprüft.

## Was erreicht ist (gesichert)

- Eigene Drohne erscheint beim DIS-Partner (VBS4 26.1.3) als Einheit „FPV1“, mit Ort, Lage, Tempo, Zustand (fliegt, zerstört, eingefroren, abgemeldet). Abschnitte D4, D5, „Erfolg mit VBS als Host“.
- Einheiten des Partners erscheinen bei uns als 18 Grundtypen mit Seite, Name, Zustand, Turm und Rohr, Mündungsfeuer, Leuchtspur, Einschlag. Abschnitte „Waffen, Turm und Rohr“, „Turmtest mit Fabian“.
- Beschuss durch einen Schützen des Partners trifft unsere Drohne (Geschossweg mit Fall und Streuung, Detonation in der Nähe). Abschnitt „Beschuss und Wirkmittel“.
- Flug am Ort der Übung mit Kartendaten (NRW) oder ebener Fläche. Höhenbezug stimmt bis auf Dezimeter (Inset aus NRW-Höhen). Abschnitt „Ursache des Höhenunterschieds“.
- Brücke für Windows als eine Datei, Download im Menü, keine Installation. Abschnitt „Windows-Brücke und DIS-Modus“, D5.
- Alles ohne Änderung an VBS und ohne VBS-Bezug im Code.

## Was bleibt, was geht

### Im Produkt (Menü)

- DIS bleibt wählbar, in beiden Flugarten: Schritt 1 → Welt „Echte Welt“ → Startort **„DIS-Übung (experimentell)“** neben Monschau und Ort laden (im Code ist das heute schon `cfg.rwSrc === 'dis'`). Darunter wie heute: Zustand der Brücke, Download, Port, Übung, „Dort fliegen“. Im Parcours-Flug sind die Einheiten des Partners nur zu sehen; im Taktischen Flug sind sie Ziele der Wirkmittel (Menüweg nach Prompt 162, siehe `docs/plan-taktischer-flug.md`, Abschnitt 1).
- Kennzeichnung im Hinweistext des Startorts (ein Satz, einfach): „Experimentell. Die Drohne erscheint beim DIS-Partner, seine Einheiten hier. Geprüft mit VBS4 26.1.3. Der Partner übernimmt keinen Schaden aus unserer Sprengladung, seine KI greift die Drohne nicht an.“
- Hilfe (Einstellungen → Hilfe): ein Absatz „DIS (experimentell)“ mit dem Verweis auf die Kurzanleitung unten (Dateiname im Repo), weil die Anleitung nicht ins Menü passt.
- Vorschau „DIS-Grundtypen“: aus der Modus-Liste heraus. Erreichbar über einen kleinen Knopf „Grundtypen ansehen“ im DIS-Block (Vorschlag). Alternative: ganz aus dem Menü, Modul und Tests bleiben.
- Option „DIS: Einheiten ohne neue Meldung behalten“ bleibt unter Optionen → Daten (für Partner, die nur beim Anlegen senden).
- OSD „DIS n“ bleibt.

### Im Code

Bleibt alles, weil es klein ist, getestet ist und ohne Partner nicht stört:
- `src/dis.js` (Kodierer, 236 Zeilen), `src/distypes.js` (Grundtypen, 161), `src/verbund.js` (Verbund, 297), `bruecke/fpv-dis-bruecke.cmd`, `tools/dis-bruecke.mjs`.
- Tests: `test/dis.test.mjs`, `test/distypes.test.mjs`, `test/verbund.test.mjs`, `test/bruecke.test.mjs`, `test/bruecke-ps.test.mjs`.
- Nichts wird gelöscht. Was den Wirkmitteln dient (Explosion im Bild, Kontakt-Kasten, Treffer an der Drohne), wird in Etappe T2 vom Verbund gelöst und allgemein (`game.fx` statt `vb.fx`), der Verbund nutzt dann die allgemeine Fassung.
- Regel ab jetzt: keine neuen DIS-Funktionen, nur Fehlerbehebung, wenn der Nutzer sie meldet. Ausnahme: der Test „Wirkmittel als Munitions-Einheit“, falls der Nutzer ihn wünscht (siehe offene Fragen).

### In der Doku

- `docs/dis-drohne.md`: bleibt die Referenz (Konzept, Messungen D4 bis D8, Höhen, Waffen, Grenzen). Oben ein Vermerk: „Stand als Proof of Concept abgeschlossen am 08.11.2026, siehe `docs/dis-abschluss.md`.“
- `docs/dis-bruecke.md`, `docs/vbs-anfrage.md`: Verlauf, bleiben unverändert.
- `docs/taktischer-flug.md` (Entwurf k5.2): Verlauf; der Plan ist jetzt `docs/plan-taktischer-flug.md`. Die DIS-Schritte 4 (Wirkung über DIS) und 5 (Gelände per WMS über die Brücke) entfallen.
- README: Zeilen zu `dis.js`, `distypes.js`, `verbund.js`, Brücke mit dem Zusatz „experimentell“. Im Abschnitt „Was es gibt“ der Übergabe ebenso.
- `docs/PLAN.md`: ein Eintrag „DIS als Proof of Concept abgeschlossen (Prompt 161)“ mit Verweis hierher.

### Nicht mehr gebaut

- Wirkung unserer Sprengladung in VBS (kein Weg ohne Eingriff in VBS, Entscheidung des Nutzers).
- Angriff der VBS-KI auf die Drohne (gleicher Grund).
- Gelände per WMS über die Brücke (Schritt 5 des Entwurfs).
- Lagebild-Modul und alles mit VBS-Bezug (schon mit Prompt 145 entfernt).
- Weitere PDU-Arten (Designator, Emission, IFF), HLA, WebLVC.

## Einschränkungen heute (gesichert, Fundstelle in `docs/dis-drohne.md`)

| Nr. | Einschränkung | Fundstelle |
|---|---|---|
| 1 | Die VBS-KI greift unsere Drohne nicht an, auch nicht als echtes Objekt (LightweightMode 0, RemoteGroundClampingDisabled 1). Nur ein Mensch in VBS oder ein Skript kann schießen. | „Beschuss und Wirkmittel“ (Ergebnis k5.2), „Native Wege im VBS-Gateway“ |
| 2 | VBS übernimmt keinen Schaden aus fremden Detonation-PDUs (geprüft mit unserer Munition, mit VBS-Munition 120 mm, mit Fire plus Detonation, mit echten VBS-Detonationen und fremdem Schützen). Hilfe: „Remote Mapped Ballistics are not tracked“. | „Beschuss und Wirkmittel“, „Native Wege“ |
| 3 | Das Gateway sendet nur im Mehrspieler auf dem Host (`-gateway`). Im Einzelspieler kommt je Einheit nur eine PDU oder ein eingefrorener Herzschlag. | D8 (Korrektur), D5 bis D7 gelten nur für den Einzelspieler |
| 4 | Gesendet werden nur Klassen mit SISO-Wert in der Gateway-Zuordnung. Im Test fehlten der Spieler und die Besatzungsklasse. Mitfahrer außer dem Fahrer sendet das Gateway nie. | D6, D7, D8 |
| 5 | Personen aus dem Editor melden im Einzelspieler einen Platzhalter-Ort mit falscher Höhe. Wir übergehen Platzhalter (gleicher Punkt, Boden mehr als 100 m unter den übrigen). | D5, D6, „Robuster DIS-Modus“ |
| 6 | Höhen: Die VBS-Standardkarte liegt am Flughafen Köln/Bonn 2,2 m über dem NRW-Gelände; VBS rechnet mit ortsabhängiger Geoidhöhe (47,00 bis 47,25 m), wir mit fest 47 m (NRW 42,5 bis 48,5 m). Eine gelandete Drohne kann in VBS unter dem Boden liegen. Auf einem Inset aus NRW-Höhen passt es bis 0,6 m. | „Ursache des Höhenunterschieds“, „Höhenmessung mit gelandeter Drohne“ |
| 7 | Ohne Gelände in VBS (kein World Server) fallen Objekte endlos; wir filtern sie über Höhe und Tempo-Grenze (Boden 150 m/s, Luft 1000 m/s, Schätzung). | „Erfolg mit VBS als Host“, `docs/taktischer-flug.md` Schritt 1 |
| 8 | VBS pausiert ohne Fenster-Fokus. Auf einem Rechner mit dem Browser: VBS mit `-forceSimul` starten. | „Turmtest mit Fabian“ |
| 9 | Browser: Chrome fragt nach dem Zugriff auf das lokale Netz; bis zur Antwort hängt die Verbindung. Eingebettete Browser (Claude-App) blockieren localhost von https-Seiten. Ein Browser sieht nur, ob die Brücke läuft, nicht ob sie installiert ist. | D4, „Windows-Brücke und DIS-Modus“ |
| 10 | Unsere Drohne erscheint in VBS nur, weil ihr Typ 1.2.78.50.7.0.0 genau in der Zuordnung steht (Mikado-Modell). Kein taktisches Symbol (Warnung in VBS). Per SQF in VBS nicht auffindbar. | „Weg der Daten“ (Fuzzy aus), „Mitschnitt und Port-Probe“, D4, D6 |
| 11 | Grundtypen: Kategorie trennt Kette und Rad nicht; Aufklärung, Pionier, Raketenwerfer nur mit lokaler Tabelle (nie im Repo). Unbekanntes wird ein Quader. | „Was wir empfangen“, „VBS-Grundtypen“ |
| 12 | Nur DIS 6 gesendet (7 wird gelesen), nur Entity State, Fire und Detonation. Löschen nach 13 s (wie das Gateway). | D1, „Was wir empfangen“ |
| 13 | Brücke und Partner auf einem Rechner: Im Einzelspieler-Test ging Senden erst mit AllowLoopback 1 (07.11.); als Host ging es mit AllowLoopback 0 (D8, Test des Nutzers). Ein zweites Programm auf Port 3000 braucht Port-Mitbenutzung (reuseAddr), die Brücke macht das. | „Mitschnitt und Port-Probe“, D8 |
| 14 | Unsere Detonation trägt keine Munitions-Kennung (0/0/0) und keinen Ort in Zielkoordinaten (0), und es geht keine Fire-PDU voraus. | im Code: `src/verbund.js:215-224`, `src/dis.js:146-154` |

## Kurzanleitung: DIS-Test mit VBS (aus den Messungen k5.2 und des Nutzers)

Voraussetzung: VBS4 mit Gateway (DIS-Adapter, DIS 6, Broadcast, Port 3000, Übung 1), Windows-Rechner, Chrome oder Edge.

1. **VBS starten als Host eines Mehrspieler-Szenarios** mit `-gateway`. Läuft der Browser auf demselben Rechner, zusätzlich `-forceSimul` (sonst pausiert VBS ohne Fokus). Nicht im Einzelspieler testen (Einheiten frieren ein).
2. **Karte mit echten Höhen:** ein Gelände, dessen Höhen zu den Geobasisdaten passen (Inset aus NRW-Höhen, zum Beispiel Köln). Auf der VBS-Standardkarte liegt unser Boden am Flughafen etwa 2,2 m tiefer; die gelandete Drohne ist dann in VBS nicht sichtbar.
3. **Einheiten im Szenario** nur mit Klassen, die einen SISO-Wert haben (sonst werden sie nicht gesendet). Fahrer ja, Mitfahrer werden nicht gesendet.
4. **Simulator öffnen** (https://bladeage.github.io/web-fpv/), Parcours-Flug oder Taktischer Flug → Welt „Echte Welt“ → Startort „DIS-Übung“. Zeigt das Menü „Brücke nicht gefunden“: Knopf „Brücke für Windows herunterladen“, Datei `fpv-dis-bruecke.cmd` doppelklicken. Windows fragt „Datei öffnen, Sicherheitswarnung“: „Ausführen“. Fenster offen lassen.
5. **Chrome-Freigabe:** Chrome fragt „Zugriff auf Geräte im lokalen Netz“: „Zulassen“. Wurde es abgelehnt: links neben der Adresse die Website-Einstellungen öffnen und erlauben. Bis zur Antwort steht „Brücke nicht gefunden“ oder „wartet“.
6. **Port und Übung** prüfen (3000, 1). Das Menü zeigt „Übung 1: n Einheiten bei Breite, Länge“. Zeigt es „Noch keine Einheiten“: VBS hat den Fokus verloren (Schritt 1) oder sendet nicht (Schritt 3).
7. **„Dort fliegen“:** lädt die Kartendaten des Übungsorts (NRW) oder eine ebene Fläche und startet. OSD zeigt „DIS n“ und die Koordinaten. In VBS erscheint „FPV1“ (Freund, Mikado-Modell).
8. **Prüfen:** Einheiten im Bild mit Namen und Abstand; Turm und Rohr folgen; Schüsse mit Mündungsfeuer und Leuchtspur; Beschuss der Drohne (Treffer, Abschuss) nur durch einen Menschen oder ein Skript in VBS; Sprengladung zündet bei Kontakt mit einer Einheit (nur Bild und PDU, in VBS kein Schaden).
9. **Beenden:** Tab schließen, VBS löscht FPV1 nach unter einer Sekunde; Brücke beenden, VBS löscht nach 13 s.

Zum Entwickeln ohne Windows: `node tools/dis-bruecke.mjs` ist dieselbe Brücke; ein DIS-Ersatz steht in `test/verbund.test.mjs`.

## Offene Fragen

### Frage des Nutzers: Warum übertragen zwei VBS-Clients über DIS Schaden und Explosionen, wir aber nicht?

Gesichert ist nur: VBS hat aus unseren Detonation-PDUs, aus nachgespielten VBS-Detonationen mit fremdem Schützen und aus Fire plus Detonation keinen Schaden übernommen („Beschuss und Wirkmittel“, „Native Wege“). Ob zwei VBS-Clients untereinander Schaden wirklich über DIS austauschen, ist nicht gemessen. Alles Folgende ist **vermutet**:

1. **Zwei VBS-Clients in einer Sitzung reden nicht über DIS, sondern über das eigene VBS-Netz (Host und Clients).** Schaden und Explosionen laufen dann intern über den Host. DIS dient nur dem Austausch mit fremden Programmen am Gateway. Wenn der Nutzer Schaden zwischen zwei VBS-Clients sieht, kann das vollständig ohne DIS geschehen. Das wäre die einfachste Erklärung.
2. **Zwei getrennte VBS-Hosts mit je eigenem Gateway:** Falls die Beobachtung so war, dann sendet VBS vermutlich mehr als eine Detonation-PDU: Fire-PDU, dann die Munition als eigene Einheit (Entity State, Art 2; k5.2 hat gesehen, dass Geschosse sich kurz als Einheit melden) und zuletzt die Detonation mit derselben Ereignis-Nummer. Das Gateway „verfolgt“ nur Munition, die als eigene Einheit mit zugeordnetem Typ ankommt („Remote Mapped Usable ammunition is tracked until detonation“). Unsere Sprengladung sendet nur die Detonation ohne Munitions-Einheit und ohne Munitions-Kennung (Einschränkung 14). Das ist der Kandidat „Wirkmittel als Munitions-Einheit“ aus „Native Wege“.
3. **Zielangabe:** Zwischen zwei VBS-Gateways ist das Ziel eine Einheit, die der Empfänger selbst besitzt, mit Treffer-Ort in Zielkoordinaten und Ergebnis-Code aus VBS. Wir senden Ziel-Kennung und Ergebnis 1, aber den Ort in Zielkoordinaten als 0. Ob das Gateway diesen Ort braucht, ist offen.
4. **Munitionstyp:** VBS rechnet Schaden nur für Munitionstypen, die es in seiner Zuordnung kennt (Gefechtskopf und Zünder wertet es laut Hilfe nicht aus). Unser Typ 2.2.0.0.0.0.0 ist allgemein; k5.2 hat aber auch die VBS-eigene 120-mm-Munition ohne Erfolg probiert. Das spricht gegen diese Ursache allein.
5. **Besitzer der Einheit:** Vielleicht nimmt das Gateway Schaden nur von einem Schützen an, den es als bekannte fremde Einheit führt und dessen Fire-PDU es vorher gesehen hat, mit passender Ereignis-Nummer. k5.2 hat Fire plus Detonation probiert; ob die Ereignis-Nummern und Zeitabstände wie bei VBS waren, ist nicht dokumentiert.

**Test, der es klären würde** (nur mit Freigabe des Nutzers, nichts an VBS ändern):
- Zwei VBS-Hosts, jeder mit `-gateway`, in getrennten Sitzungen, so dass sie sich nur über DIS sehen (verschiedene Mehrspieler-Sitzungen, gleiche Übung und gleicher Port). Host A schießt auf eine Einheit von Host B. Mitschnitt der PDUs auf Port 3000 (k5.2 kann das lokal), dabei prüfen: Wird in B Schaden angezeigt? Welche PDUs gehen von A aus, in welcher Reihenfolge und mit welchen Kennungen (Schütze, Ziel, Munitions-Einheit, Ereignis), welchem Munitionstyp, welchem Ort in Zielkoordinaten und welchem Ergebnis-Code?
- Zeigt B keinen Schaden: Ursache 1 bestätigt, das Thema ist erledigt.
- Zeigt B Schaden: Unsere PDUs byteweise mit dem Mitschnitt vergleichen; dann ist der Unterschied messbar (vermutlich die Munitions-Einheit, Ursache 2). Danach entscheidet der Nutzer, ob der Simulator das nachbaut. Das wäre ein kleiner Zusatz in `verbund.js` (Fire-PDU, eine kurze Munitions-Einheit, Detonation) ohne Änderung an VBS.

### Weitere offene Fragen

- Soll der Test „Wirkmittel als Munitions-Einheit“ noch gemacht werden (ohne Änderung an VBS)? Vorschlag: nur zusammen mit dem Mitschnitt oben, sonst nicht.
- Geoidhöhe fest 47 m oder je Ort gerechnet (BKG-Modell GCG2016 einbetten, grob als Raster)? Vorschlag: so lassen; Abweichung unter 0,3 m in NRW, DIS ist experimentell.
- Ebene Fläche: Bodenhöhe aus dem Median der Fahrzeuge oder aus dem unteren Rand (Vorschlag k5.2)? Vorschlag: so lassen.
- Mehrere Rechner (Brücke auf einem Nachbarrechner): nicht geprüft. Vorschlag: offen lassen, die Brücke hört nur auf localhost.
- Andere DIS-Partner als VBS: nie geprüft. Vorschlag: im Menütext „geprüft mit VBS4 26.1.3“ stehen lassen.

## Abschluss-Etappe (T1 in `docs/plan-taktischer-flug.md`)

Umfang des DIS-Anteils in T1:
1. Menü: DIS als Startort „DIS-Übung (experimentell)“ in der echten Welt, in beiden Flugarten; Hinweistext mit den zwei Grenzen (KI greift nicht an, kein Schaden beim Partner); „Grundtypen ansehen“ als kleiner Knopf im DIS-Block, Vorschau aus der Modus-Liste.
2. Hilfe: Absatz „DIS (experimentell)“ mit Verweis auf dieses Dokument.
3. Doku: Vermerk oben in `docs/dis-drohne.md`, README-Zeilen „experimentell“, Eintrag in `docs/PLAN.md`, Übergabe ergänzen.
4. Tests: alle DIS-Tests bleiben; Prüfung im Browser mit `node tools/dis-bruecke.mjs` und DIS-Ersatz, dass der Weg Flugart → Echte Welt → DIS-Übung → „Dort fliegen“ in beiden Flugarten geht; vier Größen.
5. Kein Code-Abbau. Danach gilt: keine neuen DIS-Funktionen ohne Auftrag des Nutzers.

Aufwand: S (im Rahmen von T1). Risiko: gering; gespeicherte Einstellungen mit `cfg.verbund = true` müssen auf den Startort `cfg.rwSrc = 'dis'` und `cfg.world = 'real'` abgebildet werden.
