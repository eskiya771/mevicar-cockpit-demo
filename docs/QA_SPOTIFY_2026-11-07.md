# Spotify-QA – 7. November 2026

## Auftrag und Umfang

Echte Spotify-Fernsteuerung im Browser-Cockpit statt der bisherigen Demo. Steuerung erfolgt über die Spotify Web API auf einem aktiven Spotify-Gerät; im Browser läuft kein Spotify-Audio und es wird kein Web Playback SDK verwendet. Produktversion bleibt `0.5.0`.

## Sicherheit und Architektur

- Authorization Code mit PKCE (`S256`), kein Backend und kein Client Secret.
- Client ID public in `localStorage`; Access-/Refresh-Token lokal; Verifier und State nur in `sessionStorage`.
- Redirect-URI wird aus dem aktuellen Pfad abgeleitet und im Setup mit Kopierfunktion angezeigt.
- Keine Spotify-Passwörter, keine serverseitige Tokenablage, kein Token in der URL nach dem Callback.
- Endpunkte für die Februar-2026-Dev-Mode-Regeln angepasst: `/me/library` und `/me/library/contains`, Suche mit `limit=10`, keine `/browse/*`- und Batch-Endpunkte.
- Quellenwechsel weg von Spotify pausiert die externe Wiedergabe best effort. Spotify-Start stoppt lokale Medien und Radio.

## Automatisierte Prüfungen

Alle sechs Smoke-Tests liefen lokal erfolgreich:

```text
node tests/mevimedia-smoke.mjs
node tests/lightshow-smoke.mjs
node tests/ui-quality-smoke.mjs
node tests/display-profiles-smoke.mjs
node tests/speedometer-smoke.mjs
node tests/spotify-smoke.mjs
```

`spotify-smoke.mjs` prüft: PKCE ohne Secret, Storage-Trennung, erwartete Web-API-Endpunkte, Vermeidung entfernter Endpunkte, Suchlimit, Retry-After, Premium-Fehler, Linkvalidierung, Setup-/Verbunden-UI, Mount/Unmount und die Einbindung in `index.html`, `sw.js` und den Pages-Workflow. Die Tests ersetzen keinen echten OAuth- oder Wiedergabetest.

## Browserprüfung

Aufbau: temporäre gebaute Kopie mit `__MEVICAR_BUILD__` ersetzt (Build 900, Commit `localtest`), lokaler HTTP-Server, Google Chrome 156.0.8078.81 über Playwright 1.65.0. Spotify-API und Account-Endpunkte wurden per Playwright-Routing gemockt; Profil, Now Playing, Geräte, Warteschlange, Suche und Bibliothek lieferten feste Testdaten. Coverbild war ein weißes 1×1-PNG, daher die weißen Artwork-Flächen in den Screenshots.

Geprüft: 5 Profile × 3 Themes

| Profil | CSS-Viewport |
| --- | --- |
| iPhone 17 | 874×402 |
| Galaxy S20 FE | 915×412 |
| Full HD | 1920×1080 |
| Panorama | 1920×720 |
| DeX | 1920×1200 |

Zustände: Now Playing in Split und Vollbild, Durchsuchen in Split, Suche in Split (Default-Theme), Einrichtung ohne Token in Split. Insgesamt 45 Messläufe und 65 Screenshots.

Ergebnis:

- Keine horizontale oder vertikale Dokument-Überläufe, kein aus dem Viewport ragendes Spotify-Panel, keine App-Konsolenfehler.
- Ein 404 auf `/favicon.ico` im lokalen Testserver ist ein Harness-Artefakt und keine App-Funktion.
- Now-Playing, Tabs, Suche, Bibliothek, Geräte-/Warteschlangen-Drawer und Setup passten in alle Profile.
- Unter 1200 px Breite oder 600 px Höhe ist Spotify einspaltig mit Tab-Umschalter; ab 1200×600 erscheinen Now Playing und Bibliothek nebeneinander.
- Auf dem iPhone-Profil scrollt die Einrichtung (560 px Inhalt bei 298 px Sichtfläche); Client-ID-Feld und „Mit Spotify verbinden“ sind per Scrollen erreichbar.
- Beim ersten Lauf gefunden und korrigiert: Durchsuchen/Suche zeigten im kompakten Modus zusätzlich die Now-Playing-Leiste; die Coverfläche war im schmalen Split zu groß. Nach Korrektur sauber dargestellt.

Screenshots liegen nur im temporären Prüfordner und sind nicht versioniert.

### Funktionale Mock-Prüfung

Zusätzlich wurden die echten Bedienelemente im Browser mit geloggten API-Aufrufen durchgeklickt. Alle zwölf Prüfungen bestanden, ohne Seiten- oder Konsolenfehler: Pause, Weiter, Shuffle, Repeat, Like (`/me/library/contains` + `/me/library`), Warteschlange, Gerätewahl inklusive Transfer, Suche, Link-Wiedergabe und Pause beim Quellenwechsel zu Radio. Radio wurde danach korrekt angezeigt.

## Nicht geprüft

- Echte Spotify-Anmeldung, Token-Refresh über längere Zeit und reale Wiedergabesteuerung.
- Reales Premium-Konto und echte Geräte (iPhone 17, S20 FE, DeX-Monitor).
- Wechsel einer installierten iPhone-PWA nach Safari während des OAuth-Flows und getrennte Speicherung.
- Hintergrundverhalten, Sperrbildschirm, Media-Session-Konflikte, VoiceOver/TalkBack und echte Touchgrößen.
- Rate-Limit-Verhalten gegen den echten Dienst.

## Einrichtung für den Live-Test

1. Im [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) eine App anlegen und im Dev Mode bleiben.
2. Als Redirect URI exakt `https://eskiya771.github.io/mevicar-cockpit-demo/` eintragen.
3. Client ID kopieren, im Cockpit unter Spotify → Konto eintragen und speichern.
4. Spotify auf dem Zielgerät öffnen und einen Titel starten, damit ein Gerät aktiv ist.
5. „Mit Spotify verbinden“ drücken, Premium-Konto bestätigen und die Wiedergabesteuerung prüfen.

Dev Mode: maximal 5 Nutzer, App-Inhaber benötigt Premium. Auf dem iPhone kann die Anmeldung aus einer installierten PWA in Safari landen; dann die Verbindung dort herstellen. Das ist eine Plattformgrenze, keine stille Fehlfunktion.
