# MeviTV auf Synology DSM 7.2.2 installieren

## MPEG-TS mit FFmpeg nach HLS umverpacken (Phase 2)

Ein realer Sender lieferte `.m3u8` HTTP 403 und `.ts` HTTP 200. MeviTV versucht zunächst HLS und wechselt bei einem Provider-403/404 automatisch auf FFmpeg-Remux. Die Synology verwendet `-c copy` statt vollständiger Neucodierung. Inkompatible Codecs können weiterhin Probleme verursachen. Maximal zwei aktive FFmpeg-Prozesse; unbenutzte Streams werden nach 90 Sekunden beendet. HLS-Ausgabedateien liegen auf dem Container-tmpfs in `/tmp`.

Auf Windows in PowerShell die neuen Dateien kopieren, ohne `.env` zu überschreiben:

```powershell
$dir = "\\\\192.168.178.86\\docker\\mevitv-bridge"
$base = "https://raw.githubusercontent.com/eskiya771/mevicar-cockpit-demo/main/bridge"
"server.cjs","hls.cjs","remux.cjs","Dockerfile" | ForEach-Object {
  Invoke-WebRequest -Uri "$base/$_" -OutFile "$dir\\$_"
}
```

Auf der Synology via SSH:

```sh
cd /volume1/docker/mevitv-bridge
sudo docker compose up -d --build
sudo docker compose ps
curl -fsS http://127.0.0.1:8787/health
```

Erst nach erfolgreichem GitHub-Pages-Deployment einen realen Sender auf Brave und iPhone testen. Der bestehende HTTPS-Reverse-Proxy bleibt unverändert. Falls die 256-MB-Containergrenze oder die Codecs Probleme machen, muss die Konfiguration gezielt angepasst werden. Echte Wiedergabe ist noch nicht bestätigt.


## Feste MeviTV-Bridge und vereinfachte PIN-Anmeldung

MeviCar Next verwendet fest `https://mevitv.mtankurt.synology.me` als Proxy. Der Benutzer sieht nur **Bezeichnung** und **vierstelligen Zugangscode**. Die Bridge prüft den Code serverseitig und stellt danach ein signiertes, zweistündiges Sitzungstoken aus. Der geheime Bridge-Master-Token und die Zugangsdaten des IPTV-Anbieters bleiben in der lokalen Synology-`.env`.

Auf **deiner Synology** den gewünschten vierstelligen PIN in `/volume1/docker/mevitv-bridge/.env` unter `MEVITV_PIN=` hinzufügen. Der tatsächliche PIN gehört **nicht** in GitHub, Builds, JavaScript oder Screenshots. Die Anmeldung ist per Origin-Prüfung und globalem Limit von fünf Fehleingaben pro 15 Minuten begrenzt, jedoch ersetzt ein vierstelliger PIN keine starke Zugangssicherung: Für einen öffentlich erreichbaren Dienst zusätzlich VPN/Netzwerkzugriffsbeschränkung nutzen.

Auf dem Windows-PC die aktuelle Serverdatei kopieren (nicht die lokale `.env` überschreiben):

```powershell
$ordner = "\\\\192.168.178.86\\docker\\mevitv-bridge"
Invoke-WebRequest "https://raw.githubusercontent.com/eskiya771/mevicar-cockpit-demo/main/bridge/server.cjs" -OutFile "$ordner\\server.cjs"
```

Falls HLS-Relay noch nicht aktualisiert ist, zusätzlich `hls.cjs` und `Dockerfile` herunterladen. Anschließend auf der Synology:

```sh
cd /volume1/docker/mevitv-bridge
sudo docker compose up -d --build
curl -fsS http://127.0.0.1:8787/health
```

Nach erfolgreichem GitHub-Pages-Deployment genügt in MeviTV der PIN. Bei Neuladen oder nach zwei Stunden Anmeldung erneut durchführen. Weder die numerische PIN noch das kurzlebige Sitzungstoken werden im Browser dauerhaft gespeichert.


## HLS-Relay (Phase 1) und Synology-Update

Der Bridge-Dienst kann nun HLS-Master-/Variant-Playlists sowie deren Segmente, alternative Audio-/Untertitel-Playlists und Schlüssel-URIs umschreiben und unter signierten, zeitlich begrenzten `/hls/...`-Adressen über denselben HTTPS-Reverse-Proxy bereitstellen. Die URLs enthalten **keine Klartext-Anbieter-Zugangsdaten**. Die Ressourcen müssen aus Sicherheitsgründen vom konfigurierten Anbieter-Origin stammen (gleicher Host, gleiches Schema und Port). Redirects auf denselben Origin sind bis maximal vier Sprünge zulässig; andere CDN-Hosts werden explizit abgelehnt. DRM, DASH und nicht kompatible Codecs bleiben außerhalb dieser Phase. Der Live-Stream muss beim Anbieter tatsächlich als HLS verfügbar sein; eine fehlende `.m3u8`-Quelle wird nicht automatisch von TS nach HLS konvertiert.

Zur Aktualisierung **ohne Verlust der Synology-Zugangsdaten** auf deinem Windows-PC in PowerShell:

```powershell
$folder = "\\192.168.178.86\docker\mevitv-bridge"
$raw = "https://raw.githubusercontent.com/eskiya771/mevicar-cockpit-demo/main/bridge"
Invoke-WebRequest "$raw/server.cjs" -OutFile "$folder\server.cjs"
Invoke-WebRequest "$raw/hls.cjs" -OutFile "$folder\hls.cjs"
Invoke-WebRequest "$raw/Dockerfile" -OutFile "$folder\Dockerfile"
```

Danach per SSH auf der Synology:

