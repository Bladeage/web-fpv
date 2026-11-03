# SITL als WebAssembly: Machbarkeit (03.11.2026)

Ziel (P4): echtes Betaflight im Browser. JavaScript gibt Kreisel, Beschleunigung und Funkwerte hinein, Betaflight rechnet einen Regelschritt und gibt die Motorwerte zurück.

## Geprüft (gesichert)

- Betaflight lässt sich von GitHub laden (Stand `c510251` vom 03.11.2026, Zweig master).
- In der Umgebung vorhanden: clang 18 mit Ziel `wasm32`, Linker `wasm-ld`, Node 22. Ein eigener C-Test (PID-Schritt) läuft als WebAssembly in Node.
- Mathe-Funktionen können aus JavaScript kommen (Import `Math.sin` getestet).
- Einstellungs-Register (`PG_REGISTER`): Betaflight nutzt dafür ein Linker-Skript (`sitl.ld`, Sektion `.pg_registry` mit Start- und Endmarke). wasm-ld 18 kennt weder Linker-Skripte noch `__start_`/`__stop_`-Marken. Ersatz getestet: Jeder Eintrag meldet sich per Konstruktor an (`__attribute__((constructor))`, `__wasm_call_ctors`). Dafür muss nur das Makro in `pg.h` geändert werden.
- Probe-Übersetzung aller 392 Dateien aus `mk/source.mk` (nur Syntax, ohne Ausführen) mit leeren Ersatz-Headern: 200 gehen sofort. Die Fehler der übrigen:
  - fehlende C-Standardfunktionen: `fmodf`, `lrintf`, `memcpy`, `memset`, `strlen`, `fabsf`, `sqrtf`, `fminf`, `fmaxf`, `abs`, `strncpy`, `memcmp` und wenige weitere
  - `pthread_mutex_*` aus dem SITL-Target
  - Dateien nur für echte Prozessoren (Flash-Treiber, `__ASM`, `BASEPRI`): werden für WebAssembly nicht gebraucht
- Der vorhandene SITL (`src/platform/SIMULATOR/sitl.c`) nutzt Threads, UDP (Simulator) und TCP (serielle Schnittstelle). Das geht im Browser nicht und wird durch eine eigene, kleine Plattform-Datei ersetzt.

## Blockiert

- Die Installation von Emscripten (`emsdk install`) hat die Sicherheitsprüfung dieser Umgebung abgelehnt: Ein heruntergeladenes Installationsskript würde ausgeführt. Nicht umgangen.

## Zwei Wege

1. **Mit Emscripten.** Der Nutzer erlaubt die Installation (Berechtigungsregel in den Einstellungen der Umgebung). Emscripten bringt eine vollständige C-Bibliothek mit. Weniger eigene Arbeit.
2. **Ohne Emscripten, mit dem vorhandenen clang.** Eigene kleine C-Bibliothek (rund 30 Funktionen: Speicher, Text, Mathe; Mathe zum Teil aus JavaScript), eigene Plattform-Datei, Änderung am Register-Makro. Kein fremdes Installationsskript nötig. Mehr eigene Arbeit, dafür volle Kontrolle und kleine Datei.

In beiden Fällen nötig: eigene Plattform-Datei (Schritt-Funktion statt Echtzeit-Schleife), Auswahl der Quelldateien, Einbindung als Base64 in die eine HTML-Datei, Lizenz GPLv3 für das Gesamtpaket (vom Nutzer bestätigt).

## Noch offen (vermutet, nicht geprüft)

- Ob die Initialisierung (`init()`) ohne echte Hardware sauber durchläuft.
- Dateigröße. Schätzung 300 bis 800 KB WebAssembly, als Base64 etwa ein Drittel mehr. Annahme: nur Flugsteuerung, ohne OSD, Blackbox und CLI.
- Rechenzeit pro Schritt im Browser. Annahme: deutlich unter 0,1 ms, weil die Regelschleife auf 72-MHz-Prozessoren in Echtzeit läuft.
