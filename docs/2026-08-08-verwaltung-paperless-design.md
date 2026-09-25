# Verwaltung-Reiter mit Paperless-Dokumenten — Design

Stand: 2026-08-08

## Ziel

Die Fußleiste bekommt einen Platz frei, indem „Verkauf" und „Eingang" zu einem
Reiter „Geschäft" verschmelzen. Der freie Platz wird ein Reiter „Verwaltung"
mit den Betriebsunterlagen: Gefährdungsbeurteilungen, wichtige Dokumente
(Gewerbeschein, Versicherungen) und die Prüfprotokolle der PSA gegen Absturz
(Kletterzeug). Ablage und Anzeige laufen über paperless-ngx; dieselbe Datei darf
nicht zweimal hochladbar sein.

## Ausgangslage

Die Navigation ist unverändert: `Start | Verkauf | Eingang | Zeit | Kalender`.
`VerkaufPage` und `EingangPage` sind beides reine Kachelseiten; `EingangPage`
schaltet lokale Subviews und reagiert auf den Deep-Link `#freigaben` aus den
Matrix-Freigabemeldungen.

Das Arbeitsschutz-Modul ist frisch fertig geworden und bringt bereits einiges
mit, worauf dieses Vorhaben aufsetzt statt es neu zu bauen:

* `GbuPage` hat drei Reiter: *Vor Ort*, *Grundlagen*, *Einweisungen*.
* Fristenrechnung liegt in `src/arbeitsschutz.js` und wird von App **und**
  `server.mjs` importiert, damit Anzeige und Erinnerung nicht auseinanderlaufen.
* `server.mjs` kann Paperless bereits: `plId(art, name)` löst Stammdaten über
  ihren Namen auf und merkt sie sich, `plUpload({pdfBase64, dateiname, titel,
  datum, themen, typ})` legt ein PDF ab. Basis ist `PAPERLESS_URL`
  (Vorgabe `http://203.0.113.41:8010`), Token aus `PAPERLESS_TOKEN`.
* Der öffentliche Hostname ist **nicht** benutzbar: Paperless hängt an derselben
  Authentik-Forward-Auth wie die App, jeder Upload liefe in eine 302 auf die
  Anmeldeseite. Deshalb der direkte Weg ins LAN.
* Nachweise und Erinnerungszustand liegen in `Blattwerk/Arbeitsschutz/einweisungen.json`
  (lesen/schreiben mit `If-Match`, additiv).

Geprüfter Zustand der Instanz am 2026-08-08 (Host `main`, Container `paperless`):

* paperless-ngx **3.0.5**, 239 Dokumente, davon 143 mit `Bereich/Blattwerk`.
* Das Einrichtungsskript war bis dahin **nie gelaufen**: kein Dienstkonto, kein
  Tag `Thema/Arbeitsschutz`, kein Dokumenttyp. Am selben Tag nachgeholt (siehe
  *Stammdaten*).
* **Der Paperless-Weg lief trotzdem schon** — anders als zunächst angenommen.
  `PAPERLESS_TOKEN` war offenbar mit dem persönlichen API-Token von `max`
  belegt (existiert seit 14.05.2026); am 2026-08-08 um 10:40 sind so zwei
  Prüfprotokolle angekommen, mit `owner = max` und nur `Bereich/Blattwerk`,
  ohne `Thema/*` und ohne Dokumenttyp. Seit 21:12 nutzt die App das Dienstkonto.
  Folge für die Umsetzung: es gibt bereits App-Uploads unter fremdem Eigentum.
  Sie tragen `Bereich/Blattwerk` und werden von der Freigabe unten miterfasst —
  aber die Duplikatprüfung muß sie finden, sonst legt der erste Upload nach der
  Umstellung ein Doppel an. Sie prüft deshalb über die Prüfsumme, nicht über den
  Eigentümer.
* Alle 143 Blattwerk-Dokumente haben `owner = max`. Paperless 3.0 filtert über
  Objektrechte; ein Dienstkonto mit bloßem `view_document` sieht **nichts** davon
  — nachgemessen mit `get_objects_for_user_owner_aware`: **0 von 239**. Das
  globale `view_document` täuscht hier, weil `guardian.get_objects_for_user` es
  anerkennt und alles meldet, Paperless es aber mit `accept_global_perms=False`
  bewusst übergeht.
