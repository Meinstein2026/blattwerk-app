import { bestellZusatzFelder } from "./foerderung.js";

// Modul „Bank" (Verwaltung → Bank): reine Funktionen fuer die Bankzeilen-Ansicht, ohne React.
// Dolibarr liefert je Zeile (GET /bankaccounts/{id}/lines): id, dateo (Unix-Sekunden), amount,
// label, fk_account, rappro (0/1 = mit Kontoauszug abgeglichen), num_releve (Auszugsnummer).
// Labels in runden Klammern sind Dolibarrs Uebersetzungsschluessel, keine Freitexte.
const LABEL = {
  "(SupplierInvoicePayment)": "Zahlung Lieferantenrechnung",
  "(SupplierInvoicePaymentBack)": "Rückzahlung Lieferantenrechnung",
  "(CustomerInvoicePayment)": "Zahlung Kundenrechnung",
  "(CustomerInvoicePaymentBack)": "Rückzahlung Kundenrechnung",
  "(ExpenseReportPayment)": "Zahlung Spesen",
  "(InitialBankBalance)": "Anfangssaldo",
  "(banktransfert)": "Umbuchung",
};

export const bankText = (label) => {
  const s = String(label || "").trim();
  return LABEL[s] || s.replace(/^\((.*)\)$/, "$1") || "—";
};

export const bankAbgeglichen = (z) => Number(z?.rappro) > 0;

export const BANK_FILTER = [
  { key: "alle", label: "Alle" },
  { key: "offen", label: "Nicht abgeglichen" },
  { key: "gefunden", label: "Im Auszug gefunden" },
  { key: "pruefen", label: "Nicht im Auszug – prüfen" },
  { key: "ohne", label: "Noch kein Auszug" },
  { key: "neu", label: "Neu seit letztem Besuch" },
];

/** Neu = seit dem letzten Besuch angelegt (Bankzeilen-Ids steigen); neuAb 0 = erster Besuch, nichts ist neu. */
export const bankNeu = (z, neuAb) => Number(neuAb) > 0 && Number(z?.id) > Number(neuAb);

/** Neueste zuerst (dateo, bei Gleichstand id); filter "offen" = nur nicht abgeglichene, sonst Status der Empfehlung bzw. "neu". */
export const bankZeilen = (roh, filter = "alle", offen = null, neuAb = 0) =>
  (Array.isArray(roh) ? roh : [])
    .filter((z) => filter === "alle" || (filter === "offen" ? !bankAbgeglichen(z) : filter === "neu" ? bankNeu(z, neuAb) : bankEmpfehlung(z, offen).status === filter))
    .sort((a, b) => (Number(b.dateo) || 0) - (Number(a.dateo) || 0) || (Number(b.id) || 0) - (Number(a.id) || 0));

// ─── Zuordnen (Teil 4): Zahlung ohne Bankzeile ↔ vorhandene Bankzeile ─────────
const cent = (x) => Math.round((parseFloat(x) || 0) * 100);

/** Betrag, den die Bankzeile haben muss: Kundenzahlung kommt herein (+), Lieferantenzahlung geht hinaus (−). */
export const bankErwarteterBetrag = (zahlung) => (zahlung?.art === "kunde" ? 1 : -1) * Math.abs(parseFloat(zahlung?.betrag) || 0);

/** Zeilen, an die diese Zahlung passt: gleicher Betrag in Cent; naechstes Datum zuerst. */
export const bankKandidaten = (zahlung, roh) => {
  const soll = cent(bankErwarteterBetrag(zahlung));
  const tag = Number(zahlung?.datum) || 0;
  return (Array.isArray(roh) ? roh : [])
    .filter((z) => cent(z.amount) === soll)
    .sort((a, b) => Math.abs((Number(a.dateo) || 0) - tag) - Math.abs((Number(b.dateo) || 0) - tag));
};

export const BANK_AUSZUG_MUSTER = /^[A-Za-z0-9/_.-]{1,30}$/;
export const bankAuszugGueltig = (s) => BANK_AUSZUG_MUSTER.test(String(s || "").trim());

