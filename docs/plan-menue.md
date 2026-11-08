# Plan: Neuordnung der Menüs (08.11.2026, Fable)

Nur Planung, kein Code. Auftrag des Nutzers (Prompt vom 08.11.2026, sinngemäß):
1. DIS-Modus nicht mehr in den Untermenüs verstecken. Er gehört ins selbe Menü wie Parcours-Flug und Taktischer Flug, dort als experimentell gekennzeichnet.
2. Die Reiter „Funktionen“ und „Knüppel“ in den Einstellungen sind für den Nutzer dieselbe Sache und werden zusammengelegt.
3. Das Menü wird neu strukturiert.

Einstufung: **gesichert** = im Code gelesen (Fundstelle genannt). **vermutet** = geschätzt oder nicht geprüft. Höhen in Pixel sind Richtwerte in Grundgröße (vor dem Zoom durch `fitPanel`): Titel 40, Reiter-Zeile 44, Seg-Zeile 36, Hinweis zwei Zeilen 36, Eingabezeile 40, Navigation 44, Listenknopf 48, Linkknopf 28, Belegungszeile 36, Gruppenüberschrift 20, Häkchen-Zeile 32, Schrittzeile 20 (bei niedrigen Fenstern ausgeblendet, `style.css:168`).

Verfügbare Höhe für den Inhalt (gesichert aus `style.css:43-48, 109, 146-152, 177`): 960 x 540 etwa 452 px (Overlay 56 + 8, Panel-Innenabstand 12 + 12), 1366 x 650 etwa 522, 1280 x 720 etwa 592, 390 x 844 etwa 716 bei 302 px Breite. `fitPanel` zoomt zwischen 0,72 und 1,15 (`menu.js:201`). Ziel: jede Seite bei 960 x 540 mit Zoom 0,9 oder besser, bei 390 x 844 mit Zoom 1.

## 0 Stand heute (gesichert)

- Hauptmenü (`index.html:22-33`): Weiterfliegen (nur nach dem ersten Flug), Parcours-Flug (`#go`), Taktischer Flug (`#goTac`), Einstellungen, Bestzeit, Hinweis, Version. Die Knöpfe erklären sich nur per `title` (am Handy unsichtbar).
- Schritt 1 „mode“ (`index.html:35-72`): Welt-Schalter, Modus-Liste, Hinweis, Stufe und Treffer, in der echten Welt die Gruppe „Startort“ mit [Monschau | Ort laden | DIS-Übung] und „Optionen ›“. DIS-Übung ist ein Startort: setzt `cfg.verbund = true` (`menu.js:521-526`), blendet die Modus-Liste aus (`menu.js:123`) und zeigt den DIS-Block `#disOpts` (Brückenstatus, Download, Port, Übung, Dorthin, Grundtypen) plus Geländezeile in `#rwMsg` (`menu.js:424-448`). Der Flug läuft immer als Freiflug `'real'` (`menu.js:44`). Wirkmittel `#whSeg` gibt es nur im Taktischen Flug (`menu.js:173`), die Sprengladung wirkt aber gerade im DIS (`main.js:50-56`, `vbDetonate`).
- Esc beim Umschauen am DIS-Ort öffnet die Seite „mode“ (`menu.js:234-239`).
- Einstellungen (`index.html:185-258`): fünf Reiter Allgemein, Knüppel (`data-tab=radio`), Funktionen (`data-tab=switch`), OSD, Hilfe. Knüppel: Gerät [Funke / Gamepad | Tastatur]; bei Funke Status, Belegung (Select), vier Achsen-Zeilen mit Lernen, Kalibrieren, Hinweis; bei Tastatur alle 17 Tasten aus `KEY_FN` (`state.js:25-33`) in zwei Spalten, auch die Funktionstasten. Funktionen: sechs Zeilen aus `GP_SW` (`gamepad.js:13`), nur für Funke/Gamepad. Ergebnis: für die Tastatur steht alles in einem Reiter, für die Funke in zwei. Das ist der Widerspruch, den der Nutzer meint.
- Option „DIS: Einheiten ohne neue Meldung behalten“ liegt unter Echte Welt → Optionen → Daten (`index.html:85`, `srcui.js:222-223`), also drei Klicks von DIS entfernt.
- Alte Einstellungen werden in `cfgMigrate` umgestellt (`state.js:70-76`), geprüft in `test/scenario.test.mjs:176-179`.

## 1 Neue Menüstruktur

```
Hauptmenü
├─ Weiterfliegen                      (nur im Flug)
├─ Parcours-Flug      → Schritt 1 „mode“ (Welt, Modus, Startort)   → Schritt 2 „drone“ → Start
├─ Taktischer Flug    → Schritt 1 „mode“ (Welt, Modus, Startort)   → Schritt 2 „drone“ (mit Wirkmittel) → Start
├─ DIS-Übung  experimentell → Schritt 1 „dis“ (Brücke, Übung, Ort) → Schritt 2 „drone“ (mit Wirkmittel) → Start
└─ Einstellungen (auch Esc, P, ☰)
   ├─ Allgemein   (wie heute)
   ├─ Steuerung   (neu: Knüppel + Funktionen in einem Reiter)
   │    Gerät [Funke / Gamepad | Tastatur]
   │    Bereich [Knüppel | Funktionen]
   ├─ OSD         (wie heute)
   └─ Hilfe       (wie heute, ein Satz zu DIS)

Nebenseiten (wie heute): map (Ort wählen), sources (Echte Welt: Optionen mit Daten, Quellen, Debug), source (eine Quelle).
„Fertig“ in den Optionen führt dorthin zurück, woher man kam (mode, map oder neu: dis).
```

