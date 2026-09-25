#!/usr/bin/env python3
# Freigabe-Mail wartet auf die KI-Prüfung (Ansage 17.09.2026).
import unittest

import finisher


class FakeDoli:
    def __init__(self, notizen):
        self.notizen = notizen

    def get(self, pfad):
        return {"note_private": self.notizen.get(int(pfad.rsplit("/", 1)[-1]), "")}


def item(i=1, name="beleg.pdf"):
    return {"name": name, "invoice_id": i, "ref": f"(PROV{i})", "token": "t",
            "total_ttc": 10.0, "res": {}}


class Pruefgate(unittest.TestCase):
    def setUp(self):
        self.gespeichert = {}
        finisher.save_state = lambda n, d: self.gespeichert.__setitem__(n, d)
        finisher.load_state = lambda n: self.gespeichert.get(n)

    def test_geprueft_geht_raus(self):
        d = FakeDoli({1: "Text\n" + finisher.PRUEF_MARKE + "\nok"})
        bereit, warten = finisher.teile_nach_pruefung(d, {}, [item(1)])
        self.assertEqual(len(bereit), 1)
        self.assertEqual(warten, [])

    def test_ungeprueft_wartet_und_wird_gemerkt(self):
        bereit, warten = finisher.teile_nach_pruefung(FakeDoli({1: ""}), {}, [item(1)])
        self.assertEqual(bereit, [])
        self.assertTrue(self.gespeichert["beleg.pdf"]["mail_pending"])
        self.assertEqual(self.gespeichert["beleg.pdf"]["status"], "wartet_pruefung")

    def test_abschaltbar(self):
        bereit, warten = finisher.teile_nach_pruefung(
            FakeDoli({1: ""}), {"MAIL_WARTET_AUF_PRUEFUNG": "false"}, [item(1)])
        self.assertEqual(len(bereit), 1)

    def test_dolibarr_nicht_lesbar_blockiert_nicht(self):
        class Kaputt:
            def get(self, p):
                raise RuntimeError("HTTP 500")
        bereit, _ = finisher.teile_nach_pruefung(Kaputt(), {}, [item(1)])
        self.assertEqual(len(bereit), 1)

class KeineFreigabeMail(unittest.TestCase):
    def test_standard_ist_ohne_mail(self):
        # Freigabe läuft seit 17.09.2026 nur über die App.
        quelle = open("finisher.py", encoding="utf-8").read()
        self.assertIn('cfg.get("FREIGABE_PER_MAIL", "false")', quelle)
        self.assertIn("keine Mail", quelle)


if __name__ == "__main__":
    unittest.main()
