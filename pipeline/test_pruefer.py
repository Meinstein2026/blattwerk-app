#!/usr/bin/env python3
# Tests für die festen Regeln des Beleg-Prüfers (ohne Netz, ohne LLM).
import unittest

import pruefer


def zeile(desc="Kettenöl 5 l", ttc=30.0, konto="3000", tva=19.0, produkt=7):
    return {"desc": desc, "total_ttc": ttc, "tva_tx": tva,
            "fk_code_ventilation": ("10050" + konto) if konto else "0",
            "fk_product": produkt}


def rechnung(**kw):
    r = {"id": 1, "ref": "(PROV1)", "socid": 36, "total_ttc": 30.0,
         "date": 1789000000, "ref_supplier": "RE-4711", "lines": [zeile()]}
    r.update(kw)
    return r


class FesteRegeln(unittest.TestCase):
    def codes(self, r, alle=(), name="Kilb Vetter"):
        return {b["code"] for b in pruefer.feste_pruefungen(r, name, list(alle))}

    def test_saubere_rechnung_ohne_befund(self):
        self.assertEqual(self.codes(rechnung()), set())

    def test_summe_passt_nicht(self):
        self.assertIn("summe", self.codes(rechnung(total_ttc=45.0)))

    def test_zeile_ohne_konto(self):
        self.assertIn("konto_fehlt", self.codes(rechnung(lines=[zeile(konto=None)])))

    def test_null_euro_zeile(self):
        r = rechnung(total_ttc=0.0, lines=[zeile(ttc=0.0)])
        self.assertIn("null_zeile", self.codes(r))

    def test_zeile_ohne_artikel(self):
        self.assertIn("artikel_fehlt", self.codes(rechnung(lines=[zeile(produkt=None)])))

    def test_konto_weicht_von_regel_ab(self):
        r = rechnung(lines=[zeile(desc="Kettenöl 5 l", konto="4530")])
        self.assertIn("konto_regel", self.codes(r))

    def test_steuerzeile_als_position(self):
        r = rechnung(total_ttc=297.5, lines=[zeile(desc="LKW Arbeitsbühne - 23m", ttc=250.0),
                                             zeile(desc="Umsatzsteuer 19 %", ttc=47.5)])
        self.assertIn("steuerzeile", self.codes(r))

    def test_summenzeile_als_position(self):
        r = rechnung(lines=[zeile(desc="Zwischensumme", ttc=30.0)])
        self.assertIn("steuerzeile", self.codes(r))

    def test_echte_leistung_bleibt_unbeanstandet(self):
        r = rechnung(lines=[zeile(desc="Mehrzweckfett 400 g")])
        self.assertNotIn("steuerzeile", self.codes(r))

    def test_vorsteuer_auf_versicherung(self):
        r = rechnung(lines=[zeile(desc="Haftpflicht", konto="4360", tva=19.0)])
        self.assertIn("vorsteuer", self.codes(r))

    def test_datum_weit_weg_von_der_erfassung(self):
        r = rechnung(date=1789000000, date_creation=1789000000 + 120 * 86400)
        self.assertIn("datum_fern", self.codes(r))

    def test_datum_nahe_der_erfassung_ist_still(self):
        r = rechnung(date=1789000000, date_creation=1789000000 + 3 * 86400)
        self.assertNotIn("datum_fern", self.codes(r))

    def test_ab_250_ohne_rechnungsnummer(self):
        r = rechnung(total_ttc=297.5, ref_supplier="o.Nr.-1789202512472",
                     lines=[zeile(ttc=297.5)])
        self.assertIn("formalien", self.codes(r))

    def test_dublette_gleicher_lieferant_betrag_tag(self):
        a = rechnung()
        b = rechnung(id=2, ref="(PROV2)", date=1789000000 + 3600)
        self.assertIn("dublette", self.codes(a, alle=[a, b]))

    def test_keine_dublette_bei_anderem_betrag(self):
        a = rechnung()
        b = rechnung(id=2, total_ttc=31.0)
        self.assertNotIn("dublette", self.codes(a, alle=[a, b]))

    def test_fingerabdruck_aendert_sich_mit_zeilen(self):
        a = pruefer.fingerabdruck(rechnung())
        b = pruefer.fingerabdruck(rechnung(lines=[zeile(konto="4900")]))
        self.assertNotEqual(a, b)

    def test_notiz_ersetzt_alten_block(self):
        alt = "Handnotiz\n" + pruefer.NOTIZ_START + "\nalt\n" + pruefer.NOTIZ_ENDE
        neu = pruefer.notiz_setzen(alt, "neu")
        self.assertIn("Handnotiz", neu)
        self.assertIn("neu", neu)
        self.assertNotIn("alt\n", neu)
        self.assertEqual(neu.count(pruefer.NOTIZ_START), 1)

    def test_llm_antwort_json_aus_text(self):
        t = 'Hier: ```json\n{"urteil": "pruefen", "hinweise": ["x"]}\n```'
        self.assertEqual(pruefer.json_aus_text(t)["urteil"], "pruefen")

    def test_modell_aus_ist_nicht_bereit(self):
        self.assertFalse(pruefer.modell_bereit("http://127.0.0.1:9/v1", timeout=1))

    def test_erfundenes_konto_wird_verworfen(self):
        r = pruefer.vorschlaege_pruefen({"konto_vorschlag": {"1": "9999", "2": "4530"}})
        self.assertEqual(r["konto_vorschlag"], {"2": "4530"})
        self.assertIn("9999", r["verworfen"])

    def test_hinweis_mit_unbekanntem_konto_faellt_raus(self):
        r = pruefer.vorschlaege_pruefen({"hinweise": ["Konto 9999 passt", "Beleg prüfen"]})
        self.assertEqual(r["hinweise"], ["Beleg prüfen"])
        self.assertIn("9999", r["verworfen"])

    def test_kontoname_im_hinweis_wird_richtiggestellt(self):
        r = pruefer.vorschlaege_pruefen({"hinweise": ["4970 Sonstige Aufwendungen passt"]})
        self.assertIn("4970 (Nebenkosten des Geldverkehrs)", r["hinweise"][0])

    def test_lernbeispiele_nur_aus_freigegebenen(self):
        gebucht = {"statut": "1", "lines": [zeile(desc="Diesel", konto="4530")]}
        entwurf = {"statut": "0", "lines": [zeile(desc="Sägeblatt", konto="4900")]}
        b = pruefer.lernbeispiele([gebucht, entwurf])
        self.assertEqual(len(b), 1)
        self.assertIn("4530", b[0])

    def test_konten_liste_enthaelt_namen(self):
        self.assertIn("4530 = Laufende Fahrzeug-Betriebskosten", pruefer.konten_liste())


if __name__ == "__main__":
    unittest.main()
