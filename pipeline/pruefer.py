#!/usr/bin/env python3
# Beleg-Prüfer: zweite Meinung zu Dolibarr-Lieferantenrechnungs-Entwürfen.
#
# Läuft auf dem Pipeline-Host, nicht auf .41: von dort ist Dolibarr per API
# erreichbar, .41 dagegen nicht, und das große Modell (qwen3-coder-next, 80B MoE
# über llama.cpp, OpenAI-kompatibel) passt nur dort in den Speicher.
# Ablauf je Entwurf: feste Regeln (Summe, Konto, Vorsteuer, Formalien, Dubletten)
# → großes Modell mit dem SKR03-Regelwerk → Ergebnis als Block in note_private.
# Unveränderte Entwürfe (gleicher Fingerabdruck) werden nicht erneut geprüft.
# Der Pipeline-Host ist nachts aus (Solar) — ist das Modell nicht erreichbar, endet der Lauf still.
import argparse
import hashlib
import json
import os
import re
import shlex
import subprocess
import time
from datetime import datetime

from common import (BASE_DIR, KONTO_NAMES, Dolibarr, _match_konto, http,
                    konto_von_ventilation, load_env, log)

NOTIZ_START = "=== KI-Prüfung (Giza) ==="
NOTIZ_ENDE = "=== Ende KI-Prüfung ==="
# Konten ohne Vorsteuer (Versicherungsteuer, Gebühren, Beiträge) — Knowledge/buchhaltung-blattwerk-skr03.md Nr. 9
OHNE_VORSTEUER = {"4360", "4380", "4520", "4970"}
FORMALIEN_AB = 250.0
# Zeilen, die keine Leistung sind, sondern Rechenwerk des Belegs. Das Bildmodell
# hat am 17.09.2026 „Umsatzsteuer 19 % = 47,50" als eigene Position übernommen —
# die Summe stimmt dann zufällig, gebucht würde aber Steuer als Aufwand.
KEINE_LEISTUNG = ("umsatzsteuer", "mehrwertsteuer", "mwst", "ust ", "ust.", "vorsteuer",
                  "zwischensumme", "gesamtsumme", "gesamtbetrag", "rechnungsbetrag",
                  "nettobetrag", "bruttobetrag", "endbetrag", "summe netto", "summe brutto",
                  "zu zahlen", "zahlbetrag", "rabatt gesamt", "skonto")
DUBLETTE_TAGE = 3
# Wie weit darf das Belegdatum vom Tag der Erfassung abweichen, bevor es auffällt?
# Am 18.09.2026 machte der Textmodell-Rückfall aus einem Amazon-Beleg vom 29.03.
# ein Datum im August — im Beleg selbst stimmig, aber Monate neben der Erfassung.
DATUM_ABSTAND_TAGE = 90


