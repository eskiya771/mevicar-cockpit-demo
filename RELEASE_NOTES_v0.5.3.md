# MeviCar Next v0.5.3 – stabilisierte Web-App

Dieser Web-Release baut auf v0.5.2 auf. Die Android-/Capacitor-Entwicklung bleibt separat im Branch `feature/android-capacitor`.

## Änderungen
- iPhone-Querformat: Appübersicht mit kompakterem 5×4-Raster und einheitlicheren Icons; Dock und Split-Verhalten bleiben unverändert.
- Aktienansicht: Umstellung auf das kostenlose, offiziell einbettbare TradingView-Chart mit historischen Kurszeiträumen. Aktienliste, Favoriten und benutzerdefinierte Symbole bleiben lokal im Browser.
- Siemens, Tesla, NVIDIA, Apple und DAX als Voreinstellungen; DAX-Ticker korrigiert auf `TVC:DEU40`. Bereits gespeicherte `INDEX:DEU40`-Einträge und Favoriten werden übernommen.
- Entferntes, irreführendes hartkodiertes `Cockpit Lab 2.5.0` im Seitenkopf.
- CI: Aktien-Regressionstests, Layouttests der fünf Querformatprofile plus zwei Split-Ansichten und Vorabtests als Schranke für das offizielle GitHub-Release.

## Nicht geändert
- Die eigenständige Home-Assistant-App bleibt erhalten. Die Aktien-App benötigt keine Home-Assistant-Sensoren und keinen zusätzlichen Finanz-API-Key.
- Navigation, MeviTV, Spotify, YouTube, sonstige Cockpit-Apps sowie Android-Branch bleiben funktional unverändert.

## Grenzen und Abnahme
- TradingView wird als externer Online-Widget-Dienst geladen. Ein Inhaltsblocker, fehlende Internetverbindung oder eine Widget-Änderung kann die Anzeige verhindern.
- Historische Chartdaten werden von TradingView bereitgestellt. Die App besitzt keine eigene Börsendaten-API und bietet keine Garantie für Echtzeitkurse.
- Automatische Browserprüfungen verwenden für das externe Widget eine lokale, deterministische Testeinbettung. Ein echter Live-Chart und iPhone-Gerätetest müssen separat bestätigt werden.
- Diese Version ist ein Web-/PWA-Release, **keine** Android-APK.
