# Worker-Setup auf dem Windows-PC (RTX 3060)

## Schnellweg: setup.bat

Voraussetzungen: Python (python.org, "Add to PATH") und Ollama (ollama.com)
installiert. Dann in diesem Ordner **setup.bat doppelklicken** — kopiert alles
nach C:\beleg-worker, installiert Pakete, lädt das Modell, führt den
Nextcloud-Login und einen Testlauf aus und richtet den Autostart ein.
(Falls die Autostart-Aufgabe scheitert: setup.bat einmal „Als Administrator
ausführen".)

## Manuell (falls setup.bat nicht will)

1. Diesen Ordner an einen festen Ort kopieren, z. B. C:\beleg-worker\
   (nicht direkt im Nextcloud-Sync-Ordner laufen lassen)
2. In PowerShell in dem Ordner:
   pip install pillow pypdfium2
   ollama pull qwen2.5vl:7b
3. Einmalig Nextcloud-Zugang holen (URL öffnen, anmelden, Zugriff gewähren):
   python setup_login.py https://nextcloud.example.org
4. Testlauf (sollte anstehende Belege aus _queue/pending verarbeiten):
   python worker.py
5. Autostart bei jeder Anmeldung (Dauerbetrieb solange der PC an ist) —
   PowerShell als Admin:
   schtasks /Create /TN "Blattwerk Beleg-Worker" /SC ONLOGON ^
     /TR "pythonw C:\beleg-worker\worker.py --loop" /RL LIMITED /F
   (pythonw = ohne Konsolenfenster; prüft alle 5 Min auf neue Belege)

Falls die Erkennung schwach ist: ollama pull gemma4:e4b
und in .env die Zeile OLLAMA_MODEL=gemma4:e4b ergänzen.
