#!/usr/bin/env python3
# Finisher (Cron auf dem Pipeline-Host, alle 15 Min):
# Nimmt Worker-Ergebnisse aus _queue/extracted/, gleicht den Lieferanten gegen
# Dolibarr ab (fuzzy; legt neue Lieferanten an), erstellt eine ENTWURFS-
# Lieferantenrechnung mit Positionen + Buchungskonto-Vorschlag und schickt
# eine Freigabe-Mail. Gebucht (validiert + bezahlt + Beleg einsortiert) wird
# erst nach Klick auf den Freigabe-Link (approve_server.py).
import base64
import difflib
import fcntl
import html
import json
import os
import re
import secrets
import smtplib
import time
import urllib.parse
from datetime import datetime
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import learned
from common import (KONTO_NAMES, Dolibarr, WebDav, fk_ventilation, http,
                    STATE_DIR, known_invoice_ids, konto_von_ventilation, load_env, load_state,
                    log, moegliche_dubletten, save_state, suggest_konto)


def gen_ean13():
    # Pflichtfeld bei API-Produktanlage (ErrorBarCodeRequired); interner
    # EAN13-Nummernkreis (Präfix 2) mit gültiger Prüfziffer
    body = ("2" + str(int(time.time() * 100)))[:12].ljust(12, "0")
    s = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(body))
    return body + str((10 - s % 10) % 10)


def find_or_create_supplier(doli, name):
    hit = learned.lookup_lieferant(name)
    if hit:
        return hit["socid"], hit["name"], False
    wanted = name.strip().lower()
    suppliers = doli.get("/thirdparties?sqlfilters=(t.fournisseur:=:1)&limit=500")
    best, best_score = None, 0.0
    for s in suppliers:
        have = s["name"].strip().lower()
        if have == wanted:
            return int(s["id"]), s["name"], False
        if wanted in have or have in wanted:
            score = 0.9
        else:
            score = difflib.SequenceMatcher(None, wanted, have).ratio()
        if score > best_score:
            best, best_score = s, score
    if best is not None and best_score >= 0.75:
        return int(best["id"]), best["name"], False
    new_id = doli.post("/thirdparties", {
        "name": name.strip(), "fournisseur": 1, "client": 0,
        "country_id": 5, "country_code": "DE", "typent_id": 0,
        "code_fournisseur": "auto"})
    return int(new_id), name.strip(), True


def brutto_to_ht(brutto, satz):
    # 6 Nachkommastellen, sonst driftet Einzelpreis×Menge vom Belegbetrag weg
    # (z. B. 24,88 L: Rundung auf 2 Stellen machte aus 51,48 € → 51,52 €)
    return round(brutto / (1 + satz / 100.0), 6)


# Fuellwoerter tragen keine Artikelinformation und duerfen keinen Treffer ausloesen.
STOPPWORTE = {"und", "der", "die", "das", "fuer", "für", "mit", "von", "vom",
              "inkl", "incl", "gem", "pro", "stk", "stueck", "stück", "set", "neu"}


def find_product(doli, text):
    """Fuzzy-Match der Positionsbezeichnung gegen den Dolibarr-Artikelstamm."""
    if not hasattr(find_product, "cache"):
        find_product.cache = doli.get("/products?limit=500") or []
    wanted = text.strip().lower()
    if not wanted:
        return None, None
    best, best_score = None, 0.0
    for p in find_product.cache:
        label = str(p.get("label", "")).strip()
        have = label.lower()
        score = difflib.SequenceMatcher(None, wanted, have).ratio()
        # Wortgleichheit statt Teilstring, und ein einzelnes gemeinsames Wort
        # reicht nicht mehr: die alte Regel ("w in have") machte aus dem
        # "T-Shirt inkl. Aufdruck" den Artikel "Versandkosten, inklusive ..."
        # (inkl steckt in inklusive) und aus "... Dorn 31 mm - Kurz" einen
        # "Kurzadapter". Jetzt zaehlt der Anteil wiedergefundener Woerter:
        # mindestens die Haelfte muss passen (0.35 + 0.6*Anteil >= 0.6).
        gesucht = {w for w in re.findall(r"[a-z0-9äöüß]+", wanted)
                   if len(w) >= 3 and w not in STOPPWORTE}
        vorhanden = set(re.findall(r"[a-z0-9äöüß]+", have))
        if gesucht:
            anteil = len(gesucht & vorhanden) / len(gesucht)
            if anteil:
                score = max(score, 0.35 + 0.6 * anteil)
        if score > best_score:
            best, best_score = p, score
    if best is not None and best_score >= 0.6:
        return int(best["id"]), best.get("label")
    return None, None


# Farb- und Fuellangaben tragen zur Artikelbenennung nichts bei
KURZ_WEG = {"weiss", "weiß", "schwarz", "rot", "blau", "grün", "gruen", "gelb", "grau",
            "kurz", "lang", "neu", "set", "stück", "stueck", "inkl", "incl", "gem",
            "vorgabe", "front", "rücken", "ruecken", "aufdruck"}


