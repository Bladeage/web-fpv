# Unsere Drohne in VBS4: Konzept (Stand 07.11.2026, Prompt 133, mit Antworten von k5.2 Runde 2)

Nur Planung, noch kein Code. Grundlage: Recherche zu SISO-REF-010, DIS 7 und Höhenbezug sowie die Antworten von k5.2 (`docs/dis-bruecke.md`).
Einstufung: **gesichert** = in der Quelle gelesen (Quellen am Ende). **vermutet** = nicht selbst geprüft.

Werte für Entity Type, Force ID, Dead Reckoning und Appearance stammen aus SISO-REF-010 v37 (25.05.2026). Reprinted with permission from SISO Inc.

## Weg der Daten

```
Simulator (Browser) --WebSocket, JSON, bis 30/s--> Brücke (Node, nur Bordmittel) --DIS 6 (oder 7), UDP--> VBS Gateway --> VBS4
```

- Der Simulator kennt nur seine Kartenkoordinaten (Mitte des Gebiets, x Osten, z Süden, y Höhe über dem Start). Daraus rechnet er Breite, Länge und Höhe über NHN (das kann er schon für das OSD).
- Die Brücke rechnet in Erdkoordinaten (ECEF) um, baut die Entity State PDU und sendet sie per UDP. Sie empfängt auch die PDUs von VBS und gibt sie als JSON an den Browser.
- Warum eine Brücke: Ein Browser kann kein UDP senden (gesichert, Web-Plattform). Die Brücke läuft auf dem Rechner neben dem Browser.

## Was wir senden: Entity State PDU

144 Byte, Netzwerk-Bytefolge (gesichert aus freiem Quelltext open-dis; die Norm IEEE 1278.1-2012 ist nicht frei, nicht gelesen).

| Feld | Unser Wert |
|---|---|
| Protokollversion | **6**, so wie das Gateway eingestellt ist (gesichert, k5.2; einstellbar 4 bis 7). Der Kodierer kann 6 und 7 (gleiche Länge; Byte 10 ist bei 7 der PDU-Status, bei 6 ein Füllbyte). Beim Empfang beide annehmen |
| Übungsnummer, Site, Application | Exercise **1** (wie VBS), Site **1**, Application **200** (eigene, nur nicht die von VBS; Vorschlag k5.2) |
| Force ID | 1 = Freund (einstellbar: 2 Feind, 3 neutral) |
| Entity Type | **1.2.78.50.7.0.0**: Plattform, Luft, Deutschland, unbemannt, AirRobot AR 100-B. In den VBS-Configs genau einer Klasse zugeordnet, einem UAV-Hubschrauber (gesichert, k5.2; die .dbo-Dateien des Gateways nicht geprüft). Rückfall: **1.2.0.50.0.0.0** (häufigster Wert der UAV-Hubschrauber, dann wählt VBS eine von mehreren Klassen, vermutet). 1.2.0.50.1.0.0 hat in VBS keine Klasse |
| Ort | X, Y, Z in Metern, geozentrisch (ECEF, WGS84) |
| Geschwindigkeit | m/s in ECEF |
| Lage | psi, theta, phi in Radiant, bezogen auf ECEF |
| Dead Reckoning | 4 = RVW (Lage dreht mit, Weg mit Beschleunigung, Weltachsen). VBS sendet selbst 4 für Plattformen (gesichert, k5.2); eingehend glättet das Gateway (Fenster 0,1 s) |
| Marking | „FPV1“ (ASCII, 11 Zeichen) |
| Appearance | siehe Zustände |

Wichtig (gesichert, k5.2): Eine Drohne erscheint in VBS nur, wenn ihr 7er-Wert **genau** in der Zuordnung steht. Unscharfe Zuordnung (Fuzzy Mapping) ist aus, und „Show Unknown Entities“ ist aus: Eine unbekannte Einheit erscheint dann gar nicht, nicht einmal als roter Pfeil. Die neuen Werte „Group 1 UAS“ aus v37 kennt VBS 26.1 vermutlich noch nicht.

