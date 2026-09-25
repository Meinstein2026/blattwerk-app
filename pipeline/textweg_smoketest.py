#!/usr/bin/env python3
"""Einmal-Prüfung des Textwegs der Belegerkennung (19.09.2026).

Seit dem 19.09. liest das große Modell auf dem Pipeline-Host auch die Textebene digitaler PDFs.
Der Pipeline-Host ist nachts aus, der Test kann also erst im Wachfenster laufen — deshalb als
Cron-Wiederholung: solange der Pipeline-Host schläft, bricht der Lauf still ab; beim ersten
erreichbaren Modell läuft der Test genau einmal, meldet das Ergebnis per ntfy und
legt eine Marke ab, damit er sich nicht wiederholt.
"""
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import common
import worker_ocr

HIER = Path(__file__).resolve().parent
MARKE = HIER / ".textweg-smoketest.erledigt"
NTFY = common.load_env().get("NTFY_URL", "https://ntfy.example.org/homelab-uptime")

# Erfundener Beleg mit genau den Fallen, an denen der alte Textweg gescheitert ist:
# Kundennummer neben der Bon-Nummer, Bestelldatum neben dem Rechnungsdatum,
# Gattungsbezeichnung ("Baumarkt") neben dem Firmennamen.
BELEGTEXT = """Globus Fachmaerkte GmbH & Co. KG - Ihr Baumarkt in Wetzlar
Kundennummer 4711    USt-IdNr. DE812345678
Bestelldatum 02.05.2026
Rechnungsdatum 26.05.2026        Bon-Nr. 365176
1 x Gartenduenger 20 kg                26,98
SUMME                                  26,98 EUR
enthaltene MwSt 19%                     4,31
Zahlart: EC-Karte
"""
SOLL = {"datum": "2026-05-26", "gesamt_brutto": 26.98, "belegnr": "365176"}


def ntfy(titel, text, prio="default", tag="receipt"):
    try:
        token = ""
        roh = subprocess.run(["sudo", "-n", "cat", "/etc/ssh-login-alert.env"],
                             capture_output=True, text=True, timeout=10).stdout
        for zeile in roh.splitlines():
            if zeile.startswith("NTFY_TOKEN="):
                token = zeile.split("=", 1)[1].strip()
        req = urllib.request.Request(NTFY, text.encode(), {
            "Title": titel, "Priority": prio, "Tags": tag,
            **({"Authorization": "Bearer " + token} if token else {})})
        urllib.request.urlopen(req, timeout=15).read()
    except Exception as e:                      # Meldung darf den Test nicht stürzen
        print(f"ntfy fehlgeschlagen: {e}", flush=True)


def modell_erreichbar(cfg):
    url = (cfg.get("TEXT_API_URL") or cfg.get("BILD_API_URL") or "").rstrip("/")
    if not url:
        return False
    try:
        with urllib.request.urlopen(url + "/models", timeout=8) as r:
            return r.status == 200
    except (urllib.error.URLError, OSError, TimeoutError):
        return False


def main():
    if MARKE.exists():
        return 0
    cfg = common.load_env()
    if not modell_erreichbar(cfg):
        print(f"{time.strftime('%F %T')} Modell nicht erreichbar (Pipeline-Host schläft?) — später erneut",
              flush=True)
        return 0

    t0 = time.time()
    prompt = worker_ocr.PROMPT_PDFTEXT.replace("{name}", "smoketest-globus.pdf") + BELEGTEXT
    try:
        res, modell = worker_ocr.text_llm(cfg, prompt)
    except Exception as e:
        MARKE.write_text(f"fehlgeschlagen {time.strftime('%F %T')}: {e}\n")
        ntfy("Belegerkennung: Textweg-Test fehlgeschlagen", f"Ausnahme: {e}", "high", "warning")
        return 1
    dauer = round(time.time() - t0, 1)
    res = worker_ocr.datum_normalisieren(res)

    abweichungen = []
    for feld, soll in SOLL.items():
        ist = res.get(feld)
        if feld == "gesamt_brutto":
            passt = abs(float(ist or 0) - soll) < 0.01
        else:
            passt = str(ist or "").strip() == soll
        if not passt:
            abweichungen.append(f"{feld}: {ist!r} statt {soll!r}")
    lief = str(res.get("lieferant") or "")
    if "globus" not in lief.lower():
        abweichungen.append(f"lieferant: {lief!r} enthält nicht 'Globus'")
    if lief.strip().lower() in ("baumarkt", "der baumarkt"):
        abweichungen.append("lieferant ist eine Gattungsbezeichnung")

    bericht = (f"Modell {modell}, {dauer}s\n"
               f"gelesen: {json.dumps(res, ensure_ascii=False)}\n")
    if abweichungen:
        bericht += "Abweichungen:\n- " + "\n- ".join(abweichungen)
        ntfy("Belegerkennung: Textweg liest falsch", bericht, "high", "warning")
    else:
        bericht += "alle Prüfpunkte (Datum, Bon-Nr. statt Kundennr., Summe, Händlername) korrekt"
        ntfy("Belegerkennung: Textweg über das große Modell OK", bericht, "default", "white_check_mark")
    print(bericht, flush=True)
    MARKE.write_text(("ok " if not abweichungen else "abweichungen ")
                     + time.strftime("%F %T") + "\n" + bericht + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
