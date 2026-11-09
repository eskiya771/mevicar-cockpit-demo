# MeviTV – Implementierung und Prüfung

Stand: 9. November 2026.

TV ist eine eigenständige Zusatz-App mit Vollbild-/Split-Integration. Katalog: Das Erste, ZDF, ZDFneo, ZDFinfo, BR Süd, TRT 1, TRT Haber und TRT Türk. Senderkennung als lokale Textmarke (keine externen Senderlogos). Suche, Länderfilter, Favoriten sowie eigener HTTPS-Stream und lokaler M3U-Dateiimport mit Löschfunktion. Import: maximal 1 MB/100 Sender, Deduplizierung, keine HTTP-, Script- oder URL-Benutzername/Passwort-Adressen.

## Wiedergabe
Native HLS-Wiedergabe, wenn verfügbar; andernfalls lokal ausgeliefertes hls.js 1.6.15. Pages lädt die festgelegte Datei von npm/jsDelivr und prüft SHA-256 aus vendor/hls.sha256. Apache-2.0-Lizenz in vendor/hls-LICENSE.txt. Kein CDN-Aufruf zur Laufzeit. Herstellerprojekt: https://github.com/video-dev/hls.js .

Start durch Antippen eines Senders oder Start. Native Player-Steuerung für Pause/Lautstärke, Vollbild mit Safari-Fallback. Start-Timeout nach 25 Sekunden, Fehlermeldung und manuelles Neuladen, Link auf offizielle Senderseite. Späte HLS-Callbacks nach Senderwechsel/Unmount werden ignoriert; HLS-Instanz und Videoquelle werden freigegeben. Beim App-/Layoutwechsel und verborgenem Tab wird gestoppt. Favoriten, eigene Sender und letzter Sender werden lokal gespeichert.

TV stoppt lokales Radio/Medien; Spotify-Pause über bestehende API best effort. Radio/Medienstart stoppt TV über Audioquellen-Hook. Streams benötigen Internet; Oberfläche und Playerbibliothek sind offline gecacht.

## Quellen und Streamprüfung
Offizielle Einstiege: https://www.ardmediathek.de/live , https://www.zdf.de/live-tv , https://www.br.de/mediathek/live , https://www.trt.net.tr/yayin-akisi , https://www.trthaber.com/canli.html .
Alle acht Master-Playlists antworteten beim direkten HTTPS-Abruf mit HTTP 200 und EXTM3U. ZDF/TRT lieferten Access-Control-Allow-Origin: *, Das Erste/BR beim Abruf ohne Origin keinen solchen Header. Keine Garantie für CORS, Segmentabruf oder regionale Verfügbarkeit. Keine Umgehung von Geoblocking, DRM oder Login.

## Validierung
Alle neun Node-Smoke-Tests bestanden. TV-Test: Katalog, HTTPS-Validierung, M3U-Import/Deduplizierung/Grenzen, Suche/Favoriten sowie nativer Player-Lifecycle und Cleanup. Produktions-HTML lokal aus dem Pages-Workflow erzeugt, hls.js-Syntax und SHA-256 erfolgreich geprüft.

Offen: Browser-Sichtprüfung in fünf Profilen/drei Themes, echte Bild-/Tonwiedergabe, HLS.js-Playback unter Android/DeX und iOS-Vollbild. Chromium nicht verfügbar; vorausgehender Installationsversuch mit ungültigem Download-Archiv gescheitert. Keine visuelle Freigabe.

## URL-Quellenverwaltung – 9. November 2026

