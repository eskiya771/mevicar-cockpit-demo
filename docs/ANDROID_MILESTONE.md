# MeviCar Next – Web + Android, Meilenstein 1

## Prinzip
Die PWA bleibt das Haupt-Testsystem und wird weiter über GitHub Pages verteilt.
Die Debug-APK ist ein **lokal gebündelter WebView-Build** derselben generierten
`dist/`-Assets, kein zweites Cockpit. Sie lädt **keine** Live-Seite als App-Shell.
`MeviPlatform` stellt zunächst rein opt-in die Geräte-Grenze bereit; bestehende
Module bleiben unverändert. Nicht implementierte Android-Funktionen liefern
`available:false`, nie simulierte Gerätewerte.

## Build und Artefakte
`.github/workflows/pages.yml` baut wie bisher die PWA. Danach baut ein
separater Android-Job ein **unsigniertes (Debug-signiertes) Test-APK-Artefakt**
mit Node 22, Capacitor 8, Android SDK/JDK und Gradle.
Der Workflow lädt die exakt zuvor erzeugten Web-Assets herunter; Änderungen an
PWA-Layout, Themes und Displayprofilen wirken dadurch auch in der APK.
Die native App deaktiviert den PWA-Service-Worker, um Konflikte mit Capacitor
zu vermeiden. GitHub Releases und VERSION werden hierfür nicht angefasst.

Das APK kann auf Android-Geräten manuell installiert werden (Debug-Build,
kein Play-Store-Release). Es ist kein dauerhaft signierter Update-Kanal.
Für eine veröffentlichte APK sind Android-Projektversionierung, Signatur,
sichere Key-Verwaltung, Release-Build und Upgrade-/Migrationstests notwendig.

## Plattform-Grenze
`window.MeviPlatform.platform()`: `web`, `ios-web` oder `android`.
`capabilities()`: Plattform-, Browser- und native Feature-Flags.
`geolocation.watch/clear`: vorhandener Browser-Fallback; native Erweiterung später.
`bluetooth.connect`, `phone.dial`, `audio.nativePlayer`,
`navigation.nativeRoute`: ausdrücklich noch nicht implementiert.
Native Plugins und Berechtigungen nur nach eigenem Auftrag ergänzen.

## Nicht im ersten Meilenstein enthalten
Kein OBD/Bluetooth, keine Anrufsteuerung, kein echter Media3-Player,
keine native Google Navigation. Auch CORS, Providerprobleme und Mixed
Content lösen sich nicht automatisch durch eine APK.
WebView, Drittanbieter-OAuth, Videoplayer, PWA-Updates, Gerätesensoren
und Safe-Areas müssen auf dem S20 FE/DeX real geprüft werden.

## Abnahmematrix
Quelle der Wahrheit bleibt [DISPLAY_PROFILE_MATRIX.md](../DISPLAY_PROFILE_MATRIX.md):
5 Querformat-Viewports × 3 Themes, zusätzlich Full/Split und reale
Touch-/Safe-Area-Prüfung. Vorliegende Node-Smokes ersetzen keinen Gerätetest.

## Lokale Reproduktion
`npm install` · PWA-`dist` wie in `pages.yml` erzeugen ·
`npx cap add android` · `npx cap sync android` ·
`cd android && ./gradlew assembleDebug`.
Ein zukünftiges fest eingechecktes Android-Projekt und Lockfile
sollen nach erfolgreichem ersten CI-Build folgen.
