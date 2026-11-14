# MeviCar Next v0.6.0 — Stable Web/PWA (14.11.2026)

Diese Version ist der erste gemeinsame Stable-Meilenstein für Web-Cockpit und die separat signierte Android-Hybrid-App. Die Produktversion ist identisch; Web-Buildnummer und Android-Buildnummer bleiben unabhängig.

## Neu seit v0.5.3
- **Offline-Web-Paket:** Die vollständige Web-Oberfläche steht als versioniertes, SHA-256-geprüftes Paket für die Android-APK bereit. Die Hybrid-App startet aus lokal mitgelieferten Dateien, ohne die Oberfläche bei jedem Start von GitHub zu laden.
- **Manuelles Update:** Der vorhandene Update-Button lädt in der Hybrid-APK bei Bedarf eine geprüfte Web-Version herunter. Im reinen Browser bleibt das PWA-Updateverhalten erhalten. Die APK selbst wird separat über den nativen Updatebereich aktualisiert.
- **MeviTV:** Bereits konfigurierte IPTV-Listen werden beim Start im Hintergrund wiederhergestellt; der zuletzt verwendete Katalog steht direkt bereit. PIN-Speicherung in der Hybrid-APK über den geschützten nativen Speicher, einschließlich Migration älterer lokal gespeicherter PINs. Vollbilddarstellung für das Samsung-/WebView-Querformat überarbeitet.
- **Spotify:** Android-Login und Rückgabe der OAuth-Anmeldung in die Hybrid-App stabilisiert; einmalige Übergabe und Bestätigung des Anmeldecodes. Player-Layout, Titelkopf und Bedienelemente überarbeitet.
- **Tacho:** „Tacho Next“ ist der Standardtacho; die bisherige Variante bleibt als App auswählbar. Live-GPS, Fahrtstrecke und Kompass statt aktivem Demo-Modus im Haupttacho.
- **Bedienung:** Web- und App-Kennzeichnung sowie die getrennte Anzeige von Web-/APK-Builds; vereinfachte Erstkonfiguration und überarbeitete Darstellung von Einstellungen.
- **Qualität:** Erweiterte automatisierte Tests für fünf Querformatprofile, IPTV-Wiederherstellung, Android-Bridge, Spotify-Login, GPS-Tacho, Versionsanzeige und Updatepfade.

## Was offline funktioniert
- Die mitgelieferte Cockpit-Oberfläche der Hybrid-APK kann ohne erneuten Download gestartet werden.
- Karten, Standort-/Wetterdienste, Spotify, IPTV-Streams, Online-Radio und andere Online-Angebote benötigen weiterhin eine Internetverbindung bzw. gültige Anbieterzugänge.
- Ein manuelles Web-Update ändert nicht den nativen APK-Code.

## Bekannte Grenzen
- IPTV-Wiedergabe ist abhängig von Quelle, Streamformat, Anbieterlimits und ggf. der eigenen Bridge/Proxy-Infrastruktur. Ein grüner automatischer Test ist kein Beleg für die Stabilität jedes Live-Streams.
- Spotify benötigt Premium und eine korrekt hinterlegte Client-ID. Browser, iOS und Android-WebView unterscheiden sich; insbesondere die Audiowiedergabe auf iOS bleibt vom Gerät abhängig.
- Echte GPS-/Kompassfunktion braucht Sensor-/Standortfreigaben; Drehzahl und Gesamtkilometerstand benötigen Fahrzeugdaten und werden nicht aus GPS erfunden.
- Die automatisierten Smoke- und CI-Tests ersetzen keinen abschließenden Praxistest auf dem Samsung S20 FE und iPhone.
- Der Android-Stable-Release wird separat im Repository `eskiya771/mevicar-next` mit unveränderter dauerhafter Signatur und eigenem APK-Build veröffentlicht.

Web-App: https://eskiya771.github.io/mevicar-cockpit-demo/
