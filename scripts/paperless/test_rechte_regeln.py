import unittest

from rechte_regeln import BEREICH_REGEL, GRUPPEN, andere_gruppen, bereich_von


class Regeln(unittest.TestCase):
    def test_ein_bereich(self):
        self.assertEqual(bereich_von(["Thema/Rechnung", "Bereich/Blattwerk"]), "Bereich/Blattwerk")

    def test_kein_bereich(self):
        self.assertIsNone(bereich_von(["Thema/Rechnung"]))

    def test_zwei_bereiche(self):
        self.assertIsNone(bereich_von(["Bereich/Blattwerk", "Bereich/Privat"]))

    def test_unbekannter_bereich(self):
        self.assertIsNone(bereich_von(["Bereich/Sonstwas"]))

    def test_unbekannter_plus_bekannter(self):
        self.assertIsNone(bereich_von(["Bereich/Sonstwas", "Bereich/Privat"]))

    def test_andere_gruppen(self):
        self.assertEqual(andere_gruppen("Büro Blattwerk"), ["Büro Politik"])
        self.assertEqual(andere_gruppen("Büro Politik"), ["Büro Blattwerk"])
        self.assertEqual(andere_gruppen(None), ["Büro Blattwerk", "Büro Politik"])

    def test_politik_und_privat_aendern_eigentuemer_nie(self):
        self.assertIsNone(BEREICH_REGEL["Bereich/Politik"]["owner"])
        self.assertIsNone(BEREICH_REGEL["Bereich/Privat"]["owner"])

    def test_gruppen_der_regeln_existieren(self):
        for r in BEREICH_REGEL.values():
            self.assertTrue(r["gruppe"] is None or r["gruppe"] in GRUPPEN)


if __name__ == "__main__":
    unittest.main()