def kurzname(bez, maxlaenge=32):
    """Aus der Beleg-Bezeichnung einen kurzen Artikelnamen machen.

    Ein Artikel im Stamm soll „Baumsteigeisen" heissen, nicht „Distel Baumsteigeisen
    Alu 3.1 Weaver Dorn 31 mm - Kurz" — Hersteller, Masse und Ausfuehrung gehoeren in
    die Rechnungszeile (die sie unveraendert behaelt), nicht in den Stammdatensatz.
    Deutsche Fachbegriffe sind hier fast immer Komposita, deshalb gewinnt im Zweifel
    das laengste Wort: aus dem Rest wird ohnehin nur Rauschen.
    """
    text = str(bez or "").strip()
    if not text:
        return "Position"
    # alles ab dem ersten Trenner ist Zusatz: „T-Shirt inkl. Aufdruck E190, weiß, …"
    text = re.split(r"\s*[,(]|\s+-\s+|\s+–\s+|\s+inkl\.?\s+|\s+incl\.?\s+", text, 1)[0]
    # Masse (31 mm, 4 m), Artikelcodes (E190, JN070) und blosse Zahlen raus
    text = re.sub(r"\b\d+([.,]\d+)?\s*(mm|cm|m|ml|l|g|kg|zoll)\b", " ", text, flags=re.I)
    text = re.sub(r"\b[A-Z]{1,3}\d{2,5}\b|\b\d+([.,]\d+)?\b", " ", text)
    # „rot/schwarz" muss in zwei Wörter zerfallen, sonst ueberlebt die Farbangabe
    # als ein langes Token die Filterung und wird zum Artikelnamen
    woerter = [w for w in text.replace("/", " ").split() if w.strip()]
    # Kurze Wörter in Großbuchstaben sind im Kletter-/Forstbedarf fast immer
    # Herstellerkürzel (ART, DMM, ISC) und gehören nicht in den Artikelnamen
    woerter = [w for w in woerter if not (w.isupper() and len(w.strip(".-")) <= 4)]
    tragend = [w for w in woerter if w.lower().strip(".") not in KURZ_WEG and len(w) > 2]
    kurz = " ".join(woerter).strip(" -–,")
    if len(kurz) > maxlaenge or len(tragend) > 2:
        # laengstes tragendes Wort — bei Komposita ist das der Gegenstand selbst
        laengstes = max(tragend, key=len, default="")
        if len(laengstes) >= 6:
            kurz = laengstes
    return (kurz or " ".join(woerter) or "Position")[:maxlaenge].strip(" -–,") or "Position"


def resolve_product(doli, bez, kontext="", ek_brutto=None):
    """Artikel auflösen: gelernte Zuordnung -> Fuzzy-Match -> NEU anlegen.
    Liefert (fk_product, label, fk_code_ventilation|None, neu_angelegt).

    ek_brutto ist der Einkaufs-Stückpreis aus dem Beleg. Ein neu angelegter
    Artikel bekommt ihn als Verkaufspreis: **nie unter dem Einkaufspreis**
    (Vorgabe Inhaber 20.08.2026). Ohne Preis stand jeder Auto-Artikel auf 0 € —
    und wer ihn spaeter in ein Angebot zog, verkaufte ihn geschenkt, ohne dass
    es auffiel. Als Netto gesetzt, obwohl der Einkauf brutto ist: Blattwerk ist
    Kleinunternehmer (0 % USt im Verkauf), so bleibt der Verkauf sicher ueber
    dem Einkauf statt knapp darunter."""
    hit = learned.lookup_artikel(bez)
    if hit and hit.get("fk_product"):
        return hit["fk_product"], hit.get("label") or bez, hit.get("fk_code_ventilation"), False
    prod_id, prod_label = find_product(doli, bez)
    if prod_id:
        return prod_id, prod_label, None, False
    # Kurzname statt voller Beleg-Zeile: der Stamm soll „Baumsteigeisen" fuehren,
    # die Ausfuehrung steht weiterhin in der Rechnungszeile.
    label = kurzname(bez)
    ref = "AUTO-" + re.sub(r"[^A-Z0-9]+", "-", label.upper()).strip("-")[:40]
    body = {"label": label, "ref": ref, "type": 0, "status": 1, "status_buy": 1,
            "tva_tx": 19.0, "barcode": gen_ean13()}
    if ek_brutto and float(ek_brutto) > 0:
        body["price"] = round(float(ek_brutto), 2)
        body["price_base_type"] = "HT"
    prod_id = int(doli.post("/products", body))
    find_product.cache = getattr(find_product, "cache", []) + [
        {"id": prod_id, "ref": ref, "label": label}]
    log(f"  Artikel NEU angelegt: {ref} — {label} (id {prod_id})")
    return prod_id, label, None, True


