// Reine Helfer rund um die Paperless-Ablage — keine Netzaufrufe, kein Token.
// Von der App UND von server.mjs importiert, damit Abfrage und Duplikatprüfung
// nur an einer Stelle stehen (dasselbe Muster wie src/arbeitsschutz.js).

/** Schlagwortnamen, wie sie im Archiv wirklich heißen. */
export const PL_THEMA = {
  gbu: "Thema/Gefährdungsbeurteilung",
  pruefprotokoll: "Thema/Prüfprotokoll",
  betriebsdokument: "Thema/Betriebsdokument",
  arbeitsschutz: "Thema/Arbeitsschutz",
};

/**
 * Schlagwort der Einweisungsprotokolle (server.mjs /api/nc/einweisungen/save
 * setzt es zusätzlich zu Thema/Arbeitsschutz). Bewusst NICHT Teil von
 * PL_THEMA: PL_THEMA ist die Whitelist der erlaubten `thema`-Werte für
 * /api/pl/list und /api/pl/file/:id (Befund 1). Zählte dieser Wert dort mit,
 * ließe er sich selbst als `thema` anfordern und würde genau die
 * Einweisungsprotokolle wieder offenlegen, die Befund 3 aus der
 * Grundlagen-Liste heraushält. server.mjs koppelt den Ausschluss serverseitig
 * fest an thema === PL_THEMA.arbeitsschutz (nicht als Wert, den der Aufrufer
 * wählt) — sonst könnte ein Aufruf direkt gegen den Endpunkt (ohne App
 * dazwischen) den Ausschluss einfach weglassen.
 */
export const PL_THEMA_UNTERWEISUNG = "Thema/Unterweisung";

/**
 * Thema -> Funktion (src/funktionen.js), fuer die Funktions-Wache vor
 * /api/pl/upload (mandant-server.mjs paperlessFunktionWache): der Endpunkt
 * nimmt JEDES "Thema/*" entgegen (nicht nur PL_THEMA_ERLAUBT wie /api/pl/list),
 * Paperless traegt neben GBUs aber auch Betriebsanweisungen/Unterweisungen
 * und Einweisungen — je eine eigene Funktion mit eigenem Schalter. Ohne diese
 * Tabelle liesse sich eine abgeschaltete Funktion trotzdem per Direkt-Upload
 * befuellen. Themen ohne Eintrag (z. B. Pruefprotokoll, Betriebsdokument,
 * Arbeitsschutz) haben keine eigene Funktion und bleiben ungegated — dafuer
 * sorgt allein wachePaperless (Block + Dienst).
 */
export const PL_THEMA_FUNKTION = {
  [PL_THEMA.gbu]: "gbu",
  "Thema/Betriebsanweisung": "betriebsanweisungen",
  [PL_THEMA_UNTERWEISUNG]: "betriebsanweisungen",
  "Thema/Einweisung": "betriebsmittel",
  "Thema/Geräteeinweisung": "betriebsmittel",
};

/**
 * Dokumentliste eines Themas. `tags__id__all` verknüpft UND — mit `tags__id__in`
 * stünde die Hälfte des Archivs in der Liste. Sortiert wird nach `created`
 * (Datum des Dokuments), nicht nach `added` (Tag des Einsortierens).
 *
 * `ohneIds` schließt zusätzliche Schlagworte aus (`tags__id__none`, Befund 3)
 * — z. B. Thema/Arbeitsschutz OHNE Thema/Unterweisung für die
 * Grundlagen-Liste. Ohne Angabe unverändert wie zuvor.
 */
export const plListeQuery = (tagIds, ohneIds = []) =>
  `tags__id__all=${tagIds.join(",")}` +
  (ohneIds.length ? `&tags__id__none=${ohneIds.join(",")}` : "") +
  `&ordering=-created&page_size=100`;

/** Vorabfrage für den Duplikat-Schutz. */
export const plPruefsummeQuery = (sha256) =>
  `checksum__iexact=${sha256}&page_size=1`;

/**
 * Treffer der Prüfsummen-Abfrage → das vorhandene Dokument oder null.
 * Im Zweifel lieber scheitern (Fehler werfen) als still ein Duplikat zu
 * übersehen — ein kaputtes API-Format ist schlimmer als ein abgebrochener Upload.
 */
export const plDuplikat = (antwort) => {
  // null/undefined = gültig (kein Treffer)
  if (!antwort) return null;

  // results-Feld muss vorhanden und ein Array sein
  if (!Array.isArray(antwort.results)) {
    throw new Error(
      `Paperless-Antwort ungültig: results ist ${
        antwort.results === undefined ? "nicht vorhanden" : "kein Array"
      }`
    );
  }

  const t = antwort.results[0];
  return t ? { id: t.id, titel: t.title } : null;
};

/** Paperless-Dokument auf das reduzieren, was die Liste anzeigt. */
export const plKurz = (doc, gueltigBisFeldId) => ({
  id: doc.id,
  titel: doc.title || "",
  datum: String(doc.created || "").slice(0, 10),
  gueltigBis: String(
    (doc.custom_fields || []).find((f) => f.field === gueltigBisFeldId)?.value || ""
  ).slice(0, 10),
});

/**
 * SHA256 einer Datei als Hex — genau das, was Paperless als `checksum` führt.
 * Bordmittel; `crypto.subtle` gibt es im Browser wie in Node ab 18.
 */
export async function sha256Hex(datei) {
  const puffer = await datei.arrayBuffer();
  const roh = await crypto.subtle.digest("SHA-256", puffer);
  return [...new Uint8Array(roh)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Pseudo-Thema „alle": die ganze Ablage des Bereichs (Verwaltung → Alle Dokumente, Kachel „Dokument hochladen"). Spec 2026-09-23. */
export const PL_ALLE = "alle";
/** Markiert jeden Upload aus der Kachel „Dokument hochladen" (pipeline/producer.py sucht danach). */
export const PL_QUELLE_APP = "Quelle/App";
/** Schalter „Beleg → Buchhaltung" beim Upload. */
export const PL_BELEG_TAG = "Beleg/zur Buchhaltung";
/** Wer „Alle Dokumente" sehen darf, solange im Adminbereich nichts anderes steht. */
export const PL_RECHT_ALLE_STANDARD = ["admins", "admin", "administratoren"];