```bash
cd /volume1/docker/mevitv-bridge
sudo docker compose up -d --build
sudo docker compose ps
curl -fsS http://127.0.0.1:8787/health
```

Die Datei `.env` **nicht herunterladen oder überschreiben**; sie enthält lokale Geheimnisse. Erst nach erfolgreichem GitHub-Actions-Deployment die MeviCar-Web-App aktualisieren und einen Sender mit echtem HLS-Angebot testen. Falls der Anbieter nur TS ausliefert, ist der nächste Schritt ein gezielter FFmpeg-Remux-Fallback auf der NAS.


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

Die Bridge schützt die Anbieter-Zugangsdaten vor dem Browser und transportiert Katalogdaten per HTTPS. Medien werden nur bei unterstützten Formaten durchgereicht; signierte Stream-URLs sind temporär. **MPEG-TS ist in Browsern nicht zuverlässig abspielbar. HLS wird jetzt bei unterstützten, gleich-originigen Playlist-/Segment-URLs ohne Transcodierung weitergereicht; ob ein Anbieter überhaupt HLS liefert, muss am konkreten Sender getestet werden.** Das wird ein späterer Entwicklungsschritt, oder wir nutzen einen nativen Android-Media3-Player.

Das Bridge-Token bleibt in der Web-App nur bis zum Neuladen im Arbeitsspeicher. Diese Bridge ist ein privater Dienst: sichere Zugangskontrolle und aktuell gehaltene DSM-/Container-Software bleiben nötig. Keine unverschlüsselte externe Verbindung.

## 6. Fehlerprüfung

- Container startet nicht: Container Manager → Projekt → Details → Protokolle; `.env` auf fehlende Werte prüfen.
- `/health` lokal nicht erreichbar: Portabbildung prüfen und ob Container gebaut/gestartet ist.
- HTTPS funktioniert nicht: Reverse Proxy, Zertifikat, DNS und Firewall prüfen.
- Anmeldung schlägt fehl: Token identisch mit `.env`? Browser-Entwicklerkonsole prüfen, aber keine Secrets posten.
- Xtream-Katalog leer/fehlerhaft: Provider unterstützt `player_api.php` eventuell nicht oder antwortet mit zu großen Listen.

## Optionaler MPEG-TS-Direktplayer mpegts.js (Phase 3)

In MeviCar Next (GitHub Pages/PWA) kann `mpegts.js` jetzt den MPEG-TS-Stream auf unterstützten Browsern in MediaSource umpacken. Der Bridge-Server liefert dazu ein authentifiziertes signiertes Ticket für die Originaldatei `/stream/live/<ID>.ts`; die tatsächlichen Anbieter-Zugangsdaten bleiben auf der Synology. Der Browser muss CORS, MediaSource und die Video-/Audio-Codecs unterstützen. Bei Fehlern bleibt die alte FFmpeg-HLS-Wiedergabe automatisch verfügbar. **Der Synology-HTTPS-Proxy bleibt erforderlich**, aber eine erfolgreiche mpegts.js-Wiedergabe benötigt keinen aktiven FFmpeg-Stream.

Nur die Backend-Datei `server.cjs` wurde geändert. Aktualisierung am Windows-PC in PowerShell:

```powershell
Invoke-WebRequest "https://raw.githubusercontent.com/eskiya771/mevicar-cockpit-demo/main/bridge/server.cjs" -OutFile "\\\\192.168.178.86\\docker\\mevitv-bridge\\server.cjs"
```

Anschließend in Synology SSH:

```sh
cd /volume1/docker/mevitv-bridge
sudo docker compose up -d --build
sudo docker compose ps
curl -fsS http://127.0.0.1:8787/health
```

Die private `.env` bleibt unverändert. Erst nach erfolgreichem Pages-Deployment im gleichen Browser einen funktionierenden Sender und mehrere schnelle Senderwechsel testen. Beim nativen mpegts-Modus erscheint der Hinweis `mpegts.js: Verbinde …`. Wenn stattdessen `HLS/FFmpeg` erscheint, den gemeldeten Grund notieren. Reale Wiedergabe ist noch nicht abgenommen.

## EPG-Kompatibilitätsupdate (10. November 2026)

Der Player versucht die Kurzabfrage `get_short_epg` mit `limit=12`. Wenn sie keine aktuellen verwertbaren Einträge liefert oder fehlschlägt, versucht er `get_simple_data_table` für denselben Sender. Die Bridge erlaubt nun auch diese zweite, lesende Abfrage und reicht das begrenzte Kurzabfrage-Limit weiter (1–50). Anbieter-Zugang, Sessions, Medien-Tickets und mpegts.js bleiben davon unberührt.

**Bestehende Synology-Installation:** `server.cjs` aus diesem Ordner in den vorhandenen Bridge-Ordner kopieren, vorhandene `.env` beibehalten und das bestehende Projekt neu bauen/starten:

```sh
cd /volume1/docker/mevitv-bridge
sudo docker compose up -d --build
```

Ein Pages-Deploy aktualisiert den NAS-Container **nicht**. Ein alter Container antwortet auf `get_simple_data_table` mit HTTP 400; MeviTV zeigt dann bei leerer Kurzabfrage einen konkreten Hinweis zum Proxy-Update. Im EPG-Dialog gibt es eine aufklappbare Diagnose mit Status, Datenanzahl und Format, ohne Zugangsdaten oder rohe Providerantwort.

Auch damit bleibt die EPG-Verfügbarkeit vom Anbieter und der Zuordnung des gewählten Streams abhängig. Andere Player können stattdessen XMLTV nutzen; dessen Abruf/Zuordnung ist hier noch nicht implementiert. Implementierungsreferenz: [Xtream-kompatible EPG-Abfragen](https://xui.live/docs/api/xtream/).
