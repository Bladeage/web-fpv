# Test-Liste für echte Geräte

Stand 24.11.2026 (Etappe F4). Die Liste deckt ab, was sich im Test-Browser der Entwicklung nicht prüfen lässt: echtes Handy, echte Funke, echtes Netz.
Zum Abhaken. Fällt etwas auf: Punkt, Gerät und Browser notieren, wenn möglich mit Bildschirmfoto.

Seite: https://bladeage.github.io/web-fpv/ (vor dem Test neu laden, damit der neueste Stand läuft; die Version steht im Hauptmenü unten).

## A. PC mit Tastatur (Chrome oder Edge)

- [ ] A1 Erster Start in einem privaten Fenster: Die Einführung erscheint, drei Schritte, danach das Hauptmenü.
- [ ] A2 Zweiter Start: keine Einführung mehr. Einstellungen, Hilfe, „Einführung noch einmal zeigen“ öffnet sie wieder.
- [ ] A3 Parcours, Spielkarte, Torkurs: Unten steht am Start „W drücken für Gas“ und „Durch das grün leuchtende Tor fliegen“.
- [ ] A4 Die Zeit oben rechts läuft erst nach dem Abheben.
- [ ] A5 Schritt 2 zeigt das Lagebild mit Ziel und Regeln des Auftrags.
- [ ] A6 Taktisch, Fahrzeuge: unten „SCHARF IN 10M“, ab 10 m Höhe „LADUNG SCHARF“. Die Autos fahren schon vorher.
- [ ] A7 Ein Fahrzeug treffen: Explosion mit Knall, „Neue Drohne kommt gleich“, neue Drohne am Start, Zähler „TREFFER 1/5“.
- [ ] A7a Mit scharfer Ladung auf den Boden oder gegen ein Gebäude fliegen: Explosion mit Knall, danach kommt die nächste Drohne. Das gilt auch im Spielstil „Lernen“.
- [ ] A8 Auftrag erfüllen: „AUFTRAG ERFÜLLT“ mit Zeit, Bestzeit-Vergleich, Versuchen, Treffern und Drohnen.
- [ ] A9 Taktisch, Aufklärung: Ein Fahrzeug 4 s im Fadenkreuz halten zählt. Hinter einem Gebäude zählt es nicht.
- [ ] A10 Taktisch, Gemischt: Fahrzeuge und Ziel-Drohnen sind beide da und zählen beide.
- [ ] A11 Taste Z spult 5 s zurück, auch zweimal hintereinander und auch mit dem Regler Betaflight (Schritt 2, Feinwerte).
- [ ] A12 Spielstil „Normal“: Der Akku wird leer. Bei 0 mAh Rest bleiben die Motoren stehen („Akku leer“).
- [ ] A13 Einstellungen: Reiter Bild, Spiel, Steuerung, OSD, Hilfe. Jede Einstellung steht dort, wo du sie erwartest.
- [ ] A14 Hauptmenü unten: „Neuerungen, Quellen und Lizenzen“ öffnet die Seite mit allen Quellen.
- [ ] A15 Zehnmal auf den Hintergrund des Hauptmenüs klicken: Der Knopf „DIS-Übung“ erscheint.

## B. Handy (Chrome auf Android oder Safari auf iPhone)

- [ ] B1 Erster Start: Die Einführung nennt die Daumen, nicht die Tasten.
- [ ] B2 Im Flug stehen am Start die Hinweise für Touch über den Werten unten, nichts überdeckt sich.
- [ ] B3 Oben sechs Knöpfe neben ☰: Neustart, Kamera, scharf schalten (Ein/Aus-Zeichen), Flugmodus (ANG oder ACR), zurückspulen, einfrieren (zwei Balken). Alle Zeichen sind lesbar, alle Knöpfe reagieren.
- [ ] B4 Spielstil „Realistisch“: Die Drohne ist am Start nicht scharf, der Knopf Ein/Aus ist gelb. Er schaltet scharf. Im Flug ausschalten, Gas mit dem linken Daumen ganz runter, wieder scharf schalten: geht.
- [ ] B4a Spielstil „Lernen“: Der Knopf mit den zwei Balken friert den Flug ein und setzt ihn fort.
- [ ] B5 Taktisch, Fahrzeuge: Die Zeile „SCHARF IN 10M“ ist sichtbar.
- [ ] B6 Während „Neue Drohne kommt gleich“ tippen: Der Auftrag startet nicht neu, die Treffer bleiben.
- [ ] B7 Alle Menüseiten passen auf den Bildschirm, im Hochformat und im Querformat.
- [ ] B8 Die Bildrate bleibt flüssig (Einstellungen, OSD, „Bildrate“ einschalten). Wert notieren: ____ FPS.

## C. Funke per USB

- [ ] C1 Funke anstecken, Knüppel bewegen: Meldung „Erkannt: …“.
- [ ] C2 Einstellungen, Steuerung: Alle vier Achsen folgen den Knüppeln in der richtigen Richtung.
- [ ] C3 „Kalibrieren“: Knüppel loslassen, antippen, 6 s in alle Ecken bewegen. Danach steht die Drohne mit losgelassenen Knüppeln ruhig.
- [ ] C4 Ein Schalter für „Scharf“ und einer für Angle/Acro lassen sich unter „Funktionen“ lernen.
- [ ] C5 Funke im Flug abziehen: „Funke getrennt: Gas aus (Failsafe)“, die Drohne fällt.
- [ ] C6 Regler Betaflight: Die Drohne lässt sich nur mit Gas unten scharf schalten und fliegt ruhig.
- [ ] C7 Drohne auf dem Kopf (auch auf einem Dach): Der Turtle-Modus dreht sie um. Der Start danach ist gerade.

## D. Echte Welt, drei Orte

Je Ort: laden, 2 Minuten fliegen, mindestens 2 km vom Start weg.

**D1 Köln, AXA Campus (eingebaut, ohne Netz)**
- [ ] Lädt sofort. Gebäude, Bäume und Straßen sind da.
- [ ] Grafik „Foto 3D“ lässt sich wählen und lädt das 3D-Mesh nach.

**D2 Ein Ort in einem Land ohne eigene Höhen, zum Beispiel München („48.1374, 11.5755“)**
- [ ] Lädt mit Luftbild. Die Höhen sind grob, aber ohne Löcher und ohne Hochebenen.
- [ ] Beim Wegfliegen lädt die Umgebung nach (vorher blieb sie am Start stehen).
- [ ] „Foto 3D“ ist ausgegraut.

**D3 Ein Ort an einer Landesgrenze oder im Ausland, zum Beispiel Ulm oder „Innsbruck“ über die Suche**
- [ ] Die Suche findet Innsbruck in Österreich, nicht einen Ort in Deutschland.
- [ ] An der Grenze gibt es keine flache Ebene auf der anderen Seite.
- [ ] Straßen und Wald aus OpenStreetMap erscheinen einige Sekunden nach dem Laden. Auf Straßen fahren Autos, sie biegen an Kreuzungen ab.

**Zusätzlich, wenn Zeit ist**
- [ ] Brandenburg, Waldgebiet: Der Ort lädt, auch wenn dort keine Gebäude-Kachel liegt.
- [ ] Netz aus und einen neuen Ort laden: Die Meldung nennt die Ursache und was zu tun ist.
- [ ] Taktisch, Aufklärung an einem Ort mit Fluss: Ein Boot zählt als Ziel.

## Ergebnis

| Punkt | Gerät und Browser | Was ist passiert | Was hast du erwartet |
|---|---|---|---|
| | | | |
