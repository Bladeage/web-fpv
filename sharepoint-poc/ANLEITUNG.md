# FPV-Sim auf SharePoint: Technik-Probe

Hinweis fürs Repo: Hier liegt nur die HTML-Quelle der Probe. Die .aspx entsteht mit `python3 tools/to_aspx.py sharepoint-poc/fpvsim-poc.html fpvsim-poc.aspx`. Die Stufe-1-.aspx entsteht ab Etappe 0 im Build.

## Inhalt

| Datei | Zweck |
|---|---|
| fpvsim-poc.aspx | Technik-Probe. Prüft 12 Punkte und zeigt ein Testbild. |
| fpvsim-stufe1.aspx | Der Simulator Stufe 1 als .aspx mit OSD, Propellern und Funke-Unterstützung. Braucht noch keine Assets. |
| fpvsim-poc.html | Technik-Probe als normale HTML-Datei (UTF-8) |
| fpvsim-stufe1.html | Simulator Stufe 1 als normale HTML-Datei (UTF-8) |
| assets/gras.png | Testtextur (512 x 512) |
| assets/tor.glb | Testmodell im Format glTF binär |
| assets/tor.bin | Dasselbe Modell mit anderer Endung (Ausweichweg, falls .glb gesperrt ist) |
| assets/probe.json, assets/probe.txt | Kleine Testdateien für Datenformate |

Beide .aspx sind reines ASCII. Umlaute stehen als Escape-Zeichen im Code.
Die .html-Dateien haben denselben Inhalt, aber normal mit Umlauten in UTF-8.

## Hochladen

1. Auf der Teamseite eine neue Dokumentbibliothek anlegen, Name `FPVSim`.
2. In der Bibliothek einen Ordner `assets` anlegen.
3. Die fünf Dateien aus `assets/` in diesen Ordner hochladen.
4. `fpvsim-poc.aspx` und `fpvsim-stufe1.aspx` direkt in die Bibliothek hochladen, nicht in den Ordner.

Ergebnis:

```
FPVSim/
  fpvsim-poc.aspx
  fpvsim-stufe1.aspx
  assets/
    gras.png  tor.glb  tor.bin  probe.json  probe.txt
```

Wichtig: Der Ordner muss genau `assets` heißen und neben der .aspx liegen. Die Seite lädt die Dateien über relative Pfade.

## Wenn SharePoint eine Datei ablehnt

Notiere, welche Datei abgelehnt wurde und mit welcher Meldung. Das ist ein Ergebnis. Lade die übrigen Dateien trotzdem hoch.

## Testen

1. `fpvsim-poc.aspx` in Firefox öffnen.
2. 10 Sekunden warten. Die Bildrate braucht 5 Sekunden.
3. Optional: Funke oder Gamepad per USB anstecken. Alle Knüppel einmal bis zum Anschlag bewegen.
4. Auf "Ergebnis kopieren" klicken und den Text an Claude schicken.
5. Danach `fpvsim-stufe1.aspx` öffnen und kurz fliegen. Rückmeldung: läuft flüssig, ruckelt, oder Fehler.

## HTML-Versionen

- `fpvsim-stufe1.html` läuft per Doppelklick direkt im Browser.
- `fpvsim-poc.html` braucht einen Webserver. Per Doppelklick (Adresse beginnt mit `file://`) blockiert der Browser das Laden der Assets. Die Prüfungen für Textur, Modell und Dateien zeigen dann FEHLER. Das sagt nichts über SharePoint aus.
- Auf SharePoint die .aspx nehmen. SharePoint bietet .html-Dateien in Bibliotheken oft nur zum Download an, statt sie anzuzeigen.

## Was die Probe nicht tut

Sie schreibt nichts nach SharePoint. Sie legt keine Listen an. Sie ändert keine Rechte.
