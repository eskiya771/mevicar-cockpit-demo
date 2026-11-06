# MeviCar Next – Premium-Tacho 2.0

Stand: 6. November 2026 · Produktversion 0.5.0

## 1. Bisheriger Aufbau

Die Tacho-App ist das Dock-Element `speed`. `openApp('speed')` startet im Split-Screen neben der Karte; ein zweiter Tipp schaltet auf Vollbild. `render()` baut `#screen` bei jedem App-Wechsel komplett neu. Split bleibt `mapHTML()` plus `<aside class="side">`. Vollbild anderer Apps bekam zusätzlich eine Überschrift.

Die alte Darstellung stand inline in `index.html`: `gpsDashboard()` zeichnete einen SVG-Tacho 0–220 km/h und einen Kompass. `gpsSpeedOnly()` wurde nicht mehr eingebunden. `gpsStart()`, `gpsStop()`, `compassStart()` und `gpsRefresh()` schrieben bei jedem Fix direkt in feste DOM-IDs. Es gab keinen Drehzahlmesser, keinen Trip-Filter, keinen Demo-Modus und keine OBD-Schnittstelle. `s.tripKm` gehört zur separaten Fahrtenbuch-Demo und wird vom Tacho nicht als Fahrzeugkilometerstand verwendet.

Lichtshow und MeviMedia zeigen das passende Muster: eigenes Modul, `*HTML(compact)`, Mount nach `innerHTML`, Unmount davor, Styles und Skripte werden von GitHub Pages in dieselbe HTML-Datei eingebettet. Der Service Worker `mevicar-next-shell-v18` cachte die Hülle; ein Versionswechsel muss den Cache-Namen erhöhen, damit HTML, CSS und JS nicht gemischt laden.

## 2. Schwachstellen

- Jeder GPS-Tick hätte bei einem erneuten `render()` die Nadel zurückgesetzt. Die Nadel sprang, statt zu interpolieren.
- Sensoren liefen nicht an den Sichtbarkeitszyklus der App gebunden.
- Fehlende Drehzahl und fehlender Gesamtkilometerstand waren nicht als fehlende OBD-Daten erkennbar.
- GPS-Ausreißer konnten nicht als Trip gefiltert werden.
- Vollbild und Split waren dieselbe zweispaltige Anordnung.
- Die Seitenleiste darf scrollen (`.side { overflow:auto }`). Ein Instrument darf das nicht tun.

## 3. Komponenten

Alles bleibt Vanilla-JS, ohne Build und ohne Framework.

| Baustein | Ort |
| --- | --- |
| `SpeedGauge`, `RpmGauge` | SVG in `speedometer.js` (`gaugeSvg`) |
| `OdometerDisplay`, `CompassDisplay` | Fußleiste in `meviSpeedHTML` |
| `SpeedometerDashboard` | `meviSpeedHTML(compact)` plus Klasse `is-tight` per `ResizeObserver` |
| `VehicleDataAdapter` | Live-Modell, Demo-Modell, `meviSpeedIngest()` |
| Darstellung | `speedometer.css` |
| Einbindung | `index.html`: Host `tacho-host`, Mount/Unmount wie die Lichtshow |

Getrennte Dateien pro Komponente würden den Pages-Bundler und den Service Worker ohne Gewinn vervielfachen. Die bestehenden Module sind jeweils ein IIFE.

## 4. Datenmodell

```js
{
  speedKmh: null,
  rpm: null,
  odometerKm: null,
  tripKm: 0,
  headingDeg: null,
  gpsAccuracyM: null,
  altitudeM: null,
  source: { speed, rpm, odometer, trip, heading },
  mode: "live" | "demo"
}
```

Quellen sind `gps`, `sensor`, `obd`, `demo` oder `unavailable`. Gesamt-km bleibt `null`, bis `meviSpeedIngest({ odometerKm })` einen Fahrzeugwert liefert. Der Demo-Modus schreibt nur sein eigenes Modell und nie den gespeicherten GPS-Trip.

OBD später, ohne die Anzeige zu tauschen:

```js
meviSpeedIngest({
  rpm: 2450,
  odometerKm: 184320.4,
  speedKmh: 82,
  sourceSpeed: "obd"
});
```

`speedKmh` wird nur übernommen, wenn `sourceSpeed` gesetzt ist. Während `DEMO` aktiv ist, landen OBD- und GPS-Werte im Live-Modell und erscheinen erst nach Ende der Demo.

## 5. Layout

- **Vollbild:** zwei analoge Instrumente nebeneinander, Geschwindigkeit größer als Drehzahl, Digitalwert im Tacho, Infozeile mit Gesamt-km, Trip, Kompass und Aktionen. Keine zusätzliche App-Überschrift.
- **Split:** andere Anordnung, nicht nur verkleinert. Große Digitalgeschwindigkeit über der Fläche, darunter beide Nadeln, darunter die Infozeile. Die Karte bleibt links.
- **Enge Fläche:** `ResizeObserver` setzt `is-tight`, wenn der Host schmaler als 460 px oder flacher als 430 px ist. Das gilt auch im Vollbild, zum Beispiel bei 1920×720.

Profile: iPhone 17 874×402, Galaxy S20 FE 915×412, DeX 1920×1200, Full HD 1920×1080, Panorama 1920×720. Safe Area bleibt am Shell-Rand.

## 6. Risiken

- `render()` zerstört den DOM. Mount muss Watch, Kompass, Observer und `requestAnimationFrame` neu binden, Unmount muss sie vorher lösen.
- Pages-Inlining und Cache-Name müssen dieselbe Version tragen. Nur die neue CSS-Datei zu cachen, während HTML alt ist, oder umgekehrt, zerlegt den Tacho.
- `.side` scrollt standardmäßig. Nur `.side.tacho-host` darf das für diese App abschalten.
- Ein Gesamtkilometerstand aus GPS wäre sachlich falsch und wird nicht angezeigt.

## 7. Geplante Dateien

- neu: `speedometer.js`, `speedometer.css`, `tests/speedometer-smoke.mjs`, `RELEASE_NOTES_v0.5.0.md`
- angepasst: `index.html`, `sw.js`, `.github/workflows/pages.yml`, `VERSION`, `DISPLAY_PROFILE_MATRIX.md`, `README.md`
