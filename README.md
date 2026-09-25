# DoliMobile

Installierbare Dolibarr-Web-App für Android und iOS (PWA).

## Lokal starten

```bash
npm install
npm run dev
```

## Für Deployment bauen

```bash
npm run build
```

Der Produktionsbuild liegt danach in `dist/`.

## Deployment mit Coolify

- Source: Git Repository
- Build command: `npm install && npm run build`
- Publish/Output directory: `dist`
- Node-Version: 20 oder neuer
- `npm run build` bricht ohne `VITE_DOLIBARR_URL_DEFAULT` ab (vite.config.js),
  damit kein Production-Build unbemerkt mit den eingebauten Platzhaltern
  läuft. Echten Wert setzen (siehe `.env.example`) oder für CI/den
  öffentlichen Export `BW_PLATZHALTER_OK=1` setzen — dieselbe Var erlaubt
  auch den Serverstart ohne eigene `mandant.json` (server.mjs/startPruefen).

## Installation auf Smartphones

### iPhone / iPad

1. App-URL in Safari öffnen.
2. Teilen-Symbol antippen.
3. „Zum Home-Bildschirm“ auswählen.
4. App über das neue Icon starten.

### Android

1. App-URL in Chrome öffnen.
2. Menü öffnen.
3. „App installieren“ oder „Zum Startbildschirm hinzufügen“ auswählen.
4. App über das neue Icon starten.

## Offline-Erfassung

Die App funktioniert offline: Neue **Belege (Fotos)**, **Zeitbuchungen**, **Kunden** und **Projekte** können ohne Internetverbindung angelegt werden. Sie landen in einer lokalen Warteschlange und werden automatisch mit Dolibarr synchronisiert, sobald das Gerät wieder online ist.

- **Belege**: Foto aufnehmen → Bild wird lokal zwischengespeichert (keine OCR offline) → sendet beim Reconnect an `/api/nc/putfile` (Nextcloud `Blattwerk/Belege/`) → dort läuft die bestehende OCR/Freigabe-Pipeline serverseitig
- **Zeitbuchung**: Aufgabe wählen, Zeit eingeben → Sync nutzt `saveTimeSpent` wie online
- **Kunden/Projekte**: Name, Kontakt, Projektdaten → als CREATE übertragen
- **Besonderheit**: Offline erstellte Projekte erhalten keine auto-generierten Standard-Aufgaben/Termine beim Sync (da die Server-ID erst danach vorliegt)
- **Nur Neuanlage**: Offline können keine bestehenden Datensätze bearbeitet werden — dazu muss man online sein

## Hinweise

- Die App muss über HTTPS laufen, sonst funktionieren PWA-Installation und Service Worker nicht zuverlässig.
- Dolibarr/API-Daten werden nicht im Service-Worker-Cache gespeichert, damit keine veralteten API-Antworten angezeigt werden.
- Einstellungen wie Dolibarr-URL, API-Key, Theme und Timer bleiben lokal im Browser/Web-App-Speicher des Geräts erhalten.
