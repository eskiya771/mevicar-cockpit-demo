# MeviCar Next v0.5.2 – Web-App-Stand vor Android-Integration

Diese Version hält den bisherigen MeviCar-Next-Webstand als eigenständige PWA fest, bevor die Android-/Capacitor-Architektur eingeführt wird.

## Enthalten

- Bisherige Cockpit-Oberfläche mit Navigation, Medien, MeviTV, Wetter, Home Assistant, Kalender und WhatsApp.
- YouTube-Integration mit offiziellen Video-/Playlist-Einbettungen, lokalem Verlauf und Favoriten.
- Die fünf bestehenden Querformat-Displayprofile und die drei Themes bleiben erhalten.
- GitHub Pages/PWA-Veröffentlichung ohne Android- oder Capacitor-Laufzeit.

## Einordnung

- Version v0.5.2 ist ein gesicherter Web-Referenzstand, nicht die fertige Android-APK.
- YouTube benötigt für eingebettete Wiedergabe die vorhandene GPS-Stillstandserkennung; die externe Öffnung bleibt möglich.
- Reale iPhone-/Samsung-/DeX-Gerätetests und vollständige funktionale Abnahme sind weiterhin erforderlich.
- Android-Arbeiten bleiben separat im Branch `feature/android-capacitor` erhalten.

Basis-Commit vor Android-Umstellung: `30671bfd80eb4cf75b52d6a4202b9542dfa3bfca`.
