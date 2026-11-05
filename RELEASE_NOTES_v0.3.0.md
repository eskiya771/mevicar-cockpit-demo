# MeviCar Next – Prototype v0.3.0

**Release-Typ:** UI-/PWA-Prototyp – Bildschirmschoner- und Lichteffekt-Release  
**Live-Demo:** https://eskiya771.github.io/mevicar-cockpit-demo/

## Neu gegenüber v0.2.0

### MeviCar Neon-Bildschirmschoner
- Globaler Vollbild-Bildschirmschoner mit Neon-Lichteffekten und dunklem Hintergrund.
- Optional animierter **MEVICAR NEXT**-Schriftzug mit großer Uhr und Datum.
- Langsame Bewegung von Text und Logo zur Verringerung statischer Bildinhalte.
- Beenden durch Touch, Maus oder Tastatur; Rückkehr zur vorherigen Ansicht.
- Kein automatisches Einblenden bei aktiver Navigation oder eingeschaltetem GPS.
- Rücksicht auf die Systemeinstellung *Bewegung reduzieren*.

### Vollständige MeviDarts-Lichtbibliothek – 35 Effekte
Die Animationen stammen aus `eskiya771/mevidarts` und verwenden den dortigen Canvas-Renderer sowie die Parallax- und Showcase-Module.

**20 klassische Effekte:** Polarlicht, Sternenflug, Matrix, Plasma, Lichtspuren, Wellen, Feuerwerk, Kaleidoskop, Lava, Partikelnetz, Retro-Tunnel, DVD, Seifenblasen, Schneefall, Glühwürmchen, Konfetti, Hypnospirale, Sonnenfinsternis, Neonraster, Regenbogen.

**5 Parallax-Szenen:** Pixel-Hügel, Zauberwald, Cyber-City, Wüstenreise, Space-Shooter.

**10 Showcase-Szenen:** Synthwave-Fahrt, Unterwasserwelt, Schwarzes Loch, Pixel-Regenstadt, Weltraum-Nebel, Glas-Labyrinth, Japanische Nacht, Darts-Galaxie, Touch-Magie, Retro-Spielwelt.

Bei **Touch-Magie** erzeugt die Bildschirmschoner-Version automatische Lichtimpulse, damit ein Fingertipp weiterhin zuverlässig den Bildschirmschoner beendet.

### Neue Einstellungen
Unter **Apps → Settings → Bildschirmschoner**:
- Aktivieren oder deaktivieren
- Start nach 30 Sekunden, 1 Minute, 2 Minuten oder 5 Minuten
- Einzelnen der 35 Effekte auswählen oder automatisch durchlaufen lassen
- **1 Sek. · Test** zum schnellen Prüfen aller Effekte oder **24 Sek. · Normal**
- Uhr + Logo oder nur Lichteffekte
- **Jetzt ausprobieren** für eine sofortige Vollbild-Vorschau
- Speicherung der Einstellungen lokal auf dem Gerät

### Technische Änderungen
- MeviDarts-Module als eigene Dateien eingebunden; Original-Rendering für 35 Effekte wiederverwendet.
- GitHub-Pages-Build integriert HTML, CSS und JavaScript versionskonsistent.
- PWA-Service-Worker-Cache für die zusätzlichen Module erweitert.
- Technischer Canvas-Rendertest: **35 von 35 Effekten erfolgreich**, ohne Exceptions.
- Automatisches GitHub-Pages-Deployment und separate Buildnummer bleiben erhalten.

## Hinweise
- **Prototype v0.3.0** ist eine testbare PWA-Version, keine vollständig produktionsreife Fahrzeug-Infotainmentlösung.
- Einige Cockpit-Apps sind weiterhin Demonstrationen ohne reale Fahrzeuganbindung.
- Der erfolgreiche Renderer- und Buildtest ersetzt keinen visuellen Test auf iPhone, Samsung oder externem Touchdisplay.
- Der Bildschirmschoner kann den Hardware-Bildschirm nicht unabhängig von Betriebssystem-Sperre, Standby oder Energiesparmodus wach halten.