* `checksum` ist über die Dokument-API filterbar (`documents/filters.py`).
* `post_document` nimmt `custom_fields` als `{id: wert}` und setzt den Wert
  direkt beim Hochladen.

## Entscheidung: Paperless wird führend

Für die Arbeitsschutz-**Dokumente** löst Paperless die Nextcloud-Ablage ab. Das
ist bewusst eine Änderung gegenüber dem Zweitablage-Muster, mit dem das Modul
gebaut wurde.

Klar abgegrenzt bleibt: `einweisungen.json` ist ein **Zustandsspeicher** (wer
wurde wann eingewiesen, Tagesmarke `letzteErinnerung`, Buch über Archiviertes),
kein Dokument. Ein Dokumentenarchiv kann das nicht ersetzen — es kennt kein
`If-Match` und kein additives Schreiben. Die Datei bleibt daher in Nextcloud,
ebenso der Nextcloud-Login der App (Kalender und Belegupload hängen daran).

Was umzieht:

| bisher | künftig |
| --- | --- |
| GBU-PDF nach `Blattwerk/Gefährdungsbeurteilungen/<Jahr>/` | Paperless |
| Grundlagen-PDFs aus `Blattwerk/Arbeitsschutz/*.pdf` gelesen | aus Paperless gelesen |
| Einweisungsprotokoll-PDF nach Nextcloud | Paperless |
| `plGrundlagenNachfuehren` (Nextcloud → Paperless nachreichen) | entfällt, da Paperless die Quelle ist |
| `einweisungen.json` in Nextcloud | unverändert |

Damit entfallen in `server.mjs` die Endpunkte `gbu-upload`, `gbu-list` und
`gbu-file` samt Hilfscode; `/api/nc/putfile` bleibt (Beleg-Pipeline).

## Navigation

Die Fußleiste wird `Start | Geschäft | Verwaltung | Zeit | Kalender`.

`GeschaeftPage` ersetzt `EingangPage` und `VerkaufPage`. Sie behält den
Subview-Mechanismus und den `#freigaben`-Deep-Link unverändert und zeigt zehn
Kacheln:

| Kachel | Ziel |
| --- | --- |
| Beleg-Freigaben, Lieferscheine, Bestellungen aufgeben, Lieferungen erhalten, Lieferantenrechnungen, Lager | lokale Subviews (wie bisher) |
| Rechnungen, Angebote, Projekte, Geschäftspartner | `onNavigate` auf `invoices`, `proposals`, `projects`, `partners` |

`VerkaufPage` und der Tab-Zweig `tab === "verkauf"` entfallen.

## Verwaltung

`VerwaltungPage` zeigt drei Kacheln. Dahinter steht **eine** Komponente
`PaperlessDocs({ thema, titel })`, dreimal mit anderem Tag instanziiert:

1. **Gefährdungsbeurteilungen** — führt auf die vorhandene `GbuPage` mit ihren
   drei Reitern. Deren Reiter *Grundlagen* liest künftig über `PaperlessDocs`.
2. **Wichtige Dokumente** — Gewerbeschein, Versicherungen, Verträge.
3. **Kletterzeug-Prüfprotokolle**.

Die Liste zeigt Titel, Dokumentdatum und „Gültig bis". Ist das Datum
überschritten, wird die Zeile rot markiert, liegt es weniger als 30 Tage in der
Zukunft, gelb — dieselbe Einstufung wie in `src/arbeitsschutz.js`, deshalb wird
die dortige Funktion mitbenutzt statt einer zweiten Rechnung. Antippen öffnet
das PDF im Viewer-Modal, das `GbuPage` bereits benutzt. Ein Button „Dokument
hochladen" öffnet die Dateiauswahl (Kamera oder Datei) und fragt optional ein
„Gültig bis"-Datum ab.

Rechte: Anzeige und Upload stehen allen angemeldeten Nutzern offen — wie beim
Reiter *Grundlagen*, der bewusst ohne `viewAllGbu`-Gate läuft.

## Stammdaten in Paperless

Am 2026-08-08 angelegt und auf die Hauskonvention gebracht
(`matching_algorithm 6`, der Klassifikator darf `Thema/*` lernen):

