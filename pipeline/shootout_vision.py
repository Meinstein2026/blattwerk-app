#!/usr/bin/env python3
# Bild-Shootout: Belegmodelle, die das Bild SELBST lesen (Nanonets-OCR & Co.),
# gegen den heutigen Weg (OCR-Engine + Textmodell ornith-9b).
#
# Läuft auf dem Pipeline-Host, wo die Modelle liegen:
#   python3 shootout_vision.py                      # alle aus MODELLE
#   python3 shootout_vision.py --nur <modell>
# Testbelege sind dieselben wie in shootout.py (gezeichnete Bons mit bekannten
# Sollwerten) — kein echter Beleg verlässt dafür das Haus.
import argparse
import json
import re
import time

from common import load_env, log
from shootout import bon_rewe, bon_tank, bon_toom_schief, check, jpeg_bytes
from worker import prepare_image
from worker_ocr import SCHEMA, extract, ollama

MODELLE = [
    "hf.co/mradermacher/Nanonets-OCR2-3B-GGUF:Q4_K_M",
    "hf.co/unsloth/Nanonets-OCR-s-GGUF:Q4_K_M",
    "qwen2.5vl:7b",
]

# SCHEMA enthält geschweifte Klammern — deshalb NICHT .format() benutzen,
# sonst stirbt der Lauf an KeyError '"lieferant"'.
PROMPT_BILD = ("""Du bist ein Belegleser für die Buchhaltung einer Garten-/Baumpflege-Firma.
Im Bild siehst du einen Beleg. Lies ihn vollständig und gib NUR gültiges JSON zurück
(kein Markdown, keine Erklärung):
""" + SCHEMA + "\n\nDateiname: ")


def json_aus(text):
    if isinstance(text, dict):   # ollama() gibt bei sauberem JSON schon ein dict zurück
        return text
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S)
    m = re.search(r"\{.*\}", text, flags=re.S)
    return json.loads(m.group(0)) if m else {}


def lauf_bild(cfg, modell, name, jpeg):
    roh = ollama(cfg, modell, PROMPT_BILD + name + "\n", images=[jpeg])
    return json_aus(roh)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nur", help="nur dieses Modell")
    ap.add_argument("--ohne-heute", action="store_true", help="den heutigen Weg nicht mitmessen")
    a = ap.parse_args()

    cfg = dict(load_env())
    cfg.setdefault("OLLAMA_URL", "http://127.0.0.1:11434")
    tests = [("rewe-bon", *bon_rewe()), ("toom-schief", *bon_toom_schief()), ("jet-tank", *bon_tank())]
    kandidaten = [m for m in MODELLE if not a.nur or m == a.nur]
    if not a.ohne_heute and not a.nur:
        kandidaten.append("HEUTE (OCR + ornith-9b-q4)")

    ergebnis = []
    for modell in kandidaten:
        print(f"\n=== {modell} ===", flush=True)
        zeit, fehler = 0.0, 0
        for name, im, soll in tests:
            jpeg = prepare_image(name + ".jpg", jpeg_bytes(im), max_px=int(cfg.get("BELEG_MAX_PX", "1568")))
            t0 = time.time()
            try:
                if modell.startswith("HEUTE"):
                    c = dict(cfg, OLLAMA_TEXT_MODEL="ornith-9b-q4", OLLAMA_THINK="false", TEXT_UEBER_API="false")
                    res, errors, _ = extract(c, name + ".jpg", jpeg)
                    probleme = check(res, soll) + [f"validate:{e}" for e in errors]
                else:
                    res = lauf_bild(cfg, modell, name + ".jpg", jpeg)
                    probleme = check(res, soll)
            except Exception as e:
                res, probleme = {}, [f"AUSNAHME {e}"]
            dt = time.time() - t0
            zeit += dt
            fehler += bool(probleme)
            print(f"  {name:12s} {dt:6.1f}s  " + ("OK" if not probleme else "FEHLER: " + "; ".join(probleme)), flush=True)
        ergebnis.append((modell, fehler, zeit))

    print("\n=== Ergebnis (Fehl-Belege | Gesamtzeit) ===")
    for modell, fehler, zeit in sorted(ergebnis, key=lambda r: (r[1], r[2])):
        print(f"  {modell:48s} {fehler}/{len(tests)} Fehler  {zeit:6.1f}s")


if __name__ == "__main__":
    main()
