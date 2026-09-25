import { getOutbox, updateOutbox, deleteOutbox, getBlob, deleteBlob, setIdMap, getAllIdMap } from "./db.js";
import { orderQueue, resolveRefs, isProcessable } from "./outbox.js";

// Legt einen offline erfassten Datensatz in Dolibarr an bzw. lädt den Beleg hoch.
// Gibt die echte Server-ID zurück (oder null, wenn keine ID entsteht, z.B. Beleg).
async function applyEntry(entry, { api, saveTimeSpent, putReceipt, createThirdpartyWithFallback, submitSupplierInvoice, createCalendarForSyncedEntry }, idMap) {
  const p = resolveRefs(entry.payload || {}, idMap);
  const tag = `[offline:${entry.id}]`; // Idempotenz-/Herkunftsmarker
  switch (entry.type) {
    case "thirdparty": {
      // Idempotenz: falls ein vorheriger Lauf hier abgestürzt ist (Create bei
      // Dolibarr angekommen, Outbox-Eintrag aber nie gelöscht), existiert der
      // Datensatz ggf. schon -> per Marker suchen statt blind neu anzulegen.
      const existing = await api.findThirdpartyByMarker(tag);
      if (existing != null) return existing;
      // Offline-Formulare erfassen nie einen manuellen Kunden-/Lieferantencode
      // (siehe ThirdpartyForm) -> userProvidedCode ist beim Replay immer false,
      // d.h. es greift immer der "auto"-Code + Fallback-Pfad wie online.
      const payload = { ...p, client: p.client ?? 0, fournisseur: p.fournisseur ?? 0, note_private: tag };
      const type = payload.fournisseur ? "supplier" : "customer";
      const r = await createThirdpartyWithFallback(api, payload, type, false);
      return Number(r?.id ?? r);
    }
    case "project": {
      const existing = await api.findProjectByMarker(tag);
      let realId;
      if (existing != null) {
        realId = existing; // Recovery: Projekt existiert schon (Marker-Treffer)
      } else {
        const r = await api.createProject({
          title: p.title, socid: p.thirdpartyRef || null,
          date_start: p.dateStart || null, date_end: p.dateEnd || null,
          ref: p.ref, public: p.public ?? 1,
          note_private: tag,
        });
        realId = Number(r?.id ?? r);
      }
      // Kalender-Nachsync (Dolibarr-Agenda + Nextcloud): best-effort, auf BEIDEN
      // Pfaden (frisch angelegt UND per Marker wiedergefunden) — der CalDAV-PUT
      // ist über die stabile UID blattwerk-project-<id> idempotent, sodass auch
      // ein wiederhergestelltes Projekt seinen Termin bekommt. Ein Fehler hier
      // darf den Outbox-Eintrag NICHT auf "error" setzen (sonst würde ein Retry
      // das Projekt erneut anzulegen versuchen). Deshalb eigenes try/catch.
      try { await createCalendarForSyncedEntry?.(api, "project", realId, p); }
      catch (e) { console.warn("Kalender-Nachsync (Projekt) fehlgeschlagen", e); }
      return realId;
    }
    case "task": {
      const existing = await api.findTaskByMarker(tag);
      if (existing != null) return existing;
      const r = await api.createTask({ label: p.label, fk_project: p.projectRef, note_private: tag });
      return Number(r?.id ?? r);
    }
    case "supplierinvoice": {
      const existing = await api.findSupplierInvoiceByMarker(tag);
      if (existing != null) return existing;
      // v1: nur bereits gecachte Artikel (siehe SupplierInvoiceForm.save) - Zeilen
      // sind hier schon Dolibarr-fertig (subprice/tva_tx/fk_product/account).
      // Entsteht bewusst als Entwurf, kein validateSupplierInvoice-Aufruf.
      const r = await submitSupplierInvoice(api, {
        socid: p.supplierRef,
        ref_supplier: p.ref_supplier,
        date: p.date,
        date_lim_reglement: p.dueDate,
        note_public: p.note || "",
        note_private: tag,
        lines: p.lines,
        lieferantName: p.supplierName, // Konto-Gedächtnis (Task 8), optional
        ...(p.projectid ? { fk_project: p.projectid } : {}),
      });
      const c = r?.created;
      return Number(typeof c === "number" ? c : (c?.id ?? c?.rowid));
    }
    case "time": {
      const taskId = p.taskOrProjectRef; // bereits auf echte Task-ID aufgelöst
      await saveTimeSpent(api, taskId, {
        date: p.date, duration: p.durationSeconds, userId: p.userId, note: (p.note || "") + " " + tag,
      });
      return null;
    }
    case "receipt": {
      const blob = await getBlob(entry.blobKey);
      if (!blob) throw new Error("Belegfoto fehlt lokal");
      const stamp = (entry.createdAt || "").replace(/[:.]/g, "-");
      await putReceipt({ blob, filename: `offline-${stamp}-${entry.id.slice(0, 8)}.jpg` });
      return null;
    }
    default:
      throw new Error("Unbekannter Typ: " + entry.type);
  }
}

