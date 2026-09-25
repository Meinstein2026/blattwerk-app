// scripts/mandant/katalog-einspielen.mjs
// Startausstattung fuer ein frisches Dolibarr. Wiederholtes Ausfuehren legt
// nichts doppelt an und ueberschreibt keine geaenderten Preise/Bezeichnungen —
// die Referenz (`ref`) ist der Schluessel.
//
// Nur gegen ein frisches Mandanten-Dolibarr in Schreib-Modus ausfuehren.
// Gegen Blattwerks laufendes Dolibarr NIE ohne --trocken.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Baut den Plan: was fehlt noch (anlegen), was ist schon da (vorhandenBleibt).
// `vorhanden` sind bereits vorhandene Produkte/Leistungen aus Dolibarr
// (mindestens { ref }). Idempotent ueber `ref` — ein zweiter Lauf legt
// nichts doppelt an und laesst vom Kunden geaenderte Preise unangetastet
// (der Katalog traegt bewusst keine Preise, siehe unten).
export const katalogPlan = (katalog, vorhanden, { ustPflichtig }) => {
  const da = new Set((vorhanden || []).map((p) => String(p.ref)));
  const anlegen = katalog
    .filter((e) => !da.has(e.ref))
    .map((e) => ({
      ref: e.ref,
      label: e.label,
      type: e.typ === "service" ? 1 : 0,
      tva_tx: ustPflichtig ? 19 : 0,
      status: e.bereich === "verkauf" ? 1 : 0, // im Verkauf sichtbar
      status_buy: e.bereich === "einkauf" ? 1 : 0, // im Einkauf sichtbar
      price_base_type: "HT",
      // Preise bleiben bewusst leer: die setzt jede Firma selbst, und ein
      // erneuter Lauf soll einen vom Kunden geaenderten Preis nie ueberschreiben.
      note_public: `Einheit: ${e.einheit}`,
      // SKR03-Konto wird NICHT ueber POST mitgeschickt (im Repo bislang nur
      // fuer PUT verifiziert, siehe README) — hier nur durchgereicht, damit
      // main() nach dem Anlegen per PUT nachsetzen kann.
      ...(e.konto ? { konto: e.konto } : {}),
    }));
  return {
    anlegen,
    vorhandenBleibt: katalog.filter((e) => da.has(e.ref)).map((e) => e.ref),
  };
};

// Reparatur-Plan fuer bereits vorhandene Artikel: legt katalogPlan nichts
// doppelt an, kann ein frueherer Lauf trotzdem einen Artikel ohne SKR03-Konto
// zuruecklassen (z. B. weil das nachtraegliche PUT nach dem Anlegen scheiterte
// — dann sieht jeder weitere Lauf nur noch den `ref` und ueberspringt ihn fuer
// immer). Dieser Plan vergleicht das vorhandene `accountancy_code_buy` gegen
// den Katalog, aber NUR ein FEHLENDES Konto wird nachgetragen — genau wie bei
// Preisen/Bezeichnungen gilt: was jemand (Kunde oder Steuerberater) bewusst
// auf ein anderes Konto gelegt hat, ueberschreibt kein spaeterer Lauf. Ein
// abweichendes (aber vorhandenes) Konto wird nur gemeldet, nicht angefasst.
// `reparieren` traegt absichtlich NUR `ref`/`id`/`konto` — Preis, Bezeichnung
// und alle anderen Felder eines vorhandenen Artikels werden nie mitgeschickt.
export const kontoReparaturPlan = (katalog, vorhanden) => {
  const nachRef = new Map((vorhanden || []).map((p) => [String(p.ref), p]));
  const reparieren = [];
  const abweichend = [];
  for (const e of katalog) {
    if (!e.konto) continue; // nur Einkaufsartikel tragen ein SKR03-Konto
    const p = nachRef.get(e.ref);
    if (!p) continue; // noch nicht angelegt — kein Reparaturfall, laeuft ueber katalogPlan
    const aktuell = p.accountancy_code_buy || "";
    if (!aktuell) reparieren.push({ ref: e.ref, id: p.id, konto: e.konto });
    else if (aktuell !== e.konto) abweichend.push({ ref: e.ref, id: p.id, katalogKonto: e.konto, vorhandenesKonto: aktuell });
  }
  return { reparieren, abweichend };
};

// Liest alle vorhandenen Produkte/Leistungen, seitenweise (Dolibarr
// deckelt jede Antwort auf `limit`; ohne Paginierung wuerde ab dem
// 501. Artikel ein zweiter Lauf faelschlich versuchen, bereits
// vorhandene Referenzen erneut anzulegen).
const holeVorhandene = async (url, key) => {
  const limit = 500;
  let page = 0;
  const alle = [];
  for (;;) {
    const r = await fetch(`${url}/api/index.php/products?limit=${limit}&page=${page}`, {
      headers: { DOLAPIKEY: key },
    });
    if (r.status === 404) return alle;
    if (!r.ok) throw new Error("Produkte lesen fehlgeschlagen: HTTP " + r.status);
    const liste = await r.json();
    const stapel = Array.isArray(liste) ? liste : [];
    alle.push(...stapel);
    if (stapel.length < limit) break;
    page += 1;
  }
  return alle;
};

