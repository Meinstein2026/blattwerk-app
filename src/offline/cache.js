import { putRefs, getAllRefs, clearRefType, setRefMeta, getRefMeta } from "./db.js";

const norm = {
  project: (p) => ({ id: p.id, ref: p.ref, title: p.title, thirdparty_id: p.socid, status: p.statut }),
  task:    (t) => ({ id: t.id, project_id: t.fk_project, label: t.label }),
  // Kunden UND Lieferanten (Dolibarr societe): client/fournisseur-Flags mitnehmen
  thirdparty: (s) => ({ id: s.id, name: s.name, client: s.client, fournisseur: s.fournisseur }),
  product: (p) => ({ id: p.id, ref: p.ref, label: p.label, price: p.price, tva_tx: p.tva_tx }),
};

// Lädt einen Referenztyp neu. WICHTIG: den bestehenden Cache NUR ersetzen,
// wenn das Laden erfolgreich war und Daten lieferte. Schlägt der Fetch fehl
// (offline / Netzfehler / leere Antwort), bleibt der alte Cache unangetastet —
// ein Nachladen im Offline-Zustand darf gute Daten nie zerstören.
// Rückgabe: Anzahl geladener Datensätze bei Erfolg, sonst -1 (Cache unverändert).
async function loadType(typ, fetcher) {
  let rows;
  try { rows = await fetcher(); } catch { return -1; }
  if (!Array.isArray(rows) || rows.length === 0) return -1;
  await clearRefType(typ);
  const satz = rows.map((r) => norm[typ](r)).filter((o) => o.id != null).map((o) => [o.id, o]);
  await putRefs(typ, satz);
  return rows.length;
}

export async function refreshRefCache(api) {
  // Die vier Listen haengen nicht voneinander ab. Nacheinander geholt summieren
  // sich vier Umlaeufe zu Dolibarr (durch den Authentik-Vorbau) beim App-Start;
  // nebeneinander kostet es nur noch den langsamsten davon.
  const [projects, tasks, thirdparties, products] = await Promise.all([
    loadType("project", () => api.getProjects()),
    loadType("task", () => api.getTasks()),
    loadType("thirdparty", () => api.getThirdparties()), // alle (Kunden+Lieferanten)
    loadType("product", () => api.getProducts()),
  ]);
  const anyLoaded = [projects, tasks, thirdparties, products].some((n) => n > 0);
  const at = new Date().toISOString();
  // Zeitstempel nur setzen, wenn wirklich etwas geladen wurde (sonst wäre "synced_at"
  // gesetzt, obwohl der Cache leer/alt ist).
  if (anyLoaded) await setRefMeta("synced_at", at);
  return { projects, tasks, thirdparties, products, at, anyLoaded };
}

export async function readRefs(typ) { return getAllRefs(typ); }
export async function getRefStatus() { return { at: (await getRefMeta("synced_at")) || null }; }
