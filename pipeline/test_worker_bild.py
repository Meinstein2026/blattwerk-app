#!/usr/bin/env python3
# Bild-zuerst-Weg der Belegerkennung (17.09.2026): qwen2.5vl liest den Beleg
# direkt; OCR + Textmodell bleiben Rückfall.
import unittest
from unittest import mock

import worker_ocr


GUT = {"lieferant": "OBI", "datum": "2026-09-01", "gesamt_brutto": 10.0,
       "mwst_satz": 19, "zahlart": "karte",
       "positionen": [{"bezeichnung": "Schraube", "menge": 1, "gesamt_brutto": 10.0}]}


class BildZuerst(unittest.TestCase):
    def test_gutes_bildergebnis_spart_ocr(self):
        with mock.patch.object(worker_ocr, "ollama", return_value=GUT) as llm, \
             mock.patch.object(worker_ocr, "ocr", side_effect=AssertionError("OCR darf nicht laufen")):
            res, errors, text = worker_ocr.extract({}, "bon.jpg", b"jpeg")
        self.assertEqual(errors, [])
        self.assertEqual(res["gesamt_brutto"], 10.0)
        self.assertTrue(res["_modell"].startswith("bild:"))
        self.assertEqual(text, "")
        self.assertEqual(llm.call_count, 1)

    def test_bildmodell_weg_faellt_auf_ocr_zurueck(self):
        with mock.patch.object(worker_ocr, "ollama", side_effect=[RuntimeError("kein Knoten"), GUT]), \
             mock.patch.object(worker_ocr, "ocr", return_value=("tesseract", "OBI 10,00")):
            res, errors, _ = worker_ocr.extract({}, "bon.jpg", b"jpeg")
        self.assertEqual(errors, [])
        self.assertIn("ocr:tesseract", res["_modell"])

    def test_abschaltbar(self):
        with mock.patch.object(worker_ocr, "ollama", return_value=GUT), \
             mock.patch.object(worker_ocr, "ocr", return_value=("tesseract", "OBI 10,00")) as o:
            worker_ocr.extract({"BILD_ZUERST": "false"}, "bon.jpg", b"jpeg")
        self.assertEqual(o.call_count, 1)

    def test_pdf_mit_textebene_geht_nicht_ans_bild(self):
        with mock.patch.object(worker_ocr, "pdf_text", return_value="OBI 10,00"), \
             mock.patch.object(worker_ocr, "ollama", return_value=GUT), \
             mock.patch.object(worker_ocr, "ocr", side_effect=AssertionError("kein OCR bei Textebene")):
            res, errors, _ = worker_ocr.extract({}, "rechnung.pdf", b"jpeg", data=b"%PDF")
        self.assertIn("ocr:pdftext", res["_modell"])
class OpenAiWeg(unittest.TestCase):
    def test_bild_api_url_schaltet_auf_openai(self):
        with mock.patch.object(worker_ocr, "bild_openai", return_value=GUT) as api, \
             mock.patch.object(worker_ocr, "ollama", side_effect=AssertionError("kein Ollama")), \
             mock.patch.object(worker_ocr, "ocr", side_effect=AssertionError("kein OCR")):
            res, errors, _ = worker_ocr.extract({"BILD_API_URL": "http://pipeline-host:8082/v1"}, "bon.jpg", b"jpeg")
        self.assertEqual(errors, [])
        self.assertEqual(api.call_count, 1)

    def test_ohne_url_bleibt_es_bei_ollama(self):
        with mock.patch.object(worker_ocr, "bild_openai", side_effect=AssertionError("keine API")), \
             mock.patch.object(worker_ocr, "ollama", return_value=GUT), \
             mock.patch.object(worker_ocr, "ocr", side_effect=AssertionError("kein OCR")):
            worker_ocr.extract({}, "bon.jpg", b"jpeg")

class ZukunftsDatum(unittest.TestCase):
    def test_datum_aus_der_zukunft_ist_ein_fehler(self):
        import worker
        fehler = worker.validate(dict(GUT, datum="2099-01-01"))
        self.assertTrue(any("Zukunft" in f for f in fehler))

    def test_heutiges_datum_ist_in_ordnung(self):
        import datetime, worker
        heute = datetime.date.today().isoformat()
        self.assertEqual(worker.validate(dict(GUT, datum=heute)), [])