## Umrechnung

1. **Ort:** Kartenkoordinate → UTM 32 → Breite und Länge (vorhanden: `realworld.rwLatLon`).
2. **Höhe:** DIS braucht die Höhe über dem Ellipsoid. Das Gateway erwartet korrektes WGS84-ECEF und gleicht nichts aus (Height-Ausgleich aus, Offset 0; gesichert, k5.2). Unsere Höhen sind Normalhöhen (NHN, DHHN2016). Ellipsoidische Höhe = NHN-Höhe + Quasigeoidhöhe (BKG, Modell GCG2016, gesichert). In NRW liegt der Wert zwischen 42,5 m (Minden-Lübbecke) und 48,5 m (südlich Siegen), gesichert. Wir setzen einen festen Wert je Gebiet (Schätzung für die Eifel um Monschau: etwa 47 m, Annahme: Lage zwischen Rheinland und Siegen). Ohne diesen Wert flöge die Drohne in VBS etwa 45 m zu tief.
3. **ECEF:** Breite, Länge, Höhe nach WGS84 in X, Y, Z (Standardformel). ETRS89 und WGS84 weichen unter 1 m ab (vermutet).
4. **Lage:** Aus Kurs, Nicken und Rollen die Drehmatrix Körper → Nord-Ost-Unten bilden, mit der Matrix Nord-Ost-Unten → ECEF (aus Breite und Länge) multiplizieren, daraus psi = atan2(m21, m11), theta = −asin(m31), phi = atan2(m32, m33). Die Formeln in open-dis passen dazu (gesichert gelesen). Vor dem Einsatz mit einem Test hin und zurück rechnen.
5. **Geschwindigkeit:** von Karte (Osten, Süden, oben) nach Nord-Ost-Unten, dann nach ECEF.

## Wann wir senden

- Wenn die Vorhersage (Dead Reckoning) mehr als 1 m oder 3° von unserer Lage abweicht, sonst spätestens alle 5 s. Das Gateway hat Herzschlag 5 s und löscht fremde Einheiten nach 13 s ohne Meldung (gesichert, k5.2). Also nie länger als 5 s schweigen, auch eingefroren.
- Höchstens 30 PDUs je Sekunde (Vorschlag; unsere Physik rechnet 240-mal je Sekunde).

## Zustände (Appearance, Luft)

| Bei uns | In DIS (Bits gesichert) |
|---|---|
| Fliegt | Damage 0, Power Plant On (Bit 22) |
| Absturz | Damage 3 = zerstört (Bit 3–4), Propulsion Killed (Bit 1), Power Plant aus, Dead Reckoning 1 (Static). Schaden kommt in VBS in vier Stufen an (beobachtet, k5.2) |
| Eingefroren (Taste F) | Is Frozen (Bit 21): VBS sagt nichts voraus. Ob VBS das Bit auswertet: ungeprüft |
| Flug beendet | einmal State = deaktiviert (Bit 23) senden (vermutet übliche Praxis) |

## Was wir empfangen

