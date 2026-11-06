# MeviCar Next – Arbeitsanweisungen

## Projekt und Auftrag
- Browserbasierter PWA-/Automotive-UI-Prototyp: https://github.com/eskiya771/mevicar-cockpit-demo.
- Live: https://eskiya771.github.io/mevicar-cockpit-demo/. Nicht mit der nativen Android-App `eskiya771/mevicar` verwechseln.
- Aktuelle Phase: Quality First. Bestehende Bedienung, Darstellung und Stabilität verbessern; neue Funktionsbereiche und offizielle Releases nur auf ausdrücklichen Auftrag.
- Rapid Prototyping: kleine, überprüfbare Iterationen; keine unnötigen Frameworks, Abhängigkeiten oder parallelen Architekturen.
- Architektur, tatsächliche Funktionen und offene Probleme: [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md). Bei wesentlichen Änderungen mitpflegen.

## Architektur erhalten
- `index.html`: globaler Zustand `s`, App-Registry, Navigation, SVGs, `openApp`, `launch`, `appBody`, `render`, Update-/Buildanzeige.
- Navigation ist die Hauptansicht. Normale Apps starten im Split neben der Karte; erneuter Dock-Tipp wechselt Vollbild/Split. Launcher und Settings starten über `openApp` im Vollbild.
- `render()` ersetzt den Screen-DOM. Tacho und Lichtshow vorher unmounten, danach mounten. Medienplayer lebt absichtlich außerhalb des Screen-DOM und soll Audio bei App-/Layoutwechsel erhalten.
- Module: `mevimedia.*`, `speedometer.*`, `lightshow.*`, `screensaver.*`; gemeinsame Effekte in `mevidarts-*.js`.
- CSS-Reihenfolge: Inline-Basis → `themes.css` → Saver → Media → Lichtshow → Tacho → `display-profiles.css`. Spezifität und bestehende Overrides vor Änderungen prüfen.
- Bestehende SVGs, Komponenten, Datenmodelle und Lifecycle-APIs wiederverwenden. Keine pauschalen DOM-Rerenders für Sensor-/Animationsupdates.

## UI und Daten
- Querformatprofile (CSS-Pixel): 874×402, 915×412, 1920×1200, 1920×1080, 1920×720. Details: `DISPLAY_PROFILE_MATRIX.md`.
- Themes: Original (`default`), Cyberpunk Neon City (`cyberpunk`), Liquid Glass (`liquidglass`).
- Keine globalen Scrollleisten, abgeschnittenen Bedienelemente oder Überlappungen. Listen dürfen scrollen. Touchziel möglichst mindestens 44×44 px; Abweichungen dokumentieren.
- Mobile QWERTZ-Tastatur groß halten; derzeit 72 % Kartenbreite und Dock während Adresseingabe ausgeblendet. Safe Areas und beide Querformatrichtungen prüfen.
- Demo-Daten sichtbar kennzeichnen. Navigation, Wetter, Home Assistant und OBD-App haben keine realen Dienstverbindungen. Tacho-GPS und lokale Medien sind echte Browserfunktionen.
- Keine erfundenen Fahrzeugkilometerstände. Tacho-Demo und Live-Daten getrennt halten. Keine wirkungslosen Aktionen als echte Funktion darstellen.

## Prüfen und ausliefern
- Vor Arbeit Git-Status, Branch, Remote, Dokumentation und betroffene Quellen prüfen; `git fetch origin`. Fremde Änderungen erhalten, keine automatischen Resets oder ungezielten Stashes.
- Alle fünf Smoke-Tests mit `node tests/<name>-smoke.mjs`: `mevimedia`, `lightshow`, `ui-quality`, `display-profiles`, `speedometer`.
- Tests prüfen größtenteils Mock-DOM und Quelltext. Sie ersetzen weder Browserlayout noch echte Sensor-/Medien-/Touchtests.
- Für UI-Änderungen betroffene Ansichten in allen fünf Profilen und drei Themes, bei Bedarf Vollbild/Split, mit Playwright/Chromium prüfen. Screenshots, DOM-Abmessungen, Browserfehler, Commit und Testumgebung festhalten. Keine visuelle Freigabe ohne Sichtprüfung behaupten.
- Lokale Rohdatei enthält `__MEVICAR_BUILD__`; vor Browserstart Buildmetadaten einsetzen und PWA-Assets wie im Pages-Workflow erzeugen. Kein funktionsfähiger Direktstart der unverarbeiteten `index.html` voraussetzen.
- Diff kontrollieren, Tests ausführen, vor Push erneut fetchen; bei paralleler Entwicklung Änderungen sauber integrieren und betroffene Prüfungen wiederholen. Kein Force-Push auf `main`.
- Kleine geprüfte Änderungen committen und auf den vorgesehenen Branch pushen; bei divergierendem Stand oder Reviewbedarf Feature-Branch/PR verwenden.
- Pages-Workflow und anschließend Live-`build-info.json` auf passenden Commit prüfen. Erfolgreichen Push nicht mit erfolgreichem Deployment gleichsetzen.
- Produktversion (`VERSION`), Pages-Buildnummer und SW-Cache-Version sind getrennt. `VERSION` nicht für normale Qualitätskorrekturen erhöhen: Änderungen daran auf `main` starten den Release-Workflow.
- Fertig bedeutet: Auftrag umgesetzt, passende Tests bestanden, erforderliche visuelle Prüfung erfolgt oder Einschränkung benannt, Diff geprüft, Git-/Deploymentstatus und offene Punkte ehrlich berichtet. Nach der initialen Projektübernahme auf den nächsten Entwicklungsauftrag warten.