Was wegfällt: der Startort „DIS-Übung“ im Schalter `#rwSeg` (wird [Monschau | Ort laden]), der DIS-Block auf Schritt 1, der Reiter „Funktionen“, die DIS-Option im Reiter Daten.

### 1.1 Hauptmenü

```
FPV-Simulator
Modus wählen, Drohne wählen, fliegen
[ Weiterfliegen ]                                   (48, nur im Flug)
[ Parcours-Flug                                  ]  (56, orange bis zum ersten Flug)
  Tore, Ringe, Jagd, Lieferung. Spielkarte oder echte Welt
[ Taktischer Flug                                ]  (56)
  Wirkmittel gegen Ziele. Spielkarte oder echte Welt
[ DIS-Übung                                      ]  (56)
  Ort und Einheiten eines DIS-Partners. Experimentell
[ Einstellungen ]                                   (44)
Bestzeit …                                          (20)
Steuerung: Tastatur … (nur vor dem ersten Flug)     (36)
Version 1.xxx                                       (16)
```
Höhe 960 x 540: 60 + 48 + 168 + 44 + 20 + 16 = 356 (Hinweis und Weiterfliegen schließen sich aus). Passt mit Zoom 1 (452).
Höhe 390 x 844: Beschreibungen können umbrechen (+16 je Knopf), etwa 420. Passt (716).

Die zweite Zeile je Knopf ersetzt die heutigen `title`-Texte, die am Handy niemand sieht. Die Kennzeichnung „Experimentell“ steht dezent in der Beschreibung des DIS-Knopfs, nicht im Namen. Die Knöpfe bleiben `.primary`/`.secondary` wie heute (auch der Wechsel von `#go` auf `.secondary` nach dem ersten Flug, `menu.js:181`); neu ist nur `<b>Name</b><span>Beschreibung</span>` darin plus zwei CSS-Zeilen.

### 1.2 Schritt 1 „dis“ (neue Seite)

```
Schritt 1 von 2                                                   (20, bei 960x540 aus)
DIS-Übung  experimentell                                          (40, „experimentell“ klein und grau im Titel)
Ort und Einheiten kommen vom Partner, ohne Aufgabe. Die Drohne    (36, fester Text #disInfo)
erscheint dort; der Partner übernimmt keinen Schaden.
Brücke läuft. Übung 1: 10 Einheiten bei 50.86, 7.14.              (36 bis 54, #disSt wie heute)
[ Brücke für Windows herunterladen ]                              (44, nur ohne Brücke)
Port [3000]  Übung [1]  [ Dorthin ]                               (40, nur mit Brücke)
☐ Einheiten ohne neue Meldung behalten                            (32, nur mit Brücke; heute unter Optionen → Daten)
Gelände: Höhendienst gefunden … [Kartendaten laden] [Gelände ›]   (36 bis 54, #disGround, heute in #rwMsg)
Grundtypen ansehen ›                                              (28)
[ Zurück ]  [ Weiter ]                                            (44)
```
Höhe 960 x 540, Brücke läuft: 40 + 36 + 54 + 40 + 32 + 54 + 28 + 44 = 328. Ohne Brücke: 40 + 36 + 54 + 44 + 54 + 28 + 44 = 300. Passt mit Zoom 1.
Höhe 390 x 844: Texte brechen auf drei bis vier Zeilen, „Dorthin“ rückt in eine eigene Zeile (CSS heute schon, `style.css:277-282`): etwa 20 + 40 + 54 + 72 + 84 + 48 + 72 + 28 + 44 = 462. Passt.