class DatumUmschreiben(unittest.TestCase):
    def test_deutsches_datum_wird_iso(self):
        self.assertEqual(worker_ocr.datum_normalisieren({"datum": "26.05.2026"})["datum"], "2026-05-26")
        self.assertEqual(worker_ocr.datum_normalisieren({"datum": "2.5.26"})["datum"], "2026-05-02")

    def test_iso_bleibt(self):
        self.assertEqual(worker_ocr.datum_normalisieren({"datum": "2026-05-26"})["datum"], "2026-05-26")

    def test_unsinn_bleibt_unveraendert(self):
        self.assertEqual(worker_ocr.datum_normalisieren({"datum": "letzte Woche"})["datum"], "letzte Woche")


class TextUeberGrossesModell(unittest.TestCase):
    """Seit 19.09.2026 liest dasselbe große Modell auch die Textebene digitaler
    PDFs und den OCR-Rückfall — der Datumsfehler am Amazon-Beleg kam aus dem
    kleinen Textmodell."""

    CFG = {"BILD_API_URL": "http://pipeline-host:8082/v1", "TEXT_API_MODEL": "qwen38v",
           "OLLAMA_TEXT_MODEL": "ornith-9b-q4"}

    def test_pdf_textebene_geht_ans_grosse_modell(self):
        with mock.patch.object(worker_ocr, "pdf_text", return_value="OBI 10,00"), \
             mock.patch.object(worker_ocr, "api_json", return_value=GUT) as api, \
             mock.patch.object(worker_ocr, "ollama", side_effect=AssertionError("kein kleines Textmodell")):
            res, errors, _ = worker_ocr.extract(self.CFG, "rechnung.pdf", b"jpeg", data=b"%PDF")
        self.assertEqual(errors, [])
        self.assertEqual(api.call_count, 1)
        self.assertIn("llm:qwen38v", res["_modell"])

    def test_grosses_modell_weg_faellt_auf_altes_textmodell_zurueck(self):
        with mock.patch.object(worker_ocr, "pdf_text", return_value="OBI 10,00"), \
             mock.patch.object(worker_ocr, "api_json", side_effect=RuntimeError("Modell nicht erreichbar")), \
             mock.patch.object(worker_ocr, "ollama", return_value=GUT):
            res, errors, _ = worker_ocr.extract(self.CFG, "rechnung.pdf", b"jpeg", data=b"%PDF")
        self.assertEqual(errors, [])
        self.assertIn("llm:ornith-9b-q4", res["_modell"])

    def test_ohne_api_bleibt_es_beim_alten_textmodell(self):
        with mock.patch.object(worker_ocr, "pdf_text", return_value="OBI 10,00"), \
             mock.patch.object(worker_ocr, "api_json", side_effect=AssertionError("keine API")), \
             mock.patch.object(worker_ocr, "ollama", return_value=GUT):
            res, _, _ = worker_ocr.extract({"OLLAMA_TEXT_MODEL": "ornith-9b-q4"},
                                           "rechnung.pdf", b"jpeg", data=b"%PDF")
        self.assertIn("llm:ornith-9b-q4", res["_modell"])


class RegelnInAllenPrompts(unittest.TestCase):
    """Die Nachschärfungen vom 18.09. standen nur im Bild-Prompt — genau der Weg,
    der den Amazon-Beleg NICHT gelesen hat."""

    def test_datums_und_belegnummer_regel_in_jedem_prompt(self):
        for prompt in (worker_ocr.PROMPT_BILD, worker_ocr.PROMPT_TEXT,
                       worker_ocr.PROMPT_PDFTEXT, worker_ocr.PROMPT_FIX):
            self.assertIn("Rechnungs- oder Belegdatum", prompt)
            self.assertIn("Kundennummer", prompt)

    def test_gattungsbezeichnung_ist_ueberall_verboten(self):
        for prompt in (worker_ocr.PROMPT_BILD, worker_ocr.PROMPT_TEXT,
                       worker_ocr.PROMPT_PDFTEXT, worker_ocr.PROMPT_FIX):
            self.assertIn("Gattungsbezeichnung", prompt)


if __name__ == "__main__":
    unittest.main()
