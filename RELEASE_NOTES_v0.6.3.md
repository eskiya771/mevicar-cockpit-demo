# MeviCar Next Web v0.6.3 – Home Assistant-Zugang dauerhaft speichern (16.11.2026)

Dieser Web-Release aktualisiert die reine Web-/PWA-Version. Die installierte Hybrid-Android-APK, ihre Google-Navigation-SDK-Integration und das Android-Repository bleiben unverändert.

## Neu
- Home Assistant: Der Long-Lived Access Token wird nach **erfolgreicher Verbindung** für den Neustart des Browsers in diesem Browser lokal gespeichert.
- Beim nächsten Start versucht MeviCar die Verbindung automatisch wiederherzustellen.
- Der Token ist an die HTTPS-Adresse der Home-Assistant-Instanz gebunden; nach einem Serverwechsel wird er nicht an die neue Adresse gesendet.
- „Entfernen“ löscht den gespeicherten Web-Token und beendet die Sitzung.
- Eine ungültige Anmeldung (HTTP 401/403) löscht den gespeicherten Token. Vorübergehende Netzwerkprobleme bewirken keine Löschung.

## PWA-Cache-Korrektur
- Die Zugangsverwaltung (`credential-settings.js`) wird direkt in das versionierte HTML eingebaut.
- Damit kann ein Windows-PWA-Neustart keine ältere Zugangsverwaltung mit einer neuen Build-Anzeige kombinieren. Dies behebt das Problem, bei dem **Build 982** trotz aktualisiertem Code noch den Hinweis auf lediglich flüchtige Token-Speicherung zeigte.
- Automatisierte Regressionsprüfungen verhindern ein erneutes Auseinanderlaufen von Settings-Code und HTML-Build.

## Sicherheit und Einschränkungen
- **Browser-`localStorage` ist nicht verschlüsselt.** Den HA-Token nur auf einem eigenen, geschützten Gerät dauerhaft speichern.
- Der Token wird nicht an GitHub übertragen und nicht im UI oder in Debug-Ausgaben angezeigt.
- Browserdaten löschen, Inkognito-Modus oder unterschiedliche Browserprofile entfernen bzw. trennen die lokale Speicherung.
- Wenn eine PWA nach dem Update noch alte Inhalte zeigt, schließen und neu öffnen; bei Bedarf im Browser hart neu laden.
- Die native Android-APK verwendet weiterhin ihre bisherige native Zugangsdatenverwaltung.

## Abnahme
- Pull Request #25 (Web-HA-Persistenz) und #26 (atomare Credentials-PWA-Assets).
- Alle Qualitätsprüfungen für #26 bestanden (58/58).
