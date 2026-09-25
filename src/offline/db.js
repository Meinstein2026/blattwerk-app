import { openDB } from "idb";

const DB_NAME = "blattwerk-offline";
const DB_VERSION = 2;

export function openDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("refcache")) db.createObjectStore("refcache"); // key: "typ:id" bzw. "__meta:key"
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
      // idmap: lokale UID (outbox-entry.id) -> echte Server-ID, durabel über runSync()-Läufe hinweg
      if (!db.objectStoreNames.contains("idmap")) db.createObjectStore("idmap");
    },
  });
}

// --- Referenz-Cache ---
export async function putRef(typ, id, obj) {
  const db = await openDb();
  await db.put("refcache", obj, `${typ}:${id}`);
}
// Ganzen Satz in EINEM Vorgang schreiben. Einzeln geschrieben startet
// IndexedDB je Datensatz einen eigenen Vorgang — bei ein paar hundert Artikeln
// sind das ein paar hundert Umlaeufe, und die liegen beim App-Start genau dort,
// wo der Bildschirm noch aufgebaut wird.
export async function putRefs(typ, eintraege) {
  if (!eintraege?.length) return;
  const db = await openDb();
  const tx = db.transaction("refcache", "readwrite");
  for (const [id, obj] of eintraege) tx.store.put(obj, `${typ}:${id}`);
  await tx.done;
}
export async function getAllRefs(typ) {
  const db = await openDb();
  const out = [];
  let cursor = await db.transaction("refcache").store.openCursor();
  const prefix = `${typ}:`;
  while (cursor) {
    if (String(cursor.key).startsWith(prefix)) out.push(cursor.value);
    cursor = await cursor.continue();
  }
  return out;
}
export async function clearRefType(typ) {
  const db = await openDb();
  const tx = db.transaction("refcache", "readwrite");
  let cursor = await tx.store.openCursor();
  const prefix = `${typ}:`;
  while (cursor) { if (String(cursor.key).startsWith(prefix)) await cursor.delete(); cursor = await cursor.continue(); }
  await tx.done;
}
export async function setRefMeta(key, val) { const db = await openDb(); await db.put("refcache", val, `__meta:${key}`); }
export async function getRefMeta(key) { const db = await openDb(); return db.get("refcache", `__meta:${key}`); }

// --- Outbox ---
export async function addOutbox(entry) { const db = await openDb(); await db.put("outbox", entry); }
export async function getOutbox() { const db = await openDb(); return db.getAll("outbox"); }
export async function updateOutbox(id, patch) {
  const db = await openDb();
  const cur = await db.get("outbox", id);
  if (cur) await db.put("outbox", { ...cur, ...patch });
}
export async function deleteOutbox(id) { const db = await openDb(); await db.delete("outbox", id); }

// --- Id-Map (durabel: lokale UID -> echte Server-ID) ---
export async function setIdMap(localId, realId) { const db = await openDb(); await db.put("idmap", realId, localId); }
export async function getAllIdMap() {
  const db = await openDb();
  const keys = await db.getAllKeys("idmap");
  const vals = await db.getAll("idmap");
  const m = {};
  keys.forEach((k, i) => { m[k] = vals[i]; });
  return m;
}
export async function deleteIdMap(localId) { const db = await openDb(); await db.delete("idmap", localId); }

// --- Blobs ---
export async function putBlob(key, blob) { const db = await openDb(); await db.put("blobs", blob, key); }
export async function getBlob(key) { const db = await openDb(); return db.get("blobs", key); }
export async function deleteBlob(key) { const db = await openDb(); await db.delete("blobs", key); }
