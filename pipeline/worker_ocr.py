#!/usr/bin/env python3
# Mehrstufiger Beleg-Worker mit Korrekturschleife:
#   1) OCR (PaddleOCR, Fallback Tesseract) liest den Text — Sekunden auf CPU
#   2) Text-LLM strukturiert den OCR-Text zu JSON
#   3) Python validiert (Summen, Datum, Pflichtfelder)
#   4) Bei Fehlern: LLM-Korrekturrunde mit Fehler-Feedback; hilft das nicht,
#      liest das Vision-LLM NUR den Summenblock (kleiner Crop = wenige Bild-Tokens)
# Gleiche Queue (_queue/pending -> extracted/failed), gleiches Schema wie worker.py.
import base64
import io
import json
import re
import subprocess
import sys
import tempfile
import time
import urllib.request

from common import WebDav, load_env, log
from worker import validate, prepare_image

SCHEMA = """{
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
oder schätzen. Versandkosten "inklusive"/"kostenlos"/0,00 sind KEINE Position;
Zeilen wie Zwischensumme, Überweisungsbetrag, Gegeben sind keine Positionen.
mwst_satz 7 oder 19.
gesamt_brutto ist die SUMME des Belegs — NIEMALS der gegebene Betrag (BAR/Gegeben)
und nicht das Rückgeld. Steht Rückgeld auf dem Bon: SUMME = Gegeben − Rückgeld,
und die Positionssumme muss zur SUMME passen.
Positionsbezeichnungen WÖRTLICH vom Beleg übernehmen, nichts umbenennen oder raten —
insbesondere Kraftstoffsorten exakt wie gedruckt (E10, Super, Super Plus, Diesel).
menge = Stückzahl bzw. Literzahl (bei Tankbelegen die Liter), NIE der Einzelpreis.
Spezialfälle (am 20.08.2026 aus echten Fehlläufen gelernt):
- VERSICHERUNGSSCHEIN mit Beitragsrechnung (z. B. KFZ-Versicherung): gesamt_brutto ist
  der Betrag der BEITRAGSRECHNUNG ("Belastung", "zu zahlen", oft anteilig bis zur
  Hauptfälligkeit) — NIEMALS der prominente Jahresbeitrag auf Seite 1.
  mwst_satz 0: Versicherungsteuer ist KEINE Umsatzsteuer. belegnr = Rechnungsnummer
  (nicht Vertrags-/Partnernummer). Positionen = die Sparten der Beitragsrechnung.
- KURS-/SEMINARRECHNUNGEN (z. B. Kletterschule): Einzelpreise sind oft NETTO
  ausgewiesen; gesamt_brutto je Position = Netto × (1 + mwst_satz/100), die
  Positionssumme muss den Rechnungsbetrag (brutto) ergeben. Kurstermin und
  Teilnehmer mit in die Bezeichnung nehmen."""

REGELN = """Als `lieferant` gilt immer der volle Firmenname des Ausstellers, niemals eine
Gattungsbezeichnung wie „Baumarkt" oder „Tankstelle" und nie der Rechnungsempfänger.
Als `datum` gilt das **Rechnungs- oder Belegdatum**, nicht Bestelldatum, Lieferdatum,
Leistungszeitraum, Zahlungsziel oder Druckdatum. Stehen mehrere Daten auf dem Beleg, nimm
das, das direkt bei „Rechnungsdatum", „Belegdatum", „Datum" oder bei der Uhrzeit der Kasse steht.
Die Belegnummer trägt je nach Kasse eine andere Beschriftung: „Bon-Nr.", „Beleg-Nr.",
„Rechnungs-Nr.", „Quittung", „TA-Nr.", „Trans.", „Vorgang", „KassenBon" oder auch nur eine
lange Ziffernfolge in der Fußzeile neben Kasse, Kassierer und Uhrzeit. Nimm genau diese
Zeichenfolge (Ziffern und Bindestriche, keine Beschriftung) als `belegnr`. Nicht verwechseln
mit Kundennummer, Steuernummer, USt-IdNr., Artikelnummer, EAN, Kassennummer oder TSE-Signatur.
Findest du wirklich keine, gib "" zurück.
"""

PROMPT_TEXT = """Du bist ein Belegleser für die Buchhaltung einer Garten-/Baumpflege-Firma.
Unten steht der per OCR gelesene Text eines Belegs (kann Erkennungsfehler enthalten;
Zeilen mit '?' am Anfang wurden unsicher erkannt).
Der Händlername steht oft nur im Logo und fehlt dann im OCR-Text — nutze in dem Fall
den Dateinamen und Kontext (z. B. "Tankstelle") als Hinweis auf den Lieferanten.
""" + REGELN + """Gib NUR gültiges JSON zurück (kein Markdown):
""" + SCHEMA + "\n\nDateiname: {name}\n\nOCR-Text des Belegs:\n"