// ─── Teil 5: Buchungen aus dem Kontoauszug, die in Dolibarr fehlen ────────────
// Ablage: kontoauszug-offen.json schreibt nur der Bot, bank-regeln.json nur die App (kein gegenseitiges Ueberschreiben).
export const BANK_OFFEN_LEER = { version: 1, eintraege: [], passend: [], nur_dolibarr: [], zeitraeume: {} };
export const BANK_REGELN_LEER = { version: 1, regeln: {}, erledigt: [] };
export const BANK_ARTEN = [
  { key: "zahlung", label: "Zahlung auf offene Rechnung" },
  { key: "rechnung", label: "Lieferantenrechnung (Entwurf, Beleg fehlt)" },
  { key: "bestellung", label: "Einkauf ohne Bestellung (Bestellung + Rechnungs-Entwurf)" },
  { key: "sonstige", label: "Sonstige Zahlung (ohne Rechnung)" },
  { key: "ignorieren", label: "Ignorieren (nichts anlegen)" },
];
// Buchungskonten fuer Bewegungen ohne Rechnung (SKR03); das Modul blattwerkapp prueft, ob es sie im Kontenplan gibt.
export const BANK_SONSTIGE_KONTEN = [
  { number: "4970", label: "Nebenkosten des Geldverkehrs (Bankgebühren)" },
  { number: "1800", label: "Privatentnahmen" },
  { number: "1890", label: "Privateinlagen" },
  { number: "1780", label: "Umsatzsteuer-Vorauszahlungen" },
  { number: "4360", label: "Versicherungen" },
];

export const bankOffenNorm = (s) => ({
  version: 1,
  eintraege: (Array.isArray(s?.eintraege) ? s.eintraege : []).filter((e) => e && typeof e.id === "string" && e.id && typeof e.datum === "string" && typeof e.text === "string"),
  // Sichere Paare Auszugszeile ↔ Bankzeile, die der Bot gefunden hat (zum Sammel-Abhaken).
  passend: (Array.isArray(s?.passend) ? s.passend : []).filter((p) => p && Number(p.zeile) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(p.datum || ""))),
  // Teil 7: offene Bankzeilen im Zeitraum eines gelesenen Auszugs ohne Gegenstück, und die gelesenen Zeiträume je Konto.
  nur_dolibarr: (Array.isArray(s?.nur_dolibarr) ? s.nur_dolibarr : []).filter((p) => p && Number(p.zeile) > 0),
  zeitraeume: s?.zeitraeume && typeof s.zeitraeume === "object" && !Array.isArray(s.zeitraeume) ? s.zeitraeume : {},
});
export const bankRegelnNorm = (s) => ({
  version: 1,
  regeln: s?.regeln && typeof s.regeln === "object" && !Array.isArray(s.regeln) ? s.regeln : {},
  erledigt: (Array.isArray(s?.erledigt) ? s.erledigt : []).filter((x) => typeof x === "string").slice(-2000),
});

/** Woran die App ein Gegenueber wiedererkennt: Gegen-IBAN, sonst der normalisierte Name. Leer = nichts zu lernen. */
export const bankRegelSchluessel = (e) => {
  const iban = String(e?.gegenIban || "").replace(/\s+/g, "").toUpperCase();
  if (iban) return `iban:${iban}`;
  const name = String(e?.name || "").toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").trim();
  return name ? `name:${name}` : "";
};

const ARTEN = BANK_ARTEN.map((a) => a.key);
/** Eintrag abhaken und (optional) die Entscheidung als Regel merken. Reine Funktion fuer appStoreAendern. */
export const bankErledigtEintragen = (store, id, regel) => {
  const s = bankRegelnNorm(store);
  const sauber = String(id || "").trim();
  if (!sauber) throw Object.assign(new Error("Eintrag fehlt"), { code: 400 });
  if (!s.erledigt.includes(sauber)) s.erledigt.push(sauber);
  const schluessel = String(regel?.schluessel || "").slice(0, 120);
  if (schluessel && ARTEN.includes(regel.art)) {
    s.regeln[schluessel] = {
      art: regel.art,
      konto: String(regel.konto || "").replace(/\D/g, "").slice(0, 8),
      lieferantId: Number(regel.lieferantId) || 0,
      label: String(regel.label || "").slice(0, 120),
    };
  }
  return s;
};

