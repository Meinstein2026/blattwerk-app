import { addOutbox, getOutbox, putBlob, deleteOutbox, deleteBlob } from "./db.js";
import { runSync as _runSync } from "./sync.js";
import { putReceipt } from "./receipt.js";

export { readRefs, refreshRefCache, getRefStatus } from "./cache.js";

export async function enqueue({ type, payload, blob = null, deps = [], createdBy = "" }) {
  const id = crypto.randomUUID();
  let blobKey = null;
  if (blob) { blobKey = crypto.randomUUID(); await putBlob(blobKey, blob); }
  await addOutbox({
    id, type, payload, blobKey, deps,
    status: "pending", error: null,
    createdAt: new Date().toISOString(), createdBy,
  });
  return id;
}

export async function getPending() { return getOutbox(); }

// Verwirft einen Warteschlangen-Eintrag endgültig (Nutzer-Aktion aus der
// Queue-Modal, z.B. für "review"-Einträge ohne Auto-Retry). Löscht den
// zugehörigen Beleg-Blob mit, falls vorhanden, damit kein Datenmüll bleibt.
export async function dismissEntry(id) {
  const entry = (await getOutbox()).find(e => e.id === id);
  if (entry?.blobKey) await deleteBlob(entry.blobKey);
  await deleteOutbox(id);
}

export function runSync({ api, saveTimeSpent, createThirdpartyWithFallback, submitSupplierInvoice, createCalendarForSyncedEntry }) {
  return _runSync({ api, saveTimeSpent, putReceipt, createThirdpartyWithFallback, submitSupplierInvoice, createCalendarForSyncedEntry });
}

export function isOnline() { return navigator.onLine; }

export function onConnectivity(cb) {
  const on = () => cb(true), off = () => cb(false);
  window.addEventListener("online", on);
  window.addEventListener("offline", off);
  return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
}