def create_draft(doli, res, socid):
    date_epoch = int(time.mktime(datetime.strptime(res["datum"], "%Y-%m-%d").timetuple()))
    ref_supplier = (res.get("belegnr") or "").strip() or f"Beleg {res['datum']}"
    inv_id = doli.post("/supplierinvoices", {
        "socid": socid, "ref_supplier": ref_supplier, "type": 0,
        "date": date_epoch, "label": f"{res['lieferant']} {res['datum']} (Auto-Beleg)"})
    inv_id = int(inv_id)
    satz = int(res.get("mwst_satz", 19))
    # Konto der größten Plus-Position: Rabatt-/Minus-Zeilen mindern dasselbe Konto
    haupt_pos = max((p for p in res["positionen"] if float(p.get("gesamt_brutto") or 0) > 0),
                    key=lambda p: float(p["gesamt_brutto"]), default=None)
    haupt_konto = suggest_konto((haupt_pos or {}).get("bezeichnung", ""), res["lieferant"])
    for pos in res["positionen"]:
        menge = float(pos.get("menge") or 1)
        brutto = float(pos["gesamt_brutto"])
        einzel_brutto = brutto / menge if menge else brutto
        bez = pos.get("bezeichnung") or "Position"
        if brutto < 0:  # Rabatt/Gutschrift: kein Artikel, Konto der Hauptposition
            pos["_konto"] = haupt_konto
            doli.post(f"/supplierinvoices/{inv_id}/lines", {
                "desc": bez, "description": bez,
                "qty": menge,
                "pu_ht": brutto_to_ht(einzel_brutto, satz),
                "tva_tx": float(satz),
                "fk_code_ventilation": fk_ventilation(haupt_konto),
                "product_type": 0})
            continue
        prod_id, prod_label, learned_vent, _neu = resolve_product(doli, bez, res["lieferant"], einzel_brutto)
        vent = learned_vent or fk_ventilation(
            suggest_konto(bez, res["lieferant"]))
        pos["_konto"] = konto_von_ventilation(vent) or suggest_konto(bez, res["lieferant"])
        # für die Freigabe-Mail: welcher Artikel hier hängt und ob er neu ist
        pos["_artikel"] = {"id": prod_id, "label": prod_label, "neu": _neu}
        # Bei einem NEU angelegten Artikel ist prod_label nur die gekuerzte Fassung
        # derselben Zeile — davorzusetzen ergaebe „Baumsteigeisen — Distel
        # Baumsteigeisen Alu 3.1 …". Nur ein *gefundener* Artikel mit abweichendem
        # Namen gehoert sichtbar davor.
        desc = (f"{prod_label} — {bez}"
                if prod_label and not _neu and learned.norm(prod_label) != learned.norm(bez)
                else bez)
        doli.post(f"/supplierinvoices/{inv_id}/lines", {
            # Dolibarr-Lieferantenrechnungen erwarten "description" ("desc" wird
            # ignoriert → leere Position); beide setzen schadet nicht
            "desc": desc, "description": desc,
            "fk_product": prod_id,
            "qty": menge,
            "pu_ht": brutto_to_ht(einzel_brutto, satz),
            "tva_tx": float(satz),
            "fk_code_ventilation": vent,
            "product_type": 0})
    inv = doli.get(f"/supplierinvoices/{inv_id}")
    return inv_id, inv


def res_from_invoice(doli, inv):
    """Fremden Dolibarr-Entwurf (App-Scan/manuell) in die res-Struktur der
    Pipeline übersetzen, damit Mail/State/Approve denselben Weg nehmen."""
    lieferant = "Unbekannter Lieferant"
    if inv.get("socid"):
        try:
            lieferant = (doli.get(f"/thirdparties/{inv['socid']}") or {}).get("name") or f"Lieferant {inv['socid']}"
        except Exception:
            lieferant = f"Lieferant {inv['socid']}"
    datum = (datetime.fromtimestamp(int(inv["date"])).strftime("%Y-%m-%d")
             if inv.get("date") else datetime.now().strftime("%Y-%m-%d"))
    positionen = []
    for line in inv.get("lines") or []:
        bez = re.sub(r"<[^>]+>", " ", str(line.get("description") or line.get("desc") or "")).strip()
        positionen.append({
            "bezeichnung": bez or line.get("product_label") or "Position",
            "menge": float(line.get("qty") or 1),
            "gesamt_brutto": float(line.get("total_ttc") or 0),
            "_konto": konto_von_ventilation(line.get("fk_code_ventilation")),
            # App-Scans bringen den Artikel schon mit; „neu" ist hier nie bekannt,
            # deshalb greift in artikel_text() die Namensprüfung
            "_artikel": ({"id": line.get("fk_product"),
                          "label": line.get("product_label") or line.get("product_ref")}
                         if line.get("fk_product") else None)})
    return {"lieferant": lieferant, "datum": datum,
            "belegnr": inv.get("ref_supplier") or "",
            "gesamt_brutto": float(inv.get("total_ttc") or 0),
            "zahlart": "?", "positionen": positionen}


