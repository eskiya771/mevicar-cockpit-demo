# mevicar-cockpit-demo

MeviCar Next ist ein installierbarer Cockpit-Prototyp. Produktversion **0.5.0** ergänzt den Premium-Tacho: analog 0–220 km/h, analog 0–8.000 U/min, GPS-Trip, Kompass und ein gekennzeichneter Demo-Modus. Gesamtkilometer kommen erst über `meviSpeedIngest()`, nicht aus GPS. Neu ist außerdem die echte Spotify-Fernsteuerung über die Web API.

Live-Demo: https://eskiya771.github.io/mevicar-cockpit-demo/

## Entwicklung und Architektur

Einstieg und Arbeitsregeln: [AGENTS.md](AGENTS.md). Architektur, tatsächlicher Funktionsumfang, lokale Startvoraussetzungen, Tests und priorisierte Qualitätsprobleme: [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md).

## Internetradio

Radio spielt 13 direkte HTTPS-MP3-Streams aus MeviCar Classic, einschließlich BAYERN 1 Franken, BAYERN 3, ANTENNE BAYERN und Deutschlandfunk. Sender antippen oder im Player Abspielen drücken. Die Bibliothek lässt sich durchsuchen und auf Favoriten filtern. Über „Sender“ können bis zu 20 eigene HTTPS-Stream-URLs hinzugefügt und per Papierkorb wieder entfernt werden; Name und Liste bleiben lokal gespeichert. Nach einem Streamfehler versucht Radio bis zu dreimal automatisch neu zu verbinden (4, 10, 25 Sekunden). Bei Offline pausieren die Versuche; kehrt das Netz zurück, startet ein vom Nutzer gewünschter Stream automatisch neu. Stopp schließt den Stream; erneutes Starten beginnt live. Sender, eigene Streams, Favoriten und Lautstärke werden lokal gespeichert. WLAN oder mobile Daten sind erforderlich.

## Spotify

Spotify wird als Fernsteuerung des aktiven Spotify-Geräts über die Web API eingebunden; im Browser läuft kein Spotify-Audio. Voraussetzungen: Spotify Premium, ein aktives Gerät (Spotify-App auf iPhone, PC oder DeX) und eine eigene Client ID aus dem [Spotify Developer Dashboard](https://developer.spotify.com/dashboard). Als Redirect URI exakt `https://eskiya771.github.io/mevicar-cockpit-demo/` eintragen; die App zeigt die aktuelle URI mit Kopierfunktion an.

Die Anmeldung nutzt Authorization Code mit PKCE, ohne Backend und ohne Client Secret. Client ID und Tokens bleiben lokal in diesem Browser. Steuerbar sind Wiedergabe, Vor/Zurück, Seek, Shuffle/Repeat, Like, Warteschlange, Gerätewahl, Lautstärke, Suche, Playlists/Alben/Podcasts und eingefügte Spotify-Links. Fehlende Premium-Berechtigung, kein aktives Gerät, Rate Limits und Offline werden sichtbar erklärt.

Grenzen: Dev-Mode-Apps sind auf fünf Nutzer beschränkt und benötigen einen Premium-Inhaber. Eine installierte iPhone-PWA kann die Anmeldung in Safari öffnen; dort getrennte Speicherung ist möglich. Live-OAuth und reale Gerätesteuerung müssen noch mit eigenem Client ID auf den Zielgeräten geprüft werden. Details: [docs/QA_SPOTIFY_2026-11-07.md](docs/QA_SPOTIFY_2026-11-07.md).
