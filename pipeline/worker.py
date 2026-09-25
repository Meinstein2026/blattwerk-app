#!/usr/bin/env python3
# Worker (läuft auf dem Windows-Laptop mit RTX 3060 + Ollama):
# Holt Belege aus Nextcloud _queue/pending/, liest sie mit einem lokalen
# Vision-Modell aus und legt das Ergebnis als JSON in _queue/extracted/ ab.
# Läuft gut als geplante Aufgabe (z. B. nachts stündlich) oder mit --loop.
#
# Abhängigkeiten:  pip install pillow pypdfium2
# Modell:          ollama pull qwen2.5vl:7b   (Standard, passt in 12 GB VRAM)
import base64
import io
import json
import re
import sys
import time
import urllib.request
from datetime import datetime

from common import WebDav, load_env, log

PROMPT = """Du bist ein Belegleser für die Buchhaltung einer Garten-/Baumpflege-Firma.
Lies den Beleg im Bild sorgfältig und gib NUR gültiges JSON zurück (kein Markdown):
{
 "lieferant": "Name des Händlers/Ausstellers",
 "datum": "YYYY-MM-DD",
 "gesamt_brutto": 0.00,
 "mwst_satz": 19,
 "belegnr": "Beleg-/Rechnungsnummer oder leer",
 "zahlart": "karte|bar|lastschrift|überweisung|unbekannt",
 "positionen": [{"bezeichnung": "...", "menge": 1, "gesamt_brutto": 0.00}]
}
Regeln: Beträge als Zahl mit Punkt (32.90). Datum vom Beleg, nicht heute.
Wenn nur eine Gesamtsumme erkennbar ist, genau eine Position mit dieser Summe.
Rabatte/Gutschriften/Pfand-Rückgabe als EIGENE Position mit NEGATIVEM Betrag
aufnehmen (z. B. "Kundenkarten-Rabatt", menge 1, gesamt_brutto -1.00), nicht
weglassen — die Summe aller Positionen (inkl. negativer) muss gesamt_brutto ergeben.
Nimm NUR Beträge auf, die wörtlich auf dem Beleg stehen — niemals Beträge erfinden
oder schätzen. Versandkosten "inklusive"/"kostenlos"/0,00 sind KEINE Position.
mwst_satz 7 oder 19."""


def pdf_to_image(data):
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(data)
    page = pdf[0]
    bitmap = page.render(scale=2.0)
    return bitmap.to_pil()


def prepare_image(name, data, max_px=1568):
    from PIL import Image
    if name.lower().endswith(".pdf"):
        im = pdf_to_image(data)
    else:
        im = Image.open(io.BytesIO(data))
    im = im.convert("RGB")
    im.thumbnail((max_px, max_px))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=90)
    return buf.getvalue()


def ollama_extract(cfg, jpeg_bytes):
    options = {"temperature": 0, "num_ctx": 4096}
    if cfg.get("OLLAMA_THREADS"):  # CPU-Inferenz: Threads erzwingen (GPU: irrelevant)
        options["num_thread"] = int(cfg["OLLAMA_THREADS"])
    payload = {
        "model": cfg.get("OLLAMA_MODEL", "qwen2.5vl:7b"),
        "prompt": PROMPT,
        "images": [base64.b64encode(jpeg_bytes).decode()],
        "stream": False,
        "format": "json",
        "options": options,
    }
    url = cfg.get("OLLAMA_URL", "http://localhost:11434").rstrip("/") + "/api/generate"
    req = urllib.request.Request(url, json.dumps(payload).encode(),
                                 {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=int(cfg.get("OLLAMA_TIMEOUT", "900"))) as r:
        return json.loads(json.load(r)["response"])


def validate(res):
    errors = []
    if not res.get("lieferant"):
        errors.append("lieferant fehlt")
    try:
        d = datetime.strptime(res.get("datum", ""), "%Y-%m-%d")
        # Ein Beleg aus der Zukunft ist immer ein Lesefehler. Am 18.09.2026 machte
        # das Bildmodell aus dem Amazon-Rechnungsdatum 29.03. ein 20.08. — ohne
        # diese Schranke wäre der Beleg mit falschem Datum durchgelaufen.
        if d > datetime.now():
            errors.append(f"datum liegt in der Zukunft: {res.get('datum')}")
    except ValueError:
        errors.append(f"datum unlesbar: {res.get('datum')!r}")
    try:
        total = float(res.get("gesamt_brutto", 0))
        if total <= 0:
            errors.append("gesamt_brutto <= 0")
    except (TypeError, ValueError):
        errors.append("gesamt_brutto keine Zahl")
        total = 0
    positionen = res.get("positionen") or []
    if not positionen:
        errors.append("keine positionen")
    try:
        psum = sum(float(p.get("gesamt_brutto", 0)) for p in positionen)
        if total and abs(psum - total) > 0.05:
            res["warnung_summe"] = f"Positionssumme {psum:.2f} ≠ Gesamt {total:.2f}"
    except (TypeError, ValueError):
        errors.append("positionsbeträge keine Zahlen")
    if res.get("mwst_satz") not in (7, 19):
        res["mwst_satz"] = 19
    return errors


def run_once(cfg, dav):
    done = {e["name"] for e in dav.list("_queue/extracted") or []}
    failed = {e["name"] for e in dav.list("_queue/failed") or []}
    count = 0
    for entry in dav.list("_queue/pending") or []:
        name = entry["name"]
        if entry["is_dir"] or name + ".json" in done or name + ".json" in failed:
            continue
        log(f"verarbeite: {name}")
        try:
            data = dav.get("_queue/pending/" + name)
            jpeg = prepare_image(name, data, max_px=int(cfg.get("BELEG_MAX_PX", "1568")))
            t0 = time.time()
            res = ollama_extract(cfg, jpeg)
            res["_datei"] = name
            res["_modell"] = cfg.get("OLLAMA_MODEL", "qwen2.5vl:7b")
            res["_dauer_s"] = round(time.time() - t0, 1)
            errors = validate(res)
            if errors:
                res["_fehler"] = errors
                dav.put("_queue/failed/" + name + ".json",
                        json.dumps(res, ensure_ascii=False, indent=1).encode())
                log(f"  -> FEHLER: {errors}")
            else:
                dav.put("_queue/extracted/" + name + ".json",
                        json.dumps(res, ensure_ascii=False, indent=1).encode())
                log(f"  -> ok: {res['lieferant']} {res['datum']} {res['gesamt_brutto']} € ({res['_dauer_s']}s)")
            count += 1
        except Exception as e:  # ein kaputter Beleg soll den Lauf nicht stoppen
            log(f"  -> Ausnahme bei {name}: {e}")
    return count


def main():
    cfg = load_env()
    dav = WebDav(cfg["NC_BASE"], cfg["NC_USER"], cfg["NC_PASS"], cfg.get("NC_ROOT", "Blattwerk/Belege"))
    if "--loop" in sys.argv:
        while True:
            run_once(cfg, dav)
            time.sleep(int(cfg.get("WORKER_INTERVAL", "300")))
    else:
        n = run_once(cfg, dav)
        log(f"Worker fertig — {n} Beleg(e) verarbeitet.")


if __name__ == "__main__":
    main()
