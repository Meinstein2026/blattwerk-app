@echo off
rem Blattwerk Beleg-Worker — Einmal-Setup fuer den Windows-PC (RTX 3060).
rem Doppelklick genuegt. Macht: nach C:\beleg-worker kopieren, Python-Pakete
rem installieren, Vision-Modell laden, Nextcloud-Login, Testlauf, Autostart.
setlocal
set TARGET=C:\beleg-worker

echo === [1/6] Voraussetzungen pruefen ===
where python >nul 2>nul || (echo FEHLER: Python nicht gefunden - erst Python installieren ^(python.org, "Add to PATH" anhaken^). & pause & exit /b 1)
where ollama >nul 2>nul || (echo FEHLER: Ollama nicht gefunden - erst Ollama installieren ^(ollama.com^). & pause & exit /b 1)

echo === [2/6] Nach %TARGET% kopieren ===
if /i not "%~dp0"=="%TARGET%\" (
  mkdir "%TARGET%" 2>nul
  copy /y "%~dp0common.py" "%TARGET%\" >nul
  copy /y "%~dp0worker.py" "%TARGET%\" >nul
  copy /y "%~dp0setup_login.py" "%TARGET%\" >nul
  copy /y "%~dp0README.md" "%TARGET%\" >nul 2>nul
)
cd /d "%TARGET%"

echo === [3/6] Python-Pakete installieren ===
python -m pip install --quiet pillow pypdfium2 || (echo FEHLER bei pip install. & pause & exit /b 1)

echo === [4/6] Vision-Modell laden (qwen2.5vl:7b, ~6 GB, einmalig) ===
ollama pull qwen2.5vl:7b || (echo FEHLER: ollama pull fehlgeschlagen - laeuft Ollama? & pause & exit /b 1)

echo === [5/6] Nextcloud-Anmeldung (einmalig) ===
if "%NC_BASE_URL%"=="" set NC_BASE_URL=https://nextcloud.example.org
if exist "%TARGET%\.env" (
  echo    .env existiert schon - Login uebersprungen.
) else (
  echo    Gleich erscheint eine URL: im Browser oeffnen, anmelden, Zugriff gewaehren.
  echo    Echte Nextcloud-Adresse vorher setzen: set NC_BASE_URL=https://...
  python setup_login.py %NC_BASE_URL% || (echo FEHLER beim Nextcloud-Login. & pause & exit /b 1)
)

echo === [6/6] Testlauf + Autostart einrichten ===
python worker.py
schtasks /Create /TN "Blattwerk Beleg-Worker" /SC ONLOGON /TR "pythonw %TARGET%\worker.py --loop" /RL LIMITED /F
if errorlevel 1 (
  echo WARNUNG: Geplante Aufgabe konnte nicht angelegt werden - setup.bat einmal "Als Administrator ausfuehren".
) else (
  echo Autostart eingerichtet. Worker startet ab jetzt bei jeder Anmeldung und prueft alle 5 Min.
  echo Fuer sofortigen Start ohne Neuanmeldung:
  schtasks /Run /TN "Blattwerk Beleg-Worker"
)
echo.
echo === Fertig. Logs: %TARGET% / Nextcloud _queue\extracted ===
pause
