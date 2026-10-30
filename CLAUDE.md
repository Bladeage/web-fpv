# Arbeitsregeln für Claude Code

- Lies zuerst `docs/handover-2026-10-30.md` und `docs/PLAN.md`.
- Arbeite in Etappen. Pro Sitzung genau eine Etappe: umsetzen, prüfen, committen, kurz berichten, dann anhalten und auf Freigabe warten.
- Keine Bibliotheken, keine externen Quellen, keine CDNs. Nur HTML, CSS, JavaScript und WebGL2. Build und Tests nur mit Node-Standardmodulen.
- Die `.aspx`-Ausgabe muss reines ASCII sein und darf kein `<%` enthalten. Immer über den Konverter erzeugen.
- Physik von DOM und WebGL trennen, damit sie in Node testbar bleibt.
- Feste Physik-Schrittweite 1/240 s beibehalten, solange der Plan nichts anderes sagt.
- Zahlenwerte für Drohnen, Akkus und Motoren als Schätzung kennzeichnen und die Annahme im Kommentar nennen.
- `legacy/` nicht ändern. Es ist die Referenz für das Verhalten.
- Berichte an den Nutzer: einfaches Deutsch, kurze Sätze, gesichert und vermutet klar trennen. Der Nutzer hat wenig Code-Praxis. Erkläre Schritte, ohne zu vereinfachen.
- Bei offenen Entscheidungen den Vorschlag aus der Übergabe nehmen und im Bericht nennen.