// Spielt die gesamte Outbox sequenziell ab. Idempotent: bereits erledigte
// Einträge sind gelöscht; ein Wiederlauf verarbeitet nur pending/error.
export async function runSync(deps) {
  // Einträge, die beim letzten Lauf mitten im Request unterbrochen wurden
  // (App/Tab gekillt), hängen sonst für immer auf "syncing" fest.
  // Für alle Typen außer "time" ist ein Reset auf "pending" sicher: die
  // Marker-Suche vor dem Anlegen (thirdparty/project/task/supplierinvoice,
  // siehe applyEntry) dedupliziert einen eventuellen Wiederholungs-Request
  // serverseitig. Für "time" macht das bisher niemand: Dolibarr 23 hätte zwar
  // `GET /tasks/{id}/timespent`, und der Marker steht unten auch in der Notiz —
  // die Suche danach ist nur nie gebaut worden (12.08.2026 nachgesehen, wäre ein
  // eigener Umbau wert). Bis dahin gilt weiter: ein "syncing"-Zeiteintrag könnte
  // serverseitig bereits gebucht sein und
  // darf NIE blind erneut gesendet werden. Er wird stattdessen auf "review"
  // geparkt (kein Auto-Retry, siehe isProcessable) und dem Nutzer mit einer
  // klaren Meldung angezeigt.
  const raw = (await getOutbox()).filter(isProcessable);
  const all = [];
  for (const e of raw) {
    if (e.status === "syncing") {
      if (e.type === "time") {
        await updateOutbox(e.id, {
          status: "review",
          error: "Zeitbuchung evtl. schon übertragen – bitte in Dolibarr prüfen",
        });
        continue; // nicht in diesen Lauf aufnehmen -> kein Auto-Retry
      }
      e.status = "pending";
      await updateOutbox(e.id, { status: "pending" });
    }
    all.push(e);
  }
  const ordered = orderQueue(all);
  const allIds = new Set(all.map(e => e.id));
  // Durabler Id-Map-Speicher überlebt einen Lauf, in dem ein abhängiger
  // Eintrag im selben Pass fehlschlägt, nachdem sein Producer schon erledigt
  // und aus der Outbox gelöscht wurde.
  const persisted = await getAllIdMap();
  const idMap = new Map(Object.entries(persisted));
  const doneIds = new Set();
  let done = 0, failed = 0;
  for (const entry of ordered) {
    const missingDeps = (entry.deps || []).filter(d => !doneIds.has(d) && !idMap.has(d));
    if (missingDeps.length) {
      // Wenn die fehlende Abhängigkeit weder in der aktuellen Outbox noch in
      // der Id-Map auftaucht, kann sie nie mehr aufgelöst werden -> Fehler
      // sichtbar machen statt den Eintrag still für immer zu überspringen.
      const unresolvable = missingDeps.find(d => !allIds.has(d) && !idMap.has(d));
      if (unresolvable != null) {
        await updateOutbox(entry.id, { status: "error", error: `Abhängigkeit ${unresolvable} nicht auflösbar` });
        failed++;
      }
      continue;
    }
    await updateOutbox(entry.id, { status: "syncing", error: null });
    try {
      const realId = await applyEntry(entry, deps, idMap);
      if (realId != null && Number.isFinite(realId)) {
        idMap.set(entry.id, realId);
        await setIdMap(entry.id, realId);
      }
      doneIds.add(entry.id);
      if (entry.blobKey) await deleteBlob(entry.blobKey);
      await deleteOutbox(entry.id);
      done++;
    } catch (e) {
      await updateOutbox(entry.id, { status: "error", error: String(e?.message || e) });
      failed++;
    }
  }
  return { done, failed };
}
