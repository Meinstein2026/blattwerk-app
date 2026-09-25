#!/usr/bin/env python3
# Korrektur-Gedächtnis der Beleg-Pipeline (state/learned.json):
# Wenn im Dolibarr-Entwurf vor der Freigabe etwas ändert (Artikel, Konto,
# Lieferant), merkt sich approve_server die endgültige Zuordnung. Der Finisher
# fragt diese Zuordnungen VOR dem Fuzzy-Match ab — Korrekturen werden zu Regeln.
import json
import os
import re

from common import STATE_DIR, log

PATH = os.path.join(STATE_DIR, "learned.json")


def norm(text):
    """Bezeichnungen robust normalisieren (Kleinschreibung, nur Wortzeichen)."""
    return " ".join(re.findall(r"[a-z0-9äöüß]+", (text or "").lower()))


def load():
    try:
        return json.load(open(PATH, encoding="utf-8"))
    except (OSError, ValueError):
        return {"artikel": {}, "lieferant": {}}


def save(data):
    tmp = PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, PATH)


def lookup_artikel(bez):
    """-> dict mit fk_product/label/fk_code_ventilation oder None."""
    return load()["artikel"].get(norm(bez))


def lookup_lieferant(name):
    """-> dict mit socid/name oder None."""
    return load()["lieferant"].get(norm(name))


def learn_artikel(bez, fk_product, label, fk_code_ventilation=None):
    key = norm(bez)
    if not key:
        return
    data = load()
    prev = data["artikel"].get(key)
    entry = {"fk_product": int(fk_product) if fk_product else None, "label": label,
             "fk_code_ventilation": fk_code_ventilation}
    if prev != entry:
        data["artikel"][key] = entry
        save(data)
        log(f"  gelernt: Artikel {key!r} -> {label} (Produkt {fk_product}, Konto-Vent. {fk_code_ventilation})")


def learn_lieferant(name, socid, final_name):
    key = norm(name)
    if not key:
        return
    data = load()
    entry = {"socid": int(socid), "name": final_name}
    if data["lieferant"].get(key) != entry:
        data["lieferant"][key] = entry
        save(data)
        log(f"  gelernt: Lieferant {key!r} -> {final_name} (socid {socid})")
