# Neue Firma einrichten

Reihenfolge einhalten — die ersten beiden Schritte sind die, die stillschweigend Daten
zerstören oder in die falsche Firma schreiben, wenn man sie überspringt oder vertauscht.

## 1. Nextcloud-Gruppe, Team-Ordner, Dienstkonto (VOR jedem App-Start)

1. Gruppe `<k>` anlegen (`<k>` = das Firmenkürzel, z. B. `xy`).
2. Groupfolder `<Firma>` anlegen, Rechte **nur** für die Gruppe `<k>`.
3. Dienstkonto `<k>-app` anlegen und in die Gruppe `<k>` aufnehmen.
4. Erst danach darf die App-Instanz laufen.

**Warum zuerst:** Fehlt der Ordner, wenn die App zum ersten Mal schreibt, legt die
MKCOL-Kette stillschweigend einen zweiten `<Firma>`-Ordner im Heimatverzeichnis des
Dienstkontos an — ohne Fehlermeldung, und die Dokumente landen dort statt im Team-Ordner
(siehe `CLAUDE.md`, Abschnitt zu `assertOrdner`). Das lässt sich später
nur von Hand aufräumen, wenn überhaupt bemerkt.

## 2. Eigene Paperless-Instanz

Eigener Container, eigene Datenbank — **keine** gemeinsame Instanz mit Rechtefiltern
(Entscheidung Inhaber, 17.09.2026: bei einer gemeinsamen Instanz trennt nur Konfiguration
die Belege zweier Firmen, das ist keine echte Trennung). Adresse folgt dem Schema unter
`dienste.paperless` in der Mandanten-Konfiguration.

## 3. Dolibarr

1. Container + **eigene** MariaDB anlegen.
2. Module aktivieren: Rechnungen, Angebote, Projekte, Lieferanten, Spesen, Buchhaltung
   (SKR03).
3. Gruppen `Admins` und `Geschäftsführer` anlegen.
4. Stillen Admin-Account anlegen (kein Login im Tagesgeschäft, nur für Notfälle).
5. API-Key erzeugen.

**Backup, bevor echte Daten reinkommen:** die neue Datenbank in PBS/Borg aufnehmen
(gleiches Muster wie bei den bestehenden Instanzen), *bevor* echte Kunden- oder
Rechnungsdaten eingespielt werden. Eine Firma ohne Backup ab Tag 1 ist ein
Buchhaltungsrisiko, kein Nice-to-have.

## 4. Startkatalog einspielen

```bash
DOLIBARR_URL=https://erp.<k>.example.org DOLIBARR_KEY=<key> UST_PFLICHTIG=<0|1> \
  node scripts/mandant/katalog-einspielen.mjs
```

Erst mit `--trocken` gegenprüfen (siehe unten), dann ohne den Schalter ausführen.
Wiederholtes Ausführen ist unschädlich: `katalog-baumpflege.json` wird über die
Referenz (`ref`) abgeglichen, vorhandene Einträge werden nicht verändert — auch nicht,
wenn die Firma inzwischen eigene Preise eingetragen hat.

## 5. `mandant.json` und Coolify-Anwendung

1. `/data/mandant.json` mit den Firmendaten ins Volume legen.
2. Coolify-Anwendung anlegen: **eigenes** Volume, **eigene** Domain. Niemals die
   Coolify-Umgebung von Blattwerk kopieren (siehe nächster Schritt).

## 6. ENV-Abgleich (Task 10)

`scripts/mandant/env-pruefen.mjs` gegen die neue Umgebung laufen lassen. Prüft u. a.,
ob von Blattwerk geerbte Zugänge (Nextcloud-Team-Konto, Dolibarr-URL, SMTP, Paperless,
Matrix/Chat) noch auf Blattwerk zeigen, und ob `SSO_TRUSTED_PROXY_IPS` gesetzt ist —
fehlt der vertraute Proxy, scheitert jeder Login stumm, ohne Fehlermeldung.

---

## `katalog-einspielen.mjs`

Spielt den Startkatalog Baumpflege (`katalog-baumpflege.json`, 19 Verkaufsleistungen +
19 Einkaufsartikel) über die REST-API in ein frisches Dolibarr ein.

```bash
DOLIBARR_URL=https://erp.<k>.example.org DOLIBARR_KEY=<key> UST_PFLICHTIG=<0|1> \
  node scripts/mandant/katalog-einspielen.mjs --trocken   # nur anzeigen, nichts schreiben
DOLIBARR_URL=https://erp.<k>.example.org DOLIBARR_KEY=<key> UST_PFLICHTIG=<0|1> \
  node scripts/mandant/katalog-einspielen.mjs             # tatsächlich anlegen
```

- `UST_PFLICHTIG=0` (Kleinunternehmer § 19 UStG) → 0 % USt auf alle neu angelegten
  Verkaufsleistungen. `UST_PFLICHTIG=1` → 19 %.