| Tag | ID | Farbe |
| --- | --- | --- |
| `Thema/Gefährdungsbeurteilung` | 192 | `#f59f00` |
| `Thema/Prüfprotokoll` | 193 | `#f59f00` |
| `Thema/Betriebsdokument` | 194 | `#43a047` |
| `Thema/Arbeitsschutz` | 195 | `#f59f00` |

Dazu Custom Field `Gültig bis`, Datentyp *Datum* (ID 1, das erste der Instanz),
Dokumenttyp `Gefährdungsbeurteilung` (ID 47) und das Dienstkonto `blattwerk-app`
(ID 6, kein Web-Login, nur Token). `Thema/Arbeitsschutz`, der Dokumenttyp und das
Konto stammen aus `docs/paperless-arbeitsschutz-einrichten.ps1` (Betriebs-Repo blattwerk-betrieb), das am
2026-08-08 durchgelaufen ist; seither steht `PAPERLESS_TOKEN` in Coolify.

Jedes abgelegte Dokument trägt `Bereich/Blattwerk` (Herkunftsachse, wird nie
geraten) plus den passenden `Thema/*`-Tag. Arbeitsschutz-Unterlagen tragen
zusätzlich `Thema/Arbeitsschutz`, damit sie im Archiv als solche auffindbar
bleiben. Gefiltert wird mit `tags__id__all`, also UND-verknüpft.

Die IDs stehen hier zur Orientierung — im Code werden die Tags über `plId()`
namentlich aufgelöst, wie es der vorhandene Paperless-Code schon tut.

Folge für „Wichtige Dokumente": Gewerbeschein und Versicherungspolicen, die
heute nur `Thema/Versicherung` oder `Thema/Vertrag` tragen, brauchen einmalig
zusätzlich `Thema/Betriebsdokument`. Die Dokument-API kann kein
„A UND (B ODER C)", und einmal nachtaggen ist billiger, als im Client zwei
Abfragen zusammenzuführen.

## Leserechte

Das Dienstkonto `blattwerk-app` bekommt aus dem Einrichtungsskript nur
`add_document` und `view_document`. Wegen der Objektrechte sieht es damit keines
der 143 vorhandenen Dokumente (nachgemessen: 0). Deshalb zusätzlich:

* Einmalig allen Dokumenten mit `Bereich/Blattwerk` ein `view`-Recht für
  `blattwerk-app` geben — `docs/paperless-blattwerk-freigeben.ps1` (Betriebs-Repo blattwerk-betrieb, Zwilling
  `.sh`). Rein additiv, prüft sich selbst mit Paperless' eigenem Filter und baut
  danach den Volltext-Index neu, weil `bulk_create` kein `post_save` auslöst und
  der Whoosh-Index die Leser sonst nicht kennt.
* Neue Uploads aus der App gehören dem Dienstkonto ohnehin.
* `Bereich/Privat` und `Bereich/Politik` bleiben für den App-Token unsichtbar —
  das ist der Grund, warum das Konto **kein** globales Leserecht bekommt.

**Die Freigabe ist eine Momentaufnahme, kein Filter.** Sie hängt an den einzelnen
Dokumenten, nicht am Schlagwort: Was später den Tag `Bereich/Blattwerk` bekommt
— eine Police aus der Mail-Regel, ein Scan aus der Paperless-Oberfläche —, bleibt
für die App unsichtbar, bis das Skript erneut läuft. Umgekehrt bleibt sichtbar,
was den Tag wieder verliert. Dauerhaft löst das ein Paperless-Workflow (Auslöser
*Dokument hinzugefügt*, Bedingung Tag `Bereich/Blattwerk`, Aktion *Berechtigungen
zuweisen* → `blattwerk-app`). Der gehört in die Umsetzung, sobald der erste
Fremd-Upload auftaucht; für den Start genügt die einmalige Freigabe.

## Neue Server-Endpunkte

Der Browser spricht Paperless nicht direkt an — der Token gehört nicht in den
Browser, und der öffentliche Hostname endet ohnehin in der Anmeldeseite.
`server.mjs` bekommt drei Endpunkte, die auf `plId()`/`plUpload()` aufsetzen:

| Endpunkt | Aufgabe | Paperless-Aufruf |
| --- | --- | --- |
| `GET /api/pl/list?thema=…` | Dokumente eines Themas | `GET /api/documents/?tags__id__all=<bereich>,<thema>&ordering=-created` |
| `GET /api/pl/file/:id` | PDF ausliefern | `GET /api/documents/<id>/download/` |
| `POST /api/pl/upload` | Datei ablegen | `plUpload()`, erweitert um `custom_fields` |

Kein Endpunkt nimmt Zugangsdaten entgegen — der Token kommt aus der
Server-Umgebung. Ist `plAktiv()` falsch, antworten alle drei mit einer
verständlichen Meldung statt mit einer leeren Liste, damit ein fehlendes Setup
nicht wie „keine Dokumente vorhanden" aussieht.

`plUpload()` wird um zwei Parameter erweitert: `customFields` (für „Gültig bis")
und `sha256`, damit die Duplikatprüfung denselben Weg nimmt.

## Duplikat-Schutz

Der vorhandene Mechanismus führt Buch über Dateinamen (`archiviert` im Store) —
das passt für die automatische Nachführung, nicht für einen Menschen, der eine
Datei zweimal auswählt. Für den Upload aus der App deshalb:

1. Der Browser liest die Datei und bildet den SHA256 über
   `crypto.subtle.digest("SHA-256", …)` — Bordmittel, keine neue Abhängigkeit.
2. `/api/pl/upload` fragt vorab `?checksum__iexact=<hash>` ab.
3. Bei Treffer wird nichts hochgeladen; die Antwort nennt Titel und ID des
   vorhandenen Dokuments, die App meldet „Liegt schon in Paperless: «Titel»"
   und bietet an, es zu öffnen.

Der Hash läuft über die Originaldatei — genau darüber bildet Paperless seinen
`checksum`. Paperless' eigene Prüfung beim Konsumieren bleibt als zweiter Riegel
für den Fall, daß zwei Geräte gleichzeitig dieselbe Datei schicken.

## Altbestand

Ein einmaliges Skript listet die vorhandenen PDFs aus
`Blattwerk/Gefährdungsbeurteilungen/<Jahr>/` und `Blattwerk/Arbeitsschutz/` über
WebDAV und legt sie mit den passenden Tags in Paperless ab. Es benutzt denselben
Checksummen-Weg wie der Upload, damit ein zweiter Lauf nichts doppelt anlegt.
Der Nextcloud-Ordner bleibt unangetastet liegen; gelöscht wird nichts.

## Nicht enthalten

* Bearbeiten oder Löschen von Paperless-Dokumenten aus der App.
* Volltextsuche — dafür ist die Paperless-Oberfläche da.
* Automatische Erinnerungen bei ablaufenden Dokumentfristen. Die Ampel in der
  Liste ist die erste Stufe; die vorhandene Erinnerungsmaschinerie aus
  `src/arbeitsschutz.js` kann später auf dasselbe Custom Field schauen.
* Ein Paperless-Workflow für Fremd-Uploads (siehe Leserechte).

## Tests

`vitest`, im Stil von `test/arbeitsschutz/`:

* Aufbau der Paperless-Query aus Themen-Namen (UND-Verknüpfung, Sortierung).
* Duplikatprüfung: Treffer blockt den Upload, leeres Ergebnis läßt durch.
* Fälligkeits-Einstufung über die vorhandene Funktion aus `src/arbeitsschutz.js`:
  überfällig / bald fällig / in Ordnung / kein Datum.
* Fehlendes `PAPERLESS_TOKEN` führt zu einer Meldung, nicht zu einer leeren Liste.

## Voraussetzungen vor der Umsetzung

1. ~~Einrichtungsskript~~ — am 2026-08-08 gelaufen (`.ps1`-Zwilling): Dienstkonto,
   Tag, Dokumenttyp, Token in Coolify, Neustart. Erledigt.
2. ~~Freigabe der 143 Dokumente~~ — am 2026-08-08 gesetzt und nachgemessen:
   143 Objektrechte, sichtbar 143 mit / 0 ohne `Bereich/Blattwerk`, Eigentümer
   unverändert, Volltext-Index neu gebaut. Erledigt.
3. Gewerbeschein und Versicherungspolicen einmalig zusätzlich mit
   `Thema/Betriebsdokument` versehen, sonst bleibt die Kachel „Wichtige
   Dokumente" leer. Kein Blocker für die Umsetzung.