- Alle Entity State PDUs der Übung. Anzeige im Umkreis (Vorschlag 1,5 km), höchstens 50 Einheiten.
- **Zeitlimit 13 s wie VBS:** Das Gateway sendet alle Einheiten mit Herzschlag 5 s, ohne Unterschied nach Art, und löscht selbst nach 13 s (gesichert, k5.2). Wir entfernen VBS-Einheiten ebenso nach 13 s. Die Norm-Werte (Land 132 s) gelten hier nicht.
- Darstellung über unsere Grundtypen (nächste Etappe). Zuordnung nach Kind, Domain und Kategorie. Die Kategorie trennt Kette und Rad nicht (gesichert). Die Unterkategorien sind je Land vergeben, dieselbe Zahl heißt in verschiedenen Ländern etwas anderes (gesichert, k5.2). Eine öffentliche Regel aus Kategorie und Unterkategorie trennt also nicht sicher.
- **Unsere Regel (Land, im Repo):** Kategorie 1 Kampfpanzer (Kette); 2 Schützenpanzer, Vorgabe Rad; 3 Transport-, Pionier-, Bergepanzer, Vorgabe Rad; 4 Artillerie selbstfahrend, Vorgabe Kette; 5 Artillerie gezogen; 6 und 7 Pkw und Lkw (Rad); 9 Kettenfahrzeug; 28 Flugabwehr, Vorgabe Kette; 50 unbemannt. Die Vorgaben für gemischte Kategorien hat k5.2 aus den Mengen der Modellliste abgeleitet; die Zahlen selbst bleiben lokal (`private/`, nicht im Repo).
- **Genauer (optional, nur lokal):** Die Brücke kann zur Laufzeit eine Tabelle aus Land, Kategorie und Unterkategorie → Kette oder Rad lesen, erzeugt aus der privaten Modellliste. Sie liegt nur in `private/` und kommt nie ins Repo. Ohne Tabelle gilt die Regel oben.
- Was nicht passt, wird ein Quader nach Domain.

## Bewegung der VBS-Einheiten über „lagebild“ (07.11.2026, k5.2, von Fabian freigegeben)