Verhalten:
- Der Knopf „DIS-Übung“ im Hauptmenü setzt `cfg.flight = 'dis'` und `cfg.verbund = true`. Die Welt ist fest „echte Welt“, ohne Welt-Schalter: DIS braucht Koordinaten, die Spielkarte hat keine. Die Welt-Wahl `cfg.world` für Parcours und Taktisch bleibt unberührt.
- Keine Modus-Liste: im DIS gibt es nur den Freiflug mit den Einheiten des Partners (Entscheidung des Nutzers, Prompt 173, `menu.js:44`).
- „Weiter“ führt zu Schritt 2 „drone“. Dort ist die Wirkmittel-Zeile `#whSeg` sichtbar (Aufklärung | Sprengladung), weil die Sprengladung im DIS wirkt (gesichert `main.js:50-56`). „Zurück“ auf der Drohnen-Seite führt zu „dis“ statt zu „mode“ (der Knopf bekommt eine Id, `syncMenu` setzt `data-go`).
- „Dorthin“ wie heute (`menu.js:487-503`): Gelände laden, Freiflug ohne Aufgabe am Ort der Übung. Esc beim Umschauen öffnet die Seite „dis“ (statt „mode“), ein zweites Esc fliegt weiter (`disLooking`, `toggleMenu`).
- „Start“ ohne „Dorthin“: wie heute Monschau mit laufender DIS-Verbindung. Die Geländezeile sagt das, wenn kein Ort bekannt ist: „Noch kein Ort der Übung. „Dorthin“ holt ihn; ohne ihn startet der Flug in Monschau.“
- Brücke, Port, Übung, Dorthin, Grundtypen: ziehen mit ihren Ids und Handlern unverändert auf die neue Seite um. Die Geländezeile bekommt ein eigenes Element `#disGround` (heute teilt sie sich `#rwMsg` mit „Ort laden“). Der Ladefortschritt aus `rwLiveDo` (`menu.js:263, 269`) schreibt dann in das passende Element: `isDis() ? $('disGround') : $('rwMsg')`.
- „Gelände ›“ und „Geodaten importieren“ setzen `srcFrom = 'dis'`, damit „Fertig“ in den Optionen zur DIS-Seite zurückführt.
- Die Sekunden-Schleife (`menu.js:456-463`) prüft `screen === 'dis'` statt `'mode'` und `cfg.flight === 'dis'` statt `isReal() && cfg.verbund`.
- Der Name der Id `disTerrain` ist schon eine Funktion in `menu.js:450`; darum heißt das Element `disGround`.

### 1.3 Schritt 1 „mode“ ohne DIS

Unverändert bis auf: Startort [Monschau | Ort laden] (zwei Knöpfe, Klasse `seg3` weg), kein `#disOpts`, kein DIS-Zweig in `syncMenu` (`menu.js:116, 121-131`), kein `data-start="dis"`-Handler, `rwSavedFill` ohne `!!cfg.verbund`. Höhe wie heute (Parcours, echte Welt, Ort laden mit gespeicherten Orten: etwa 540, Zoom etwa 0,84 bei 960 x 540; vermutet, heute gleich).

### 1.4 Schritt 2 „drone“

Unverändert bis auf `#whSeg` sichtbar bei `tac || isDis()` und den dynamischen „Zurück“-Knopf. Höhe mit Wirkmittel etwa 388 (wie Taktisch heute).

### 1.5 Einstellungen → Steuerung

```
Einstellungen
[ Allgemein | Steuerung | OSD | Hilfe ]                          (44, vier Reiter statt fünf)
[ Funke / Gamepad | Tastatur ]                                   (36, #ctlSeg wie heute)
Erkannt: RadioMaster TX16S … / Kein Gerät erkannt …              (36, #gpStat, nur bei Funke)
[ Knüppel | Funktionen ]                                         (36, neu: #grpSeg)
… Inhalt je Gerät und Bereich, siehe unten …                     (144 bis 216)
Hinweis                                                          (36 bis 54)
[ Hauptmenü ]  [ Fertig ]                                        (44)
```

Inhalt der vier Kombinationen:

```
Funke, Knüppel                                           Funke, Funktionen
Belegung [automatisch ▾] [Kalibrieren] [Löschen]  (40)   Scharf        [Aus ▾] ☐ umkehren ● [Lernen]  (36)
Gas     [A2 ▾] ☐ umkehren ▬▬●▬▬ [Lernen]          (36)   Angle/Acro    [A5 ▾] ☐ umkehren ● [Lernen]
Gieren  [A3 ▾] ☐ umkehren ▬▬●▬▬ [Lernen]                 Neustart      [T0 ▾] ☐ umkehren ● [Lernen]
Nicken  [A1 ▾] ☐ umkehren ▬▬●▬▬ [Lernen]                 Kamera        [Aus ▾] ☐ umkehren ● [Lernen]
Rollen  [A0 ▾] ☐ umkehren ▬▬●▬▬ [Lernen]                 Zurückspulen  [Aus ▾] ☐ umkehren ● [Lernen]
Hinweis: A0 bis A7 sind die Achsen. Lernen: Knüppel      Wärme/Nacht   [Aus ▾] ☐ umkehren ● [Lernen]
nach oben oder rechts bewegen.                   (36)    Hinweis: A = Achse (Schalter der Funke), T = Taste.
                                                         Lernen: Schalter umlegen oder Taste drücken. Schalter:
                                                         die Stellung gilt, Taste: jeder Druck schaltet um.
                                                         Scharf nur mit Gas unten.                      (54)

Tastatur, Knüppel                                        Tastatur, Funktionen (zwei Spalten wie heute)
Gas     [W] [S]   mehr / weniger                 (32)    Scharf / aus   [Leertaste]   Angle / Acro  [M]   (32)
Gieren  [A] [D]   links / rechts                         Neustart       [R]           Kamera        [V]
Nicken  [↑] [↓]   Nase runter / hoch                     Zurückspulen   [Z]           Wärme/Nacht   [N]
Rollen  [←] [→]   links / rechts                         Einfrieren     [F]           Kamera höher  [Bild ↑]
Hinweis: Taste antippen, dann neue Taste drücken.        Kamera tiefer  [Bild ↓]      [Standard-Tasten]
Esc bricht ab. Liegt die Taste schon auf einer           Hinweis wie links                              (54)
Funktion, tauschen beide. Fest: Esc / P, + / −.  (54)
```

