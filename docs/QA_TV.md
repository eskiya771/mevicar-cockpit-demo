# MeviTV – Implementierung und Prüfung

Stand: 9. November 2026.

TV ist eine eigenständige Zusatz-App mit Vollbild-/Split-Integration. Katalog: Das Erste, ZDF, ZDFneo, ZDFinfo, BR Süd, TRT 1, TRT Haber und TRT Türk. Senderkennung als lokale Textmarke (keine externen Senderlogos). Suche, Länderfilter, Favoriten sowie eigener HTTPS-Stream und lokaler M3U-Dateiimport mit Löschfunktion. Import: maximal 1 MB/100 Sender, Deduplizierung, keine HTTP-, Script- oder URL-Benutzername/Passwort-Adressen.

## Wiedergabe
Native HLS-Wiedergabe, wenn verfügbar; andernfalls lokal ausgeliefertes hls.js 1.6.15. Pages lädt die festgelegte Datei von npm/jsDelivr und prüft SHA-256 aus vendor/hls.sha256. Apache-2.0-Lizenz in vendor/hls-LICENSE.txt. Kein CDN-Aufruf zur Laufzeit. Herstellerprojekt: https://github.com/video-dev/hls.js .

Start durch Antippen eines Senders oder Start. Native Player-Steuerung für Pause/Lautstärke, Vollbild mit Safari-Fallback. Start-Timeout nach 25 Sekunden, Fehlermeldung und manuelles Neuladen, Link auf offizielle Senderseite. Späte HLS-Callbacks nach Senderwechsel/Unmount werden ignoriert; HLS-Instanz und Videoquelle werden freigegeben. Beim App-/Layoutwechsel und verborgenem Tab wird gestoppt. Favoriten, eigene Sender und letzter Sender werden lokal gespeichert.

TV stoppt lokales Radio/Medien; Spotify-Pause über bestehende API best effort. Radio/Medienstart stoppt TV über Audioquellen-Hook. Streams benötigen Internet; Oberfläche und Playerbibliothek sind offline gecacht.

## Quellen und Streamprüfung
Offizielle Einstiege: https://www.ardmediathek.de/live , https://www.zdf.de/live-tv , https://www.br.de/mediathek/live , https://www.trt.net.tr/yayin-akisi , https://www.trthaber.com/canli.html .
Alle acht Master-Playlists antworteten beim direkten HTTPS-Abruf mit HTTP 200 und EXTM3U. ZDF/TRT lieferten Access-Control-Allow-Origin: *, Das Erste/BR beim Abruf ohne Origin keinen solchen Header. Keine Garantie für CORS, Segmentabruf oder regionale Verfügbarkeit. Keine Umgehung von Geoblocking, DRM oder Login.

## Validierung
Alle neun Node-Smoke-Tests bestanden. TV-Test: Katalog, HTTPS-Validierung, M3U-Import/Deduplizierung/Grenzen, Suche/Favoriten sowie nativer Player-Lifecycle und Cleanup. Produktions-HTML lokal aus dem Pages-Workflow erzeugt, hls.js-Syntax und SHA-256 erfolgreich geprüft.

Offen: Browser-Sichtprüfung in fünf Profilen/drei Themes, echte Bild-/Tonwiedergabe, HLS.js-Playback unter Android/DeX und iOS-Vollbild. Chromium nicht verfügbar; vorausgehender Installationsversuch mit ungültigem Download-Archiv gescheitert. Keine visuelle Freigabe.
