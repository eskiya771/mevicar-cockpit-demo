# MeviCar Next – Prototype v0.5.0

**Release-Typ:** Premium-Tacho mit zwei analogen Instrumenten  
**Live-Demo:** https://eskiya771.github.io/mevicar-cockpit-demo/

## Neu gegenüber v0.4.0

### Premium-Tacho
- Analoger Geschwindigkeitsmesser von **0 bis 220 km/h** mit Beschriftung in 20-km/h-Schritten und großer digitaler Geschwindigkeit.
- Analoger Drehzahlmesser von **0 bis 8.000 U/min** mit rotem Bereich ab 6.500 U/min.
- Vollbild zeigt beide Instrumente nebeneinander. Der Split-Screen neben der Navigation ordnet die Digitalgeschwindigkeit über die beiden Nadeln, statt nur zu verkleinern.
- GPS-Geschwindigkeit, Genauigkeit und Höhe, sobald der Standort freigegeben ist. Ohne Fix bleibt die Geschwindigkeit leer.
- Trip-Kilometer nur aus plausiblen GPS-Punkten. Sprünge über 230 km/h und Fixes schlechter als 80 m werden verworfen. Der Trip bleibt lokal gespeichert.
- **Gesamt-km** bleibt leer, bis eine Fahrzeugquelle ihn liefert. GPS setzt keinen Tachostand.
- Kompass über den Gerätesensor, sonst GPS-Kurs bei einem Fix.
- Demo-Modus bewegt beide Nadeln, den Trip und den Kompass und ist dauerhaft mit **DEMO** gekennzeichnet. Er überschreibt weder den GPS-Trip noch einen später eingespeisten Kilometerstand.
- Drehzahl und Gesamtkilometer können später über `meviSpeedIngest()` aus OBD kommen, ohne die Anzeige zu ersetzen.
- Animation läuft nur, solange der Tacho sichtbar ist, und wird beim App-Wechsel beendet.

## Nachtrag Tacho 2.0 (Folge-Build, Produktversion bleibt 0.5.0)
- Vollbild auf großen Displays (DeX, Full HD, Panorama): beide Instrumente skalieren per CSS-Container-Query auf die verfügbare Höhe statt auf eine feste Maximalgröße.
- Digitale Geschwindigkeit und Drehzahl-Readout wachsen mit dem Instrument; die Anmerkung „×1000“ liegt nicht mehr unter dem Drehzahlwert.
- Service-Worker-Cache `mevicar-next-shell-v20`, damit installierte PWAs die neue Darstellung geschlossen übernehmen.
- Tacho 2.1: Gesamt-km, Trip und Kompass im Vollbild und in großen Split-Flächen deutlich größer (Full HD: 45 px Werte, 103 px Kompassrose mit N/O/S/W). Hohe Split-Flächen (DeX, Full HD) stapeln Tacho und Drehzahlmesser; der Drehzahlmesser im Split ist nicht mehr auf 300 px begrenzt. Mobilprofile unverändert. Service-Worker-Cache `mevicar-next-shell-v21`.

## Hinweise
- **v0.5.0 bleibt ein Web-/PWA-Prototyp, keine Android-APK.**
- Ohne OBD-Adapter gibt es keine echten Drehzahl- oder Gesamtkilometerwerte.
- iPhone verlangt für den Kompass eine Nutzeraktion. Ein reiner GPS-Kurs erscheint erst bei einem gültigen Fix.
- Automatisierte Tests ersetzen keine Sichtprüfung auf iPhone 17, Galaxy S20 FE, DeX, Full HD und Panorama.

**Produktversion:** v0.5.0 · die GitHub-Actions-Buildnummer wird beim Pages-Deploy separat vergeben.
