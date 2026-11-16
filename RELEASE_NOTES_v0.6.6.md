# MeviCar Next Web v0.6.6 – Zwischenstopps und POIs in Routennähe

## Neuer Navigationsabgleich mit Fables Android-APK
- **Zwischenstopps direkt in der normalen Web-App:** In der Routenvorschau oder während aktiver Navigation über **„＋ Stopp suchen“** einen Zwischenstopp auswählen.
- Zwischenstopps werden über Google Maps JavaScript **Routes.computeRoutes** mit **intermediates** tatsächlich in die Strecke eingerechnet – keine optischen Marker ohne Routing. Bis zu acht Zwischenstopps vor dem ursprünglichen Endziel.
- Bereits eingeplante Zwischenstopps werden in der Routenvorschau aufgelistet und einzeln entfernt. Entfernen berechnet die Route erneut.
- POI-Kategorien und Freitext bieten den Filter **„In Routennähe“**. Statt Androids nativer SearchAlongRoute-API fragt die Web-Version Google Places an bis zu vier Punkten entlang der noch verbleibenden Route ab und filtert Treffer, die mehr als 8 km Luftlinie von der Streckenlinie entfernt sind.
- Die Oberfläche erklärt ausdrücklich, dass **„In Routennähe“ keine exakte Umwegzeit** berechnet und nicht identisch zur Android SearchAlongRoute-API ist.
- Die separate Ortsdetailkarte zeigt während einer bestehenden Route **„Als Stopp hinzufügen“**. Eine explizite **„Neue Route“** startet dagegen eine neue Route zum gewählten Ziel.
- **Fehlersicher:** Ein Zwischenstopp wird erst gespeichert, wenn Google eine neue Route geliefert hat. Bei Google-Fehler bleibt die bestehende Route einschließlich Ziel erhalten.
- Während einer echten laufenden GPS-Navigation bleiben der GPS-Watch und die Road-Assist-Führung aktiv. Road Assist wird über die neu berechnete Strecke informiert.
- Bei Demo-Navigation endet eine laufende Demo nach Umplanung, weil sonst die alte simulierte Abbiegefolge falsch weiterliefe.

## Grenzen
- Keine Änderungen an der nativen Hybrid-APK und deren Google Navigation SDK.
- Google Places und Routes benötigen die entsprechenden APIs, Website-Freigaben und Abrechnung für den Web-Key.
- Die Web-Näherung „In Routennähe“ ist kein Navigationsumweg- oder Fahrzeitvergleich. Maximal vier Places-Anfragen pro Suche (bis zu 20 angezeigte Treffer).
- Zusätzliche Google API-Anfragen können Kosten verursachen. Die Zahl der Stichproben ist daher begrenzt.

## Installation
Die neue Version wird nach grünem GitHub-Quality-Check und erfolgreichem GitHub-Pages-Build wie gewohnt im **normalen Web-Cockpit über „Aktualisieren“** geladen. Keine separate Testversion.