Quellen-Dialog für mehrere HTTPS-M3U-URLs hinzugefügt. Jede Quelle hat einen Namen, wird nach erfolgreichem Abruf lokal gespeichert und kann aktualisiert oder mit ihren Sendern gelöscht werden. Vor einem Update werden Inhalte außerhalb der betroffenen Quelle beibehalten; bei fehlgeschlagenem Download oder Parser-Fehler bleibt auch der alte Katalog der betroffenen Quelle erhalten. Import ist auf 1 MB, 100 eigene Sender insgesamt und 30 URL-Quellen begrenzt. HTTPS und CORS sind nötig; der Browser kann keine serverseitigen CORS-Sperren umgehen. Browser-Speicherung enthält die eingetragenen Quell-URLs (eventuell mit Zugangstoken), daher keine fremden Geräte verwenden. Live-Wiedergabe, echte Browsertests und ein bestätigter Pages-Run sind weiterhin zu prüfen. Xtream, Film-/Serienkatalog und Downloads sind in diesem Schritt nicht implementiert.

## Xtream-Katalog – 9. November 2026

Neues Modul `xtream.js` mit HTTPS-Zugang (Server, Benutzername, Passwort), Xtream-Endpunkten für Live-Kategorien/Sender, VOD-Kategorien/Filme und Serienkategorien/Serien. Kataloge werden pro Sitzung im Arbeitsspeicher gehalten; Xtream-Zugangsdaten werden **nicht** im Repository und nicht in LocalStorage gespeichert. Die Oberfläche bietet Kontenliste, Auswahl/Löschung, Bereichswechsel (Live/Filme/Serien), Kategorien, Suche und nachgeladene Staffeln/Folgen. Ein neuer Node-Smoke-Test prüft URL-Validierung, API-URL-Aufbau und die Normalisierung; Workflow erweitert. Browser-/Geräteprüfung sowie erfolgreicher Action-Lauf stehen noch aus.

**Bekannte Grenze:** Eine per HTTP:8080 angebotene Xtream/M3U-Quelle ist aus der HTTPS-PWA wegen Mixed Content nicht direkt abrufbar; für den Browser ist ein vertrauenswürdiger HTTPS-Endpunkt mit erlaubtem CORS nötig. Die PWA unterstützt keinen nativen Media3/ExoPlayer und keine TS-Codec-Garantie. Die momentane Importfunktion ist absichtlich für kleine/mittlere Testkataloge (max. 8 MB pro API-Antwort) begrenzt; große Anbieter-Listen erfordern später paginiertes/streamendes Indexing mit IndexedDB. Keine Zugangsdaten im Repo hinterlegen.

## HTTP-Xtream-Brücke – 9. November 2026

Optionaler selbstgehosteter Node-Dienst `bridge/server.cjs` für HTTP-Xtream-Provider hinter einem HTTPS-Reverse-Proxy. Der Dienst hält die Provider-Zugangsdaten in Prozess-Umgebungsvariablen, bietet ausgewählte Katalogendpunkte mit Bearer-Token und strikter Origin-Freigabe und generiert signierte Medienlinks. Die MeviTV-Xtream-Anmeldemaske kann zwischen direktem HTTPS-Anbieter und privater HTTPS-Bridge umschalten; das Bridge-Token wird nur im Arbeitsspeicher gespeichert. `bridge/README.md` dokumentiert Einrichtung und Grenzen. GitHub Actions hat einen Bridge-Smoke-Test für Authentifizierung, CORS, API-Einschränkungen und Signaturen erhalten.

**Nicht erledigt:** tatsächliche Installation auf Synology/anderem Host, Abruf des realen Anbieterkatalogs, HLS-Segment-Rewriting, zuverlässige MPEG-TS-Wiedergabe in der PWA und reale Browser-/Geräteabnahme. Bis zum Betrieb einer eigenen HTTPS-Bridge bleibt die angegebene HTTP:8080-Quelle für die HTTPS-PWA nicht erreichbar. Kein Anbieter-Zugang oder Passwort wurde in GitHub gespeichert.

## 413 bei großem Filmkatalog – 9. November 2026