const GEBUEHR = /entgelt|abrechnung|kontof(ü|ue)hr|geb(ü|ue)hr|abschluss/i;
/**
 * Vorschlag je Buchung. Reihenfolge: gelernte Regel → offene Rechnung mit genau diesem Restbetrag →
 * Bankgebuehr (Stichwort) → Abgang = Lieferantenrechnung, Zugang = Sonstige. `offen` = [{id, ref, rest, art:"kunde"|"lieferant", socid}].
 */
export const bankVorschlag = (e, regeln, offen = []) => {
  const regel = (regeln || {})[bankRegelSchluessel(e)];
  const soll = cent(Math.abs(parseFloat(e?.betrag) || 0));
  const passend = (Array.isArray(offen) ? offen : []).filter((r) => r.art === (e?.betrag < 0 ? "lieferant" : "kunde") && cent(r.rest) === soll);
  // Der Bot (Qwen) hat die Buchung schon in Dolibarr gefunden: das schlaegt jede Regel – sonst entsteht ein Doppel.
  const z = e?.zuordnung;
  if (z?.id) {
    const leer = { konto: "", lieferantId: 0, label: "", quelle: "qwen" };
    if (z.art === "bankzeile" || Number(z.status) === 2) return { ...leer, art: "ignorieren", rechnungen: passend };
    const gemeint = (Array.isArray(offen) ? offen : []).filter((r) => String(r.id) === String(z.id) && r.art === (z.typ === "ci" ? "kunde" : "lieferant"));
    return { ...leer, art: "zahlung", rechnungen: [...gemeint, ...passend.filter((r) => !gemeint.includes(r))] };
  }
  if (regel && regel.art !== "zahlung") return { ...regel, quelle: "gelernt", rechnungen: passend };
  if (passend.length) return { art: "zahlung", konto: "", lieferantId: 0, label: "", quelle: "rechnung", rechnungen: passend };
  if (regel) return { ...regel, art: e?.betrag < 0 ? "rechnung" : "sonstige", quelle: "gelernt", rechnungen: [] };
  if (GEBUEHR.test(`${e?.name || ""} ${e?.text || ""}`)) return { art: "sonstige", konto: "4970", lieferantId: 0, label: "Bankgebühren", quelle: "stichwort", rechnungen: [] };
  return { art: e?.betrag < 0 ? "rechnung" : "sonstige", konto: "", lieferantId: 0, label: "", quelle: "standard", rechnungen: [] };
};

/** Klartext + Sprunglink zu dem, was der Bot (Qwen) in Dolibarr gefunden hat. null = nichts gefunden. */
export const bankZuordnungText = (e) => {
  const z = e?.zuordnung;
  if (!z?.id) return null;
  const tag = String(z.datum || "").split("-").reverse().join(".");
  const dazu = z.grund ? ` (${z.quelle === "qwen" ? "Qwen" : "Regel"}, ${z.sicherheit}: ${z.grund})` : "";
  if (z.art === "bankzeile") return { text: `Schon gebucht: Bankzeile vom ${tag}${String(z.konto) !== String(e.konto) ? " auf einem anderen Konto" : ""} – nur abhaken.${dazu}`, sprung: `#bank-${z.id}` };
  if (z.art !== "rechnung") return null;
  const sprung = `#beleg-${z.typ === "ci" ? "ci" : "si"}-${z.id}`;
  if (Number(z.status) === 0) return { text: `Entwurf ${z.ref} passt – erst dort validieren, dann hier die Zahlung erfassen.${dazu}`, sprung };
  if (Number(z.status) === 2) return { text: `${z.ref} ist schon als bezahlt gebucht – nur abhaken, nichts neu anlegen.${dazu}`, sprung };
  return { text: `Gehört zu ${z.ref} (offen) – Zahlung erfassen.${dazu}`, sprung };
};

const RECHTSFORM = /\b(gmbh|mbh|co|kg|ag|ug|gbr|ohg|ek|e k|ev|e v|haftungsbeschraenkt)\b/g;
const firmaNorm = (t) => String(t || "").toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .replace(/[^a-z0-9]+/g, " ").replace(RECHTSFORM, " ").replace(/\s+/g, " ").trim();
/**
 * Vorhandenen Lieferanten zum Namen aus dem Auszug finden (Bank schreibt GROSS und ohne Umlaute).
 * Gleich → enthalten (ab 4 Zeichen) → alle Woerter enthalten. Mehrdeutig = null, dann waehlt der Mensch.
 */