- Idempotent über `ref`: ein zweiter Lauf legt nichts doppelt an und lässt vom Kunden
  geänderte Preise/Bezeichnungen unangetastet — der Katalog trägt bewusst **keine**
  Preise, die setzt jede Firma selbst.
- **Konto-Reparatur:** scheitert das SKR03-Konto-`PUT` nach dem Anlegen (z. B. Netzfehler),
  bliebe der Artikel ohne Konto stehen, weil jeder weitere Lauf nur noch den vorhandenen
  `ref` sieht und ihn überspringt. Das Skript vergleicht deshalb bei jedem Lauf das
  vorhandene `accountancy_code_buy` gegen den Katalog und trägt es nach, aber **nur wenn
  es fehlt** — ausschließlich dieses eine Feld, Preis und Bezeichnung bleiben unangetastet.
  Ein **abweichendes, aber vorhandenes** Konto wird bewusst **nicht** überschrieben (gleiches
  Versprechen wie bei Preisen: ein Kunde oder dessen Steuerberater kann das Konto absichtlich
  geändert haben) — es erscheint nur als Zeile „abweichendes Konto, bleibt unverändert" in
  der Ausgabe.
- Der Katalog trägt SKR03-Konten für Einkaufsartikel (`konto`). Dolibarrs REST-API nimmt
  `accountancy_code_buy` nachweislich nur über `PUT /products/{id}` an (im übrigen
  Repo, `dolibarr-app.jsx`, ausschließlich so verwendet); das Skript legt den Artikel
  daher zunächst per `POST /products` ohne dieses Feld an und setzt das Konto
  anschließend per `PUT` nach.
- Die Einheit (`Std`, `m³`, `lfd. m`, `Paar`, `pauschal`, …) landet im Feld
  `note_public`, nicht in Dolibarrs `fk_unit`: `fk_unit` ist eine Fremdschlüssel-Zahl in
  die Tabelle `c_units`, die einige Katalog-Einheiten (z. B. `lfd. m`, `Einsatz`,
  `pauschal`, `Paar`) gar nicht kennt. `note_public` ist Freitext, erscheint im PDF und
  ist für jede Einheit verwendbar — bewusste Wahl, kein Notbehelf.
- **Niemals gegen Blattwerks laufendes Dolibarr schreiben.** Nur `--trocken` ist dort
  erlaubt. Ein Schreiblauf ist ausschließlich gegen ein frisches Mandanten-Dolibarr
  vorgesehen (der End-to-End-Schreibtest folgt in einer späteren Aufgabe mit echtem
  Mandanten).

## Versionen und Updates (19.09.2026)

**Welcher Stand läuft wo?**
- Jede Instanz meldet unter `/api/version` Commit, Version, Kürzel und Startzeit (offen, ohne Geheimnisse; der Commit kommt von Coolify über `SOURCE_COMMIT`).
- Übersicht für Inhaber: `https://<blattwerk-instanz>/admin/versionen` (nur `MANDANT_ADMINS`; `?format=json` für Skripte). Die Liste liegt in `/data/instanzen.json`:
  ```json
  [{ "name": "Blattwerk", "url": "https://app.example.org" },
   { "name": "Firma XY", "url": "http://203.0.113.41:8101" },
   { "name": "Kalender-App", "url": "https://apps.example.org/kalender", "art": "manifest" }]
  ```
  `art: "manifest"` liest das Update-Manifest der Android-Apps. Für Firmen-Instanzen die **interne** Adresse eintragen — hinter Authentik-Forward-Auth käme sonst nur die Anmeldeseite zurück.
- Im Terminal: `scripts/mandant/freigeben.sh --status` (Betriebs-Repo blattwerk-betrieb).

**Updates ausrollen**
- Blattwerk hängt an `main` und ist der Vorreiter. Firmen-Instanzen hängen in Coolify am Zweig **`stabil`** (beim Anlegen der Coolify-Anwendung als Branch eintragen, „Auto Deploy" an).
- `scripts/mandant/freigeben.sh [commit]` (Betriebs-Repo blattwerk-betrieb) — Tests grün → `stabil` vorspulen → je Instanz Deploy anstoßen → warten, bis `/api/version` den neuen Commit meldet. Bricht bei der ersten fehlgeschlagenen Instanz ab.
- Instanzliste des Skripts: `~/.config/blattwerk/instanzen.tsv` (`name<TAB>coolify-uuid<TAB>…/api/version`).
- Bewusst **kein** automatisches Freigeben bei jedem Push auf `main`: ein Fehler soll erst bei Blattwerk auffallen, nicht bei allen Firmen gleichzeitig. Zurück geht es mit `freigeben.sh` nicht (nur Fast-Forward) — dafür in Coolify den vorigen Deploy der Instanz wieder ausrollen.

Die Instanzliste kann statt als Datei auch als Umgebungsvariable `INSTANZEN_JSON` kommen (gleiches JSON). Das ist der Weg für Coolify, weil `/data` dort kein Volume ist.
