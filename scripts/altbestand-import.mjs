// Einmaliger Import der alten Arbeitsschutz-PDFs aus Nextcloud nach Paperless.
//
// Mehrfach ausfuehrbar: vor jedem Hochladen wird die Pruefsumme abgefragt, mit
// denselben Helfern wie der Upload aus der App. Der Nextcloud-Ordner bleibt
// unangetastet -- geloescht wird nichts, das ist ausdruecklich kein Umzug,
// sondern eine Kopie.
//
// Aufruf:
//   NC_SERVER=https://… NC_USER=… NC_PASS=… PAPERLESS_TOKEN=… \
//     node scripts/altbestand-import.mjs
import { PL_THEMA, plDuplikat, plPruefsummeQuery, sha256Hex } from "../src/paperless.js";

const NC = process.env.NC_SERVER, USER = process.env.NC_USER, PASS = process.env.NC_PASS;
const PL = (process.env.PAPERLESS_URL || "http://203.0.113.41:8010").replace(/\/+$/, "");
const TOKEN = process.env.PAPERLESS_TOKEN;
if (!NC || !USER || !PASS || !TOKEN) {
  console.error("NC_SERVER, NC_USER, NC_PASS und PAPERLESS_TOKEN muessen gesetzt sein");
  process.exit(1);
}
const ncKopf = { Authorization: "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64") };
const plKopf = { Authorization: "Token " + TOKEN, Accept: "application/json" };
const basis = `${NC}/remote.php/dav/files/${encodeURIComponent(USER)}`;

/** Namen -> ID, wie plId() in server.mjs. */
const idCache = new Map();
async function plId(art, name) {
  const k = art + ":" + name;
  if (idCache.has(k)) return idCache.get(k);
  const r = await fetch(`${PL}/api/${art}/?name__iexact=${encodeURIComponent(name)}`, { headers: plKopf });
  if (!r.ok) throw new Error(`${art} "${name}": Status ${r.status}`);
  const treffer = ((await r.json()).results || [])
    .find((x) => String(x.name).toLowerCase() === name.toLowerCase());
  if (!treffer) throw new Error(`${art} "${name}" fehlt in Paperless`);
  idCache.set(k, treffer.id);
  return treffer.id;
}

/** PROPFIND (Tiefe 1) abrufen -- null bei Fehlerstatus, sonst der Antworttext. */
async function propfind(pfad) {
  const r = await fetch(basis + pfad + "/", {
    method: "PROPFIND", headers: { ...ncKopf, Depth: "1", "Content-Type": "application/xml" },
  });
  if (!r.ok && r.status !== 207) return null;
  return r.text();
}

/**
 * PROPFIND-Antwort in die letzten Pfadteile aller Eintraege zerlegen (Ordner
 * wie Dateien). Praefix-unabhaengig wie parseDirListing() in server.mjs
 * (Zeile ~713) -- manche Nextcloud-Antworten liefern "d:href", andere gar
 * keinen Namensraum-Praefix, das feste "d:" im alten Ausdruck fand dann
 * nichts und liste() kam leer zurueck, ohne dass ein Fehler auffiel. Anders
 * als parseDirListing() werden Ordner hier nicht verworfen: die
 * Jahresordner-Suche unten braucht genau die.
 */
function davNamen(xml) {
  const out = [];
  for (const resp of String(xml).split(/<[a-z0-9]*:?response[\s>]/i).slice(1)) {
    const href = (resp.match(/<[a-z0-9]*:?href>([^<]+)<\/[a-z0-9]*:?href>/i) || [])[1] || "";
    if (!href) continue;
    try { out.push(decodeURIComponent(href.replace(/\/$/, "").split("/").pop() || "")); }
    catch { /* kaputt kodierter Eintrag -- ueberspringen statt abzubrechen */ }
  }
  return out.filter(Boolean);
}

/** Ordnerinhalt per WebDAV, nur die PDF-Dateinamen. */
async function liste(pfad) {
  const xml = await propfind(pfad);
  if (xml === null) return [];
  const treffer = davNamen(xml).filter((n) => /\.pdf$/i.test(n));
  if (!treffer.length) console.log(`  (keine PDF-Dateien in ${pfad})`);
  return treffer;
}

/** Lauf-Bilanz fuer die Zusammenfassung am Ende und den Exitcode. */
const zaehler = { abgelegt: 0, schon: 0, fehlgeschlagen: 0 };

