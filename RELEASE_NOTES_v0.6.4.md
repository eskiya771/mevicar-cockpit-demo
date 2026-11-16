# MeviCar Next Web v0.6.4 – Android-ähnliche Adresseingabe in der normalen Web-App

## Neu in der Web-App
- Die überarbeitete Zielsuche, das Adressbuch und die Favoriten werden direkt im normalen MeviCar Next Web-Cockpit geöffnet. Es ist kein Besuch von `/nav-preview/` mehr nötig.
- Gemeinsames JavaScript-Modul für Zieladressen und Adressbuch, mit austauschbarer Google-Provider-Schnittstelle als Grundlage für künftige plattformübergreifende Nutzung.
- Schnellziele, „Zuletzt“, „Gespeichert“, Zuhause, Arbeit, POIs und Suche schon ab zwei Buchstaben.
- Adressbuch: Name, Notiz, Symbol, Zuordnung zu Zuhause/Arbeit/Favoriten, Favoritenreihenfolge und Export/Import im Android-v2-Format.
- Android-Exporte mit Google-Place-ID, aber noch ohne Koordinaten, werden aufbewahrt; Web versucht beim ersten Benutzen die Position über Google Places aufzulösen.
- Suche über Enter nach POIs, neue Kategorien Rastplatz und Werkstatt; korrekte Google-Kategorie für Tankstellen.
- Das Speichern eines Ziels als Favorit, Zuhause oder Arbeit ändert nicht die aktive Routenführung.
- Angleichung der Adressbuchgrenzen an das Android-Format: bis zu 200 gespeicherte Ziele und 30 zuletzt verwendete Ziele.

## Update unter Windows
Die aktuelle Web-App wird wie gewohnt über die GitHub-Pages-Veröffentlichung und die vorhandene Funktion „Aktualisieren“ aktualisiert. Hauptseite, gemeinsame Navigationslogik und Suchoberfläche werden im selben versionierten HTML ausgeliefert, damit kein alter PWA-Cache einen falschen Suchstand mischt.

## Unverändert
- Android-Beta und Kotlin-Code von Fable wurden nicht geändert. Keine neue APK und keine Änderung an Android-Google-Schlüsseln.
- Die Web-App nutzt den Web-Google-Maps-Schlüssel und ihre bisherige JavaScript-Navigation, nicht das Android Navigation SDK.
- Home-Assistant-Token-Speicherung aus v0.6.3, Medien, Spotify, Road Assist und weitere Web-Apps bleiben erhalten.

## Grenzen
Das neue Web-Adressbuch ist technisch am Android-Stand ausgerichtet, aber es gibt noch keine automatische Synchronisierung der Favoriten zwischen Geräten. Google Places benötigt einen gültigen Browser-Key und freigegebene APIs; ohne diese funktionieren nicht alle Echtzeitabfragen. Die native Android-Bridge für eine künftig vollständig gemeinsame Oberfläche und eine abschließende pixelgenaue Geräteabnahme stehen noch aus.