# Digitale PDFs (Lieferantenrechnungen per Mail) haben eine exakte Textebene —
# kein OCR-Rauschen, also auch keine Rate-Hinweise für Erkennungsfehler.
PROMPT_PDFTEXT = """Du bist ein Belegleser für die Buchhaltung einer Garten-/Baumpflege-Firma.
Unten steht der Text eines Belegs, direkt aus der Textebene des PDF gelesen — er ist
fehlerfrei, es gibt KEINE Erkennungsfehler. Übernimm Beträge und Bezeichnungen exakt so,
wie sie dort stehen, und korrigiere nichts.
Die Spalten stehen nebeneinander: bei Positionen ist der letzte Betrag der Zeile der
Gesamtpreis der Position, davor stehen Menge und Einzelpreis.
Der Firmenname des Ausstellers steht im Briefkopf oder in der Fußzeile bei der Steuernummer.
""" + REGELN + """Gib NUR gültiges JSON zurück (kein Markdown):
""" + SCHEMA + "\n\nDateiname: {name}\n\nText des Belegs:\n"

# Beleg direkt als Bild lesen (seit 17.09.2026): qwen2.5vl:7b hat im Shootout
# 3/3 Testbelege richtig gelesen, der Weg über OCR + ornith-9b keinen einzigen
# (Jahreszahl und Summen verlesen). OCR bleibt als Rückfall, wenn das Bildmodell
# nicht erreichbar ist oder Unsinn liefert — der Pipeline-Host ist nachts aus.
PROMPT_BILD = """Du bist ein Belegleser für die Buchhaltung einer Garten-/Baumpflege-Firma.
Im Bild siehst du einen Beleg. Lies ihn vollständig und gib NUR gültiges JSON zurück
(kein Markdown, keine Erklärung).
Der Händlername steht oft nur im Logo oder im Kopf des Belegs, manchmal auch klein in
der Fußzeile bei der Steuernummer — nimm den vollen Firmennamen von dort.
""" + REGELN + SCHEMA + "\n\nDateiname: "

# Die Korrekturrunde braucht die Regeln genauso — sie ist der Schritt, in dem ein
# falsch gelesenes Datum sonst bestätigt statt berichtigt wird (Amazon, 18.09.2026).
PROMPT_FIX = REGELN + """Du hast einen Beleg als JSON strukturiert, die Validierung meldet aber Fehler.
Korrigiere das JSON anhand des OCR-Texts. Typische OCR-Verwechslungen: 0/O, 1/l/I,
5/S, 8/B, Komma/Punkt verrutscht. Gib NUR das korrigierte JSON zurück.

Validierungsfehler: {errors}

Bisheriges JSON:
{prev}

OCR-Text des Belegs:
{text}"""

PROMPT_CROP = """Im Bild siehst du den unteren Teil eines Kassenbelegs (Summenblock).
Lies NUR gültiges JSON: {"gesamt_brutto": 0.00, "mwst_satz": 19, "zahlart": "karte|bar|lastschrift|überweisung|unbekannt"}
Beträge als Zahl mit Punkt. mwst_satz 7 oder 19.
gesamt_brutto = die Zeile SUMME/GESAMT — NIEMALS der gegebene Betrag (BAR/Gegeben)
und nicht das Rückgeld (SUMME = Gegeben − Rückgeld)."""


def ocr_rapid(jpeg_bytes):
    from rapidocr_onnxruntime import RapidOCR
    if not hasattr(ocr_rapid, "engine"):
        ocr_rapid.engine = RapidOCR()
    import numpy as np
    from PIL import Image
    im = np.array(Image.open(io.BytesIO(jpeg_bytes)))
    result, _ = ocr_rapid.engine(im)
    # Räumlich sortieren (oben->unten, links->rechts), sonst kommt der Text
    # in Erkennungsreihenfolge und Beträge verlieren ihren Kontext
    entries = []
    for box, text, conf in result or []:
        ys = [p[1] for p in box]
        xs = [p[0] for p in box]
        entries.append((min(ys), min(xs), ("" if float(conf) > 0.8 else "? ") + text))
    zeilenhoehe = 18
    entries.sort(key=lambda e: (round(e[0] / zeilenhoehe), e[1]))
    return "\n".join(t for _y, _x, t in entries)


