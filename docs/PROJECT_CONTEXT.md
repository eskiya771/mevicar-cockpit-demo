# MeviCar Next – Projektkontext

Stand der Codeanalyse: 7. November 2026.

## 1. Identität und verifizierter Ausgangsstand

MeviCar Next ist ein browserbasierter Automotive-Cockpit-Prototyp, keine Android-APK und keine produktive Fahrzeugsteuerung. Repository: https://github.com/eskiya771/mevicar-cockpit-demo. Live: https://eskiya771.github.io/mevicar-cockpit-demo/.

Bei Übernahme: `main` und `origin/main` nach Fetch identisch, Arbeitsbaum sauber, Produktversion `0.5.0`. Live-`build-info.json` meldete Build **145** mit Commit `dd9a947`; verifizierter erfolgreicher Pages-Run: https://github.com/eskiya771/mevicar-cockpit-demo/actions/runs/42307132544.

Diese Angaben sind ein datierter Ausgangspunkt, keine dauerhaft aktuelle Buildanzeige. Bei neuer Arbeit erneut prüfen. Lokales Git, Node und authentifizierter GitHub-CLI-Zugriff auf Actions sind verfügbar. Der NAS-Pfad kann außerhalb der Sandbox Zugriff und eine auf den einzelnen Git-Aufruf begrenzte `safe.directory`-Angabe erfordern; keine globale Vertrauensfreigabe für beliebige Repositories setzen.

Aktuelle Arbeitsphase: Quality First und kurze, getestete Verbesserungen am bestehenden Umfang. Neue Apps, größere Architekturwechsel und offizielle Releases brauchen einen konkreten Auftrag. Die erste Übernahme verändert nur Dokumentation.

## 2. Struktur und Start

Kein npm-Paket, Framework oder Transpiler. Versioniert sind HTML, CSS, klassische Browser-JavaScript-Dateien, sechs Node-Smoke-Tests, zwei GitHub-Workflows und Markdown-Dokumentation. Die Produktionsauslieferung hat dennoch einen Buildschritt in Python.

| Bereich | Dateien und Verantwortung |
| --- | --- |
| Shell und Steuerung | `index.html`: Basis-CSS, HTML-Shell, globaler Zustand, Registry, Templates, Navigation, Rechner, Uhr, Demo-Apps, Build-/Updatefunktionen |
| Theme und gemeinsame Oberfläche | `themes.css`: Themes, Launcher, Dock, SVG-Stile, Navigation; auch historische Layout-Overrides |
| Displayprofile | `display-profiles.css`: zuletzt geladen, profilabhängige Such-/Medien-/Touch-Regeln |
| Medien | `mevimedia.js`, `mevimedia.css`: lokale Dateien, Bibliothek und dauerhafter Player |
| Spotify | `spotify.js`, `spotify.css`: OAuth-PKCE, Web-API-Fernsteuerung, eigene Moduloberfläche |
| Tacho | `speedometer.js`, `speedometer.css`: SVG-Instrumente, GPS, Kompass, Demo, Trip, Ingest-API |
| Lichtshow | `lightshow.js`, `lightshow.css`: App mit eigenem Canvas-Lifecycle |
| Bildschirmschoner | `screensaver.js`, `screensaver.css`: globales Idle-Overlay |
| Gemeinsame Effekte | `mevidarts-parallax.js`, `mevidarts-showcase.js`, `mevidarts-light-renderer.js` |
| PWA und Auslieferung | `sw.js`, `manifest.webmanifest`, `VERSION`, `.github/workflows/pages.yml`, `release.yml` |

Das Inline-Skript definiert die Shell und startet `render()`, Buildanzeige, Toolbar und Uhr. Anschließend werden die klassischen Skripte geladen: Parallax → Showcase → gemeinsamer Renderer → Screensaver → Media → Spotify → Lichtshow → Tacho. Module sind IIFEs mit gezielt auf `window` veröffentlichten APIs; kein Modul-Bundler und kein Import-System.

**Lokaler Start:** `const CURRENT_BUILD=__MEVICAR_BUILD__` ist ein echter Buildplatzhalter. Unverarbeitet erzeugt er einen Laufzeitfehler. Pages ersetzt ihn und erzeugt außerdem `build-info.json` sowie PWA-Icons. Für lokale Browserprüfung eine temporäre gebaute Ausgabe wie im Workflow herstellen und per HTTP auf localhost bereitstellen. Die Icons sind nicht im Repository; ein bloßer Server über den Rohdateien reicht daher auch für den SW-Precache nicht aus. Keine generierten Dateien unbeabsichtigt committen.

## 3. State, Navigation und Rendering

`initial()` erzeugt `s`: Dockposition, App, Layoutmodus (`map`, `split`, `full`), Nav-Zustand (`browse`, `search`, `preview`, `driving`), Eingabe, Ziel, Route, zuletzt verwendete Zusatz-App, Favoriten/Verlauf, Audioquelle, Telefon-/Trip-/Demo-Zustand und Theme. Ein separates `calcState` hält den Rechnerzustand.

`fixed`, `extras` und `all` sind die App-Registry. `APP_VECTORS` enthält SVG-Pfade; `appVector()` erzeugt SVG-Markup, `DOCK_COLORS` ordnet Akzente zu. Mehrere `Object.assign`-Blöcke erweitern beziehungsweise überschreiben Symbole. Audio-Name und -Symbol folgen der Quelle Radio/Spotify/Medien.

