# MeviCar Next Web v0.6.5 – Google POI-Treffer und Ortsdetails

## Neuer Abgleich mit Fables Hybrid-APK
- Google-POI-Suchergebnisse erscheinen in einer eigenen nummerierten Trefferliste direkt in der normalen MeviCar-Web-App; mit Ortsart, Luftlinienentfernung, Adresse und Route-Schaltfläche.
- Filter und Sortierung: **Entfernung**, **Relevanz** und **Jetzt geöffnet**. Die Auswahl startet eine echte neue Google-Places-Abfrage, nicht nur eine optische Sortierung.
- Ortsdetails werden erst beim Öffnen eines Treffers abgefragt: Name, Ortsart, Adresse, Luftlinienentfernung, Bewertung und Anzahl der Rezensionen, Telefon, verfügbare Öffnungszeiten und Öffnungsstatus.
- Ortsdetailkarte mit **Route** und **Speichern/Gespeichert**. Das Speichern schreibt in das bestehende Web-Adressbuch, ohne eine laufende Navigation zu unterbrechen.
- Im Web wird weiterhin das Google Maps JavaScript/Places SDK verwendet; native Android-Google-Schlüssel und die APK bleiben unberührt.
- Für eine fehlgeschlagene Places-Abfrage erscheint eine sichtbare Meldung mit **Erneut versuchen**, statt alte Suchergebnisse stehenzulassen.
- Optimierte Schaltflächen und getrennte Scrollbereiche für Desktop, DeX und iPhone-Querformat.

## Technische Grenzen
- Die Google-Places-Detailfelder (z. B. Telefon und Bewertung) unterliegen Googles API-Freigaben und Abrechnung. Nicht verfügbare Angaben werden ausgelassen, nicht erfunden.
- Die Android-Funktion **Entlang der Route** und Zwischenziele erfordern eine gesonderte Einbindung in die Web-Routenführung; sie sind kein Bestandteil von v0.6.5.
- Die Web-App wird wie gewohnt durch den eigenen **Aktualisieren**-Button auf die neueste GitHub-Pages-Version gebracht. Keine separate Vorschau erforderlich.

## Qualität
Automatische Regressionstests für die günstigeren POI-Listenfelder, lazily geladene Place Details, Sortierung, Öffnungsfilter, Speicherung und Routenstart sowie die bisherige Navigation und die übrigen App-Funktionen.
