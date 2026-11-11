# MKV-Seek: HTTP-Dateigröße und Suchphase

## Offizieller Stand

Der bestätigte Player ist jetzt die reguläre Auswahl für MeviCar Next; ein Testparameter ist nicht mehr nötig. Versionsfeste Dateien und Abnahme: [QA_MKV_OFFICIAL.md](QA_MKV_OFFICIAL.md). Die nachfolgenden Abschnitte dokumentieren die vorherige Diagnose und Testphase.


Stand: 11. November 2026. Gepinnter Movi-Upstream:
`8bd0b50d7cdfcef635e015ea93e365876088969d`.

## Ergebnis des Filmprotokolls

Der Nutzer bestätigt den Test mit `?moviExperimental=1`. Der erste Fix
(PR #2, inzwischen integriert) reicht allein nicht aus. Der Seek ab 01:59:14
benötigt 31.436 ms bis `playing`: 10.515 ms bis `seeked/canplay`, danach
20.921 ms. Die anfänglichen 3.491 ms gehören zu einem anderen Startvorgang.
Die früher protokollierten Ranges dürfen diesem späteren Seek nicht
zugerechnet werden; dessen vollständige Netzwerkzusammenfassung fehlt.

Die auffälligen Ranges sind 1.887.436 Bytes lang, schreiten um 1.572.864 Bytes
fort und überlappen um 314.572 Bytes. Das entspricht exakt dem Lesefenster
`floor(2 MiB * 0.9)` bei Movis minimalem 2-MiB-Puffer. MeviTV fordert 50 MiB
an; sein unabhängiger Range-Test meldet 1.570.800.962 Bytes Gesamtgröße.

## Zweite Korrektur: gültige Dateigröße

HttpSource akzeptierte `HEAD Content-Length: 0` als Dateigröße. Dadurch
bleibt der HTTP-Puffer minimal und der dateigrößenabhängigen Suche fehlt
eine gültige Obergrenze. Dieser Codefehler ist reproduziert. Die spätere Nutzerabnahme bestätigt HEAD-Length 0 und diesen Fehlerpfad
auch für den betroffenen Film; siehe reale Rückmeldung unten.

Der ergänzte `patches/movi-seek.patch`:

- akzeptiert nur positive, sichere Ganzzahlen als Gesamtgröße;
- nutzt bei Teilantworten den validierten Content-Range-Gesamtwert;
- fällt bei unbrauchbarem HEAD auf einen 1-Byte-Range-GET zurück;
- verwendet nie die Content-Length eines 206-Abschnitts als Dateigröße;
- bricht Probe-Antwortkörper nach den Headern ab;
- zeigt mit `getReadDiagnostics()` tatsächliche Quell-/Demuxergröße,
  HTTP-Pufferkapazität, HEAD-Länge und Größenquelle.

MeviTV hält Engine-, Größen- und Trackdiagnosen auch nach mehr als 70
Logereignissen im kopierbaren Protokoll fest. Das tatsächliche
`trackschange`-Objekt mit Audio-/Video-Arrays wird unterstützt.
Der Marker dieser Korrektur lautet **`mevitv-mkv-size-2`**.
Der bestehende 75-%-Benchmark und die Indexprüfung bleiben enthalten.

## Bereits integrierte Suchphasen-Korrektur

Der SourceDataAdapter reicht das optionale WASM-Probe-Signal nicht an
HttpSource weiter. Deshalb begrenzt der Patch den HTTP-Probe-Modus auf
die Lebensdauer nativer Demuxer-Seeks, einschließlich Fehlerpfaden und
überlappender Aufrufe. Nach erfolgreichem Seek bestimmt der nächste
ungepufferte Zugriff den wirklichen Landepunkt, unabhängig von der linearen
Positionsschätzung. Cachetreffer bleiben lokal.

Die hier ergänzte Größenkorrektur verändert HTTP/TypeScript-Code. Der auf
main separat hinzugekommene `patches/movi-cues-fastseek.patch` bleibt als
eigene native Änderung erhalten. Serverseitiges Transcoding wird nicht
eingeführt.

## Geprüft

- 22 Movi-Regressionen: 8 bestehende Suchphasen- und 14 Größen-/HTTP-Fälle.
- Echter lokaler HTTP-Test mit HEAD=0 und virtueller 1.570.800.962-Byte-Datei:
  Originalcode liefert Größe 0 und 1.887.436-Byte-Anfangsrange;
  korrigierter Code liefert die Gesamtgröße, 50-MiB-Puffer und
  4.194.304-Byte-Anfangsrange. Die gelesenen Nutzdaten stimmen.
  Der gezielte Test wurde gegen Originalcode ausgeführt und scheiterte
  genau an diesen beiden Werten; gegen den Patch besteht er.
- Gültiger HEAD benötigt weiterhin nur eine Anfrage. Ignorierte Ranges,
  ungültige Content-Range-Grenzen und Body-Abbruch sind geprüft.
- TypeScript und lokaler Slim-IIFE-Build bestanden. Lokal wurde unverändertes
  WASM aus `movi-player@0.4.1` verwendet; kein lokaler FFmpeg-/Docker-Neubau.
- MeviMedia, Lichtshow, UI-Quality, Displayprofile, Speedometer und MeviTV:
  vorgeschriebene Smoke-Prüfungen bestanden.
- Neuer VM-Test prüft dauerhafte Diagnosezeilen, tatsächliche HTTP-Metriken,
  Trackobjekte, URL-Redaktion, Kopieren und ältere Player ohne Diagnosemethode.

Kein echter Film wurde lokal decodiert. Die Tests belegen keine bestimmte
Seek-Latenz oder A/V-Synchronität. Diagnoseanzeige textlich erweitert;
keine neue visuelle Freigabe behauptet.

## Build und reproduzierbare Abnahme

`movi-seek-regression.yml` prüft die Patch-Anwendung gegen den gepinnten
Upstream, Typen, HTTP-Regressionen und MeviTV-Diagnosen. Der experimentelle
Workflow baut nach Integration auf main zusätzlich FFmpeg/WASM und den
passenden JS-Player. Erst anschließend kann Pages den neuen Player ausliefern.
Ein erfolgreicher PR-Test allein aktualisiert die Live-Seite nicht.

1. Gleichen Film, Gerät und Browser verwenden. Seite vor jedem Versuch
   vollständig neu laden. Die stabile URL dient als Vergleich; den neuen
   Experimental-Stand mit `?moviExperimental=1` auswählen.
2. Vor der Messung im kopierten Protokoll **`Patch mevitv-mkv-size-2`**
   prüfen. Fehlt der Marker, ist dies noch kein Test der Größenkorrektur.
3. Nach stabiler Startwiedergabe aus derselben Ausgangsposition den
   **75-%-Seek-Test** starten. Alternativ denselben manuellen Fernsprung
   wiederholen. Zeit bis zum bewegten Bild mit passendem Ton beobachten.
4. Nach Wiederanlauf mindestens zehn Sekunden beobachten und dann
   **Protokoll kopieren**, bevor ein weiterer Sprung beginnt.
   Damit ist auch die verzögerte Seek-Netzwerk-Zusammenfassung enthalten.
5. Je Vergleich mindestens zweimal testen, Rücksprünge getrennt erfassen.
   Indexprüfung nicht während der Zeitmessung starten.

Erwartet werden dieselbe positive Größe in Quelle/Demuxer und beim
betroffenen großen Film 50.0 MiB HTTP-Puffer. Bei HEAD-Length 0 muss die
Größe beispielsweise per `range` ermittelt sein. Die anhaltende Folge
der 1,8-MiB-Anfragen sollte verschwinden; kleine Index-Probes sind normal.
Ziel bleibt Wiedergabe in wenigen Sekunden mit synchronem Bild und Ton.

Falls Größe und Puffer stimmen, der Seek aber langsam bleibt, ist die
Größenkorrektur wirksam, erklärt jedoch nicht den gesamten Stillstand.
Viele weitere Ranges lenken die Suche auf Landeposition/Weiterlesen,
wenige Ranges bei langem Stillstand auf Decoder, Audio und Wiedergabefreigabe.
Dafür fehlen noch native Seek-Rückkehr, erste Paketzeit und erstes
decodiertes/gerendertes Bild. `seeked` und `canplay` ersetzen diese
Messpunkte nicht.

## Reale Rückmeldung nach PR #3

Der Filmtest bestätigt HEAD-Length 0, korrekt ermittelte
1.570.800.962 Bytes und 50.0 MiB HTTP-Puffer. Der 75-%-Benchmark erreicht
playing nach 641 ms, die folgenden Sprünge nach 527, 695 und 1.265 ms.
Die Zusammenfassung für den Benchmark meldet fünf Ranges, 36 MiB und
keine Überlappung. Der Nutzer bestätigt sofort sichtbares Bild und
synchronen Ton. Damit ist die Seek-Korrektur für diesen Film praktisch
bestätigt. Die Startsequenz benötigt weiterhin 12.590 ms.

Ein anderer Film scheitert an einer nicht freigegebenen 302-Weiterleitung,
nicht am bestätigten Größen-Fallback. Folgekorrektur:
[QA_MKV_REDIRECTS.md](QA_MKV_REDIRECTS.md).