def fetch_attachment(doli, inv):
    """Erstes ladbares Dokument am Entwurf holen (für den Mail-Anhang).
    Scheitert das, geht die Mail einfach ohne Anhang raus."""
    try:
        docs = doli.get(f"/documents?modulepart=supplier_invoice&id={inv['id']}") or []
    except Exception:
        return None, None  # 404 = keine Dokumente
    first_fn = None
    for d in docs if isinstance(docs, list) else []:
        rel = str(d.get("relativename") or d.get("name") or "")
        fn = rel.rsplit("/", 1)[-1]
        if not fn:
            continue
        first_fn = first_fn or fn
        # Der Pfad relativ zum modulepart-Root variiert je Dolibarr-Version/Modul
        # (Hash-Ordner wie "8/8/(PROV188)/…") — Kandidaten wie in der App
        # (DocViewerModal) aus filepath-Suffixen ableiten und durchprobieren.
        # Live verifiziert 2026-08-03: bei Dolibarr 23 trifft "8/8/(REF)/<datei>".
        kandidaten = [rel] if "/" in rel else []
        segs = [s for s in str(d.get("filepath") or "").split("/") if s]
        kandidaten += ["/".join(segs[i:] + [fn]) for i in range(len(segs))]
        if d.get("level1name"):
            kandidaten.append(f"{d['level1name']}/{fn}")
        kandidaten += [f"{inv['ref']}/{fn}", fn]
        for orig in dict.fromkeys(kandidaten):
            try:
                doc = doli.get("/documents/download?modulepart=facture_fournisseur"
                               "&original_file=" + urllib.parse.quote(orig, safe=""))
                content = (doc.get("filecontent") or doc.get("content")) if isinstance(doc, dict) else None
                if content:
                    return fn, base64.b64decode(content)
            except Exception:
                continue
    return first_fn, None


PRUEF_MARKE = "=== KI-Prüfung (Giza) ==="


def pruefung_steht(note):
    """Hat der Beleg-Prüfer auf dem Pipeline-Host diesen Entwurf schon bewertet?"""
    return PRUEF_MARKE in str(note or "")


def teile_nach_pruefung(doli, cfg, items):
    """Freigabe-Mail erst, wenn die KI-Prüfung im Beleg steht (Ansage 17.09.2026).

    Der Prüfer läuft stündlich und braucht Minuten je Beleg; bis dahin soll
    niemand freigeben, was noch niemand gegengelesen hat. Wartende Belege
    bekommen `mail_pending` und gehen beim nächsten Finisher-Lauf raus —
    Der Pipeline-Host ist nachts aus, dann wartet die Mail bis zum Morgen.
    """
    if str(cfg.get("MAIL_WARTET_AUF_PRUEFUNG", "true")).lower() == "false":
        return items, []
    bereit, warten = [], []
    for it in items:
        try:
            note = doli.get(f"/supplierinvoices/{it['invoice_id']}").get("note_private")
        except Exception as e:
            log(f"  Prüfstand für {it.get('ref')} nicht lesbar ({e}) — Mail geht raus")
            note = PRUEF_MARKE
        (bereit if pruefung_steht(note) else warten).append(it)
    for it in warten:
        st = load_state(it["name"]) or dict(it)
        st.update({"name": it["name"], "invoice_id": it["invoice_id"], "ref": it["ref"],
                   "token": it["token"], "status": "wartet_pruefung", "mail_pending": True,
                   "res": it.get("res") or st.get("res"),
                   "total_ttc": it.get("total_ttc"), "new_supplier": it.get("new_supplier")})
        save_state(it["name"], st)
        log(f"  {it['ref']}: Prüfung läuft noch — Mail wartet")
    return bereit, warten


def nachzuegler(dav, cfg):
    """Belege, deren Mail auf die Prüfung wartete und die jetzt geprüft sind."""
    items = []
    if not os.path.isdir(STATE_DIR):
        return items
    for fn in sorted(os.listdir(STATE_DIR)):
        if not fn.endswith(".state.json"):
            continue
        st = load_state(fn[:-len(".state.json")]) or {}
        if not st.get("mail_pending"):
            continue
        datei = None
        try:
            datei = dav.get("_queue/pending/" + st["name"])
        except Exception:
            pass
        items.append({"name": st["name"], "res": st.get("res") or {}, "invoice_id": st["invoice_id"],
                      "ref": st["ref"], "total_ttc": float(st.get("total_ttc") or 0),
                      "token": st["token"], "new_supplier": st.get("new_supplier"),
                      "datei_bytes": datei})
    return items