async function ablegen(pfad, name, themen, typ) {
  const datei = await fetch(basis + pfad + "/" + encodeURIComponent(name), { headers: ncKopf });
  if (!datei.ok) { console.log(`  ! ${name}: Nextcloud Status ${datei.status}`); zaehler.fehlgeschlagen++; return; }
  const roh = Buffer.from(await datei.arrayBuffer());

  const hash = await sha256Hex(new Blob([roh]));
  const p = await fetch(`${PL}/api/documents/?${plPruefsummeQuery(hash)}`, { headers: plKopf });
  // Anders als der Nextcloud-Fehler zwei Zeilen drueber: ein Fehlerstatus hier
  // heisst, die Dublettenpruefung ist gar nicht gelaufen -- das darf nicht als
  // "kein Duplikat gefunden" durchgehen, sonst laedt die Datei ungeprueft
  // hoch. Wirft, das aeussere try/catch beendet dann den ganzen Lauf.
  if (!p.ok) throw new Error(`Pruefsummen-Abfrage fuer "${name}": Status ${p.status}`);
  const da = plDuplikat(await p.json());
  if (da) { console.log(`  = ${name}: liegt schon (#${da.id})`); zaehler.schon++; return; }

  // Unterstriche im Dateinamen werden zu Leerzeichen im Titel; ein
  // angehaengtes Datum (_JJJJ-MM-TT.pdf) wird zum Dokumentdatum, bleibt aber
  // nicht Teil des Titeltexts.
  const m = /^(.*?)_(\d{4}-\d{2}-\d{2})\.pdf$/i.exec(name);
  const titel = (m ? m[1] : name.replace(/\.pdf$/i, "")).replace(/_/g, " ");
  const datum = m ? m[2] : "";

  const form = new FormData();
  form.append("document", new Blob([roh], { type: "application/pdf" }), name);
  form.append("title", titel + (datum ? " " + datum : ""));
  if (datum) form.append("created", datum);
  form.append("correspondent", String(await plId("correspondents", "Baum- und Gartenpflege Blattwerk GbR")));
  if (typ) form.append("document_type", String(await plId("document_types", typ)));
  form.append("tags", String(await plId("tags", "Bereich/Blattwerk")));
  for (const thema of themen) form.append("tags", String(await plId("tags", thema)));

  const r = await fetch(`${PL}/api/documents/post_document/`, {
    method: "POST", headers: { Authorization: "Token " + TOKEN, Accept: "application/json" }, body: form,
  });
  if (r.ok) { console.log(`  + ${name}: abgelegt`); zaehler.abgelegt++; }
  else { console.log(`  ! ${name}: Paperless Status ${r.status}`); zaehler.fehlgeschlagen++; }
}

const AS = "/Blattwerk/Arbeitsschutz";
const GBU = "/Blattwerk/Gefährdungsbeurteilungen";

// Ab hier kann die Pruefung scheitern (kaputte Pruefsummen-Antwort, fehlende
// Stammdaten in Paperless) -- dann lieber sauber abbrechen als unbeaufsichtigt
// weiterlaufen und Duplikate zu riskieren. plDuplikat() wirft absichtlich, wenn
// die Antwort kein results-Array enthaelt (siehe src/paperless.js); eine solche
// Ausnahme soll das Skript beenden, nicht als einzelner Dateifehler durchrutschen.
try {
  console.log("Grundlagen:", AS);
  for (const n of await liste(AS)) {
    const einweisung = /einweisung/i.test(n);
    await ablegen(
      AS, n,
      // "Thema/Unterweisung" fehlt in PL_THEMA (src/paperless.js) -- das Modul
      // gehoert einer anderen Aufgabe. Genauso macht es die laufende Paperless-
      // Zweitablage der Einweisungsprotokolle (server.mjs, /api/nc/einweisungen/
      // save) -- deshalb hier ebenfalls direkt als Zeichenkette.
      einweisung ? [PL_THEMA.arbeitsschutz, "Thema/Unterweisung"] : [PL_THEMA.arbeitsschutz],
      einweisung ? "Unterweisung" : "Gefährdungsbeurteilung",
    );
  }

  // Jahresordner: PROPFIND mit Tiefe 1 liefert nur die Ordner, also je Jahr noch
  // einmal hineinsehen. Die Jahreszahlen stehen nicht fest -- es gibt so viele,
  // wie der Betrieb alt ist.
  const jahre = await (async () => {
    const xml = await propfind(GBU);
    if (xml === null) return [];
    const treffer = davNamen(xml).filter((n) => /^\d{4}$/.test(n));
    if (!treffer.length) console.log(`  (keine Jahresordner in ${GBU})`);
    return treffer;
  })();

  for (const jahr of jahre) {
    console.log("Beurteilungen:", jahr);
    for (const n of await liste(`${GBU}/${jahr}`)) {
      await ablegen(`${GBU}/${jahr}`, n, [PL_THEMA.gbu], "Gefährdungsbeurteilung");
    }
  }
  console.log(`fertig: ${zaehler.abgelegt} abgelegt, ${zaehler.schon} bereits vorhanden, ${zaehler.fehlgeschlagen} fehlgeschlagen.`);
} catch (e) {
  console.error(`Abbruch: ${e.message}`);
  process.exit(1);
}
if (zaehler.fehlgeschlagen) process.exit(1);
