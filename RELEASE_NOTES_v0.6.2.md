# MeviCar Next Web v0.6.2 — Stand vor der plattformübergreifenden Architektur (16.11.2026)

Dieser Release sichert den aktuellen Stand der **reinen Web-/PWA-Version** vor der Entwicklung einer gemeinsamen Benutzeroberfläche für Web und Android. Die vorhandene Hybrid-Android-APK wird durch diesen Web-Release weder verändert noch neu signiert.

## Änderungen gegenüber v0.6.1
- Browserbasierte Zielsuche im Vollbild, an Fables Android-Beta angelehnt: Schnellziele (Zuhause/Arbeit), POI-Kategorien, „Zuletzt“ und „Gespeichert“.
- Web-Adressbuch mit Favoriten und zuletzt verwendeten Zielen sowie Bearbeiten, Entfernen, Filter, Import und Export.
- Web-only Erweiterung: die Android-APK behält ihre native Google-Places-Suche, ihr natives Adressbuch und die Google-Navigation-SDK-Integration unverändert.
- Web-Navigation mit verbessertem GPS-/Routenverhalten und Korrekturen bei Road-Assist-Fahrtenhistorie, Neuberechnungen sowie Blitzerwarnungen.
- Zusätzliche Regressionstests für Navigation, Adressbuch, Road Assist und die Trennung der Web- und Android-Pfade.

## Bekannte Einschränkungen
- Das Erscheinungsbild von Web und Android ist noch nicht pixelgenau abgeglichen. Diese Version ist bewusst der eingefrorene Ausgangspunkt für die geplante gemeinsame Architektur.
- Die Adressbuch-Datenhaltung ist zwischen Web-Browser und Android noch getrennt. Import/Export ist möglich, aber keine automatische Synchronisierung.
- Die reine Web-Version benötigt einen geeigneten Google Maps Browser-Key; die Hybrid-APK verwendet weiterhin ihren separat geschützten Android-Key.
- Tests im Browser und auf dem Samsung S20 FE sowie DeX sind weiterhin gesondert zu prüfen; automatisierte Tests ersetzen keine Geräteabnahme.
- Dieser Release liefert **keine neue signierte Android-APK**. Die bisherige Android-Preview bleibt eigenständig.

## Entwicklung ab diesem Release
Die neue gemeinsame Such-/Adressbuch-Oberfläche wird ausschließlich in einem separaten Entwicklungsbranch erarbeitet und erst nach Prüfung für Web und Android übernommen.
