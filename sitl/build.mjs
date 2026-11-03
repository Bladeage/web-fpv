// Betaflight als WebAssembly bauen (SITL im Browser). Eigenes Werkzeug, nicht Teil von `npm run build`:
// Das Ergebnis sitl/betaflight.wasm liegt im Repository, die CI braucht also keinen C-Compiler.
// Aufruf: node sitl/build.mjs <Pfad zum Betaflight-Quellcode>
// Braucht: clang mit Ziel wasm32 und wasm-ld (getestet mit clang 18). Kein Emscripten.
// Betaflight-Stand: siehe BF_COMMIT. Lizenz Betaflight: GPLv3.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';

export const BF_COMMIT = 'c5102518911f6ac4820e4656221a9deccf77e967';   // Betaflight master vom 03.11.2026
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(process.argv[2] || join(HERE, '.cache/betaflight'));
const WORK = join(HERE, '.cache/work'), OBJ = join(HERE, '.cache/obj');
const OUT = join(HERE, 'betaflight.wasm');
if (!existsSync(join(SRC, 'src/main'))) { console.error('Betaflight-Quellcode fehlt: ' + SRC); process.exit(1); }

// 1. Arbeitskopie und Änderungen für WebAssembly
rmSync(WORK, { recursive: true, force: true });
cpSync(join(SRC, 'src'), join(WORK, 'src'), { recursive: true });
cpSync(join(SRC, 'lib'), join(WORK, 'lib'), { recursive: true });
const patch = (file, pairs) => {
  const p = join(WORK, file); let s = readFileSync(p, 'utf8');
  for (const [a, b] of pairs) { if (!s.includes(a)) throw new Error(file + ': Stelle nicht gefunden: ' + a.slice(0, 60)); s = s.replace(a, b); }
  writeFileSync(p, s);
};
// Register ohne Linker-Skript: Einträge und Vorlagen melden sich per Konstruktor an (wasm-ld kennt keine Start-/Endmarken).
patch('src/main/pg/pg.h', [
  ['#ifdef __APPLE__\nextern const pgRegistry_t __pg_registry_start[]',
   `#if defined(__wasm__)
extern const pgRegistry_t *pgWasmRegistry[];
extern int pgWasmCount;
void pgWasmAdd(const pgRegistry_t *reg);
void pgWasmAddTemplate(const void *tpl);
bool pgWasmIsTemplate(const void *ptr);
#define PG_REGISTER_ATTRIBUTES
#define PG_RESETDATA_ATTRIBUTES
#define PG_WASM_ADD(_name) __attribute__((constructor)) static void _name ## _pgWasmAdd(void) { pgWasmAdd(&_name ## _Registry); }
#define PG_WASM_TPL(_name) __attribute__((constructor)) static void _name ## _pgWasmTpl(void) { pgWasmAddTemplate(&pgResetTemplate_ ## _name); }
#elif defined(__APPLE__)
extern const pgRegistry_t __pg_registry_start[]`],
  ['#define PG_REGISTRY_SIZE (__pg_registry_end - __pg_registry_start)',
   `#if defined(__wasm__)
#define PG_REGISTRY_SIZE (pgWasmCount)
#define PG_FOREACH(_name) \\
    for (int _name ## _i = 0; _name ## _i < pgWasmCount; _name ## _i++) for (const pgRegistry_t *(_name) = pgWasmRegistry[_name ## _i]; (_name); (_name) = 0)
#else
#define PG_WASM_ADD(_name)
#define PG_WASM_TPL(_name)
#define PG_REGISTRY_SIZE (__pg_registry_end - __pg_registry_start)`],
  ['    for (const pgRegistry_t *(_name) = __pg_registry_start; (_name) < __pg_registry_end; _name++)\n',
   '    for (const pgRegistry_t *(_name) = __pg_registry_start; (_name) < __pg_registry_end; _name++)\n#endif\n'],
  ['    extern const pgRegistry_t _name ## _Registry;                       \\\n    const pgRegistry_t _name ##_Registry PG_REGISTER_ATTRIBUTES = {',
   '    extern const pgRegistry_t _name ## _Registry;                       \\\n    PG_WASM_ADD(_name)                                                  \\\n    const pgRegistry_t _name ##_Registry PG_REGISTER_ATTRIBUTES = {'],
  ['    extern const pgRegistry_t _name ##_Registry;                        \\\n    const pgRegistry_t _name ## _Registry PG_REGISTER_ATTRIBUTES = {',
   '    extern const pgRegistry_t _name ##_Registry;                        \\\n    PG_WASM_ADD(_name)                                                  \\\n    const pgRegistry_t _name ## _Registry PG_REGISTER_ATTRIBUTES = {'],
  ['#define PG_RESET_TEMPLATE(_type, _name, ...)                            \\\n    const _type',
   '#define PG_RESET_TEMPLATE(_type, _name, ...)                            \\\n    extern const _type pgResetTemplate_ ## _name;                       \\\n    PG_WASM_TPL(_name)                                                  \\\n    const _type'],
]);
patch('src/main/pg/pg.c', [
  ['    if (reg->reset.ptr >= (void*)__pg_resetdata_start && reg->reset.ptr < (void*)__pg_resetdata_end) {',
   `#if defined(__wasm__)
    if (pgWasmIsTemplate(reg->reset.ptr)) {
#else
    if (reg->reset.ptr >= (void*)__pg_resetdata_start && reg->reset.ptr < (void*)__pg_resetdata_end) {
#endif`],
]);

