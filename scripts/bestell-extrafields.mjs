// scripts/bestell-extrafields.mjs
// Seit 09/2026 legt die Admin-Seite („Dolibarr prüfen & einrichten“, Modul blattwerkapp)
// diese Felder selbst an — dieses Skript bleibt fuer Instanzen ohne blattwerkapp.
// Einmalig je Instanz: die vier Zusatzfelder der Lieferantenbestellung anlegen
// (llx_commande_fournisseur_extrafields) — Prioritaet, Kategorie,
// Foerderprogramm, Foerderstatus. Mehrfach ausfuehrbar: ein Feld, das es
// schon gibt, meldet Dolibarr als Fehler, und der wird nur ausgegeben.
// Braucht einen Admin-Schluessel (Setup-Endpunkte).
//
// Aufruf:
//   DOLIBARR_URL=https://dolibarr.example.org DOLAPIKEY=… node scripts/bestell-extrafields.mjs
//
// Schlaegt POST /setup/extrafields/commande_fournisseur/<name> mit 404 fehl,
// kennt die Dolibarr-Fassung den Endpunkt nicht: dann die Felder von Hand
// anlegen unter Startseite -> Einstellungen -> Lieferanten -> Zusatzattribute
// (Bestellungen), Namen und Typen wie in BESTELL_EXTRAFELDER.
//
// Ohne diese Felder laeuft die App weiter: bestellZusatz() liest dann leere
// Werte, der Foerder-Check im Formular funktioniert trotzdem — nur gemerkt
// wird nichts.
import { BESTELL_EXTRAFELDER } from "../src/foerderung.js";

const URL_ = String(process.env.DOLIBARR_URL || "").replace(/\/+$/, "");
const KEY = process.env.DOLAPIKEY;
if (!URL_ || !KEY) {
  console.error("DOLIBARR_URL und DOLAPIKEY muessen gesetzt sein");
  process.exit(1);
}

let pos = 100;
for (const f of BESTELL_EXTRAFELDER) {
  const body = {
    label: f.label, type: f.type, size: f.size, elementtype: "commande_fournisseur",
    pos: String(pos++), list: "1", alwayseditable: "1", enabled: "1",
  };
  const r = await fetch(`${URL_}/api/index.php/setup/extrafields/commande_fournisseur/${f.name}`, {
    method: "POST",
    headers: { DOLAPIKEY: KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (r.ok) console.log(`angelegt: ${f.name}`);
  else console.log(`${f.name}: Status ${r.status} — ${text.slice(0, 200)}`);
}
