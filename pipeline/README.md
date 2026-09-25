# Blattwerk Beleg-Pipeline

Automatischer Weg vom Beleg-Foto zur gebuchten Dolibarr-Lieferantenrechnung —
mit Freigabe per Mail vor jeder Buchung.

## Ablauf

```
Nextcloud Blattwerk/Belege/  (Beleg einfach wie bisher hier ablegen)
        │
        ▼  producer.py  (Cron auf PH-S2-main .41, alle 15 Min)
Belege/_queue/pending/
        │
        ▼  worker.py    (Windows-Laptop, RTX 3060, Ollama-Vision — z. B. nachts)
Belege/_queue/extracted/<datei>.json     (Lieferant, Datum, Summe, Positionen)
        │
        ▼  finisher.py  (Cron auf .41)
Dolibarr-ENTWURF + Freigabe-Mail an Inhaber
        │
        ▼  Klick auf „Freigeben" in der Mail  (approve_server.py auf .41:8742)
Rechnung validiert + Zahlung gebucht + Beleg als Anhang + Datei → Belege/<Jahr>/<Monat>/
```

- **Ablehnen** in der Mail: Beleg wandert nach `_queue/rejected/`, der Dolibarr-
  Entwurf bleibt zum manuellen Korrigieren/Löschen stehen.
- **Ändern vor Freigabe:** In der Mail „In Dolibarr ansehen" → Entwurf anpassen
  (Konto, Positionen) → dann in der Mail freigeben. Gebucht wird der Entwurfs-Stand.
- Nicht lesbare Belege landen mit Fehlergrund in `_queue/failed/`.

### App-Scans / manuell angelegte Entwürfe