// Target: ohne MAVLink (Unterprojekt, nicht nötig) und ohne Threads
patch('src/platform/SIMULATOR/target/SITL/target.h', [
  ['#define ENABLE_SIMULATOR_MULTITHREAD 1', '#define ENABLE_SIMULATOR_MULTITHREAD 0'],
  ['#define TARGET_FLASH_SIZE', '#undef USE_SERIALRX_MAVLINK\n#undef USE_TELEMETRY_MAVLINK\n#define TARGET_FLASH_SIZE'],
]);

// 2. Quelldateien: alle gemeinsamen Dateien aus mk/source.mk, ohne Prozessor-Treiber und ohne den Netzwerk-SITL
const mk = readFileSync(join(SRC, 'mk/source.mk'), 'utf8');
const listed = [...new Set(mk.match(/[A-Za-z0-9_/]+\.c\b/g))];
const SKIP = [/^drivers\/flash/, /^drivers\/sdcard/, /^msc\//, /^io\/asyncfatfs/, /^drivers\/usb/, /^vcp/, /^startup/, /^drivers\/serial_usb/, /^io\/displayport_oled/, /^drivers\/display_ug2864/, /^drivers\/rx\/rx_xn297/, /^telemetry\/(crsf|ghst|srxl)\.c/,
  // Hardware-Treiber ohne Nutzen im Browser (SPI, DShot, Funkchips, MPU-Kreisel, OSD-Chip, UART)
  /^drivers\/(dshot|bus_spi|max7456|serial_uart|vtx_rtc6705)\.c/, /^drivers\/accgyro\/accgyro_mpu/, /^drivers\/rx\/rx_(spi|sx127x|sx1280|cc2500|a7105|nrf24)/, /^rx\/(expresslrs|cc2500_|a7105|nrf24|cyrf|spektrum_spi|flysky|sfhss)/];
const files = listed.filter(f => existsSync(join(WORK, 'src/main', f)) && !SKIP.some(r => r.test(f))).map(f => join(WORK, 'src/main', f));
files.push(join(HERE, 'libc/libc.c'), join(HERE, 'platform.c'));

const INC = ['-I' + join(HERE, 'libc'), '-I' + join(WORK, 'src/main'), '-I' + join(WORK, 'src/platform/SIMULATOR'),
  '-I' + join(WORK, 'src/platform/SIMULATOR/include'), '-I' + join(WORK, 'src/platform/SIMULATOR/target/SITL'),
  '-I' + join(WORK, 'src/config'), '-I' + join(WORK, 'lib/main/MAVLink'), '-I' + join(WORK, 'lib/main/google/olc'), '-I' + join(WORK, 'lib/main/dyad')];
const CFLAGS = ['--target=wasm32', '-O2', '-ffreestanding', '-fno-builtin-printf', '-std=gnu17', '-w',
  '-DSIMULATOR_BUILD', '-DUSE_PARAMETER_GROUPS', '-D__TARGET__="SITL"', '-D__FORKNAME__="betaflight"', '-D__REVISION__="' + BF_COMMIT + '"',
  ...INC];

// 3. Übersetzen (parallel), Fehler sammeln
rmSync(OBJ, { recursive: true, force: true }); mkdirSync(OBJ, { recursive: true });
const objs = [], failed = [];
const jobs = files.map((f, i) => ({ f, o: join(OBJ, i + '_' + f.split('/').pop().replace(/\.c$/, '.o')) }));
const { spawn } = await import('node:child_process');
let next = 0;
await Promise.all(Array.from({ length: cpus().length }, async () => {
  while (next < jobs.length) {
    const j = jobs[next++];
    const ok = await new Promise(res => {
      const p = spawn('clang', [...CFLAGS, '-c', j.f, '-o', j.o]); let err = '';
      p.stderr.on('data', d => { err += d; });
      p.on('close', c => res(c === 0 ? true : err));
    });
    if (ok === true) objs.push(j.o); else failed.push([j.f.replace(WORK + '/', ''), String(ok).split('\n').find(l => l.includes('error')) || '']);
  }
}));
if (failed.length) {
  console.log('Nicht übersetzt (' + failed.length + '):');
  for (const [f, e] of failed) console.log('  ' + f + ': ' + e.replace(/^.*error: /, ''));
}
if (process.argv.includes('--compile-only')) process.exit(0);

// 4. Verlinken. Fehlende Funktionen werden Importe aus JavaScript (Modul "env"); fehlende Daten sind Fehler.
const exports = ['__wasm_call_ctors'];   // bf_* exportiert platform.c selbst (export_name)
const ld = ['--target=wasm32', '-nostdlib', '-Wl,--no-entry', '-Wl,--allow-undefined', '-Wl,--gc-sections', '-Wl,-z,stack-size=262144',
  '-Wl,--initial-memory=4194304', ...exports.map(e => '-Wl,--export=' + e), '-o', OUT, ...objs];
try { execFileSync('clang', ld, { stdio: ['ignore', 'inherit', 'pipe'] }); }
catch (e) { console.error(String(e.stderr).split('\n').slice(0, 40).join('\n')); process.exit(1); }
const mod = new WebAssembly.Module(readFileSync(OUT));
const imp = WebAssembly.Module.imports(mod).filter(i => i.module === 'env').map(i => i.name);
console.log(OUT + ': ' + readFileSync(OUT).length + ' Bytes, ' + objs.length + ' Dateien, ' + imp.length + ' fehlende Funktionen (Importe)');
writeFileSync(join(HERE, '.cache/imports.txt'), imp.join('\n') + '\n');