def _f(v):
    try:
        return round(float(v or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def feste_pruefungen(r, lieferant, alle):
    """Deterministische Befunde: [{code, text}]."""
    out = []
    add = lambda code, text: out.append({"code": code, "text": text})
    lines = r.get("lines") or []
    summe = round(sum(_f(z.get("total_ttc")) for z in lines), 2)
    if abs(summe - _f(r.get("total_ttc"))) > 0.02:
        add("summe", f"Zeilensumme {summe:.2f} € ≠ Rechnungsbetrag {_f(r.get('total_ttc')):.2f} €")
    for i, z in enumerate(lines, 1):
        desc = str(z.get("desc") or z.get("product_label") or "").strip()
        konto = konto_von_ventilation(z.get("fk_code_ventilation"))
        if _f(z.get("total_ttc")) == 0:
            add("null_zeile", f"Zeile {i} „{desc[:40]}“ hat 0,00 €")
        if not konto:
            add("konto_fehlt", f"Zeile {i} „{desc[:40]}“ ohne SKR03-Konto")
        if not z.get("fk_product"):
            add("artikel_fehlt", f"Zeile {i} „{desc[:40]}“ ohne Katalog-Artikel")
        regel = _match_konto(desc.lower())
        if konto and regel and regel != konto:
            add("konto_regel", f"Zeile {i} „{desc[:40]}“ auf {konto}, Regel sagt {regel} ({KONTO_NAMES.get(regel, '')})")
        t = desc.lower().strip()
        if any(t.startswith(w) or t == w.strip() for w in KEINE_LEISTUNG):
            add("steuerzeile", f"Zeile {i} „{desc[:40]}“ ist keine Leistung, sondern Steuer/Summe — Position löschen und Betrag in die echte Position nehmen")
        if konto in OHNE_VORSTEUER and _f(z.get("tva_tx")) > 0:
            add("vorsteuer", f"Zeile {i} auf {konto} mit {_f(z.get('tva_tx')):g} % USt — dort gibt es keine Vorsteuer")
    erfasst = r.get("date_creation") or r.get("datec")
    if erfasst and r.get("date"):
        tage = (int(erfasst) - int(r["date"])) / 86400
        if abs(tage) > DATUM_ABSTAND_TAGE:
            add("datum_fern", f"Belegdatum liegt {abs(tage):.0f} Tage von der Erfassung entfernt — Datum am Beleg prüfen")
    ref = str(r.get("ref_supplier") or "")
    if _f(r.get("total_ttc")) >= FORMALIEN_AB and (not ref or ref.startswith("o.Nr")):
        add("formalien", f"Ab {FORMALIEN_AB:.0f} € brutto braucht der Beleg Rechnungsnummer, Anschrift Blattwerk, Steuernr. Lieferant")
    for o in alle:
        if o.get("id") == r.get("id") or str(o.get("statut")) == "3":
            continue
        if o.get("socid") == r.get("socid") and _f(o.get("total_ttc")) == _f(r.get("total_ttc")) \
                and abs(int(o.get("date") or 0) - int(r.get("date") or 0)) <= DUBLETTE_TAGE * 86400:
            add("dublette", f"Mögliche Dublette von {o.get('ref')} ({lieferant}, {_f(o.get('total_ttc')):.2f} €)")
    return out


def fingerabdruck(r):
    teile = [r.get("socid"), _f(r.get("total_ttc")), r.get("date"), r.get("ref_supplier")]
    teile += [(z.get("desc"), _f(z.get("total_ttc")), z.get("fk_code_ventilation"),
               z.get("fk_product"), _f(z.get("tva_tx"))) for z in r.get("lines") or []]
    return hashlib.sha256(json.dumps(teile, default=str).encode()).hexdigest()[:16]


def notiz_setzen(alt, block):
    alt = str(alt or "")
    alt = re.sub(re.escape(NOTIZ_START) + r".*?" + re.escape(NOTIZ_ENDE), "", alt, flags=re.S).strip()
    return ((alt + "\n\n") if alt else "") + f"{NOTIZ_START}\n{block}\n{NOTIZ_ENDE}"


def json_aus_text(t):
    t = re.sub(r"<think>.*?</think>", "", t or "", flags=re.S)
    m = re.search(r"\{.*\}", t, flags=re.S)
    return json.loads(m.group(0)) if m else {}


def norm(text):
    """Wie learned.norm — hier eigenständig, damit auf dem Pipeline-Host nur zwei Dateien liegen."""
    return " ".join(re.findall(r"[a-z0-9äöüß]+", (text or "").lower()))


def konten_liste():
    return "\n".join(f"{k} = {v}" for k, v in sorted(KONTO_NAMES.items()))


def vorschlaege_pruefen(llm):
    """Nur Konten aus KONTO_NAMES durchlassen; Bezeichnung kommt immer von uns.

    Das Modell hat am 17.09.2026 „4970" vorgeschlagen und es als „Sonstige
    Aufwendungen" bezeichnet — 4970 ist „Nebenkosten des Geldverkehrs".
    Erfundene Nummern und falsche Namen dürfen nicht in den Beleg.
    """
    llm = dict(llm or {})
    gut, verworfen = {}, []
    for nr, k in (llm.get("konto_vorschlag") or {}).items():
        k = str(k).strip()
        (gut.__setitem__(str(nr), k) if k in KONTO_NAMES else verworfen.append(k))
    hinweise, unbekannt = [], set(verworfen)
    for h in llm.get("hinweise") or []:
        h = str(h)
        fremd = {n for n in re.findall(r"\b[0-9]{4}\b", h) if n not in KONTO_NAMES}
        if fremd:
            unbekannt |= fremd
            continue  # nennt ein Konto, das es hier nicht gibt → nicht übernehmen
        # Kontonamen kommen immer aus KONTO_NAMES: das Modell nannte 4970
        # „Sonstige Aufwendungen" statt „Nebenkosten des Geldverkehrs".
        h = re.sub(r"\b([0-9]{4})\b", lambda m: f"{m.group(1)} ({KONTO_NAMES[m.group(1)]})", h)
        hinweise.append(h)
    llm["konto_vorschlag"], llm["hinweise"] = gut, hinweise
    llm["verworfen"] = sorted(unbekannt)
    return llm


def lernbeispiele(alle, anzahl=20):
    """Wie vergleichbare Belege am Ende gebucht wurden (freigegebene Rechnungen).

    Die Korrekturen des Inhabers sind die Wahrheit, an der das Modell sich ausrichten soll —
    dieselbe Idee wie learned.json im Finisher, nur als Beispiele im Prompt.
    """
    gesehen, out = set(), []
    for r in alle:
        if str(r.get("statut")) not in ("1", "2"):
            continue
        for z in r.get("lines") or []:
            text = str(z.get("desc") or z.get("product_label") or "").strip()
            konto = konto_von_ventilation(z.get("fk_code_ventilation"))
            schluessel = norm(text)
            if not text or konto not in KONTO_NAMES or schluessel in gesehen:
                continue
            gesehen.add(schluessel)
            out.append(f'„{text[:60]}" -> {konto} ({KONTO_NAMES[konto]})')
            if len(out) >= anzahl:
                return out
    return out


# --- großes Modell ------------------------------------------------------------

def modell_bereit(url, timeout=6):
    try:  # Container aus → Connection refused (URLError), das ist „nicht bereit", kein Absturz
        st, _, _ = http("GET", url.rstrip("/") + "/models", timeout=timeout)
    except OSError:
        return False
    return st == 200


def modell_starten(cfg):
    """Startet den llama.cpp-Container bei Bedarf. True, wenn wir ihn gestartet haben."""
    url = cfg.get("PRUEF_LLM_URL", "http://127.0.0.1:8080/v1")
    if modell_bereit(url):
        return False
    cmd = cfg.get("PRUEF_START_CMD")
    if not cmd:
        raise RuntimeError("Modell nicht erreichbar und kein PRUEF_START_CMD")
    log(f"  starte Modell: {cmd}")
    subprocess.run(shlex.split(cmd), check=True)
    ende = time.time() + int(cfg.get("PRUEF_START_TIMEOUT", "600"))
    while time.time() < ende:
        if modell_bereit(url):
            return True
        time.sleep(10)
    raise RuntimeError("Modell nach Start nicht bereit")


def modell_fragen(cfg, system, user):
    url = cfg.get("PRUEF_LLM_URL", "http://127.0.0.1:8080/v1").rstrip("/") + "/chat/completions"
    payload = {"model": cfg.get("PRUEF_MODEL", "qwen3-coder-next"), "temperature": 0.1,
               "max_tokens": int(cfg.get("PRUEF_MAX_TOKENS", "900")),
               # Qwen3.8 denkt sonst in `reasoning_content` und lässt `content` leer —
               # am 18.09.2026 kamen so zwei Prüfblöcke ganz ohne KI-Hinweise heraus.
               "chat_template_kwargs": {"enable_thinking": False},
               "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    st, body, _ = http("POST", url, {"Content-Type": "application/json"},
                       json.dumps(payload).encode(), timeout=int(cfg.get("PRUEF_TIMEOUT", "900")))
    if st != 200:
        raise RuntimeError(f"LLM HTTP {st} {body[:200]!r}")
    nachricht = json.loads(body)["choices"][0]["message"]
    return nachricht.get("content") or nachricht.get("reasoning_content") or ""


SYSTEM = """Du bist Buchhalter (Steuerfachwirt, DATEV-Praxis) und prüfst Eingangsbelege der
Blattwerk GbR (Baumpflege/Garten, {region}), die eine Texterkennung automatisch als
Dolibarr-Entwurf angelegt hat. Kontenrahmen SKR03. Grundlage ist dieses Regelwerk:

{wissen}

Erlaubte Konten (NUR diese Nummern, keine anderen):
{konten}

So wurden vergleichbare Positionen hier tatsächlich gebucht (Korrekturen des Inhabers, Vorrang vor deinem Bauchgefühl):
{beispiele}

Antworte NUR mit JSON: {{"urteil": "ok" | "pruefen" | "fehler", "konto_vorschlag": {{"<Zeilennr>": "<SKR03-Konto>"}},
"hinweise": ["kurzer deutscher Satz", ...]}}. Höchstens 5 Hinweise. Erfinde keine Kontonummern,
die nicht im Regelwerk stehen. Feste Befunde sind schon geprüft — bewerte sie, wiederhole sie nicht wörtlich."""


def beschreibung(r, lieferant, befunde):
    d = datetime.fromtimestamp(int(r["date"])).strftime("%d.%m.%Y") if r.get("date") else "?"
    zeilen = [{"nr": i, "text": z.get("desc") or z.get("product_label"), "menge": _f(z.get("qty")),
               "brutto": _f(z.get("total_ttc")), "ust_prozent": _f(z.get("tva_tx")),
               "konto": konto_von_ventilation(z.get("fk_code_ventilation")),
               "artikel": z.get("product_ref")} for i, z in enumerate(r.get("lines") or [], 1)]
    return json.dumps({"entwurf": r.get("ref"), "lieferant": lieferant, "datum": d,
                       "rechnungsnr": r.get("ref_supplier"), "brutto": _f(r.get("total_ttc")),
                       "netto": _f(r.get("total_ht")), "zeilen": zeilen,
                       "feste_befunde": [b["text"] for b in befunde]}, ensure_ascii=False, indent=1)


def block(befunde, llm, modell):
    urteil = (llm or {}).get("urteil") or ("pruefen" if befunde else "ok")
    zeilen = [f"Stand {datetime.now():%d.%m.%Y %H:%M} · Modell {modell} · Urteil: {urteil.upper()}"]
    zeilen += [f"- {b['text']}" for b in befunde]
    zeilen += [f"- KI: {h}" for h in (llm or {}).get("hinweise", [])[:5]]
    for nr, k in ((llm or {}).get("konto_vorschlag") or {}).items():
        zeilen.append(f"- KI-Kontovorschlag Zeile {nr}: {k} {KONTO_NAMES.get(str(k), '')}".rstrip())
    if (llm or {}).get("verworfen"):
        zeilen.append("- (KI nannte unbekannte Konten, verworfen: " + ", ".join(llm["verworfen"]) + ")")
    return "\n".join(zeilen)


# --- Lauf ---------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="nichts nach Dolibarr schreiben")
    ap.add_argument("--alle", action="store_true", help="auch unveränderte Entwürfe neu prüfen")
    ap.add_argument("--ohne-llm", action="store_true", help="nur feste Regeln")
    a = ap.parse_args()

    cfg = load_env()
    doli = Dolibarr(cfg["DOLI_URL"], cfg["DOLI_KEY"])
    state_file = os.path.join(BASE_DIR, "pruefer-state.json")
    state = json.load(open(state_file)) if os.path.exists(state_file) else {}

    alle = doli.get("/supplierinvoices?limit=1000&sortfield=t.rowid&sortorder=DESC")
    entwuerfe = [r for r in alle if str(r.get("statut")) == "0"]
    offen = [r for r in entwuerfe if a.alle or state.get(str(r["id"])) != fingerabdruck(r)]
    log(f"Prüfer: {len(entwuerfe)} Entwürfe, {len(offen)} neu/geändert")
    if not offen:
        return

    gestartet = False
    modell = cfg.get("PRUEF_MODEL", "qwen3-coder-next")
    wissen = open(cfg["PRUEF_WISSEN"], encoding="utf-8").read() if cfg.get("PRUEF_WISSEN") else ""
    try:
        if not a.ohne_llm:
            try:
                gestartet = modell_starten(cfg)
            except Exception as e:  # Pipeline-Host/Modell nicht bereit → nächster Lauf
                log(f"  Modell nicht verfügbar ({e}) — Lauf beendet")
                return
        beispiele = "\n".join(lernbeispiele(alle)) or "(noch keine freigegebenen Belege)"
        namen = {}
        for r in offen:
            sid = r.get("socid")
            if sid not in namen:
                try:
                    namen[sid] = doli.get(f"/thirdparties/{sid}").get("name") or str(sid)
                except Exception:
                    namen[sid] = str(sid)
            befunde = feste_pruefungen(r, namen[sid], alle)
            llm = None
            if not a.ohne_llm:
                try:
                    llm = vorschlaege_pruefen(json_aus_text(modell_fragen(
                        cfg, SYSTEM.format(wissen=wissen, konten=konten_liste(), beispiele=beispiele,
                                            region=cfg.get("BETRIEB_REGION", "Ihrer Region")),
                        beschreibung(r, namen[sid], befunde))))
                except Exception as e:
                    log(f"  {r['ref']}: LLM-Fehler {e}")
                    continue  # ohne zweite Meinung nicht als geprüft markieren
            text = block(befunde, llm, modell if not a.ohne_llm else "nur Regeln")
            log(f"  {r['ref']} {namen[sid]} {_f(r.get('total_ttc')):.2f} €\n    " + text.replace("\n", "\n    "))
            if not a.dry_run:
                doli.put(f"/supplierinvoices/{r['id']}", {"note_private": notiz_setzen(r.get("note_private"), text)})
                state[str(r["id"])] = fingerabdruck(r)
                json.dump(state, open(state_file, "w"), indent=1)
    finally:
        if gestartet and cfg.get("PRUEF_STOP_CMD"):
            log("  stoppe Modell wieder")
            subprocess.run(shlex.split(cfg["PRUEF_STOP_CMD"]))


if __name__ == "__main__":
    main()