Höhe 960 x 540, größter Fall (Funke, Funktionen): 40 + 44 + 36 + 36 + 36 + 216 + 54 + 44 = 506, Zoom etwa 0,89. Funke, Knüppel: 40 + 44 + 36 + 36 + 36 + 40 + 144 + 36 + 44 = 456, Zoom etwa 0,99. Tastatur (ohne Statuszeile): höchstens 40 + 44 + 36 + 36 + 160 + 54 + 44 = 414, Zoom 1. Zum Vergleich heute: Reiter Knüppel etwa 460, Funktionen etwa 400. Wer unter 452 bleiben will: `.gprow` Abstand 8 → 6 px (spart 20) und den Funktionen-Hinweis auf zwei Zeilen kürzen (spart 18); dann 468. Vorschlag: so machen.
Höhe 390 x 844: Belegungszeile bricht in zwei Zeilen (+40), Zeilen wie heute mit verstecktem Text „umkehren“ (`style.css:143`): höchstens etwa 20 + 40 + 44 + 36 + 36 + 36 + 80 + 144 + 54 + 44 = 534. Passt. Breite: `.gprow` bei 302 px Inhalt heute schon geprüft (vier Größen, Prompt 169).

Warum ein Bereich-Schalter und nicht alles untereinander: Funke mit allen zehn Zeilen käme auf etwa 40 + 44 + 36 + 36 + 40 + 20 + 144 + 20 + 216 + 54 + 44 = 694; bei 960 x 540 wäre das Zoom 0,65, also unter der Grenze 0,72 (scrollt), bei 1366 x 650 Zoom 0,75 (Schrift etwa 10 px). Mit dichteren Zeilen (28 px) bliebe es bei 600, also Zoom 0,75 bis 0,87, aber „Texte und Knöpfe nicht zu eng“ wäre verletzt. Der Bereich-Schalter hält jede Ansicht in der heutigen Größe, und er gilt für Funke und Tastatur gleich: dieselben zwei Bereiche mit denselben Namen und Zeilen (Gas, Gieren, Nicken, Rollen; Scharf, Angle/Acro, Neustart, Kamera, Zurückspulen, Wärme/Nacht, bei der Tastatur dazu Einfrieren und Kamerawinkel). Die beiden Reiter-Namen „Knüppel“ und „Funktionen“ kennt der Nutzer schon (Prompt 169); sie werden Bereiche im Reiter „Steuerung“.

Tastenbelegung ohne doppelte Einträge: `KEY_FN` bleibt die eine Liste (17 Funktionen). Neu in `state.js` (ohne DOM, testbar):
```js
// Knüppel-Paare der Tastatur: [Name, Funktion aufwärts/rechts, Funktion abwärts/links, Beschriftung]
export const KEY_STICKS = [['Gas', 'thrUp', 'thrDown', 'mehr / weniger'], ['Gieren', 'yawL', 'yawR', 'links / rechts'],
  ['Nicken', 'pitchF', 'pitchB', 'Nase runter / hoch'], ['Rollen', 'rollL', 'rollR', 'links / rechts']];
```
Bereich Knüppel zeigt die acht Funktionen aus `KEY_STICKS` als vier Paar-Zeilen, Bereich Funktionen zeigt `KEY_FN` ohne diese acht (neun Zeilen, zwei Spalten). Jede Funktion erscheint genau einmal. Die Hilfe (`buildHelpKeys`, `menu.js:767-776`) baut ihre ersten vier Zeilen aus derselben Tabelle statt aus ihrer eigenen Liste.

Belegung, Kalibrieren und „Kalibrierung löschen“ (heute Select plus eigene Knopfzeile, `index.html:242-249`) stehen in einer Zeile `1fr auto auto`; der Knopf heißt „Löschen“ mit `title="Kalibrierung löschen"`, am Handy bricht die Zeile um. Die Kalibrierung gilt für alle Achsen (gesichert `switchOn`, `gamepad.js:33`), steht aber beim Knüppel-Bereich, weil man dafür die Knüppel bewegt.

Beim Wechsel von Gerät oder Bereich endet ein laufendes Lernen (`keyLearn.fn = null`, `learn.fn = null`), wie heute bei `showTab`. Der gewählte Bereich ist Laufzeit-Zustand (Modulvariable, nicht in `cfg`), Vorgabe „Knüppel“. Beim Öffnen der Pause bleibt „Allgemein“ der erste Reiter (`menu.js:225`).

## 2 DIS im Hauptmenü: Entscheidungen

