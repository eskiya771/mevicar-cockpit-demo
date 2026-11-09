# MeviTV auf Synology DSM 7.2.2 installieren

## 1. Dateien bereitstellen

Im GitHub-Repository `eskiya771/mevicar-cockpit-demo` über **Code → Download ZIP** das Projekt laden, ZIP entpacken und den **Inhalt des Ordners `bridge/`** nach `/volume1/docker/mevitv-bridge/` auf der Synology kopieren (bei abweichendem Volume den Pfad anpassen). Der Ordner enthält `server.cjs`, `Dockerfile`, `compose.yaml` und `.env.example`.

In Synology File Station die Vorlage `.env.example` als `.env` kopieren und lokal bearbeiten. Versteckte Dateien ggf. anzeigen. Ein starkes separates Bridge-Token mit `openssl rand -hex 32` auf einem vertrauenswürdigen Gerät erzeugen.

Die Werte müssen **nur in der lokalen `.env`** eingetragen werden:

```dotenv
XTREAM_UPSTREAM=http://DEIN-IPTV-SERVER:8080
XTREAM_USER=DEIN-ANBIETER-BENUTZER
XTREAM_PASSWORD=DEIN-ANBIETER-PASSWORT
MEVITV_BRIDGE_TOKEN=ZUFALLSTOKEN_MIT_MINDESTENS_32_ZEICHEN
MEVITV_ORIGIN=https://eskiya771.github.io
```

Die bestehende M3U-URL ist eine Xtream-Quelle: Verwende als `XTREAM_UPSTREAM` **nur den Server einschließlich Port**, nicht `/get.php` oder die Parameter. Niemals Zugangsdaten in GitHub, Screenshots, Logs, Browser-URLs oder in dieser Dokumentation veröffentlichen. Bei mehrfacher Weitergabe bestehender Zugangsdaten empfiehlt sich eine Erneuerung beim Anbieter.

## 2. Container Manager

1. Im Paket-Zentrum **Container Manager** installieren (wenn dein NAS-Modell unterstützt wird).
2. **Container Manager → Projekt → Erstellen** öffnen.
3. Projektname `mevitv-bridge`; Pfad `/volume1/docker/mevitv-bridge`.
4. Quelle: vorhandene `compose.yaml` verwenden, falls der Assistent es anbietet; alternativ ihren Inhalt in den YAML-Editor kopieren.
5. Projekt **bauen und starten**. Die Image-Erstellung benötigt einmalig Internetzugang zu Docker Hub.

In Docker ist `HOST=0.0.0.0` nötig, damit die Bridge im Container erreichbar ist. Die Compose-Portabbildung ist bewusst auf **127.0.0.1 des NAS-Hosts** begrenzt. Port **8787 nicht am Router freigeben**.

Mit SSH direkt auf der NAS (optional) prüfen:

```sh
curl --fail http://127.0.0.1:8787/health
```

Erwartet: `{"status":"ready"}`. Dieser Check überprüft nur den Bridge-Dienst, **nicht** die Verbindung zum IPTV-Anbieter.

## 3. HTTPS via DSM Reverse Proxy

Unter **Systemsteuerung → Anmeldeportal → Erweitert → Reverse Proxy → Erstellen**:

| Feld | Wert |
| --- | --- |
| Quelle | HTTPS |
| Quell-Hostname | Eigene Subdomain, z. B. `tv.deine-domain.de` |
| Quell-Port | 443 |
| Ziel-Protokoll | HTTP |
| Ziel-Hostname | `127.0.0.1` |
| Ziel-Port | `8787` |

Der Domainname muss auf deine NAS bzw. den passenden Zugriffspfad zeigen. Weisen der Subdomain unter **Sicherheit → Zertifikat** ein gültiges Zertifikat zu. Je nach Netzwerk sind DNS, Portweiterleitung 443 und Firewall-Einstellungen erforderlich. **Nur 443 gezielt für den Reverse Proxy**, nicht DSM-Verwaltungsports oder 8787, freigeben. Falls du keinen öffentlichen Reverse Proxy möchtest, kann stattdessen ein privater HTTPS-Zugang über VPN und passende DNS-/Zertifikatslösung genutzt werden.

Von einem anderen Gerät testen: `https://tv.deine-domain.de/health` muss `{"status":"ready"}` liefern. Wenn nicht, zunächst DNS, Zertifikat, Firewall und Reverse-Proxy-Ziel korrigieren.

## 4. MeviCar verbinden

In der installierten MeviCar-Next-PWA **TV → Xtream → Verbindung → Privater HTTPS-Bridge-Server** auswählen.

- Server: `https://tv.deine-domain.de` (ohne `/health`)
- Bridge-Zugangstoken: dein lokal erzeugtes `MEVITV_BRIDGE_TOKEN`
- `Katalog verbinden` wählen

Live-TV-, Film- und Serienkategorien sollten bei erreichbarer und kompatibler Xtream-API eingelesen werden. Solange der Provider keinen kompatiblen API-Endpunkt anbietet oder die Listen größer als 8 MB je Antwort sind, erscheint eine Fehlermeldung. Der erste Katalogabruf ist noch nicht mit dem echten Anbieter nachgewiesen.

## 5. Wichtige technische Grenzen

Die Bridge schützt die Anbieter-Zugangsdaten vor dem Browser und transportiert Katalogdaten per HTTPS. Medien werden nur bei unterstützten Formaten durchgereicht; signierte Stream-URLs sind temporär. **MPEG-TS ist auf iOS/Safari und anderen Browsern nicht zuverlässig abspielbar. HLS-Playlists und ihre Segmente werden derzeit nicht über die Bridge umgeschrieben; Live-Wiedergabe ist also noch nicht vollständig funktionsfähig.** Das wird ein späterer Entwicklungsschritt, oder wir nutzen einen nativen Android-Media3-Player.

Das Bridge-Token bleibt in der Web-App nur bis zum Neuladen im Arbeitsspeicher. Diese Bridge ist ein privater Dienst: sichere Zugangskontrolle und aktuell gehaltene DSM-/Container-Software bleiben nötig. Keine unverschlüsselte externe Verbindung.

## 6. Fehlerprüfung

- Container startet nicht: Container Manager → Projekt → Details → Protokolle; `.env` auf fehlende Werte prüfen.
- `/health` lokal nicht erreichbar: Portabbildung prüfen und ob Container gebaut/gestartet ist.
- HTTPS funktioniert nicht: Reverse Proxy, Zertifikat, DNS und Firewall prüfen.
- Anmeldung schlägt fehl: Token identisch mit `.env`? Browser-Entwicklerkonsole prüfen, aber keine Secrets posten.
- Xtream-Katalog leer/fehlerhaft: Provider unterstützt `player_api.php` eventuell nicht oder antwortet mit zu großen Listen.
