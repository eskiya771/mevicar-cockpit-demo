# MeviCar Next – Prototype v0.4.0

**Release-Typ:** MeviMedia- und Lichtshow-Meilenstein der installierbaren PWA  
**Live-Demo:** https://eskiya771.github.io/mevicar-cockpit-demo/

## Neu gegenüber v0.3.0

### MeviMedia 3.0 – vollständig überarbeitete Medien-Oberfläche
- Neues, touchfreundliches, an MeviCar Classic orientiertes Bibliotheks- und „Now Playing“-Layout.
- Bibliothek mit **Titel, Favoriten, Interpreten, Alben, Ordnern und Videos** sowie Suchfunktion.
- Hinzufügen lokaler Audio- und Videodateien, Ordnerfreigabe über den Browser und Zugriff auf USB-Medien, sofern Browser und Betriebssystem sie zur Auswahl anbieten.
- Browserbasierte Wiedergabe mit Play/Pause, vorherigem/nächstem Titel, Zeitleiste, Lautstärke, Shuffle, Repeat und Warteschlange.
- Favoriten werden lokal gespeichert; bei unterstützten MP3-Dateien werden ID3-Tags und eingebettete Cover ausgelesen.
- Videowiedergabe in einer separaten Vollbild-ähnlichen Ansicht.
- Angepasstes Split-Screen-Layout mit Umschaltung zwischen Bibliothek und Player.
- **Bedientasten korrigiert:** sichere untere Abstände, responsive Breiten, zentrierte SVG-Symbole und größere Touch-Flächen für den Player.

### Neue App: Lichtshow im Split-Screen
- Alle **35 echten MeviDarts-Lichteffekte** zusätzlich zum Bildschirmschoner in einer eigenständigen Cockpit-App.
- Start als Split-Screen neben der Navigation; direkte Umschaltung auf Vollbild.
- Effekt-Auswahl, vor/zurück, Pause/Fortsetzen und automatischer Wechsel mit **1-Sekunden-Testmodus** oder **24-Sekunden-Normalmodus**.
- Touch-Magie reagiert auf Eingaben innerhalb der Lichtshow.
- Animationen werden beim Verlassen der App gestoppt und beim Öffnen neu gestartet.
- Der automatische Bildschirmschoner stört die laufende Lichtshow nicht.

### Audio-Dock und Darstellung
- Die Beschriftung wechselt mit der Quelle zwischen **Radio**, **Spotify** und **Medien**.
- Zu jeder Audioquelle passt das Symbol; Spotify erhielt ein neues grün-schwarzes SVG mit Neon-Glow.
- Die Quellenauswahl wird auch in den Überschriften und im Medienbereich berücksichtigt.

### Technik und Qualitätssicherung
- MeviMedia und Lichtshow sind modular in getrennte JavaScript-/CSS-Dateien ausgelagert.
- GitHub Pages integriert die Styles und Skripte versionskonsistent in die ausgelieferte PWA.
- Erneuerter PWA-Service-Worker-Cache.
- Automatisierte Tests prüfen Medienbibliothek, Wiedergabe, Favoriten, Video sowie die Lichtshow-Steuerung und ihren Animationslebenszyklus; GitHub Pages führt beide Tests vor dem Deployment aus.

## Hinweise und Einschränkungen
- **v0.4.0 ist weiterhin ein Web-/PWA-Prototyp, keine neue Android-APK.**
- Dateiauswahl und unterstützte Audio-/Videocodecs hängen von Browser, Plattform und verfügbaren Berechtigungen ab. USB-Laufwerke sind nicht direkt ohne Browserfreigabe lesbar.
- Die übernommenen Android-ExoPlayer-/SAF-Funktionen von MeviCar Classic wurden als Web-Äquivalente umgesetzt; es gibt keine direkte Übernahme der Android-Speicherberechtigungen.
- Radio und Spotify sind nicht Bestandteil des neuen lokalen MeviMedia-Players; diese Bereiche werden separat weiterentwickelt.
- Erfolgreiche automatisierte Tests ersetzen keine vollständige Sicht- und Bedienprüfung auf allen Touchdisplays.

**Produktversion:** v0.4.0 · eine separate GitHub-Actions-Buildnummer wird automatisch vergeben.
