#!/usr/bin/env python3
# Freigabe-Server (läuft dauerhaft auf dem Pipeline-Host, Port 8742, nur LAN/VPN):
# Nimmt die Klicks aus der Freigabe-Mail entgegen.
#   /approve?t=TOKEN → Rechnung validieren, Zahlung buchen, Original-Beleg als
#                      Anhang hochladen und in Belege/<Jahr>/<Monat>/ einsortieren
#   /reject?t=TOKEN  → Beleg nach _queue/rejected/ verschieben, Entwurf bleibt
#                      als Entwurf in Dolibarr stehen (manuell löschen/ändern)
# Die Verarbeitung läuft im HINTERGRUND: der Klick bekommt sofort eine Mini-
# Antwort, die das Browserfenster selbst schließt; schlägt die Aktion fehl,
# geht eine Fehler-Mail raus und der Beleg steht wieder auf "review".
import base64
import json
import os
import smtplib
import threading
import time
from datetime import datetime
from email.mime.text import MIMEText
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

import learned
from common import (GERMAN_MONTHS, STATE_DIR, Dolibarr, WebDav, ZAHLART_MAP,
                    load_env, log, save_state)


def learn_from_final(doli, inv, res):
    """Der freigegebene Entwurf ist die Wahrheit: Zuordnungen (Lieferant,
    Artikel, Konto) aus dem finalen Stand merken — Korrekturen werden Regeln."""
    try:
        if inv.get("socid") and res.get("lieferant"):
            sup = doli.get(f"/thirdparties/{inv['socid']}")
            learned.learn_lieferant(res["lieferant"], inv["socid"], sup.get("name") or res["lieferant"])
        lines = inv.get("lines") or []
        pos = res.get("positionen") or []
        if lines and len(lines) == len(pos):
            for line, p in zip(lines, pos):
                fk = line.get("fk_product")
                if not fk:
                    continue
                label = line.get("product_label") or line.get("product_ref")
                learned.learn_artikel(p.get("bezeichnung") or "", fk, label,
                                      line.get("fk_code_ventilation"))
    except Exception as e:  # Lernen darf die Buchung nie blockieren
        log(f"  Lern-Schritt übersprungen: {e}")

cfg = load_env()


def find_state_by_token(token):
    for fn in os.listdir(STATE_DIR) if os.path.isdir(STATE_DIR) else []:
        if not fn.endswith(".state.json"):
            continue
        try:
            st = json.load(open(os.path.join(STATE_DIR, fn), encoding="utf-8"))
        except (ValueError, OSError):
            continue  # eine kaputte Datei darf nicht alle Klicks blockieren
        if st.get("token") == token:
            return st
    return None


def approve(st):
    dav = WebDav(cfg["NC_BASE"], cfg["NC_USER"], cfg["NC_PASS"], cfg.get("NC_ROOT", "Blattwerk/Belege"))
    doli = Dolibarr(cfg["DOLI_BASE"], cfg["DOLI_KEY"])
    inv_id, name, res = st["invoice_id"], st["name"], st["res"]

    is_app = st.get("source") == "app"
    inv = doli.get(f"/supplierinvoices/{inv_id}")
    learn_from_final(doli, inv, res)  # finaler Entwurfsstand = korrigierte Wahrheit
    inv_status = inv.get("statut") if inv.get("statut") is not None else inv.get("status")
    if str(inv_status) == "0":
        doli.post(f"/supplierinvoices/{inv_id}/validate", {})
        inv = doli.get(f"/supplierinvoices/{inv_id}")

    # Zahlung wird NICHT mehr automatisch gebucht (Vorgabe Inhaber 22.07.2026): Freigabe
    # heißt nur validieren -> Rechnung steht auf "Offen"; die Zahlung wird beim
    # Bankabgleich bzw. manuell gebucht. Altes Verhalten per ENV AUTO_PAYMENT=1.
    # App-Entwürfe nie auto-bezahlen: ihre Zahlart ist unbekannt ("?"), der
    # Default würde sonst pauschal als Kartenzahlung buchen.
    zahlung_gebucht = False
    if cfg.get("AUTO_PAYMENT") == "1" and str(inv.get("paye")) != "1" and not is_app:
        mode, account = ZAHLART_MAP.get((res.get("zahlart") or "").lower(), (6, 1))
        date_epoch = int(time.mktime(datetime.strptime(res["datum"], "%Y-%m-%d").timetuple()))
        doli.post(f"/supplierinvoices/{inv_id}/payments", {
            "datepaye": date_epoch, "amount": float(inv["total_ttc"]),
            "payment_mode_id": mode, "closepaidinvoices": "yes", "accountid": account})
        zahlung_gebucht = True

    # Original-Beleg als Anhang — nur falls der Finisher ihn nicht schon am
    # Entwurf angehängt hat (Dolibarr nimmt Anhänge beim Validieren mit).
    if not st.get("beleg_attached"):
        data = dav.get("_queue/pending/" + name)
        doli.post("/documents/upload", {
            "filename": name, "modulepart": "facture_fournisseur", "ref": inv["ref"],
            "filecontent": base64.b64encode(data).decode(), "fileencoding": "base64",
            "overwriteifexists": 0})

    # Einsortieren nach Belege/<Jahr>/<Monat>/ — nur für Pipeline-Belege;
    # bei App-Scans gibt es keine Nextcloud-Datei, der Beleg hängt am Entwurf.
    if is_app:
        beleg_text = "App-Scan: Beleg hängt am Dolibarr-Entwurf."
    else:
        d = datetime.strptime(res["datum"], "%Y-%m-%d")
        target_dir = f"{d.year}/{GERMAN_MONTHS[d.month - 1]}"
        dav.mkdirs(target_dir)
        dav.move("_queue/pending/" + name, f"{target_dir}/{name}")
        dav.delete("_queue/extracted/" + name + ".json")
        beleg_text = f"Beleg einsortiert nach Belege/{target_dir}/."

    st["status"] = "booked"
    st["ref"] = inv["ref"]
    st["booked_at"] = datetime.now().isoformat(timespec="seconds")
    save_state(name, st)
    zahlungstext = "Zahlung gebucht" if zahlung_gebucht else "Rechnung steht auf OFFEN (Zahlung beim Bankabgleich buchen)"
    return (f"Validiert: {inv['ref']} — {res['lieferant']} {float(inv['total_ttc']):.2f} €. "
            f"{zahlungstext}. {beleg_text}")


