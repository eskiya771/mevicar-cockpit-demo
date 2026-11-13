# Erste MeviCar Next Android Test-APK

Branch: `feature/android-first-apk` (getrennt von `main` und der weiterhin unveränderten PWA).

Build: [.github/workflows/android-apk.yml](../.github/workflows/android-apk.yml)

## Installation

1. Auf GitHub unter **Actions → Build MeviCar Next Android Debug APK** den letzten **erfolgreichen** Lauf dieses Branches öffnen.
2. Unter **Artifacts** die Datei `MeviCar-Next-Android-Debug` herunterladen. Die ZIP-Datei entpacken.
3. `app-debug.apk` auf das Samsung S20 FE übertragen und installieren. Android fragt gegebenenfalls nach der Freigabe **Diese Quelle zulassen**.
4. MeviCar Next im Querformat öffnen. Dock, App-Liste, Vollbild, Split-Screen, Tacho und lokale HTML-Ansichten kontrollieren.

Es handelt sich um eine **Debug-APK**, keine signierte Play-Store-Veröffentlichung. Die Debug-Signatur von GitHub Actions ist nicht garantiert von Build zu Build identisch. Spätere Updates können deshalb eine Deinstallation und Neuinstallation erfordern. Lokal gespeicherte App-Daten gehen dann verloren.

### Grenzen des ersten Tests

- Der Web-Code wird lokal im Capacitor WebView ausgeliefert, nicht als Live-URL von GitHub Pages. Änderungen benötigen einen neuen APK-Build.
- Externe APIs benötigen Internet. Google Maps API-Key-Referrer-Beschränkungen, Spotify- und Google-OAuth-Redirects müssen für die native Origin gesondert geprüft werden.
- Reines WebView umgeht CORS und die HTTPS-Mixed-Content-Beschränkungen für MeviTV nicht automatisch. Ein nativer Media3-Player ist noch nicht eingebaut.
- Native OBD/Bluetooth-, Telefon-, Hintergrund-Audio- und Android-Navigationsbridges sind **noch nicht umgesetzt**.
- Die PWA-Service-Worker-Registrierung wird ausschließlich im generierten APK-Webbundle entfernt.
- Eine bestandene GitHub-Action bestätigt die Kompilierung, nicht die vollständige Funktion jeder App auf dem Gerät.

## Ablauf

GitHub Actions führt zuerst die bestehenden Web-/Aktien-/Navigationstests aus, erstellt `dist/` wie die Web-Veröffentlichung, ergänzt den Adapter `MeviPlatform`, entfernt die PWA-Registrierung, erzeugt das Capacitor-Android-Projekt, setzt `sensorLandscape` und die MeviCar-Icons und kompiliert `assembleDebug`. Die Debug-APK wird 30 Tage als Artefakt bereitgestellt.