| Frage | Entscheidung (Vorschlag) | Begründung |
|---|---|---|
| Name des Knopfs | „DIS-Übung“, zweite Zeile „Ort und Einheiten eines DIS-Partners. Experimentell“ | Gleicher Begriff wie heute im Startort, in der Hilfe, in den Quellen („Gilt für: DIS-Übung“). Kennzeichnung sichtbar, aber nicht im Namen |
| Eigene Seite? | Ja, `section[data-screen="dis"]` als Schritt 1 von 2 | Der DIS-Block hat sieben Elemente; auf Schritt 1 „mode“ war er in der Startort-Gruppe versteckt. Eine eigene Seite braucht keinen Welt-Schalter und keine Modus-Liste |
| Welt | Fest echte Welt. `isReal()` wird `cfg.world === 'real' \|\| cfg.flight === 'dis'`; `cfg.world` bleibt die Wahl für Parcours und Taktisch | DIS braucht Koordinaten. Die Welt-Wahl der anderen Flugarten nicht überschreiben |
| Flugart intern | `cfg.flight` bekommt den dritten Wert `'dis'`. `cfg.verbund` bleibt als Flagge für `main.js`, `hud.js`, `scenario.js`, wird aber nur noch aus `flight` abgeleitet (Hauptmenü-Klick und `cfgMigrate`) | Die drei Module ohne DOM müssen sich nicht ändern; `main.js:95` wird `const disOn = !!cfg.verbund` (DIS ist immer echte Welt) |
| Parcours oder taktisch für DIS? | Weder noch: nur Freiflug mit den Einheiten des Partners, dazu auf Schritt 2 das Wirkmittel (Aufklärung, Sprengladung) | Entscheidung des Nutzers (Prompt 173); die Sprengladung wirkt im DIS (`main.js:50-56`) |
| Brücke, Port, Übung, Dorthin, Grundtypen | Alle auf die DIS-Seite, Ids und Handler unverändert | Nichts neu bauen |
| Geländezeile | Eigenes Element `#disGround` auf der DIS-Seite, mit „Kartendaten laden“ / „Höhendienst laden“ und „Gelände ›“ wie heute | `#rwMsg` gehört zu „Ort laden“ |
| Option „Einheiten behalten“ | Zieht von Optionen → Daten auf die DIS-Seite (Häkchen unter Port und Übung, nur mit laufender Brücke) | DIS-Einstellung gehört zu DIS, nicht zu den Geodaten |
| Startort „DIS-Übung“ im Schalter | Entfällt. `#rwSeg` wird [Monschau \| Ort laden] | Doppelter Weg wäre verwirrend |
| `cfg.rwSrc === 'dis'` (ebene Fläche) | Bleibt der interne Zustand nach „Dorthin“ ohne Kartendaten. Beim Klick auf Parcours oder Taktisch im Hauptmenü und in `cfgMigrate` wird `'dis'` zu `'emb'` | Sonst flöge ein Parcours in der echten Welt auf der ebenen Fläche (heute nicht möglich, weil der Startort-Klick `rwSrc` neu setzt) |
| Esc beim Umschauen | `openMenu('dis')`, zweites Esc fliegt weiter | Wie heute, nur die Seite wechselt |
| „Weiter“ ohne bekannten Ort | Bleibt frei; Geländezeile nennt Monschau als Rückfall | Test ohne Partner bleibt möglich, wie heute |
| DIS-Knopf am Handy | Sichtbar | Universell und einfach; die Statuszeile erklärt die Brücke |

## 3 Zusammenlegung Knüppel + Funktionen: Zusammenfassung

- Reiter heißt „Steuerung“ (`data-tab="control"`, `data-pane="control"`). Vier Reiter: `.tabs{grid-template-columns:repeat(4,1fr)}`.
- Oben Gerät `#ctlSeg` (wie heute), darunter bei Funke der Status `#gpStat`, dann Bereich `#grpSeg` mit `data-grp="sticks"` und `data-grp="fns"`.
- Vier Inhaltsblöcke: `#padSticks` (Belegungszeile, `#gpRows`, Hinweis `#gpHint`), `#padFns` (`#swRows`, Hinweis), `#keySticks` (Paar-Zeilen, Hinweis `#keyHint`), `#keyFns` (`#keyRows` zwei Spalten mit „Standard-Tasten“, Hinweis). Eine Funktion `syncCtl()` blendet nach Gerät und Bereich ein und ruft `fitPanel()`.
- `buildKeyRows` baut beide Tastatur-Blöcke (Paar-Zeilen aus `KEY_STICKS`, Rest aus `KEY_FN`). `buildGpRows` bleibt, Ziel-Container ändern sich nicht (`#gpRows`, `#swRows`).
- Lampen `[data-lamp]` und Balken `[data-bar]` werden weiter von `updGpUI` gefüllt (`menu.js:695-713`); sie laufen auch im ausgeblendeten Block mit, das ist heute schon so.
- CSS neu: `.belegrow{display:grid;grid-template-columns:1fr auto auto;gap:8px}` (am Handy `1fr 1fr`, Select über beide Spalten), `.keypair{display:grid;grid-template-columns:4.6em auto auto 1fr;gap:6px 10px;align-items:center}`. CSS weg: `#ctlSeg`-Sonderregel bleibt, `.tabs` Spaltenzahl 4.

## 4 Weitere Aufräumarbeiten (klein)

