// Reine Outbox-Kernlogik — keine Browser-APIs, isoliert testbar.

const byCreatedAt = (a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""));

// Status, die runSync in einem Lauf verarbeitet. "review" ist bewusst NICHT
// dabei: das sind Zeitbuchungen, die evtl. schon in Dolibarr gebucht wurden
// (App/Tab starb mitten im Request) und für die es keine Möglichkeit gibt,
// das serverseitig zu prüfen -> sie warten auf eine manuelle Entscheidung
// des Nutzers statt automatisch erneut gesendet zu werden.
const PROCESSABLE_STATUSES = ["pending", "error", "syncing"];
export function isProcessable(entry) {
  return PROCESSABLE_STATUSES.includes(entry.status);
}

// Topologische Reihenfolge über `deps` (lokale UIDs), Ties nach createdAt.
export function orderQueue(entries) {
  const remaining = [...entries];
  const done = new Set();
  const out = [];
  while (remaining.length) {
    const ready = remaining
      .filter(e => (e.deps || []).every(d => done.has(d)))
      .sort(byCreatedAt);
    if (!ready.length) { // Zyklus/fehlende dep: Rest stabil anhängen
      out.push(...remaining.sort(byCreatedAt));
      break;
    }
    const next = ready[0];
    out.push(next);
    done.add(next.id);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return out;
}

// Ersetzt "local:<uuid>"-Werte in bekannten Ref-Feldern durch echte IDs.
const REF_FIELDS = ["projectRef", "thirdpartyRef", "taskOrProjectRef", "projectId", "taskId", "supplierRef", "projectid"];
export function resolveRefs(payload, idMap) {
  const out = { ...payload };
  for (const k of REF_FIELDS) {
    const v = out[k];
    if (typeof v === "string" && v.startsWith("local:")) {
      const real = idMap.get(v.slice("local:".length));
      if (real != null) out[k] = real;
    }
  }
  return out;
}

// Erster Eintrag, dessen deps vollständig in doneIdSet sind.
export function nextRunnable(entries, doneIdSet) {
  for (const e of orderQueue(entries)) {
    if ((e.deps || []).every(d => doneIdSet.has(d))) return e;
  }
  return null;
}
