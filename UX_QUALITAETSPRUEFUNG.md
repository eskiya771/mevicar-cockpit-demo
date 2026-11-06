# MeviCar Next – UX-Qualitätsprüfung und Funktions-Freeze

Stand: 6. November 2026 · Ausgangspunkt **Prototype v0.4.0**  
Geltungsbereich: **eskiya771/mevicar-cockpit-demo**, nicht die Android-App `eskiya771/mevicar`.

## Einordnung zum aktuellen Stand

Dieses Dokument hält Qualitätsrunden ab v0.4.0 fest. Inzwischen ist v0.5.0 einschließlich Premium-Tacho implementiert. Die aktuelle Phase bleibt Quality First für den gesamten vorhandenen Umfang; neue Funktionsbereiche nur auf ausdrücklichen Auftrag. Das aktuelle Funktionsinventar und die priorisierten Codebefunde stehen in [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md). Historische Messwerte und Checklisten unten sind keine erneute Freigabe des aktuellen Builds.

## Ziel der ursprünglichen Qualitätsphase

**Kein Ausbau des Funktionsumfangs.** Wir prüfen und verfeinern ausschließlich Navigation, Adresseingabe, App-Dock und SVGs, Original/Neon City/Liquid Glass, MeviMedia, Split-Screen, Bildschirmschoner und Lichtshow. Jede Änderung soll eine konkrete Bedienungs- oder Darstellungsverbesserung nachweisen. Ein neuer Release folgt erst, wenn die Kriterien erfüllt und auf den Zielgeräten geprüft sind.

## Tatsächlich vorhandene Funktionen und Grenzen

| Bereich | Nachgewiesener Stand | Offener Qualitätsbedarf |
|---|---|---|
| Navigation | Vektor-Demokarte, Browse/Search/Preview/Driving-Ansichten, gespeicherte und letzte Demo-Ziele | Keine echte Karte, Geocodierung, Routenberechnung, Verkehrsdaten oder echte Turn-by-Turn-Führung. Demo weiter klar kennzeichnen; Such- und Tastatur-UX prüfen |
| Adresseingabe | Eigene QWERTZ-Touch-Tastatur, physische Tasten, Treffer aus vordefinierter Ortsliste und Freitexteingabe | Tastatur-Fokus auf iOS/DeX, Suchvorschläge, Eingabe abbrechen/zurück/clear, Ergebnislisten ohne Dopplung; Freitext erzeugt keine realen Koordinaten |
| Split-Screen | Karte links und Zusatz-App rechts, Vollbild-Toggle per erneutem Dock-Tap | Funktion in Portrait, Querformat, kleinen und großen Viewports visuell prüfen; Einstellungen und Launcher bewusst zunächst Vollbild |
| Farbdesigns | Original, Cyberpunk Neon City, Liquid Glass, Auswahl in Settings und lokale Speicherung | Jede Ansicht in allen Themes auf Kontrast, Glow, Hover/Active, Ausrichtung, Icon-Hierarchie und Lesbarkeit prüfen |
| App-Symbole | Eigene SVG-Piktogramme im Dock und Launcher, Audio dynamisch nach Quelle | In Seiteninhalten noch gemischte Emojis/Textglyphen; inkonsistente Icon-Größen und unnötige optische Effekte systematisch reduzieren |
| MeviMedia | Browser-Dateien/Ordner, Bibliothek (Titel/Favoriten/Interpret/Album/Ordner/Videos), lokale Medienwiedergabe, ID3-Metadaten, Warteschlange, Shuffle/Repeat, Videofenster | Mit echten MP3/MP4 auf Gerät testen; sehr lange Titel/Listen, leere Bibliothek, Spulen, Accessibility, Touchflächen und Mini-Player-Layout prüfen |
| Radio und Spotify | Visualisierte Audioquellen mit umschaltender Dock-Beschriftung/SVG | Derzeit **Design-Demos**, keine echte Spotify- oder Radiowiedergabe. Keine Scheinbedienbarkeit vortäuschen |
| Bildschirmschoner | Idle-Erkennung, 35 MeviDarts-Effekte, einstellbare Zeit, Vorschau | Energieverbrauch/Abbruch und Bewegung-reduzieren in Browsern prüfen |
| Lichtshow | Eigene App, 35 Renderer, Split-Screen, Effektwahl und Timer, Pause | GPU-Last und Wechsel Vollbild/Split, Abbruch bei App-Wechsel visuell prüfen |
| Tacho | Browser-Geolocation mit Speed/Altitude/Heading + Anzeigen bis 220 km/h | Live-GPS-Rechte/Sensoren abhängig vom Gerät; Navi-Demokarte verwendet **nicht** diese Daten für reale Positionierung |

## Gefundene und bereits korrigierte Bedienungsprobleme – Qualitätsrunde 1