def delete_draft(st):
    """Abgelehnten Dolibarr-ENTWURF wegräumen (Vorgabe Inhaber 2026-08-04): Korrigieren
    läuft über „Bearbeiten" in der Freigaben-Seite, ein abgelehnter Beleg soll
    nichts liegen lassen — sonst taucht der Entwurf dort wieder auf. Validierte
    Rechnungen (Status ≠ 0) bleiben unangetastet."""
    inv_id = st.get("invoice_id")
    if not inv_id:
        return "kein Entwurf verknüpft"
    doli = Dolibarr(cfg["DOLI_BASE"], cfg["DOLI_KEY"])
    inv = doli.get(f"/supplierinvoices/{inv_id}")
    status = inv.get("statut") if inv.get("statut") is not None else inv.get("status")
    if str(status) != "0":
        return f"Entwurf {st.get('ref')} ist schon validiert — bleibt unangetastet"
    doli.call("DELETE", f"/supplierinvoices/{inv_id}", ok=(200, 201, 204))
    return f"Entwurf {st.get('ref')} gelöscht"


def reject(st):
    name = st["name"]
    # Entwurf zuerst wegräumen; scheitert das, bleibt die Ablehnung trotzdem
    # gültig (der Beleg wandert weg) — der Grund steht dann in der Rückmeldung.
    try:
        entwurf = delete_draft(st)
    except Exception as e:
        entwurf = f"Entwurf {st.get('ref')} konnte NICHT gelöscht werden ({e}) — bitte in Dolibarr prüfen"
        log(f"  {entwurf}")
    if st.get("source") == "app":  # kein Nextcloud-Beleg vorhanden
        st["status"] = "rejected"
        save_state(name, st)
        return f"Abgelehnt (App-Scan): {entwurf}."
    dav = WebDav(cfg["NC_BASE"], cfg["NC_USER"], cfg["NC_PASS"], cfg.get("NC_ROOT", "Blattwerk/Belege"))
    if dav.exists("_queue/pending/" + name):
        dav.move("_queue/pending/" + name, "_queue/rejected/" + name)
    if dav.exists("_queue/extracted/" + name + ".json"):
        dav.move("_queue/extracted/" + name + ".json", "_queue/rejected/" + name + ".json")
    st["status"] = "rejected"
    save_state(name, st)
    return f"Abgelehnt: {name}. {entwurf}, Beleg liegt in _queue/rejected/."


def fehler_mail(st, action, err):
    aktion = "Freigabe" if action == "approve" else "Ablehnung"
    html = (f"<html><body style='font-family:sans-serif'>"
            f"<h3>⚠ {aktion} fehlgeschlagen: {st['res'].get('lieferant', '?')} — {st['name']}</h3>"
            f"<p>Fehler: {err}</p>"
            f"<p>Der Beleg steht wieder auf „review“ — in der ursprünglichen Freigabe-Mail "
            f"einfach erneut klicken, oder den Entwurf {st.get('ref', '')} in Dolibarr prüfen.</p>"
            f"</body></html>")
    msg = MIMEText(html, "html", "utf-8")
    msg["Subject"] = f"[Blattwerk] {aktion} fehlgeschlagen: {st['name']}"
    msg["From"] = cfg["MAIL_FROM"]
    msg["To"] = cfg["MAIL_TO"]
    with smtplib.SMTP_SSL(cfg["SMTP_HOST"], int(cfg.get("SMTP_PORT", "465")), timeout=30) as s:
        s.login(cfg["SMTP_USER"], cfg["SMTP_PASS"])
        s.send_message(msg)