- `openApp('nav')`: Karte; neue reguläre App: Split. Erneuter Tipp auf aktive App: Vollbild/Split.
- `openApp('apps')` und `openApp('settings')`: initial Vollbild.
- `launch(id)`: Zusatz-App im Split, Settings als Ausnahme im Vollbild.
- `appBody()`: zentrale Verzweigung zwischen Modul-HTML und inline erzeugten Demoansichten.
- `mapHTML()`: feste SVG-Demokarte und zustandsabhängige Overlays, keine Kartendienstintegration.
- `render()`: Dock neu aufbauen, Layout wählen, Spotify/Tacho/Lichtshow unmounten, `#screen.innerHTML` ersetzen, danach wieder mounten. Media, Spotify, Tacho und Lichtshow erhalten spezielle Hosts ohne zusätzliche Überschrift.
- `updateQuery()` aktualisiert Suchtreffer gezielt; Sensorupdates im Tacho ersetzen den Screen nicht.

`render()` zerstört lokalen DOM-Zustand wie Fokus und Scrollpositionen. Er wird auch durch Themewechsel, Rechnerbedienung und verschiedene Medienaktionen aufgerufen. Daten in `s` und Modul-Closures bleiben erhalten. `reset()` setzt nur `s` zurück; es ist kein vollständiger Reset von Medien, Tacho, Rechner oder Browser-Speicher.

Adresssuche: feste Ortsliste, deduplizierte Recents, Freitext als ausdrücklich nicht geocodiertes Ziel. Eigene QWERTZ-Tastatur; ein globaler Keydown-Handler bedient physische Eingaben. Das Eingabefeld ist readonly und unterdrückt die native Bildschirmtastatur. Favoriten und Recents sind im Arbeitsspeicher, nicht dauerhaft gespeichert.

## 4. Tatsächlicher Funktionsumfang

| Bereich | Implementiert | Grenzen |
| --- | --- | --- |
| Navigation | Browse/Search/Preview/Driving, Zielauswahl, Favoriten, Verlauf, statische Route | Keine echte Karte, Positionierung, Geocodierung, Verkehrsdaten oder Routenberechnung |
| Dock/Launcher | SVGs, Zusatzslot, Layoutwechsel, sourceabhängige Audiobeschriftung | Einige historische Symboldefinitionen werden später überschrieben |
| Themes | Drei live umschaltbare Themes, lokale Speicherung | Noch kein durchgängiges gemeinsames Tokensystem |
| MeviMedia | Dateien/Ordner, lokale Audio-/Videowiedergabe, Suche/Gruppen/Favoriten, Queue, Seek, Lautstärke, Shuffle/Repeat, begrenzte ID3-/Cover-Auswertung | Browsercodecs und Dateifreigabe erforderlich; keine dauerhafte Bibliothek oder stille USB-Suche |
| Radio | Echtes Internetradio mit 13 direkten HTTPS-MP3-Streams aus Classic, Suche, Favoritenfilter, bis zu 20 eigene HTTPS-Streams, Start/Stopp, Senderwechsel, Lautstärke, automatische Wiederverbindung, gespeicherte Sender/eigene Streams/Favoriten | Internet erforderlich; keine UKW-/DAB-Hardware, keine Sendungstitel/ICY-Metadaten; eigene Streams nur HTTPS ohne Zugangsdaten; Browser-/OS-Grenzen bei Hintergrundbetrieb und Lautstärke |
| Spotify | Echte Fernsteuerung des aktiven Spotify-Geräts über Web API: OAuth PKCE, Now Playing mit Cover/Fortschritt, Play/Pause/Vor/Zurück, Seek, Shuffle/Repeat, Bibliotheks-Like, Warteschlange, Gerätewahl, Lautstärke, Suche, Playlists/Alben/Podcasts, Link-Eingabe, Fehler-/Premium-/Offline-Zustände | Spotify Premium und aktives Gerät erforderlich; kein Audio im Browser; Login und echte Wiedergabe noch nicht mit realem Client ID verifiziert; Dev Mode max. 5 Nutzer; iPhone-PWA kann die Anmeldung in Safari öffnen |
| Premium-Tacho | 0–220 km/h, 0–8000 U/min, GPS-Trip, Sensor-/GPS-Kompass, klarer Demo-Modus | RPM/Gesamt-km nur über API; kein physischer OBD-Transport |
| OBD-App | Feste Anzeige 82 km/h / 2150 U/min | Nicht mit Tacho-Ingest verbunden; keine Hardwaredaten |
| Home Assistant | Lokaler Licht-An/Aus-Schalter | Kein Serveraufruf oder echte Haussteuerung |
| Fahrtenbuch | Start/Stop-Flag, Demo +1,2 km | Kein Tracking; getrennt vom GPS-Trip |
| Telefon | Testanruf, Annehmen/Auflegen, vorherige Ansicht wiederherstellen | Keine Telefonie |
| Wetter/WhatsApp/Teams/Kalender | Statische Texte | Keine Live-Daten oder Kontoverbindung |
| YouTube | Demo-Platzhalter | Kein eingebetteter Videodienst |
| Aktien | Umschaltbare feste Kurse | Als simuliert gekennzeichnet |
| Rechner/Uhr | Grundrechenarten, Prozent, Vorzeichen, Löschen; Systemzeit, Datum, KW | Rechner separat in RAM; Kalender-App ist keine Terminverwaltung |
| Screensaver/Lichtshow | 35 Canvas-Effekte, Settings, Timer, Vorschau bzw. Appsteuerung | Geräteleistung und Interaktionen müssen real geprüft werden |

Ein Teil der Platzhalter trägt noch keine gut sichtbare eigene Demo-Kennzeichnung. Vorhandene externe Tools dieser Arbeitsumgebung sind keine Integrationen der Anwendung.

## 5. Modul-Lifecycle und Persistenz

### MeviMedia

Ein `video`-Element übernimmt Audio und Video. `ensurePlayer()` hängt es in ein Overlay direkt an `document.body`, außerhalb von `#screen`. Deshalb ist absichtlich kein Mount/Unmount beim Appwechsel vorhanden; Audio kann beim Rerender weiterlaufen. Quellenwechsel weg von Medien pausiert den Player. Video schließen pausiert Video. Objekt-URLs werden beim Titel-/Coverwechsel freigegeben. Dateilisten bleiben nur für die Sitzung verfügbar.

