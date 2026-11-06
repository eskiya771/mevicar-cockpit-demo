# MeviCar Next – unterstützte Displayprofile

Stand: 6. November 2026 · Produktversion 0.5.0 · Premium-Tacho und bestehende GUI-Profile.

Die folgenden **fünf Zielprofile** sind jetzt eine verbindliche Abnahmematrix für den bestehenden Cockpit-Funktionsumfang. Alle gelten im **Querformat** und werden über responsive CSS-Bereiche abgedeckt, nicht über starre User-Agent-Abfragen. Dadurch funktionieren sie auch bei Browserleisten, Zoom, DeX-Fensterrahmen und Safe-Area-Inset-Abweichungen.

| Profil | Test-Viewport (CSS-Pixel) | Verhalten |
| --- | ---: | --- |
| iPhone 17, Querformat | **874 × 402** | Großes Dock außerhalb der Suche; während der Adresseingabe breite QWERTZ-Tastatur und sichtbare Trefferliste nebeneinander, kompakte Medien-Tabs Bibliothek/Player |
| Samsung Galaxy S20 FE, Querformat | **915 × 412** | Wie iPhone, Touchflächen mindestens etwa 44 px und kompaktes Split-Screen |
| Samsung DeX / externes Display | **1920 × 1200** | Große Kartenansicht, rechts Medienbibliothek und Player **gleichzeitig**, separate große Tastatur |
| Full HD | **1920 × 1080** | Große Kartenansicht, rechts Medienbibliothek und Player **gleichzeitig**, große Bedienelemente |
| Panorama / Infotainment | **1920 × 720** | Flaches Layout, Navigation zentral, kompakte Medien-Tabs, Adresssuche und Touch-Tastatur nebeneinander |

**Hinweis zu Geräte-Pixeln:** iPhone-17- und S20-FE-Panels besitzen deutlich mehr physische Pixel als der CSS-Viewport, den Web-Apps bei standardmäßiger Skalierung sehen. Die Werte 874 × 402 und 915 × 412 sind Referenzgrößen im Chromium-Test; Safari/WebView/Android-Displayzoom können leicht abweichen. DeX 1920 × 1200 ist die gewünschte **externe Monitorauflösung**, der reale Browser-Viewport kann aufgrund von Taskleiste/Fensterleisten kleiner ausfallen.

## Verbindliche Prüfungen

- Navigation bleibt im Split-Screen sichtbar, sofern eine reguläre Zusatz-App geöffnet ist.
- Alle Navigations- und Medienbuttons sind ohne Überlappung sichtbar, insbesondere unterhalb von 430 CSS-Pixel Höhe.
- Adresseingabe: Suchfeld, Treffer und QWERTZ-Tastatur gleichzeitig sichtbar; Treffer scrollbar, keine horizontale Seiten-Scrollleiste.
- iPhone/S20 FE: Während der geöffneten Such-Tastatur wird das Dock ausgeblendet; das vergrößert die Breite der Buchstabentasten (statt nur die Tastenhöhe). Nach Schließen der Tastatur erscheint das Dock wieder. Ergebnisse bleiben links sichtbar, Schaltflächen berücksichtigen die iOS-/Android-Safe-Area. Die mobile QWERTZ-Tastatur nutzt 72 % der Kartenbreite und 51–58 CSS-Pixel Tastenhöhe.
- Für 1920×1080 und 1920×1200 gleichzeitig Bibliothek und Player sichtbar; auf den Mobilformaten und 1920×720 wird eine einfache Bibliothek/Player-Umschaltung gezeigt.
- Medien-Transporttasten bei aktiver Player-Ansicht nicht abgeschnitten und für Fingerbedienung groß genug.
- Farbdesigns **Original**, **Cyberpunk Neon City** und **Liquid Glass** werden in allen fünf Profilen begutachtet (15 Theme/Viewport-Kombinationen).
- Bestehende Medienwiedergabe, Lichtshow, PWA-Update und Touch-Eingaben bleiben erhalten.
- Premium-Tacho 0.5.0: in jedem Profil Vollbild und Split-Screen, beide analogen Instrumente, Trip/Gesamt-km, Kompass und die Themen Original, Neon City und Liquid Glass. Der Split-Tacho bleibt in der rechten Fläche, die Karte links. Keine Tacho-Scrollleiste.
- Premium-Tacho Vollbild auf DeX, Full HD und Panorama: beide Instrumente füllen die verfügbare Höhe (Chromium-Messung: 955/731 px, 841/731 px, 540/540 px), Skalenziffern ohne Überlappung, Instrumente nicht abgeschnitten. Gesamt-km, Trip und Kompass skalieren im Vollbild und in großen Split-Flächen mit der Höhe (Full HD: 45 px Werte, 103 px Kompassrose mit N/O/S/W). Im DeX- und Full-HD-Split stehen Tacho und Drehzahl untereinander (469/346 px bzw. 405/299 px). Messwerte und Prüfkriterien siehe `TACHO_ARCHITECTURE.md`, Abschnitt 5.

## Quellen und Umsetzung

- `display-profiles.css`: einheitliche Responsive-Regeln
- `index.html`: Stylesheet-Einbindung
- `.github/workflows/pages.yml`: Inline-Bundling für atomare PWA-Aktualisierung
- `sw.js`: neuer Service-Worker-Cache und Offline-Precache
- `tests/display-profiles-smoke.mjs`: CI-Prüfung der fünf Profile und Verknüpfung
- Screenshots in der ChatGPT-Sandbox: 5 Geräteprofile mit Navigation, Adresssuche und Medien in allen drei Designs
- Tacho-Screenshots lokal mit Playwright/Chromium headless: 5 Profile × Vollbild/Split × 3 Designs (30 Aufnahmen, nicht im Repository)

**Noch offen:** Reale Touch-/Safe-Area-Tests auf iPhone 17, S20 FE und im tatsächlichen DeX-Fenstermodus. Browser-Screenshots prüfen das Layout, ersetzen keinen Gerätetest.