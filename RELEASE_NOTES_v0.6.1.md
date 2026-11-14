# MeviCar Next Web v0.6.1 — Google-Navigation-Anbindung (14.11.2026)

Diese Version ergänzt die Übergabe von Google-Places-Zielen an die native Google Navigation SDK in der MeviCar-Next-Android-Hybrid-App.

## Änderungen
- Google-Places-Suchergebnisse, MeviCar-Favoriten und zuletzt verwendete Ziele bleiben in der bisherigen Web-Oberfläche.
- In Android-APKs mit freigeschalteter nativer Navigation startet „Navigation starten“ die echte Android-Google-Navigation über die geschützte MeviCar-Bridge.
- Auf der reinen Web-/PWA-Version und mit älteren APKs bleibt die bisherige webbasierte Routenführung aktiv.
- Neue Regressionstests für native Zielübergabe und Web-Fallback.

## Grenzen
- Native Google-Navigation benötigt einen gültigen Android-Navigation-SDK-API-Schlüssel und Standortfreigabe.
- Persönliche Google-Maps-Favoritenlisten und POI-Kategorien sind noch nicht synchronisiert.
- Geräteprüfung der nativen Kartenansicht auf Samsung S20 FE und DeX steht noch aus.