def run_action(st, action):
    # Läuft im Hintergrund-Thread: der Mail-Klick wartet nicht auf Dolibarr/WebDAV.
    try:
        msg = approve(st) if action == "approve" else reject(st)
        st.pop("action_started", None)
        save_state(st["name"], st)
        log(f"OK ({action}, Hintergrund) {st['name']}: {msg}")
    except Exception as e:
        log(f"Fehler bei {action} {st['name']}: {e}")
        st["status"] = "review"  # Link bleibt gültig für erneuten Versuch
        st.pop("action_started", None)
        save_state(st["name"], st)
        try:
            fehler_mail(st, action, e)
        except Exception as e2:
            log(f"Fehler-Mail fehlgeschlagen: {e2}")


def pending_states():
    """Alle offenen Freigaben (status=review) — Datengrundlage für die
    Freigaben-Seite der Blattwerk-App (via server.mjs-Proxy)."""
    out = []
    for fn in sorted(os.listdir(STATE_DIR)) if os.path.isdir(STATE_DIR) else []:
        if not fn.endswith(".state.json"):
            continue
        try:
            st = json.load(open(os.path.join(STATE_DIR, fn), encoding="utf-8"))
        except (ValueError, OSError):
            continue
        if st.get("status") not in ("review", "approving", "rejecting"):
            continue
        out.append({"invoice_id": st.get("invoice_id"), "ref": st.get("ref"),
                    "token": st.get("token"), "status": st.get("status"),
                    "source": st.get("source") or "pipeline", "name": st.get("name"),
                    "res": st.get("res"), "created": st.get("created")})
    return out


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(body)

    def _html(self, code, text, close=False):
        # close=True: Aktion läuft im Hintergrund — Fenster schließt sich selbst
        # (klappt bei frisch aus der Mail geöffneten Tabs; sonst bleibt der Hinweis).
        script = "<script>setTimeout(function(){window.close()},400)</script>" if close else ""
        hint = ("<p style='color:#888;font-size:90%'>Dieses Fenster kann geschlossen werden — "
                "die Verarbeitung läuft im Hintergrund. Bei Fehlern kommt eine Mail.</p>" if close else "")
        body = (f"<html><head><meta name='viewport' content='width=device-width,initial-scale=1'>{script}</head>"
                f"<body style='font-family:sans-serif;max-width:600px;margin:40px auto'>"
                f"<h2>Blattwerk Beleg-Pipeline</h2><p>{text}</p>{hint}</body></html>").encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        qs = parse_qs(url.query)
        token = (qs.get("t") or [""])[0]
        as_json = (qs.get("fmt") or [""])[0] == "json"
        if url.path == "/pending":
            return self._json(200, {"pending": pending_states()})
        if url.path not in ("/approve", "/reject"):
            return (self._json(404, {"error": "Unbekannter Pfad."}) if as_json
                    else self._html(404, "Unbekannter Pfad."))
        st = find_state_by_token(token)
        if st is None:
            return (self._json(404, {"error": "Unbekannter oder abgelaufener Link."}) if as_json
                    else self._html(404, "Unbekannter oder abgelaufener Link."))
        laufend = st["status"] in ("approving", "rejecting")
        if laufend and time.time() - st.get("action_started", 0) < 600:
            return (self._json(200, {"ok": True, "status": st["status"]}) if as_json
                    else self._html(200, f"Läuft schon im Hintergrund ({st['status']}).", close=True))
        if not laufend and st["status"] != "review":
            return (self._json(200, {"ok": True, "status": st["status"]}) if as_json
                    else self._html(200, f"Schon erledigt — Status: {st['status']}."))
        # Doppelklick-Schutz VOR dem Thread-Start; hängt eine Aktion >10 min
        # (Server-Absturz), gilt der Klick wieder als neuer Versuch.
        action = "approve" if url.path == "/approve" else "reject"
        st["status"] = "approving" if action == "approve" else "rejecting"
        st["action_started"] = time.time()
        save_state(st["name"], st)
        threading.Thread(target=run_action, args=(st, action), daemon=True).start()
        if as_json:
            return self._json(200, {"ok": True, "status": st["status"]})
        self._html(200, "✔ Angenommen — wird im Hintergrund gebucht." if action == "approve"
                   else "✔ Abgelehnt — wird im Hintergrund verschoben.", close=True)

    def log_message(self, fmt, *args):
        log(f"{self.client_address[0]} {fmt % args}")


if __name__ == "__main__":
    port = int(cfg.get("APPROVE_PORT", "8742"))
    log(f"Freigabe-Server auf Port {port} …")
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()
