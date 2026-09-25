#!/usr/bin/env python3
# HTTP-Extraktions-Dienst für Beleg-Erkennung — nutzt dieselbe mehrstufige
# Pipeline wie worker_ocr.py (RapidOCR -> Text-LLM -> Validierung -> Korrektur ->
# Vision-Crop), aber synchron per HTTP statt über die Nextcloud-Queue.
#
# Konsument: die Finanzen-App (Handy) — schickt ein Belegfoto, bekommt das
# Beleg-JSON zurück. Kein Nextcloud-Zugang nötig, nur Ollama.
#
#   GET  /health            -> {"ok": true, ...}   (ohne Auth, für Erreichbarkeits-Check)
#   POST /extract           -> Beleg-JSON          (Header X-Auth-Token = EXTRACT_TOKEN)
#        Body: {"name": "beleg.jpg", "image": "<base64 (auch DataURL ok)>"}
#
# .env-Schlüssel: EXTRACT_PORT (8743), EXTRACT_TOKEN (Pflicht),
#                 OLLAMA_URL/OLLAMA_TEXT_MODEL/OLLAMA_MODEL/... wie worker_ocr.py
#
# Läuft auf dem Windows-PC (RTX 3060, Sekunden) und auf .41 (CPU, Minuten).
import base64
import json
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from common import load_env, log
from worker import prepare_image
from worker_ocr import extract

CFG = load_env()
# Ollama kann nur einen Beleg gleichzeitig sinnvoll bearbeiten -> serialisieren
EXTRACT_LOCK = threading.Lock()


def modellname():
    """Was tatsächlich liest: großes Modell über die API, sonst das Textmodell."""
    if (CFG.get("TEXT_API_URL") or CFG.get("BILD_API_URL")) \
            and str(CFG.get("TEXT_UEBER_API", "true")).lower() != "false":
        return CFG.get("TEXT_API_MODEL") or CFG.get("OLLAMA_BILD_MODEL", "qwen2.5vl:7b")
    return CFG.get("OLLAMA_TEXT_MODEL", "qwen2.5:3b-instruct")


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        # CORS offen: Auth läuft über den Token, und die App nutzt nativen HTTP —
        # die Header braucht nur der Browser-Dev-Preview.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Auth-Token")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        if self.path.rstrip("/") == "/health":
            self._send(200, {"ok": True, "dienst": "beleg-extract",
                             "host": socket.gethostname(),
                             "modell": modellname()})
        else:
            self._send(404, {"ok": False, "fehler": "unbekannter Pfad"})

    def do_POST(self):
        if self.path.rstrip("/") != "/extract":
            return self._send(404, {"ok": False, "fehler": "unbekannter Pfad"})
        token = CFG.get("EXTRACT_TOKEN", "")
        if not token or self.headers.get("X-Auth-Token") != token:
            return self._send(401, {"ok": False, "fehler": "ungültiger Token"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 25 * 1024 * 1024:
                return self._send(413, {"ok": False, "fehler": "Datei zu groß"})
            req = json.loads(self.rfile.read(length))
            name = req.get("name") or "beleg.jpg"
            b64 = req.get("image") or ""
            if "," in b64[:80]:  # DataURL-Präfix abwerfen
                b64 = b64.split(",", 1)[1]
            data = base64.b64decode(b64)
        except Exception as e:
            return self._send(400, {"ok": False, "fehler": f"ungültige Anfrage: {e}"})
        try:
            with EXTRACT_LOCK:
                log(f"extract: {name} ({len(data)} bytes)")
                jpeg = prepare_image(name, data, max_px=int(CFG.get("BELEG_MAX_PX", "1568")))
                res, errors, _text = extract(CFG, name, jpeg)
            self._send(200, {"ok": not errors, "beleg": res, "fehler": errors})
            log(f"  -> {'ok' if not errors else errors}: {res.get('lieferant')} "
                f"{res.get('datum')} {res.get('gesamt_brutto')} € ({res.get('_dauer_s')}s)")
        except Exception as e:
            log(f"  -> Ausnahme: {e}")
            self._send(500, {"ok": False, "fehler": str(e)})

    def log_message(self, *args):  # eigene log()-Ausgaben reichen
        pass


def main():
    if not CFG.get("EXTRACT_TOKEN"):
        raise SystemExit("EXTRACT_TOKEN fehlt in .env — Dienst startet nicht ohne Auth.")
    port = int(CFG.get("EXTRACT_PORT", "8743"))
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    log(f"Beleg-Extraktions-Dienst auf Port {port} "
        f"(Modell {modellname()})")
    srv.serve_forever()


if __name__ == "__main__":
    main()
