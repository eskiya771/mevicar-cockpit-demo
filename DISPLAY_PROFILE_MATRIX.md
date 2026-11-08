# MeviCar Next – unterstützte Displayprofile

Stand: 6. November 2026 · Produktversion 0.5.0 · Premium-Tacho und bestehende GUI-Profile.

Die folgenden **fünf Zielprofile** sind jetzt eine verbindliche Abnahmematrix für den bestehenden Cockpit-Funktionsumfang. Alle gelten im **Querformat** und werden über responsive CSS-Bereiche abgedeckt, nicht über starre User-Agent-Abfragen. Dadurch funktionieren sie auch bei Browserleisten, Zoom, DeX-Fensterrahmen und Safe-Area-Inset-Abweichungen.

| Verbindliches Profil | Physische Displayauflösung (Querformat) | CSS-Referenzviewport für Layouttests | Hinweise |
| --- | ---: | ---: | --- |
| **iPhone 17** | **2622 × 1206** | **874 × 402** | 3×-Skalierung; Dynamic Island, Safe Areas und beide Querformatausrichtungen berücksichtigen; große Zieleingabe-Tastatur |
| **Samsung Galaxy S20 FE** | **2400 × 1080** | **915 × 412** | Physische FHD+-Auflösung; CSS-Viewport ist ein Referenztest und variiert nach Anzeigeskalierung, Browser und Systemleisten |
| **Full HD** | **1920 × 1080** | **1920 × 1080** | Vollbildreferenz; geteilte Navigation und Medienplayer gleichzeitig |
| **Panorama-Infotainment** | **1920 × 720** | **1920 × 720** | Besonders flaches Querformat; Navigation im Fokus |
| **Samsung DeX – externer Monitor** | **1920 × 1200** | **1920 × 1200** | Externe Monitorauflösung und Vollbild-Referenz; im DeX-Fenster realen kleineren Viewport zusätzlich testen |

**Diese Tabelle ist die verbindliche Single Source of Truth für alle fünf unterstützten MeviCar-Next-Displays.** Andere Dokumente und Agentenanweisungen sollen hierauf verweisen, statt eigene abweichende Auflösungslisten zu pflegen.

**Physische Pixel sind keine CSS-Pixel:** Beim iPhone 17 (Device Pixel Ratio 3) entsprechen 2622 × 1206 physischen Pixeln ungefähr 874 × 402 CSS-Pixeln im Querformat. Auf dem S20 FE ist die CSS-Größe vom Gerät und Browser abhängig; 915 × 412 ist der festgelegte Chromium-Referenztest, nicht die garantierte tatsächliche Größe.

**DeX und Desktop:** 1920 × 1200, 1920 × 1080 und 1920 × 720 sind die Sollauflösungen bei bildschirmfüllender Anzeige. Fenstermodus, Browserleisten und Betriebssystemskalierung können den nutzbaren CSS-Viewport verändern.

**Herstellerquellen:** [iPhone 17 – Apple technische Daten](https://support.apple.com/de-de/125089) · [Galaxy S20 FE 5G – Samsung Datenblatt](https://image-us.samsung.com/SamsungUS/samsungbusiness/pdfs/Galaxy-S20-FE-5G-Datasheet-Unlocked.pdf).

## Verbindliche Prüfungen

- Navigation bleibt im Split-Screen sichtbar, sofern eine reguläre Zusatz-App geöffnet ist.
- Alle Navigations- und Medienbuttons sind ohne Überlappung sichtbar, insbesondere unterhalb von 430 CSS-Pixel Höhe.
- Adresseingabe: Suchfeld, Treffer und QWERTZ-Tastatur gleichzeitig sichtbar; Treffer scrollbar, keine horizontale Seiten-Scrollleiste.
- iPhone/S20 FE: Während der geöffneten Such-Tastatur wird das Dock ausgeblendet; das vergrößert die Breite der Buchstabentasten (statt nur die Tastenhöhe). Das Dock bleibt während des gesamten Suchmodus verborgen. Suchfeld und scrollbare Ergebnisse liegen oberhalb der unten verankerten Tastatur. Beim Ausblenden erweitert sich die Trefferliste nach unten; Suchfeld, Listenanfang und Scrollposition bleiben stabil. Das Statusoverlay bleibt während der Suche verborgen. Tasten sind mindestens 44 CSS-Pixel hoch; Schaltflächen berücksichtigen die iOS-/Android-Safe-Area.
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