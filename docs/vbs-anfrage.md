# Anfrage an die Claude-Code-Instanz am VBS-Rechner (k5.2), Stand 06.11.2026

Nur Vorbereitung. Der FPV-Simulator arbeitet vorerst weiter am Geo-Projekt (echte Welt). Die DIS-Anbindung ist geplant, aber nicht begonnen (Plan: `docs/dis-bruecke.md`).

## Worum es geht

- **FPV-Simulator:** Browser-Simulator für FPV-Drohnen, eine einzige HTML-Datei, reines JavaScript und WebGL2, ohne Bibliotheken. Repo `bladeage/web-fpv`, Seite https://bladeage.github.io/web-fpv/ .
- **Echte Welt:** Ausschnitte von 1 × 1 km aus amtlichen Geodaten (NRW: Höhen, Luftbild, LoD2-Gebäude), lokale Koordinaten in UTM 32.
- **Ziel später:** Der Simulator nimmt an einer VBS4-Übung teil. Ein kleines Brückenprogramm (Node, nur Bordmittel) übersetzt zwischen Browser (WebSocket) und DIS (UDP).
  - Wir senden unsere Drohne als Entity State.
  - Wir zeigen VBS-Einheiten im Umkreis vereinfacht an.
  - Keine zusätzlichen Lizenzen. HLA nur über ein vorhandenes Gateway.
- **Vereinfachen:** Die vielen VBS-Modelle (zum Beispiel etwa 200 Panzer) wollen wir auf wenige gemeinsame Grundtypen zurückführen. Jeder Grundtyp bekommt bei uns ein einfaches Modell.

## Vorab wichtig

- Bitte nur Daten liefern, die den Rechner verlassen dürfen. Also keine Verschlusssachen und nichts, was Lizenz oder Nutzungsvereinbarung von VBS verbieten.
- Wenn das unklar ist: bitte erst nachfragen und nichts senden.
- Wir brauchen keine Modelle, Texturen oder Geländedateien von VBS. Wir brauchen nur Namen, Einordnung, Maße und die DIS-Zuordnung.

## Fragen

Bitte je Frage antworten mit „gesichert“ (am Rechner geprüft) oder „vermutet“.

### A. Umgebung

1. Welche VBS-Version läuft (VBS4, genaue Nummer)? Gibt es VBS Gateway oder ein DIS/HLA-Plugin, und ist es lizenziert?
2. Kann VBS DIS senden und empfangen? Welche DIS-Version (6 oder 7)? Wo wird es eingestellt?
3. Netz: Port, Broadcast oder Multicast, Übungsnummer (Exercise ID), Site- und Application-ID. Darf auf dem Rechner ein eigenes Programm Port und Netz nutzen (Firewall)?
4. Welche PDU-Arten sendet und empfängt VBS: Entity State, Fire, Detonation, andere? Wie oft (Heartbeat)? Welches Dead Reckoning?

### B. Modellliste (der Hauptteil)

5. Lässt sich eine Liste aller Fahrzeug-, Luftfahrzeug-, Schiffs- und Personenmodelle ausgeben? Am liebsten als CSV mit diesen Spalten:
   - VBS-Klassenname
   - Anzeigename
   - Kategorie in VBS (Panzer, Schützenpanzer, Transportpanzer, Lkw, Pkw, Artillerie, Flugabwehr, Hubschrauber, Flugzeug, Drohne, Boot, Person …)
   - Seite oder Nation
   - DIS-Entitätsart als 7 Zahlen (Kind, Domain, Country, Category, Subcategory, Specific, Extra), falls zugeordnet
   - Maße Länge, Breite, Höhe in m
   - Turm ja oder nein
   - Hauptfarbe oder Tarnmuster (grob)
6. Wo liegt die Zuordnung VBS-Modell ↔ DIS-Entitätsart (Datei, Pfad, Format)? Kann sie als Kopie oder Auszug geliefert werden?
7. Wie viele Modelle sind es je Kategorie (grob)?

### C. Unsere Drohne in VBS

8. Welches VBS-Modell würde eine eingehende DIS-Entität „kleines Multikopter-UAS“ darstellen? Welche Entitätsart müssen wir senden, damit VBS ein passendes Modell zeigt?
9. Kann VBS eine fremde Einheit ohne passende Zuordnung trotzdem anzeigen (Ersatzmodell)?

### D. Gelände und Ort

10. Welche Gelände werden genutzt? Gibt es ein Gelände mit echtem Ort in Deutschland, idealerweise NRW? Wie ist es georeferenziert (Ursprung als Breite/Länge, Koordinatensystem)?
11. Kann VBS die Erdkoordinaten (geozentrisch, wie in DIS) einer Stelle im Gelände anzeigen? Damit prüfen wir den Abgleich.

### E. Testmaterial

12. Kann eine kurze DIS-Aufzeichnung geliefert werden (pcap, 30 bis 60 s, wenige Einheiten, ohne schutzbedürftige Inhalte)? Damit testen wir den Leser der Brücke ohne VBS.
13. Was kann die Instanz selbst liefern oder erledigen: Skripte, Exporte, Dokumentation des SDK oder Gateways, Tests mit einer laufenden VBS-Übung?

## Vorschlag für die Vereinfachung (zum Kommentieren)

Etwa 15 Grundtypen:
- Kampfpanzer
- Schützenpanzer
- Transportpanzer (Rad)
- Aufklärung
- Lkw
- Pkw/Geländewagen
- Artillerie (Rohr)
- Raketenwerfer
- Flugabwehr
- Kampfhubschrauber
- Transporthubschrauber
- Flugzeug
- Drohne (Flächenflugzeug)
- Drohne (Multikopter)
- Boot
- Person

Je Grundtyp gibt es ein einfaches Modell bei uns: Maße aus dem Mittel der Kategorie, Farbe nach Seite (Freund/Feind/neutral), dazu die Kennzeichnung „zerstört“.

## Antwort

- Bitte als Markdown-Datei (gleiche Nummern wie oben) und die Modellliste als CSV.
- Wenn möglich per Nachricht an die Claude-Sitzung „Web-fpv“ (session_01SGtbBZQa5tVNTv34d7pzj2). Sonst als Datei für den Nutzer, der sie weiterreicht.
- Keine Eile. Erst prüfen, ob die Daten weitergegeben werden dürfen.
