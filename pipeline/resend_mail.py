#!/usr/bin/env python3
# Schickt die Freigabe-Mail für einen bereits verarbeiteten Beleg erneut
# (neues Format: Anhang + Ändern-Button). Aufruf: python3 resend_mail.py <state-name>
import json
import sys

from common import Dolibarr, WebDav, load_env
from finisher import send_mail

name = sys.argv[1] if len(sys.argv) > 1 else "JET_Tanken_2026-07-17.jpg"
cfg = load_env()
state = json.load(open(f"state/{name}.state.json"))
doli = Dolibarr(cfg["DOLI_BASE"], cfg["DOLI_KEY"])
inv = doli.get("/supplierinvoices/{}".format(state["invoice_id"]))
dav = WebDav(cfg["NC_BASE"], cfg["NC_USER"], cfg["NC_PASS"], cfg.get("NC_ROOT", "Blattwerk/Belege"))
try:
    datei = dav.get("_queue/pending/" + state["name"])
except Exception as e:
    print("Anhang nicht ladbar:", e)
    datei = None
send_mail(cfg, [{"name": state["name"], "res": state["res"],
                 "invoice_id": state["invoice_id"], "ref": state["ref"],
                 "total_ttc": float(inv["total_ttc"]), "token": state["token"],
                 "new_supplier": False, "datei_bytes": datei}])
print("Mail erneut verschickt an", cfg["MAIL_TO"], "| Anhang:", "ja" if datei else "NEIN")
