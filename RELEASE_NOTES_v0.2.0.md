# MeviCar Next — Prototype v0.2.0

**Release-Typ:** Neuer UI-/PWA-Prototyp-Meilenstein  
**Basis:** GitHub Pages mit automatisiertem Build und installierbarer PWA  
**Demo:** https://eskiya771.github.io/mevicar-cockpit-demo/

## Highlights seit Prototype v0.1.0

### Drei Designwelten
- **Original:** vertrauter dunkelblauer Cockpit-Look.
- **Cyberpunk Neon City:** großer, farbiger Classic-inspirierter Vektor-App-Launcher auf fast schwarzem Hintergrund, dezente Kachelrahmen, Neon-Glows.
- **Liquid Glass:** sanfte transparente Glasflächen, Lichtreflexionen und weiche Ecken.
- Umschalten mit Vorschaukarten unter **Apps → Settings**, sofortige Anwendung und Speicherung im Browser.

### Einheitliche Icons
- Eigenständige skalierbare SVG-Piktogramme für alle Zusatz-Apps.
- Dieselbe Symbolsprache im linken/unteren Dock, inklusive **Navi, Audio, Telefon, Tacho, Apps** sowie dynamischem Zusatzslot.
- Neue abgestimmte Icons für **Update, Vollbild/Beenden, GPS, LTE, Zurück und Schließen**.
- Inaktive Symbole zurückhaltend, aktive mit zur App passendem Farbakzent.

### Bedienung & Split-Screen
- Apps, die aus der Split-Screen-App-Übersicht geöffnet werden, starten im Split-Screen.
- Durch erneutes Tippen auf dieselbe Dock-App zwischen Split-Screen und Vollbild umschalten.
- App-Übersicht auch in geteilten Layouts.

### PWA & Auslieferung
- Installierbare PWA für iPhone und Windows; iOS-Standalone-Unterstützung und optionaler Windows-Edge-Kioskmodus.
- PWA-Caching aktualisiert; Theme-CSS wird beim GitHub-Pages-Build in die versionierte HTML-Datei eingebettet, um veraltete getrennte Stylesheets zu vermeiden.
- Automatisches GitHub-Pages-Deployment, getrennte **Produktversion** und **GitHub-Actions-Buildnummer**, Update-Prüfung.

## Testumfang & Einschränkungen
- Prototyp für UI/UX-Tests, keine produktionsreife Fahrzeug-Software.
- Einige Apps sind interaktive Demo-Ansichten, keine voll integrierten Produktivdienste.
- GPS und Kompass benötigen Berechtigungen und passende Gerätesensoren.
- Erfolgreiche GitHub-Actions-Builds sind kein Ersatz für vollständige geräteübergreifende Funktionstests.

## Versionskonvention
Die Produktversion bleibt bei **v0.2.0**, während GitHub Actions neue Buildnummern vergeben (Anzeige: **v0.2.0 · Build N**).

> Hinweis: Diese Datei dokumentiert den Meilenstein. Ein offizielles GitHub-Release mit Git-Tag muss separat angelegt werden, sofern der verfügbare GitHub-Zugriff keine Release-Schreibfunktion bereitstellt.