Ordner: `showDirectoryPicker` im sicheren Kontext, sonst Dateiinput mit `webkitdirectory`. Rekursion begrenzt auf Tiefe 10 und 3000 Dateien; Liste zeigt bis zu 350 Treffer. ID3v2.3/2.4 wird aus den ersten 256 KiB gelesen, kein allgemeiner Metadatenparser. Favoriten identifizieren Dateien anhand Pfad, Größe und Änderungszeit.

### Internetradio

Radio ist im vorhandenen mevimedia.js integriert und nutzt dessen Icons, Quellenwahl und Layout. Der feste Katalog entspricht [Classic RadioStations.kt](https://github.com/eskiya771/mevicar/blob/main/app/src/main/java/de/mevicar/app/RadioStations.kt). Die sichtbare Senderliste ist eine dynamische Kombination aus Katalog und eigenen HTTPS-Streams. Suche prüft Name und Beschreibung; der Favoritenfilter ist sitzungsbezogen. Ein audio-Element hängt während einer Wiedergabe direkt an document.body, außerhalb von #screen. App-, Theme- und Layoutwechsel zerstören es nicht. Start erfolgt ausschließlich durch Senderwahl oder Abspielen. Stopp, Quellenwechsel, Offline-Ereignis und Fehler entfernen Quelle und Element; erneuter Start verbindet live neu. Kein Stream-Proxy und keine neue Laufzeitbibliothek.

Eigene Sender werden nur als vollständige HTTPS-URLs ohne Benutzername/Passwort akzeptiert, dedupliziert, auf 60 Zeichen Namen und 20 Einträge begrenzt. Entfernen ist zweistufig (erst vormerken, dann bestätigen), damit kein natives confirm() nötig ist. Fehler unterscheiden nicht erreichbaren Stream, 15-Sekunden-Timeout, unterbrochene/beendete Wiedergabe sowie Browser-Blockade und nicht unterstütztes Format. Automatische Wiederholung erfolgt höchstens dreimal nach 4, 10 und 25 Sekunden; ein manueller Stopp bricht alle Versuche ab. NotAllowedError und NotSupportedError werden nicht automatisch wiederholt, sondern verlangen eine Nutzeraktion. Offline pausiert offene Versuche; das online-Ereignis startet einen weiterhin gewünschten Stream frisch.

Medien und Radio teilen sich die Media-Session-Steuerung nach aktiver Audioquelle. Radio pausiert lokale Medien, deren Start beendet Radio. Verspätete Events/Play-Promises alter Streams werden über eine Generation verworfen; verspätete Cover-Metadaten dürfen die Radioanzeige nicht überschreiben. Medienereignisse ändern nur Status und Schaltflächen, nicht den Screen-DOM. Auch Suche und Favoritenfilter aktualisieren nur Liste und Zähler, damit der Suchfokus erhalten bleibt. Ein Download-Stall bei noch abspielbarem Puffer löst keinen unnötigen Stopp aus.

LocalStorage-Schlüssel mevicar-radio-v1 speichert Sender-ID, Lautstärke, Favoriten und eigene Streams. Wiederherstellung startet niemals automatisch; gespeicherte Einträge werden validiert, ungültige URLs und Duplikate verworfen. Nachweis: [Radio-QA](QA_RADIO_2026-11-06.md).

### Spotify

`spotify.js` steuert das aktive Spotify-Gerät über die Web API; im Browser wird kein Spotify-Audio abgespielt. Authentifizierung ist Authorization Code mit PKCE, ohne Backend und ohne Client Secret. Client ID und Tokens liegen in localStorage, Verifier und State nur in sessionStorage. Die Redirect-URI wird aus `location` abgeleitet und muss im Spotify Developer Dashboard exakt hinterlegt sein. `meviSpotifyHTML(compact)`, `meviSpotifyMount()` und `meviSpotifyUnmount()` integrieren das Modul in den Cockpit-Lifecycle.

Mount startet 3-Sekunden-Polling und einen 500-ms-Fortschrittstakt; Unmount entfernt beide Timer. Polling pausiert bei verborgenem Tab, nach `online` wird sofort aktualisiert, `Retry-After` blockiert weitere Anfragen. Quellenwechsel weg von Spotify pausiert die externe Wiedergabe best effort; Spotify-Start stoppt lokale Medien und Radio. Fehler werden unterschieden: 401 Token-Refresh beziehungsweise Trennung, 403 Premium, 404 kein Gerät, 429 Rate Limit, Offline/Timeout. Likes nutzen `/me/library` und `/me/library/contains`; die Suche bleibt bei 10 Treffern je Typ. Keine `/browse/*`- oder Batch-Endpunkte, kein Web Playback SDK.

Live-OAuth, reales Premium-Konto, Hintergrundverhalten und der mögliche Wechsel einer installierten iPhone-PWA nach Safari sind offene Geräteprüfungen. Nachweis: [Spotify-QA](QA_SPOTIFY_2026-11-07.md).

### Tacho

Live- und Demo-Modell getrennt in der Closure. `meviSpeedHTML(compact)`, `meviSpeedMount()`, `meviSpeedUnmount()` integrieren den Tacho. Mount bindet ResizeObserver und bei zuvor aktivierten Quellen Sensoren; Unmount entfernt Watch, Kompasslistener, Observer und Animationsframe. Quellwünsche und Messwerte bleiben in RAM. Bei `document.hidden` stoppt die Animation, die GPS-/Kompass-Subscriptions werden dabei jedoch nicht entfernt. iOS-Kompassberechtigung wird durch Benutzeraktion angefragt; automatisches Wiederanbinden nach Remount ist auf Plattformen mit `requestPermission` aktuell ausgeschlossen.

`requestAnimationFrame` interpoliert Nadeln; reduced motion wird abgefragt. Demo erzeugt Geschwindigkeit, RPM, Heading und separaten Trip, niemals Gesamt-km. GPS kann während der Demo weiter ins Live-Modell schreiben.

Kompass und km-Anzeigen skalieren mit der Viewport-Höhe und bleiben in allen Layouts mindestens 44 px (Kompass) beziehungsweise 17 px (Werte) groß. Auf kurzen, breiten Viewports ab 760 px Breite teilen sich Gesamt-km, Trip, Kompass und Aktionen eine Footer-Zeile, damit die Instrumente die gewonnene Höhe nutzen; darunter bleibt die zweizeilige Anordnung, damit Kompass und Schaltflächen nicht kollidieren.

GPS-Trip: Haversine, Koordinatenprüfung, Genauigkeit bis 80 m, maximal 230 km/h zwischen Punkten, unter 3 m kein Zuwachs. Fehlende Genauigkeit wird akzeptiert. `lastPoint` überlebt Stop/Unmount; dadurch sind Lücken und Wiederaufnahme besonders zu prüfen. GPS-Geschwindigkeit wird separat vom Tripfilter übernommen; bei fehlender Speed und akzeptiertem Fix setzt der Code 0 statt unbekannt.

`meviSpeedIngest({rpm, odometerKm, speedKmh, sourceSpeed})` akzeptiert endliche nichtnegative Zahlen. RPM wird auf 8400 begrenzt, Geschwindigkeit auf 400; die Nadeln begrenzen separat auf ihre Skalenenden. RPM/Gesamt-km erhalten Quelle `obd`. Für Speed muss `sourceSpeed` truthy sein; kein Enum wird erzwungen. `null` löscht keine Werte, Zeitstempel/TTL und Quellenpriorität fehlen; GPS kann OBD-Speed überschreiben. Die API ist ein Einspeisepunkt, keine vorhandene Fahrzeugverbindung.

### Effekte

Parallax exportiert fünf deterministische Szenen auf 480×270 logischen Pixeln; Showcase zehn Szenen inklusive Touchzustand. Der gemeinsame Canvas-2D-Renderer ergänzt 20 Effekte und bietet `create`, `resize`, `draw`, `touch`, `reset`. Er besitzt keinen eigenen Animationsloop. Aufrufer begrenzen DPR auf 1,5.

Lichtshow mountet einen Renderer, bindet Pointer/ResizeObserver und animiert etwa mit 33 fps. Unmount/verborgener Tab stoppen den Loop. Effect/Intervall werden gespeichert, Laufzeit startet bei Mount neu. Die CSS-Regel für reduced motion entfernt nur die Buttontransformation; der JS-Canvasloop berücksichtigt diese Präferenz nicht.

Screensaver verwaltet ein globales Body-Overlay, Idle- und Uhrtimer sowie Eingabe-Capture-Listener. Route und Lichtshow sperren automatischen Start. Der GPS-Schutz liest noch das veraltete `gpsData.active` aus `index.html`; der neue Tacho aktualisiert dieses Objekt nicht. Dieser Schutz ist daher aktuell wirkungslos. Reduced motion zeigt beim Saver ein statisches Canvasbild.

| LocalStorage-Schlüssel | Inhalt |
| --- | --- |
| `mevicar-next-theme` | Theme-ID |
| `mevicar-media-favorites-v1` | Dateiidentitäten der Favoriten |
| `mevicar-media-options-v1` | Shuffle und Repeat |
| `mevicar-spotify-client-v1` | Spotify Client ID (öffentlich) |
| `mevicar-spotify-token-v1` | Access-/Refresh-Token mit Ablaufzeit |
| `mevicar-spotify-history-v1` | letzte Spotify-Suchbegriffe |
| `mevicar-next-saver-v1` | Screensaver-Konfiguration |
| `mevicar-lightshow-v1` | Effekt und Wechselintervall |
| `mevicar-tacho-trip-v1` | GPS-Trip |

## 6. Responsive- und Theme-Architektur

Kaskadenreihenfolge: Inline-Basis in `index.html`, `themes.css`, `screensaver.css`, `mevimedia.css`, `spotify.css`, `lightshow.css`, `speedometer.css`, zuletzt `display-profiles.css`. Letzte Position gewinnt nur bei passender Spezifität; Theme-Selektoren und `!important` müssen mitgeprüft werden.

Shell nutzt `100dvh`, feste Body-Fläche, Safe-Area-Padding und globales `overflow:hidden`. Flex-/Grid-Kinder benötigen `min-width:0`/`min-height:0`. Allgemeine `.side`/`.full` erlauben Inhaltsscrollen; spezialisierte Modulhosts verhindern es. Splitbreite ist modulspezifisch, kein einheitlicher globaler Anteil.

Zielprofile: iPhone 17 874×402, S20 FE 915×412, DeX 1920×1200, Full HD 1920×1080, Panorama 1920×720, jeweils CSS-Pixel. Themes: `default`, `cyberpunk`, `liquidglass` über `document.documentElement.dataset.theme`.

- Mobil bis 1024 px Breite und 480 px Höhe: Suche nutzt zuletzt 72 % Breite für Tastatur, 26 % für Treffer; Dock per `:has(.map.searchmode)` versteckt. Tastenhöhe 51–58 px. Frühere 54-/60-%-Regeln existieren weiterhin und werden überschrieben.
- Ab 1150 px: Suchtreffer links, eigene Tastatur rechts.
- Ab 1500×880: Media-Split zeigt Bibliothek und Player gleichzeitig übereinander; auf Mobil/Panorama Umschalter.
- Spotify: unter 1200 px Breite oder 600 px Höhe einspaltig mit Tab-Umschalter (Jetzt/Durchsuchen/Suche); ab 1200×600 Now Playing und Bibliothek nebeneinander. Unter 480 px Höhe kompakte 34–38-px-Bedienelemente, Safe-Area unten bleibt frei.
- Tacho: `ResizeObserver` misst `.tacho-app`; `is-tight` unter 460 px Breite oder 430 px Höhe. Hoher Split über Verhältnis 1,25 erhält `is-tall`; Instrumente werden gestapelt. Vollbild verwendet Größencontainer und Container-Einheiten, Infozeile teils `vh`.

Risiken: wiederholte historische Override-Blöcke in Basis, Themes und Media; globale Launcherregeln in `lightshow.css`; hardcodierte Farben neben Modulvariablen. Noch keine umfassende zentrale Design-Token-Schicht. Vor Konsolidierung Screenshots und Verhalten sichern, nicht pauschal Styles ersetzen.

## 7. Build, PWA und Release

`pages.yml` läuft bei jedem Push auf `main` und manuell. Er führt sechs Tests aus, ersetzt Buildplatzhalter, bettet alle verlinkten CSS-Dateien und die acht externen JS-Dateien in `dist/index.html` ein, schreibt `build-info.json`, kopiert Assets und erzeugt mit Pillow Icons (192/512). Danach Pages-Artefakt und Deployment. Es gibt kein `setup-node`/festes Node-Pinning; die Runnerinstallation wird verwendet. Pillow wird ohne feste Version installiert.

Produktversion aus `VERSION`, Buildnummer aus `github.run_number`, Commit aus `github.sha`. Cache-Name aktuell `mevicar-next-shell-v23`; das ist eine separate technische Versionsreihe. Inlining hält Code und Styles der ausgelieferten HTML zusammen, nicht eine identische Versionsnummer zwischen Cache und Produkt.

Service Worker: Shell-Precache bei Installation, `skipWaiting`, `clients.claim`; Navigation network-first mit Cache-Fallback, `build-info.json` ohne Cache, `themes.css` network-first, übrige Same-Origin-GETs cache-first. Aktivierung löscht alle anderen Cache-Namen des Origins, nicht nur MeviCar-Präfixe; bei anderen Apps auf demselben Origin ein abzugrenzendes Risiko.

`checkForUpdate()` vergleicht Buildnummer und lädt bei Änderung mit Queryparameter neu. `initBuild()` ersetzt die sichtbare Buildanzeige durch die Servermetadaten, ohne die geladene Codeversion zu ändern; die Anzeige allein ist daher kein Beweis, welcher Code gerade läuft.

Manifest ist auf `/mevicar-cockpit-demo/` festgelegt, standalone und landscape. Deployment unter anderem Pfad braucht bewusste Anpassung.

`release.yml` läuft bei `VERSION`-Änderungen auf main oder manuell. Er validiert die Version, verlangt passende Release Notes und erstellt einen fehlenden Tag/Release über `gh release create`. Keine Abhängigkeit vom Erfolg des Pages-Jobs. Deshalb für Qualitätskorrekturen VERSION unverändert lassen und Releaseworkflow nicht ohne Auftrag auslösen.

## 8. Tests und visuelle Nachweise

Alle sechs vorhandenen Tests wurden während der Architekturprüfung erfolgreich ausgeführt; nach Dokumentationsänderungen erneut ausführen:

```text
node tests/mevimedia-smoke.mjs
node tests/lightshow-smoke.mjs
node tests/ui-quality-smoke.mjs
node tests/display-profiles-smoke.mjs
node tests/speedometer-smoke.mjs
node tests/spotify-smoke.mjs
```

- Media: Mockplayer/-DOM; Import, Gruppen, Favoriten, Video, Queue und Quellenwechsel. Importiert zusätzlich radio-smoke.mjs: Streamzustände, Suche, eigene HTTPS-Streams samt Grenzen/Entfernen, Retry-Backoff 4/10/25 s, Offline-/Online-Wiederanlauf, Timeout, veraltete Events, Persistenz, Media-Session und exklusive Audiowiedergabe.
- Lichtshow: Mockrenderer/-DOM; Steuerung, Timer, Visibility, Unmount. Testet nicht die Darstellung aller echten Effekte.
- UI: VM mit Mock-DOM; Navigation/Appwege, Suchtexte, Demo-Kennzeichnung und SVG-Markup. Konsolenmeldung ist breiter als tatsächliche Browserabdeckung.
- Displayprofile: statische CSS-/Dokument-/Workflow-Assertions. Keine echten Viewports oder Touchmessungen.
- Tacho: reine Berechnungen, Mock-Geolocation/Kompass/RAF/ResizeObserver, Live-/Demo-Modell, Remount, statische Layout-/Bundle-Regeln.
- Spotify: Quelltext-/CSS-/Workflow-Assertions, VM mit Mock-DOM/-Storage: PKCE ohne Secret, Endpunkt- und Migrationsschutz, Linkvalidierung, Setup-/Verbunden-Zustand, Mount/Unmount, Premium-Fehler. Kein echter OAuth- oder Wiedergabetest.

Kein versioniertes Browser-Testskript, keine Screenshot-Artefakte, kein eigener Screensaver-Integrationstest und kein durchgängiger Start-/PWA-Test. Frühere Dokumente berichten Chromium-Prüfungen (30 Tacho-Kombinationen); deren externe Ergebnisse wurden in dieser Übernahme nicht neu reproduziert. Es entstanden keine neuen Screenshots, da keine UI-Änderung vorgenommen wurde. Reale Sensor-, Safari-, Codec-, USB-, Touch- und Safe-Area-Prüfungen bleiben offen.

Für kommende UI-Aufträge: gebaute lokale Ausgabe bereitstellen; fünf Viewports × drei Themes, relevante Vollbild-/Split-Zustände und leere/gefüllte Daten prüfen. Browserfehler, globale/Host-Scrollgrößen, Bounding-Rects und Touchgrößen aufnehmen. Screenshots mit Commit/Browser/Viewport/Theme/Zustand benennen und tatsächlich ansehen; Geometrie allein beweist keine Lesbarkeit. Beide Querformatrichtungen auf echten Geräten testen.

## 9. Priorisierte Qualitätsprobleme

Die folgenden Punkte sind offen, keine in dieser Übernahme vorgenommenen Korrekturen. „Codebefund“ bedeutet direkt im Quellcode nachvollziehbar, aber noch kein Gerätetest.

| Priorität | Befund und Evidenz | Nächste begrenzte Iteration |
| --- | --- | --- |
| P0 | Codebefund: Saver prüft unaktualisiertes `gpsData.active`; Tacho-GPS verhindert Idle-Overlay nicht (`screensaver.js: canStart`, `index.html: gpsData`) | Sensorstatus anbinden, Regression mit aktivem GPS und inaktiver Route |
| P1 | Codebefund: GPS-Fehlerstatus wird sofort durch `paint()` überschrieben; Messwert wird im Fehlercallback nicht gelöscht (`speedometer.js: startGps/paint`) | Fehlerzustand und stale/unknown-Verhalten testen und korrigieren |
| P1 | Codebefund: unbekannte GPS-Speed wird 0; Trip-Referenz überlebt Trackingpausen; OBD-Werte haben keine TTL/Null-Rücksetzung/Priorität | Datenregeln explizit festlegen und gezielt testen; keine neue Hardwareintegration |
| P1 | Codebefund: Kompassinterpolation nutzt kürzesten Winkel, `settle()` aber rohe Differenz; z. B. 359→1 kann den RAF-Loop dauerhaft laufen lassen | Zirkuläre Konvergenzprüfung und Regression über Norddurchgang |
| P1 | Codebefund: iOS-Kompass wird nach Remount mit requestPermission-API nicht automatisch wieder gebunden | Erteilte Berechtigung/Lifecycle gezielt testen |
| P1 | Codebefund: Such-Taste „123“ fügt nur „1“ ein; `scrollResults()` entfernt Tastatur und Searchmode beim Scrollen | Erwartetes Suchverhalten und Dock-Rückkehr prüfen, kleine Bedienkorrektur |
| P1 | Codebefund: `placeButton` setzt encodeURIComponent-Ergebnis in ein einfach gequotetes Inline-JS-Argument; Apostroph bleibt unkodiert | Zielnamen mit Apostroph als Regression testen, Argumentescaping konsistent machen |
| P1 | Mehrere Dienstplatzhalter außerhalb von Audio noch nicht ausdrücklich Demo. Radio und Spotify sind echte Integrationen; Spotify hängt an Premium, Client ID und aktivem Gerät | Verbleibende Dienstplatzhalter kennzeichnen, ohne neue Dienste anzubinden |
| P1 | Prüflücke: Spotify-OAuth, Token-Refresh, Premium-Gerätesteuerung und iPhone-PWA-Safari-Wechsel sind nur statisch/mit Mocks geprüft | Mit realem Client ID auf iPhone 17 und S20 FE/DeX durchspielen, Fehlerfälle dokumentieren |
| P1 | Codebefund: Lichtshow reduziert Canvasbewegung bei reduced motion nicht; kompakte Buttons 32 px, Intervallknöpfe 29 px hoch | Bewegungsvorgabe und Touchflächen profilübergreifend prüfen |
| P1 | Prüflücke: keine reproduzierbaren Browser-/Start-/PWA-Tests im Repository | Kleinen Browserprüfweg ergänzen, vorhandene 30 Layoutbehauptungen erneut belegen |
| P2 | Codebefund: Buildanzeige kann Serverversion statt geladenem Code zeigen; SW entfernt fremde Cache-Namen | Versionsdarstellung und Cache-Eigentümerschaft isoliert absichern |
| P2 | Codebefund: wiederholte CSS-/SVG-Overrides, alte GPS-Styles/-Wrapper, monolithische Appverzweigung | Schrittweise bereinigen mit visueller Regression, kein Frameworkwechsel |
| P2 | Prüflücke: Medien-Rerender, Fokus/Scrollposition, echte MP3/MP4, lange Listen, Safe Areas und Gerätebedienung | Reale Nutzungspfade auf Zielgeräten prüfen |

## 10. Dokumentation und Zusammenarbeit

`AGENTS.md` ist der kurze Einstieg; diese Datei enthält den aktuellen Gesamtzusammenhang. `TACHO_ARCHITECTURE.md` bleibt die detaillierte Tacho-Referenz, `DISPLAY_PROFILE_MATRIX.md` die Abnahmematrix. `UX_QUALITAETSPRUEFUNG.md` enthält historische Qualitätsrunden mit offenen Checklisten. `QA_RADIO_2026-11-06.md` und `QA_SPOTIFY_2026-11-07.md` dokumentieren die jeweiligen Modulprüfungen. Release Notes beschreiben jeweilige Meilensteine, nicht automatisch den aktuellen Iststand.

Vor jeder Änderung Status/Fetch prüfen, fremde Arbeit erhalten, gezielte Dateien stagen, Tests und Diff prüfen. Vor Push erneut fetchen. Bei parallelen Änderungen kein Force-Push; Integration/Feature-Branch mit passenden Wiederholungsprüfungen. Nach Push Run für die konkrete SHA prüfen und Live-Metadaten abgleichen. Produktversion unverändert, solange kein Release beauftragt ist.

Abschlussbericht unterscheidet Codeanalyse, automatisierte Mock-/Statiktests, Browserprüfung und reale Gerätetests. Ein bestandener Build ist keine visuelle Freigabe. Nach dieser Projektübernahme auf den nächsten konkreten Entwicklungsauftrag warten.

## Navi-Qualitätskorrektur – 8. November 2026

Zielauswahl übernimmt einen Treffer direkt bei geöffneter Tastatur. Enter und Suchen wählen denselben ersten passenden Treffer. Suchfeld und Treffer bleiben in einem stabilen oberen Panel; die QWERTZ-Tastatur liegt unten. Beim Ausblenden nutzt die Trefferliste auch den frei werdenden Bereich, ohne Suchfeld oder Listenanfang zu verschieben. Die Tastatur ist kompakter und näher am unteren sicheren Rand; das globale Statusoverlay bleibt während der Suche verborgen. Das Dock ist im gesamten Suchmodus auf allen Profilen ausgeblendet. Favoriten bleiben horizontal scrollbar, ohne sichtbare Scrollleiste. Einstieg: „Ort oder Adresse“. Die Zielvorschau zeigt vorhandene Adressdaten oder einen expliziten Hinweis auf fehlende vollständige Adressen; keine erfundenen Hausnummern.

Validierung: sechs Node-Smoke-Tests bestanden, inklusive Regression für Ein-Tipp-Zielauswahl und Adress-Fallback. Lokaler Browserzugriff aus dem separaten Sandbox-Browser scheitert mit ERR_CONNECTION_REFUSED; vollständige 15-Kombinationen-Sichtprüfung und echte Safe-Area-/Touch-Abnahme bleiben offen.

### Suchansicht: Platznutzung – 8. November 2026

Tastatur auf Mobilprofilen von 212 auf 198 CSS-Pixel reduziert, unterer Abstand verkleinert; Tasten bleiben mindestens 44 CSS-Pixel hoch. Beim Scrollen wird das Eingabefeld defokussiert und die Liste nach unten erweitert, ohne DOM-Neuaufbau. Statusoverlay im Suchmodus ausgeblendet, nach Verlassen wieder sichtbar. Alle sieben vorhandenen Smoke-Tests bestanden; Pages-Ausgabe lokal erzeugt. Browser-Sichtprüfung blockiert: kein installiertes Chromium, Browserdownload fehlgeschlagen. Echte iOS-Safe-Area- und Touchprüfung weiterhin offen.

### Tastatur bis zum unteren Rand

Der Tastaturhintergrund endet am unteren Kartenrand. Statt eines externen Safe-Area-Abstands erhält die letzte Tastenreihe einen internen Zusatzabstand von höchstens 8 CSS-Pixeln. Die Tastaturhöhe wächst um diesen Abstand, sodass die Tasten mindestens 44 CSS-Pixel hoch bleiben. Die Trefferliste erhält den eingesparten Platz. Seitliche Notch-Abstände bleiben erhalten. Sieben Smoke-Tests bestanden; echte iOS-Gesten-/Touchprüfung und Browser-Sichtprüfung bleiben offen.

## Tetris-App – 9. November 2026

Neue Zusatz-App im Launcher: Tetris startet wie andere Apps im Vollbild, erneuter Dock-Tipp wechselt in den Split. Eigene Module `tetris.js` und `tetris.css`, ohne Abhängigkeiten. Sieben Steinformen im gemischten Siebenerbeutel, Kollisionen, Drehung mit seitlichen Ausweichversuchen, Fallvorschau, Sofortfall, Reihenabbau, Punkte und steigendes Tempo. Touch-Tasten und physische Pfeiltasten/Leertaste/P. Pause, Neustart und automatisch pausierter Zustand bei Appwechsel oder verborgenem Tab. Spielstand bleibt während der Sitzung erhalten; nur der Rekord wird lokal dauerhaft gespeichert. Kein Spiel-Audio.

Integration: Registry, SVG-Symbol, Dock-Akzent, Mount/Unmount, versioniertes Inline-Bundling im Pages-Workflow und Offline-Cache. Launcher erhält fünf gleich hohe Reihen, damit die zusätzliche Kachel in die bestehende Vier-Spalten-Anordnung passt.

Validierung: acht Node-Smoke-Tests einschließlich Tetris-Regeln und Lifecycle; lokale Pages-Ausgabe erfolgreich erzeugt. Chromium-Download erneut mit ungültigem ZIP gescheitert; keine Browser-Sichtfreigabe. Touch-/Safe-Area-Prüfung auf echten Geräten offen.

## TV-App – 9. November 2026

TV im Launcher: acht deutsche/türkische Sender, Länderfilter, Suche, gespeicherte Favoriten, eigener HTTPS-Stream und lokaler M3U-Dateiimport mit Löschfunktion. Native HLS oder lokal ausgeliefertes, im Build hashgeprüftes hls.js. Video stoppt beim App-/Layoutwechsel; lokale Audioquellen gegenseitig exklusiv. Alle neun Smoke-Tests bestanden; Master-Playlists erreichbar. Reale Wiedergabe und visuelle Abnahme offen. Details und Quellen in docs/QA_TV.md.

## MeviTV: Drei Spalten und Browser-Abnahme – 10. November 2026

Übernahme auf `main`: `134e837`, Pages-Build 428 erfolgreich. Die vier vorherigen Pages-Läufe waren fehlgeschlagen; der letzte Commit reparierte den Download des gepinnten mpegts.js-Bundles. Die frühere Beschreibung „Apps starten im Split“ ist historisch: aktuell startet TV im Vollbild, ein weiterer Dock-Tipp wechselt in den Split.

Die vorhandene MeviCar-Symbolleiste bleibt unverändert. Der TV-Vollbildhost enthält dauerhaft Kanalliste und Player nebeneinander, auch im kompakten Querformat. Im IPTV-Modus: Live/Filme/Serien/TV, danach Suche, Kategorien und eine unabhängig scrollende Liste. Player rechts: Titel und IPTV-Einstellungen, darunter Start/Stopp/Vollbild, darunter Video und Status. Öffentliche Quellenaktionen erscheinen nur in der öffentlichen TV-Ansicht. TV-Bedienelemente haben mindestens 44 px Touchflächen; Senderzeilen mindestens 48 px. Der TV-Host berücksichtigt rechte und untere Safe Areas, ohne die globalen Dock- oder Kartenregeln zu ändern.

Änderungen in `tv.js` betreffen ausschließlich die HTML-Vorlage; mpegts.js-Routing, Fallbacks, Player-Lifecycle und Xtream-Adapter bleiben unverändert. Die bisherigen kompakten IPTV-CSS-Overrides sind durch einen gemeinsamen Vollbild-/Split-Aufbau ersetzt.

`tests/tv-visual-layout.mjs` liest alle fünf Referenzviewports aus `DISPLAY_PROFILE_MATRIX.md` und testet die tatsächlich gebaute Pages-Ausgabe in Chromium und drei Themes. Isolierte Testantworten bilden einen Katalog mit 120 Sendern ab. Ein mit FFmpeg erzeugtes Testvideo wird durch das echte gepinnte mpegts.js decodiert. Es werden keine echten Zugangsdaten und keine Providerverbindung verwendet. Prüfungen: Dock-Geometrie, drei Spalten, Touchflächen, Scrollen, Suche/Kategorien, Leerzustand, Split-Wechsel, JavaScript-Fehler und simulierte asymmetrische iPhone-Safe-Areas. Screenshots und JSON mit Build-SHA werden als Actions-Artefakt `mevitv-browser-qa` gespeichert. Ein fehlgeschlagener Browsertest verhindert das Pages-Deployment.

Die Browserprüfung ersetzt keine reale iPhone-/Safari-/DeX-/Touch-Abnahme und keine Liveprüfung des eigenen IPTV-Anbieters. Maßgeblich für den aktuellen Lauf sind Actions-Status und Artefakt, anschließend Live-`build-info.json`.

## MeviTV: Tabs rechts und IPTV-EPG – 10. November 2026

Live/Filme/Serien/TV stehen jetzt im Kopf der dritten Spalte neben den IPTV-Einstellungen. Die zweite Spalte enthält ausschließlich Suche, Kategorie und Katalog. Der Sendername steht unter dem Bild zusammen mit „Jetzt / Danach“ und dem EPG-Button. Der EPG-Dialog zeigt die vom Anbieter gelieferte Kurzvorschau mit lokalen Uhrzeiten und aufklappbaren Beschreibungen.

`meviXtream.epg(account, streamId, {signal, force})` verwendet `get_short_epg`, das im bestehenden Proxy bereits freigegeben ist. Kein NAS-Update und keine neue Quelle erforderlich. EPG ist ausschließlich für Xtream-Live-TV verfügbar, nicht für Filme, Serien oder öffentliche HLS-Sender. Umfang und Verfügbarkeit hängen vom Anbieter ab; dies ist kein vollständiger XMLTV-/Wochenführer. EPG-Texte werden als UTF-8/Base64 oder Klartext normalisiert und vor HTML-Ausgabe escaped. Zeiten benötigen Unix-Zeitstempel oder explizite Zeitzonenangaben; mehrdeutige lokale Providerzeiten werden nicht geraten.

Der Cache ist kontoabhängig, auf 30 Sender und zwei Minuten begrenzt. Der ausgewählte Sender wird minütlich aktualisiert; manuelles Aktualisieren umgeht den Cache. Abbruch/Generationsprüfung verhindern veraltete EPG-Antworten nach Sender- oder Appwechsel. Timeout, Leerzustand und Fehler betreffen ausschließlich die EPG-Anzeige; die mpegts.js-/HLS-Wiedergabe bleibt unabhängig. Beim Stopp bleibt der Programmführer zum ausgewählten Sender sichtbar, beim Appwechsel werden Abruf und Timer beendet.

17 Node-Smoke-Tests lokal bestanden. Der Pages-Browsertest enthält zusätzlich Programmtext/UTF-8/Escaping, Leerzustand, HTTP-Fehler, Wiederholung, schnelle Senderwechsel sowie Screenshots des EPG-Dialogs in allen Profilen/Themes. Das Actions-Artefakt dokumentiert die konkrete Browserprüfung.

### Rückmeldung vom realen iPhone: leeres EPG bei RTL

Nutzer meldet funktionierendes EPG beim selben Anbieter in einem anderen Player; MeviTV Build 431 zeigte „Keine Programmdaten vom Anbieter verfügbar“. Die Meldung unterschied nicht zwischen leerer Antwort und verworfenen Zeitformaten. Die reale Providerantwort liegt dieser Sitzung nicht vor; die Ursache ist deshalb noch nicht abschließend verifiziert.

Kompatibilitätskorrektur: numerische `start`/`end`-Felder und objektförmige Listen ebenfalls lesen. Datumsstrings ohne Zeitzone als ausdrücklich gekennzeichnete Anbieterzeiten anzeigen, statt ganze Sendungen zu verwerfen; kein geratenes Now/Next. Bei leerer/veralteter oder fehlgeschlagener Kurzabfrage Rückfall auf `get_simple_data_table`. Diagnose unterscheidet HTTP-Fehler, unbekanntes Antwortformat, empfangene/unlesbare Einträge und fehlende aktuelle Daten. Die neue vollständige Abfrage benötigt aktualisiertes `bridge/server.cjs` im Synology-Container; Pages aktualisiert diesen Container nicht. Anleitung in `bridge/README.md`. Keine Behauptung einer erfolgten NAS-Aktualisierung oder realen EPG-Freigabe.


## MKV-Seek-Untersuchung vom 11. November 2026

MeviTV-MKV-VOD nutzt Movi/FFmpeg-WASM im Browser. Ein reproduzierbarer Fehler im Übergang von nativer Seek-Suche zu HTTP-Pufferung wird über patches/movi-seek.patch im experimentellen Player korrigiert. Acht Transport-Regressionen und TypeScript sind geprüft; mangels betroffenem Testfilm sind reale Seek-Latenz und A/V-Abnahme noch offen. Stable und Synology-Bridge bleiben unverändert. Details und reproduzierbarer Build: [QA_MKV_SEEK.md](QA_MKV_SEEK.md).
