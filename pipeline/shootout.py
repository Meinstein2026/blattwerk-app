#!/usr/bin/env python3
# Modell-Shootout für die Beleg-Extraktion: fährt extract() aus worker_ocr.py
# mit mehreren Ollama-Modellen über dieselben Testbelege und vergleicht
# Korrektheit (Summe/Datum/Lieferant) und Laufzeit.
#
#   python shootout.py                 # alle Modelle aus MODELS
#   python shootout.py ornith-9b-q4    # nur eines
import io
import json
import sys
import time

from PIL import Image, ImageDraw, ImageFont

from common import load_env
from worker import prepare_image
from worker_ocr import extract

MODELS = [
    # (modellname, think:false nötig?)
    ("ornith-9b-q4", False),           # amtierender Shootout-Sieger von .41
    ("qwen3.6:35b-a3b", True),         # MoE, 3B aktiv — Kandidat des Inhabers
    ("gemma4-e4b-64k", False),         # lief laut Blattwerk-Doku gut auf 3060
    ("qwen3.5-claude-64k", True),      # 9B-Klasse, thinking
]


def font(size, bold=False):
    try:
        return ImageFont.truetype(f"C:/Windows/Fonts/consola{'b' if bold else ''}.ttf", size)
    except Exception:
        return None


def bon_rewe():
    im = Image.new("RGB", (600, 800), "white")
    d = ImageDraw.Draw(im)
    d.text((300, 40), "REWE Markt GmbH", fill="black", font=font(34, True), anchor="mm")
    d.text((300, 80), "Musterstrasse 12, 35390 Giessen", fill="black", font=font(24), anchor="mm")
    rows = ["Milch 1,5%              1,09", "Brot Vollkorn           2,49",
            "Kaese Gouda            13,41", "", "SUMME EUR              16,99",
            "Girocard               16,99", "", "Datum: 15.07.2026 14:32",
            "MwSt 19%      2,71     16,99"]
    for i, r in enumerate(rows):
        d.text((60, 180 + i * 40), r, fill="black", font=font(30 if "SUMME" in r else 26, "SUMME" in r))
    return im, {"gesamt_brutto": 16.99, "datum": "2026-07-15", "lieferant": "rewe"}


def bon_toom_schief():
    # schief fotografierter Bon auf dunklem Hintergrund (wie ein echtes Handyfoto)
    base = Image.new("RGB", (500, 700), "white")
    d = ImageDraw.Draw(base)
    d.text((250, 40), "toom Baumarkt", fill="black", font=font(30, True), anchor="mm")
    rows = ["Blumenerde 40L          7,99", "Handschuhe Gr.9         4,49",
            "", "SUMME                  12,48", "BAR                    20,00",
            "Rueckgeld               7,52", "", "16.07.2026  09:12"]
    for i, r in enumerate(rows):
        d.text((40, 140 + i * 45), r, fill="black", font=font(28 if "SUMME" in r else 24, "SUMME" in r))
    im = Image.new("RGB", (700, 900), (60, 60, 60))
    im.paste(base.rotate(4, expand=True, fillcolor=(60, 60, 60)), (60, 60))
    return im, {"gesamt_brutto": 12.48, "datum": "2026-07-16", "lieferant": "toom"}


def bon_tank():
    im = Image.new("RGB", (600, 750), "white")
    d = ImageDraw.Draw(im)
    d.text((300, 40), "JET Tankstelle 0374", fill="black", font=font(32, True), anchor="mm")
    d.text((300, 80), "Frankfurter Str. 90, Giessen", fill="black", font=font(22), anchor="mm")
    rows = ["Super E10", "31,540 Liter x 1,632 EUR/L", "", "Summe EUR          51,48",
            "girocard           51,48", "", "MwSt 19%   8,22 netto 43,26", "17.07.2026 18:03  Bon 4711"]
    for i, r in enumerate(rows):
        d.text((60, 160 + i * 45), r, fill="black", font=font(30 if "Summe" in r else 26, "Summe" in r))
    return im, {"gesamt_brutto": 51.48, "datum": "2026-07-17", "lieferant": "jet", "liter": 31.54}


def jpeg_bytes(im):
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=90)
    return buf.getvalue()


def check(res, exp):
    errs = []
    if abs(float(res.get("gesamt_brutto") or 0) - exp["gesamt_brutto"]) > 0.005:
        errs.append(f"summe {res.get('gesamt_brutto')}!={exp['gesamt_brutto']}")
    if res.get("datum") != exp["datum"]:
        errs.append(f"datum {res.get('datum')}!={exp['datum']}")
    if exp["lieferant"] not in (res.get("lieferant") or "").lower():
        errs.append(f"lieferant '{res.get('lieferant')}'")
    if "liter" in exp:
        mengen = [float(p.get("menge") or 0) for p in res.get("positionen") or []]
        if not any(abs(m - exp["liter"]) < 0.01 for m in mengen):
            errs.append(f"liter {mengen}!={exp['liter']}")
    return errs


def main():
    cfg = load_env()
    only = sys.argv[1] if len(sys.argv) > 1 else None
    tests = [("rewe-bon", *bon_rewe()), ("toom-schief", *bon_toom_schief()), ("jet-tank", *bon_tank())]
    results = []
    for model, think_off in MODELS:
        if only and model != only:
            continue
        c = dict(cfg)
        c["OLLAMA_TEXT_MODEL"] = model
        c["TEXT_UEBER_API"] = "false"   # im Vergleich soll genau DIESES Modell lesen
        c["OLLAMA_THINK"] = "false" if think_off else ""
        print(f"\n=== {model} ===", flush=True)
        total_t, fails = 0.0, 0
        for name, im, exp in tests:
            jpeg = prepare_image(name + ".jpg", jpeg_bytes(im), max_px=int(c.get("BELEG_MAX_PX", "1568")))
            t0 = time.time()
            try:
                res, errors, _ = extract(c, name + ".jpg", jpeg)
                dt = time.time() - t0
                errs = check(res, exp) + [f"validate:{e}" for e in errors]
            except Exception as e:
                dt = time.time() - t0
                res, errs = {}, [f"EXCEPTION {e}"]
            total_t += dt
            fails += bool(errs)
            print(f"  {name:12s} {dt:6.1f}s  {'OK' if not errs else 'FEHLER: ' + '; '.join(errs)}", flush=True)
        results.append((model, fails, total_t))
    print("\n=== Ergebnis (Fehl-Belege | Gesamtzeit) ===")
    for model, fails, t in sorted(results, key=lambda r: (r[1], r[2])):
        print(f"  {model:22s} {fails}/{len(tests)} Fehler  {t:6.1f}s")


if __name__ == "__main__":
    main()