def collect_app_drafts(doli, cfg):
    """Entwürfe, die NICHT durch die Pipeline entstanden sind (In-App-Scanner,
    Offline-Sync, manuell in Dolibarr): Freigabe-Mail nachreichen. Erkennung:
    Status 0 und keine State-Datei mit dieser invoice_id."""
    try:
        min_age = int(cfg.get("APP_DRAFT_MIN_AGE_MIN", "30")) * 60
    except ValueError:
        min_age = 30 * 60
    base_q = "/supplierinvoices?sortfield=t.rowid&sortorder=DESC&limit=100"
    try:
        # serverseitig auf Entwürfe filtern, damit alte Entwürfe nicht aus dem
        # 100er-Fenster fallen; klappt der Filter nicht (400/leer=404): ungefiltert
        try:
            drafts = doli.get(base_q + "&sqlfilters=" + urllib.parse.quote("(t.fk_statut:=:0)"))
        except Exception:
            drafts = doli.get(base_q)
    except Exception as e:
        log(f"App-Entwurf-Suche fehlgeschlagen: {e}")
        return []
    known = known_invoice_ids()
    items = []
    for inv in drafts if isinstance(drafts, list) else []:
        try:
            if str(inv.get("status")) != "0":
                continue
            inv_id = int(inv["id"])
            if inv_id in known:
                continue
            if "(Auto-Beleg)" in str(inv.get("label") or ""):
                continue  # Pipeline-Entwurf (evtl. halb fehlgeschlagen) — nie als App-Scan mailen
            created = int(inv.get("date_creation") or 0) or int(inv.get("date") or 0)
            if not created or time.time() - created < min_age:
                continue  # in der App evtl. noch in Arbeit — nächster Lauf nimmt ihn mit
            res = res_from_invoice(doli, inv)
            fname, fbytes = fetch_attachment(doli, inv)
            item = {"name": fname or "kein Anhang", "res": res, "invoice_id": inv_id,
                    "ref": inv["ref"], "total_ttc": float(inv.get("total_ttc") or 0),
                    "token": secrets.token_urlsafe(20), "new_supplier": False,
                    "datei_bytes": fbytes, "source": "app"}
            # State erst NACH fehlerfreiem Zusammenbau: sonst wäre der Entwurf
            # "bekannt", ohne je gemailt worden zu sein.
            # beleg_attached=True: der Beleg hängt (wenn es einen gibt) schon am
            # Entwurf — approve darf nicht versuchen, ihn aus Nextcloud zu holen.
            name = f"app-entwurf-{inv_id}"
            save_state(name, {"name": name, "invoice_id": inv_id, "ref": item["ref"],
                              "token": item["token"], "status": "review", "res": res,
                              "beleg_attached": True, "source": "app",
                              "supplier": res["lieferant"],
                              "created": datetime.now().isoformat(timespec="seconds")})
            items.append(item)
        except Exception as e:
            log(f"App-Entwurf {inv.get('ref', inv.get('id', '?'))} übersprungen: {e}")
            continue
        log(f"App-Entwurf {item['ref']} für {res['lieferant']} ({item['total_ttc']} €) zur Freigabe vorgemerkt.")
    return items


def edit_url(cfg, it):
    # "Ändern" führt in die Blattwerk-App zur Rechnung (Bearbeiten-Ansicht baut die App).
    # Ziel per .env konfigurierbar: APP_EDIT_BASE, Platzhalter {id} und {token} erlaubt,
    # z. B. APP_EDIT_BASE=https://blattwerk…/belege/{id}?t={token}
    base = cfg.get("APP_EDIT_BASE")
    if not base:  # Fallback, solange die App-Seite noch nicht existiert
        return f"{cfg['DOLI_BASE']}/fourn/facture/card.php?id={it['invoice_id']}&action=edit"
    if "{id}" in base or "{token}" in base:
        return base.replace("{id}", str(it["invoice_id"])).replace("{token}", it["token"])
    return f"{base.rstrip('/')}/{it['invoice_id']}?t={it['token']}"


def konto_text(p, lieferant):
    """Buchungskonto einer Position als „4985 (Werkzeuge u. Kleingeräte)".
    Gemeinsame Quelle für Freigabe-Mail UND Matrix-Post: sonst zeigen die
    beiden Kanäle für denselben Beleg verschiedene Konten an, sobald einer
    von beiden seine Fallback-Logik ändert."""
    k = p.get("_konto") or suggest_konto(str(p.get("bezeichnung", "")), lieferant)
    name = KONTO_NAMES.get(k)
    return f"{k} ({name})" if name else str(k)


def artikel_text(p):
    """Welcher Dolibarr-Artikel an der Position hängt — leer, wenn keiner.

    Am 17.08.2026 hat der Fuzzy-Match ein „T-Shirt inkl. Aufdruck" dem Artikel
    „Versandkosten, inklusive Überweisungskosten" untergeschoben. Betrag und
    Konto sahen in der Freigabe-Mail plausibel aus, der Artikel war falsch —
    sichtbar war das nirgends. Deshalb steht er jetzt in der Nachricht, und
    ein Treffer auf einen Artikel mit **anderem** Namen wird als solcher
    markiert: genau das ist das Muster einer Fehlzuordnung.
    """
    a = p.get("_artikel") or {}
    label = str(a.get("label") or "").strip()
    if not label:
        return ""
    if a.get("neu"):
        return f"Artikel neu angelegt: {label}"
    bez = str(p.get("bezeichnung") or "").strip()
    if bez and learned.norm(label) != learned.norm(bez):
        return f'⚠ zugeordnet zu vorhandenem Artikel „{label}" — prüfen'
    return f"Artikel: {label}"


