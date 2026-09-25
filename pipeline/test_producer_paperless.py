#!/usr/bin/env python3
# Tests fuer die Paperless-Abholung im Producer (ohne Netz).
import json
import unittest

import producer

CFG = {"PL_BASE": "http://pl:8010/", "PL_TOKEN": "t"}

STAMM = {
    ("GET", "/api/tags/?name__iexact=Quelle%2FApp"): (200, {"results": [{"id": 11, "name": "Quelle/App"}]}),
    ("GET", "/api/tags/?name__iexact=Pipeline%2F%C3%BCbergeben"): (200, {"results": [{"id": 12, "name": "Pipeline/übergeben"}]}),
    ("GET", "/api/tags/?name__iexact=Beleg%2Fzur%20Buchhaltung"): (200, {"results": [{"id": 13, "name": "Beleg/zur Buchhaltung"}]}),
    ("GET", "/api/document_types/?name__iexact=Kassenbeleg"): (200, {"results": [{"id": 46, "name": "Kassenbeleg"}]}),
    ("GET", "/api/document_types/?name__iexact=Rechnung"): (200, {"results": [{"id": 27, "name": "Rechnung"}]}),
    ("GET", "/api/document_types/?name__iexact=Quittung"): (200, {"results": [{"id": 20, "name": "Quittung"}]}),
}


class FakeDav:
    def __init__(self):
        self.puts = []

    def put(self, rel, data):
        self.puts.append((rel, data))


class Abholung(unittest.TestCase):
    def setUp(self):
        self.alt = producer.http
        self.aufrufe = []

    def tearDown(self):
        producer.http = self.alt

    def netz(self, extra):
        antworten = {**STAMM, **extra}

        def http(method, url, headers=None, data=None, timeout=60):
            self.aufrufe.append((method, url, json.loads(data) if data else None))
            for (m, teil), (status, body) in antworten.items():
                if m == method and teil in url:
                    return status, body if isinstance(body, bytes) else json.dumps(body).encode(), {}
            return 404, b"{}", {}
        producer.http = http

    def test_ohne_konfiguration_nichts(self):
        def verboten(*a, **k):
            raise AssertionError("kein Netz erwartet")
        producer.http = verboten
        self.assertEqual(producer.paperless_holen({}, FakeDav()), 0)

    def test_beide_wege_ohne_doppel(self):
        self.netz({
            ("GET", "tags__id__all=11,13&tags__id__none=12"): (200, {"results": [
                {"id": 5, "original_file_name": "scan.pdf"}]}),
            ("GET", "document_type__id__in=46,27,20"): (200, {"results": [
                {"id": 5, "original_file_name": "scan.pdf"}, {"id": 6, "original_file_name": "bon.jpg"}]}),
            ("GET", "/api/documents/5/download/?original=true"): (200, b"PDF5"),
            ("GET", "/api/documents/6/download/?original=true"): (200, b"JPG6"),
            ("POST", "/api/documents/bulk_edit/"): (200, {"result": "OK"}),
        })
        dav = FakeDav()
        self.assertEqual(producer.paperless_holen(CFG, dav), 2)
        self.assertEqual(dav.puts, [("_queue/pending/pl5_scan.pdf", b"PDF5"), ("_queue/pending/pl6_bon.jpg", b"JPG6")])
        markiert = [a[2] for a in self.aufrufe if a[0] == "POST"]
        self.assertEqual(markiert, [
            {"documents": [5], "method": "add_tag", "parameters": {"tag": 12}},
            {"documents": [6], "method": "add_tag", "parameters": {"tag": 12}},
        ])
        self.assertTrue(all(a[1].startswith("http://pl:8010/api/") for a in self.aufrufe))

    def test_download_fehler_wird_nicht_markiert(self):
        self.netz({
            ("GET", "tags__id__all=11,13&tags__id__none=12"): (200, {"results": []}),
            ("GET", "document_type__id__in=46,27,20"): (200, {"results": [{"id": 6, "original_file_name": "bon.jpg"}]}),
            ("GET", "/api/documents/6/download/?original=true"): (500, b"kaputt"),
        })
        dav = FakeDav()
        self.assertEqual(producer.paperless_holen(CFG, dav), 0)
        self.assertEqual(dav.puts, [])
        self.assertFalse(any(a[0] == "POST" for a in self.aufrufe))

    def test_fehlende_tags_melden_statt_raten(self):
        self.netz({("GET", "/api/tags/?name__iexact=Quelle%2FApp"): (200, {"results": []})})
        with self.assertRaises(RuntimeError):
            producer.paperless_holen(CFG, FakeDav())

    def test_dateiname_ohne_schraegstrich(self):
        self.netz({
            ("GET", "tags__id__all=11,13&tags__id__none=12"): (200, {"results": [
                {"id": 7, "original_file_name": "../x y.pdf"}]}),
            ("GET", "document_type__id__in=46,27,20"): (200, {"results": []}),
            ("GET", "/api/documents/7/download/?original=true"): (200, b"X"),
            ("POST", "/api/documents/bulk_edit/"): (200, {"result": "OK"}),
        })
        dav = FakeDav()
        producer.paperless_holen(CFG, dav)
        rel = dav.puts[0][0]
        self.assertTrue(rel.startswith("_queue/pending/pl7_"))
        self.assertNotIn("/", rel[len("_queue/pending/"):])


if __name__ == "__main__":
    unittest.main()
