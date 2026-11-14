# MeviCar Next – Spotify ohne installierte Spotify-App (Android, Web)

## Architektur
MeviCar Next stellt Radio, MeviMedia und Spotify über denselben Audio-Quellenumschalter dar. Spotify nutzt die vorhandene Web-App-Oberfläche mit Suche, Bibliothek, Playlists, Cover, Favoriten, Wiedergabesteuerung und Lautstärke und läuft wie jede normale App im Split neben der Navigation.

**Anmeldung:** Nur die öffentliche Spotify Client-ID wird eingegeben, dazu einmalige Spotify-Kontoautorisierung über OAuth Authorization Code + PKCE. Kein Client Secret, kein Spotify-Passwort in MeviCar. Spotify Premium erforderlich.

**Wiedergabe:** Die Web-App nutzt den offiziellen Spotify Web Playback SDK (EME/Widevine). In der Hybrid-APK läuft derselbe Web-Player im WebView, **nicht** die Spotify-Android-App und kein App Remote SDK.

## Web/Android Redirect-URIs im Spotify Dashboard
- Web: `https://eskiya771.github.io/mevicar-cockpit-demo/`
- APK OAuth per externem Browser: `mevicarnext://spotify-callback`

## OAuth-Rückruf in der Hybrid-APK
Der Autorisierungscode ist ein Einmalwert. Es gibt genau einen Besitzer je Seite und genau einen Übergabeweg:

1. Web erzeugt State und PKCE-Verifier, speichert sie 10 Minuten in localStorage (`mevicar-spotify-auth-v1`) und sendet `spotify.authorize` an Android. Android öffnet die geprüfte Spotify-URL im externen Browser.
2. Der Deep Link `mevicarnext://spotify-callback?...` landet im prozessweiten `SpotifyCallbackGate`. Android schreibt den Code nie in JavaScript-Quelltext und wiederholt nichts über eigene Timer.
3. Android meldet nur einen geheimnisfreien Hinweis (`Spotify-Rückruf liegt bereit`) bei Seitenende, `onResume`, Fensterfokus und `spotify.ready`.
4. Web holt den Rückruf mit `spotify.callback.pull` über die herkunftsgeprüfte WebMessage-Brücke, prüft State und Alter und tauscht den Code genau einmal gegen Tokens.
5. Erst nach endgültigem Ergebnis (Token gespeichert, Spotify lehnt ab, State passt nicht, Anfrage abgelaufen) sendet Web ein einziges `spotify.callback.ack {state}`. Android gibt den Code nur bei passendem State frei und merkt sich einen SHA-256-Fingerabdruck, damit ein wieder zugestellter Start-Intent nicht erneut verarbeitet wird.
6. Netz- oder Brückenfehler sind kein endgültiges Ergebnis: Code und PKCE-Anfrage bleiben erhalten, Web wiederholt nach 3, 8 und 15 Sekunden sowie bei jedem neuen Hinweis.

In `spotify.js` läuft je Rückruf höchstens eine Verarbeitung (`oauthInFlight`); `processCallback` endet mit `done` (endgültig, wird bestätigt), `ignored` (gehört zu keiner offenen Anmeldung, wird freigegeben) oder `retry` (Transportfehler, nichts wird bestätigt).

## Diagnose
Der Einrichtungsbildschirm zeigt ein dauerhaft gespeichertes Ereignisprotokoll (Anmeldung und Wiedergabe) und die Schaltfläche **Rückruf jetzt abholen**. `meviSpotifyDebug()` liefert dieselben Daten. Codes, Tokens, State und PKCE-Verifier erscheinen weder im Protokoll noch in Android-Logs.

## Wiedergabe im Android WebView
- Spotify nennt als unterstützte Umgebungen des Web Playback SDK Chrome, Firefox, Safari und Edge. Der Android System WebView wird nicht genannt: **nicht offiziell unterstützt, technisch möglich, auf dem Gerät noch nicht nachgewiesen.**
- Bis Build 53 hat die APK die WebView-Berechtigung `RESOURCE_PROTECTED_MEDIA_ID` nie erteilt. Ohne sie verweigert der WebView Widevine. Ab dem folgenden Build wird ausschließlich diese Berechtigung und ausschließlich für `https://eskiya771.github.io` und `https://sdk.scdn.co` erteilt, solange das Hauptdokument die vertrauenswürdige MeviCar-Seite ist.
- `mediaPlaybackRequiresUserGesture` ist ausgeschaltet, weil der SDK Audio in einem fremden iframe startet, in dem die Nutzergeste aus dem MeviCar-Dokument nicht gilt.
- Die Web-App prüft Widevine mit `navigator.requestMediaKeySystemAccess` und protokolliert Ergebnis, SDK-Fehlerereignisse, `connect()`, Geräteregistrierung und Übertragung der Wiedergabe. Fehlendes DRM wird angezeigt, nicht umgangen.

## Browser-Ausweichweg
Wenn der Android WebView die Spotify-DRM-Engine nicht bereitstellt oder der Web Playback SDK mit `initialization_error` scheitert, zeigt die Spotify-Oberfläche den Grund und **Im Browser öffnen**. Das öffnet die MeviCar-Web-App im Systembrowser. Dieser Weg erfüllt die Anforderung „Spotify innerhalb der MeviCar-Oberfläche" nicht und ist nur Notbehelf und Diagnosehilfe.

## Abnahme
- Automatische Smoke-Tests (`spotify-smoke`, `spotify-android-smoke`, `spotify-oauth-race-smoke`, Android `SpotifyCallbackGateTest`) prüfen PKCE, die Einmal-Code-Übergabe, die Bestätigungsreihenfolge und die Geheimnisfreiheit der Diagnosen.
- Sie beweisen keine DRM-Wiedergabe. Ton aus dem Android WebView muss auf dem realen Galaxy S20 FE mit Spotify Premium abgenommen werden.