def markiere_dubletten(items):
    """Setzt `it["dublette"]`, wenn Lieferant + Betrag schon einmal vorkamen.

    Läuft über die State-Dateien, in denen zu diesem Zeitpunkt auch die Belege
    dieses Laufs schon stehen — deckt damit beide Fälle ab: zwei Entwürfe in
    derselben Mail (17.08.2026: PROV200/PROV201, ein Beleg zweimal abfotografiert)
    und einen Nachzügler zu einem längst gemailten Beleg.
    """
    for it in items:
        try:
            dubs = moegliche_dubletten(it["res"].get("lieferant"),
                                       it["res"].get("gesamt_brutto") or it["total_ttc"],
                                       it["res"].get("datum"),
                                       invoice_id=it["invoice_id"])
        except Exception as e:  # nie den Mailversand gefährden
            log(f"  Dublettenprüfung für {it.get('ref', '?')} fehlgeschlagen: {e}")
            continue
        if dubs:
            refs = ", ".join(str(d["ref"]) for d in dubs)
            it["dublette"] = (f"Gleicher Lieferant und Betrag steht schon bei: {refs}. "
                              f"Nur freigeben, wenn es wirklich zwei Belege sind.")
            log(f"  ⚠ {it['ref']}: mögliche Dublette zu {refs}")


def send_mail(cfg, items):
    rows = []
    for it in items:
        def konto_html(p, lieferant):
            teile = [f"→ Konto {konto_text(p, lieferant)}"]
            art = artikel_text(p)
            if art:
                teile.append(art)
            warnt = art.startswith("⚠")
            farbe = "#b00" if warnt else "#888"
            return (f" <span style='color:{farbe};font-size:90%'>"
                    f"{html.escape(' · '.join(teile))}</span>")
        pos_html = "".join(
            f"<li>{p.get('menge', 1)}× {p.get('bezeichnung', '?')} — {float(p['gesamt_brutto']):.2f} €"
            f"{konto_html(p, it['res'].get('lieferant', ''))}</li>"
            for p in it["res"]["positionen"])
        warn = it["res"].get("warnung_summe")
        diff = ""
        if abs(it["total_ttc"] - float(it["res"]["gesamt_brutto"])) > 0.01:
            diff = (f"<p style='color:#b00'>⚠ Entwurfssumme {it['total_ttc']:.2f} € weicht vom "
                    f"Beleg ({float(it['res']['gesamt_brutto']):.2f} €) ab — bitte im Entwurf prüfen.</p>")
        if it.get("source") == "app" and it["total_ttc"] == 0:
            diff += ("<p style='color:#b00'>⚠ Entwurf ohne Betrag/Positionen — vor der Freigabe "
                     "in Dolibarr vervollständigen (oder ablehnen und neu scannen).</p>")
        if it.get("dublette"):
            diff += f"<p style='color:#b00'>⚠ Mögliche Dublette: {html.escape(it['dublette'])}</p>"
        quelle = "App-Scan" if it.get("source") == "app" else f"Datei: {it['name']}"
        rows.append(f"""
        <div style="border:1px solid #ccc;border-radius:8px;padding:12px;margin:12px 0">
          <h3 style="margin:0 0 6px">{it['res']['lieferant']} — {it['total_ttc']:.2f} €</h3>
          <p style="margin:0 0 6px;color:#555">{it['res']['datum']} · Zahlart: {it['res'].get('zahlart', '?')}
             · {quelle} · Entwurf: {it['ref']}{' · Lieferant NEU angelegt' if it['new_supplier'] else ''}</p>
          <ul style="margin:0 0 8px">{pos_html}</ul>
          {f"<p style='color:#b00'>⚠ {warn}</p>" if warn else ""}{diff}
          <p>
            <a href="{cfg['APPROVE_BASE']}/approve?t={it['token']}"
               style="background:#2f7d32;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">✔ Freigeben &amp; buchen</a>
            &nbsp;
            <a href="{cfg['APPROVE_BASE']}/reject?t={it['token']}"
               style="background:#b02a2a;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">✘ Ablehnen</a>
            &nbsp;
            <a href="{edit_url(cfg, it)}"
               style="background:#1a5fb4;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">✎ Ändern</a>
            &nbsp;
            <a href="{cfg['DOLI_BASE']}/fourn/facture/card.php?id={it['invoice_id']}">In Dolibarr ansehen</a>
          </p>
        </div>""")
    body_html = f"""<html><body style="font-family:sans-serif">
      <h2>Blattwerk Beleg-Pipeline: {len(items)} Beleg(e) zur Freigabe</h2>
      <p>Bequemer geht das in der Blattwerk-App unter <b>Eingang → Beleg-Freigaben</b>:
         dort siehst du Beleg, Positionen, Artikel und Buchungskonto und kannst alles vor
         der Freigabe ändern.</p>
      <p>„Freigeben" validiert die Rechnung und sortiert den Beleg nach Jahr/Monat ein —
         das läuft nach dem Klick im Hintergrund (Fenster schließt sich selbst, nur bei
         Fehlern kommt eine Mail). „Ablehnen" <b>löscht den Dolibarr-Entwurf</b> und legt den
         Beleg nach <code>_queue/rejected/</code>. Bei App-Scans hängt der Beleg bereits am
         Entwurf, einsortiert wird nichts. Links funktionieren im Heimnetz/VPN.</p>
      {''.join(rows)}
    </body></html>"""
    msg = MIMEMultipart("mixed")
    msg.attach(MIMEText(body_html, "html", "utf-8"))
    for it in items:  # Beleg selbst mitschicken, nicht nur den Dolibarr-Link
        data = it.get("datei_bytes")
        if not data:
            continue
        part = MIMEApplication(data, Name=it["name"])
        part["Content-Disposition"] = f'attachment; filename="{it["name"]}"'
        msg.attach(part)
    msg["Subject"] = f"[Blattwerk] {len(items)} Beleg(e) zur Freigabe"
    msg["From"] = cfg["MAIL_FROM"]
    msg["To"] = cfg["MAIL_TO"]
    with smtplib.SMTP_SSL(cfg["SMTP_HOST"], int(cfg.get("SMTP_PORT", "465")), timeout=30) as s:
        s.login(cfg["SMTP_USER"], cfg["SMTP_PASS"])
        s.send_message(msg)


