#!/usr/bin/env python3
# Startet worker_ocr mit fest gepinnter IP für den Nextcloud-Host —
# Workaround für Hotspot-DNS, das den echten Hostnamen mit SERVFAIL
# beantwortet. Host und IP kommen aus der .env (PIN_HOST/PIN_IP), nie aus
# dem Quelltext.
import socket
import sys

from common import load_env

_cfg = load_env()
PIN = {
    _cfg.get("PIN_HOST", "nextcloud.example.org"): _cfg.get("PIN_IP", "203.0.113.1"),
}
_orig = socket.getaddrinfo


def pinned(host, *args, **kw):
    return _orig(PIN.get(host, host), *args, **kw)


socket.getaddrinfo = pinned

import worker_ocr
sys.argv = ["worker_ocr.py"]
worker_ocr.main()