Nach erfolgreichem realen Synology-/HTTPS-/Xtream-Katalogtest erreichte der Anbieter die bisherige 8-MB-Antwortgrenze bei einem großen Katalog. Server und PWA wurden auf maximal 64 MiB pro API-Antwort sowie 90 Sekunden Timeout angepasst. Die Importbegrenzungen von 15.000 Einträgen pro Bereich und die ausschließliche Sitzungsspeicherung bleiben vorläufig bestehen. Die Maske erzwingt nun `display:none!important` für ausgeblendete Anbieter-Zugangsfelder; deren Sichtbarkeit war durch eine Grid-CSS-Regel überschrieben. Ein Regressionstest kontrolliert beide Grenzwerte und die Hidden-CSS-Regel. Zur Aktualisierung des bereits auf Synology laufenden Containers muss die neue `bridge/server.cjs` lokal übertragen und das Container-Image neu gebaut werden. Die `.env` auf der NAS darf dabei nicht überschrieben werden. Erfolgreiche Live-/Film-/Serienimporte nach dem Update und Videowiedergabe sind noch offen.

## Playback-Diagnose – 9. November 2026

Realer Test zeigt: Player ist sichtbar, streamt aber nicht. Xtream-Bridge ist bisher **nicht HLS-fähig**: `GET /stream/live/<id>.m3u8` gibt absichtlich HTTP 415 zurück, weil HLS-Manifest und Segmente nicht weitergeleitet/umgeschrieben werden. Alternativ angebotene MPEG-TS-Streams sind im Browser nur eingeschränkt kompatibel. Die PWA zeigt nun HLS-HTTP-415 ausdrücklich an, erkennt `.m3u8` über die URL-Pfadkomponente trotz signierter Query-Parameter, nennt TS als mögliche Formatbeschränkung und hält bei „Start / Neu laden“ die Xtream-Auswahl fest. Sichtbare „Senderseite“ im Xtream-Player wird ausgeblendet, statt auf den zuvor gewählten Standardsender zu verweisen. Der TV-Smoke-Test enthält Regressionen.

**Offen für echte Wiedergabe:** auf der Synology ein abgesichertes HLS-Relay mit Manifest-/Segmentbehandlung oder eine native Android-Media3/ExoPlayer-Integration entwickeln und auf realen Streams testen. Keine realen Anbieter-Zugangsdaten in Tests aufnehmen. Diese Diagnoseänderung benötigt nur ein neues GitHub-Pages-Deployment, keine Aktualisierung des Synology-Containers.

## Phase 1 – HLS-Relay über Synology (9. November 2026)

Neues `bridge/hls.cjs` für AES-GCM-geschützte URL-Tickets und Rewrite von HLS-Master-/Variant-Playlisten, Segment-URLs sowie URI-Attributen (Schlüssel, Map, Audio etc.). Der Bridge-Endpunkt `/stream/...m3u8` liefert umgeschriebene Manifeste; `/hls/<ticket>` streamt abhängige Ressourcen über dieselbe HTTPS-Adresse. In dieser ersten abgesicherten Version sind nur Ressourcen des exakt konfigurierten Upstream-Origin gestattet; fremde CDN-Hosts werden nicht automatisch proxied. 2 MiB Manifest-Limit, verschlüsselte Tokens für vier Stunden, URL-Tickets und Origin/CORS-Kontrolle. `Dockerfile` kopiert die neue Module-Datei, GitHub Actions enthält `tests/hls-relay-smoke.mjs` für Master-/Variant-/Key-/Segment-Rewriting und Sicherheitschecks.

Der TV-Client zeigt jetzt die konkrete Fehlermeldung aus einem fehlgeschlagenen HLS-HTTP-Abruf. Bei vorliegendem Anbieter-Fehler `HTTP 502` ist noch nicht nachgewiesen, dass der Anbieter `.m3u8` tatsächlich unterstützt. **Noch nicht abgenommen:** reales Playback in Brave und auf iOS, Provider-Redirects auf fremde Hosts, MPEG-TS-Remux/FFmpeg, DRM/Codec-Unterstützung sowie der neue Synology-Containerbuild. Die `.env` darf beim Update nicht überschrieben werden.

## Feste Synology-Bridge und PIN-Eingabe – 9. November 2026

