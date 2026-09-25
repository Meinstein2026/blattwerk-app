// scripts/quali-extrafields.mjs
// Seit 09/2026 legt die Admin-Seite („Dolibarr prüfen & einrichten“, Modul blattwerkapp)
// diese Felder selbst an — dieses Skript bleibt fuer Instanzen ohne blattwerkapp.
// Einmalig: die fuenf Qualifikations-Felder am Dolibarr-Benutzer anlegen
// (llx_user_extrafields). Mehrfach ausfuehrbar — ein Feld, das es schon
// gibt, meldet Dolibarr als Fehler, und der wird nur ausgegeben, nicht
// geworfen. Braucht einen Admin-Schluessel (Setup-Endpunkte).
//
// Aufruf:
//   DOLIBARR_URL=https://dolibarr.example.org DOLAPIKEY=… node scripts/quali-extrafields.mjs
//
// Schlaegt POST /setup/extrafields/user/<name> mit 404 fehl, kennt die
// Dolibarr-Fassung den Endpunkt nicht: dann die Felder von Hand anlegen unter
// Startseite -> Einstellungen -> Benutzer & Gruppen -> Zusatzattribute
// (Namen, Typen und Groessen wie in QUALI_DOLIBARR_EXTRAFELDER).
import { QUALI_DOLIBARR_EXTRAFELDER } from "../src/qualifikationen.js";

const URL_ = String(process.env.DOLIBARR_URL || "").replace(/\/+$/, "");
const KEY = process.env.DOLAPIKEY;
if (!URL_ || !KEY) {
  console.error("DOLIBARR_URL und DOLAPIKEY muessen gesetzt sein");
  process.exit(1);
}

let pos = 100;
for (const f of QUALI_DOLIBARR_EXTRAFELDER) {
  const body = {
    label: f.label, type: f.type, size: f.size, elementtype: "user",
    pos: String(pos++), list: "1", alwayseditable: "1", enabled: "1",
  };
  const r = await fetch(`${URL_}/api/index.php/setup/extrafields/user/${f.name}`, {
    method: "POST",
    headers: { DOLAPIKEY: KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (r.ok) console.log(`angelegt: ${f.name}`);
  else console.log(`${f.name}: Status ${r.status} — ${text.slice(0, 200)}`);
}
