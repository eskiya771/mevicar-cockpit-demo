# Öffentliche Medienserver-Weiterleitungen

## Offizieller Stand

Der bestätigte Player ist jetzt die reguläre Auswahl für MeviCar Next; ein Testparameter ist nicht mehr nötig. Versionsfeste Dateien und Abnahme: [QA_MKV_OFFICIAL.md](QA_MKV_OFFICIAL.md). Die nachfolgenden Abschnitte dokumentieren die vorherige Diagnose und Testphase.


## Problem und Änderung

Ein MKV-Film scheiterte mit `Content-Length missing`. Die App hatte jedoch
bereits HTTP 502 erhalten: Der Anbieter antwortete mit 302 auf einen neuen,
nicht freigegebenen Medienserver. Die Dateigrößenmeldung war ein Folgefehler.

Proxy **1.0.7 / Build 8** erlaubt standardmäßig öffentliche Ziele, auf die
der konfigurierte Anbieter seine Film-/Serienanfragen weiterleitet. Es wird
kein allgemeiner URL-Proxy eingeführt: signierte Medientickets, festgelegter
Anbieter, erlaubte Medienpfade und maximal fünf Weiterleitungen bleiben bestehen.

Jedes externe Ziel wird geprüft. Private, lokale, reservierte und
Metadaten-Adressen sowie gemischte öffentliche/private DNS-Antworten werden
abgelehnt. Die HTTP(S)-Verbindung verwendet exakt die geprüften DNS-Adressen;
eine erneute Auflösung beim Verbinden kann die Prüfung nicht umgehen.
Hostname, TLS-Servername und Range-Header bleiben erhalten. Die Umsetzung
nutzt Node-Bordmittel und benötigt kein neues Containerimage.

MeviTV wertet den bestehenden Range-Test vor dem Playerstart aus. Bei einem
definitiven HTTP-Fehler zeigt es den bekannten Bridge-Grund an und startet
keine nutzlosen Größen-/Decoder-Versuche. Erfolgreiche Anfragen starten den
Player normal; bei einer unklaren Netzwerk-/CORS-Störung bleibt dessen
eigene Wiederherstellung möglich. Das kostet beim erfolgreichen Start
die bisher parallel ausgeführte Probe als zusätzlichen seriellen Schritt.
Die bewährte Größen-/Seek-Korrektur im Movi-Player ist unverändert.

## Aktivieren

1. Änderungen nach main übernehmen und erfolgreiches Pages-Deployment abwarten.
2. In MeviTV **Proxy → Status prüfen** öffnen.
3. **Proxy aktualisieren** auf **1.0.7 / Build 8** ausführen.
4. Nach dem Neustart den zuvor blockierten Film erneut starten.

Für bestehende Installationen ohne `MEVITV_VOD_REDIRECT_MODE` greift der
öffentliche Modus automatisch. Die vorhandene Liste einzelner Hosts muss
nicht erweitert werden. Ein Pages-Update allein aktualisiert den
Synology-Container nicht; maßgeblich ist dessen angezeigter Proxy-Build.

Optional bleibt die bisherige explizite Liste verfügbar:

```dotenv
MEVITV_VOD_REDIRECT_MODE=allowlist
MEVITV_VOD_REDIRECT_HOSTS=cdn.example,another-cdn.example
```

Die alternative explizite Liste vertraut den dort eingetragenen Zielen wie
bisher. Eine Änderung von Docker-Umgebungsvariablen benötigt eine
Neuerstellung des Containers mit Compose; ein bloßer Prozessneustart liest
die `.env` nicht erneut ein. Der öffentliche Modus schützt externe
Weiterleitungen; der bereits ausdrücklich konfigurierte Anbieter bleibt
ein vertrauenswürdiges Ziel.

## Geprüft und Grenzen

- Öffentliche IPv4/IPv6, lokale/reservierte Ziele, alternative IPv4-Schreibweisen,
  IPv4-in-IPv6, gemischte DNS-Antworten, DNS-Fehler und Abbruch.
- Verbindung verwendet geprüfte Adressen ohne zweite DNS-Auflösung.
- Echter lokaler HTTP-Test für Range-Weiterleitung, Host-Header, HEAD und Abbruch.
- Vollständiger Bridge-Aufruf blockiert eine private 302-Weiterleitung,
  bevor das private Ziel kontaktiert wird.
- Bestehender Allowlist-Modus, Authentifizierung und signierte Medientickets.
- PWA-Test reproduziert zuerst den alten Fehler: ein HTTP 502 startet dennoch
  den Player. Mit der Korrektur: eine Probe, keine Decoderstarts, konkrete
  Fehlermeldung, begrenzte Fehlerantworten und keine ungeprüften Rohdaten im Log.
- Vorgeschriebene fünf Projekt-Smokes sowie TV und Diagnoseprüfungen bestanden.

Eine echte Wiedergabe über den neu freigegebenen Medienserver auf der
Synology steht nach Installation noch aus. Keine neue visuelle Freigabe
für Bildschirmprofile behauptet; keine CSS-/Layoutänderung.