- **Navigation als Hauptansicht:** Zusatz-Apps starten aus Launcher und Dock standardmäßig im Split-Screen. Ein weiterer Dock-Tap schaltet die aktive App auf Vollbild bzw. zurück. App-Übersicht und Settings bleiben initial Vollbild.
- **Adresssuche:** Nutzlose Mikrofon-Dekoration entfernt, verständliche Beschriftung „Wohin soll es gehen?“, leeres Löschsymbol versteckt, Vorschlagsüberschrift verschlankt und Eingabe-Reset synchronisiert.
- **Doppelte Orte:** Die oberhalb der Liste nochmals gezeigte letzte Adresse entfernt; recents dedupliziert und in Vorschlägen priorisiert.
- **Symbole:** Gleiche SVG-Familie für Suchfeld, Adress-Ergebnisliste und Favoriten.
- **Routenvorschau:** Zwei simulierte Alternativzeiten ohne echte Unterscheidung entfernt. Start und Vorschau sichtbar als Demo gekennzeichnet.
- **Leere Aktionen:** Die beiden funktionslosen Karten-Buttons (Position/Ausrichtung) entfernt; überflüssiges „Zusatzscreen“ in der Routenansicht ebenfalls.
- **Fahrhinweise:** Feste „in 850 m rechts abbiegen“-Behauptung entfernt, da die Karte keine Wegberechnung besitzt.
- **Regression:** Automatisierter Navigation-/UX-Test im GitHub-Pages-Workflow neben bestehenden Media-/Lichtshow-Tests.

## Qualitätsrunde 3 – Touchflächen und kleine Querformate (Build nach Bereitstellung)

- Die fünf verbindlichen CSS-Viewports (iPhone 17, S20 FE, DeX, Full HD, 1920×720) mit Chromium geometrisch geprüft.
- Auf DeX und 1920×720 vorher zu kleine Audio-Quellentasten (teils nur 32 px Höhe) auf mindestens 44 px vergrößert.
- In der kompakt dargestellten Medienansicht Play/Pause, Skip, Shuffle, Repeat und Favoriten auf größere, verlässlich erreichbare Touchflächen gebracht.
- Auf iPhone 17 und S20 FE die QWERTZ-Tastatur im Splitscreen von 54 % auf 60 % Kartenbreite vergrößert; Trefferliste angepasst, ohne das Nebeneinander zu verlieren.
- Die Statusaktionen sichtbarer gemacht (bis zu 42 px, in sehr flachen Formaten bewusst kompakter).
- Playwright-/Chromium-Messungen für Navi, Suche, Medien-Split, Medien-Vollbild, Bibliothek und App-Launcher: keine überstehenden Player- oder Audio-Tasten; Suchvorschläge dürfen *innerhalb ihrer scrollbaren Liste* über die Sichtfläche hinausragen.
- Bestehende Funktionen unverändert; nur Touch- und Layoutfeinschliff.
- CI-Erweiterung: `tests/display-profiles-smoke.mjs` überwacht die Mindestgrößen und Tastaturbreite.

**Noch offen:** Statusbuttons mit 34–42 CSS-Pixeln bleiben aus Platzgründen etwas kleiner als das 44-Pixel-Ziel; echte Safari- und DeX-Touchtests bleiben erforderlich.

## Offene Prüfungen in Prioritätsreihenfolge

### P0 – Funktion/Korrektheit
- [ ] Auf realen Geräten die Navigation ↔ App-Dock ↔ Split-Screen ↔ Vollbild-Kette testen.
- [ ] Adresssuche über Touch-Eingabe, physische Tastatur, Löschen, Zurück, Auswahl, Verlauf und Freitext durchtesten.
- [ ] Echtes MP3/MP4 abspielen: Pause/Resume, Skip, Queue, Favorit, Shuffle, Repeat, Video, Quelle wechseln.
- [ ] Prüfen, ob Audio während Rerender/Split-Screen-Wechsel ohne Unterbrechung erhalten bleibt.
- [ ] Fehlermeldungen und inaktive Bedienelemente auf Wahrheit und klare Rückmeldung prüfen.

### P1 – Optik und Touch-Bedienung
- [ ] Screenshots in allen drei Themes: 1920×1080, 1280×720, Samsung-S20-FE-Querformat und Split-Screen.
- [ ] Keine abgeschnittenen Symbole, Texte oder Wiedergabesteuerung; minimale Touchfläche möglichst 44×44 CSS-Pixel.
- [ ] Kein Scrollen der Haupt-Cockpit-Ansicht im Querformat; Scrollen nur in Listen/Ergebnisbereichen.
- [ ] Einheitliche Abstände, Schriftgrößen, Icon-Dimensionen, Active/Inactive/Fokus, Kontrast und Glow.
- [ ] Medienbibliothek/Player, Adress-Suchbox und Karte ohne Leerraum- oder Überlappungsprobleme.
- [ ] Nichtfunktionale Radio-/Spotify-Demo-Buttons als Demo kenntlich machen bzw. bereinigen.

### P2 – Bereinigung und Wartbarkeit
- [ ] HTML/CSS/JS-Duplikate und redundant widersprechende Theme-Regeln reduzieren.
- [ ] Inline-Stile und Emoji-Fallbacks schrittweise auf zentrale UI-Komponenten/SVGs vereinheitlichen.
- [ ] Screen- und Theme-basierte Regressionstests ergänzen; Accessibility/Keyboard-Fokus prüfen.
- [ ] Source-Split und Styles konsolidieren, ohne neue Funktionsbereiche hinzuzufügen.

## Abnahmeregel

Ein Bereich gilt erst als **fertig**, wenn (1) die beschriebenen Bedienelemente korrekt funktionieren oder ausdrücklich Demo sind, (2) die Automation erfolgreich ist, (3) visuell mindestens Querformat und Split-Screen in allen drei Themes getestet wurden und (4) nach dem letzten Feedback keine bekannten P0/P1-Fehler offen sind.

Ein erfolgreicher GitHub-Actions-Build **allein ist keine visuelle Freigabe**. Neue Features bleiben während dieses Qualitäts-Freeze zurückgestellt.