export const bankLieferantFinden = (name, lieferanten) => {
  const n = firmaNorm(name);
  if (n.length < 3) return null;
  const liste = (Array.isArray(lieferanten) ? lieferanten : []).map((l) => ({ l, namen: [firmaNorm(l.name), firmaNorm(l.name_alias)].filter(Boolean) }));
  const stufen = [
    (x) => x === n,
    (x) => Math.min(x.length, n.length) >= 4 && (` ${x} `.includes(` ${n} `) || ` ${n} `.includes(` ${x} `)),
    (x) => { const [kurz, lang] = x.length < n.length ? [x, n] : [n, x]; const w = kurz.split(" ").filter((t) => t.length >= 3); return w.length > 0 && w.every((t) => lang.split(" ").includes(t)); },
  ];
  for (const passt of stufen) {
    const treffer = liste.filter((e) => e.namen.some(passt));
    if (treffer.length === 1) return treffer[0].l;
    if (treffer.length > 1) return null;
  }
  return null;
};

/**
 * Was sich auf einen Schlag abhaken laesst: Paare des Bots fuer dieses Konto, deren Bankzeile geladen,
 * noch nicht abgeglichen und betragsgleich ist (der Betrag wird gegen die echte Zeile nachgeprueft).
 * Auszugsnummer = Monat der Auszugszeile („2026/08“). → [{ zeile, auszug }]
 */
export const bankSammelAbhaken = (offen, kontoId, zeilen) => {
  const geladen = new Map((Array.isArray(zeilen) ? zeilen : []).map((z) => [String(z.id), z]));
  const gesehen = new Set();
  return bankOffenNorm(offen).passend
    .filter((p) => String(p.konto) === String(kontoId))
    .map((p) => ({ p, z: geladen.get(String(p.zeile)) }))
    .filter(({ p, z }) => z && !bankAbgeglichen(z) && cent(z.amount) === cent(p.betrag) && !gesehen.has(String(p.zeile)) && gesehen.add(String(p.zeile)))
    .map(({ p, z }) => ({ zeile: z, auszug: `${p.datum.slice(0, 4)}/${p.datum.slice(5, 7)}` }));
};

const tagDe = (iso) => String(iso || "").split("-").reverse().join(".");
/**
 * Teil 7: Empfehlung des Bots je Bankzeile (er schreibt nie selbst nach Dolibarr). status:
 * abgeglichen · gefunden (steht im Auszug → abhaken, mit Auszugsnummer) · pruefen (im Auszugszeitraum, kein Gegenstück) · ohne (kein Auszug gelesen).
 */
export const bankEmpfehlung = (z, offen) => {
  if (bankAbgeglichen(z)) return { status: "abgeglichen" };
  const o = bankOffenNorm(offen);
  const meine = (p) => String(p.zeile) === String(z?.id) && cent(p.betrag) === cent(z?.amount);
  const p = o.passend.find(meine);
  if (p) return { status: "gefunden", auszug: `${p.datum.slice(0, 4)}/${p.datum.slice(5, 7)}`, text: `Empfehlung: steht am ${tagDe(p.datum)} im Kontoauszug – abhaken` };
  const n = o.nur_dolibarr.find(meine);
  if (n) return { status: "pruefen", text: n.aehnlich ? `Empfehlung: prüfen – gleicher Betrag steht am ${tagDe(n.aehnlich)} im Kontoauszug, Datum stimmt wohl nicht` : "Empfehlung: prüfen – im gelesenen Kontoauszug nicht gefunden (Datum, Konto, Betrag falsch oder doppelt?)" };
  return { status: "ohne" };
};

/** Hat der Bot für dieses Konto je einen Auszug gelesen? Nein → Konto ohne Auszug (Kasse, Privatkonten): Abhaken bis Datum anbieten. */
export const bankHatAuszug = (offen, kontoId) => {
  const o = bankOffenNorm(offen), k = String(kontoId);
  return (o.zeitraeume[k] || []).length > 0 || [...o.eintraege, ...o.passend, ...o.nur_dolibarr].some((x) => String(x.konto) === k);
};

