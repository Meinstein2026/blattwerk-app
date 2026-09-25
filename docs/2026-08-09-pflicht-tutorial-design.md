# Verpflichtendes Übungs-Tutorial — Design

Stand: 2026-08-09

## Ziel

Wer die Blattwerk-App zum ersten Mal benutzt, arbeitet sich nicht durch sechs
Textkarten, sondern **übt die vier Handgriffe wirklich** — einmal Zeit buchen,
einmal eine Gefährdungsbeurteilung anlegen, einmal einen Beleg erfassen, einmal
Kunde und Projekt anlegen. Erst danach ist die App frei. Nichts davon entsteht
wirklich: die Übung läuft in nachgebauten Masken ohne Verbindung nach draußen.

## Ausgangslage

`AppTutorial` (um Zeile 2795) ist eine Diaschau: `TUTORIAL_STEPS` mit Symbol,
Überschrift und Text, Punktleiste, „Weiter" — und oben rechts „Überspringen".
Aufgerufen wird sie beim ersten Start und über Profil → `onShowTutorial`.
Gemerkt wird der Abschluss in `localStorage`, also pro Gerät.

Das bleibt als Einstieg erhalten (zwei, drei Karten zur Einordnung), danach
übernimmt die Übung.

## Entscheidungen

| Frage | Entscheidung |
| --- | --- |
| Wie echt? | **Nachgebaute Übungsmasken.** Kein Zugriff auf `api`, kein `fetch`. |
| Welche Abläufe? | Zeit buchen · Gefährdungsbeurteilung · Beleg erfassen · Kunde und Projekt |
| Wie verpflichtend? | **Pro Person**, zentral vermerkt — ein neues Handy macht es nicht erneut fällig |

Zur ersten Zeile: die Alternative wäre gewesen, die echten Masken mit
abgeklemmtem Schreibzugriff zu benutzen. Das fühlt sich echter an, aber ein
einziger übersehener Pfad legt eine Zeitbuchung, einen Beleg oder eine
Beurteilung wirklich an — in einem laufenden Betrieb, mit Belegen, die in die
Buchhaltung wandern. Der Nachbau kann das strukturell nicht.

## Aufbau der Übung

Vier Übungen, jede nach demselben Muster:

1. **Auftrag** — ein Satz, was zu tun ist („Buche zwei Stunden Baumpflege auf
   das Projekt Musterstraße 12").
2. **Nachgebaute Maske** — sieht aus wie das Original, gleiche Felder, gleiche
   Reihenfolge, gleiche Beschriftungen.
3. **Prüfung** — stimmt die Eingabe nicht, sagt die Übung *was* fehlt, nicht nur
   „falsch". Beliebig oft wiederholbar, kein Weiterkommen ohne Erfolg.
4. **Bestätigung** — kurz, was gerade passiert wäre („Die Buchung stünde jetzt
   in Dolibarr am Projekt und in deiner Wochenübersicht").

Übungsdaten sind offensichtlich erfunden: Kunde *Mustermann Grünanlagen GmbH*,
Projekt *Musterstraße 12*, Beispielbeleg als SVG-Zeichnung im Code
(`UEBUNG_BELEG` in `uebungen.js`, gezeichnet von `BelegZeichnung` in
`Tutorial.jsx`). Kein echter Kundenname, damit niemand glaubt, er hätte gerade
real gebucht.

## Bewusste Verkürzungen

Drei Stellen, an denen die Übung bewusst weniger tut als das Original:

* **Gefährdungsbeurteilung.** `UEBUNG_GBU_PUNKTE` prüft drei Punkte, die echte
  `GbuForm` (Checkliste in `src/gbu-data.js`) deutlich mehr. Die vollständige
  Liste nachzubauen hieße, `GbuForm` ein zweites Mal zu schreiben — und von da
  an bei jeder Änderung doppelt zu pflegen.
* **Beleg.** Gezeichnet statt fotografiert, ohne OpenCV und ohne
  Texterkennung. Beide Schritte können scheitern (Kamerarechte,
  Lichtverhältnisse, Erkennungsfehler) — ein Pflicht-Tutorial darf davon nicht
  abhängen, sonst sperrt ausgerechnet ein Kamera- oder OCR-Problem die App,
  aus einem Grund, der mit den geübten Handgriffen nichts zu tun hat.
* **Buchungskonto.** Die Beleg-Übung schreibt kein bestimmtes Konto vor.
  `pruefeBeleg` prüft nur, dass „4900 · ungeklärt" nicht stehen bleibt — welches
  Konto sonst richtig ist, hängt vom Gerät ab (`DEFAULT_KONTEN`, je Gerät
  anpassbar). Geübt wird „nachsehen und entscheiden", nicht eine feste Nummer.

## Pflicht, ohne jemanden auszusperren

Beim Start fragt die App zentral, ob die angemeldete Person das Tutorial in der
aktuellen Fassung abgeschlossen hat.

* **Abgeschlossen** → nichts passiert.
* **Offen und Server erreichbar** → Tutorial startet, **ohne** „Überspringen".
* **Offen, aber Server nicht erreichbar** → Tutorial wird angeboten, aber die App
  wird **nicht** gesperrt. Ein Monteur im Funkloch, der seine Zeit nicht buchen
  kann, weil ein Tutorial nicht laden konnte, wäre ein selbstgemachter Ausfall.
  Der Abschluss wird dann lokal vermerkt und beim nächsten Onlinegang nachgetragen.

Abbrechen ist möglich (App schließen), führt aber beim nächsten Start wieder
hierher. Nach Abschluss jederzeit über Profil wiederholbar.

### Fassungsnummer

`TUTORIAL_VERSION` (Zahl). Wird sie erhöht, ist das Tutorial für **alle** wieder
fällig. Das ist der Zweck: nach einem Umbau wie dem Verwaltungs-Reiter soll die
Mannschaft die neuen Handgriffe sehen, nicht bloß die Neuzugänge.

## Ablage des Abschlusses

Neue Datei in Nextcloud: `Blattwerk/App/tutorial.json`

```json
{ "version": 1, "abgeschlossen": { "<login>": { "am": "2026-08-09", "fassung": 1 } } }
```

Gelesen und geschrieben über zwei Endpunkte in `server.mjs`, nach dem Vorbild
von `/api/nc/einweisungen[/save]`: Schreiben mit `If-Match` und **additiv** —
zwei Geräte gleichzeitig dürfen sich nicht gegenseitig überschreiben. Dieselbe
Begründung wie dort: es ist ein Zustandsspeicher, kein Dokument.

Bewusst **nicht** in `einweisungen.json`: das ist der Nachweis nach § 12 Abs. 1
BetrSichV für Arbeitsmittel. Eine App-Einführung gehört fachlich nicht hinein,
und die Datei sollte nicht zum Sammelbecken werden.

Zwischenstand (welche Übung gerade läuft) liegt in `localStorage` — stürzt die
App ab, fängt man nicht wieder von vorn an.

## Dateien

| Datei | Rolle |
| --- | --- |
| `src/tutorial/uebungen.js` | **neu** — Aufträge, Prüfungen, Übungsdaten. Rein, ohne React, damit prüfbar. |
| `src/tutorial/Tutorial.jsx` | **neu** — Ablaufsteuerung und die vier nachgebauten Masken, inklusive des gezeichneten Beispielbelegs. |
| `dolibarr-app.jsx` | `AppTutorial` wird Einstieg + Übergabe; Startprüfung; Profil-Eintrag zum Wiederholen. |
| `server.mjs` | `POST /api/nc/tutorial` (lesen), `POST /api/nc/tutorial/save` (schreiben, additiv mit `If-Match`) |
| `test/tutorial/uebungen.test.js` | **neu** — Prüfungen, Hilfsfunktionen, Aufbau |
| `test/tutorial/ablage.test.js` | **neu** — `tutEintragen` (additiv) und die beiden Endpunkte |

Kein `public/uebung-beleg.jpg`: der Beispielbeleg ist keine Bilddatei, sondern
eine SVG-Zeichnung aus den Werten von `UEBUNG_BELEG` — kein Binärbild im
Repository (siehe „Bewusste Verkürzungen" oben).

Warum eigene Dateien und nicht wieder in `dolibarr-app.jsx`: die Datei ist
bereits rund 9000 Zeilen. Vier nachgebaute Masken plus Ablaufsteuerung wären
noch einmal reichlich, und sie hängen an nichts im Rest der Datei — das ist der
seltene Fall, in dem ein eigener Ordner keine Zerlegung um ihrer selbst willen
ist. Die Hausordnung „alles in einer Datei" bleibt für den Rest unangetastet.

## Nicht enthalten

* Auswertung, wer es wann gemacht hat (die Datei trägt es, eine Ansicht dafür
  gibt es nicht).
* Erinnerungsmails an Leute mit offenem Tutorial.
* Kamera und Texterkennung in der Beleg-Übung.
* Übersetzungen.

## Tests

`vitest`, im Stil von `test/arbeitsschutz/`, in zwei Dateien:

* `test/tutorial/uebungen.test.js` — jede Prüfung sagt bei falscher Eingabe
  **welches** Feld fehlt, nicht nur „falsch" (zu jedem Ablehnungs-Zweig ein
  Testfall mit falscher Eingabe); korrekte Eingaben werden auch mit Komma statt
  Punkt angenommen; die vier Übungen stehen in fester Reihenfolge; die
  Fassungsnummer ist eine positive Ganzzahl.
* `test/tutorial/ablage.test.js` — `tutEintragen` ist additiv (zwei Personen
  in derselben Datei löschen sich nicht, der eigene alte Eintrag wird auf die
  neue Fassung gehoben); der Schreib-Endpunkt prüft `assertBlattwerk` **vor**
  der `MKCOL`-Kette und schreibt mit `If-Match`.

Nicht getestet: dass eine erhöhte Fassungsnummer die Übung an einem laufenden
Gerät wieder auslöst. Das steckt in der Startprüfung in `dolibarr-app.jsx`
(React-State) — dafür gibt es hier keine Komponententests.

## Identität des Abschlusses

Ursprünglich offen: der Abschluss steht in Nextcloud, aber Personen ohne
eigenen Nextcloud-Login arbeiten über das gemeinsame Dienstkonto des
Team-Kalenders — der Nextcloud-Login ist dort für alle gleich und taugt nicht
als Schlüssel.

Gelöst: Schlüssel ist `me.login`, der Dolibarr-Login der angemeldeten Person
(`getCurrentUserWithGroups()`), nicht der Nextcloud-Login. Dolibarr kennt jede
Person einzeln, unabhängig davon, unter welchem Nextcloud-Konto das Gerät
schreibt — der Abschluss bleibt damit auch am gemeinsamen Dienstkonto eindeutig
pro Person.
