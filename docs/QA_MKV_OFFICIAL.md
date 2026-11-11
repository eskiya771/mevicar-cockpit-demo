# Offizieller MeviTV-MKV-Player

Der Nutzer hat für den korrigierten Player sofortiges Bild und synchronen
Ton bei Seek-Zeiten von 0,5 bis 1,3 Sekunden bestätigt und die Übernahme in
das offizielle MeviCar Next beauftragt.

## Standardauswahl

Die normale App-URL lädt jetzt `vendor/movi-mevitv-mkv-size-2/`.
Ein `moviExperimental`-Parameter ist nicht mehr erforderlich; bestehende
Links mit diesem Parameter verwenden ebenfalls den offiziellen Player.
Der Diagnosekopf kennzeichnet ihn als `MEVICAR NEXT`.

Die enthaltene JS-/WASM-Kombination stammt unverändert aus dem real
getesteten Quellcode-Build. `movi-build.json` hält Dateigrößen, SHA-256,
Upstream-Commit, Build-Commit, Build-Lauf und beide Patch-Prüfsummen fest.
Damit sind Suchphasen-, Dateigrößen- und native Matroska-Cues-Korrektur
zusammen übernommen. Die Apache-Lizenz des Upstream-Pakets liegt bei.

## Zuverlässige Auslieferung

Die rund 10,7 MB großen Builddateien sind versionsfest eingecheckt.
Pages prüft sie vor jeder Veröffentlichung. Die reguläre Auslieferung
hängt weder von `npm latest` noch von kurzlebigen Actions-Artefakten ab.
Die alten Asset-URLs erhalten dieselben Dateien als Kompatibilitätskopien
für bereits geöffnete Tabs.

Der Service-Worker-Cache wird auf `v32` aktualisiert und lädt die
versionsfesten offiziellen URLs. Ein zukünftiger experimenteller Build
löst keine automatische Änderung des offiziellen Players aus.
Der bestehende Quellcode-Build bleibt zum reproduzierbaren Neubau erhalten.

Für eine spätere Player-Aktualisierung: Quellcode-Build erzeugen, JS und
WASM gemeinsam prüfen, ein neues versionsfestes Verzeichnis samt Manifest
anlegen und Standardpfad/Service Worker/Prüfung gemeinsam aktualisieren.
Keine einzelne WASM- oder JS-Datei unabhängig austauschen.

## Prüfung und Betrieb

- Byteidentische SHA-256 gegenüber dem veröffentlichten, bestätigten Build.
- Gültiges WASM-Modul und enthaltener Marker `mevitv-mkv-size-2`.
- VM-Test prüft die wirkliche Scriptauswahl für normale und frühere Test-URLs.
- Gleiche Versionsbasis für JS und WASM, neuer PWA-Cache und deterministische
  Pages-Auslieferung sind geprüft.
- Die vorgeschriebenen fünf Projekt-Smokes sowie TV, Diagnose- und
  Bridge-Fehler-Prüfungen bestehen.
- Das Pages-Deployment führt die bestehenden Browserprüfungen für fünf
  Profile und drei Themes aus. Deren erfolgreicher Lauf ist eine technische
  Layoutprüfung; eine zusätzliche manuelle Sichtprüfung wird nicht behauptet.

Proxy **1.0.7 / Build 8** mit öffentlichen CDN-Weiterleitungen ist bereits
auf main enthalten und laut Nutzer auf der Synology installiert. Dafür ist
kein weiteres Proxy-Update nötig. Die Produktversion `VERSION` bleibt bei
dieser Qualitätskorrektur unverändert; die Pages-Buildnummer erhöht sich.

Nach der Veröffentlichung die normale MeviCar-Next-URL beziehungsweise die
installierte PWA neu laden. Der bekannte Größen-Fix bleibt im Diagnoseprotokoll
sichtbar. Die rund 12,6 Sekunden Startladezeit des ursprünglichen Testfilms
war nicht Gegenstand dieser Übernahme.

## Wartung und Aufräumen (11. November 2026)

**Ein neuer MoviPlayer-Build ist nicht bei jedem MeviCar-Release erforderlich.**
Die offizielle Auslieferung verwendet ausschließlich das eingecheckte,
versionsfeste und per SHA-256 geprüfte Paar aus JavaScript und WASM.
Der normale Pages-Workflow baut MoviPlayer daher bewusst nicht selbst.

Die Fehlerbehebung bestand aus zwei Ebenen:

- **JavaScript/TypeScript:** Die Korrekturen der HTTP-Dateigröße,
  Range-Anfragen und der Seek-/Probe-Übergabe erforderten ein neues
  Browser-Bundle, aber für sich genommen **keinen neuen WASM-Build**.
- **Nativer Matroska-Demuxer:** `patches/movi-cues-fastseek.patch` verändert
  den C-/FFmpeg-basierten Teil. Damit dieser Fix wirksam wird, war ein
  **neuer WASM-Build** nötig, gefolgt von der gemeinsamen Validierung des
  JS-/WASM-Paars.

**Dauerhaft behalten:** die beiden Patches, den gepinnten Upstream-Commit,
`.github/workflows/movi-experiment.yml` für einen späteren gezielten
Quellcode-Neubau, die Seek-Regressionen, den offiziellen Versionsordner
und die Integritätsprüfung in `tests/movi-official-smoke.mjs`.
Der Experimental-Workflow ist kein Bestandteil des normalen Pages-Releases;
sein Ergebnis ersetzt den offiziellen Player nicht automatisch.

**Bewusst nicht löschen:** die alten JS-/WASM-URLs unter
`dist/vendor/` einschließlich `experimental/`. Sie sind lediglich
Kompatibilitätskopien desselben bestätigten Players für alte Tabs und
PWA-Caches; es gibt dadurch **keine zweite aktive Player-Variante**.
Den Parameter `?moviExperimental=1` wertet die aktuelle Anwendung
nicht mehr als Player-Umschaltung aus.

**Nur noch Historie:** `docs/QA_MKV_SEEK.md` und die älteren
experimentellen Testergebnisse beschreiben die Fehlersuche. Für Betrieb
und Updates gilt diese offizielle Anleitung. Neue Änderungen am Player
nur mit neuem Versionsverzeichnis, aktualisiertem Manifest, erneuter
Regression und anschließendem realen MKV-Abnahmetest übernehmen.
