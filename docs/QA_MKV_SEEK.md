# MKV-Seek: HTTP-Suchphase und Leseübergang

Stand: 11. November 2026. Upstream: `MrUjjwalG/movi-player`,
Commit `8bd0b50d7cdfcef635e015ea93e365876088969d`.

## Befund und begrenzter Fix

Die App verwendet Movi für MKV-VOD. Der native Seek läuft über
`Demuxer → SourceDataAdapter → WasmBindings`. Der Adapter stellt nur
`read/getSize` bereit; das optionale WASM-Signal `onProbeMode` erreicht
`HttpSource.setProbeMode` deshalb nicht.

Zusätzlich bleibt nach erfolgreichem Seek die positionsbasierte Suchheuristik
aktiv oder der ursprüngliche Hint wurde bereits durch einen Cachetreffer
verbraucht. Bei einem tatsächlichen Landepunkt mehr als 20 % der Dateigröße
von der linearen Schätzung entfernt sind beliebig viele einzelne Range-Reads
möglich, obwohl die native Suche schon vorbei ist. Ein Suchprobe nahe der
Schätzung kann umgekehrt einen unnötigen vollständigen Pufferneustart auslösen.

`patches/movi-seek.patch` begrenzt den Suchmodus auf die Lebensdauer der
nativen Demuxer-Seeks, auch bei Fehlern und überlappenden Aufrufen. Nach
erfolgreichem Abschluss setzt es einen positionsunabhängigen Lese-Hinweis:
Der nächste ungepufferte Zugriff bestimmt den tatsächlichen Landepunkt.
Gepufferte Rücksprünge bleiben lokal. Decoder, Keyframe-Auswahl, FFmpeg-ABI
und Synology-Bridge werden nicht geändert.

## Nachweise

- Regression arbeitet mit dem echten HttpSource und einer virtuellen
  HTTP-Range-Datei. Nur die native Seek-Operation ist kontrolliert ersetzt.
- Acht Tests: Suchphasen, Fehlerpfad, stark abweichende Positionsschätzung bei
  2/50 MiB Puffer, begrenzte verstreute Index-Probes, überlappende Seeks,
  Cachetreffer und Quellen ohne optionale HTTP-Hooks.
- Vorher/nachher: Im Positionsschätzungsfall verursacht der unveränderte Stand
  sechs einzelne 256-KiB-Anfragen für sechs Lesezugriffe; der Patch verwendet
  die zusammenhängende Pufferung. Derselbe Test scheitert ohne Patch.
- TypeScript-Prüfung bestanden.
- Lokaler Slim-IIFE-Build erfolgreich; dabei unveränderte WASM-Datei aus movi-player@0.4.1 verwendet (kein lokaler Docker-/FFmpeg-Neubau).
- MeviMedia, Lichtshow, UI-Quality, Displayprofile, Speedometer und MeviTV: alle sechs Smoke-Skripte bestanden. Keine UI-Änderung; keine neue visuelle Abnahme behauptet.

Das ist kein realer MKV-Durchlauftest und keine Messung der Zeit bis zum ersten
Bild. Es stand kein betroffener Testfilm zur Verfügung. Ob diese Lücke den
gesamten gemeldeten 60–80-Sekunden-Stall erklärt, ist noch offen.

## Build und Abnahme

Die schlanke PR-Prüfung `movi-seek-regression.yml` klont den festgelegten
Upstream, prüft die Patch-Anwendung, Typen und Regressionen. Der bestehende
experimentelle Build baut zusätzlich FFmpeg/WASM und den passenden JS-Player.
Er startet durch passende Änderungen auf main oder manuell. Sein Manifest
enthält Upstream-, MeviCar- und Patch-Hash.

Stable bleibt beim bisherigen npm-Paket. Nach erfolgreichem Build und
Pages-Deployment wird der korrigierte Versuch über `?moviExperimental=1`
ausgewählt. Eine bereits offene Seite vollständig neu laden. Vor Messung den
`patch_sha256` in `vendor/experimental/movi-experimental.sha256` mit dem
aktuellen Patch vergleichen; ein älteres erfolgreiches Artefakt ist kein
Nachweis für den Fix. Der Pages-Abruf berücksichtigt ausschließlich main.

Für den betroffenen Film mehrere kalte Fernsprünge, Rücksprünge, Sprünge aus
Pause und schnelle aufeinanderfolgende Sprünge vergleichen. Pro Sprung Ziel,
Zeit bis Demuxer-Rückkehr, erstes sichtbares Bild, Wiedergabe, Range-Anzahl,
übertragene Bytes und Überlappung festhalten. Ziel: wenige gezielte Anfragen
und Wiedergabe innerhalb weniger Sekunden. Bild, Ton und A/V-Synchronität
müssen stimmen. Erst diese Abnahme rechtfertigt die Übernahme in Stable.