Weil das Gateway Ort und Bewegung eingefroren sendet (Ursache in VBS offen), hat k5.2 ein eigenes VBS-Modul „lagebild“ gebaut (Repo vbs-tools, PR #313; in VBS 26.1.3 erprobt).
- VBS schreibt je Takt (Vorgabe 1 s) die Datei `<VBS-Benutzerordner>\sqfkit_lagebild\lagebild.txt` komplett neu. Zeilen (gültiges JSON):
  - `["KOPF", 1, Spielzeit, Takt, Mission, Anzahl]`
  - `["E", Gateway-ID, Klasse, Seite, [x,y,z] ASL, [X,Y,Z] ECEF (DIS-Reihenfolge), [vx,vy,vz] m/s, vectorDir, vectorUp, lebt, Schaden, Besatzung]`
- Erfasst: alle Fahrzeuge und Soldaten zu Fuß. Die Gateway-ID ist die DIS-Entity-Nummer (gesichert: Boxer 13, Soldaten 1 und 4); ohne Gateway 0. Ein fahrender Boxer bekam jede Sekunde neuen Ort und neues Tempo (gesichert).
- **Plan für die Brücke (D2):** zwei Quellen über die Entity-Nummer verbinden. DIS liefert Art und Seite (für unsere Grundtypen), „lagebild“ Ort, Tempo und Lage. Die Brücke läuft auf dem VBS-Rechner und liest die Datei jede Sekunde. Einheiten ohne DIS-Nummer (zum Beispiel ohne Gateway) zeigen wir nach Seite als Quader, bis die Art bekannt ist.
- Die Klassennamen in der Datei sind Herstellerinhalt: Die Brücke nutzt sie nur zur Laufzeit, speichert und überträgt sie nicht ins Repo.
- Dazu von k5.2: modelle.csv (9 819 Zeilen, 4 293 mit SISO) und bedienung.csv (1 795 Zeilen), lokal bei Fabian (Herstellerinhalt); Doku `docs/wissen-vbs4-dis-praxis.md` im Repo vbs-tools.
- **Wichtig für Tests:** Das Testprofil steht wieder im Ausgangsstand (AllowLoopback 0, LightweightMode 1, ShowUnknownEntities 0). Für Proben mit der Brücke auf demselben Rechner stellt k5.2 AllowLoopback im Testmodus wieder auf 1.

## Lizenz: was ins öffentliche Repo darf

- **Ja:** einzelne SISO-Werte und unsere Zuordnung zu den Grundtypen, mit dem Vermerk „Reprinted with permission from SISO Inc.“ im Code und in diesem Dokument. Grund: SISO-REF-010 erlaubt Kopie und abgeleitete Werke mit diesem Vermerk (XML für alle Zwecke, Dokumentation nichtkommerziell; gesichert). Keine Rechtsberatung.
- **Nein:** die VBS-Modellliste, alles mit VBS-Klassennamen und Zahlentabellen daraus (Herstellerinhalt, nur in `private/`). Hinweis: Die Modellliste selbst liegt bei Fabian, nicht in diesem Container.
- **Nicht nötig:** die ganze SISO-XML, fremder Quelltext. Den Kodierer schreiben wir selbst.

## Etappen (Vorschlag)

1. **D1 Kodierer:** Modul ohne DOM (`dis.js`): Entity State bauen und lesen, ECEF und Lage hin und zurück, Zustände. Tests in Node, ohne Netz. **Erledigt** (07.11.2026, Prompt 135), siehe unten.
2. **D2 Brücke:** `tools/dis-bruecke.mjs` mit Node-Bordmitteln (UDP über `dgram`, WebSocket selbst, nur 127.0.0.1). Test mit einem eigenen UDP-Empfänger.
3. **D3 Simulator:** Schalter „Verbund“ (Vorgabe aus), Senden der eigenen Drohne, fremde Einheiten als Grundtypen.
4. **D4 Probe mit VBS:** über k5.2 (Modul `bruecke` listet unsere Drohne in VBS), erst nach Fabians Entscheidungen.

## D1 Kodierer (erledigt 07.11.2026)

`src/dis.js`, ohne DOM, nicht im Bundle (die Brücke und später der Simulator binden ihn ein). Tests: `test/dis.test.mjs`.
- WGS84 <-> ECEF (Hin und zurück unter 1 mm), Achsen Nord-Ost-Unten, Vektoren umrechnen.
- Lage: Kurs/Nicken/Rollen <-> DIS-Winkel psi/theta/phi. Geprüft am bekannten Beispiel (Äquator, Nase Nord, waagrecht: theta −90°) und gegen die Formel aus open-dis.
- **Meridiankonvergenz:** Unsere Karte liegt im UTM-Gitter, nicht nach geografisch Nord. In Monschau weicht Gitter-Nord etwa 2,1° von geografisch Nord ab (gerechnet, gegen `geo.toUtm` geprüft). Kurs und Tempo werden darum gedreht, sonst stünde die Drohne in VBS 2° schief.
- Entity State PDU 144 Byte bauen und lesen, DIS 6 (Vorgabe) und 7. Andere PDU-Typen: nur der Kopf.
- Erscheinungsbild: Schaden, Antrieb aus, eingefroren, Triebwerk an, deaktiviert. Zustände fliegt, Absturz, eingefroren, aus.
- Vorhersage Static, FPW, RPW, RVW, FVW (mit Drehung über die Drehraten in Körperachsen). Senderegel: erstes Mal, Zustand geändert, 5 s Herzschlag, mehr als 1 m oder 3° Abweichung.
- Aus dem Simulator: Kartenkoordinate, Quaternion, Drehraten (Simulator x rechts, y oben, z hinten -> DIS x vorn, y rechts, z unten), Höhe NHN plus Quasigeoidhöhe.
- Noch nicht geprüft: gegen echte PDUs von VBS (Mitschnitt angefragt).

## VBS-Grundtypen (vorgebaut 07.11.2026, Prompt 136)

`src/distypes.js`, ohne DOM. Tests: `test/distypes.test.mjs`.
- 18 Grundtypen mit Namen und geschätzten Maßen (Annahme je Typ im Code): Kampfpanzer, Schützenpanzer Kette und Rad, Transportpanzer Rad, Aufklärung, Pionier/Bergepanzer, Lkw, Pkw, Artillerie, Raketenwerfer, Flugabwehr, Kampf- und Transporthubschrauber, Flugzeug, Drohne Fläche und Multikopter, Boot, Person. Dazu „Unbekannt“ als Quader.
- Zuordnung nach Kind, Domain, Kategorie (Regeln im Code, vermutete Zuordnungen gekennzeichnet). Schützen- und Transportpanzer standardmäßig Rad (nach den Mengen von k5.2). Aufklärung, Pionier/Berge (Kategorie 3) und Raketenwerfer haben keine eigene SISO-Kategorie: nur über eine lokale Tabelle „Land.Kategorie.Unterkategorie=Grundtyp“ aus der privaten Modellliste (nie im Repo).
- Einfache Modelle (60 bis 440 Dreiecke), Farbe nach Seite: blau Freund, rot Feind, grün neutral, gelb sonstige, dunkel und schief zerstört.
- Vorschau: Modus „VBS-Grundtypen“ unter Spezial. Alle Modelle auf einer freien Fläche der Spielkarte (nordwestlich vom Start), Namen im Bild bis 50 m. Noch nicht mit VBS verbunden, nichts fest verbaut.

## Mitschnitt und Port-Probe von k5.2 (07.11.2026)

k5.2 hat im eigenen Testprofil geprüft (VWS unverändert; einzige Änderung im Testprofil: Show Unknown Entities an). Gelände DefaultWorld (georeferenziert, etwa 50,2 N, 16,6 E).
- **Empfangen auf demselben Rechner geht** (gesichert): Ein Node-Programm bindet mit reuseAddr Port 3000 neben dem Gateway und empfängt alle Broadcasts von VBS.
- **Senden an das Gateway auf demselben Rechner geht mit den heutigen Einstellungen nicht** (gesichert): 20 eigene Entity-State-PDUs (unsere Werte) per Broadcast, in VBS erschien nichts, auch kein roter Pfeil. Vermutete Ursachen, nicht getrennt: AllowLoopback 0 (Pakete vom eigenen Rechner verworfen, laut Handbuch nur für mehrere Clients auf einem Rechner nötig), der Eingangsfilter des Gateways (FilterType editorObject ohne Geofilter-Objekt). Trennen geht nur mit einer weiteren Änderung im Testprofil (AllowLoopback 1 oder FilterType none) oder mit der Brücke auf einem zweiten Rechner. **Entschieden (Fabian, Prompt 137): Probe mit AllowLoopback 1 im Testprofil.**

**Ergebnis der Probe (07.11.2026, k5.2, Testprofil; VWS unberührt):**
- **Unsere Drohne kommt an** (gesichert, Protokoll VBS4.RPT bei jedem Lauf): „Creating Remote Entity“ mit dem Modell eines weißen Mikado-Quadrokopters, Kennung DIS 1/1/200/1, Marking FPV1, Seite Freund. Kein roter Pfeil, also richtige Zuordnung. Gelöscht 13 s nach der letzten PDU. Dazu eine Warnung „Failed to set symbol … SIDC =“ (leeres taktisches Symbol, vermutet unkritisch).
- Der Eingangsfilter ist für den DIS-Adapter laut Protokoll aus. Es lag allein an AllowLoopback 0.
- **Offen:** Wo die Drohne im Spiel steht. Per Skript ist sie nicht zu finden (vermutet: Fremdeinheiten stehen nicht in den Listen), auf einem Bildschirmfoto nicht zu sehen (Foto unsicher, ein Firewall-Dialog lag darüber).
- **Ort und Bewegung der VBS-Einheiten kommen auch bei Editor-Einheiten nicht an** (gesichert): Ein im Editor gesetzter Trupp lief 160 bis 510 m nach Norden; im DIS stand er weiter am Ankerpunkt der Gruppe, Tempo 0. Die Ursache „per Skript angelegt“ ist damit raus. Vermutet: LightweightMode 1 im Gateway. Höhe: Das Fahrzeug meldete NHN + etwa 44 m (passt zur Geoidhöhe), die Personen am selben Punkt nur 48,9 m (falsch, Ursache offen).
- Nicht gesendet: Schützenpanzer Puma aus dem Editor, der Spieler, per Skript angelegte Soldaten (vermutet: keine Zuordnung im Gateway).
- **Probe mit LightweightMode 0 (Fabian, Prompt 139; k5.2, Testprofil):**
  - Ort und Bewegung bleiben eingefroren (gesichert): Ein Boxer fuhr in 25 s 190 m nach Osten, ein Trupp lief 100 m nach Norden; im DIS jedes Mal der Ort beim Anlegen, Tempo 0, nur Herzschlag alle 5 s, Inhalt bis aufs Byte gleich. LightweightMode und „per Skript angelegt“ sind als Ursache raus. Vermutet: VBS sendet nur den Zustand beim Anlegen (unbekannte Einstellung oder Simulationsstatus).
  - Höhe der Personen weiter falsch: 48,9 m über dem Ellipsoid statt etwa 373 m (gesichert).
  - Unsere Drohne: VBS legt sie bei jedem Lauf an (Mikado-Modell, FPV1), aber im Spiel ist sie nicht zu sehen, auch ohne Dialog, auch nicht per Skript. Kein Befehl zum Auflisten fremder Einheiten gefunden.
  - Verdacht Achsenfolge **widerlegt** (gesichert): k5.2 hat [X, Z, Y] aus ASLToECEF richtig getauscht. Unser Kodierer rechnet das gesendete Paket unabhängig auf 30,00 m Nord, 0,64 m Ost, 10,00 m hoch über dem Spieler (50,351266 N, 16,639685 E, 368,12 m). Auch VBS selbst passt dazu: Ein bei +60/+60 m angelegter Boxer meldet im DIS 61 m Ost, 58 m Nord. Der Ort ist also richtig; VBS legt die Drohne an, zeigt sie aber nicht oder anderswo (vermutet). Möglich auch: Ein 1 m großer weißer Quadrokopter in 30 m ist auf dem Bildschirm nur wenige Bildpunkte groß.
  - Sende-Einstellungen im Testprofil (nur gelesen): Schwellen für Luft 1 m Ort, 0,2 relativ, 5° Drehung, Send Timeout 5 s; Land 5 m, 1, 0,1. Bei 46 km/h und Tempo 0 in der letzten PDU müsste der Boxer nach wenigen Metern neu senden; das passiert nicht. Vermutet (ungeprüft): DelaySendingEntityCreate 1 (ein Feld gilt nie als bekannt) oder der Client ohne -server gilt nicht als Besitzer der Simulation (AllowGatewayOnClients 0). Probe nur mit Fabians Wort.
  - **Proben AllowGatewayOnClients 1 und DelaySendingEntityCreate 0** (Fabian direkt bei k5.2 freigegeben, je einzeln im Testprofil, danach zurückgesetzt): Bewegung bleibt eingefroren, Boxer fuhr 150 m, im DIS Ort vom Anlegen und Tempo 0; Personen weiter am Ankerpunkt mit 48,9 m (gesichert). Ausgeschlossen sind damit LightweightMode, AllowGatewayOnClients, DelaySendingEntityCreate und „per Skript angelegt“.
  - Stand Testprofil: ShowUnknownEntities 1, AllowLoopback 1, LightweightMode 0, sonst Original.
  - **Neuer Verdacht von k5.2 (vermutet, ungeprüft):** Das Gateway läuft auf einem Client, der am World Server (VWS) hängt; simuliert wird auf dem Server, der Client hat nur eine Kopie und sieht die Bewegung nicht. Prüfen nur mit dem Gateway am Besitzer der Simulation (VWS-Server oder Client ohne World Server). Das berührt den VWS: Entscheidung Fabian.
  - **Probe Testclient ohne World Server** (Fabian direkt bei k5.2 freigegeben; VWS nicht beteiligt): eigenständige Simulation mit eigenem Gateway, Bewegung bleibt eingefroren (Boxer 134 m gefahren, im DIS Ort vom Anlegen, Tempo 0). Der World Server ist als Ursache raus (gesichert).
  - **Ausgeschlossen (gesichert):** LightweightMode, AllowGatewayOnClients, DelaySendingEntityCreate, „per Skript angelegt“, World Server. Ursache offen: unbekannte Einstellung oder Verhalten von VBS 26.1.3 selbst (vermutet).
  - Möglicher anderer Weg (Architekturfrage, Entscheidung Fabian): Orte der VBS-Einheiten per SQF auslesen (Modul `bruecke` von k5.2) und selbst an unsere Brücke geben, statt über das Gateway.
  - Noch nicht gemacht: Sichtbarkeitsprobe mit großem Hubschrauber statt der Mikado-Drohne (keine Einstellung nötig); Probe mit fokussiertem VBS-Fenster und einem Fahrzeug, das ein Mensch selbst fährt (k5.2 hatte beobachtet: ohne Fokus steht die Spielzeit).
- **Mitschnitt** (60 s, nur lokal in `private/`): nur Entity State, DIS 6, je Einheit eine PDU alle 5 s, 240 Byte (6 Zusatzparameter). Unser Kodierer liest sie richtig (gesichert für die drei Beispiele: Version, Kennungen, Typ, Ort in Erdkoordinaten, Lage, Erscheinungsbild). Die Grundtypen passen: Hubschrauber 1.2.78.21 → Transporthubschrauber, Radpanzer 1.1.78.3 → Transportpanzer Rad, Person → Person. VBS sendet kein Marking.
- **Auffällig:** Ort, Tempo und Lage blieben in allen PDUs auf dem Stand beim Anlegen, Tempo immer 0, obwohl ein Fahrzeug fuhr (k5.2 vermutet LightweightMode oder per Skript angelegte Einheiten). Für Bewegung gibt es noch keine Probe. Alle drei Personen (Entity 2, 3, 5) melden exakt denselben Ort, 48,9 m über dem Ellipsoid (etwa Meereshöhe), 320 m östlich und 180 m nördlich vom Start; liegen sollten sie an drei verschiedenen Stellen, zwei davon als Besatzung im Fahrzeug (gesichert, nachgerechnet von k5.2). Vermutet: Für per Skript angelegte Einheiten liefert das Gateway einen Platzhalter bzw. den Stand vom Anlegen (oder LightweightMode); keine eigene Höhenregel für Lebewesen. Nicht gesendet wurden ein Soldat mit 3.1.173.x und ein Schützenpanzer aus der Mission (vermutet: keine Zuordnung im Gateway). Nächste Probe von k5.2: getPosASL gegen DIS-Ort, dazu eine im Editor angelegte Einheit zum Vergleich.

## Offene Fragen (an Fabian oder k5.2)

Am 07.11.2026 als 14 Fragen an k5.2 geschickt (Prompt 134), am selben Tag beantwortet. k5.2 hat nur gelesen (Gateway_Settings.xml im VWS-Profil, Stand 05.11.2026; Zusammenfassung des Gateway-Handbuchs 24.2.2; Configs aus dem Katalog 26.1), nichts geändert.

**Gateway heute (gesichert, k5.2):** nur der DIS-Adapter aktiv; DIS 6; Senden an 255.255.255.255 (Broadcast) Port 3000, Empfangen auf 0.0.0.0 Port 3000; Exercise 1, Site 1, Application automatisch; Herzschlag 5 s, Löschen nach 13 s; Show Unknown Entities aus; Fuzzy Mapping aus; ausgehend Dead Reckoning 4; Höhenausgleich aus.

**Vorschlag von k5.2 für einen Test (beobachtet):** Exercise 1, eigene Site/Application (zum Beispiel 1/200), Unicast an die IP des VBS-Rechners, getrennte Ports je Richtung (VBS empfängt 3000, sendet 3001 an die Brücke). Zwei Programme auf demselben Rechner und Port 3000 wären schwierig (VBS: Loopback aus).

**Testmaterial:** Das Modul `bruecke` von k5.2 empfängt keine PDUs. Es führt Befehle im laufenden VBS aus und kann unsere Drohne dort als VBS-Objekt auflisten (Klasse, Ort, Seite), sobald sie ankommt (vermutet). Ein Mitschnitt (pcap) ist nicht freigegeben.

**Entscheidungen von Fabian (07.11.2026, Prompt 135):**
- VBS ist lizenziert, ein Gateway gehört dazu (so weit er weiß).
- Die Brücke läuft vorerst lokal auf dem VBS-Rechner, später auf zwei oder mehr Rechnern.
- Das Netz bleibt (Broadcast, Port 3000, Exercise 1). DIS 6 bleibt. Am Gateway ändert sich nichts.
- Für Tests zeigt VBS unbekannte Einheiten (Show Unknown Entities an).
- Testort entscheiden wir und k5.2. Vorschlag an k5.2: Monschau (bei uns eingebaut, gleiche offene NRW-Daten) oder ein schon vorhandenes georeferenziertes VBS-Gelände in NRW.
- Mitschnitt des Netzverkehrs freigegeben. Bei k5.2 angefragt (Text mit Hex je PDU), dazu eine Port-Probe: Kann ein zweites Programm auf demselben Rechner Port 3000 binden und die Broadcasts von VBS empfangen, und kommen seine eigenen Broadcasts trotz AllowLoopback 0 im Gateway an? Davon hängt „Brücke lokal und Netz bleibt“ ab. Der Mitschnitt bleibt nur lokal (`private/`), die Tests im Repo nutzen selbst gebaute PDUs.

**Vorher offen (jetzt entschieden, siehe oben):**
- Gateway lizenziert? (nur Fabian weiß es)
- DIS 6 lassen (Vorschlag) oder auf 7 umstellen?
- Netz für den Test umstellen (Unicast, getrennte Ports, eigene Application)?
- Wo läuft die Brücke: VBS-Rechner oder Nachbarrechner? Firewall-Regel für UDP.
- Show Unknown Entities für Tests einschalten? (Hilft bei falscher Zuordnung: roter Pfeil statt nichts.)
- Monschau als VBS-Gelände bauen lassen (aoi2vbs4, braucht Fabians OK)? Erst dann passt der Ort in beiden Welten.
- Mitschnitt (pcap) freigeben?

**Noch ungeprüft:** ob VBS „Is Frozen“ und „deaktiviert“ auswertet; ob die .dbo-Zuordnung des Gateways von den Configs abweicht; Höhenvergleich mit einer stehenden Einheit (Client ellipsoidisch, World Server EGM96).

## Quellen

- SISO-REF-010 v37 (XML, Lizenztext im Kopf), Spiegel: https://github.com/ngjunsiang/siso-ref-010-xml ; offiziell: https://www.sisostandards.org/page/ReferenceDocuments
- SISO-REF-010 v28 (PDF, Lizenz S. 2): https://www.mixr.dev/assets/pages/interop/siso-ref-010-v28.pdf
- Aufbau der PDU: open-dis-python, https://github.com/open-dis/open-dis-python ; Lage: open-dis Java `EulerConversions.java`, https://github.com/open-dis/opendis7-java
- Herzschlag und Schwellen: KDIS, https://kdis.sourceforge.net/classdoc/_k_symbolic_names_8h_source.html
- Höhe: BKG zu GCG2016, https://sg.geodatenzentrum.de/web_public/gdz/dokumentation/eng/quasigeoid_eng.pdf ; Bezirksregierung Köln, Normalhöhen in NRW (Stand 3/2016), https://www.duesseldorf.de/fileadmin/Amt62/vermessung/pdf/pub_geobasis_normalhoehen.pdf
