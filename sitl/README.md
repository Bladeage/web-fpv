# Betaflight als WebAssembly (SITL)

`betaflight.wasm` ist echtes Betaflight, übersetzt für den Browser. Die Datei liegt fertig im Repository.
`npm run build` und die CI brauchen darum keinen C-Compiler.

## Neu bauen

Nur nötig, wenn sich Betaflight-Stand, `platform.c` oder `libc/` ändern.

```bash
git clone https://github.com/betaflight/betaflight.git sitl/.cache/betaflight
```

```bash
git -C sitl/.cache/betaflight checkout c5102518911f6ac4820e4656221a9deccf77e967
```

```bash
node sitl/build.mjs
```

Braucht clang mit Ziel `wasm32` und `wasm-ld` (getestet mit clang 18). Kein Emscripten.

## Inhalt

- `build.mjs`: kopiert Betaflight, ändert das Einstellungs-Register (`pg.h`, `pg.c`) und das SITL-Target, übersetzt und verlinkt.
- `platform.c`: ersetzt `src/platform/SIMULATOR/sitl.c`. Simulationszeit statt Echtzeit, keine Threads, kein Netzwerk, keine Dateien. Schnittstelle zu JavaScript: `bf_init`, `bf_step`, `bf_set_rc`, `bf_set_gyro`, `bf_set_acc`, `bf_motor`, `bf_flag`. In `bf_init` geänderte Vorgaben: PWM statt DShot, keine Startpause, kurzer Kreisel-Abgleich, Scharfschalten in jeder Lage, Schutz gegen Durchgehen beim Start aus (die Simulation begrenzt den Schub am Boden selbst).
- `libc/`: eigene kleine C-Bibliothek. Mathe-Funktionen ohne WebAssembly-Befehl kommen aus JavaScript (Import-Modul `math`).
- Hardware-Funktionen, die es im Browser nicht gibt, sind Importe aus dem Modul `env` und geben 0 zurück.

## Lizenz

Betaflight steht unter GPLv3. `betaflight.wasm` und `platform.c` (enthält Teile von `sitl.c`) damit auch.
Der zugehörige Quellcode ist der oben genannte Betaflight-Stand plus die Änderungen in `build.mjs`, `platform.c` und `libc/`.