const main = async () => {
  const url = (process.env.DOLIBARR_URL || "").replace(/\/+$/, "");
  const key = process.env.DOLIBARR_KEY;
  const ustPflichtig = process.env.UST_PFLICHTIG === "1";
  const trocken = process.argv.includes("--trocken");
  if (!url || !key) {
    console.error("DOLIBARR_URL und DOLIBARR_KEY setzen");
    process.exit(1);
  }
  const katalog = JSON.parse(fs.readFileSync(path.join(__dirname, "katalog-baumpflege.json"), "utf8"));
  const vorhandene = await holeVorhandene(url, key);
  const plan = katalogPlan(katalog, vorhandene, { ustPflichtig });
  const reparatur = kontoReparaturPlan(katalog, vorhandene);
  console.log(
    `${plan.anlegen.length} neu, ${plan.vorhandenBleibt.length} vorhanden, ` +
    `${reparatur.reparieren.length} Konto-Reparatur, ${reparatur.abweichend.length} abweichendes Konto`
  );
  if (trocken) {
    console.log(plan.anlegen.map((e) => `${e.ref} ${e.label}`).join("\n"));
    if (reparatur.reparieren.length) console.log(reparatur.reparieren.map((r) => `Konto-Reparatur: ${r.ref} -> ${r.konto}`).join("\n"));
    if (reparatur.abweichend.length) {
      console.log(reparatur.abweichend.map((r) =>
        `abweichendes Konto, bleibt unverändert: ${r.ref} (Katalog ${r.katalogKonto}, vorhanden ${r.vorhandenesKonto})`
      ).join("\n"));
    }
    return;
  }
  for (const eintrag of plan.anlegen) {
    const { konto, ...body } = eintrag;
    const r = await fetch(`${url}/api/index.php/products`, {
      method: "POST",
      headers: { DOLAPIKEY: key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      // Eine doppelte Referenz (z. B. weil ein anderer Lauf zwischenzeitlich
      // angelegt hat) ist kein Fehler, sondern "schon da" — sonst wuerde ein
      // harmloser Wettlauf als FEHLER gemeldet, obwohl der Katalog stimmt.
      const text = await r.text().catch(() => "");
      if (/duplicate|already exists|dup(licate)?_ref/i.test(text)) {
        console.log(`vorhanden  ${eintrag.ref} ${eintrag.label} (bereits angelegt)`);
        continue;
      }
      console.log(`FEHLER   ${eintrag.ref} ${eintrag.label} — HTTP ${r.status}`);
      continue;
    }
    const neu = await r.json().catch(() => null);
    const id = neu && (neu.id ?? neu);
    console.log(`angelegt ${eintrag.ref} ${eintrag.label}`);
    if (konto && id) {
      const rk = await fetch(`${url}/api/index.php/products/${id}`, {
        method: "PUT",
        headers: { DOLAPIKEY: key, "Content-Type": "application/json" },
        body: JSON.stringify({ accountancy_code_buy: konto }),
      });
      console.log(`${rk.ok ? "  Konto gesetzt" : "  Konto FEHLER"} ${eintrag.ref} -> ${konto}${rk.ok ? "" : " — HTTP " + rk.status}`);
    }
  }
  for (const r of reparatur.reparieren) {
    // Ausschliesslich das Konto — Preis, Bezeichnung und alles andere am
    // vorhandenen Artikel bleiben unangetastet.
    const rk = await fetch(`${url}/api/index.php/products/${r.id}`, {
      method: "PUT",
      headers: { DOLAPIKEY: key, "Content-Type": "application/json" },
      body: JSON.stringify({ accountancy_code_buy: r.konto }),
    });
    console.log(`${rk.ok ? "  Konto repariert" : "  Konto-Reparatur FEHLER"} ${r.ref} -> ${r.konto}${rk.ok ? "" : " — HTTP " + rk.status}`);
  }
  for (const r of reparatur.abweichend) {
    // Bewusst NICHT geschrieben: jemand hat dieses Konto absichtlich geaendert
    // (Kunde oder Steuerberater) — dasselbe Versprechen wie bei Preisen.
    console.log(`abweichendes Konto, bleibt unverändert: ${r.ref} (Katalog ${r.katalogKonto}, vorhanden ${r.vorhandenesKonto})`);
  }
};

if (process.argv[1] && process.argv[1].endsWith("katalog-einspielen.mjs")) main();