/** Abhaken ohne Auszug: offene Zeilen bis einschließlich `bis` (JJJJ-MM-TT), ihre Summe und der Soll-Bestand des Kontos an dem Tag (Kassensturz). */
export const bankOhneAuszug = (roh, bis) => {
  const ende = new Date(`${bis}T23:59:59`).getTime() / 1000;
  const bisDahin = (Array.isArray(roh) ? roh : []).filter((z) => Number(z.dateo) <= ende);
  const zeilen = bisDahin.filter((z) => !bankAbgeglichen(z));
  const summe = (l) => l.reduce((s, z) => s + cent(z.amount), 0) / 100;
  return { zeilen, summe: summe(zeilen), bestand: summe(bisDahin) };
};
export const bankAuszugVorschlag = (konto, bis) =>
  `${String(konto?.ref || konto?.label || "Konto").replace(/[^A-Za-z0-9]/g, "").slice(0, 20) || "Konto"}-${String(bis || "").slice(0, 7)}`;

/**
 * Sammel-Anlegen: fehlende Buchungen, deren Empfehlung ohne Rückfrage ausführbar ist – gelernte Regel oder Bankgebühr mit
 * Konto + Text, gelernter Lieferant (Entwurf), „schon gebucht“ mit hoher Sicherheit. Nie: uneinige Lesarten, Zahlungen
 * (brauchen den Zahlungsbogen), Standard-Vorschläge. → [{ e, vorschlag }]
 */
export const bankSammelAnlegen = (fehlend, regeln, offeneRechnungen) =>
  (Array.isArray(fehlend) ? fehlend : []).filter((e) => !e.unsicher).map((e) => ({ e, vorschlag: bankVorschlag(e, regeln, offeneRechnungen) }))
    .filter(({ e, vorschlag: v }) =>
      v.quelle === "qwen" ? v.art === "ignorieren" && e.zuordnung?.sicherheit === "hoch"
      : !["gelernt", "stichwort"].includes(v.quelle) ? false
      : v.art === "ignorieren" || (v.art === "sonstige" && !!v.konto && !!v.label) || (v.art === "rechnung" && Number(v.lieferantId) > 0));

/** Offene Eintraege eines Kontos, ohne die erledigten; neueste zuerst. */
export const bankOffeneFuerKonto = (offen, regeln, kontoId) =>
  bankOffenNorm(offen).eintraege
    .filter((e) => String(e.konto) === String(kontoId) && !bankRegelnNorm(regeln).erledigt.includes(e.id))
    .sort((a, b) => String(b.datum).localeCompare(String(a.datum)));

/** Marke in note_private eines aus der Bank erzeugten Entwurfs: Validieren erst mit Beleg. */
export const bankEntwurfMarke = (id) => `[bank:${String(id || "").replace(/[^0-9a-f]/gi, "").slice(0, 16)}]`;
export const istBankEntwurf = (inv) => /\[bank:[0-9a-f]{4,16}\]/i.test(String(inv?.note_private || ""));

/** Nachträgliche Bestellung zu einer Auszugszeile (Abgang ohne Bestellung): Payload für POST /supplierorders.
 *  Brutto = netto mit 0 % USt (§ 19, wie der Rechnungs-Entwurf); die Bank-Marke verbindet sie mit der Zeile. */
export const bankBestellung = (e, { socid, kategorie = "", kontoName = "", text = "" }) => {
  const [j, m, t] = String(e?.datum || "").split("-").map(Number);
  return {
    socid: Number(socid),
    date: Math.floor(Date.UTC(j, m - 1, t, 12) / 1000),
    note_private: `${bankEntwurfMarke(e?.id)} Nachträglich aus der Bankbuchung vom ${String(e?.datum || "").split("-").reverse().join(".")} angelegt (Konto „${kontoName}“, Kontoauszug ${e?.auszug || "–"}).`,
    lines: [{ desc: (String(text || "").trim() || String(e?.text || "").trim() || "Einkauf laut Kontoauszug").slice(0, 250), qty: 1, subprice: Math.abs(Number(e?.betrag) || 0), tva_tx: 0, remise_percent: 0 }],
    array_options: bestellZusatzFelder({ kategorie }),
  };
};