1. Beschreibungen in den drei Flugart-Knöpfen statt `title` (siehe 1.1). Begründung: `title` ist am Handy unsichtbar; der Platz für „experimentell“ entsteht so von selbst. +12 px je Knopf.
2. „Einheiten behalten“ zu DIS (siehe 2). Reiter Daten wird eine Zeile kürzer.
3. Hilfe-Zeilen aus `KEY_STICKS` statt aus der eigenen Liste in `buildHelpKeys` (eine Tabelle weniger). Die Hilfe bekommt einen Satz: „DIS-Übung (experimentell): Hauptmenü → DIS-Übung, Brücke laden, Partner auf Port 3000 und Übung 1.“ Der Satz zu „Höhendienste (etwa vom DIS-Partner)“ bleibt.
4. Hinweis im Bereich Funktionen gekürzt (siehe 1.5), ohne Verlust: Lernen erkennt die Richtung des Schalters selbst (gesichert `learnDone`, `menu.js:665-671`).
5. Nicht anfassen: Schritt 1 „mode“ außer dem Startort-Schalter, Drohnen-Seite außer `#whSeg` und „Zurück“, Karte, Quellen, OSD, Allgemein.

## 5 Änderungen je Datei

### `src/index.html`
- Hauptmenü: `#go`, `#goTac` mit `<b>`/`<span>`, neu `#goDis` (`class="secondary" data-flight="dis"`). `title`-Attribute weg.
- Neue `section[data-screen="dis"]`: Schrittzeile, `<h1>DIS-Übung <small class="tag">experimentell</small></h1>`, `p.hint#disInfo`, dann `#disSt`, `#disGet`, `#disSets` (Port, Übung, Dorthin), `label.check` mit `#disKeep`, `p.hint#disGround`, `#disBases`, Navigation Zurück (`data-go="main"`) und Weiter (`data-go="drone"`).
- Schritt 1: `#rwSeg` ohne dritten Knopf und ohne `seg3`; `#disOpts` ganz raus.
- Drohne: Zurück-Knopf bekommt `id="droneBack"`.
- Einstellungen: Reiter `Allgemein, Steuerung (data-tab="control"), OSD, Hilfe`. Pane `control`: `#ctlSeg`, `#gpStat`, `#grpSeg`, die vier Blöcke. Pane `switch` weg. Reiter Daten ohne `#geoKeep`.
- Hilfe: ein Satz zu DIS.

### `src/menu.js`
- `isReal` erweitern, `isDis = () => cfg.flight === 'dis'`. `flightScen`: `if (isDis()) return 'real'`.
- Hauptmenü-Klick für `go`, `goTac`, `goDis`: `cfg.flight`, `cfg.verbund = isDis()`, bei Parcours/Taktisch `rwSrc 'dis' → 'emb'`, dann `show(isDis() ? 'dis' : 'mode')`.
- `syncMenu`: DIS-Zweige der Mode-Seite raus (`dis`-Variable, `$('scenList').hidden`, `$('disOpts')`, `rwSeg`-Press mit `'dis'`, `disMsg(true)`); neu `syncDis()` und `disMsg(true)` wenn `isDis()`; `$('whSeg').hidden = !(tac || isDis())`; `$('droneBack').dataset.go = isDis() ? 'dis' : 'mode'`; `$('disKeep').checked = !!cfg.disKeep`.
- `disMsg`, `rwLiveDo`, `disHere`-Fehlerpfad: Zielelement über eine Hilfsfunktion `msgEl()`; `disMsg` ohne `isReal()`-Prüfung, dafür `isDis()`; der Text für „kein Ort“ (Rückfall Monschau).
- `disLooking`, `toggleMenu`, Sekunden-Schleife: `'dis'` statt `'mode'`, `isDis()` statt `cfg.verbund`-Prüfungen.
- `rwSeg`-Handler ohne `'dis'`; `rwSavedFill` ohne `cfg.verbund`.
- `#disKeep`-Handler (aus `srcui.js` übernommen): `cfg.disKeep`, `saveCfg`, `vbSet({ keep })`.
- `srcFrom = 'dis'` bei „Gelände ›“ und „Geodaten importieren“, wenn `isDis()`.
- Steuerung: `showCtl(dev)`, neu `showGrp(grp)`, `syncCtl()`; `buildKeyRows` baut Paar-Zeilen und Funktionen-Grid; `buildHelpKeys` nutzt `KEY_STICKS`; Import `KEY_STICKS` aus `state.js`.
- Kommentar oben (`menu.js:22-25`) und die DIS-Kommentare (`menu.js:366-371`, `481-486`) an die neue Führung anpassen.

### `src/style.css`
- `.tabs{grid-template-columns:repeat(4,1fr)}`.
- `.primary b,.secondary b{display:block}` und `.primary span,.secondary span{display:block;font-size:13px;font-weight:500;opacity:.8;margin-top:2px}` (nur für die Flugart-Knöpfe, über eine Klasse `.flight`).
- `.panel h1 small.tag{display:inline;font-size:13px;margin-left:8px;vertical-align:middle;letter-spacing:0}`.
- `.belegrow`, `.keypair` wie in 3; Handy-Umbruch für `.belegrow`.
- `#rwSeg` braucht keine `seg3`-Regel mehr (Klasse im HTML weg). `.disopts`-Regeln (`style.css:257-263`) gelten weiter für die DIS-Seite.
- Optional: `.gprow{margin-top:6px}` (spart 20 px bei zehn Zeilen; bei niedrigen Fenstern schon 4).

### `src/srcui.js`
- `#geoKeep`-Zeilen (`srcui.js:221-223`) und Import `vbSet` raus.
- Kommentar an `srcOpen` (`srcui.js:37`) anpassen: „den DIS-Modus wählt das Hauptmenü“.