Der In-App-Scanner der Blattwerk-App legt Lieferantenrechnungs-ENTWÜRFE direkt
per Dolibarr-API an — an der Nextcloud-Pipeline vorbei. Der Finisher sammelt
deshalb zusätzlich alle Dolibarr-Entwürfe (Status 0) ein, die keine State-Datei
haben (= nicht von der Pipeline stammen), und schickt auch für sie eine
Freigabe-Mail (Quelle: „App-Scan", Beleg-Anhang wird aus Dolibarr geladen).
Schonfrist `APP_DRAFT_MIN_AGE_MIN` (Standard 30 Min), damit ein gerade in der
App bearbeiteter Entwurf nicht zu früh gemailt wird. Freigabe validiert nur
(kein Nextcloud-Einsortieren — der Beleg hängt bereits am Entwurf); Ablehnen
markiert nur den State, der Entwurf bleibt zum Korrigieren/Löschen stehen.
Pipeline-eigene Entwürfe erkennt der Sammler am Label-Zusatz „(Auto-Beleg)".

### Matrix-Raum „Blattwerk Belege" (optional)

Zusätzlich zur Mail postet der Finisher je Beleg EINE Matrix-Nachricht
(Element): das Beleg-Bild/PDF mit Kurzinfo als Caption und Link auf die
Freigaben-Seite der App (`APP_FREIGABE_URL`). Konfiguration `.env` →
`MATRIX_URL`/`MATRIX_TOKEN`/`MATRIX_ROOM` (leer = aus). Bot-Konto `@belege-bot`
liegt in MAS auf dem apps-Server:
`docker exec messenger-hub-mas-1 mas-cli manage issue-compatibility-token -c /data/config.yaml belege-bot`
erzeugt bei Bedarf ein neues Token. Der Raum ist unverschlüsselt (Bot nutzt die
einfache HTTP-API); Fehler beim Posten sind best effort und blockieren nie die Mail.

### Freigaben-Seite in der App (Eingang → Beleg-Freigaben, `#freigaben`)

Freigeben/Ablehnen/Bearbeiten läuft komplett in der Blattwerk-App — Dolibarr
muss dafür nicht mehr geöffnet werden. Der Approve-Server bietet dazu
`GET /pending` (offene States als JSON) und `fmt=json`-Antworten für
`/approve`/`/reject`; die App erreicht ihn über den `server.mjs`-Proxy
`/api/beleg/pending` + `/api/beleg/action` (`BELEG_APPROVE_BASE`, Standard
`http://203.0.113.41:8742`; Same-Origin-Guard gegen Cross-Origin-Zugriffe).
Entwürfe ohne Pipeline-State (frische App-Scans) validiert/löscht die Seite
direkt per Dolibarr-API. ⚠️ ufw auf .41 muss 8742 für das LAN erlauben
(`ufw allow from 203.0.113.0/24 to any port 8742 proto tcp`) — sonst kommt
weder der Proxy (.50) noch ein Heimnetz-Mail-Link durch, nur NetBird.

## Setup auf PH-S2-main (.41)

```bash
mkdir -p ~/beleg-pipeline && cd ~/beleg-pipeline
# Dateien aus pipeline/ hierher kopieren, dann:
cp .env.example .env && chmod 600 .env
# DOLI_KEY + SMTP_PASS in .env eintragen; Nextcloud-Zugang per Login-Flow:
python3 setup_login.py       # URL im Browser öffnen, anmelden, Zugriff gewähren

crontab -e   # ergänzen:
# */15 * * * * cd ~/beleg-pipeline && python3 producer.py >> pipeline.log 2>&1 && python3 finisher.py >> pipeline.log 2>&1
# * * * * * flock -n /tmp/beleg-approve.lock python3 ~/beleg-pipeline/approve_server.py >> ~/beleg-pipeline/approve.log 2>&1
```

## Setup auf dem Windows-Laptop (RTX 3060)

```powershell
# Voraussetzung: Ollama installiert (läuft dort schon für Hermes)
ollama pull qwen2.5vl:7b
pip install pillow pypdfium2
# Ordner mit worker.py + common.py + .env anlegen (nur NC_*/OLLAMA_* nötig)
python worker.py           # einmaliger Lauf — oder:
python worker.py --loop    # dauerhaft, prüft alle 5 Min
```

Als geplante Aufgabe (nachts): Aufgabenplanung → `python worker.py`, Trigger
z. B. täglich 02:00, „Aufgabe so schnell wie möglich nachholen" aktivieren.

Alternatives Modell bei schwacher Qualität: `gemma4:e4b` (läuft auf der 3060
gut) — in `.env` `OLLAMA_MODEL=gemma4:e4b` setzen.

## Warum der Worker nicht auf .41 läuft

Getestet 2026-07-16: gemma4:e2b/e4b brauchen 7–10 GiB RAM; PH-S2-main hat
11 GiB gesamt neben Dolibarr/Immich/Jellyfin und kein GPU — Anfragen liefen in
9+ Minuten ins Timeout (Swap-Thrashing). Vision-Inferenz gehört daher auf die
3060; sobald ein Server mit GPU/RAM bereitsteht, einfach dort `worker.py`
laufen lassen und in `.env` `OLLAMA_URL` anpassen — sonst ändert sich nichts.

## Buchungslogik

- Lieferant: Fuzzy-Match gegen bestehende Dolibarr-Lieferanten (≥ 0.75), sonst
  Neuanlage mit Auto-Code.
- Buchungskonto: Schlagwort-Regeln (SKR03) in `common.py` → `KONTO_RULES`,
  Fallback 4900 „Sonstige betriebliche Aufwendungen" (bewusst nicht 4985 —
  Ungeklärtes soll nicht in den Werkzeugen verschwinden). Nur Vorschlag; geändert
  wird er in der App unter Eingang → Beleg-Freigaben → Bearbeiten. `KONTO_RULES`
  muss identisch zu `DEFAULT_KONTO_REGELN` in `dolibarr-app.jsx` bleiben —
  `npm test` (`test/konto/regeln.test.js`) prüft das.
- Zahlung bei Freigabe: Zahlart „karte/lastschrift/überweisung" → Geschäftskonto
  (Volksbank, ID 1), „bar" → Kasse „Bargeld" (ID 5), Datum = Belegdatum.

## Extraktions-Dienst für die Finanzen-App (extract_server.py)

Synchroner HTTP-Wrapper um dieselbe Erkennung (`worker_ocr.extract`) — die
Finanzen-App schickt ein Belegfoto und bekommt das Beleg-JSON zurück. Kein
Nextcloud nötig, nur Ollama. `GET /health` (ohne Auth) + `POST /extract`
(Header `X-Auth-Token` = `.env`-Schlüssel `EXTRACT_TOKEN`), Port `EXTRACT_PORT`
(Standard 8743).

- **Windows-PC (RTX 3060):** läuft aus `C:\beleg-worker` (Sekunden pro Beleg).
  Autostart: geplante Aufgabe "Blattwerk Beleg-Extract" (siehe Finanzen-App-Doku).
- **.41 (CPU, Minuten pro Beleg):** `bash pipeline/deploy_extract_41.sh` (Betriebs-Repo blattwerk-betrieb) deployt
  Dienst + venv-Rest + Cron (flock, wie approve_server).
- Thinking-Modelle (Qwen3.x): `.env` `OLLAMA_THINK=false` setzen, sonst kommt
  mit `format:json` eine leere Antwort.
