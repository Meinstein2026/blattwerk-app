#!/usr/bin/env python3
# Einmaliges Setup: Nextcloud Login Flow v2.
# Zeigt eine URL an — dort im Browser anmelden und Zugriff gewähren. Das dabei
# erzeugte App-Passwort landet automatisch in pipeline/.env (NC_USER/NC_PASS).
# Das Gerät erscheint in Nextcloud unter Einstellungen → Sicherheit und ist
# dort jederzeit widerrufbar.
import json
import os
import sys
import time
import urllib.request

from common import BASE_DIR, load_env


def main():
    cfg = load_env()
    base = (sys.argv[1] if len(sys.argv) > 1 else cfg.get("NC_BASE", "")).rstrip("/")
    if not base:
        print("Aufruf: python3 setup_login.py https://nextcloud.example.org")
        sys.exit(1)

    req = urllib.request.Request(base + "/index.php/login/v2", method="POST",
                                 headers={"User-Agent": "Blattwerk Beleg-Pipeline"})
    flow = json.load(urllib.request.urlopen(req, timeout=30))
    print("\n1) Diese URL im Browser öffnen und anmelden:\n")
    print("   " + flow["login"])
    print("\n2) Zugriff gewähren. Ich warte hier (max. 10 Minuten) ...\n")

    poll = flow["poll"]
    data = ("token=" + poll["token"]).encode()
    deadline = time.time() + 600
    while time.time() < deadline:
        try:
            r = urllib.request.urlopen(urllib.request.Request(
                poll["endpoint"], data=data, method="POST"), timeout=30)
            creds = json.load(r)
            break
        except urllib.error.HTTPError:
            time.sleep(3)
    else:
        print("Timeout — Login wurde nicht abgeschlossen.")
        sys.exit(1)

    env_path = os.path.join(BASE_DIR, ".env")
    lines = []
    if os.path.exists(env_path):
        lines = [l for l in open(env_path, encoding="utf-8").read().splitlines()
                 if not l.startswith(("NC_BASE=", "NC_USER=", "NC_PASS="))]
    lines += [f"NC_BASE={creds['server']}", f"NC_USER={creds['loginName']}",
              f"NC_PASS={creds['appPassword']}"]
    with open(env_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    os.chmod(env_path, 0o600)
    print(f"OK — App-Passwort für '{creds['loginName']}' gespeichert in {env_path} (chmod 600).")


if __name__ == "__main__":
    main()
