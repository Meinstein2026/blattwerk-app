#!/usr/bin/env python3
# Producer (Cron auf dem Pipeline-Host, alle 15 Min):
# Sammelt lose Beleg-Dateien aus Nextcloud Blattwerk/Belege/ (Wurzel) ein und
# verschiebt sie in die Warteschlange _queue/pending/. Ordner (2025/, 2026/,
# Alte/, _queue/) und zu frische Dateien (< 5 Min, evtl. noch im Upload)
# bleiben unangetastet.
import json
import re
import urllib.parse
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from common import BELEG_EXTS, WebDav, http, load_env, log

MIN_AGE_SECONDS = 300


# ── Paperless-Bruecke (Spec 2026-09-23) ─────────────────────────────────────
# App-Uploads (Tag Quelle/App) wandern in die Warteschlange, wenn der Schalter
# „Beleg" gesetzt war (Tag Beleg/zur Buchhaltung) ODER Paperless sie als
# Kassenbeleg/Rechnung/Quittung einordnet (Failsafe). Danach Tag
# Pipeline/übergeben, damit nichts zweimal kommt. Mail-Belege aus finanzen@
# tragen kein Quelle/App und bleiben der Rechnungspipeline ueberlassen.
# Fehlen PL_BASE/PL_TOKEN in der .env, passiert nichts.
PL_TAG_QUELLE = "Quelle/App"
PL_TAG_BELEG = "Beleg/zur Buchhaltung"
PL_TAG_UEBERGEBEN = "Pipeline/übergeben"
PL_BELEG_TYPEN = ("Kassenbeleg", "Rechnung", "Quittung")


def _pl(cfg, method, pfad, body=None):
    kopf = {"Authorization": "Token " + cfg["PL_TOKEN"], "Accept": "application/json"}
    daten = None
    if body is not None:
        kopf["Content-Type"] = "application/json"
        daten = json.dumps(body).encode()
    status, roh, _ = http(method, cfg["PL_BASE"].rstrip("/") + pfad, headers=kopf, data=daten)
    return status, roh


def _pl_id(cfg, art, name):
    status, roh = _pl(cfg, "GET", f"/api/{art}/?name__iexact={urllib.parse.quote(name, safe='')}")
    if status != 200:
        raise RuntimeError(f"Paperless {art} '{name}': Status {status}")
    for x in json.loads(roh).get("results", []):
        if str(x.get("name", "")).lower() == name.lower():
            return x["id"]
    return None


def paperless_holen(cfg, dav):
    """Beleg-Kandidaten aus Paperless nach _queue/pending/ legen. Rueckgabe: Anzahl."""
    if not cfg.get("PL_BASE") or not cfg.get("PL_TOKEN"):
        return 0
    quelle = _pl_id(cfg, "tags", PL_TAG_QUELLE)
    uebergeben = _pl_id(cfg, "tags", PL_TAG_UEBERGEBEN)
    if not quelle or not uebergeben:
        raise RuntimeError(f"Paperless-Tags {PL_TAG_QUELLE} / {PL_TAG_UEBERGEBEN} fehlen")
    beleg = _pl_id(cfg, "tags", PL_TAG_BELEG)
    typen = [i for i in (_pl_id(cfg, "document_types", n) for n in PL_BELEG_TYPEN) if i]
    abfragen = []
    if beleg:
        abfragen.append(f"tags__id__all={quelle},{beleg}&tags__id__none={uebergeben}")
    if typen:
        abfragen.append(f"tags__id__all={quelle}&tags__id__none={uebergeben}"
                        f"&document_type__id__in={','.join(map(str, typen))}")
    gefunden = {}
    for q in abfragen:
        status, roh = _pl(cfg, "GET", f"/api/documents/?{q}&page_size=25")
        if status != 200:
            raise RuntimeError(f"Paperless-Dokumentabfrage: Status {status}")
        for d in json.loads(roh).get("results", []):
            gefunden[d["id"]] = d
    n = 0
    for doc_id in sorted(gefunden):
        d = gefunden[doc_id]
        status, roh = _pl(cfg, "GET", f"/api/documents/{doc_id}/download/?original=true")
        if status != 200:
            log(f"Paperless {doc_id}: Download Status {status}, naechster Lauf versucht es wieder")
            continue
        name = re.sub(r"[^\w.\-]+", "_", d.get("original_file_name") or f"{doc_id}.pdf")
        dav.put(f"_queue/pending/pl{doc_id}_{name}", roh)
        s, _ = _pl(cfg, "POST", "/api/documents/bulk_edit/",
                   {"documents": [doc_id], "method": "add_tag", "parameters": {"tag": uebergeben}})
        if s != 200:
            log(f"Paperless {doc_id}: Markieren fehlgeschlagen (Status {s}), kommt evtl. doppelt")
        log(f"aus Paperless eingereiht: {doc_id} {name}")
        n += 1
    return n


def main():
    cfg = load_env()
    dav = WebDav(cfg["NC_BASE"], cfg["NC_USER"], cfg["NC_PASS"], cfg.get("NC_ROOT", "Blattwerk/Belege"))
    dav.mkdirs("_queue/pending")
    dav.mkdirs("_queue/extracted")
    dav.mkdirs("_queue/failed")
    dav.mkdirs("_queue/rejected")

    now = datetime.now(timezone.utc)
    moved = 0
    try:
        moved += paperless_holen(cfg, dav)
    except Exception as e:  # ein Paperless-Ausfall darf die Nextcloud-Belege nicht aufhalten
        log(f"Paperless-Abholung fehlgeschlagen: {e}")
    for entry in dav.list("") or []:
        name = entry["name"]
        if entry["is_dir"] or name.startswith((".", "_")):
            continue
        ext = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if ext not in BELEG_EXTS:
            log(f"übersprungen (Format nicht unterstützt): {name}")
            continue
        try:
            age = (now - parsedate_to_datetime(entry["modified"])).total_seconds()
        except (TypeError, ValueError):
            age = MIN_AGE_SECONDS + 1
        if age < MIN_AGE_SECONDS:
            log(f"übersprungen (zu frisch, evtl. Upload läuft): {name}")
            continue
        dav.move(name, "_queue/pending/" + name)
        log(f"eingereiht: {name}")
        moved += 1
    log(f"Producer fertig — {moved} Beleg(e) eingereiht.")


if __name__ == "__main__":
    main()
