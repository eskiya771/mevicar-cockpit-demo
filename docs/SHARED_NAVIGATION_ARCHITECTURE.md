# MeviCar Next — gemeinsame Navigationsoberfläche (Entwicklungsbranch)

**Ausgangspunkt:** MeviCar Next Web v0.6.2, Commit `53aa441f58695f9bc2b9b1cf33c044f2a1aecad4` (16.11.2026).

**Arbeitszweig:** `feature/shared-navigation-ui`. Dieses Konzept wird **nicht** in `main` umgesetzt, bevor Web und Android getrennt abgenommen sind. Die signierte Hybrid-Android-Preview 133 und Fables derzeitiger Android-Code bleiben unverändert.

## Architekturentscheidung

**Eine Oberfläche, verschiedene Navigations-Engines.** Die kanonische Zielsuche und das Adressbuch werden künftig genau einmal in den Web-Assets des Repositories `mevicar-cockpit-demo` gepflegt. Die Android-Hybrid-App verwendet bereits eine WebView und bündelt die Web-Assets; sie soll die gemeinsame Oberfläche nutzen können, ohne eigene Suchlisten oder Adressbuch-Layouts in Kotlin zu duplizieren.

Die einzige plattformspezifische Schicht ist ein Navigation-Adapter:

| Verantwortlichkeit | Web/PWA | Android-Hybrid |
| --- | --- | --- |
| Zielsuche, Schnelleinstiege, POIs, Ergebnisse, Favoriten, Verlauf, Adressbuch, UI/Layouts, Themes | gemeinsamer Web-Code | **derselbe** Web-Code in der WebView |
| Suche und Place-Details | Google Places JavaScript API mit Browser-Key | Android Places SDK über validierte Native-Bridge oder gezielt freigegebene Browser-API |
| Route, Führung, Kamerafahrt | bestehender Browser-GPS-/Google-Maps-Pfad | bestehendes natives Google Navigation SDK |
| Road Assist | bestehende Web-Integration | bestehende native Engine/Bridge |
| Speicherung | Browser-Speicher | native Speicherung via Bridge; über gemeinsamen Datenvertrag |

**Nicht** den nativen Android-Navigation-Code in JavaScript umschreiben: Das echte Navigation SDK bleibt Android-spezifisch. Die Web-App nutzt ihren vorhandenen Routenmodus.

## Geplanter gemeinsamer Datenvertrag

```js
// Transportformat, keine gespeicherten API-Keys oder privaten Android-Zugriffsdaten
Destination = { id, name, address, lat, lng, placeId?, slot?, icon?, note? }
DestinationBook = { version: 2, saved: Destination[], recent: Destination[] }
NavigationProvider = {
  autocomplete(query, sessionId),
  resolvePlace(placeId),
  readBook(),
  writeBook(change),
  selectDestination(destination),
  startRoute(destination),
  getRouteStatus()
}
```

- Gemeinsame Eingabevalidierung und Fehlertexte vor jeder Plattformübergabe; die Android-Bridge prüft Eingaben erneut.
- IDs, Slots `home`/`work`, Reihenfolge, Import/Export und letzte Ziele dürfen nicht durch den Oberflächenwechsel verloren gehen.
- In Android bleiben API-Schlüssel im Keystore. Keine Übertragung des Android-Keys in JavaScript.
- Web-/Android-Daten werden nicht heimlich zusammengeführt; zuerst expliziter Export-/Import-Test oder geprüfter Migrationspfad.

## Schrittweise Umsetzung

1. **Gemeinsamen UI-/Zustandsvertrag extrahieren.** Bestehende Android-Kotlin-Dialoge `NavSearchDialog` und `NavAddressBookDialog` dienen als **visuelle Referenz**, nicht als zweite Produktionsimplementierung. Bestehende `nav-web-parity.js/.css` sind der Ausgangspunkt. Reine Web-Suche/Favoriten/Adressbuch müssen unabhängig von einer Android-Bridge funktionieren.
2. **Adapter isolieren.** Browser-Provider und Native-Bridge-Provider implementieren dieselben Aktionen, insbesondere Auswahl, Suche, Speichern, Navigation und Status. Fehler in nativen Aufrufen bleiben sichtbar; keine stille Vermischung von Routen-Engines.
3. **Browser vorab abnehmen.** Web-Adressbuch einschließlich Import/Export, Fav/Zuletzt/Home/Work, Suchtreffer und Tastatur in fünf Zielprofilen und drei Themes testen. Regressionstests für die vorhandene Routenführung, Road Assist und Audio.
4. **Android separat in einem eigenen Feature-Branch umschalten** (erst mit gesondertem APK-Integrationsschritt): Der APK-Suchbutton öffnet dann die gemeinsame Web-Oberfläche statt `NavSearchDialog`, während Google Navigation SDK, Places-Berechtigungen und Key-Handling nativ bleiben. Kein Umschalten der bestehenden Preview oder von Android-`main` ohne explizite Abnahme.
5. **Gemeinsame Quellbasis festschreiben.** Der Android-Build bezieht exakt eine gepinnte Web-Revision; Version/Build und Web-/Native-Kompatibilität bleiben getrennt erkennbar. Erst danach werden doppelte, nicht mehr benutzte native Dialog-Layouts entfernt.

## Abnahmekriterien

- Suche und Adressbuch werden nur an **einer** Stelle gepflegt; kein paralleles Kotlin-/HTML-Layout.
- Web UI entspricht der freigegebenen Android-Referenz bei Suchzeile, Schnelleinstiegen, „Zuletzt“, „Gespeichert“, Adressbuch und Zielauswahl.
- Android-Beta bleibt installier- und nutzbar; die signierte Vorschau 133 wird durch diese Arbeit nicht ersetzt.
- Reine Web/PWA-Navigation, Android Google Navigation SDK, Road Assist, Import/Export und Zurück-/Tastaturbedienung bestehen Regressionen und reale Gerätetests.
- Kein Merge nach `main`, bevor User-Abnahme sowie CI-/Browser-/Gerätetests dokumentiert sind.

## Offene Produktentscheidung für später

Beim Umstellen der Hybrid-APK ist zu klären, ob die gemeinsame Oberfläche Android-Places ausschließlich über die native Bridge nutzt (empfohlen, weil das bisherige native Key-/Storage-Modell erhalten bleibt), oder ob eine gezielt separate Browser-Places-Integration für die Suche verwendet werden soll. **Keine Änderung an der derzeitigen APK.**