### `src/state.js`
- `KEY_STICKS` exportieren (siehe 1.5).
- `cfgMigrate`:
```js
export function cfgMigrate(c) {
  if (c.scen === 'real') { c.world = 'real'; c.scen = 'free'; }
  if (c.scen === 'vbs') c.scen = 'gates';
  if (c.verbund && c.flight !== 'dis') c.flight = 'dis';            // alte Wahl „Startort DIS-Übung“ wird die Flugart DIS-Übung
  if (!['course', 'tactical', 'dis'].includes(c.flight)) c.flight = 'course';
  c.verbund = c.flight === 'dis';                                    // Flagge für main, hud, scenario; nur aus flight abgeleitet
  if (c.world !== 'map' && c.world !== 'real') c.world = 'map';
  if (c.rwSrc === 'dis' && c.flight !== 'dis') c.rwSrc = 'emb';     // ebene Fläche gibt es nur in der DIS-Übung
  return c;
}
```
- Kommentar zu `verbund` in `cfg` (`state.js:16`) anpassen.

### `src/main.js`
- `main.js:95`: `const disOn = !!cfg.verbund;` (eine Zeile; DIS ist immer echte Welt).

### Doku
- `docs/prompt-historie.md` (Regel), `docs/PLAN.md` (Eintrag „Menü neu geordnet“), `docs/dis-abschluss.md` und `docs/plan-taktischer-flug.md` (Nachtrag: DIS-Übung ist jetzt ein Hauptmenü-Eintrag, kein Startort), `README.md` (Menüweg DIS, Reiter Steuerung), Übergabe `docs/handover-2026-11-06.md` (Satz zum Menü).

## 6 Migration alter Einstellungen

| Gespeichert | Ergebnis | Grund |
|---|---|---|
| `verbund: true`, `flight: 'course'` oder `'tactical'` | `flight: 'dis'`, `verbund: true` | Der Nutzer hatte zuletzt den Startort DIS-Übung gewählt; das wird die Flugart |
| `flight: 'dis'` | `verbund: true` | Flagge immer aus `flight` |
| `verbund: false`, `rwSrc: 'dis'` | `rwSrc: 'emb'` | Ebene Fläche nur im DIS |
| `flight: 'dis'`, `rwSrc: 'dis'` | bleibt | Letzter Stand nach „Dorthin“ ohne Kartendaten |
| `scen: 'real', verbund: true` (sehr alt) | `world: 'real', scen: 'free', flight: 'dis', verbund: true` | Beide Regeln hintereinander |
| alles andere | wie heute |  |

`cfg.world` bleibt für DIS-Nutzer, was es war (Vorgabe `'map'`); die DIS-Seite nutzt es nicht. `cfg.gpSw`, `cfg.keys`, `cfg.gpMap`, `cfg.gpCal`, `cfg.gpPreset` ändern Form und Bedeutung nicht; nur ihr Ort im Menü wechselt.

## 7 Tests und Prüfung

- `test/scenario.test.mjs:176-179`: die drei Fälle anpassen (jedes Ergebnis hat jetzt `verbund: true|false`; `{ scen: 'real', verbund: true }` ergibt `flight: 'dis'`). Neue Fälle aus Abschnitt 6: `{ flight: 'course', verbund: true }`, `{ flight: 'dis' }`, `{ flight: 'course', rwSrc: 'dis' }`, `{ flight: 'dis', rwSrc: 'dis' }`.
- `test/keys.test.mjs`: neuer Test „KEY_STICKS: acht Funktionen aus KEY_FN, keine doppelt, die übrigen neun bleiben Funktionen“ (`KEY_FN.length - 8 === 9`).
- `test/gamepad.test.mjs`, `test/keys.test.mjs`, `test/verbund.test.mjs`: laufen unverändert (keine Änderung an `gamepad.js`, `verbund.js`).
- `npm run build` prüft Import-Regeln und doppelte Exportnamen (`tools/build.mjs:61-69`): `KEY_STICKS` ist neu und einmalig (geprüft mit grep, gesichert).
- Browser (Headless-Chromium wie bisher) in 1280 x 720, 1366 x 650, 960 x 540, 390 x 844: Hauptmenü (vor und nach dem ersten Flug); DIS-Seite in drei Zuständen (Suche/nicht gefunden mit Download; Brücke läuft ohne Einheiten; mit Einheiten über `node tools/dis-bruecke.mjs` und den DIS-Ersatz wie in Prompt 145/147); Dorthin, Esc beim Umschauen öffnet „dis“, zweites Esc fliegt weiter; Schritt 2 mit Wirkmittel und „Zurück“ zur DIS-Seite; Schritt 1 Parcours echte Welt mit Ort laden; Steuerung in allen vier Kombinationen, Lernen und Kalibrieren mit angeschlossener Funke (Nutzer); Hilfe. Bei jeder Seite: `panel.scrollHeight <= clientHeight` und Zoom protokollieren.
- Alte Einstellungen im Browser: `localStorage` mit `verbund: true` setzen, laden, Hauptmenü → „DIS-Übung“ führt zur DIS-Seite; Parcours → echte Welt startet in Monschau, nicht auf der ebenen Fläche.