def matrix_notify(cfg, items):
    """EIN Post pro Beleg in den Matrix-Raum „Blattwerk Belege" (Element): das
    Beleg-Bild mit Kurzinfo als Caption (MSC2530) und Link auf die Freigaben-
    Seite der App — freigegeben/bearbeitet wird dort, nicht im Chat. Best
    effort: Fehler hier dürfen den Mailversand nie gefährden."""
    base = (cfg.get("MATRIX_URL") or "").rstrip("/")
    token, room = cfg.get("MATRIX_TOKEN"), cfg.get("MATRIX_ROOM")
    if not (base and token and room):
        return 0
    app_url = cfg.get("APP_FREIGABE_URL") or "https://mobile.example.org/#freigaben"
    hdrs = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}

    def send(content):
        url = (f"{base}/_matrix/client/v3/rooms/{urllib.parse.quote(room)}"
               f"/send/m.room.message/{secrets.token_urlsafe(8)}")
        st, body, _ = http("PUT", url, hdrs, json.dumps(content).encode())
        if st != 200:
            raise RuntimeError(f"Matrix HTTP {st}: {body[:200]!r}")

    esc = html.escape
    sent = 0
    for it in items:
        try:
            # Positionen mit Buchungskonto direkt in die Nachricht: im Raum ist
            # sonst nur Summe und Lieferant zu sehen, und genau die Kontierung
            # ist das, was vor der Freigabe geprüft werden muss. Geändert wird
            # das Konto weiterhin in der App (Freigaben → Bearbeiten).
            lieferant = it["res"].get("lieferant", "")
            pos = it["res"].get("positionen") or []
            # menge/gesamt_brutto kommen aus LLM-JSON und sind nicht garantiert
            # numerisch — überall sonst in der Pipeline ebenfalls float(… or …).
            zeilen = [f"{float(p.get('menge') or 1):g}× {p.get('bezeichnung', '?')} — "
                      f"{float(p.get('gesamt_brutto') or 0):.2f} € → Konto {konto_text(p, lieferant)}"
                      + (f" · {artikel_text(p)}" if artikel_text(p) else "")
                      for p in pos]
            datum = it["res"].get("datum", "")
            kopf = (f"{lieferant} — {it['total_ttc']:.2f} € ({datum})")
            if it.get("dublette"):
                zeilen = zeilen + ["⚠ Mögliche Dublette: " + it["dublette"]]
            caption = "\n".join([kopf] + [f"• {z}" for z in zeilen] + [f"Freigeben: {app_url}"])
            caption_html = ("<b>" + esc(lieferant) + f"</b> — {it['total_ttc']:.2f} € "
                            f"({esc(datum)})"
                            + ("<ul>" + "".join(f"<li>{esc(z)}</li>" for z in zeilen) + "</ul>"
                               if zeilen else "<br>")
                            + f"<a href=\"{app_url}\">In der App freigeben / Konto ändern</a>")
            data = it.get("datei_bytes")
            mxc = ctype = None
            if data:
                try:  # Upload ist Beiwerk — zur Not geht die Info als Text raus
                    name = it["name"].lower()
                    ctype = ("application/pdf" if name.endswith(".pdf")
                             else "image/png" if name.endswith(".png")
                             else "image/jpeg")
                    st, body, _ = http("POST", f"{base}/_matrix/media/v3/upload?filename="
                                       + urllib.parse.quote(it["name"]),
                                       {"Authorization": "Bearer " + token, "Content-Type": ctype}, data)
                    mxc = json.loads(body).get("content_uri") if st == 200 else None
                except Exception as e:
                    log(f"  Matrix-Beleg-Upload für {it.get('ref', '?')} fehlgeschlagen: {e}")
            if mxc:
                send({"msgtype": "m.file" if ctype == "application/pdf" else "m.image",
                      "body": caption, "filename": it["name"],
                      "format": "org.matrix.custom.html", "formatted_body": caption_html,
                      "url": mxc, "info": {"mimetype": ctype, "size": len(data)}})
            else:
                send({"msgtype": "m.text", "body": caption,
                      "format": "org.matrix.custom.html", "formatted_body": caption_html})
            sent += 1
        except Exception as e:
            log(f"  Matrix-Post für {it.get('ref', '?')} fehlgeschlagen: {e}")
    return sent


