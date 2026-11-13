# MeviCar Next – Spotify ohne installierte Spotify-App (Android, Web)

## Architektur
MeviCar Next stellt Radio, MeviMedia und Spotify über denselben Audio-Quellenumschalter dar. Spotify nutzt die vorhandene Web-App-Oberfläche mit Suche, Bibliothek, Playlists, Cover, Favoriten, Wiedergabesteuerung und Lautstärke.

**Anmeldung:** Nur die öffentliche Spotify Client-ID wird eingegeben, dazu einmalige Spotify-Kontoautorisierung über OAuth Authorization Code + PKCE. Kein Client Secret, kein Spotify-Passwort in MeviCar. Spotify Premium erforderlich.

**Wiedergabe:** Die Web-App nutzt den offiziellen Spotify Web Playback SDK. In der Hybrid-APK wird ebenfalls der Web-Player probiert, **nicht** die im Hintergrund laufende Spotify-Android-App. Spotify unterstützt den SDK in mobilen Browsern, aber unterstützt DRM-Wiedergabe innerhalb von Android WebView nicht explizit. Daher ist Live-Wiedergabe innerhalb der APK nicht garantiert.

## Web/Android Redirect-URIs im Spotify Dashboard
- Web: `https://eskiya771.github.io/mevicar-cockpit-demo/`
- APK OAuth per externem Browser: `mevicarnext://spotify-callback`

Die App ruft die Spotify-Login-Seite im Standardbrowser auf; der Callback geht zurück in die Hybrid-App. Danach versucht der integrierte Player Wiedergabe direkt im WebView.

## Browser-Ausweichweg
Wenn der Android WebView die Spotify-DRM-Engine nicht bereitstellt oder der Web Playback SDK mit initialization_error scheitert, zeigt die Spotify-Oberfläche den Grund und **Im Browser öffnen**. Diese Funktion öffnet die MeviCar-Web-App mit Chrome/systemeigenem Browser, ohne die Spotify-App zu benötigen. Browser und WebView besitzen getrennten Speicher: Client-ID und OAuth können im Browser einmalig neu nötig sein.

## Abnahme
- Automatische Smoke-Tests prüfen OAuth-PKCE, keine Spotify-App-Remote-Nutzung für den Audiopfad, integrierte Oberfläche und DRM-Fehlerzustände.
- Auf dem realen Galaxy S20 FE muss Spotify Premium-Wiedergabe im Android WebView und gegebenenfalls im Browser geprüft werden. CI kann Widevine auf dem Telefon nicht simulieren.
- App Remote SDK wird von der Android-Hybrid-App im nächsten Schritt vollständig entfernt.
