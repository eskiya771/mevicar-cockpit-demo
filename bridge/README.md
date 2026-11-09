# MeviTV: HTTPS-Bridge für HTTP-Xtream-Anbieter

Der MeviCar-Next-Prototyp wird per HTTPS von GitHub Pages geladen. Ein IPTV-Anbieter mit HTTP auf Port 8080 lässt sich aus dieser Website nicht direkt über `fetch` oder `<video>` verwenden. Dieser optionale Bridge-Dienst wird **selbst gehostet** und stellt ausgewählte Xtream-Funktionen über HTTPS bereit.

## Architektur

Browser (GitHub Pages) → HTTPS-Reverse-Proxy (z. B. Synology) → `bridge/server.cjs` auf 127.0.0.1:8787 → HTTP-Xtream-Anbieter.

Die echten Zugangsdaten stehen **nur** in den Umgebungsvariablen des Bridge-Prozesses. Niemals in Git, GitHub Actions, GitHub Pages oder in einer öffentlichen URL hinterlegen. Der Client bekommt stattdessen ein separat erzeugtes Bridge-Token. Zugriffe sind per Bearer-Token geschützt, und CORS erlaubt ausschließlich den angegebenen MeviCar-Origin. Der Bridge-Prozess ist absichtlich nur an `127.0.0.1` gebunden; ein HTTPS-Reverse-Proxy muss die Verbindung terminieren.

## Einrichtung

Voraussetzungen: Node.js 20 oder neuer auf einem eigenen Host, ein eigener Domainname mit gültigem TLS-Zertifikat, Reverse-Proxy-Zugriff auf 127.0.0.1:8787. Auf einer Synology kann hierfür etwa ein Container mit Node.js und ein DSM-Reverse-Proxy verwendet werden. **GitHub Pages hostet keinen Node-Server.**

Umgebung (Beispielwerte; echte Geheimnisse niemals in die Dokumentation kopieren):

```sh
XTREAM_UPSTREAM=http://iptv.example:8080
XTREAM_USER=DEIN_BENUTZER
XTREAM_PASSWORD=DEIN_PASSWORT
MEVITV_BRIDGE_TOKEN=EIN_ZUFAELLIGES_TOKEN_MIT_MINDESTENS_32_ZEICHEN
MEVITV_ORIGIN=https://eskiya771.github.io
HOST=127.0.0.1
PORT=8787
node bridge/server.cjs
```

Ein zufälliges Token lässt sich mit `openssl rand -hex 32` erzeugen. Die Bridge muss **privat und HTTPS-geschützt** erreichbar sein, beispielsweise unter `https://tv-bridge.example`. In der TV-App auf **Xtream → Verbindung → Privater HTTPS-Bridge-Server** wechseln, diese Adresse und das Bridge-Token eingeben und `Katalog verbinden` wählen. Der Bridge-Server nimmt die Provider-Zugangsdaten aus seiner eigenen Prozessumgebung; Benutzername/Passwort müssen nicht in die PWA eingetragen werden.

## Grenzen und Absicherung

- Keine öffentliche Bridge ohne Token, TLS und Zugriffsbeschränkung betreiben. Empfehlenswert zusätzlich VPN/Tailscale oder eine vorgeschaltete Zugriffskontrolle.
- Der Token- und Serverzugang bleiben in der PWA nur im Arbeitsspeicher. Ein Neuladen erfordert eine erneute Anmeldung. Der Bridge-Service speichert keine Katalogdaten dauerhaft.
- Erlaubte Xtream-API-Aktionen sind explizit auf Katalog-/EPG-Endpunkte beschränkt. Keine offenen URLs/Proxy-Ziele.
- Katalogantworten sind auf 8 MB begrenzt; sehr große Anbieter benötigen später eine paginierte Importstrategie.
- Medien-URLs verwenden zeitlich begrenzte, signierte Links. Diese URLs sollten nicht geteilt werden. Übertragene Medien werden nicht dauerhaft gespeichert.
- **HLS-Segment-Rewriting ist noch nicht implementiert.** Die Bridge lehnt HLS-Playlisten derzeit ab. MPEG-TS-Streams sind in Browsern nicht zuverlässig decodierbar. Eine funktionierende Live-Wiedergabe für diese Quelle wird deshalb **nicht behauptet**. Für die volle Wiedergabe auf Android ist eine native Media3-Anbindung sinnvoll.
- Der Dienst ist noch nicht auf einem eigenen Server installiert und die reale Anbieter-Verbindung wurde nicht geprüft. Automatisierte Tests verwenden ausschließlich synthetische Testdaten.

## Tests

```sh
node tests/xtream-smoke.mjs
node tests/xtream-bridge-smoke.mjs
```