def ocr_paddle(jpeg_bytes):
    from paddleocr import PaddleOCR
    if not hasattr(ocr_paddle, "engine"):
        ocr_paddle.engine = PaddleOCR(use_angle_cls=True, lang="german", show_log=False)
    import numpy as np
    from PIL import Image
    im = np.array(Image.open(io.BytesIO(jpeg_bytes)))
    result = ocr_paddle.engine.ocr(im, cls=True)
    lines = []
    for page in result or []:
        for _, (text, conf) in page or []:
            lines.append(("" if conf > 0.8 else "? ") + text)  # unsichere Zeilen markieren
    return "\n".join(lines)


def ocr_tesseract(jpeg_bytes):
    with tempfile.NamedTemporaryFile(suffix=".jpg") as f:
        f.write(jpeg_bytes)
        f.flush()
        out = subprocess.run(["tesseract", f.name, "-", "-l", "deu", "--psm", "6"],
                             capture_output=True, text=True, timeout=120)
    return out.stdout


def ocr(jpeg_bytes):
    for name, fn in (("rapid", ocr_rapid), ("paddle", ocr_paddle)):
        try:
            return name, fn(jpeg_bytes)
        except ImportError:
            continue
    return "tesseract", ocr_tesseract(jpeg_bytes)


# Kürzer als eine Seite Fließtext heißt: keine brauchbare Textebene (Scan, Foto,
# reines Logo-PDF) — dann bleibt es beim OCR-Pfad.
PDFTEXT_MIN_ZEICHEN = 200


def pdf_text(data):
    """Textebene eines digital erzeugten PDFs lesen (Lieferantenrechnungen per Mail).

    Spart nicht nur den OCR-Lauf, sondern liefert Beträge und Positionen exakt statt
    erkannt — die Failsafes gegen OCR-Verwechslungen laufen dann ins Leere, weil es
    nichts zu verwechseln gibt. Gibt None zurück, wenn das PDF gescannt ist.
    """
    with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
        f.write(data)
        f.flush()
        try:
            out = subprocess.run(["pdftotext", "-layout", f.name, "-"],
                                 capture_output=True, text=True, timeout=60)
        except (OSError, subprocess.SubprocessError) as e:
            log(f"  pdftotext nicht nutzbar ({e}) — OCR-Pfad")
            return None
    text = (out.stdout or "").strip()
    return text if len(text) >= PDFTEXT_MIN_ZEICHEN else None


def llm_knoten(cfg):
    """Die LLM-Knoten in der Reihenfolge, in der sie versucht werden.

    `OLLAMA_URLS` ist eine kommagetrennte Liste (erster Eintrag zuerst), `OLLAMA_URL`
    bleibt der Einzelfall. Ein Knoten faellt aus, wenn ihm der Arbeitsspeicher fuer das
    Modell fehlt — genau das ist am 17.08.2026 auf dem Pipeline-Host passiert, und ohne
    Ausweichliste stand die ganze Pipeline still.
    """
    roh = cfg.get("OLLAMA_URLS") or cfg.get("OLLAMA_URL") or "http://localhost:11434"
    urls, gesehen = [], set()
    for u in roh.split(","):
        u = u.strip().rstrip("/")
        if u and u not in gesehen:
            gesehen.add(u)
            urls.append(u)
    # Der zuletzt erfolgreiche Knoten kommt nach vorn: sonst laeuft jeder weitere
    # Beleg desselben Laufs erneut in den Timeout des ersten, toten Knotens.
    bevorzugt = getattr(llm_knoten, "zuletzt", None)
    if bevorzugt in urls:
        urls.remove(bevorzugt)
        urls.insert(0, bevorzugt)
    return urls