## 8 Offene Entscheidungen (der Umsetzer nimmt den Vorschlag)

1. Reiter-Name: „Steuerung“ (Vorschlag) oder „Eingabe“. Steuerung ist das Wort des Nutzers (Prompt 168).
2. Bereich-Namen: „Knüppel | Funktionen“ (Vorschlag, bekannt aus Prompt 169) oder „Steuern | Schalter“.
3. Bereich-Schalter auch bei Tastatur (Vorschlag: ja, gleiche Logik für beide Geräte) oder bei Tastatur beide Bereiche untereinander (passt knapp: 414 + 128 = 542, Zoom 0,83).
4. „Einheiten behalten“ auf die DIS-Seite (Vorschlag: ja) oder unter Optionen → Daten lassen.
5. Flugart-Knöpfe mit zweiter Zeile (Vorschlag: ja, +36 px im Hauptmenü) oder nur ein kleines „experimentell“ rechts im DIS-Knopf.
6. `cfg.verbund` als abgeleitete Flagge behalten (Vorschlag: ja, drei DOM-freie Module bleiben unverändert) oder überall durch `cfg.flight === 'dis'` ersetzen.
7. „Weiter“ auf der DIS-Seite ohne bekannten Ort (Vorschlag: frei, Rückfall Monschau im Text) oder gesperrt bis „Dorthin“.
8. `.gprow`-Abstand 8 → 6 px (Vorschlag: ja, bringt Funke/Funktionen auf etwa 468 bei 960 x 540).

## 9 Aufwand und Risiken

Aufwand (Schätzung): mittel, eine Arbeitssitzung. Annahme: nur Menü, Texte, CSS und `cfgMigrate`; keine Physik, keine neuen Module; Browser-Prüfung in vier Größen wie bei T1 (Prompt 163). Anteile: DIS-Seite und Umzug der Handler etwa 40 %, Reiter Steuerung etwa 35 %, Migration, Tests, Doku etwa 25 %.

Risiken:
- **Zielelement der Meldungen.** `rwLiveDo`, `disMsg`, „Geodaten importieren“ schreiben heute alle in `#rwMsg`. Vergisst man eine Stelle, landet der Ladefortschritt der DIS-Übung auf der unsichtbaren Mode-Seite. Gegenmittel: eine Hilfsfunktion `msgEl()`, alle Stellen mit grep auf `rwMsg` prüfen.
- **`cfg.rwSrc === 'dis'` lecken.** Ohne die Umstellung auf `'emb'` beim Verlassen von DIS startet ein Parcours auf der ebenen Fläche. Gegenmittel: Umstellung im Hauptmenü-Klick und in `cfgMigrate`, Test und Browser-Prüfung (Abschnitt 7).
- **`fitPanel` nach späterem Inhalt.** Die DIS-Statuszeile ändert sich jede Sekunde; die Schleife misst heute per Schlüssel neu (`menu.js:461-463`). Der Schlüssel muss `#disKeep` und `#disGround` einschließen.
- **Vier Reiter statt fünf.** `.tabs` ist eine allgemeine Regel; `#modeTabs` und `#geoTabs` haben eigene Spaltenregeln (`tabs2`, `tabs3`), die bleiben. Prüfen, dass kein weiterer `.tabs`-Block die Fünferteilung braucht (gesichert: nur `#modeTabs`, `#geoTabs` und die Einstellungen, `index.html`).
- **Höhe der Steuerung bei 960 x 540.** Mit 506 px (Funke, Funktionen) liegt der Zoom bei etwa 0,89; mit den beiden Kürzungen aus Vorschlag 8 bei etwa 0,97. Vermutet: Richtwerte, im Browser nachmessen.
- **Alte Nutzer mit `verbund: true`** landen nach dem Laden im Hauptmenü wie alle; die Brücke wird wie heute schon gesucht, solange DIS die gewählte Flugart ist (`vbStep` mit `disOn`). Das ist heute gleiches Verhalten (gesichert `main.js:95-96`).
- **Hilfe-Tab wächst** um einen Satz (etwa 18 px); heute etwa 530 in Grundgröße, bei 960 x 540 gelten engere Regeln (`style.css:169`). Vermutet: passt weiter; nachmessen.

## Stand der Umsetzung (08.11.2026, Prompt 174)

Umgesetzt nach diesem Plan, alle offenen Entscheidungen mit dem Vorschlag: Hauptmenü mit drei Flugarten und Beschreibungszeile, DIS-Übung als eigene Seite „dis“ (Brücke, Port, Übung, Dorthin, „Einheiten behalten“, Geländezeile `#disGround`, Grundtypen), Welt fest echte Welt, Wirkmittel auf Schritt 2, Startort nur noch [Monschau | Ort laden], Esc beim Umschauen öffnet „dis“. Reiter „Steuerung“ mit Gerät und Bereich, `KEY_STICKS` in `state.js`, Hilfe aus derselben Tabelle, Hilfe-Satz zu DIS. `cfgMigrate` stellt alte Einstellungen um (Test in `test/scenario.test.mjs`). Abweichung: Der Reiter behält intern `data-tab="radio"` (weniger Umbau); `.gprow`-Abstand 6 px.