def main():
    # Überlappungsschutz: hängt ein Lauf >15 min, würde der nächste Cron-Lauf
    # dieselben Entwürfe doppelt mailen (known_invoice_ids vor save_state gelesen)
    lock = open("/tmp/beleg-finisher.lock", "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        log("Finisher läuft schon — Lauf übersprungen.")
        return
    cfg = load_env()
    dav = WebDav(cfg["NC_BASE"], cfg["NC_USER"], cfg["NC_PASS"], cfg.get("NC_ROOT", "Blattwerk/Belege"))
    doli = Dolibarr(cfg["DOLI_BASE"], cfg["DOLI_KEY"])

    items = []
    for entry in dav.list("_queue/extracted") or []:
        json_name = entry["name"]
        if entry["is_dir"] or not json_name.endswith(".json"):
            continue
        name = json_name[:-5]
        if load_state(name):
            continue  # schon verarbeitet
        res = json.loads(dav.get("_queue/extracted/" + json_name))
        try:
            socid, sup_name, new_supplier = find_or_create_supplier(doli, res["lieferant"])
            invoice_id, inv = create_draft(doli, res, socid)
        except Exception as e:
            log(f"FEHLER bei {name}: {e}")
            res["_fehler"] = [str(e)]
            dav.put("_queue/failed/" + name + ".json",
                    json.dumps(res, ensure_ascii=False, indent=1).encode())
            continue
        # Beleg schon am ENTWURF anhängen, damit er in App/Dolibarr vor der
        # Freigabe prüfbar ist (Regression aus dem Worker-Rewrite behoben, vgl. e4952c0).
        beleg_attached = False
        try:
            data = dav.get("_queue/pending/" + name)
            doli.post("/documents/upload", {
                "filename": name, "modulepart": "facture_fournisseur", "ref": inv["ref"],
                "filecontent": base64.b64encode(data).decode(), "fileencoding": "base64",
                "overwriteifexists": 0})
            beleg_attached = True
        except Exception as e:
            log(f"Beleg-Anhang für {name} fehlgeschlagen (wird bei Freigabe nachgeholt): {e}")
        token = secrets.token_urlsafe(20)
        state = {"name": name, "invoice_id": invoice_id, "ref": inv["ref"],
                 "token": token, "status": "review", "res": res,
                 "beleg_attached": beleg_attached,
                 "supplier": sup_name, "created": datetime.now().isoformat(timespec="seconds")}
        save_state(name, state)
        try:
            datei_bytes = dav.get("_queue/pending/" + name)
        except Exception as e:
            log(f"  Beleg-Datei für Mail-Anhang nicht ladbar ({e}) — Mail geht ohne Anhang raus")
            datei_bytes = None
        items.append({"name": name, "res": res, "invoice_id": invoice_id, "ref": inv["ref"],
                      "total_ttc": float(inv["total_ttc"]), "token": token,
                      "new_supplier": new_supplier, "datei_bytes": datei_bytes})
        log(f"Entwurf {inv['ref']} für {sup_name} ({inv['total_ttc']} €) angelegt.")

    # App-Scans/manuelle Entwürfe ohne Freigabe-Mail nachreichen (eine Mail für
    # alles). Darf den Queue-Pfad NIE mitreißen — dessen States sind schon
    # geschrieben, ein Abbruch hier würde deren Mail für immer verschlucken.
    try:
        items.extend(collect_app_drafts(doli, cfg))
    except Exception as e:
        log(f"App-Entwurf-Sammlung fehlgeschlagen: {e}")

    try:
        items.extend(nachzuegler(dav, cfg))
    except Exception as e:
        log(f"Nachzügler-Sammlung fehlgeschlagen: {e}")

    items, warten = teile_nach_pruefung(doli, cfg, items)
    for it in items:  # geht jetzt raus → Flag weg
        st = load_state(it["name"])
        if st and st.pop("mail_pending", None):
            st["status"] = "review"
            save_state(it["name"], st)

    if items:
        markiere_dubletten(items)
        # Freigegeben wird seit 17.09.2026 NUR in der App (Vorgabe Inhaber): der
        # Beleg ist erst nach der KI-Prüfung validierbar, und das entscheidet
        # die App am Prüfblock — ein Mail-Link umginge genau diese Schranke.
        # Die Mail-Funktion bleibt für den Notfall (FREIGABE_PER_MAIL=true).
        if str(cfg.get("FREIGABE_PER_MAIL", "false")).lower() == "true":
            send_mail(cfg, items)
            log(f"Freigabe-Mail für {len(items)} Beleg(e) an {cfg['MAIL_TO']} geschickt.")
        else:
            log(f"{len(items)} Beleg(e) geprüft und in der App freizugeben (keine Mail).")
        try:
            n = matrix_notify(cfg, items)
            if n:
                log(f"Matrix: {n} Beleg(e) in den Belege-Raum gepostet.")
        except Exception as e:
            log(f"Matrix-Post fehlgeschlagen (Mail ist raus): {e}")
    elif warten:
        log(f"Finisher fertig — {len(warten)} Beleg(e) warten auf die KI-Prüfung.")
    else:
        log("Finisher fertig — nichts Neues.")


if __name__ == "__main__":
    main()
