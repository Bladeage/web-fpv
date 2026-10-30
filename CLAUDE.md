# Arbeitsregeln für Claude Code

- Lies zuerst `docs/handover-2026-10-30.md` und `docs/PLAN.md`.
- Arbeite in Etappen. Pro Sitzung genau eine Etappe: umsetzen, prüfen, committen, kurz berichten, dann anhalten und auf Freigabe warten.
- Keine Bibliotheken, keine externen Quellen, keine CDNs. Nur HTML, CSS, JavaScript und WebGL2. Build und Tests nur mit Node-Standardmodulen.
- Die `.aspx`-Ausgabe muss reines ASCII sein und darf kein `<%` enthalten. Immer über den Konverter erzeugen (`npm run build` nutzt `tools/aspx.mjs`).
- Vor jedem Commit: `npm run build` und `npm test`.
- Regeln für Module in `src/` (der Build prüft sie): nur `import { a, b } from './x.js';` in einer Zeile, ohne `as`. Nur `export const|let|function|class`. Kein Name doppelt auf oberster Ebene über alle Module. Werte, die mehrere Module neu setzen, liegen in einem Objekt (zum Beispiel `game` in `state.js`).
- Module ohne DOM bleiben ohne DOM: `math`, `format`, `state`, `world`, `physics`, `gamepad`, `scenario`, `drone`, `osd`, `signal`, `targets`. Ton und Vibration erreicht die Physik nur über `fx`.
- `test/fixtures/legacy-trace.json` ist die Referenz aus `legacy/`. Seit E1 vergleicht der Test nur noch Hindernisse, Tore und Drohnenmodell; die Flugbahnen weichen absichtlich ab.
- Physik von DOM und WebGL trennen, damit sie in Node testbar bleibt.
- Feste Physik-Schrittweite 1/240 s beibehalten, solange der Plan nichts anderes sagt.
- Zahlenwerte für Drohnen, Akkus und Motoren als Schätzung kennzeichnen und die Annahme im Kommentar nennen.
- `legacy/` nicht ändern. Es ist die Referenz für das Verhalten.
- Berichte an den Nutzer: einfaches Deutsch, kurze Sätze, gesichert und vermutet klar trennen. Der Nutzer hat wenig Code-Praxis. Erkläre Schritte, ohne zu vereinfachen.
- Bei offenen Entscheidungen den Vorschlag aus der Übergabe nehmen und im Bericht nennen.