MeviTV verwendet den einzigen fest konfigurierten Bridge-Origin `https://mevitv.mtankurt.synology.me` und fordert im Dialog statt eines langen Tokens nur noch eine vierstellige PIN an. Der Client ruft `POST /session` auf und hält das signierte, zwei Stunden gültige Bearer-Token nur im Arbeitsspeicher. Der Bridge-Server validiert `MEVITV_PIN` ausschließlich aus der lokalen Synology-`.env`. Das Secret und der PIN-Wert sind nicht im Repository. Die neue Anmeldung erfordert einen passenden `Origin`-Header, hält global höchstens fünf Fehlversuche pro 15 Minuten aus und verwendet einen konstantzeitlichen PIN-Vergleich. Der vorhandene geheime Master-Token bleibt für administrative Bridge-Zugriffe bestehen. Der kurze PIN ist ausdrücklich kein starker Schutz für einen öffentlichen Endpunkt; zusätzliche Zugriffsbeschränkung ist empfohlen. Die NAS muss mit aktualisiertem `server.cjs` neu gebaut werden; die lokale `.env` mit `MEVITV_PIN` ist nicht Teil des Deployment-Pakets. Ein realer Anmeldungstest steht aus.

## MPEG-TS-Fallback – 9. November 2026

Realer Test eines IPTV-Senders direkt aus dem Synology-Bridge-Container: Provider `.m3u8` HTTP 403, Provider `.ts` HTTP 200 (Content-Type `video/mp2t`). `bridge/remux.cjs` baut jetzt auf Anforderung maximal zwei temporäre FFmpeg-TS→HLS-Remux-Prozesse (`-c copy`), speichert Segmente im tmpfs und beendet inaktive Jobs nach 90 Sekunden. Die signierte `/remux/live/<id>/index.m3u8`-Adresse und die Segment-Endpunkte sind nur mit gültigem Ticket zugänglich. MeviTV probiert zunächst HLS und bei HLS-403/404 den TS-Fallback. Dockerfile installiert FFmpeg. Die vorhandenen Bridge-Smoke-Tests wurden um den neuen Ticketpfad und die Segment-Validierung erweitert. **Weiterhin offen:** GitHub-Actions-Erfolg, Installation auf der realen Synology, realer Codec-/Video-/Audiotest, Last-/Speicherprüfung mit zwei Sendern, Browserprüfung Brave und iPhone. Bei defekten Codecs reicht `-c copy` nicht aus; Transcodierung wäre gesondert zu prüfen.

## FFmpeg-Senderwechsel – 9. November 2026

Realer Test: Zwei Sender laufen erfolgreich, beim dritten erschien `HTTP 503 Remux unavailable: Max active streams reached`. Der FFmpeg-Remux verwaltete höchstens zwei Prozesse, gab beim Senderwechsel aber vorherige Prozesse erst nach 90 Sekunden Inaktivität frei. Korrigiert: Bei einem dritten neuen Sender wird die am längsten unbenutzte Remux-Sitzung beendet (LRU-Eviction), bevor ein neuer FFmpeg-Prozess gestartet wird. Bereits beendete Sessions können erneut geöffnet werden. Stale Segmente werden synchron vor erneutem Start beseitigt. Der Grenzwert zwei gleichzeitiger Prozesse bleibt bestehen. `tests/remux-switch-smoke.mjs` prüft dritte/vierte Sender und Eviction im GitHub-Actions-Workflow.

Erforderlich: neue `bridge/remux.cjs` auf die Synology kopieren und `sudo docker compose up -d --build` ausführen. Es ist keine Änderung der `.env` und keine Änderung am Reverse Proxy nötig. Der Test wurde in CI aufgenommen; erfolgreiche GitHub-Actions-Ausführung und realer Senderwechsel stehen noch aus. Bei gleichzeitiger Nutzung durch mehrere Geräte kann die LRU-Regel einen dort noch gewünschten älteren Sender verdrängen; Multi-Client-Session-Bindung ist ein späterer Ausbauschritt.