def knoten_bereit(url, model, timeout=6, warmup_timeout=300, num_gpu=None):
    """Vorabcheck: antwortet der Knoten, hat er das Modell — und kann er es LADEN?

    Ohne diesen Check wartet ein haengender Knoten bis OLLAMA_TIMEOUT (eine Stunde),
    bevor der naechste ueberhaupt drankommt — die Ausweichliste waere dann wertlos.

    Die Modell-Liste allein genuegt aber nicht: der Pipeline-Host hat am 17.08.2026 brav
    `/api/tags` beantwortet und `ornith-9b-q4` gefuehrt, ist beim Laden aber jedes Mal
    dem OOM-Killer zum Opfer gefallen — der erste Beleg hing 20 Minuten in einem Knoten,
    der nie liefern konnte. Deshalb ein winziger Aufwaermruf (ein Token) mit knappem
    Zeitlimit: er erzwingt genau den Ladevorgang, an dem ein zu kleiner Knoten scheitert.
    Danach liegt das Modell warm (`OLLAMA_KEEP_ALIVE`), der echte Ruf zahlt nichts drauf.
    """
    try:
        with urllib.request.urlopen(url + "/api/tags", timeout=timeout) as r:
            tags = json.load(r)
    except Exception as e:
        log(f"  LLM-Knoten {url} antwortet nicht ({e})")
        return False
    vorhanden = {str(m.get("name", "")).split(":")[0] for m in tags.get("models", [])}
    if model.split(":")[0] not in vorhanden:
        log(f"  LLM-Knoten {url} hat {model} nicht — uebersprungen")
        return False
    optionen = {"num_predict": 1}
    # Gleiche Optionen wie der echte Ruf: sonst versucht der Aufwaermruf das Modell
    # doch auf die GPU zu legen, die auf dem Pipeline-Host das Bildmodell belegt — und haengt.
    if num_gpu is not None:
        optionen["num_gpu"] = num_gpu
    probe = json.dumps({"model": model, "prompt": "ok", "stream": False,
                        "options": optionen}).encode()
    req = urllib.request.Request(url + "/api/generate", probe,
                                 {"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=warmup_timeout) as r:
            r.read(1)
    except Exception as e:
        log(f"  LLM-Knoten {url} kann {model} nicht laden ({e}) — uebersprungen")
        return False
    return True


def ollama(cfg, model, prompt, images=None):
    # num_predict begrenzt Endlos-Generierung (format:json + temp 0 kann sonst loopen)
    # use_mmap: ohne mmap kopiert llama.cpp die Gewichte in anonymen Speicher UND
    # legt beim CPU-Repack eine zweite Kopie an (5,4 GB für ein 5,6-GB-Modell) —
    # auf der 5,8-GB-VM killt der OOM-Killer den Runner beim Laden. Mit mmap liegen
    # die Gewichte im Seitencache und sind bei Speicherdruck verwerfbar.
    options = {"temperature": 0, "num_ctx": 4096,
               "use_mmap": cfg.get("OLLAMA_USE_MMAP", "true").lower() != "false",
               "num_predict": int(cfg.get("OLLAMA_MAX_TOKENS", "800"))}
    if cfg.get("OLLAMA_THREADS"):
        options["num_thread"] = int(cfg["OLLAMA_THREADS"])
    # Auf dem Pipeline-Host hält das Bildmodell die T4 dauerhaft belegt (13 GB von 15 GB).
    # Der Textmodell-Rückfall muss dort deshalb auf die CPU (num_gpu=0), sonst
    # kämpfen beide um denselben Speicher und der Beleg hängt minutenlang.
    if cfg.get("OLLAMA_NUM_GPU") not in (None, ""):
        options["num_gpu"] = int(cfg["OLLAMA_NUM_GPU"])
    payload = {"model": model, "prompt": prompt, "stream": False,
               "format": "json", "options": options}
    # Thinking-Modelle (Qwen3.x) verbrennen sonst alle Tokens im Denkblock und
    # liefern mit format:json eine LEERE Antwort — think:false erzwingt Direktantwort.
    if cfg.get("OLLAMA_THINK", "").lower() == "false":
        payload["think"] = False
    if images:
        payload["images"] = [base64.b64encode(b).decode() for b in images]

    knoten = llm_knoten(cfg)
    fehler = []
    warmup = int(cfg.get("OLLAMA_WARMUP_TIMEOUT", "300"))
    for url in knoten:
        if len(knoten) > 1 and not knoten_bereit(
                url, model, warmup_timeout=warmup,
                num_gpu=int(cfg["OLLAMA_NUM_GPU"]) if cfg.get("OLLAMA_NUM_GPU") not in (None, "") else None):
            fehler.append(f"{url}: nicht bereit")
            continue
        req = urllib.request.Request(url + "/api/generate", json.dumps(payload).encode(),
                                     {"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=int(cfg.get("OLLAMA_TIMEOUT", "900"))) as r:
                antwort = json.loads(json.load(r)["response"])
        except Exception as e:
            # Ein Knoten, der beim Laden am Speicher stirbt, meldet 500 oder bricht die
            # Verbindung ab — beides ist hier ein Grund weiterzugehen, kein Abbruch.
            log(f"  LLM-Knoten {url} fehlgeschlagen ({e}) — naechster")
            fehler.append(f"{url}: {e}")
            continue
        if url != getattr(llm_knoten, "zuletzt", None):
            log(f"  LLM-Knoten: {url}")
        llm_knoten.zuletzt = url
        return antwort
    raise RuntimeError("kein LLM-Knoten nutzbar — " + " | ".join(fehler))


def crop_summenblock(jpeg_bytes):
    # Summen stehen bei Kassenbelegen unten: unteres Drittel, moderat aufgelöst
    from PIL import Image
    im = Image.open(io.BytesIO(jpeg_bytes))
    w, h = im.size
    crop = im.crop((0, int(h * 0.6), w, h))
    crop.thumbnail((700, 700))
    buf = io.BytesIO()
    crop.save(buf, "JPEG", quality=90)
    return buf.getvalue()


def geldwerte(text):
    """Alle Geldbeträge, die wörtlich im OCR-Text stehen (Beleg-Evidenz)."""
    vals = set()
    for m in re.finditer(r"(?<![\d.,])(\d{1,4})[.,](\d{2})(?!\d)", text):
        vals.add(round(float(m.group(1) + "." + m.group(2)), 2))
    # Ganz-Euro-Schreibweisen wie "200,-" / "200.-" / "200-"
    for m in re.finditer(r"(?<![\d.,])(\d{1,4})\s*[.,]?-", text):
        vals.add(float(m.group(1)))
    return vals


def negativwerte(text):
    """Beträge mit Minus (Rabattzeilen drucken oft nachgestellt: '1,00-')."""
    vals = set()
    for m in re.finditer(r"(?<![\d.,])(\d{1,4}[.,]\d{2})\s*-|-\s*(\d{1,4}[.,]\d{2})(?!\d)", text):
        vals.add(round(float((m.group(1) or m.group(2)).replace(",", ".")), 2))
    return vals


def failsafe_rabatt(res, text, vals, negvals):
    # Kassenbons führen Rabatte als eigene Minus-Zeile ("Kundenkarten-Rabatt …
    # 1,00-"); die Modelle behalten die Brutto-Position und die Summen klaffen.
    # Steht ein Rabatt-Schlagwort im Text und die Differenz Positionssumme−Summe
    # wörtlich auf dem Beleg, wird sie deterministisch als Minus-Position ergänzt.
    if not re.search(r"rabatt|nachlass|gutschein|coupon|treue", text, re.IGNORECASE):
        return False
    try:
        total = round(float(res.get("gesamt_brutto") or 0), 2)
        psum = round(sum(float(p.get("gesamt_brutto") or 0) for p in res.get("positionen") or []), 2)
    except (TypeError, ValueError):
        return False
    diff = round(psum - total, 2)
    if diff <= 0.009 or total not in vals or (diff not in negvals and diff not in vals):
        return False
    res["positionen"].append({"bezeichnung": "Rabatt", "menge": 1, "gesamt_brutto": -diff})
    res.pop("warnung_summe", None)
    log(f"  Rabatt-Failsafe: Position 'Rabatt' -{diff:.2f} ergänzt (aus OCR-Text)")
    return True


def failsafe_phantom(res, text, vals):
    # LLMs erfinden gern Beträge, die nirgends auf dem Beleg stehen (z. B. 3 €
    # "Versandkosten" bei "Versand: inklusive") und biegen die Summe passend.
    # Positionen ohne Text-Evidenz fliegen raus — aber nur, wenn das Ergebnis
    # danach selbst durch den Beleg belegt ist.
    if not vals:
        return False
    try:
        total = round(float(res.get("gesamt_brutto") or 0), 2)
        pos = res.get("positionen") or []
        def belegt(p):
            b = round(float(p.get("gesamt_brutto") or 0), 2)
            if abs(b) in vals:
                return True
            menge = float(p.get("menge") or 1)
            return menge > 1 and round(abs(b) / menge, 2) in vals
        kept = [p for p in pos if belegt(p)]
    except (TypeError, ValueError):
        return False
    if len(kept) == len(pos) or not kept:
        return False
    ksum = round(sum(float(p["gesamt_brutto"]) for p in kept), 2)
    if abs(ksum - total) <= 0.02:
        pass  # erfundene Positionen summierten sich auf ~0 — nur streichen
    elif total not in vals and ksum in vals:
        res["gesamt_brutto"] = ksum  # alte Summe war mit-erfunden
    else:
        return False
    weg = [p.get("bezeichnung") for p in pos if p not in kept]
    res["positionen"] = kept
    res.pop("warnung_summe", None)
    log(f"  Phantom-Failsafe: Position(en) ohne Beleg-Evidenz gestrichen: {weg}; Summe {total} -> {res['gesamt_brutto']}")
    return True


def datum_normalisieren(res):
    """„26.05.2026" → „2026-05-26". Das Bildmodell gibt das Datum manchmal deutsch
    zurück; ohne diese Umschrift liefe der Beleg unnötig noch einmal über OCR
    (am 17.09.2026 an Dünger.jpeg beobachtet: 73 s umsonst)."""
    d = str(res.get("datum") or "").strip()
    m = re.match(r"^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$", d)
    if m:
        tag, monat, jahr = m.groups()
        jahr = ("20" + jahr) if len(jahr) == 2 else jahr
        res["datum"] = f"{jahr}-{int(monat):02d}-{int(tag):02d}"
    return res


def bild_openai(cfg, modell, prompt, jpeg):
    """Bildmodell über eine OpenAI-kompatible API (llama.cpp auf dem Pipeline-Host).

    Ollama kann Qwen3.8 nicht laden (GGUF + eigener mmproj), llama.cpp schon —
    und dasselbe Modell prüft anschließend den Entwurf, so bleibt nur EINES im
    Speicher der T4 statt zwei, die sich gegenseitig verdrängen.
    """
    return api_json(cfg, cfg["BILD_API_URL"], modell, prompt, jpeg=jpeg)


def api_json(cfg, url, modell, prompt, jpeg=None):
    """Ein Aufruf an die OpenAI-kompatible API (llama.cpp auf dem Pipeline-Host), JSON zurück.

    Dieselbe Funktion für Bild und Text: seit 19.09.2026 liest das große Modell
    auch die Textebene digitaler PDFs und den OCR-Rückfall.
    """
    inhalt = [{"type": "text", "text": prompt}]
    if jpeg is not None:
        inhalt.append({"type": "image_url", "image_url": {
            "url": "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()}})
    payload = {"model": modell, "temperature": 0.1,
               "max_tokens": int(cfg.get("OLLAMA_MAX_TOKENS", "900")),
               # Qwen3.8 denkt sonst in `reasoning_content` und lässt `content` leer.
               "chat_template_kwargs": {"enable_thinking": False},
               "messages": [{"role": "user", "content": inhalt}]}
    if jpeg is not None:
        # Kein Prompt-Cache bei Bildern: am 18.09.2026 lieferte llama.cpp für
        # „2T-Gemiscg.jpg" die Werte des vorher gelesenen Amazon-Belegs
        # (Log: „non-consecutive token position"). Ein falscher Beleg im
        # richtigen Entwurf ist schlimmer als eine Minute mehr Rechenzeit.
        # Beim reinen Text gibt es das Problem nicht — Cache bleibt an.
        payload["cache_prompt"] = False
    req = urllib.request.Request(url.rstrip("/") + "/chat/completions",
                                 json.dumps(payload).encode(),
                                 {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=int(cfg.get("BILD_TIMEOUT", "1800"))) as r:
        nachricht = json.loads(r.read())["choices"][0]["message"]
    text = nachricht.get("content") or nachricht.get("reasoning_content") or ""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    treffer = re.search(r"\{.*\}", text, flags=re.S)
    return json.loads(treffer.group(0)) if treffer else {}


def text_llm(cfg, prompt):
    """Text vom großen Modell lesen lassen, sonst vom alten Textmodell.

    Gibt (JSON, Modellname) zurück. Das kleine Textmodell (ornith-9b) las am
    18.09.2026 beim Amazon-Beleg den 20.08. statt des 29.03.; es bleibt nur
    Rückfall, weil der Pipeline-Host nachts aus ist.
    """
    url = cfg.get("TEXT_API_URL") or cfg.get("BILD_API_URL")
    if url and str(cfg.get("TEXT_UEBER_API", "true")).lower() != "false":
        modell = cfg.get("TEXT_API_MODEL") or cfg.get("OLLAMA_BILD_MODEL", "qwen2.5vl:7b")
        try:
            return api_json(cfg, url, modell, prompt), modell
        except Exception as e:
            log(f"  Großes Modell für Text nicht nutzbar ({e}) — weiter mit dem Textmodell")
    modell = cfg.get("OLLAMA_TEXT_MODEL", "qwen2.5:3b-instruct")
    return ollama(cfg, modell, prompt), modell


def extract_bild(cfg, name, jpeg):
    """Beleg direkt vom Bildmodell lesen. Gibt (res, errors) zurück."""
    modell = cfg.get("OLLAMA_BILD_MODEL", "qwen2.5vl:7b")
    prompt = PROMPT_BILD + name + "\n"
    t0 = time.time()
    if cfg.get("BILD_API_URL"):
        res = bild_openai(cfg, modell, prompt, jpeg)
    else:
        res = ollama(cfg, modell, prompt, images=[jpeg])
    res = datum_normalisieren(res)
    log(f"  Bildmodell {modell} in {time.time() - t0:.1f}s")
    return res, validate(res)


def extract(cfg, name, jpeg, data=None):
    t0 = time.time()
    text = pdf_text(data) if data and name.lower().endswith(".pdf") else None
    # Fotos/Scans zuerst dem Bildmodell zeigen; digitale PDFs haben eine exakte
    # Textebene, da ist Raten am Bild schlechter als der Text selbst.
    if not text and str(cfg.get("BILD_ZUERST", "true")).lower() != "false":
        try:
            res, errors = extract_bild(cfg, name, jpeg)
            if not errors and not res.get("warnung_summe"):
                modell = cfg.get("OLLAMA_BILD_MODEL", "qwen2.5vl:7b")
                res["_datei"], res["_modell"] = name, f"bild:{modell}"
                res["_dauer_s"] = round(time.time() - t0, 1)
                res["_ocr_s"] = 0.0
                return res, errors, ""   # dritter Wert ist der OCR-Text; den gibt es hier nicht
            log(f"  Bildmodell unsicher ({errors or res.get('warnung_summe')}) — weiter über OCR")
        except Exception as e:
            log(f"  Bildmodell nicht nutzbar ({e}) — weiter über OCR")
    if text:
        engine = "pdftext"
        log(f"  Textebene (pdftotext) in {time.time() - t0:.1f}s, {len(text)} Zeichen — kein OCR nötig")
    else:
        engine, text = ocr(jpeg)
        log(f"  OCR ({engine}) in {time.time() - t0:.1f}s, {len(text)} Zeichen")
    t_ocr = time.time() - t0

    prompt = PROMPT_PDFTEXT if engine == "pdftext" else PROMPT_TEXT
    res, text_model = text_llm(cfg, prompt.replace("{name}", name) + text)
    res = datum_normalisieren(res)
    stufen = [f"ocr:{engine}", f"llm:{text_model}"]
    errors = validate(res)

    if errors or res.get("warnung_summe"):  # Runde 2: LLM korrigiert mit Fehler-Feedback
        log(f"  Korrekturrunde (Text-LLM): {errors or res.get('warnung_summe')}")
        fixed, _ = text_llm(cfg, PROMPT_FIX.format(
            errors=errors or [res.get("warnung_summe")],
            prev=json.dumps(res, ensure_ascii=False), text=text))
        fixed = datum_normalisieren(fixed)
        if not validate(fixed):
            res, errors = fixed, []
            stufen.append("fix:text")
        else:
            errors = validate(res)

    # Runde 3 nur für OCR-Belege: bei exakter Textebene gibt es nichts nachzulesen,
    # und der Crop zeigt ohnehin nur Seite 1 einer mehrseitigen Rechnung.
    if (errors or res.get("warnung_summe")) and engine != "pdftext":  # Vision liest NUR den Summenblock
        vis_model = cfg.get("OLLAMA_MODEL", "qwen2.5vl:3b")
        log(f"  Nachauslese Summenblock (Vision-Crop, {vis_model})")
        try:
            teil = ollama(cfg, vis_model, PROMPT_CROP, images=[crop_summenblock(jpeg)])
            try:  # Gesamtsumme kann nie kleiner sein als die größte Einzelposition
                max_pos = max((float(p.get("gesamt_brutto", 0)) for p in res.get("positionen") or []), default=0)
            except (TypeError, ValueError):
                max_pos = 0
            for k in ("gesamt_brutto", "mwst_satz", "zahlart"):
                if teil.get(k) is None:
                    continue
                if k == "gesamt_brutto" and float(teil[k] or 0) < max_pos - 0.01:
                    continue
                res[k] = teil[k]
            res.pop("warnung_summe", None)
            errors = validate(res)
            stufen.append("fix:vision-crop")
        except Exception as e:
            log(f"  Vision-Crop fehlgeschlagen: {e}")

    # Failsafe Barzahlung: schiefe Scans zerreißen Label und Betrag in getrennte
    # Zeilen — dann halten ALLE Modelle den gegebenen Betrag für die Summe.
    # Steht Rückgeld auf dem Bon, gilt deterministisch: SUMME = Gegeben − Rückgeld.
    if re.search(r"r[uü]e?ckgeld|wechselgeld", text, re.IGNORECASE):
        vals = sorted({round(float(m.group(1).replace(",", ".")), 2)
                       for m in re.finditer(r"(?<![\d.,])(\d{1,4}[.,]\d{2})(?![\d])", text)})
        g = round(float(res.get("gesamt_brutto") or 0), 2)
        kandidaten = {round(g - r, 2) for r in vals if 0 < r < g} & set(vals)
        if kandidaten and g in vals:
            try:
                pos_sum = round(sum(float(p.get("gesamt_brutto") or 0) for p in res.get("positionen") or []), 2)
            except (TypeError, ValueError):
                pos_sum = 0
            # bevorzugt die Positionssumme, sonst der größte plausible Kandidat
            summe = pos_sum if pos_sum in kandidaten else max(kandidaten)
            if summe != g:
                log(f"  Summe korrigiert: {g} -> {summe} (Rückgeld-Failsafe)")
                res["gesamt_brutto"] = summe
                res.pop("warnung_summe", None)
                errors = validate(res)

    # Failsafes Rabatt + Phantom-Positionen: Beträge müssen auf dem Beleg stehen
    vals = geldwerte(text)
    if failsafe_rabatt(res, text, vals, negativwerte(text)) | failsafe_phantom(res, text, vals):
        errors = validate(res)

    # Failsafe Datum: genau EIN dd.mm.yyyy-Muster im OCR-Text schlägt das Modell
    # (Modelle vertippen sich bei verrauschten Scans gern im Monat)
    datumsmuster = {f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
                    for m in re.finditer(r"(\d{2})\.(\d{2})\.(20\d{2})", text)
                    if 1 <= int(m.group(2)) <= 12}
    if len(datumsmuster) == 1:
        d = datumsmuster.pop()
        if res.get("datum") != d:
            log(f"  Datum korrigiert: {res.get('datum')} -> {d} (aus OCR-Text)")
            res["datum"] = d

    # Failsafe Tankbelege: steht eine Literzahl im OCR-Text, ist SIE die Menge
    # (LLMs verwechseln gern Literpreis und Literzahl — deterministisch fixen)
    m = re.search(r"(\d{1,3}[.,]\d{1,2})\s*Liter", text, re.IGNORECASE)
    if m and len(res.get("positionen") or []) == 1:
        liter = float(m.group(1).replace(",", "."))
        pos = res["positionen"][0]
        if abs(float(pos.get("menge") or 0) - liter) > 0.01:
            log(f"  Menge korrigiert: {pos.get('menge')} -> {liter} (aus '… Liter' im OCR-Text)")
            pos["menge"] = liter

    res["_datei"] = name
    res["_modell"] = "+".join(stufen)
    res["_dauer_s"] = round(time.time() - t0, 1)
    res["_ocr_s"] = round(t_ocr, 1)
    return res, errors, text


def put_retry(dav, path, data, tries=4):
    # DNS/Netz flackert nach Suspend gern — Upload darf daran nicht sterben
    for i in range(tries):
        try:
            dav.put(path, data)
            return
        except Exception as e:
            if i == tries - 1:
                raise
            log(f"  Upload-Versuch {i+1} fehlgeschlagen ({e}), warte 10s")
            time.sleep(10)


def run_once(cfg, dav):
    done = {e["name"] for e in dav.list("_queue/extracted") or []}
    failed = {e["name"] for e in dav.list("_queue/failed") or []}
    count = 0
    for entry in dav.list("_queue/pending") or []:
        name = entry["name"]
        if entry["is_dir"] or name + ".json" in done or name + ".json" in failed:
            continue
        log(f"verarbeite (OCR-Pipeline): {name}")
        try:
            data = dav.get("_queue/pending/" + name)
            jpeg = prepare_image(name, data, max_px=int(cfg.get("BELEG_MAX_PX", "1568")))
            res, errors, text = extract(cfg, name, jpeg, data)
            open("ergebnis_" + name + ".json", "w").write(
                json.dumps(res, ensure_ascii=False, indent=1))  # lokale Sicherung
            if errors:
                res["_fehler"] = errors
                res["_ocr_text"] = text  # zur Fehlersuche mit ablegen
                put_retry(dav, "_queue/failed/" + name + ".json",
                        json.dumps(res, ensure_ascii=False, indent=1).encode())
                log(f"  -> FEHLER: {errors}")
            else:
                put_retry(dav, "_queue/extracted/" + name + ".json",
                        json.dumps(res, ensure_ascii=False, indent=1).encode())
                log(f"  -> ok: {res['lieferant']} {res['datum']} {res['gesamt_brutto']} € ({res['_dauer_s']}s, {res['_modell']})")
            count += 1
        except Exception as e:
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
        log(f"OCR-Worker fertig — {n} Beleg(e) verarbeitet.")


if __name__ == "__main__":
    main()
