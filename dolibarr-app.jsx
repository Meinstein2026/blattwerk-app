import { useState, useEffect, useCallback, useMemo, useRef, useContext, createContext, useSyncExternalStore, Component, Fragment } from "react";
import {
  GBU_ARBEITSARTEN, GBU_ZUGAENGE, GBU_NIEDERSCHLAG, GBU_WIND,
  GBU_QUALIFIKATIONEN, GBU_PERSONAL_MAX, GBU_DURCHZUFUEHRENDE_ARBEITEN,
  GBU_BAUM_HAENGER, GBU_BAUM_UMFELD, GBU_BAUM_STAMM, GBU_BAUM_KRONE,
  GBU_KRONE_GEWICHT, GBU_KRONE_ZUSTAND, GBU_BAUM_SICHER, isBaumArbeit,
  composeChecklist, gbuArbeitsart, gbuZugang, gbuWetterWarnung,
  buildGbuFilename, validateGbu,
  gbuLetzterEinsatz, gbuUebernahme, gbuSuche, gbuUmfangText,
} from "./src/gbu-data.js";
import { buildGbuPdf } from "./src/gbu-pdf.js";
import { idbHolen, idbLoeschen, idbSchluessel, idbSetzen } from "./src/idb.js";
import { gbuBeteiligteSchluessel, gbuPdfUeberzaehlige } from "./src/gbu-offline.js";
import GbuFormSkt from "./src/ui/GbuFormSkt.jsx";
import {
  EW_GERAETE, EW_STUFEN_TEXT,
  ewDateiname, ewFaelligAm, ewFehlt, ewGeraet, ewGesperrt, ewKopfFelder,
  ewLetzte, ewParse, ewStatus, ewVoraussetzungen, fristStatus,
} from "./src/arbeitsschutz.js";
import {
  BM_VORWARNUNG_TAGE, bmFaellige, bmFristen, bmStatus, bmSeriennummer, bmToken, bmCodeLesen,
} from "./src/betriebsmittel.js";
import { buildEtikettenPdf, etikettDateiname, etikettenAusLosen } from "./src/etikett-pdf.js";
import { EINWEISUNG_BESTAETIGUNG, EINWEISUNG_PRAXIS } from "./src/einweisung-data.js";
import { buildEinweisungPdf } from "./src/einweisung-pdf.js";
import * as offline from "./src/offline/index.js";
import {
  UPDATE_BASE_DEFAULT, normalizeUpdateBase, manifestUrl, apkUrl, updateTag, stillFaellig,
  pruefeManifest, nativeBridge, appVersion, updateFehlerText,
} from "./src/update.js";
import { PL_ALLE, PL_THEMA, sha256Hex } from "./src/paperless.js";
import { bilderZuPdf } from "./src/seiten-pdf.js";
import { KACHELN, KACHEL_RECHTE, KACHEL_STANDARD, kachelKey, kachelnFiltern } from "./src/kacheln.js";
import { plAusstehend, plEinreihen, plNachtragen, plWsAntwort } from "./src/pl-warteschlange.js";
import { istDtmf, istKlingeln, nummerNormalisieren, sfuAnfrage } from "./src/telefon.js";
import { DOLIBARR_URL_DEFAULT, migriereDolibarrConfig, weiterleitungErkannt, verbindungsFehlerText } from "./src/verbindung.js";
import { intern } from "./src/intern.js";
import TimeField from "./src/zeitfeld.jsx";
import TutorialUebungen from "./src/tutorial/Tutorial.jsx";
import QualifikationenTab, { qualiOffenCount, qualiStandSchreiben } from "./src/ui/QualifikationenTab.jsx";
import { qualG41Hinweis, qualiKeyAusLogin, qualiPersonenVereinen } from "./src/qualifikationen.js";
import BaumkatasterPage from "./src/ui/BaumkatasterPage.jsx";
import BetriebsanweisungTab from "./src/ui/BetriebsanweisungTab.jsx";
import ChatBereich from "./src/ui/ChatPage.jsx";
import { chatAbonnieren, chatOpenId, chatStand, chatTelefonAbonnieren, chatTelefonSenden } from "./src/chat/client.js";
import { chatMarke } from "./src/chat/logik.js";
import { CHAT_HOMESERVER, chatLoginTokenAusUrl, chatMitTokenAnmelden, chatSitzungLesen, chatSitzungMerken, chatUrlBereinigt } from "./src/chat/sitzung.js";
import { TUTORIAL_VERSION, tutorialEntscheidung, tutorialCodeStimmt } from "./src/tutorial/uebungen.js";
import {
  KM_PAUSCHALE, FB_STORE_LEER, FB_ART,
  streckeAusPunkten, fahrtDistanz, fahrtFehler, fahrzeugEintragen, kmStandJeFahrzeug,
  fahrtenAuswertung, fahrtenCsv, fahrtAenderungenText, fbDatumDE, fbZahlDE, ausstehendeZusammenfuehren, fbStempelText,
  fahrtenListe, fahrtKarte, fahrtAusZeile, kuerzelAus,
  FB_ENTWUERFE_LEER, entwurfSpeichern, entwurfLoeschen, entwurfKarte,
} from "./src/fahrtenbuch.js";
import {
  UEB_STORE_LEER, UEB_PFLICHTEN, UEB_FS_KLASSEN, UEB_VERHAELTNIS, UEB_SELBSTBETEILIGUNG_STANDARD,
  uebFehlt, uebStatus, uebStatusLabel, uebFahrerNamen, uebDateiname, uebPflichtText, uebBetriebNamen,
} from "./src/ueberlassung.js";
import { mandantAusCache, mandantHolen, mandantSicher } from "./src/mandant-client.js";
import { mandantBetrieb, mandantMarke } from "./src/betrieb.js";
import { rechteMischen, darfDiensteAendern, dienstLinks, DIENST_LABEL } from "./src/mandant.js";
import {
  funktionAktiv, funktionenFuer, funktionenStandard, funktionInfo, kaskade,
  dolibarrAbgleich, einrichtungsAuftrag, warteschlangenStand, WARTESCHLANGEN_SPEICHER,
} from "./src/funktionen.js";
import { regelnFuer } from "./src/konto-regeln.js";
import {
  FOERDER_KATEGORIEN, FOERDER_PRIOS, FOERDER_PROGRAMME, FOERDER_STATUS, programmMitKontakt,
  FOERDER_NOTIZ_MARKE,
  bestellZusatz, bestellZusatzFelder, foerderNotiz, foerderStatusInfo, foerderTreffer,
  kategorieLabel, positionenNetto, positionenText, prioInfo, prioRang,
} from "./src/foerderung.js";
import { kontoMemAusCache, kontoMemMerken, kontoMemAbgleichen } from "./src/konto-gedaechtnis-client.js";
import { istSprunglink, belegSprung, bankSprung } from "./src/sprunglink.js";
import { bankText, bankAbgeglichen, bankZeilen, BANK_FILTER, bankKandidaten, bankErwarteterBetrag, bankAuszugGueltig, BANK_ARTEN, BANK_SONSTIGE_KONTEN, bankRegelSchluessel, bankVorschlag, bankOffeneFuerKonto, bankEntwurfMarke, istBankEntwurf, bankLieferantFinden, bankZuordnungText, bankSammelAbhaken, bankEmpfehlung, bankNeu, bankHatAuszug, bankOhneAuszug, bankAuszugVorschlag, bankSammelAnlegen, bankBestellung } from "./src/bank.js";

// ─── Dolibarr API Client ───────────────────────────────────────────────────
const createApi = (baseUrl, apiKey) => {
  const headers = { "DOLAPIKEY": apiKey, "Content-Type": "application/json" };
  const call = async (method, path, body) => {
    const res = await fetch(`${baseUrl}/api/index.php${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`API Error ${res.status}: ${await res.text()}`);
    return res.json();
  };
  // File upload uses multipart/form-data – no JSON header
  const upload = async (formData) => {
    const res = await fetch(`${baseUrl}/api/index.php/documents/upload`, {
      method: "POST",
      headers: { "DOLAPIKEY": apiKey },
      body: formData,
    });
    if (!res.ok) throw new Error(`Upload Error ${res.status}`);
    return res.json();
  };
  // Idempotenz für Offline-Sync: findet einen bereits angelegten Datensatz
  // anhand seines "[offline:<uuid>]"-Markers in note_private, damit ein nach
  // einem Absturz (Create ok, Outbox-Löschen nie passiert) wiederholter Sync
  // ihn nicht doppelt anlegt. Holt die neuesten 100 Datensätze (nach rowid
  // absteigend) und vergleicht client-seitig per Substring: ein Datensatz aus
  // einem abgestürzten Lauf DIESES Eintrags ist, falls vorhanden, immer unter
  // den neuesten 100 seines Typs — er ist ja gerade erst entstanden.
  // Fail-CLOSED mit Absicht: der GET wird NICHT abgefangen. Schlägt er fehl
  // (Netz down, Server-Fehler), wirft findByMarker -> applyEntry bricht ab
  // -> runSync markiert den Eintrag "error" statt blind neu anzulegen (siehe
  // sync.js). Das ist kein echter Nachteil: schlägt dieser GET fehl, würde
  // der nachfolgende Create-POST über dieselbe Verbindung ohnehin fehlschlagen
  // -> der Eintrag wird beim nächsten Sync erneut versucht.
  const findByMarker = async (path, marker) => {
    const recent = await call("GET", `${path}?limit=100&sortfield=t.rowid&sortorder=DESC`);
    const found = Array.isArray(recent) ? recent.find(r => String(r.note_private || "").includes(marker)) : null;
    return found ? Number(found.id ?? found.rowid) : null;
  };
  return {
    // Thirdparties
    getThirdparties: (type) => {
      const mode = type === "customer" ? 1 : type === "prospect" ? 2 : type === "supplier" ? 4 : 0;
      return call("GET", `/thirdparties?limit=200${mode ? `&mode=${mode}` : ""}`);
    },
    createThirdparty: (data) => call("POST", "/thirdparties", data),
    updateThirdparty: (id, data) => call("PUT", `/thirdparties/${id}`, data),
    deleteThirdparty: (id) => call("DELETE", `/thirdparties/${id}`),
    // Idempotenz-Suche für Offline-Sync (siehe findByMarker oben).
    findThirdpartyByMarker: (marker) => findByMarker("/thirdparties", marker),
    // Invoices
    getInvoices: () => call("GET", "/invoices?limit=100"),
    // Für die Finanzübersicht: dort muss die Summe über ALLE Belege stimmen,
    // die 100er-Seite der Listenansicht reicht nicht.
    getInvoicesAlle: () => call("GET", "/invoices?limit=1000"),
    getSupplierInvoicesAlle: () => call("GET", "/supplierinvoices?limit=1000"),
    getInvoice: (id) => call("GET", `/invoices/${id}`),
    createInvoice: (data) => call("POST", "/invoices", data),
    validateInvoice: async (id) => {
      // Dolibarr-Installationen unterscheiden sich je nach Version/Modul leicht.
      // Erst Standardweg, dann Fallback mit PUT und notrigger.
      try { return await call("POST", `/invoices/${id}/validate`, { notrigger: 0 }); }
      catch (e1) { try { return await call("PUT", `/invoices/${id}/validate`, { notrigger: 0 }); } catch (e2) { throw e1; } }
    },
    deleteInvoice: (id) => call("DELETE", `/invoices/${id}`),
    updateInvoice: (id, data) => call("PUT", `/invoices/${id}`, data),
    // Mail-Versand läuft über das eigene blattwerkzeit-Modul: Dolibarr 23 hat
    // keinen REST-Endpunkt zum Versenden (der frühere /invoices/{id}/sendbyemail
    // existierte dort nie und lief immer auf 404). Das Modul nutzt Dolibarrs
    // eigene Mail-Klasse — Vorlage, PDF-Anhang, Agenda-Eintrag und die
    // Blindkopie an finanzen@ (MAIN_MAIL_AUTOCOPY_TO) wie in der Dolibarr-Maske.
    getMailVorlage: (art, id, stufe) => call("GET", `/blattwerkapp/mail/vorlage?art=${art}&id=${id}${stufe ? `&stufe=${stufe}` : ""}`),
    getMahnstand: (id) => call("GET", `/blattwerkapp/mahnung/stand?id=${id}`),
    sendMailBeleg: (data) => call("POST", `/blattwerkapp/mail/versand`, data),
    getInvoiceDocuments: (ref) => call("GET", `/documents?modulepart=invoice&id=${ref}`),
    // Zahlungen (Routen am 20.08.2026 an der Instanz + im Dolibarr-23-Quelltext
    // verifiziert). addPayment bucht IMMER den vollen Restbetrag — Teilbeträge
    // dürfen nur über /invoices/paymentsdistributed gehen; welcher Pfad dran
    // ist, entscheidet zahlungPlan().
    zahlungBuchen: (pfad, body) => call("POST", pfad, body),
    // Abhaken ohne Zahlungserfassung (Dolibarr "classifyPaid"): für außerhalb
    // der App abgerechnete Fälle, gleiches Motiv wie „als fakturiert" beim Angebot.
    setInvoicePaid: (id) => call("POST", `/invoices/${id}/settopaid`, {}),
    // Storno (09.09.2026): Dolibarr 23 hat keinen cancel-Endpunkt. „Verlassen"
    // ist settopaid MIT close_code (Status 3 abandoned); die GoBD-saubere
    // Variante ist eine Gutschrift (type 2, fk_facture_source), die nach
    // validate + markAsCreditAvailable als Rabatt (discount) auf die
    // Originalrechnung verrechnet wird. Ablauf in stornoAusfuehren().
    setInvoiceAbandoned: (id, { close_code, close_note }) => call("POST", `/invoices/${id}/settopaid`, { close_code, close_note: close_note || "" }),
    markInvoiceCreditAvailable: (id) => call("POST", `/invoices/${id}/markAsCreditAvailable`, {}),
    getInvoiceDiscount: (id) => call("GET", `/invoices/${id}/discount`),
    useCreditNote: (id, discountId) => call("POST", `/invoices/${id}/usecreditnote/${discountId}`, {}),
    // Gutschriften, die auf eine Rechnung zeigen (fuer Badge + Link).
    getGutschriftenZu: (id) => call("GET", `/invoices?sqlfilters=${encodeURIComponent(`(t.fk_facture_source:=:${Number(id)})`)}&limit=20`),
    getBankAccounts: () => call("GET", "/bankaccounts"),
    // Modul „Bank": alle Zeilen eines Kontos bzw. eine Zeile ohne Konto-Id (Sprunglink #bank-<id>).
    getBankLines: (kontoId) => call("GET", `/bankaccounts/${Number(kontoId)}/lines`),
    getBankLine: (id) => call("GET", `/bankaccounts/lines/${Number(id)}`),
    getPaymentTypes: () => call("GET", "/setup/dictionary/payment_types"),
    // Lieferantenseite: anderes Feld (payment_mode_id statt paymentid!) und
    // Teilbeträge direkt über `amount` — es gibt kein paymentsdistributed.
    // Body baut lieferantZahlungBody() (api_supplier_invoices.class.php,
    // Dolibarr 23, am 20.08.2026 gegengelesen).
    addSupplierInvoicePayment: (id, body) => call("POST", `/supplierinvoices/${id}/payments`, body),
    setSupplierInvoicePaid: (id) => call("POST", `/supplierinvoices/${id}/settopaid`, {}),
    // Supplier invoices (Eingangsrechnungen)
    getSupplierInvoices: () => call("GET", "/supplierinvoices?limit=100"),
    getSupplierInvoice: (id) => call("GET", `/supplierinvoices/${id}`),
    createSupplierInvoice: (data) => call("POST", "/supplierinvoices", data),
    validateSupplierInvoice: async (id) => {
      try { return await call("POST", `/supplierinvoices/${id}/validate`, { notrigger: 0 }); }
      catch (e1) { try { return await call("PUT", `/supplierinvoices/${id}/validate`, { notrigger: 0 }); } catch (e2) { throw e1; } }
    },
    deleteSupplierInvoice: (id) => call("DELETE", `/supplierinvoices/${id}`),
    // Idempotenz-Suche für Offline-Sync (siehe findByMarker oben).
    findSupplierInvoiceByMarker: (marker) => findByMarker("/supplierinvoices", marker),
    updateSupplierInvoice: (id, data) => call("PUT", `/supplierinvoices/${id}`, data),
    // Zeilen bearbeiten geht nur im Entwurf → validierte Rechnung erst per settodraft zurücksetzen.
    setSupplierInvoiceToDraft: (id) => call("POST", `/supplierinvoices/${id}/settodraft`, { idwarehouse: 0 }),
    addSupplierInvoiceLine: (id, data) => call("POST", `/supplierinvoices/${id}/lines`, data),
    updateSupplierInvoiceLine: (id, lineid, data) => call("PUT", `/supplierinvoices/${id}/lines/${lineid}`, data),
    deleteSupplierInvoiceLine: (id, lineid) => call("DELETE", `/supplierinvoices/${id}/lines/${lineid}`),
    // Supplier orders (Bestellungen bei Lieferanten)
    getSupplierOrders: () => call("GET", "/supplierorders?limit=100"),
    getSupplierOrder: (id) => call("GET", `/supplierorders/${id}`),
    createSupplierOrder: (data) => call("POST", "/supplierorders", data),
    validateSupplierOrder: async (id) => {
      try { return await call("POST", `/supplierorders/${id}/validate`, {}); }
      catch (e1) { try { return await call("PUT", `/supplierorders/${id}/validate`, {}); } catch (e2) { throw e1; } }
    },
    updateSupplierOrder: (id, data) => call("PUT", `/supplierorders/${id}`, data),
    deleteSupplierOrder: (id) => call("DELETE", `/supplierorders/${id}`),
    // Warehouses & stock movements (Lager & Lagerbewegungen)
    getWarehouses: () => call("GET", "/warehouses"),
    createStockMovement: (data) => call("POST", "/stockmovements", data),
    // Shipments / Lieferscheine
    getShipments: () => call("GET", "/shipments?limit=100"),
    getShipment: (id) => call("GET", `/shipments/${id}`),
    createShipment: (data) => call("POST", "/shipments", data),
    validateShipment: async (id) => {
      try { return await call("POST", `/shipments/${id}/validate`, {}); }
      catch (e1) { try { return await call("PUT", `/shipments/${id}/validate`, {}); } catch (e2) { throw e1; } }
    },
    // Proposals
    getProposals: () => call("GET", "/proposals?limit=100"),
    getProposal: (id) => call("GET", `/proposals/${id}`),
    createProposal: (data) => call("POST", "/proposals", data),
    validateProposal: async (id) => {
      // Dolibarr versions differ slightly; try the usual POST first, then PUT.
      try { return await call("POST", `/proposals/${id}/validate`, { notrigger: 0 }); }
      catch (e1) { try { return await call("PUT", `/proposals/${id}/validate`, { notrigger: 0 }); } catch (e2) { throw e1; } }
    },
    setProposalStatus: async (id, status, note = "") => {
      // Dolibarr: status 2 = signed/beauftragt, status 3 = refused/abgelehnt.
      // Je nach Version existiert /close oder Statuswechsel per PUT.
      const body = { status: parseInt(status), statut: parseInt(status), note_private: note, note_public: note };
      const attempts = [
        () => call("POST", `/proposals/${id}/close`, body),
        () => call("PUT", `/proposals/${id}/close`, body),
        () => call("POST", `/proposals/${id}/setstatus`, body),
        () => call("PUT", `/proposals/${id}`, body),
      ];
      let last;
      for (const run of attempts) { try { return await run(); } catch (e) { last = e; } }
      throw last;
    },
    acceptProposal: (id, note = "") => { const now = Math.floor(Date.now()/1000); return call("POST", `/proposals/${id}/close`, { status: 2, note_private: note, date_signature: now }); },
    refuseProposal: (id, note = "") => { const now = Math.floor(Date.now()/1000); return call("POST", `/proposals/${id}/close`, { status: 3, note_private: note, date_cloture: now }); },
    deleteProposal: (id) => call("DELETE", `/proposals/${id}`),
    updateProposal: (id, data) => call("PUT", `/proposals/${id}`, data),
    // Zeilen eines Angebots. Anders als bei der Lieferantenrechnung heisst der
    // Stueckpreis hier `subprice` (netto) — siehe Kommentar an angebotZeileBody.
    // Und: die EINZELNE Zeile geht an `{id}/line` (Einzahl). `{id}/lines` ist
    // beim Angebot der Massen-Endpunkt und erwartet eine Liste; schickt man ihm
    // ein einzelnes Objekt, laeuft er ueber dessen Felder statt ueber Zeilen und
    // legt pro Feld eine leere Zeile an — mit Status 200. Bei der
    // Lieferantenrechnung ist es genau andersherum (dort ist `lines` richtig).
    // Am 10.08.2026 an einem Wegwerf-Angebot beobachtet und am Quelltext
    // bestaetigt (postLine → @url POST {id}/line, postLines → POST {id}/lines).
    addProposalLine: (id, data) => call("POST", `/proposals/${id}/line`, data),
    updateProposalLine: (id, lineid, data) => call("PUT", `/proposals/${id}/lines/${lineid}`, data),
    deleteProposalLine: (id, lineid) => call("DELETE", `/proposals/${id}/lines/${lineid}`),
    // Angebot auf "Fakturiert" setzen (Dolibarr: classifyBilled, Status 4).
    // Verlangt nur `propal creer`, also dasselbe Recht, das zum Anlegen noetig
    // war — wer eine Rechnung daraus machen darf, darf das Angebot auch
    // abhaken.
    setProposalInvoiced: (id) => call("POST", `/proposals/${id}/setinvoiced`, {}),
    createInvoiceFromProposal: async (id) => {
      // Dolibarr route used by the "Create invoice" action differs between versions.
      // Try the known REST variants first. UI will fall back to manual invoice creation if all fail.
      const attempts = [
        () => call("POST", `/invoices/createfromproposal/${id}`, {}),
        () => call("POST", `/invoices/createfromproposal`, { id: parseInt(id), proposal_id: parseInt(id) }),
        () => call("POST", `/proposals/${id}/createinvoice`, {}),
        () => call("PUT", `/proposals/${id}/createinvoice`, {}),
      ];
      let last;
      for (const run of attempts) { try { return await run(); } catch (e) { last = e; } }
      throw last;
    },
    // Timesheets — Dolibarr always books time against a TASK, never a bare
    // project. Gebucht wird über das eigene Modul `blattwerkzeit` statt über den
    // Kern-Endpunkt /tasks/{id}/addtimespent: nur dort kommt die Uhrzeit durch,
    // und nur dann steht der Beginn in Dolibarr, den § 17 MiLoG verlangt. Warum
    // der Kern-Endpunkt sie abweist, steht ausführlich bei `saveTimeSpent`.
    // Quelltext des Moduls: ~/Dokumente/App-Entwicklung/Dolibarr-Zeit.
    //
    // Zum Gegenlesen gibt es in Dolibarr 23 `GET /tasks/{id}/timespent` und
    // `DELETE /tasks/{id}/timespent/{lineid}` — entgegen einem früheren
    // Kommentar an dieser Stelle existieren beide. Hier bewusst nicht
    // eingetragen, weil sie niemand aufruft: beide gehen nur je Aufgabe, und
    // ein Monatsnachweis müsste über alle Aufgaben laufen. Der gehört in
    // Dolibarrs eigene Zeiterfassungs-Liste, nicht auf ein Telefon.
    getTasks: () => call("GET", "/tasks?limit=500"),
    addTaskTimeSpent: (data) => call("POST", "/blattwerkapp/timespent", data),
    // Die eigenen Buchungen eines Zeitraums, in einer Anfrage. Liefert immer nur
    // die Zeiten der Person, deren Schlüssel auf dem Gerät liegt — fremde
    // Arbeitszeiten gibt der Endpunkt gar nicht erst heraus.
    getMeineZeiten: (von, bis) =>
      call("GET", `/blattwerkapp/meine?von=${encodeURIComponent(von)}&bis=${encodeURIComponent(bis)}`),
    // Einrichtung (src/funktionen.js): Dolibarrs Modul-Liste + unser Modul.
    getSetupModules: () => call("GET", "/setup/modules"),
    getAppSetup: () => call("GET", "/blattwerkapp/setup"),
    postAppSetup: (body) => call("POST", "/blattwerkapp/setup", body),
    // Modul „Bank" Teil 4 (Dolibarr-Modul blattwerkapp ≥ 1.1.0): Dolibarrs Kern-API kann beides nicht.
    getBankZahlungenOhneZeile: () => call("GET", "/blattwerkapp/bank/zahlungen-ohne-zeile"),
    bankZuordnen: (zahlung, art, zeile) => call("POST", "/blattwerkapp/bank/zuordnen", { zahlung: Number(zahlung), art, zeile: Number(zeile) }),
    bankAbgleich: (zeile, abgeglichen, auszug = "") => call("POST", "/blattwerkapp/bank/abgleich", { zeile: Number(zeile), abgeglichen: abgeglichen ? 1 : 0, auszug }),
    bankBewegung: (body) => call("POST", "/blattwerkapp/bank/bewegung", body),
    // Projects
    getProjects: () => call("GET", "/projects?limit=100"),
    getProject: (id) => call("GET", `/projects/${id}`),
    getProjectTasks: (id) => call("GET", `/projects/${id}/tasks`),
    createProject: (data) => call("POST", "/projects", data),
    updateProject: (id, data) => call("PUT", `/projects/${id}`, data),
    deleteProject: (id) => call("DELETE", `/projects/${id}`),
    // Idempotenz-Suche für Offline-Sync (siehe findByMarker oben).
    findProjectByMarker: (marker) => findByMarker("/projects", marker),
    closeProject: async (id) => {
      // Dolibarr 23 ignoriert `statut` beim PUT stillschweigend (antwortet 200,
      // ändert aber nichts) — wirksam ist nur `status`. Ältere Versionen kennen
      // stattdessen `statut` oder einen Close-Endpunkt. Deshalb jeden Versuch
      // VERIFIZIEREN: erst wenn das Projekt wirklich zu ist, gilt er als Erfolg.
      const attempts = [
        () => call("PUT", `/projects/${id}`, { status: 2 }),
        () => call("PUT", `/projects/${id}`, { statut: 2 }),
        () => call("POST", `/projects/${id}/close`, {}),
        () => call("PUT", `/projects/${id}/close`, {}),
      ];
      let last = new Error("Projekt konnte nicht geschlossen werden");
      for (const run of attempts) {
        try {
          const res = await run();
          const fresh = await call("GET", `/projects/${id}`).catch(() => null);
          if (!fresh || Number(fresh.statut ?? fresh.status) === 2) return res;
          last = new Error("Dolibarr hat den Statuswechsel nicht übernommen");
        } catch (e) { last = e; }
      }
      throw last;
    },
    createTask: (data) => {
      const pid = data.fk_project || data.fk_projet || data.projectid;
      const label = data.label || data.title || data.ref || "Aufgabe";
      const ref = data.ref || `TASK-${Date.now().toString().slice(-8)}`;
      return call("POST", "/tasks", {
        ...data,
        ref,
        label,
        fk_project: parseInt(pid),
      });
    },
    deleteTask: (id) => call("DELETE", `/tasks/${id}`),
    // Idempotenz-Suche für Offline-Sync (siehe findByMarker oben).
    findTaskByMarker: (marker) => findByMarker("/tasks", marker),
    addUserToProject: async (projectId, userId) => {
      // Dolibarr versions differ here; try common contact/member endpoints.
      const attempts = [
        () => call("POST", `/projects/${projectId}/contacts`, { id: parseInt(userId), type: "internal", source: "internal" }),
        () => call("POST", `/projects/${projectId}/contact/${userId}`, { type: "internal" }),
        () => call("POST", `/projects/${projectId}/users/${userId}`, {}),
      ];
      let last;
      for (const run of attempts) { try { return await run(); } catch (e) { last = e; } }
      throw last;
    },
    // Products
    getProducts: () => call("GET", "/products?limit=500"),
    getProduct: (id) => call("GET", `/products/${id}`),
    updateProduct: (id, data) => call("PUT", `/products/${id}`, data),
    createProduct: (data) => call("POST", "/products", {
      label: data.label, ref: data.ref, type: data.type ?? 0,
      status: 1, status_buy: 1, tva_tx: data.tva_tx ?? 0,
      price_base_type: "HT", ...data,
    }),
    // Betriebsmittel: ein Los je Einzelstück (`llx_product_lot`, REST
    // `/productlots`). Dolibarrs Barcode hängt am ARTIKEL — alle vier Reifen
    // desselben Typs hätten denselben Code. Die Stück-Identität (Baujahr,
    // Position, Verfall, Prüfung) trägt deshalb das Los, nicht der Artikel.
    // Filter-Alias ist `pl`, die Extrafields hängen als `ple` dran.
    getLots: (filter = "") => call("GET", `/productlots?limit=500&sortfield=pl.batch${filter ? `&sqlfilters=${encodeURIComponent(filter)}` : ""}`),
    getLot: (id) => call("GET", `/productlots/${id}`),
    createLot: (data) => call("POST", "/productlots", data),
    updateLot: (id, data) => call("PUT", `/productlots/${id}`, data),
    // Auflösung eines gescannten Codes. Der Code selbst sagt nichts aus; erst
    // dieser Aufruf macht daraus ein Stück — und er läuft über den API-Schlüssel
    // der Person, ist also nicht ohne Anmeldung zu haben.
    // Der Code liegt im Extrafield `bm_token` (Alias `ple`), NICHT in
    // `pl.barcode`: die Spalte gibt es zwar, aber /productlots schreibt sie
    // nicht — POST und PUT antworten mit 200 und lassen sie NULL (12.09.2026
    // an der Instanz nachgemessen).
    getLotByToken: async (token) => {
      const r = await call("GET", `/productlots?limit=2&sqlfilters=${encodeURIComponent(`(ple.bm_token:=:'${token}')`)}`);
      return Array.isArray(r) && r.length ? r[0] : null;
    },
    // Lieferanten-Einkaufspreise (Dolibarr-Versionen variieren → tolerant)
    getPurchasePrices: async (id) => {
      try { return await call("GET", `/products/${id}/purchase_prices`); }
      catch { return []; }
    },
    addPurchasePrice: async (id, data) => {
      const body = {
        qty: data.qty ?? 1, buyprice: data.buyprice,
        price_base_type: data.price_base_type ?? "HT",
        fourn_id: parseInt(data.fourn_id),
        availability: 0, ref_fourn: data.ref_fourn || `EK-${id}-${data.fourn_id}`,
        tva_tx: data.tva_tx ?? 19,
      };
      const attempts = [
        () => call("POST", `/products/${id}/purchase_prices`, body),
        () => call("PUT", `/products/${id}/purchase_prices`, body),
      ];
      let last; for (const run of attempts) { try { return await run(); } catch (e) { last = e; } }
      throw last;
    },
    // Dokument-Inhalt laden (base64) – funktioniert auch für Entwürfe.
    // Dolibarr 23 will "modulepart"; ältere Versionen "module_part" → beide schicken.
    downloadDocument: ({ module_part, original_file }) =>
      call("GET", `/documents/download?modulepart=${encodeURIComponent(module_part)}&module_part=${encodeURIComponent(module_part)}&original_file=${encodeURIComponent(original_file)}`),
    // Expense reports (Spesen)
    getExpenseReports: () => call("GET", "/expensereports?limit=50&sortfield=t.rowid&sortorder=DESC"),
    createExpenseReport: (data) => call("POST", "/expensereports", data),
    getExpenseReport: (id) => call("GET", `/expensereports/${id}`),
    validateExpenseReport: async (id) => {
      // Dolibarr 22+ verlangt notrigger als Integer im Body — mit leerem {}
      // antworten validate/approve IMMER 400 ("Invalid value for notrigger").
      // Reihenfolge: erst validieren (Entwurf), sonst genehmigen (bereits
      // validiert; braucht das approve-Recht), zuletzt Alt-Endpunkt.
      const attempts = [
        () => call("POST", `/expensereports/${id}/validate`, { notrigger: 0 }),
        () => call("POST", `/expensereports/${id}/approve`, { notrigger: 0 }),
        () => call("PUT", `/expensereports/${id}/validate`, { notrigger: 0 }),
      ];
      let last;
      for (const run of attempts) { try { return await run(); } catch (e) { last = e; } }
      throw last;
    },
    deleteExpenseReport: (id) => call("DELETE", `/expensereports/${id}`),
    addExpenseLine: (id, data) => call("POST", `/expensereports/${id}/line`, data),
    getExpenseTypes: () => call("GET", "/setup/dictionary/expensereport_types"),
    getUsers: () => call("GET", "/users?limit=200"),
    // Connected user (the owner of the API key): includes admin flag and group list
    getCurrentUser: () => call("GET", "/users/info"),
    getCurrentUserWithGroups: async () => {
      const u = await call("GET", "/users/info");
      const uid = u?.id || u?.rowid;
      if (uid) {
        try { u.user_group_list = await call("GET", `/users/${uid}/groups`); } catch (_) { /* group membership may be forbidden */ }
      }
      return u;
    },
    updateUser: (id, data) => call("PUT", `/users/${id}`, data),
    // User groups / admin helper endpoints (best effort across Dolibarr versions)
    getUserGroups: () => call("GET", "/users/groups"),
    getUserGroupsForUser: (id) => call("GET", `/users/${id}/groups`),
    getEmailTemplates: () => call("GET", "/setup/email_templates?limit=200"),

    // Agenda events (used to mirror dated projects/tasks into Dolibarr agenda/Nextcloud ICS)
    createAgendaEvent: async (data) => {
      // Dolibarr requires manual agenda events to include a valid type_code.
      // Your instance accepts AC_RDV (Rendez-vous) and requires userownerid.
      const payload = {
        type_code: "AC_RDV",
        code: "AC_RDV",
        percentage: -1,
        ...data,
      };
      if (!payload.type_id) payload.type_id = 5;
      return call("POST", "/agendaevents", payload);
    },
    getAgendaEvents: () => call("GET", "/agendaevents"),
    deleteAgendaEvent: (id) => call("DELETE", `/agendaevents/${id}`),
    // Documents
    uploadDocument: (formData) => upload(formData),
    getDocuments: (modulepart, id) => call("GET", `/documents?modulepart=${modulepart}&id=${id}`),
    buildDocument: (data) => call("PUT", "/documents/builddoc", data),
    // Status
    // Erst eine Probe OHNE eigene Kopfzeilen (kein Preflight) mit manueller
    // Weiterleitung: antwortet die Adresse mit 3xx, ist Dolibarr umgezogen —
    // der eigentliche Aufruf darunter scheiterte sonst nur mit „Failed to
    // fetch" und das Dashboard sagte stumm „Nicht verbunden" (09.09.2026).
    testConnection: async () => {
      let probe = null;
      try { probe = await fetch(`${baseUrl}/api/index.php/status`, { redirect: "manual", cache: "no-store" }); } catch (_) { /* CORS-Fehler ohne Weiterleitung: unten entscheidet der echte Aufruf */ }
      if (weiterleitungErkannt(probe)) {
        throw Object.assign(new Error(`Die Dolibarr-Adresse ${baseUrl} leitet auf einen anderen Server weiter — Dolibarr ist vermutlich umgezogen. Bitte abmelden und mit der neuen Adresse (${DOLIBARR_URL_DEFAULT}) anmelden.`), { weiterleitung: true });
      }
      return call("GET", "/status");
    },
  };
};

// ─── Helpers ───────────────────────────────────────────────────────────────
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("de-DE") : "—";
// Mahnstufen (sequenziell, Frist dazwischen prueft der Server): 1 -> 2 -> 3.
const MAHN_NAMEN = { 1: "Zahlungserinnerung", 2: "2. Mahnung", 3: "Letzte Mahnung" };
// Deutsche Schreibweise mit Tausenderpunkt. Bewusst von Hand statt
// toLocaleString("de-DE"): die WebView der Huelle bringt je nach Android-
// Fassung nicht immer volle ICU-Daten mit, dann faellt toLocaleString still
// auf en-US zurueck und aus 1.234,50 € wird 1,234.50 €.
const fmtMoney = (n) => {
  const z = parseFloat(n || 0);
  const wert = Number.isFinite(z) ? z : 0;
  const [ganz, rest] = Math.abs(wert).toFixed(2).split(".");
  const mitPunkt = ganz.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${wert < 0 ? "-" : ""}${mitPunkt},${rest} €`;
};
const todayISO = () => new Date().toISOString().split("T")[0];
// Dolibarr-Beschreibungen können HTML enthalten (z. B. aus der Weboberfläche).
const stripHtml = (s) => String(s || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
// Dolibarr 23 liefert im Dokument-Listing name=null; der Dateiname steckt in
// relativename/filename/fullname.
const docName = (d) => d?.name || String(d?.relativename || d?.filename || d?.fullname || "").split("/").pop() || "";
const fmtTimer = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
};
// Build auto filename: REF_YYYY-MM-DD_originalExt
const buildFilename = (ref, origName) => {
  const date = todayISO();
  const ext = origName.includes(".") ? origName.split(".").pop() : "pdf";
  const safeName = origName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
  return `${ref}_${date}_${safeName}.${ext}`;
};
// Fallback codes for Dolibarr instances that require a manual customer/supplier code.
// Some setups accept free-form codes; others enforce a numeric mask (e.g. {000000}).
const genCode = (prefix) => prefix + Date.now().toString(36).toUpperCase().slice(-6);
const genNumericCode = () => String(Date.now()).slice(-6);
const toEpoch = (d) => Math.floor(new Date(d).getTime() / 1000);
const toEpochLocal = (dateStr, timeStr = "00:00") => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = (timeStr || "00:00").split(":").map(Number);
  return Math.floor(new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0).getTime() / 1000);
};
// Dolibarr Agenda on this installation stores/display timestamps as wall-clock
// values. A normal browser-local epoch is displayed two hours too early in
// Europe/Berlin summer time. For agenda events, encode the entered wall time
// as UTC so Dolibarr displays exactly the time selected in the app.
const toEpochDolibarrWallTime = (dateStr, timeStr = "00:00") => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = (timeStr || "00:00").split(":").map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0) / 1000);
};
const fmtDateTime = (ts) => ts ? new Date(ts * 1000).toLocaleString("de-DE", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "—";
// Dolibarr's addtimespent API parses the date with dol_stringtotime($date, 1),
// i.e. it expects a "YYYY-MM-DD HH:MM:SS" string interpreted as GMT (not a unix
// timestamp). Formatting in UTC makes the booked time line up with what the user
// actually sees in Dolibarr (which converts back to their timezone).
const fmtDoliDateTime = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  const p = (n) => String(n).padStart(2, "0");
  return `${x.getUTCFullYear()}-${p(x.getUTCMonth() + 1)}-${p(x.getUTCDate())} ${p(x.getUTCHours())}:${p(x.getUTCMinutes())}:${p(x.getUTCSeconds())}`;
};

// ─── Arbeitszeit: Beginn, Ende, Dauer ───────────────────────────────────────
// § 17 MiLoG verlangt von jeder Schicht Beginn, Ende UND Dauer, aufgezeichnet
// spätestens sieben Tage danach und zwei Jahre aufzubewahren. Dolibarr legt
// davon zwei Angaben ab: den Beginn (element_datehour) und die Dauer
// (element_duration). Läuft eine Buchung durch, ist das Ende daraus ableitbar —
// steckt eine Pause darin, ist es das nicht mehr. Der Zeitraum wandert deshalb
// zusätzlich im Klartext in die Notiz: das ist die Spalte, die in Dolibarrs
// Zeiterfassungs-Liste ohnehin neben Datum und Dauer steht und für die
// Abrechnung gelesen wird.
const uhrzeit = (wert) => new Date(wert).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

const zeitraumText = (beginn, ende, pauseSekunden = 0) => {
  if (!beginn || !ende) return "";
  const b = new Date(beginn), e = new Date(ende);
  if (Number.isNaN(b.getTime()) || Number.isNaN(e.getTime())) return "";
  // Geht die Schicht über Mitternacht, muss das Datum ans Ende: "22:00–02:00"
  // läse sich sonst, als hätte sie vor ihrem Beginn geendet.
  const bis = b.toDateString() === e.toDateString()
    ? uhrzeit(e)
    : `${e.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} ${uhrzeit(e)}`;
  const pause = pauseSekunden > 0 ? `, Pause ${Math.round(pauseSekunden / 60)} min` : "";
  return `${uhrzeit(b)}–${bis}${pause}`;
};

// Der Zeitraum steht vorn, damit er auch dann noch zu sehen ist, wenn die
// Beschreibung lang wird und Dolibarrs Notiz-Spalte sie abschneidet.
const zeitNotiz = (zeitraum, text) =>
  [zeitraum, String(text || "").trim()].filter(Boolean).join(" · ") || "Zeiterfassung";

// Datum + "HH:MM" zu einem Zeitpunkt in der Zeitzone des Geräts. Genau das
// verlangt § 17 MiLoG: die Uhr, auf die die Person geschaut hat.
const zeitpunktAus = (datumISO, hhmm) => {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!datumISO || !Number.isFinite(h) || !Number.isFinite(m)) return null;
  const d = new Date(`${datumISO}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

// Beginn, Ende und Pause einer von Hand nachgetragenen Schicht in die drei
// Angaben umrechnen, die gebucht werden. Ein "Bis" vor dem "Von" heißt
// Nachtschicht über Mitternacht, nicht Tippfehler.
const spanneRechnen = (datumISO, von, bis, pauseMinuten) => {
  const beginn = zeitpunktAus(datumISO, von);
  let ende = zeitpunktAus(datumISO, bis);
  if (!beginn || !ende) return { fehler: "Bitte Beginn und Ende eintragen." };
  if (ende <= beginn) ende += 24 * 3600 * 1000;
  const pause = Math.max(0, Math.round(Number(pauseMinuten) || 0)) * 60;
  const brutto = Math.round((ende - beginn) / 1000);
  const dauer = brutto - pause;
  if (dauer <= 0) return { fehler: "Die Pause ist so lang wie die Schicht.", beginn, ende, pause, brutto };
  return { beginn, ende, pause, brutto, dauer };
};

// § 4 ArbZG: über 6 Stunden Arbeitszeit mindestens 30 Minuten Pause, über 9
// Stunden 45. Der Eintrag wird trotzdem nicht aufgehalten — wer wirklich
// durchgearbeitet hat, soll das eintragen können, statt es sich passend zu
// rechnen. Aufschreiben ist Pflicht, schönschreiben wäre eine Ordnungswidrigkeit
// mehr.
// Für Summen: "7:30 h" liest sich besser als fmtTimers "07:30:00", und auf einer
// Monatssumme wären die Sekunden ohnehin Zierrat.
const fmtDauer = (sekunden) => {
  const s = Math.max(0, Math.round(sekunden || 0));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} h`;
};

// Erster und letzter Augenblick eines Monats, in der Zeitzone des Geräts. Der
// Monat ist das, was auf der Lohnabrechnung steht — deshalb die lokale
// Monatsgrenze und nicht die von UTC, sonst fielen die ersten zwei Stunden des
// Ersten in den Vormonat.
const monatsGrenzen = (jahr, monat) => ({
  von: new Date(jahr, monat, 1, 0, 0, 0, 0),
  bis: new Date(jahr, monat + 1, 0, 23, 59, 59, 0),
});

// Buchungen nach Kalendertagen bündeln, neueste zuerst. Der Tag ist die Einheit,
// in der § 17 MiLoG denkt und in der jemand seine eigene Woche gegenliest.
const nachTagen = (zeilen) => {
  const tage = new Map();
  for (const z of zeilen || []) {
    const d = new Date(z.beginn * 1000);
    const schluessel = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!tage.has(schluessel)) tage.set(schluessel, { tag: schluessel, datum: d, dauer: 0, zeilen: [] });
    const eintrag = tage.get(schluessel);
    eintrag.dauer += Number(z.dauer) || 0;
    eintrag.zeilen.push(z);
  }
  return [...tage.values()].sort((a, b) => b.tag.localeCompare(a.tag));
};

// Bis wann darf von Hand nachgetragen werden: bis zum Ersten des Vormonats.
// § 17 MiLoG verlangt die Aufzeichnung binnen sieben Tagen — die trägt im
// Normalfall die Stoppuhr, die am selben Tag bucht. Das Nachtragen ist der
// Korrekturweg, und den einen Monat weit offen zu lassen ist des Inhabers Entscheidung
// vom 12.08.2026: lieber eine späte Aufzeichnung als gar keine. Weiter zurück
// aber nicht, sonst wird aus dem Korrekturweg eine Sammelerfassung am Jahresende.
const nachtragGrenze = (heute) => {
  const h = heute instanceof Date ? heute : new Date(heute);
  return new Date(h.getFullYear(), h.getMonth() - 1, 1, 0, 0, 0, 0);
};

// § 17 MiLoG will die Aufzeichnung binnen sieben Kalendertagen. Wer später
// nachträgt, soll das wissen — aufgehalten wird er trotzdem nicht, denn ein
// fehlender Eintrag ist schlechter als ein verspäteter.
const nachtragHinweis = (beginn, heute) => {
  if (!beginn) return "";
  const tage = Math.floor((new Date(heute).setHours(0, 0, 0, 0) - new Date(beginn).setHours(0, 0, 0, 0)) / 86400000);
  return tage > 7 ? `Vor ${tage} Tagen — § 17 MiLoG will die Aufzeichnung binnen sieben Tagen.` : "";
};

const pausenHinweis = (dauerSekunden, pauseSekunden) => {
  const stunden = dauerSekunden / 3600;
  if (stunden > 9 && pauseSekunden < 45 * 60) return "Über 9 Stunden Arbeitszeit — § 4 ArbZG verlangt 45 Minuten Pause.";
  if (stunden > 6 && pauseSekunden < 30 * 60) return "Über 6 Stunden Arbeitszeit — § 4 ArbZG verlangt 30 Minuten Pause.";
  return "";
};

const normalizeAgendaDate = (value, fallbackHour = 8) => {
  if (!value) return null;
  if (typeof value === "number") return value;
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return Math.floor(d.getTime() / 1000);
  return null;
};
const getAgendaOwnerId = async (api, preferredUserId) => {
  const preferred = parseInt(preferredUserId, 10);
  if (Number.isFinite(preferred) && preferred > 0) return preferred;
  try {
    const me = await api.getCurrentUser();
    const uid = parseInt(me?.id || me?.rowid, 10);
    if (Number.isFinite(uid) && uid > 0) return uid;
  } catch (_) { /* handled by fallback below */ }
  return 1;
};
const createAgendaForProject = async (api, projectId, projectLike) => {
  if (!api || !projectId || !projectLike?.date_start) return;
  const title = projectLike.title || projectLike.label || projectLike.ref || "Projekt";
  const start = normalizeAgendaDate(projectLike.agenda_date_start || projectLike.date_start);
  let end = normalizeAgendaDate(projectLike.agenda_date_end || projectLike.date_end) || start;
  if (!start) return;
  if (end <= start) end = start + 60 * 60;
  const ownerId = await getAgendaOwnerId(api, projectLike.userownerid);
  await api.createAgendaEvent({
    label: `Projekt: ${title}`,
    userownerid: ownerId,
    type_id: 5,
    type_code: "AC_RDV",
    code: "AC_RDV",
    datep: start,
    datef: end,
    durationp: end - start,
    fulldayevent: 0,
    ponctuel: 1,
    punctual: 1,
    percentage: -1,
    transparency: 0,
    fk_project: parseInt(projectId),
    elementtype: "project",
    fk_element: parseInt(projectId),
    note: projectLike.description || "Automatisch aus der App erzeugter Projekt-Termin",
  });
  // Zusätzlich direkt in den Nextcloud-Kalender "Blattwerk" schreiben
  try {
    const nc = loadNcConfig();
    if (ncReady(nc)) {
      await ncPutEvent(nc, {
        uid: ncProjectUid(projectId),
        title: `Projekt: ${title}`,
        startSec: start, endSec: end,
        note: projectLike.description || "",
        location: projectLike.location || "",
      });
    }
  } catch (e) { console.warn("Nextcloud-Termin (Projekt) fehlgeschlagen", e); }
};
const createAgendaForTask = async (api, taskId, taskLike, projectLike) => {
  if (!api || !taskId || !taskLike?.date_start) return;
  const label = taskLike.label || taskLike.title || taskLike.ref || "Aufgabe";
  const start = normalizeAgendaDate(taskLike.agenda_date_start || taskLike.date_start);
  let end = normalizeAgendaDate(taskLike.agenda_date_end || taskLike.date_end) || start;
  if (!start) return;
  if (end <= start) end = start + 60 * 60;
  const ownerId = await getAgendaOwnerId(api, taskLike.userownerid);
  await api.createAgendaEvent({
    label: `Aufgabe: ${label}`,
    userownerid: ownerId,
    type_id: 5,
    type_code: "AC_RDV",
    code: "AC_RDV",
    datep: start,
    datef: end,
    durationp: end - start,
    fulldayevent: 0,
    ponctuel: 1,
    punctual: 1,
    percentage: parseInt(taskLike.progress || -1),
    transparency: 0,
    fk_project: parseInt(taskLike.fk_project || projectLike?.id || projectLike?.rowid || 0),
    fk_task: parseInt(taskId),
    elementtype: "project_task",
    fk_element: parseInt(taskId),
    note: taskLike.description || "Automatisch aus der App erzeugter Aufgaben-Termin",
  });
  // Zusätzlich direkt in den Nextcloud-Kalender "Blattwerk" schreiben
  try {
    const nc = loadNcConfig();
    if (ncReady(nc)) {
      await ncPutEvent(nc, {
        uid: ncTaskUid(taskId),
        title: `Aufgabe: ${label}`,
        startSec: start, endSec: end,
        note: taskLike.description || "",
        location: taskLike.location || "",
      });
    }
  } catch (e) { console.warn("Nextcloud-Termin (Aufgabe) fehlgeschlagen", e); }
};

// Nachsync-Kalender für offline angelegte Projekte/Aufgaben: sobald der
// Sync-Lauf (src/offline/sync.js) einen Datensatz erfolgreich in Dolibarr
// angelegt hat und die echte Server-ID kennt, holt diese Funktion den
// Kalender-Schritt nach, den die Online-Anlage sofort erledigt hätte -
// unter Wiederverwendung derselben Helper (createAgendaForProject/-Task),
// also derselben stabilen UIDs (ncProjectUid/ncTaskUid) und derselben
// Best-effort-Nextcloud-Logik (no-op, wenn Nextcloud nicht konfiguriert ist).
// Rein additiv und niemals werfend: ein Fehler hier darf den bereits
// erfolgreich angelegten Datensatz (und damit den Outbox-Eintrag) nicht als
// "error" markieren - siehe Aufrufer in src/offline/sync.js.
async function createCalendarForSyncedEntry(api, kind, realId, data) {
  if (!api || !realId || !data) return;
  try {
    if (kind === "project") {
      await createAgendaForProject(api, realId, {
        title: data.title || data.ref,
        date_start: data.dateStart,
        agenda_date_start: data.agendaDateStart ?? data.dateStart,
        date_end: data.dateEnd,
        agenda_date_end: data.agendaDateEnd ?? data.dateEnd,
        description: data.description || "",
        id: realId,
      });
    } else if (kind === "task") {
      await createAgendaForTask(api, realId, {
        label: data.title || data.label,
        date_start: data.dateStart,
        agenda_date_start: data.agendaDateStart ?? data.dateStart,
        date_end: data.dateEnd,
        agenda_date_end: data.agendaDateEnd ?? data.dateEnd,
        description: data.description || "",
        fk_project: data.fk_project,
      }, null);
    }
  } catch (e) {
    console.warn("Kalender-Termin für synchronisierten Eintrag konnte nicht erstellt werden", e);
  }
}

const findAgendaEventsForTask = (events, taskId) => {
  const tid = String(taskId || "");
  if (!tid) return [];
  return (Array.isArray(events) ? events : []).filter(e =>
    String(e.fk_task || "") === tid ||
    ((e.elementtype === "project_task" || e.elementtype === "task") && String(e.elementid || e.fk_element || "") === tid)
  );
};

const findAgendaEventsForProject = (events, projectId, taskIds = []) => {
  const pid = String(projectId || "");
  const tids = new Set((taskIds || []).map(x => String(x)).filter(Boolean));
  if (!pid && tids.size === 0) return [];
  return (Array.isArray(events) ? events : []).filter(e =>
    (pid && String(e.fk_project || "") === pid) ||
    (pid && e.elementtype === "project" && String(e.elementid || e.fk_element || "") === pid) ||
    (tids.size > 0 && findAgendaEventsForTask([e], Array.from(tids).find(t => String(e.fk_task || e.elementid || e.fk_element || "") === t)).length > 0)
  );
};

const deleteAgendaEventsQuietly = async (api, events) => {
  const ids = [...new Set((Array.isArray(events) ? events : []).map(e => e.id || e.rowid).filter(Boolean))];
  if (ids.length === 0) return;
  await Promise.allSettled(ids.map(id => api.deleteAgendaEvent(id)));
};

// ─── Aufrufe an den eigenen Server ──────────────────────────────────────────
// Vor der App haengt Authentik (Forward-Auth) und schuetzt AUCH /api/*. Ist die
// SSO-Sitzung abgelaufen, antwortet der Server nicht mit 401, sondern mit einer
// Umleitung auf den Authentik-Outpost und von dort auf auth.example.org
// — eine fremde Domain ohne CORS-Freigabe. Ein normales fetch() folgt der
// Umleitung und scheitert dort mit "Failed to fetch": eine Meldung, aus der
// niemand ablesen kann, dass nur die Anmeldung fehlt.
//
// Mit redirect:"manual" wird die Umleitung sichtbar (Typ "opaqueredirect"),
// statt sie ins Leere laufen zu lassen.
export const SSO_ABGELAUFEN = "Anmeldung abgelaufen – die App meldet dich gerade neu an.";

export function istSsoUmleitung(res) {
  return !!res && (res.type === "opaqueredirect" || res.redirected === true || res.status === 0);
}

/** Adresse, ueber die sich die Sitzung erneuern laesst; danach geht es zurueck. */
export const ssoAnmeldeUrl = (ziel) =>
  "/outpost.goauthentik.io/start?rd=" + encodeURIComponent(ziel || "/");

/**
 * Was aus der Antwort von /api/sso/config folgt, wenn jemand auf dem
 * Anmeldebildschirm "Über Authentik anmelden" tippt. Drei Ausgaenge, nicht zwei:
 *
 *  - "bereit"          Der Server kennt den Dolibarr-Zugang dieses Nutzers.
 *  - "ohne-zugang"     Authentik hat den Nutzer erkannt, aber es hat noch
 *                      niemand einen Schluessel hinterlegt (erstes Geraet).
 *  - "ohne-authentik"  Der Aufruf lief nicht ueber den Reverse Proxy, der
 *                      Server gibt darum keine Identitaet heraus (ssoUser()).
 *
 * Eine *abgelaufene* Sitzung landet hier nie: apiFetch sieht die Umleitung auf
 * den Outpost und navigiert vorher selbst dorthin.
 *
 * Ein Zugang ohne erkannten Nutzer gilt als nicht vertrauenswuerdig — der
 * Server liefert diese Kombination nicht, sie koennte nur aus einer
 * untergeschobenen Antwort stammen.
 */
export function ssoAnmeldung(d) {
  if (!d || !d.username) return { stand: "ohne-authentik", name: "" };
  const name = d.name || d.username;
  const dol = d.dolibarr;
  if (!dol || !dol.url || !dol.key) return { stand: "ohne-zugang", name };
  // Schraegstrich am Ende weg, genau wie bei der Handeingabe: createApi haengt
  // "/api/index.php" an, und mit doppeltem Schraegstrich antwortet Dolibarr 404.
  return { stand: "bereit", name, config: { url: String(dol.url).replace(/\/$/, ""), key: dol.key } };
}

let ssoUmleitungLaeuft = false;
const apiFetch = async (url, init) => {
  const res = await fetch(url, { ...(init || {}), redirect: "manual" });
  if (istSsoUmleitung(res)) {
    // Einmal reicht: mehrere gleichzeitig laufende Aufrufe duerfen die
    // Navigation nicht gegenseitig abbrechen.
    if (!ssoUmleitungLaeuft && typeof window !== "undefined") {
      ssoUmleitungLaeuft = true;
      window.location.href = ssoAnmeldeUrl(window.location.pathname + window.location.search);
    }
    const err = new Error(SSO_ABGELAUFEN);
    err.ssoAbgelaufen = true;
    throw err;
  }
  return res;
};

// ─── Nextcloud-Kalender (Termine via eigenem Proxy /api/nc/*) ────────────────
// Eine Browser-App darf nicht direkt CalDAV sprechen (CORS). Der mitgelieferte
// Server (server.mjs) macht Login-Flow + CalDAV serverseitig.
// `team` (Task 11): unterscheidet das gemeinsame Dienstkonto der Firma von
// einem persoenlichen, ueber den SSO-Store hinterlegten Zugang — beide
// setzen `managed`, nur `team` sagt NextcloudPanel, ob es "zentral
// verwaltet" anzeigen darf (siehe server.mjs, /api/sso/config).
const NC_DEFAULT = { enabled: false, server: "", user: "", pass: "", calendarUrl: "", calendarName: "", managed: false, team: false };

// Seit dem Kalender-Umzug am 06.08.2026 ist der Team-Kalender verbindlich: er
// gehoert dem Besitzer-Konto `blattwerk-kalender` und ist an die Gruppe
// Blattwerk freigegeben. Der frueher genutzte Kalender lag in des Inhabers PRIVATEM
// Konto - wer den noch gespeichert hat, wird hier still mitgenommen, sonst
// zeigt die App weiter den alten Namen an und schreibt am Team vorbei.
const NC_TEAM_KALENDER = "blattwerk_shared_by_blattwerk-kalender";
const NC_TEAM_NAME = "Blattwerk (Team)";
// Name des alten privaten Kalenders — echter Wert kommt aus VITE_NC_ALTER_KALENDER_NAME
// (src/intern.js), nie im Quelltext.
const NC_ALTER_KALENDER_NAME = intern("NC_ALTER_KALENDER_NAME", "blattwerk_shared_by_max");
const NC_ALTER_KALENDER = new RegExp(
  `^(.*\\/remote\\.php\\/dav\\/calendars\\/([^/]+)\\/)(blattwerk|${NC_ALTER_KALENDER_NAME})\\/?$`
);

/** Ist das die alte, private Kalender-Adresse? Dann die Team-Adresse liefern. */
const ncTeamKalenderUrl = (url) => {
  const m = String(url || "").match(NC_ALTER_KALENDER);
  if (!m) return url;
  if (m[2] === "blattwerk-kalender") return url; // das Besitzer-Konto selbst
  return m[1] + NC_TEAM_KALENDER + "/";
};

/** Den Team-Kalender in einer Kalenderliste finden (Name variiert je Konto). */
const ncFindTeamKalender = (cals) =>
  (cals || []).find((c) => c.writable && /blattwerk-kalender/i.test(c.url || ""))
  || (cals || []).find((c) => c.writable && /blattwerk/i.test(c.name || ""))
  || (cals || []).find((c) => /blattwerk/i.test(c.name || ""));

const loadNcConfig = () => {
  try {
    const c = { ...NC_DEFAULT, ...(JSON.parse(localStorage.getItem("blattwerk_nextcloud") || "null") || {}) };
    const neu = ncTeamKalenderUrl(c.calendarUrl);
    if (neu !== c.calendarUrl) { c.calendarUrl = neu; c.calendarName = NC_TEAM_NAME; saveNcConfig(c); }
    return c;
  }
  catch { return { ...NC_DEFAULT }; }
};
const saveNcConfig = (c) => { try { localStorage.setItem("blattwerk_nextcloud", JSON.stringify(c)); } catch (_) {} };
// `managed` = der Server kennt die Zugangsdaten selbst (eigener Zugang aus dem
// SSO-Speicher oder das Dienstkonto des Team-Kalenders) und setzt sie bei jedem
// /api/nc-Aufruf ein. Die App hat dann bewusst KEIN Passwort — das des
// Dienstkontos gehoert nicht auf die Geraete, es ist das Besitzer-Konto des
// Team-Kalenders. Ohne diese Ausnahme gilt der Kalender als "nicht verbunden".
const ncReady = (c) => !!(c && c.enabled && c.calendarUrl && (c.managed || (c.user && c.pass)));
/** Kann ueber diesen Zugang ueberhaupt auf Nextcloud zugegriffen werden?
 *  (ohne Kalenderwahl — auch fuer Datei-Uploads: Belege, GBU-Archiv) */
const ncHasAccess = (c) => !!(c && c.server && c.user && (c.managed || c.pass));
const ncPutEvent = async (cfg, ev) => {
  if (!ncReady(cfg)) return;
  const res = await apiFetch("/api/nc/event", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: cfg.user, pass: cfg.pass, calendarUrl: cfg.calendarUrl, event: ev }),
  });
  if (!res.ok) { let m = ""; try { m = (await res.json()).error || ""; } catch (_) {} throw new Error("Nextcloud " + res.status + (m ? ": " + m : "")); }
};
const ncDeleteEvent = async (cfg, uid) => {
  if (!ncReady(cfg)) return;
  try {
    await apiFetch("/api/nc/event/delete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: cfg.user, pass: cfg.pass, calendarUrl: cfg.calendarUrl, uid }),
    });
  } catch (_) { /* Dolibarr-Seite trotzdem weiter löschen */ }
};
const ncProjectUid = (id) => `blattwerk-project-${id}@blattwerk`;
const ncTaskUid = (id) => `blattwerk-task-${id}@blattwerk`;

// Identität für Zu-/Absagen aus dem Dolibarr-Login ableiten.
const rsvpName = (me) => (`${me?.firstname || ""} ${me?.lastname || ""}`.trim()) || me?.login || "";
const rsvpEmail = (me) => (me?.email || "").trim().toLowerCase()
  || ((me?.login || "user").toLowerCase().replace(/[^a-z0-9._-]/g, "") + "@blattwerk.app");

// Zu-/Absage (wie SPD Maps) als ATTENDEE/PARTSTAT direkt ins Event-ICS schreiben:
// eigene ATTENDEE-Zeile im passenden VEVENT ersetzen/entfernen, Rest unangetastet.
// answer: 'yes' | 'maybe' | 'no' | null (Antwort zurückziehen). Gibt das neue ICS zurück.
const RSVP_PARTSTAT = { yes: "ACCEPTED", maybe: "TENTATIVE", no: "DECLINED" };
const ncRsvpEvent = async (cfg, event, { name, email, answer }) => {
  if (!ncReady(cfg)) throw new Error("Kein Nextcloud-Kalender verbunden");
  if (!event?.ics) throw new Error("Termin ohne ICS-Daten");
  const clean = String(name || "").replace(/[;:,"\\]/g, " ").replace(/\s+/g, " ").trim() || email;
  const lines = icalUnfold(event.ics).split(/\r\n|\n|\r/);
  const res = [];
  let block = null;
  for (const ln of lines) {
    if (ln === "BEGIN:VEVENT") { block = [ln]; continue; }
    if (block) {
      if (ln === "END:VEVENT") {
        const isTarget = !event.uid || block.some(b => b.startsWith("UID:") && b.slice(4).trim() === event.uid);
        let final = block;
        if (isTarget) {
          final = block.filter(b => !(b.toUpperCase().startsWith("ATTENDEE") && (
            b.toLowerCase().includes("mailto:" + email.toLowerCase()) ||
            (clean && b.includes(";CN=" + clean)))));
          if (answer) final = [...final, `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=${RSVP_PARTSTAT[answer] || "NEEDS-ACTION"};CN=${clean}:mailto:${email}`];
        }
        res.push(...final, ln);
        block = null; continue;
      }
      block.push(ln); continue;
    }
    res.push(ln);
  }
  const ics = res.join("\r\n");
  const r = await apiFetch("/api/nc/event/ics", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: cfg.user, pass: cfg.pass, calendarUrl: cfg.calendarUrl, uid: event.uid, href: event.href, ics }),
  });
  if (!r.ok) { let m = ""; try { m = (await r.json()).error || ""; } catch (_) {} throw new Error("Nextcloud " + r.status + (m ? ": " + m : "")); }
  return ics;
};

// ─── Termin bearbeiten ──────────────────────────────────────────────────────
// Ein bestehender Termin wird NICHT neu gebaut, sondern im vorhandenen ICS
// umgeschrieben. Neu bauen (buildIcs im Server) kennt nur Titel/Zeit/Ort/Notiz
// und wuerde alles andere stillschweigend loeschen: die Zu-/Absagen, die
// Wiederholungsregel, Erinnerungen, den Organisator. Genau das darf beim
// Aendern eines Datums nicht passieren.
const ics2 = (n) => String(n).padStart(2, "0");
const icsUtc = (d) =>
  `${d.getUTCFullYear()}${ics2(d.getUTCMonth() + 1)}${ics2(d.getUTCDate())}T${ics2(d.getUTCHours())}${ics2(d.getUTCMinutes())}${ics2(d.getUTCSeconds())}Z`;
const icsTag = (d) => `${d.getUTCFullYear()}${ics2(d.getUTCMonth() + 1)}${ics2(d.getUTCDate())}`;
const icsEscape = (s) =>
  (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Diese Eigenschaften beschreibt das Formular — nur sie werden ersetzt.
const ICS_ERSETZT = /^(SUMMARY|LOCATION|DESCRIPTION|DTSTART|DTEND|DURATION|DTSTAMP|LAST-MODIFIED|SEQUENCE)[;:]/i;

/** Enthaelt der Termin eine Wiederholungsregel? Dann trifft eine Aenderung die
 *  ganze Reihe — einzelne Termine einer Reihe kann nur Nextcloud selbst. */
export const icsIstReihe = (ics) => /^RRULE[;:]/im.test(icalUnfold(String(ics || "")));

/** Titel/Zeit/Ort/Notiz im passenden VEVENT ersetzen, alles andere behalten. */
export function icsAendern(rohIcs, uid, felder, jetzt) {
  const lines = icalUnfold(String(rohIcs || "")).split(/\r\n|\n|\r/);
  const start = new Date((felder.startSec || 0) * 1000);
  const ende = new Date((felder.endSec || felder.startSec || 0) * 1000);
  const neu = [];
  if (felder.allDay) {
    neu.push("DTSTART;VALUE=DATE:" + icsTag(start));
    neu.push("DTEND;VALUE=DATE:" + icsTag(felder.endSec ? ende : new Date(start.getTime() + 24 * 3600 * 1000)));
  } else {
    neu.push("DTSTART:" + icsUtc(start));
    neu.push("DTEND:" + icsUtc(ende > start ? ende : new Date(start.getTime() + 3600 * 1000)));
  }
  neu.push("SUMMARY:" + icsEscape(felder.title));
  if (felder.location) neu.push("LOCATION:" + icsEscape(felder.location));
  if (felder.note) neu.push("DESCRIPTION:" + icsEscape(felder.note));

  const stempel = icsUtc(jetzt || new Date());
  const res = [];
  let block = null;
  for (const ln of lines) {
    if (ln === "BEGIN:VEVENT") { block = [ln]; continue; }
    if (!block) { res.push(ln); continue; }
    if (ln !== "END:VEVENT") { block.push(ln); continue; }

    const ziel = !uid || block.some((b) => b.startsWith("UID:") && b.slice(4).trim() === uid);
    let fertig = block;
    if (ziel) {
      const seqZeile = block.find((b) => /^SEQUENCE:/i.test(b));
      const seq = seqZeile ? (parseInt(seqZeile.split(":")[1], 10) || 0) : 0;
      // Verschachtelte Bausteine (VALARM) unangetastet lassen: eine Erinnerung
      // hat selbst eine DESCRIPTION, die hier sonst mit weggefiltert wuerde.
      const behalten = [];
      let tiefe = 0;
      for (const b of block.slice(1)) {
        if (/^BEGIN:/i.test(b)) { tiefe++; behalten.push(b); continue; }
        if (/^END:/i.test(b)) { tiefe--; behalten.push(b); continue; }
        if (tiefe > 0 || !ICS_ERSETZT.test(b)) behalten.push(b);
      }
      fertig = [
        block[0], ...neu,
        "SEQUENCE:" + (seq + 1), "DTSTAMP:" + stempel, "LAST-MODIFIED:" + stempel,
        ...behalten,
      ];
    }
    res.push(...fertig, ln);
    block = null;
  }
  return res.join("\r\n");
}

/** Bestehenden Termin aendern. Schreibt das umgeschriebene ICS zurueck — ueber
 *  die echte href, denn direkt in Nextcloud angelegte Termine heissen nicht
 *  zwingend <uid>.ics; ueber den UID-Pfad entstuende sonst ein Duplikat. */
const ncEditEvent = async (cfg, event, felder) => {
  if (!ncReady(cfg)) throw new Error("Kein Nextcloud-Kalender verbunden");
  if (!event?.ics) throw new Error("Termin ohne ICS-Daten");
  const ics = icsAendern(event.ics, event.uid, felder);
  const r = await apiFetch("/api/nc/event/ics", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: cfg.user, pass: cfg.pass, calendarUrl: cfg.calendarUrl, uid: event.uid, href: event.href, ics }),
  });
  if (!r.ok) { let m = ""; try { m = (await r.json()).error || ""; } catch (_) {} throw new Error("Nextcloud " + r.status + (m ? ": " + m : "")); }
  return ics;
};

// Termine aus dem Nextcloud-Kalender lesen (via Proxy /api/nc/events).
// Minimaler iCal-Parser nach dem Vorbild von SPD Maps (utils/ical.js):
// SUMMARY/DESCRIPTION/LOCATION/UID/DTSTART/DTEND, Ganztags- und TZID-Formate.
const icalUnfold = (t) => t.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
const parseIcalDate = (raw) => {
  const s = raw.trim();
  if (s.length === 8) {
    return { date: new Date(parseInt(s.slice(0, 4)), parseInt(s.slice(4, 6)) - 1, parseInt(s.slice(6, 8))), allDay: true };
  }
  const y = parseInt(s.slice(0, 4)), mo = parseInt(s.slice(4, 6)) - 1, d = parseInt(s.slice(6, 8));
  const h = parseInt(s.slice(9, 11)), mi = parseInt(s.slice(11, 13)), sec = parseInt(s.slice(13, 15)) || 0;
  const date = s.endsWith("Z") ? new Date(Date.UTC(y, mo, d, h, mi, sec)) : new Date(y, mo, d, h, mi, sec);
  return { date, allDay: false };
};
const parseIcalEvents = (rawText) => {
  const lines = icalUnfold(rawText).split(/\r\n|\n|\r/);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT" && cur) { if (cur.start) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).split(";")[0].toUpperCase();
    const value = line.slice(colon + 1);
    switch (key) {
      case "SUMMARY":     cur.title = value.replace(/\\,/g, ",").replace(/\\n/g, "\n").replace(/\\\\/g, "\\"); break;
      case "DESCRIPTION": cur.note = value.replace(/\\,/g, ",").replace(/\\n/g, "\n").replace(/\\\\/g, "\\"); break;
      case "LOCATION":    cur.location = value.replace(/\\,/g, ","); break;
      case "UID":         cur.uid = value.trim(); break;
      case "DTSTART":     try { const r = parseIcalDate(value); cur.start = r.date; cur.allDay = r.allDay; } catch (_) {} break;
      case "DTEND":       try { cur.end = parseIcalDate(value).date; } catch (_) {} break;
      case "ATTENDEE": {  // Zu-/Absagen: CN + PARTSTAT aus den Parametern, Mail aus dem Wert
        const params = line.slice(0, colon);
        const cn = (params.match(/;CN="?([^";]*)"?/i) || [])[1] || "";
        const partstat = ((params.match(/;PARTSTAT=([A-Z-]+)/i) || [])[1] || "").toUpperCase();
        const mail = value.replace(/^mailto:/i, "").trim();
        (cur.attendees = cur.attendees || []).push({ name: cn || mail, mail, partstat });
        break;
      }
    }
  }
  return events;
};
const ncFetchEvents = async (cfg, fromDate, toDate) => {
  if (!ncReady(cfg)) return [];
  const res = await apiFetch("/api/nc/events", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user: cfg.user, pass: cfg.pass, calendarUrl: cfg.calendarUrl,
      startSec: Math.floor(fromDate.getTime() / 1000), endSec: Math.floor(toDate.getTime() / 1000),
    }),
  });
  if (!res.ok) { let m = ""; try { m = (await res.json()).error || ""; } catch (_) {} throw new Error("Nextcloud " + res.status + (m ? ": " + m : "")); }
  const body = await res.json();
  const out = [];
  for (const item of body.events || []) {
    // Roh-ICS mitgeben, damit Zu-/Absagen das Original nur minimal ändern können
    for (const ev of parseIcalEvents(item.ics)) out.push({ ...ev, href: item.href, ics: item.ics });
  }
  return out.sort((a, b) => a.start - b.start);
};
const calSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const ncManualUid = () => `blattwerk-cal-${Date.now()}-${Math.floor(Math.random() * 1e6)}@blattwerk`;
// Hier stand fmtManualDate: es setzte jede von Hand nachgetragene Schicht auf
// 12:00 GMT. Seit die Maske Beginn und Ende abfragt (§ 17 MiLoG), gibt es keinen
// Grund mehr, eine Uhrzeit zu erfinden — zeitpunktAus baut sie aus dem, was
// eingetragen wurde. Bewusst nicht als Bequemlichkeit stehen gelassen: ein
// erfundener Beginn im gesetzlichen Nachweis ist schlimmer als gar keiner.
// The numeric id of the connected user, or 0 when it isn't known yet.
const resolveUserId = (me) => { const n = parseInt(me?.id, 10); return Number.isFinite(n) && n > 0 ? n : 0; };

// Save a time entry against a task via POST /tasks/{id}/addtimespent.
//
// This endpoint is the single most version-sensitive part of the Dolibarr REST
// API. Across releases it behaves inconsistently with the `user_id` field:
//   • some versions require an explicit user_id and reject 0 / a missing value;
//   • others throw a hard, detail-less HTTP 500 when an explicit user_id is
//     supplied (e.g. when that user has no hourly rate) and only succeed when
//     the connected user is filled in server-side by omitting the field.
// Because we can't detect the version, we try the explicit user first and, if
// the server errors, retry while letting Dolibarr default the connected user.
// A failed addtimespent is rolled back on the server, so the retry never
// double-books the time.
async function saveTimeSpent(api, taskId, { date, duration, userId, note }) {
  // Gebucht wird über das eigene Dolibarr-Modul `blattwerkzeit`, nicht über den
  // Kern-Endpunkt /tasks/{id}/addtimespent. Grund ist die Uhrzeit.
  //
  // Der Kern nimmt sie nicht an. Am 12.08.2026 an der laufenden Instanz geprüft:
  //
  //   POST /tasks/1/addtimespent  {"date":"2026-08-12 05:30:00", …}
  //   → 400 "Expecting date in `YYYY-MM-DD` format"
  //
  // Und zwar nicht, weil Dolibarr nicht wollte: sein Docblock verspricht
  // ausdrücklich "YYYY-MM-DD HH:MI:SS in GMT" und dol_stringtotime parst genau
  // das. Restler trägt den Parameter aber allein wegen seines NAMENS als Typ
  // `date` ein (Routes.php:155 gegen die Tabelle $fieldTypesByName, in der
  // schlicht 'date' => 'date' steht) und prüft ihn mit Validator::date(), das
  // nur ein reines Datum durchlässt. Der Aufruf erreicht Dolibarr nie.
  //
  // Das eigene Modul nennt den Parameter deshalb `datum`. Damit greift die
  // Namensregel nicht, der volle Zeitpunkt landet in element_datehour, und die
  // Zeiterfassungs-Liste zeigt den tatsächlichen Beginn statt "00:00".
  //
  // Es liegt unter /srv/appdata/dolibarr/custom — einem echten Bind-Mount. Ein
  // Eingriff im Container überlebt kein Image-Update, und daran darf eine
  // Aufzeichnung nach § 17 MiLoG nicht hängen.
  //
  // Der Zeitraum steht trotzdem zusätzlich in der Notiz (siehe zeitraumText):
  // Dolibarr kennt kein Ende, und sobald eine Pause in der Buchung steckt, ist
  // es aus Beginn + Dauer nicht mehr zu rekonstruieren.
  return await api.addTaskTimeSpent({
    taskid: Number(taskId),
    datum: date,
    dauer: Math.round(duration),
    benutzer: Number.isFinite(userId) && userId > 0 ? userId : 0,
    notiz: note || "",
  });
}

// Turn a raw Dolibarr API error into a short, readable message. Dolibarr usually
// answers with `{"error":{"code":NNN,"message":"…"}}`, but a server-side fatal
// (the common cause of save failures here) comes back as a bare status with an
// empty body — so we give an actionable hint instead of an opaque "Error 500:".
const doliError = (e) => {
  const msg = String(e?.message || "");
  const m = msg.match(/"message"\s*:\s*"([^"]*)"/);
  if (m && m[1].trim()) return m[1].trim().slice(0, 200);
  const statusOnly = msg.match(/^API Error (\d+):\s*$/);
  if (statusOnly) {
    // Der frühere Text schickte auf die Rechte-Fährte, der davor auf den Fehler
    // in Dolibarrs `addtimespent` (10.08.2026, Restler stirbt am Union-Typ im
    // Docblock). Beides trifft es heute nicht mehr: die Zeit wird seit dem
    // 12.08.2026 über das eigene Modul `blattwerkzeit` gebucht, und ein leerer
    // 500er heißt dort am ehesten, dass das Modul nach einem Dolibarr-Update
    // fehlt oder abgeschaltet ist. Ein erneuter Versuch hilft in keinem Fall.
    return `Serverfehler ${statusOnly[1]}: Dolibarr hat abgebrochen, ohne etwas `
      + `zurückzumelden. Beim Buchen von Zeit lohnt der Blick auf das Modul `
      + `„BlattwerkZeit" — ein erneuter Versuch hilft nicht.`;
  }
  return (msg || "Unbekannter Fehler").slice(0, 200);
};
// A project counts as "open" while it is not closed (Dolibarr status 2 = closed).
const isOpenProject = (p) => Number(p.statut) !== 2;

// ─── App permission settings ────────────────────────────────────────────────
const DEFAULT_PERMISSION_GROUPS = {
  validateInvoices: ["admins", "admin", "administratoren", "geschäftsführer", "geschaeftsfuehrer", "management"],
  validateProposals: ["admins", "admin", "administratoren", "geschäftsführer", "geschaeftsfuehrer", "management"],
  setProposalStatus: ["admins", "admin", "administratoren", "geschäftsführer", "geschaeftsfuehrer", "management"],
  validateSupplierInvoices: ["admins", "admin", "administratoren", "geschäftsführer", "geschaeftsfuehrer", "management"],
  validateExpenses: ["admins", "admin", "administratoren", "geschäftsführer", "geschaeftsfuehrer", "management"],
  closeProjects: ["admins", "admin", "administratoren", "geschäftsführer", "geschaeftsfuehrer", "management"],
  // Buchungskonten an Rechnungspositionen sehen: bewusst OHNE Geschäftsführer —
  // nur Admins und die Finanz-/Buchhaltungsgruppe (des Inhabers Vorgabe 22.07.2026).
  viewAccounting: ["admins", "admin", "administratoren", "finanzen", "finance", "buchhaltung"],
  // Alle Gefährdungsbeurteilungen (Nextcloud-Archiv) sehen — die Geschäftsführer.
  viewAllGbu: ["admins", "admin", "administratoren", "geschäftsführer", "geschaeftsfuehrer", "management"],
  // Zahlungen auf Rechnungen erfassen: wie viewAccounting bewusst OHNE
  // Geschäftsführer — nur Admins + Finanzen/Buchhaltung (des Inhabers Vorgabe 20.08.2026).
  recordPayments: ["admins", "admin", "administratoren", "finanzen", "finance", "buchhaltung"],
  // Modul „Bank" (Verwaltung → Bank, Bankzeilen + Kontoauszug-Upload): wie viewAccounting
  // bewusst OHNE Geschäftsführer — nur Admins + Finanzen/Buchhaltung (des Inhabers Vorgabe 20.09.2026).
  viewBank: ["admins", "admin", "administratoren", "finanzen", "finance", "buchhaltung"],
  // Kontostände/Finanzübersicht unter Verwaltung — die Geschäftsführer
  // (des Inhabers Vorgabe 20.08.2026: „nur für Geschäftsführer").
  viewFinanzen: ["admins", "admin", "administratoren", "geschäftsführer", "geschaeftsfuehrer", "management"],
  // Betriebsdokumente (Verwaltung → Wichtige Dokumente) hochladen — sehen
  // dürfen alle (zum Vorzeigen unterwegs), einstellen nur Geschäftsführer/Admins
  // (des Inhabers Vorgabe 20.08.2026).
  uploadDokumente: ["admins", "admin", "administratoren", "geschäftsführer", "geschaeftsfuehrer", "management"],
  // Kachel-Sichtbarkeit je Gruppe (src/kacheln.js, Spec 2026-09-23): "*" = alle.
  ...KACHEL_STANDARD,
};
const normGroup = (v) => String(v || "").trim().toLowerCase();
// Server (Mandant) schlaegt Geraet, siehe rechteMischen (src/mandant.js) —
// der Geraete-Wert (localStorage) bleibt nur als einmaliger Uebergang fuer
// BLATTWERKS eigene Bestandsgeraete, nicht als allgemeine Geraete-
// Voreinstellung (rechteMischen entscheidet das anhand von mandant.kuerzel,
// deshalb hier der GANZE Mandant statt nur mandant.rechte).
const loadPermissionGroups = (mandant) => {
  let ausGeraet = {};
  try { ausGeraet = JSON.parse(localStorage.getItem("dolibarr_permission_groups") || "{}"); } catch (_) {}
  return rechteMischen(DEFAULT_PERMISSION_GROUPS, mandant, ausGeraet);
};
const hasAnyGroup = (groupNames, allowed) => (allowed || []).includes("*") || groupNames.some((g) => (allowed || []).map(normGroup).includes(normGroup(g)));

// ─── Delete permissions ──────────────────────────────────────────────────────
// Who created a record. Dolibarr exposes the creator under different property
// names per object: thirdparties use `user_creation_id`, projects use
// `user_author_id`; older instances may expose the raw `fk_user_creat`.
const creatorId = (o) => {
  const v = o?.user_creation_id ?? o?.user_author_id ?? o?.fk_user_creat ?? o?.fk_user_author;
  return v == null || v === "" ? null : String(v);
};
// Derive delete permissions from the connected user (`/users/info`). Members of
// the "Admins" group (or Dolibarr super-admins) may delete anything from the
// app; everyone else may only delete records they created themselves.
const buildPermissions = (u, mandant) => {
  const groups = Array.isArray(u?.user_group_list) ? u.user_group_list : [];
  const groupNames = groups.map((g) => normGroup(g?.name || g?.nom || g?.label));
  const cfg = loadPermissionGroups(mandant);
  const inAdminsGroup = groupNames.some((n) => n === "admins" || n === "admin" || n === "administratoren");
  const isAdmin = Number(u?.admin) === 1 || inAdminsGroup;
  return {
    id: u?.id != null ? String(u.id) : null,
    isAdmin,
    canValidateInvoices: isAdmin || hasAnyGroup(groupNames, cfg.validateInvoices),
    canValidateProposals: isAdmin || hasAnyGroup(groupNames, cfg.validateProposals),
    canSetProposalStatus: isAdmin || hasAnyGroup(groupNames, cfg.setProposalStatus),
    canValidateSupplierInvoices: isAdmin || hasAnyGroup(groupNames, cfg.validateSupplierInvoices),
    canValidateExpenses: isAdmin || hasAnyGroup(groupNames, cfg.validateExpenses),
    canCloseProject: isAdmin || hasAnyGroup(groupNames, cfg.closeProjects),
    canViewAccounting: isAdmin || hasAnyGroup(groupNames, cfg.viewAccounting),
    canViewAllGbu: isAdmin || hasAnyGroup(groupNames, cfg.viewAllGbu),
    canRecordPayments: isAdmin || hasAnyGroup(groupNames, cfg.recordPayments),
    canViewFinanzen: isAdmin || hasAnyGroup(groupNames, cfg.viewFinanzen),
    canViewBank: isAdmin || hasAnyGroup(groupNames, cfg.viewBank),
    canUploadDokumente: isAdmin || hasAnyGroup(groupNames, cfg.uploadDokumente),
    // Kachel sichtbar? (src/kacheln.js; kachelnFiltern ruft das je Kachel auf)
    kachel: (id) => isAdmin || hasAnyGroup(groupNames, cfg[kachelKey(id)] || ["*"]),
    canValidate: isAdmin || hasAnyGroup(groupNames, cfg.validateInvoices),
    // NICHT client-seitig erfunden: `mandant.roh` liefert der Server nur an
    // Mandanten-Admins (istMandantAdmin() gegen MANDANT_ADMINS, siehe
    // GET /api/mandant in src/mandant-server.mjs) — dessen Anwesenheit ist
    // deshalb das einzige verlaessliche, nicht faelschbare Signal dafuer.
    // AdminPanel benutzt genau dieselbe Ableitung schon seit Task 10.
    mandantAdmin: !!mandant?.roh,
    groupNames,
    firstname: u?.firstname || "",
    lastname: u?.lastname || "",
    login: u?.login || "",
    // Wird fuer die Zu-/Absagen gebraucht: die ATTENDEE-Zeile im Kalender
    // traegt diese Adresse. Fehlte sie hier, griff die Ersatzadresse
    // `<login>@blattwerk.app` — die zu keinem echten Postfach gehoert und die
    // Nextcloud keiner Person zuordnen kann.
    email: u?.email || "",
  };
};
// A record may be deleted in the app when the connected user is an Admin, or
// when they are the creator of the record.
const canDeleteRecord = (record, me) =>
  !!me && (me.isAdmin || (me.id != null && creatorId(record) === me.id));

// Dolibarrs Datei-Zugriffspruefung (core/lib/files.lib.php) benutzt andere
// Bereichsnamen als die REST-Endpunkte. Beim Angebot kennt sie nur
// `propal`/`propale` — `proposal` nimmt der Endpunkt zwar an, baut das PDF auch,
// gibt aber LEEREN Inhalt zurueck, und zwar mit Status 200. Der Export sah
// dadurch aus wie "geht nur bei validierten Belegen", scheiterte in Wahrheit
// aber immer. Bei der Rechnung kennt sie `facture` UND `invoice`, deshalb fiel
// es dort nie auf. Am Quelltext der Instanz nachgelesen und an einem
// Wegwerf-Angebot gegengeprueft (10.08.2026).
const dateiBereich = (modulepart) => ({
  proposal: "propal",
  supplier_invoice: "facture_fournisseur",
}[modulepart] || modulepart);

const base64ZuBlob = (b64, typ) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: typ || "application/pdf" });
};

// Speichern geht ueber den eigenen Server, nicht ueber die blob:-Adresse: die
// App-Huelle reicht nur Downloads an den System-Download-Manager weiter, deren
// URL mit "http" beginnt (MainActivity: `if (!url.startsWith("http")) return;`).
// Ein Klick auf "Laden" tat in der installierten App deshalb gar nichts —
// keine Datei, keine Meldung. Der Server legt den Inhalt kurz ab und liefert
// ihn unter einer echten Adresse mit "Content-Disposition: attachment" aus.
// Im normalen Browser bleibt der direkte Weg als Notnagel.
async function dateiSpeichern({ inhalt, name, typ, url }, showToast) {
  try {
    const r = await fetch("/api/datei/ablegen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inhalt, name, typ }),
    });
    if (!r.ok) throw new Error(`Status ${r.status}`);
    const { url: adresse } = await r.json();
    // Kein <a download>: die WebView loest den Download-Manager erst aus, wenn
    // sie zu einer Adresse navigiert, deren Antwort "attachment" sagt.
    window.location.href = adresse;
  } catch (e) {
    console.warn("Download über den Server nicht möglich, direkter Versuch", e);
    if (!url) { showToast("Download fehlgeschlagen", "error"); return; }
    const a = document.createElement("a");
    a.href = url; a.download = name || "beleg.pdf";
    document.body.appendChild(a); a.click(); a.remove();
  }
}

// Build the PDF for an invoice/proposal via Dolibarr and hand it back for
// viewing. modulepart is "invoice" or "proposal"; the document is stored as
// REF/REF.pdf. Funktioniert auch im Entwurf: Dolibarr erzeugt das PDF dann
// unter der vorlaeufigen Referenz "(PROV<id>)" und mit dem Vermerk
// "Nicht freigegeben" im Kopf.
async function pdfErzeugen(api, modulepart, ref, showToast) {
  if (!ref) { showToast("Kein Beleg zum Export", "error"); return null; }
  showToast("PDF wird erstellt…");
  try {
    const doc = await api.buildDocument({ modulepart: dateiBereich(modulepart), original_file: `${ref}/${ref}.pdf`, doctemplate: "", langcode: "" });
    const b64 = doc?.content;
    if (!b64) throw new Error("Kein Inhalt");
    const typ = doc["content-type"] || "application/pdf";
    return { url: URL.createObjectURL(base64ZuBlob(b64, typ)), name: doc.filename || `${ref}.pdf`, inhalt: b64, typ };
  } catch (e) {
    console.error("PDF-Export fehlgeschlagen", e);
    showToast(doliError(e) || "PDF konnte nicht erstellt werden", "error");
    return null;
  }
}

// Loads selectable tasks (time can only be booked against a task in Dolibarr).
// Tasks are labelled with their project so the dropdown is understandable, and
// tasks of closed projects are hidden.
//
// Offline: the API can't be reached, so the same options are built from the
// local reference cache (`offline.readRefs`, kept warm while online) instead
// of a live API call. Task selection stays mandatory either way — no implicit
// "collective task" fallback.
function useProjectTasks(api) {
  const [tasks, setTasks] = useState([]);
  useEffect(() => {
    let cancelled = false;
    const buildOptions = (t, projById) => (Array.isArray(t) ? t : [])
      .filter((tk) => { const pr = projById[tk.fk_project]; return !pr || isOpenProject(pr); })
      .map((tk) => {
        const pr = projById[tk.fk_project];
        const projName = pr ? (pr.title || pr.ref || "") : "";
        const taskName = tk.label || tk.ref || `#${tk.id}`;
        return { id: String(tk.id), label: projName ? `${projName} – ${taskName}` : taskName };
      });

    if (!offline.isOnline()) {
      Promise.all([
        offline.readRefs("task").catch(() => []),
        offline.readRefs("project").catch(() => []),
      ]).then(([t, p]) => {
        if (cancelled) return;
        const projById = {};
        (Array.isArray(p) ? p : []).forEach((pr) => { projById[pr.id] = { title: pr.title, ref: pr.ref, statut: pr.status }; });
        const normTasks = (Array.isArray(t) ? t : []).map((tk) => ({ id: tk.id, fk_project: tk.project_id, label: tk.label }));
        setTasks(buildOptions(normTasks, projById));
      });
      return () => { cancelled = true; };
    }

    if (!api) return;
    Promise.all([
      api.getTasks().catch(() => []),
      api.getProjects().catch(() => []),
    ]).then(([t, p]) => {
      if (cancelled) return;
      const projById = {};
      (Array.isArray(p) ? p : []).forEach((pr) => { projById[pr.id] = pr; });
      setTasks(buildOptions(t, projById));
    });
    return () => { cancelled = true; };
  }, [api]);
  return tasks;
}

// Shared, persisted stopwatch so a timer started on the dashboard keeps running
// when navigating to the time-tracking screen (and vice versa). State lives in
// localStorage; elapsed time is always derived from the stored start timestamp.
function useTimeTracker(api, showToast, me, setPendingCount) {
  const read = () => {
    try { return JSON.parse(localStorage.getItem("dolibarr_timer") || "null"); } catch { return null; }
  };
  const [state, setState] = useState(() => read() || { running: false, startTime: null, task: "", note: "" });
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => { localStorage.setItem("dolibarr_timer", JSON.stringify(state)); }, [state]);
  useEffect(() => {
    if (!state.running || !state.startTime) { setElapsed(0); return; }
    const tick = () => setElapsed(Math.floor((Date.now() - state.startTime) / 1000));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [state.running, state.startTime]);

  const start = () => setState(s => ({ ...s, running: true, startTime: Date.now() }));
  const setMeta = (patch) => setState(s => ({ ...s, ...patch }));
  const stop = async () => {
    const startedAt = state.startTime;
    // Das Ende einmal festhalten statt Date.now() mehrfach zu lesen — Dauer,
    // Notiz und Anzeige müssen dieselbe Sekunde meinen.
    const endedAt = Date.now();
    const dur = startedAt ? Math.floor((endedAt - startedAt) / 1000) : 0;
    // A task is mandatory in Dolibarr. Keep the timer running (don't lose the
    // elapsed time) until the user has picked one.
    if (dur > 0 && !state.task) {
      showToast("Bitte zuerst eine Aufgabe wählen", "error");
      return null;
    }
    setState(s => ({ ...s, running: false, startTime: null }));
    if (dur > 0) {
      // Die durchlaufende Stoppuhr kennt keine Pause, also ist hier
      // Dauer = Ende − Beginn. Der Zeitraum steht trotzdem in der Notiz: er ist
      // das, was auf dem Stundennachweis abgelesen wird, ohne dass jemand
      // Beginn und Dauer im Kopf addieren muss.
      const notiz = zeitNotiz(zeitraumText(startedAt, endedAt), state.note);
      setSaving(true);
      try {
        if (offline.isOnline() && window.__api) {
          await saveTimeSpent(api, state.task, {
            date: fmtDoliDateTime(startedAt),
            duration: dur,
            userId: resolveUserId(me),
            note: notiz,
          });
          showToast(`${fmtTimer(dur)} erfasst!`);
        } else {
          await offline.enqueue({
            type: "time",
            payload: {
              taskOrProjectRef: state.task,
              date: fmtDoliDateTime(startedAt),
              durationSeconds: dur,
              userId: resolveUserId(me),
              note: notiz,
            },
            createdBy: me?.login || "",
          });
          setPendingCount(c => c + 1);
          showToast(`${fmtTimer(dur)} offline gespeichert – wird synchronisiert, sobald wieder online.`);
        }
        return { timespent_date: Math.floor(startedAt / 1000), timespent_duration: dur, note: notiz };
      } catch (e) { showToast(`Speicherfehler: ${doliError(e)}`, "error"); }
      finally { setSaving(false); }
    }
    return null;
  };
  return { state, elapsed, saving, start, stop, setMeta };
}

// Land für neu angelegte Kunden/Interessenten/Lieferanten: Blattwerk arbeitet
// ausschließlich in Deutschland, also nie abfragen, sondern immer setzen
// (country_id 5 = DE in Dolibarrs llx_c_country). Bewusst NUR beim Anlegen —
// beim Bearbeiten würde es ein abweichendes Land stillschweigend überschreiben.
const DE_LAND = { country_id: 5, country_code: "DE" };

// Create a thirdparty, letting Dolibarr assign the customer/supplier number
// itself — exactly like the web UI. When no code was entered, the code field is
// sent as the literal "auto", which triggers the server-side numbering module.
// As a safety net for instances with a manual numbering module (which won't
// honour "auto"), fall back to a generated code before giving up.
// Lieferant wählen oder – wenn es ihn noch nicht gibt – direkt im Ablauf als neuen
// Partner anlegen lassen (Name vorbelegt, änderbar). Angelegt wird erst beim Speichern
// über lieferantSicherstellen, damit ein Abbruch keinen verwaisten Partner hinterlässt.
function LieferantWahl({ label = "Lieferant", value, neuerName, onChange, options, vorschlagName = "", optional = false, leerHinweis = "" }) {
  // Eigener Schalter: ein geleertes Namensfeld soll den Modus nicht wieder schließen.
  const [neu, setNeu] = useState(!!neuerName);
  return (
    <>
      {!neu && <SearchSelect label={label} value={value} onChange={(v) => onChange(v, "")} options={options}
        getLabel={(s) => s.name || s.nom || `Lieferant #${s.id}`} getSub={(s) => [s.town, s.email].filter(Boolean).join(" · ")}
        placeholder="Lieferant eintippen…" optional={optional} />}
      {neu && (
        <div className="field-group mb12"><label>Neuer Partner (Lieferant)</label>
          <input value={neuerName} onChange={(e) => onChange("", e.target.value)} placeholder="Name des Lieferanten" autoFocus />
        </div>
      )}
      {!value && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, margin: "-4px 0 12px" }}>
          <input type="checkbox" checked={neu} onChange={(e) => { setNeu(e.target.checked); onChange("", e.target.checked ? vorschlagName : ""); }} />
          Gibt es noch nicht – neuen Partner anlegen
        </label>
      )}
      {!value && !neu && leerHinweis && <div style={{ fontSize: 12, color: "var(--text2)", margin: "-8px 0 12px" }}>{leerHinweis}</div>}
    </>
  );
}

async function lieferantSicherstellen(api, id, neuerName) {
  if (id) return Number(id);
  const name = String(neuerName || "").trim();
  if (!name) return 0;
  const res = await createThirdpartyWithFallback(api, { name, fournisseur: 1, client: 0, ...DE_LAND, typent_id: 0, code_fournisseur: "auto" }, "supplier", false);
  return Number(typeof res === "number" ? res : (res?.id || res?.rowid)) || 0;
}

// Bestellung für einen schon getätigten Einkauf: anlegen und gleich bestätigen
// (ein Entwurf wäre irreführend). Scheitert das Validieren, bleibt sie Entwurf.
async function bestellungNachtraeglich(api, payload) {
  const res = await api.createSupplierOrder(payload);
  const id = Number(typeof res === "number" ? res : (res?.id || res?.rowid)) || 0;
  if (id) await api.validateSupplierOrder(id).catch(() => {});
  return id;
}

async function createThirdpartyWithFallback(api, payload, type, userProvidedCode) {
  if (userProvidedCode) return await api.createThirdparty(payload);

  // Ask Dolibarr to auto-number whichever role(s) this thirdparty has.
  const autoPayload = { ...payload };
  if (payload.client) autoPayload.code_client = "auto";
  if (payload.fournisseur) autoPayload.code_fournisseur = "auto";
  try {
    return await api.createThirdparty(autoPayload);
  } catch (err) {
    const msg = String(err?.message || "");
    // Only attempt a generated code when Dolibarr complains about the code
    // itself (manual numbering module); otherwise surface the real error.
    if (!/CodeRequired|BadCustomerCodeSyntax|BadSupplierCodeSyntax|BadCodeSyntax/i.test(msg)) throw err;
    const codeField = type === "customer" ? "code_client" : "code_fournisseur";
    const prefix = codeField === "code_fournisseur" ? "F" : "C";
    for (const code of [genCode(prefix), genNumericCode()]) {
      try {
        return await api.createThirdparty({ ...payload, [codeField]: code });
      } catch (e2) {
        if (!/BadCustomerCodeSyntax|BadSupplierCodeSyntax|BadCodeSyntax|CodeRequired/i.test(String(e2?.message || ""))) throw e2;
      }
    }
    throw err;
  }
}

// Turn a raw Dolibarr API error into a short, actionable German message.
function friendlyThirdpartyError(err, type) {
  const msg = String(err?.message || "");
  const label = type === "customer" ? "Kundennummer" : "Lieferantennummer";
  if (/BadCustomerCodeSyntax|BadSupplierCodeSyntax|BadCodeSyntax/i.test(msg))
    return `Dolibarr verlangt eine ${label} in einem bestimmten Format. Bitte gib sie manuell im Feld „${label}“ ein.`;
  if (/CodeRequired/i.test(msg))
    return `Dolibarr verlangt eine ${label}. Bitte gib sie manuell ein.`;
  const m = msg.match(/"message"\s*:\s*"([^"]+)"/);
  return m ? m[1] : (msg || "Speicherfehler");
}

// Loeschen eines Geschaeftspartners. Dolibarr kennt dafuer genau zwei Absagen,
// und beide klingen im Original nach kaputter App — sie muessen uebersetzt
// werden (am 16.08.2026 am Quelltext der Instanz nachgelesen):
// (1) **409** „Can't delete, that product is probably used" — `product` ist in
//     `api_thirdparties.class.php` schlicht falsch abgeschrieben, gemeint ist
//     der Partner selbst. Ausgeloest von `Societe::delete`, das ueber
//     `isObjectUsed` prueft, ob noch Rechnungen, Angebote oder Projekte am
//     Partner haengen. Das ist der Regelfall bei gewachsenen Datensaetzen, kein
//     Ausnahmefehler.
// (2) **403** — der Dolibarr-Benutzer hinter dem API-Schluessel hat das Recht
//     `societe->supprimer` nicht. Erreichbar, weil die App-Rolle „Admin" aus
//     der Gruppenzugehoerigkeit kommt (`buildPermissions`) und nicht aus
//     Dolibarrs Rechtematrix: der Knopf kann also sichtbar sein, obwohl der
//     Aufruf abgewiesen wird. Ohne diesen Hinweis sucht man den Fehler in der
//     App statt in den Dolibarr-Rechten.
function friendlyThirdpartyDeleteError(err) {
  const msg = String(err?.message || "");
  const status = Number((msg.match(/API Error (\d{3})/) || [])[1]);
  if (status === 409 || /probably used/i.test(msg))
    return "Dieser Geschäftspartner hängt noch an Belegen (Rechnungen, Angebote, "
      + "Projekte). Dolibarr löscht nur Partner ohne Belege — erst die verknüpften "
      + "Belege löschen.";
  if (status === 403)
    return "Dein Dolibarr-Benutzer darf Geschäftspartner nicht löschen "
      + "(fehlendes Recht „Dritte → löschen“).";
  const m = msg.match(/"message"\s*:\s*"([^"]+)"/);
  return m ? m[1] : (msg || "Löschen fehlgeschlagen");
}

// ─── Status filters (default view shows only "open" items) ──────────────────
const INVOICE_FILTERS = [
  { key: "open",      label: "Offen",     match: (s) => s !== 2 && s !== 3 },
  { key: "all",       label: "Alle",      match: () => true },
  { key: "draft",     label: "Entwurf",   match: (s) => s === 0 },
  { key: "paid",      label: "Bezahlt",   match: (s) => s === 2 },
  { key: "cancelled", label: "Storno",    match: (s) => s === 3 },
];
const PROPOSAL_FILTERS = [
  { key: "accepted",  label: "Angenommen", match: (s) => s === 2 },
  { key: "open",      label: "Offen",      match: (s) => s === 1 },
  { key: "draft",     label: "Entwurf",    match: (s) => s === 0 },
  { key: "billed",    label: "Fakturiert", match: (s) => s === 4 },
  { key: "refused",   label: "Abgelehnt",  match: (s) => s === 3 },
  { key: "all",       label: "Alle",       match: () => true },
];
// ─── Zahlungserfassung & Finanzübersicht ────────────────────────────────────
// Alles hier sind reine Funktionen/Konstanten — die Tests in test/rechnung/
// zahlung.test.js und test/finanzen/uebersicht.test.js schneiden diesen
// Abschnitt zwischen seinen beiden Markerzeilen aus und werten ihn aus.

// Restbetrag einer Kundenrechnung. Dolibarr liefert remaintopay in der Liste
// als Zahl, im Einzelabruf teils als String — deshalb parseFloat statt Vertrauen.
const restBetrag = (inv) => {
  const r = parseFloat(inv?.remaintopay);
  if (Number.isFinite(r)) return r;
  return (parseFloat(inv?.total_ttc) || 0) - (parseFloat(inv?.totalpaid) || 0);
};

// Baut Pfad + Body für die Zahlungsbuchung. Die Weiche ist fachlich, nicht
// kosmetisch: POST /invoices/{id}/payments bucht IMMER den vollen Restbetrag
// (api_invoices.class.php ignoriert jeden Betrag) — ein Teilbetrag dorthin
// würde stillschweigend als Vollzahlung gebucht. Teilbeträge gehen deshalb
// über /invoices/paymentsdistributed mit arrayofamounts.
// closepaidinvoices bleibt in beiden Fällen "yes": Dolibarr schließt nur
// Rechnungen, die danach wirklich vollständig bezahlt sind.
const zahlungPlan = (inv, { betrag, datum, zahlungsartId, kontoId, kommentar }) => {
  const gemeinsam = {
    datepaye: datum, // 'YYYY-MM-DD' — dol_stringtotime parst das serverseitig
    paymentid: Number(zahlungsartId),
    closepaidinvoices: "yes",
    accountid: Number(kontoId),
    comment: kommentar || "",
  };
  const voll = Math.abs(betrag - restBetrag(inv)) < 0.005;
  if (voll) return { pfad: `/invoices/${inv.id}/payments`, body: gemeinsam };
  return {
    pfad: "/invoices/paymentsdistributed",
    body: {
      ...gemeinsam,
      arrayofamounts: { [String(inv.id)]: { amount: String(betrag), multicurrency_amount: "" } },
    },
  };
};

// Verkaufspreis eines NEU angelegten Artikels: mindestens der Einkaufspreis
// dieser Belegzeile (des Inhabers Regel 20.08.2026). Ohne Preis legte die
// Auto-Anlage jeden Artikel mit 0 € an — wer ihn später in ein Angebot zog,
// verkaufte ihn geschenkt, ohne dass es beim Erstellen auffiel.
// Als Netto (`HT`) gesetzt, obwohl der Einkauf brutto ist: Blattwerk verkauft
// als Kleinunternehmer mit 0 % USt, so liegt der Verkauf sicher über dem
// Einkauf statt knapp darunter. Leerer/0-Preis → gar kein Preisfeld, damit
// eine 0 nicht als „kostet nichts" festgeschrieben wird.
const verkaufspreisAusEinkauf = (zeile) => {
  const ek = parseFloat(zeile?.price);
  if (!Number.isFinite(ek) || ek <= 0) return {};
  return { price: Math.round(ek * 100) / 100, price_base_type: "HT" };
};

// Restbetrag einer LIEFERANTENrechnung. Die API liefert hier weder totalpaid
// noch remaintopay (20.08.2026 an der Instanz geprüft) — bezahlt erkennt man
// nur an paye=1, also gilt: bezahlt = 0 offen, sonst der volle Betrag.
const lieferantRestBetrag = (inv) => (Number(inv?.paye) === 1 ? 0 : (parseFloat(inv?.total_ttc) || 0));

// Body für POST /supplierinvoices/{id}/payments. Anders als beim Kunden heißt
// die Zahlungsart hier payment_mode_id (paymentid wird still ignoriert — die
// alte Beleg-Pipeline-Falle), und ein Teilbetrag geht direkt über `amount`.
// Bei Vollzahlung bleibt amount weg: dann bucht Dolibarr den Restbetrag und
// kleine Rundungsdifferenzen können keinen Rest stehen lassen.
// datepaye ist hier ZWINGEND ein Unix-Timestamp — Restler prüft den Parameter
// namensbasiert und weist den 'YYYY-MM-DD'-String mit 400 ab (am 20.08.2026
// live passiert; die Kundenroute nimmt dagegen den String). 12:00 UTC, damit
// keine Zeitzone den Tag verschiebt.
const lieferantZahlungBody = (inv, { betrag, datum, zahlungsartId, kontoId, kommentar }) => {
  const [j, m, t] = String(datum).split("-").map(Number);
  const body = {
    datepaye: Math.floor(Date.UTC(j, m - 1, t, 12) / 1000),
    payment_mode_id: Number(zahlungsartId),
    closepaidinvoices: "yes",
    accountid: Number(kontoId),
    comment: kommentar || "",
  };
  const voll = Math.abs(betrag - lieferantRestBetrag(inv)) < 0.005;
  if (!voll) body.amount = betrag;
  return body;
};

// Eingabeprüfung für den Zahlungsdialog: Fehlertext oder null.
// maxBetrag > rest gibt es nur bei gemahnten Rechnungen: dann darf die
// Zahlung bis zur gemahnten Gesamtforderung (Rest + Mahnkosten + Zinsen)
// gehen — der Mehrbetrag wird nicht auf die Rechnung gebucht, sondern als
// vereinnahmte Mahnkosten am Beleg vermerkt (siehe ZahlungDialog.buchen).
const zahlungFehler = ({ betrag, datum, zahlungsartId, kontoId }, rest, maxBetrag = rest) => {
  if (!Number.isFinite(betrag) || betrag <= 0) return "Bitte einen Betrag über 0 € eingeben.";
  // Bewusst ohne fmtMoney formatiert: dieser Abschnitt muss im Test-Sandbox
  // ohne den Rest der Datei auswertbar bleiben.
  if (betrag > maxBetrag + 0.005) return `Mehr als der Restbetrag (${maxBetrag.toFixed(2).replace(".", ",")} €) — Überzahlung wird nicht gebucht.`;
  if (!datum) return "Bitte ein Zahlungsdatum wählen.";
  if (!zahlungsartId) return "Bitte eine Zahlungsart wählen.";
  if (!kontoId) return "Bitte ein Konto wählen.";
  return null;
};

// Konto-Rolle nach Buchungsnummer: 1892/1893 sind die Privateinlage-Konten
// der Gesellschafter (Saldo negativ = die Firma schuldet ihnen Geld, z. B.
// der privat gezahlte Fiat). Alles andere (1200 Volksbank, 1000 Bargeld)
// ist Firmengeld. Bewusst über account_number statt über die Konto-Id: Inhaber
// hat zwei 1892er-Konten („Inhaber VR Konto" und „Inhaber Privat"), beide gehören
// zu ihm.
const KONTO_GESELLSCHAFTER = { 1892: "inhaber", 1893: "partner" };
const kontoRolle = (acc) => KONTO_GESELLSCHAFTER[String(acc?.account_number || "").trim()] || "firma";

// Die „… VR Konto"-Konten (Inhaber VR, Partner VR) zählen NUR steuerlich als
// Privateinlage — in der internen Kontostände-Ansicht bleiben sie außen vor
// (des Inhabers Vorgabe 20.08.2026: „für unsere Rechnung nicht"). Fürs Finanzamt
// ändert sich nichts, die stehen ja weiter auf 1892/1893 in Dolibarr.
const kontoNurSteuer = (acc) => /\bvr\b/i.test(String(acc?.label || ""));

// Anlagegüter (Großgeräte) und AfA — die Stelle, an der des Inhabers Verdacht vom
// 09.09.2026 („Großgeräte wurden voll abgezogen") tatsächlich zutraf: bis
// dahin gab es nur diese Handliste mit dem Fiat; jedes andere Gerät über der
// GWG-Grenze (Rasentraktor, Anhänger, Häcksler …) lief als normale
// Lieferantenrechnung voll in den Gewinn, in der Geldfluss-Sicht UND in der
// steuerlichen. Jetzt: Anlagegüter werden aus den Lieferantenrechnungen
// erkannt (anlagegueterErkennen), die Handliste bleibt für Käufe ohne
// Dolibarr-Beleg (privat verauslagter Fiat), und der angezeigte Gewinn setzt
// nur die anteilige AfA an (§ 7 EStG, monatsgenau). Die reine Geldfluss-Zahl
// gibt es weiter als `geldfluss`.
// Die maßgebliche Anlagenliste — abgeglichen mit **Dolibarrs Anlagen-Modul**
// (`llx_asset`) am 11.09.2026. Vorher riet die App die Anlagegüter allein aus
// Lieferantenrechnungen und übersah dadurch die beiden Käufe von 2025, zu
// denen es in Dolibarr keine Rechnung gibt (Beleg ist der Kaufvertrag in der
// Nextcloud): Kofferanhänger und Häcksler. Dolibarrs REST-API gibt Anlagen
// nicht heraus (HTTP 501) — deshalb steht die Liste hier und muss bei einem
// neuen Anlagegut von Hand nachgezogen werden.
//
// `inAusgaben` ist der Punkt, an dem es sonst schiefgeht: zurückgerechnet
// werden darf nur, was über eine bezahlte Lieferantenrechnung auch wirklich
// in `ausgaben` steckt. Die beiden aus 2025 tun das nicht.
//
// `betrag` ist die AfA-Basis. Blattwerk ist Kleinunternehmer nach § 19 UStG,
// die Vorsteuer ist nicht abziehbar und gehört nach § 9b Abs. 1 EStG in die
// Anschaffungskosten — also **brutto**. ⚠ Dolibarr führt den Heckkipper
// abweichend mit netto 4.764,71; das ist dort zu korrigieren, nicht hier
// nachzubauen (siehe Fragen an den Steuerberater, 11.09.2026).
//
// `sonderAfaProzent`: Sonderabschreibung § 7g Abs. 5 EStG, 20 % zusätzlich.
// Von Inhaber am 11.09.2026 für alles Bewegliche angesetzt. Beim Fiat ist sie
// in Dolibarr bereits gebucht (740 €, 4852 an 0940); bei den übrigen vier
// steht die Buchung noch aus. Bei den beiden Kaeufen von 2025 ist
// `sonderAfaJahr: 2026` gesetzt: die EUER 2025 ist bereits abgegeben, die
// Sonder-AfA ist aber frei auf Anschaffungsjahr + vier Folgejahre verteilbar.
const GROSSGERAETE = [
  { key: "asset-1", name: "Anhänger Koffer 750kg", betrag: 2588.61, netto: 2588.61,
    gekauft: "2025-11-19", afaJahre: 6.25, sonderAfaProzent: 20, sonderAfaJahr: 2026, inAusgaben: false },
  { key: "asset-2", name: "Häcksler", betrag: 883.33, netto: 883.33,
    gekauft: "2025-06-09", afaJahre: 5.42, sonderAfaProzent: 20, sonderAfaJahr: 2026, inAusgaben: false },
  { key: "asset-3", name: "Heckkipper", betrag: 5670.00, netto: 4764.71,
    gekauft: "2026-02-23", afaJahre: 11, sonderAfaProzent: 20, inAusgaben: true,
    rechnungRef: "SI2602-0030" },
  { key: "asset-4", name: "Stubbenfräse", betrag: 1499.00, netto: 1259.66,
    gekauft: "2026-05-11", afaJahre: 4, sonderAfaProzent: 20, inAusgaben: true,
    rechnungRef: "SI2605-0035" },
  { key: "asset-5", name: "Fiat Ducato", betrag: 3700.00, netto: 3700.00,
    gekauft: "2026-08-11", afaJahre: 2, sonderAfaProzent: 20, inAusgaben: true,
    rechnungRef: "SI2608-0084" },
];
// Pauschale ESt-Rücklage auf den steuerlichen Gewinn (mit Inhaber 20.08.2026).
const STEUER_RUECKLAGE_SATZ = 0.30;
// § 6 Abs. 2 EStG: bis 800 € netto geringwertiges Wirtschaftsgut, sofort
// abziehbar; darüber Anlagevermögen mit AfA. Wird auch von den Beleg-
// Warnungen (belegWarnungen) benutzt.
const GWG_GRENZE = 800;
// Betriebsgewöhnliche Nutzungsdauer nach amtlicher AfA-Tabelle (allgemein
// verwendbare Anlagegüter + Landwirtschaft/Gartenbau). Erste Regel mit
// Treffer gewinnt, deshalb stehen die spezielleren Wörter vorn. Der Wert je
// Gerät ist in der Anlagenübersicht änderbar; hier steht nur der Vorschlag.
const AFA_STANDARD_JAHRE = 7;
const AFA_NUTZUNGSDAUER = [
  { jahre: 11, keywords: ["anhänger", "anhaenger", "tandemanhänger", "tandemanhaenger", "pkw-anhänger", "kipper"] },
  { jahre: 9,  keywords: ["rasentraktor", "aufsitzmäher", "aufsitzmaeher", "rasenmäher", "rasenmaeher", "mähroboter", "maehroboter", "vertikutierer"] },
  { jahre: 8,  keywords: ["häcksler", "haecksler", "schredder", "shredder", "holzspalter", "stubbenfräse", "stubbenfraese", "minibagger", "radlader", "dumper"] },
  { jahre: 6,  keywords: ["transporter", "ducato", "sprinter", "crafter", "pritsche", "pkw", "kastenwagen", "lkw", "fahrzeug"] },
  { jahre: 5,  keywords: ["motorsäge", "motorsaege", "kettensäge", "kettensaege", "freischneider", "motorsense", "heckenschere", "laubbläser", "laubblaeser", "laubsauger", "hochentaster", "bläser", "blaeser", "seilwinde", "akku-set", "hubarbeitsbühne"] },
  { jahre: 3,  keywords: ["computer", "laptop", "notebook", "tablet", "thinkpad", "smartphone", "drucker", "monitor"] },
];
// Erkennt, ob ein Text nach Gerät/Maschine klingt — als Vorauswahl reicht das
// Schlagwort der Nutzungsdauer-Tabelle; alles andere (Pflanzenlieferung über
// 800 €, Substrat, Fremdleistung) bleibt „Kandidat" und muss von Hand als
// Anlagegut markiert werden. Lieber einmal nachfragen als eine Baumschul-
// Lieferung neun Jahre lang abschreiben.
const anlageRegel = (text) => {
  const t = String(text || "").toLowerCase();
  return AFA_NUTZUNGSDAUER.find((r) => r.keywords.some((k) => t.includes(k))) || null;
};
const nutzungsdauerVorschlag = (text) => anlageRegel(text)?.jahre || AFA_STANDARD_JAHRE;
// Datum aus Dolibarr kommt in Listen als Unix-Sekunden, im Detail teils als
// „YYYY-MM-DD" — beides auf ISO-Tag bringen (UTC, damit die Zeitzone den Tag
// nicht verschiebt; Dolibarr stempelt 12:00).
const anlageDatumISO = (v) => {
  if (v == null || v === "") return "";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Date(n * 1000).toISOString().slice(0, 10);
};
// Ohne stripHtml von oben, damit der Abschnitt im Test-Sandbox allein läuft.
const anlageText = (s) => String(s || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
// SKR03: Anlagekonten beginnen mit 0 (0320 Pkw, 0350 Lkw, 0440 Maschinen,
// 0480 GWG …). Dolibarr hängt der Kontonummer den Kontenplan-Präfix 10050 an.
const anlageKonto = (line) => {
  const fk = String(line?.fk_code_ventilation ?? "");
  if (!fk || fk === "0") return "";
  return fk.length > 5 && fk.startsWith("10050") ? fk.slice(5) : fk;
};
const istAnlageKonto = (nr) => /^0[1-4]\d{2}$/.test(String(nr || "")) && String(nr) !== "0480" && String(nr) !== "0485";

// Anlagegut-Kandidaten aus den Lieferantenrechnungen: jede Rechnungszeile
// (oder, wenn Dolibarr keine Zeilen liefert, die ganze Rechnung) über der
// GWG-Grenze. `konfig` (aus Blattwerk/App/anlagen.json, Schlüssel = key)
// überstimmt Erkennung, Nutzungsdauer und Namen je Gerät.
//   key      lr-<rechnungId>-<zeileId>  (stabil über Neuladen hinweg)
//   netto    Prüfgröße für die 800-€-Grenze
//   betrag   AfA-Basis = Brutto: Blattwerk ist Kleinunternehmer (§ 19 UStG),
//            die nicht abziehbare Vorsteuer gehört zu den Anschaffungskosten
//            (§ 9b EStG) — und `ausgaben` rechnet ebenfalls brutto.
//   bezahlt  paye=1 — nur dann steckt der Betrag in `ausgaben` und darf
//            zurückgerechnet werden; die AfA läuft ab Anschaffung unabhängig
//            von der Zahlung.
// Betrieblicher Anteil eines Anlageguts (0..1). Ohne Angabe gilt alles als
// betrieblich. Beim Fahrzeug steckt hier der Privatanteil drin: nur der
// betriebliche Teil der AfA ist Betriebsausgabe, der Rest ist Nutzungsentnahme.
const nutzungsanteilVon = (k = {}, vorgabe) => {
  const roh = k?.nutzungsanteil ?? vorgabe;
  const n = Number(roh);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(1, n > 1 ? n / 100 : n); // 70 und 0,7 meinen dasselbe
};

const anlagegueterErkennen = (lieferantenRechnungen, konfig = {}) => {
  const aus = [];
  for (const r of Array.isArray(lieferantenRechnungen) ? lieferantenRechnungen : []) {
    if (Number(r?.statut) < 1) continue; // Entwürfe zählen nirgends
    const gekauft = anlageDatumISO(r.date ?? r.datef);
    const bezahlt = Number(r.paye) === 1;
    const zeilen = Array.isArray(r.lines) && r.lines.length
      ? r.lines.map((l, i) => ({
          id: l.rowid ?? l.id ?? i,
          text: anlageText(l.desc || l.description || l.product_label || l.label) || anlageText(r.label) || `Rechnung ${r.ref || r.id}`,
          netto: Math.abs(parseFloat(l.total_ht) || 0),
          brutto: Math.abs(parseFloat(l.total_ttc) || parseFloat(l.total_ht) || 0),
          konto: anlageKonto(l),
        }))
      : [{
          id: "ges",
          text: anlageText(r.label) || anlageText(r.ref_supplier) || `Rechnung ${r.ref || r.id}`,
          netto: Math.abs(parseFloat(r.total_ht) || 0),
          brutto: Math.abs(parseFloat(r.total_ttc) || parseFloat(r.total_ht) || 0),
          konto: "",
        }];
    for (const z of zeilen) {
      if (!(z.netto > GWG_GRENZE)) continue;
      const key = `lr-${r.id}-${z.id}`;
      const k = konfig?.[key] || {};
      const regel = anlageRegel(z.text);
      aus.push({
        key, quelle: "rechnung", rechnungId: r.id, ref: r.ref || "",
        name: k.name || z.text,
        netto: z.netto, betrag: z.brutto, gekauft: k.gekauft || gekauft, bezahlt,
        afaJahre: Number(k.afaJahre) > 0 ? Number(k.afaJahre) : (regel?.jahre || AFA_STANDARD_JAHRE),
        nutzungsanteil: nutzungsanteilVon(k),
        sonderAfaProzent: Number(k.sonderAfaProzent) || 0,
        sonderAfaJahr: Number(k.sonderAfaJahr) || 0,
        anlagegut: typeof k.anlagegut === "boolean" ? k.anlagegut : !!(regel || istAnlageKonto(z.konto)),
        automatisch: !!(regel || istAnlageKonto(z.konto)),
      });
    }
  }
  return aus;
};

// Handliste + erkannte Geräte, nur die, die als Anlagegut gelten. Die
// Handliste lässt sich je Eintrag per Konfiguration abschalten — für den
// Fall, dass ein Gerät doch als Lieferantenrechnung in Dolibarr liegt und
// sonst doppelt zählte.
const alleAnlagegueter = ({ lieferantenRechnungen = [], grossgeraete = GROSSGERAETE, konfig = {} } = {}) => {
  const manuell = grossgeraete.map((g, i) => {
    const key = g.key || `manuell-${i}`;
    const k = konfig?.[key] || {};
    return {
      ...g, key, quelle: "manuell", bezahlt: true, netto: g.netto ?? g.betrag,
      afaJahre: Number(k.afaJahre) > 0 ? Number(k.afaJahre) : g.afaJahre,
      nutzungsanteil: nutzungsanteilVon(k, g.nutzungsanteil),
      inAusgaben: !!g.inAusgaben,
      sonderAfaProzent: Number(k.sonderAfaProzent ?? g.sonderAfaProzent) || 0,
      sonderAfaJahr: Number(k.sonderAfaJahr ?? g.sonderAfaJahr) || 0,
      anlagegut: typeof k.anlagegut === "boolean" ? k.anlagegut : true,
    };
  });
  // Was schon in der Handliste steht, darf die Rechnungs-Erkennung nicht ein
  // zweites Mal finden — sonst zaehlt es doppelt (der Fehler vom 11.09.2026).
  const belegt = new Set(manuell.map((g) => g.rechnungRef).filter(Boolean));
  const erkannt = anlagegueterErkennen(lieferantenRechnungen, konfig)
    .filter((a) => !belegt.has(a.ref));
  return [...manuell, ...erkannt].filter((a) => a.anlagegut);
};

// Lineare AfA seit Kauf, monatsgenau; der Kaufmonat zählt als voller Monat
// (§ 7 Abs. 1 S. 4 EStG). Nie über die Anschaffungskosten hinaus.
const afaMonat = (g) => g.betrag / (g.afaJahre * 12);
const afaBisher = (g, heute) => {
  const kauf = new Date(g.gekauft + "T00:00:00");
  const h = new Date(heute + "T00:00:00");
  if (!g.gekauft || Number.isNaN(kauf.getTime()) || h < kauf) return 0;
  const monate = (h.getFullYear() - kauf.getFullYear()) * 12 + (h.getMonth() - kauf.getMonth()) + 1;
  return Math.min(g.betrag, afaMonat(g) * monate);
};
const afaJahr = (g) => g.betrag / g.afaJahre;
// Was davon wirklich den Gewinn mindert — der Privatanteil bleibt draussen.
const afaAnsatz = (g, heute) => afaBisher(g, heute) * nutzungsanteilVon({}, g.nutzungsanteil);
const restwert = (g, heute) => Math.max(0, g.betrag - afaBisher(g, heute));
// AfA, die auf ein Kalenderjahr entfällt: erstes und letztes Jahr anteilig.
const afaImJahr = (g, jahr) => {
  const kauf = new Date(g.gekauft + "T00:00:00");
  if (!g.gekauft || Number.isNaN(kauf.getTime())) return 0;
  const bisVorjahr = jahr - 1 >= kauf.getFullYear() ? afaBisher(g, `${jahr - 1}-12-31`) : 0;
  const bisJahresende = jahr >= kauf.getFullYear() ? afaBisher(g, `${jahr}-12-31`) : 0;
  return Math.max(0, bisJahresende - bisVorjahr);
};

// Drei AfA-Zahlen, die gern verwechselt werden (Inhaber am 11.09.2026: „aber die
// afa von den 3 ist ja hoeher als 500"). Er hatte recht — die App zeigte nur
// die kleinste:
//   bisHeute — aufgelaufen seit dem jeweiligen Kaufmonat. Passt zum Gewinn
//              „bis heute", weil dort auch die Einnahmen nur bis heute zaehlen.
//   imJahr   — was auf das laufende Kalenderjahr entfaellt. DAS ist die Zahl
//              fuer die EUER dieses Jahres.
//   proJahr  — voller Jahressatz, sobald jedes Geraet ein ganzes Jahr laeuft.
// Der Nutzungsanteil (Privatanteil) ist ueberall schon herausgerechnet.
// Sonderabschreibung § 7g Abs. 5 EStG: bis zu 20 % der Anschaffungskosten
// ZUSAETZLICH zur linearen AfA, frei verteilbar auf das Anschaffungsjahr und
// die vier Folgejahre. Bedingungen: Gewinn im Vorjahr <= 200.000 € und
// **fast ausschliessliche betriebliche Nutzung (>= 90 %)** — an Letzterem
// scheitert es bei Fahrzeugen am ehesten, deshalb prueft die Funktion das
// selbst, statt sich auf eine richtig gesetzte Konfiguration zu verlassen.
const SONDER_AFA_MAX = 0.20;
const SONDER_AFA_MIN_ANTEIL = 0.90;
const sonderAfaBetrag = (g) => {
  const pz = Number(g?.sonderAfaProzent) || 0;
  if (pz <= 0) return 0;
  if (nutzungsanteilVon({}, g?.nutzungsanteil) < SONDER_AFA_MIN_ANTEIL) return 0;
  return Number(g?.betrag || 0) * Math.min(pz / 100, SONDER_AFA_MAX);
};
// In welchem Jahr sie gezogen wird — ohne Angabe im Anschaffungsjahr.
const sonderAfaJahrVon = (g) => Number(g?.sonderAfaJahr) || Number(String(g?.gekauft || "").slice(0, 4)) || 0;

const afaUebersicht = (anlagegueter = [], heute = todayISO()) => {
  const jahr = Number(String(heute).slice(0, 4));
  const anteil = (g) => nutzungsanteilVon({}, g.nutzungsanteil);
  const summe = (f) => anlagegueter.reduce((s, g) => s + f(g) * anteil(g), 0);
  // Die Sonder-AfA ist keine monatliche Rate, sondern eine Jahresbuchung
  // (beim Fiat zum 31.12.2026). Sie zaehlt deshalb voll in ihr Kalenderjahr —
  // im Aufgelaufenen aber erst, wenn dieses Jahr vorbei ist.
  const sonderIn = (j) => anlagegueter.reduce((s, g) => s + (sonderAfaJahrVon(g) === j ? sonderAfaBetrag(g) : 0), 0);
  const sonderBisHeute = anlagegueter.reduce(
    (s, g) => s + (sonderAfaJahrVon(g) < jahr ? sonderAfaBetrag(g) : 0), 0);
  return {
    bisHeute: summe((g) => afaBisher(g, heute)) + sonderBisHeute,
    imJahr: summe((g) => afaImJahr(g, jahr)) + sonderIn(jahr),
    proJahr: summe((g) => afaJahr(g)),   // laufender Satz, ohne die einmalige Sonder-AfA
    sonderAfa: sonderIn(jahr),
  };
};

// ─── Kostenvorschau ─────────────────────────────────────────────────────────
// „Was bis Jahresende noch kommt" (Inhaber, 11.09.2026). Bewusst GETRENNT vom
// Gewinn: der Gewinn bleibt eine Tatsache aus gebuchten Belegen und laesst
// sich gegen Dolibarr abgleichen. Liefen Schaetzungen hinein, ginge das nicht
// mehr — deshalb steht die Vorschau daneben, nicht darin.
//
// Die Fixkosten stehen nicht im Code, sondern in Blattwerk/App/fixkosten.json
// und sind in der App pflegbar. Feste Betraege im Code waeren beim naechsten
// Preisanstieg still falsch.
const RHYTHMEN = [
  { id: "monat", name: "monatlich", proJahr: 12 },
  { id: "quartal", name: "vierteljährlich", proJahr: 4 },
  { id: "halbjahr", name: "halbjährlich", proJahr: 2 },
  { id: "jahr", name: "jährlich", proJahr: 1 },
];

// Auf den Monat heruntergerechnet. Unbekannter Rhythmus gilt als monatlich —
// lieber zu viel erwarten als eine Ausgabe uebersehen.
const monatsBetrag = (k) => {
  const b = parseFloat(k?.betrag);
  if (!Number.isFinite(b)) return 0;
  const r = RHYTHMEN.find((x) => x.id === k?.rhythmus) || RHYTHMEN[0];
  return b * r.proJahr / 12;
};

// Volle Monate NACH dem laufenden bis Jahresende. Der laufende zaehlt nicht
// mit: seine Rechnung ist entweder schon gebucht oder kommt gleich, und beides
// gehoert nicht in eine Vorschau.
const restMonate = (heute = todayISO()) => {
  const m = Number(String(heute).slice(5, 7));
  return Math.max(0, 12 - m);
};

// Wie oft faellt ein Posten zwischen morgen und Jahresende noch an?
//
// Ohne Faelligkeitsdatum bleibt es bei der Gleichverteilung (Monatsbetrag mal
// Restmonate). Mit Datum wird abgezaehlt — und das ist der ehrlichere Weg:
// die Fiat-Versicherung sah am 12.09.2026 nach 574,95 €/Jahr aus, war aber der
// Rumpfbeitrag bis 31.12. Der echte Jahresbeitrag (1.533,21 €) wird erst zum
// 01.01.2027 faellig, fuer 2026 kommt also nichts mehr. Die Gleichverteilung
// hatte 143,73 € zu viel vorhergesagt.
const faelligkeitenBisJahresende = (k, heute) => {
  const r = RHYTHMEN.find((x) => x.id === k?.rhythmus) || RHYTHMEN[0];
  const schritt = 12 / r.proJahr;                       // Monate zwischen zwei Faelligkeiten
  const h = new Date(heute + "T00:00:00");
  const ende = new Date(`${h.getFullYear()}-12-31T00:00:00`);
  const d = new Date(String(k.faellig) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;           // kein Datum -> Gleichverteilung
  // Vergangene Faelligkeiten vorrollen, bis eine in der Zukunft liegt.
  while (d <= h) d.setMonth(d.getMonth() + schritt);
  let n = 0;
  while (d <= ende) { n++; d.setMonth(d.getMonth() + schritt); }
  return n;
};

const prognose = ({ anlagegueter = [], fixkosten = [], heute = todayISO(), gewinn = null } = {}) => {
  const afa = afaUebersicht(anlagegueter, heute);
  // Was von der Jahres-AfA noch aussteht. Die Sonder-AfA steckt in `imJahr`,
  // aber nicht in `bisHeute` — sie wird zum 31.12. gebucht und ist deshalb
  // genau das, was hier noch kommt.
  const restAfa = Math.max(0, afa.imJahr - afa.bisHeute);
  const monate = restMonate(heute);
  const restFixkosten = fixkosten
    .filter((k) => k && !k.aus)
    .reduce((s, k) => {
      const n = faelligkeitenBisJahresende(k, heute);
      return s + (n === null ? monatsBetrag(k) * monate : (parseFloat(k.betrag) || 0) * n);
    }, 0);
  const gesamt = restAfa + restFixkosten;
  return {
    restAfa, restFixkosten, gesamt, monate,
    erwarteterGewinn: gewinn == null ? null : gewinn - gesamt,
  };
};
// ─── Ende Kostenvorschau ────────────────────────────────────────────────────

// Die eine Rechenstelle für die Kontostände-Kachel (Formeln mit Inhaber am
// 20.08.2026 festgelegt, Anlagegüter seit 09.09.2026 nach EÜR-Recht). Zwei
// ungleiche Datenlagen stecken bewusst hier drin: Kundenrechnungen liefern
// totalpaid/remaintopay über die Liste, Lieferantenrechnungen NICHT
// (20.08.2026 an der Instanz geprüft) — dort gilt paye=1 als voll bezahlt;
// eine Teilzahlung auf eine Lieferantenrechnung sieht diese Rechnung also
// erst, wenn sie abgeschlossen ist. Alle Zahlen sind seit Gründung
// kumuliert, nicht je Wirtschaftsjahr — die Liste kennt kein Zahldatum.
const finanzUebersicht = ({ konten, rechnungen, lieferantenRechnungen, heute, grossgeraete = GROSSGERAETE, anlagenKonfig = {}, steuerSatz = STEUER_RUECKLAGE_SATZ }) => {
  const saldo = (a) => parseFloat(a?.balance) || 0;
  // Interne Sicht: die „VR"-Konten zählen hier bewusst nicht mit (nur steuerlich).
  const offen = (k) => Number(k?.clos || 0) === 0 && !kontoNurSteuer(k);
  const standInhaber = konten.filter((k) => offen(k) && kontoRolle(k) === "inhaber").reduce((s, k) => s + saldo(k), 0);
  const standPartner = konten.filter((k) => offen(k) && kontoRolle(k) === "partner").reduce((s, k) => s + saldo(k), 0);
  const firmenKonten = konten.filter((k) => offen(k) && kontoRolle(k) === "firma").reduce((s, k) => s + saldo(k), 0);
  // Tatsaechlich eingelegtes Geld — hier zaehlen die VR-Konten mit, sonst
  // sieht Inhaber nur einen Bruchteil seiner Einlage (11.09.2026). Die interne
  // Verrechnung oben bleibt davon unberuehrt (Vorgabe 20.08.2026).
  const einlage = (rolle) => konten
    .filter((k) => Number(k?.clos || 0) === 0 && kontoRolle(k) === rolle)
    .reduce((s, k) => s + Math.max(0, -saldo(k)), 0);
  const einlageInhaber = einlage("inhaber");
  const einlagePartner = einlage("partner");
  // Kundenseite: Entwürfe (0) und Storni (3) zählen nirgends mit; gezahlt
  // zählt, was wirklich geflossen ist (auch der gezahlte Teil offener Rechnungen).
  const echteKR = rechnungen.filter((r) => Number(r.statut) !== 0 && Number(r.statut) !== 3);
  const einnahmen = echteKR.reduce((s, r) => s + (parseFloat(r.totalpaid) || 0), 0);
  const offeneKunden = echteKR.filter((r) => Number(r.statut) === 1).reduce((s, r) => s + restBetrag(r), 0);
  // Lieferantenseite: siehe Kommentar über der Funktion.
  const echteLR = lieferantenRechnungen.filter((r) => Number(r.statut) >= 1);
  const ausgaben = echteLR.filter((r) => Number(r.paye) === 1).reduce((s, r) => s + (parseFloat(r.total_ttc) || 0), 0);
  const offeneLieferanten = echteLR.filter((r) => Number(r.paye) !== 1).reduce((s, r) => s + (parseFloat(r.total_ttc) || 0), 0);
  const geldfluss = einnahmen - ausgaben;
  // Anlagegüter: was voll in `ausgaben` steckt, zurückrechnen (nur bezahlte —
  // unbezahlte sind dort gar nicht drin), dafür die AfA bis heute ansetzen.
  const anlagegueter = alleAnlagegueter({ lieferantenRechnungen, grossgeraete, konfig: anlagenKonfig });
  // Zurueckgerechnet wird nur, was ueber eine Lieferantenrechnung auch
  // wirklich in `ausgaben` gelandet ist. Handlisten-Eintraege gibt es genau
  // deshalb, weil dazu keine Rechnung existiert (privat gezahlt) — sie
  // zurueckzurechnen wuerde Gewinn erfinden (11.09.2026).
  const anlagenAbzug = anlagegueter
    .filter((g) => g.bezahlt && (g.quelle === "rechnung" || g.inAusgaben))
    .reduce((s, g) => s + g.betrag, 0);
  const afa = afaUebersicht(anlagegueter, heute);
  const afaVoll = anlagegueter.reduce((s, g) => s + afaBisher(g, heute), 0);
  const afaSumme = afa.bisHeute;
  const privatanteilAfa = Math.max(0, afaVoll - anlagegueter.reduce((s, g) => s + afaAnsatz(g, heute), 0));
  const gewinn = geldfluss + anlagenAbzug - afaSumme;
  // Steuerbasis = der EÜR-Gewinn (gleiche Zahl, eigener Name bleibt für die Anzeige).
  const steuerBasis = gewinn;
  const steuerRuecklage = Math.max(0, steuerBasis) * steuerSatz;
  // Was die Firma den Gesellschaftern schuldet (negativer Saldo = Schuld).
  const schuldenGesellschafter = Math.max(0, -standInhaber) + Math.max(0, -standPartner);
  const bereinigt = firmenKonten - offeneLieferanten - schuldenGesellschafter - steuerRuecklage;
  return {
    standInhaber, standPartner, firmenKonten,
    einnahmen, ausgaben, geldfluss, gewinn,
    anlagegueter, anlagenAbzug, afaSumme, afaVoll, privatanteilAfa,
    afa,
    einlageInhaber, einlagePartner,
    offeneKunden, offeneLieferanten,
    steuerBasis, steuerRuecklage, schuldenGesellschafter, bereinigt,
  };
};
// ─── Ende Zahlungserfassung & Finanzübersicht ───────────────────────────────

// ─── Storno Kundenrechnungen ─────────────────────────────────────────────────
// Dolibarr 23.0.4 kennt per REST kein „stornieren" (Swagger am 09.09.2026
// geprueft). Je Status greift deshalb ein anderer Weg — die Auswahl steht in
// stornoWege(), der Ablauf in stornoAusfuehren(), beide reine Funktionen
// ueber das api-Objekt und in test/rechnung/storno.test.js mit Mock
// durchgespielt. Ohne stripHtml/doliError von oben, damit der Abschnitt im
// Test-Sandbox allein laeuft.
//   loeschen    Entwurf (0): DELETE — noch keine Aufzeichnung.
//   gutschrift  Stornorechnung type 2 mit fk_facture_source und denselben
//               Positionen zum negativen Stueckpreis (so macht es Dolibarr
//               selbst bei „Gutschrift aus Rechnung"), validieren,
//               markAsCreditAvailable; bei OFFENER Rechnung zusaetzlich
//               usecreditnote + settopaid, damit sie als beglichen gilt; bei
//               BEZAHLTER Rechnung bleibt das Guthaben beim Kunden.
//   verlassen   settopaid mit close_code → Status 3 „verlassen". Kein Beleg,
//               nur eine Klassifizierung — fuer Faelle, in denen keine
//               Gutschrift noetig ist (z. B. ersetzt, bevor sie rausging).
const STORNO_GRUENDE = [
  { code: "replaced",     label: "Ersetzt durch eine neue Rechnung" },
  { code: "abandon",      label: "Aufgegeben (wird nicht mehr verfolgt)" },
  { code: "badcustomer",  label: "Uneinbringlich (Kunde zahlt nicht)" },
  { code: "discount_vat", label: "Nachlass / Skonto" },
  { code: "bankcharge",   label: "Bankgebühr" },
  { code: "other",        label: "Sonstiges" },
];
const stornoWege = (inv) => {
  const st = Number(inv?.statut);
  if (Number(inv?.type ?? 0) === 2) return [];
  if (st === 0) return ["loeschen"];
  if (st === 1) return ["gutschrift", "verlassen"];
  if (st === 2) return ["gutschrift"];
  return [];
};
const stornoFehlerText = (e) => {
  const msg = String(e?.message || e || "");
  const m = msg.match(/"message"\s*:\s*"([^"]*)"/);
  const doli = m && m[1].trim() ? m[1].trim().slice(0, 200) : "";
  const st = msg.match(/^API Error (\d+)/);
  if (st?.[1] === "403") return "Keine Berechtigung in Dolibarr (403)" + (doli ? ": " + doli : "");
  if (st?.[1] === "404") return "In Dolibarr nicht gefunden (404)" + (doli ? ": " + doli : "");
  if (doli) return doli;
  if (st) return `Dolibarr hat mit Status ${st[1]} abgebrochen, ohne etwas zurückzumelden.`;
  return msg || "Unbekannter Fehler";
};
const stornoText = (v) => String(v || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
const gutschriftZeile = (l) => {
  const artikel = l.fk_product ? parseInt(l.fk_product) : null;
  const text = stornoText(l.desc || l.description || l.label || l.product_label);
  return {
    desc: text || (artikel ? "" : "Position"),
    qty: parseFloat(l.qty || 1),
    subprice: -Math.abs(parseFloat(l.subprice ?? l.pu_ht ?? 0)),
    tva_tx: parseFloat(l.tva_tx ?? l.vat_rate ?? 0),
    remise_percent: parseFloat(l.remise_percent || 0),
    product_type: Number(l.product_type ?? 0),
    ...(artikel ? { fk_product: artikel } : {}),
  };
};
const gutschriftBody = (inv, { heute, grund, notiz }) => {
  const [j, m, t] = String(heute).split("-").map(Number);
  const zeilen = (Array.isArray(inv.lines) ? inv.lines : []).filter((l) => parseFloat(l.qty || 0) !== 0);
  const grundText = STORNO_GRUENDE.find((g) => g.code === grund)?.label || grund || "";
  const lines = zeilen.length ? zeilen.map(gutschriftZeile) : [{
    desc: `Storno Rechnung ${inv.ref || inv.id}`, qty: 1,
    subprice: -Math.abs(parseFloat(inv.total_ht) || 0),
    tva_tx: (parseFloat(inv.total_ht) || 0) > 0 ? Math.round(((parseFloat(inv.total_tva) || 0) / parseFloat(inv.total_ht)) * 1000) / 10 : 0,
    remise_percent: 0, product_type: 1,
  }];
  return {
    socid: parseInt(inv.socid || inv.fk_soc),
    type: 2,
    fk_facture_source: parseInt(inv.id),
    date: Math.floor(Date.UTC(j, m - 1, t, 12) / 1000),
    ...(inv.fk_project || inv.fk_projet ? { fk_project: parseInt(inv.fk_project || inv.fk_projet) } : {}),
    ...(inv.cond_reglement_id ? { cond_reglement_id: parseInt(inv.cond_reglement_id) } : {}),
    ...(inv.mode_reglement_id ? { mode_reglement_id: parseInt(inv.mode_reglement_id) } : {}),
    note_public: `Stornorechnung zu ${inv.ref || inv.id}`,
    note_private: `Storno zu ${inv.ref || inv.id} (${grundText})${notiz ? ": " + notiz : ""}`,
    lines,
  };
};
// Fuehrt den gewaehlten Weg aus. Bei der Gutschrift bricht ein Fehler
// zwischendrin NICHT alles ab, sondern liefert, was schon da ist — die
// Gutschrift existiert dann in Dolibarr (meist als Entwurf) und der Rest wird
// benannt, statt still einen zweiten Beleg zu erzeugen.
async function stornoAusfuehren(api, inv, { wahl, grund, notiz, heute }) {
  if (wahl === "loeschen") { await api.deleteInvoice(inv.id); return { art: "geloescht" }; }
  if (wahl === "verlassen") {
    await api.setInvoiceAbandoned(inv.id, { close_code: grund || "other", close_note: notiz || "" });
    return { art: "verlassen" };
  }
  if (wahl !== "gutschrift") throw new Error("Unbekannter Storno-Weg: " + wahl);
  const angelegt = await api.createInvoice(gutschriftBody(inv, { heute, grund, notiz }));
  const gutschriftId = typeof angelegt === "object" && angelegt ? (angelegt.id ?? angelegt.rowid) : angelegt;
  const e = { art: "gutschrift", gutschriftId, fertig: false };
  try { await api.validateInvoice(gutschriftId); }
  catch (err) { e.fehler = `Gutschrift angelegt, liegt aber als Entwurf in Dolibarr — Validieren scheiterte: ${stornoFehlerText(err)}`; return e; }
  try { await api.markInvoiceCreditAvailable(gutschriftId); }
  catch (err) { e.fehler = `Gutschrift validiert, aber nicht als Guthaben gebucht: ${stornoFehlerText(err)}`; return e; }
  if (Number(inv.statut) === 2) { e.fertig = true; e.guthaben = true; return e; }
  try {
    const disc = await api.getInvoiceDiscount(gutschriftId);
    const discountId = disc?.id ?? disc?.rowid;
    if (!discountId) throw new Error("Kein Guthaben-Eintrag zur Gutschrift gefunden");
    await api.useCreditNote(inv.id, String(discountId));
  } catch (err) { e.fehler = `Gutschrift steht als Guthaben bereit, konnte aber nicht mit der Rechnung verrechnet werden: ${stornoFehlerText(err)}`; return e; }
  try { await api.setInvoicePaid(inv.id); }
  catch (err) { e.fehler = `Verrechnet, aber die Rechnung ließ sich nicht als beglichen markieren: ${stornoFehlerText(err)}`; return e; }
  e.fertig = true;
  return e;
}
// Status-Badge fuer Liste und Detail: Gutschriften und verlassene Rechnungen
// sollen als solche zu erkennen sein, eine Rechnung mit Gutschrift als storniert.
const rechnungStatusBadge = (inv, hatGutschrift, statusMap) => {
  if (Number(inv?.type ?? 0) === 2) return ["Gutschrift", "badge-cancelled"];
  if (Number(inv?.statut) === 3) {
    const g = STORNO_GRUENDE.find((x) => x.code === inv.close_code);
    return [g ? `Verlassen · ${g.label}` : "Verlassen", "badge-cancelled"];
  }
  if (hatGutschrift) return ["Storniert (Gutschrift)", "badge-cancelled"];
  return statusMap[inv?.statut] || ["–", "badge-draft"];
};
const hatGutschriftIn = (inv, alle) => (Array.isArray(alle) ? alle : [])
  .some((g) => Number(g?.type ?? 0) === 2 && String(g.fk_facture_source || "") === String(inv?.id));
// ─── Ende Storno Kundenrechnungen ────────────────────────────────────────────

const PROJECT_FILTERS = [
  { key: "open",   label: "Offen",         match: (s) => s !== 2 },
  { key: "all",    label: "Alle",          match: () => true },
  { key: "draft",  label: "Entwurf",       match: (s) => s === 0 },
  { key: "closed", label: "Abgeschlossen", match: (s) => s === 2 },
];
const ORDER_FILTERS = [
  { key: "open",     label: "Offen",    match: (s) => s >= 0 && s <= 3 },
  { key: "received", label: "Erhalten", match: (s) => s === 4 || s === 5 },
  { key: "all",      label: "Alle",     match: () => true },
  { key: "cancelled",label: "Storniert",match: (s) => s < 0 || s === 6 },
];

// ─── Status Filter chips ─────────────────────────────────────────────────────
function StatusFilter({ options, value, onChange }) {
  const current = options.find(o => o.key === value) || options[0];
  return (
    <div className="status-filter-menu">
      <label>Status</label>
      <select value={current.key} onChange={(e) => onChange(e.target.value)}>
        {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </div>
  );
}

function SearchSelect({ label, value, onChange, options, getLabel, getSub, placeholder = "Tippen zum Suchen…", optional = false }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = options.find(o => String(o.id || o.rowid) === String(value));
  useEffect(() => { if (selected) setQuery(getLabel(selected)); else if (!value) setQuery(""); }, [value, options]);
  const q = query.trim().toLowerCase();
  const matches = (q ? options.filter(o => getLabel(o).toLowerCase().includes(q) || String(getSub?.(o) || "").toLowerCase().includes(q)) : options).slice(0, 10);
  const pick = (o) => { onChange(String(o.id || o.rowid)); setQuery(getLabel(o)); setOpen(false); };
  const clear = () => { onChange(""); setQuery(""); setOpen(false); };
  return (
    <div className="field-group mb12" style={{position:"relative"}}>
      <label>{label}</label>
      <input
        type="search"
        autoComplete="off"
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(""); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder={placeholder}
      />
      {(optional && value) && <button type="button" className="btn btn-secondary btn-sm" style={{marginTop:8}} onClick={clear}>Auswahl entfernen</button>}
      {open && matches.length > 0 && (
        <div className="suggestion-menu">
          {matches.map(o => (
            <div key={o.id || o.rowid} className="suggestion-item" onMouseDown={e => { e.preventDefault(); pick(o); }}>
              <div style={{fontWeight:700}}>{getLabel(o)}</div>
              {getSub && getSub(o) && <div style={{fontSize:12,color:"var(--text2)",marginTop:2}}>{getSub(o)}</div>}
            </div>
          ))}
        </div>
      )}
      {open && query.trim() && matches.length === 0 && <div className="suggestion-menu"><div className="suggestion-item" style={{color:"var(--text2)"}}>Keine Treffer</div></div>}
    </div>
  );
}

// ─── Icons ─────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 22 }) => {
  const icons = {
    home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
    chat: "M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z",
    menu: "M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z",
    phone: "M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z",
    customers: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
    invoice: "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
    proposal: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z",
    time: "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z",
    suppliers: "M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z",
    plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
    // Eigene Symbole je Kachel (DESIGN.md §7): nie zweimal dasselbe auf einem Schirm.
    angebotNeu: "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 14h-3v3h-2v-3H8v-2h3v-3h2v3h3v2zm-3-7V3.5L18.5 9H13z",
    cart: "M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1.003 1.003 0 0020 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z",
    werkzeug: "M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z",
    bon: "M18 17H6v-2h12v2zm0-4H6v-2h12v2zm0-4H6V7h12v2zM3 22l1.5-1.5L6 22l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22V2l-1.5 1.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2 4.5 3.5 3 2v20z",
    back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
    check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
    trash: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
    edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
    copy: "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z",
    logout: "M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z",
    clock: "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z",
    warning: "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z",
    shield: "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z",
    mail: "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z",
    upload: "M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z",
    folder: "M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z",
    project: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z",
    task: "M14 6l-1-2H5v17h2v-7h5l1 2h7V6h-6zm4 8h-4l-1-2H7V6h5l1 2h5v6z",
    image: "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z",
    settings: "M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.37-.31-.6-.22l-2.49 1a7.28 7.28 0 0 0-1.69-.98L14.5 2.42A.51.51 0 0 0 14 2h-4a.51.51 0 0 0-.5.42L9.12 5.07c-.61.24-1.18.56-1.69.98l-2.49-1c-.23-.08-.48 0-.6.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.37.31.6.22l2.49-1c.51.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.38-2.65c.61-.24 1.18-.56 1.69-.98l2.49 1c.23.08.48 0 .6-.22l2-3.46c.13-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z",
    validate: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
    download: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
    // Strichcode — für die Etiketten der Betriebsmittel.
    barcode: "M2 6h2v12H2V6zm3 0h1v12H5V6zm2 0h2v12H7V6zm3 0h1v12h-1V6zm2 0h2v12h-2V6zm3 0h1v12h-1V6zm2 0h1v12h-1V6zm2 0h2v12h-2V6z",
    car: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
    user: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
    archive: "M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.72V20c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8.72c.57-.38 1-.99 1-1.71V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-8H4V4l16-.01V6z",
    receive: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
    transfer: "M7.5 3.5l-4 4 4 4V9H13V7H7.5V3.5zm9 7l-4 4V12H6v2h6.5v3.5l4-4z",
    minus: "M19 13H5v-2h14v2z",
    search: "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
    eye: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z",
    calendar: "M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d={icons[name] || icons.warning} />
    </svg>
  );
};

// ─── CSS ───────────────────────────────────────────────────────────────────
const css = `
  /* Schriften werden nicht-blockierend in index.html geladen (Performance). */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  /* Farben: ausschliesslich hier, je Darstellung ein Block — Regeln in DESIGN.md. */
  :root, .theme-light {
    --bg: #eef0ea; --surface: #ffffff; --surface2: #e3e7de; --field: #f6f8f3; --border: #c3cabd;
    --text: #14211a; --text2: #3f4d44; --text3: #5d6a61;
    --accent: #276b2c; --primary: #123527; --on-primary: #ffffff; --accent-soft: #dbe8d3; --on-accent-soft: #123527;
    --accent2: #2e6b34; --on-accent2: #ffffff;
    --danger: #a3231a; --danger-bg: #a3231a; --on-danger: #ffffff; --danger-soft: #f3d9d6;
    --warn: #6e4700; --warn-soft: #f2e6c8; --warn-border: #dcc78f; --info: #36507a; --info-soft: #dae2f0;
    --topbar: #123527; --on-topbar: #ffffff; --online: #8acf4e; --on-online: #123527;
    --overlay: rgba(20,33,26,0.45); --shadow: 0 6px 18px rgba(20,33,26,0.12);
    --k-moos: #2e6b34; --k-moos-bg: #ddebd9; --k-petrol: #1f5f66; --k-petrol-bg: #d6e8ea; --k-schiefer: #36507a; --k-schiefer-bg: #dae2f0; --k-erde: #6a4b2e; --k-erde-bg: #eadfd2;
    --k-ocker: #8a5a00; --k-ocker-bg: #f2e6c8; --k-pflaume: #6b3a6e; --k-pflaume-bg: #ebddec; --k-rost: #9a4a1c; --k-rost-bg: #f3dfd2; --k-ziegel: #9c2f2a; --k-ziegel-bg: #f3d9d6;
    --radius: 16px; --radius-sm: 10px;
  }
  .theme-beige {
    --bg: #efe7da; --surface: #fbf7f0; --surface2: #e4d9c6; --field: #fffdf8; --border: #cbbba0;
    --text: #2a2118; --text2: #57493a; --text3: #6b5b47;
    --accent-soft: #dbe3cc; --warn-border: #d6bf85;
    --overlay: rgba(42,33,24,0.45); --shadow: 0 6px 18px rgba(42,33,24,0.14);
  }
  .theme-dark, .theme-anthrazit {
    --accent2: #8fcb83; --danger-bg: #a8402f; --on-danger: #ffffff; --danger-soft: #3e1f1d;
    --warn: #e2b657; --warn-soft: #3a2f12; --warn-border: #5a4a1e; --info: #9db6e0; --info-soft: #1e2a40;
    --overlay: rgba(0,0,0,0.7); --shadow: 0 6px 18px rgba(0,0,0,0.4);
    --k-moos: #8fcb83; --k-moos-bg: #203a22; --k-petrol: #7cc3c9; --k-petrol-bg: #173538; --k-schiefer: #9db6e0; --k-schiefer-bg: #1e2a40; --k-erde: #cdb091; --k-erde-bg: #33281c;
    --k-ocker: #e2b657; --k-ocker-bg: #3a2f12; --k-pflaume: #cfa0d3; --k-pflaume-bg: #33213a; --k-rost: #e89b6c; --k-rost-bg: #3d2618; --k-ziegel: #ee938c; --k-ziegel-bg: #3e1f1d;
  }
  .theme-dark {
    --bg: #0b1d15; --surface: #12291e; --surface2: #1a3627; --field: #0f241a; --border: #2f4b3b;
    --text: #f2f5ee; --text2: #b3c2b6; --text3: #8a9c8e;
    --accent: #8acf4e; --primary: #8acf4e; --on-primary: #0b1d15; --accent-soft: #1f4a2f; --on-accent-soft: #c9eeaa;
    --on-accent2: #0b1d15; --danger: #ee938c;
    --topbar: #123527; --on-topbar: #ffffff; --online: #8acf4e; --on-online: #0b1d15;
  }
  .theme-anthrazit {
    --bg: #151715; --surface: #1e211e; --surface2: #282c28; --field: #191c19; --border: #3a3f3a;
    --text: #eceeea; --text2: #a7ada6; --text3: #8b918a;
    --accent: #5cb860; --primary: #2e7d32; --on-primary: #ffffff; --accent-soft: #23402a; --on-accent-soft: #b5e0b8;
    --on-accent2: #151715; --danger: #f08a80;
    --topbar: #1e211e; --on-topbar: #eceeea; --online: #23402a; --on-online: #b5e0b8;
  }
  body:has(.theme-beige) { background: #efe7da; }
  body:has(.theme-dark) { background: #0b1d15; }
  body:has(.theme-anthrazit) { background: #151715; }
  .theme-light, .theme-light *, .theme-beige, .theme-beige * { color-scheme: light; }
  .theme-dark, .theme-dark *, .theme-anthrazit, .theme-anthrazit * { color-scheme: dark; }
  .app a:not(.btn) { color: var(--accent); }
  .action-row-2 > :last-child:nth-child(odd) { grid-column: 1 / -1; }
  body { font-family: 'Barlow', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; overscroll-behavior: none; }
  .app { max-width: 480px; margin: 0 auto; min-height: 100vh; display: flex; flex-direction: column; background: var(--bg); color: var(--text); }
  .app-topbar { position: sticky; top: 0; z-index: 90; display: flex; align-items: center; gap: 10px; padding: 9px 16px; background: var(--topbar); color: var(--on-topbar); border-bottom: 1px solid var(--border); }
  .app-topbar img { width: 30px; height: 30px; object-fit: contain; }
  .app-topbar .brand { font-weight: 700; font-size: 16px; letter-spacing: -0.3px; color: var(--on-topbar); }

  /* Login */
  .login-wrap { display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 100vh; padding: 24px; gap: 28px; }
  .login-logo { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .login-logo-mark { width: 72px; height: 72px; background: var(--topbar); border-radius: 20px; display: flex; align-items: center; justify-content: center; font-size: 36px; }
  .login-logo h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
  .login-logo p { color: var(--text2); font-size: 14px; }
  .login-card { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; display: flex; flex-direction: column; gap: 14px; }
  .pwa-hint { background: var(--accent-soft); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px; font-size: 13px; color: var(--text2); line-height: 1.6; }
  .pwa-hint strong { color: var(--on-accent-soft); display: block; margin-bottom: 4px; }

  /* Fields */
  .field-group { display: flex; flex-direction: column; gap: 6px; }
  .field-group label { font-size: 12px; font-weight: 700; color: var(--text2); text-transform: uppercase; letter-spacing: 0.5px; }
  .field-group input, .field-group select, .field-group textarea {
    background: var(--field); border: 1.5px solid var(--border); border-radius: var(--radius-sm);
    color: var(--text); font-family: 'Barlow', sans-serif; font-size: 16px; padding: 14px 16px;
    outline: none; transition: border-color .2s; width: 100%;
  }
  .field-group input:focus, .field-group select:focus, .field-group textarea:focus { border-color: var(--accent); }
  .field-group textarea { resize: vertical; min-height: 80px; }
  .field-group select { appearance: none; }
  .mb12 { margin-bottom: 12px; } .mb16 { margin-bottom: 16px; } .mb20 { margin-bottom: 20px; }

  /* Buttons */
  .btn { border: none; border-radius: var(--radius-sm); cursor: pointer; font-family: 'Barlow', sans-serif; font-weight: 600; font-size: 15px; padding: 14px 18px; transition: background-color .15s, transform .15s; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .btn:active { transform: scale(.97); }
  .btn-primary { background: var(--primary); color: var(--on-primary); }
  .btn-secondary { background: var(--surface2); color: var(--text); border: 1.5px solid var(--border); }
  .btn-danger { background: var(--danger-bg); color: var(--on-danger); }
  .btn-success { background: var(--accent2); color: var(--on-accent2); }
  .btn-warn { background: var(--warn-soft); color: var(--warn); border: 1.5px solid var(--warn-border); }
  .btn-ghost { background: transparent; color: var(--text2); border: 1.5px solid var(--border); }
  .tutorial-card .btn-ghost { border-color: transparent; }
  .btn:not(.btn-sm):not(.btn-xs) { min-height: 48px; }
  .btn-sm { padding: 9px 14px; font-size: 13px; border-radius: 8px; }
  .btn-xs { padding: 6px 10px; font-size: 12px; border-radius: 7px; }
  .btn:disabled { opacity: 0.5; pointer-events: none; }

  /* Nav */
  .bottom-nav { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 480px; background: var(--surface); border-top: 1px solid var(--border); display: flex; z-index: 100; padding-bottom: env(safe-area-inset-bottom); }
  .nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 10px 0; cursor: pointer; color: var(--text3); transition: color .15s; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
  .nav-item.active { color: var(--accent); }
  .nav-item { position: relative; }
  .nav-marke { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--danger-bg); color: var(--on-danger); font-size: 11px; font-weight: 700; line-height: 18px; text-align: center; margin-left: auto; }
  .nav-marke-ecke { position: absolute; top: 4px; left: calc(50% + 6px); margin: 0; }
  .nav-menue-schleier { position: fixed; inset: 0; z-index: 110; }
  .nav-menue { position: fixed; bottom: calc(62px + env(safe-area-inset-bottom)); right: 10px; z-index: 120;
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px; min-width: 230px;
    padding: 8px; box-shadow: var(--shadow); }
  .nav-menue-item { display: flex; align-items: center; gap: 12px; padding: 15px 16px; border-radius: 10px;
    cursor: pointer; color: var(--text); font-size: 16px; font-weight: 600; }
  .nav-menue-item:active { background: var(--surface2); }
  .nav-menue-item.active { color: var(--accent); }

  /* Main */
  .main { flex: 1; padding: 16px; padding-bottom: 90px; overflow-y: auto; }
  .page-header { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; padding-top: 8px; }
  .page-header h2 { font-size: 22px; font-weight: 700; flex: 1; }
  .back-btn { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 10px; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text); flex-shrink: 0; }

  /* Dashboard */
  .dash-greeting h2 { font-size: 24px; font-weight: 700; }
  .dash-greeting p { color: var(--text2); font-size: 14px; margin-top: 2px; margin-bottom: 16px; }
  .connection-badge { display: inline-flex; align-items: center; gap: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 5px 12px; font-size: 12px; font-weight: 600; margin-bottom: 18px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent2); }
  .dot.offline { background: var(--danger); }

  /* Dashboard user bar */
  .dash-userbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 18px; cursor: pointer; }
  .dash-user-chip { display: inline-flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 22px; padding: 5px 12px 5px 5px; font-size: 13px; font-weight: 600; }
  .dash-user-chip span { max-width: 130px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dash-user-avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--primary); color: var(--on-primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

  /* Profile */
  .profile-hero { display: flex; align-items: center; gap: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; margin-bottom: 14px; }
  .profile-avatar { width: 64px; height: 64px; border-radius: 18px; background: var(--primary); color: var(--on-primary); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; flex-shrink: 0; }
  .profile-id { min-width: 0; }
  .profile-name { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
  .profile-login { color: var(--text2); font-size: 14px; margin-top: 2px; }
  .profile-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; cursor: pointer; }
  .stat-card .label { font-size: 11px; color: var(--text2); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .stat-card .value { font-size: 28px; font-weight: 700; font-family: 'Barlow', sans-serif; font-variant-numeric: tabular-nums; }
  .stat-card .value.accent { color: var(--accent); }
  .stat-card .value.green { color: var(--accent2); }
  .section-label { font-size: 11px; font-weight: 700; color: var(--text3); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
  .quick-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
  .quick-btn { background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius); padding: 16px; cursor: pointer; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; transition: background-color .15s, transform .15s; }
  .quick-btn:active { transform: scale(.97); background: var(--surface2); }
  .quick-btn-icon { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .quick-btn span { font-size: 13px; font-weight: 700; color: var(--text); }

  /* List */
  .search-bar { background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font-family: 'Barlow', sans-serif; font-size: 16px; padding: 13px 16px; width: 100%; outline: none; margin-bottom: 12px; }
  .search-bar:focus { border-color: var(--accent); }
  .list-item { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-bottom: 8px; cursor: pointer; transition: background-color .12s; display: flex; align-items: center; gap: 12px; }
  .list-item:active { transform: scale(.985); background: var(--surface2); }
  .list-avatar { width: 42px; height: 42px; border-radius: 11px; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; flex-shrink: 0; }
  .list-info { flex: 1; min-width: 0; }
  .list-info .name { font-weight: 600; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .list-info .sub { font-size: 13px; color: var(--text2); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .list-amount { font-family: 'Barlow', sans-serif; font-variant-numeric: tabular-nums; font-weight: 600; font-size: 14px; text-align: right; white-space: nowrap; }
  .badge { display: inline-block; padding: 3px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; margin-top: 3px; }
  .badge-draft { background: var(--surface2); color: var(--text2); }
  .badge-open { background: var(--accent-soft); color: var(--on-accent-soft); }
  .badge-paid { background: var(--accent-soft); color: var(--on-accent-soft); }
  .badge-cancelled { background: var(--danger-soft); color: var(--danger); }

  /* Form */
  .form-section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; margin-bottom: 12px; }
  .form-section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text2); margin-bottom: 14px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .line-item-row { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 13px; margin-bottom: 10px; }
  .line-total { font-family: 'Barlow', sans-serif; font-variant-numeric: tabular-nums; font-weight: 700; font-size: 18px; text-align: right; padding: 14px 0; border-top: 1px solid var(--border); color: var(--text); }

  /* Detail view */
  .detail-hero { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; margin-bottom: 12px; }
  .detail-ref { font-size: 22px; font-weight: 700; font-family: 'Barlow', sans-serif; font-variant-numeric: tabular-nums; margin-bottom: 6px; }
  .detail-client { font-size: 15px; color: var(--text2); margin-bottom: 14px; }
  .detail-amount { font-size: 36px; font-weight: 700; font-family: 'Barlow', sans-serif; font-variant-numeric: tabular-nums; color: var(--text); }
  .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
  .detail-row:last-child { border-bottom: none; }
  .detail-row .lbl { color: var(--text2); }
  .detail-row .val { font-weight: 600; text-align: right; }
  .action-row { display: grid; gap: 8px; margin-bottom: 12px; }
  .action-row-2 { grid-template-columns: 1fr 1fr; }

  /* Upload */
  .upload-zone { border: 2px dashed var(--border); border-radius: var(--radius-sm); padding: 24px; text-align: center; cursor: pointer; transition: background-color .2s, border-color .2s; color: var(--text2); font-size: 14px; }
  .upload-zone:hover, .upload-zone.drag { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
  .upload-zone input { display: none; }
  .file-item { display: flex; align-items: center; gap: 10px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; font-size: 13px; }
  .file-item .fname { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-item .fsize { color: var(--text2); flex-shrink: 0; }

  /* Projects */
  .project-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; margin-bottom: 10px; cursor: pointer; }
  .project-card:active { background: var(--surface2); }
  .project-title { font-size: 16px; font-weight: 600; margin-bottom: 6px; }
  .project-meta { display: flex; gap: 12px; font-size: 13px; color: var(--text2); }
  .progress-bar { height: 6px; background: var(--surface2); border-radius: 3px; margin-top: 12px; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 3px; background: var(--accent); transition: width .4s; }
  .task-item { background: var(--surface2); border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; display: flex; gap: 10px; align-items: flex-start; }
  .task-check { width: 18px; height: 18px; border-radius: 4px; border: 2px solid var(--border); flex-shrink: 0; margin-top: 2px; display: flex; align-items: center; justify-content: center; }
  .task-check.done { background: var(--accent2); border-color: var(--accent2); color: var(--on-accent2); }

  /* Timer */
  .timer-display { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px 20px; text-align: center; margin-bottom: 12px; }
  .timer-time { font-family: 'Barlow', sans-serif; font-variant-numeric: tabular-nums; font-size: 52px; font-weight: 500; letter-spacing: 2px; color: var(--accent); }
  .timer-running .timer-time { color: var(--accent2); animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{ opacity:1 } 50%{ opacity:.7 } }

  /* Modal */
  /* .modal-backdrop ist derselbe Bogen unter dem Namen, den die neueren Seiten
     (Baumkataster, GBU-SKT, Betriebsmittel) benutzen. Er hatte bis 19.09.2026
     KEIN Stylesheet — die Masken standen unten im Seitenfluss statt über der
     Seite, auf dem Handy also unter der Karte und ausserhalb des Bildschirms. */
  .modal-overlay, .modal-backdrop { position: fixed; inset: 0; background: var(--overlay); z-index: 200; display: flex; align-items: flex-end; }
  .modal { background: var(--surface); border-radius: 20px 20px 0 0; width: 100%; max-height: 92vh; overflow-y: auto; padding: 20px; padding-bottom: calc(20px + env(safe-area-inset-bottom)); }
  .modal-handle { width: 36px; height: 4px; background: var(--border); border-radius: 2px; margin: 0 auto 18px; }
  .modal-title { font-size: 20px; font-weight: 700; margin-bottom: 18px; }

  /* Toast */
  .toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 12px 20px; font-size: 14px; font-weight: 600; z-index: 500; white-space: nowrap; box-shadow: var(--shadow); animation: fadeIn .2s; }
  .toast.success { border-color: var(--accent2); color: var(--accent2); }
  .toast.error { border-color: var(--danger); color: var(--danger); }
  @keyframes fadeIn { from { opacity:0; transform:translateX(-50%) translateY(-8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
  /* Sitzt ueber der unteren Leiste, nicht oben beim Toast: der Hinweis bleibt
     stehen, bis er angetippt wird, und soll dabei nichts verdecken. */
  .pflanzen-zeile { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
  .pflanzen-zeile input[type=checkbox] { width: 20px; height: 20px; margin-top: 1px; flex-shrink: 0; accent-color: var(--accent2); }
  .pflanzen-zeile > span { display: flex; flex-direction: column; gap: 3px; font-size: 14px; }
  .pflanzen-hinweis { font-size: 12px; color: var(--text2); line-height: 1.4; font-weight: 400; }
  .notiz-block { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; margin-bottom: 16px; }
  .notiz-text { font-size: 14px; line-height: 1.5; white-space: pre-wrap; color: var(--text2); }
  .artikel-chip { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 12px; background: var(--surface2); border: 1px solid var(--accent2); border-radius: var(--radius-sm); font-size: 14px; font-weight: 600; color: var(--accent2); }
  .artikel-chip-hinweis { font-size: 11px; font-weight: 400; color: var(--text2); white-space: nowrap; }
  .update-banner { position: fixed; left: 50%; transform: translateX(-50%); width: calc(100% - 24px); max-width: 456px; bottom: calc(76px + env(safe-area-inset-bottom)); z-index: 480; display: block; padding: 12px 16px; font-size: 14px; font-weight: 600; text-align: center; color: var(--on-accent2); background: var(--accent2); border: 0; border-radius: 10px; box-shadow: var(--shadow); cursor: pointer; }
  .loading { display: flex; align-items: center; justify-content: center; padding: 40px; gap: 10px; color: var(--text2); }
  .spinner { width: 18px; height: 18px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; flex-shrink: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .empty-state { text-align: center; padding: 50px 20px; color: var(--text2); }
  .empty-state svg { opacity: 0.25; margin-bottom: 10px; }
  .empty-state p { font-size: 14px; }
  .divider { height: 1px; background: var(--border); margin: 16px 0; }
  
.status-filter-menu{display:grid;grid-template-columns:90px 1fr;align-items:center;gap:10px;margin-bottom:14px;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:10px 12px;box-shadow:var(--shadow-sm)}
.status-filter-menu label{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--text2);font-weight:800}
.status-filter-menu select{width:100%;min-height:42px;border-radius:12px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);padding:0 12px;font-weight:700;font-size:15px}
.suggestion-menu{position:absolute;top:100%;left:0;right:0;z-index:90;margin-top:4px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);box-shadow:var(--shadow);max-height:260px;overflow-y:auto}
.suggestion-item{padding:12px;cursor:pointer;border-bottom:1px solid var(--border);background:var(--surface);color:var(--text)}
.suggestion-item:active{background:var(--field)}
@media(max-width:420px){.status-filter-menu{grid-template-columns:1fr}.status-filter-menu label{margin-bottom:-4px}}
.linked-row{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--field);margin-bottom:8px;cursor:pointer;transition:.15s ease}
.linked-row:hover{transform:translateY(-1px);border-color:var(--accent)}
.linked-icon{width:34px;height:34px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--accent-soft);color:var(--accent);flex:none}
.linked-title{font-weight:800;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.linked-sub{font-size:12px;color:var(--text2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.linked-amount{font-weight:900;color:var(--text);font-family:'Barlow',sans-serif;font-variant-numeric:tabular-nums;flex:none}
.chip { display: inline-flex; align-items: center; gap: 5px; background: var(--surface2); border: 1px solid var(--border); border-radius: 20px; padding: 4px 10px; font-size: 12px; color: var(--text2); }

  /* Kalender (Prinzip wie SPD Maps CalendarView) */
  .cal-viewswitch { display: flex; gap: 6px; margin-bottom: 14px; }
  .cal-viewswitch .seg { flex: 1; padding: 9px 0; border: 1px solid var(--border); background: var(--surface); color: var(--text2); border-radius: var(--radius-sm); font-size: 13px; font-weight: 700; cursor: pointer; }
  .cal-viewswitch .seg-active { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
  .cal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .cal-nav { width: 36px; height: 36px; border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: var(--radius-sm); font-size: 18px; cursor: pointer; }
  .cal-month-label { font-weight: 800; font-size: 15px; }
  .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 14px; }
  .cal-wd { text-align: center; font-size: 11px; font-weight: 700; color: var(--text3); text-transform: uppercase; padding: 4px 0; }
  .cal-day { position: relative; aspect-ratio: 1; border: 1px solid transparent; background: var(--surface); color: var(--text); border-radius: var(--radius-sm); font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .cal-day-sel { background: var(--primary); color: var(--on-primary); }
  .cal-day-today { border-color: var(--accent); color: var(--accent); }
  .cal-dot { position: absolute; bottom: 5px; left: 50%; transform: translateX(-50%); width: 5px; height: 5px; border-radius: 50%; background: var(--accent2); }
  .cal-day-sel .cal-dot { background: var(--on-primary); }
  .cal-day-header { font-size: 12px; font-weight: 800; color: var(--text2); text-transform: uppercase; letter-spacing: 0.5px; margin: 12px 0 8px; }
  .cal-events { list-style: none; display: flex; flex-direction: column; gap: 8px; }
  .cal-event { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 12px; cursor: pointer; }
  .cal-event-blattwerk { border-left: 3px solid var(--accent); }
  .cal-event-time { font-size: 12px; color: var(--text2); font-weight: 700; }
  .cal-event-title { font-size: 14px; font-weight: 700; margin-top: 2px; }
  .cal-event-meta { font-size: 12px; color: var(--text2); margin-top: 2px; white-space: pre-line; }
  .cal-status { font-size: 13px; color: var(--text2); padding: 8px 2px; }
  .cal-error { color: var(--danger); }
  .week-day { margin-bottom: 10px; }
  .week-day-head { font-size: 13px; font-weight: 800; color: var(--text2); padding: 6px 2px; cursor: pointer; }
  .week-day-today .week-day-head { color: var(--accent); }
  .week-empty { padding: 2px; }

  /* Gefährdungsbeurteilung */
  .gbu-modal { max-height: 92vh; overflow-y: auto; }
  .gbu-chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .gbu-chip { padding: 9px 13px; border-radius: 999px; border: 1.5px solid var(--border); background: var(--surface); color: var(--text); font-size: 13px; font-weight: 700; cursor: pointer; }
  .gbu-chip-active { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
  .gbu-warn { display: flex; align-items: center; gap: 8px; background: var(--warn-soft); border: 1px solid var(--warn-border); color: var(--warn); border-radius: var(--radius-sm); padding: 10px 12px; font-size: 13px; font-weight: 700; }
  .gbu-block-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .gbu-item { border-top: 1px solid var(--border); padding: 10px 0; }
  .gbu-item:first-of-type { border-top: none; }
  .gbu-item-label { font-size: 13.5px; margin-bottom: 8px; }
  .gbu-tri { display: flex; gap: 6px; }
  .gbu-tri-btn { flex: 1; padding: 8px 0; border-radius: var(--radius-sm); border: 1.5px solid var(--border); background: var(--surface); color: var(--text2); font-size: 12.5px; font-weight: 700; cursor: pointer; }
  .gbu-tri-ok { background: var(--accent2); border-color: var(--accent2); color: var(--on-accent2); }
  .gbu-tri-mangel { background: var(--danger-bg); border-color: var(--danger-bg); color: var(--on-danger); }
  .gbu-tri-nr { background: var(--text3); border-color: var(--text3); color: var(--bg); }
  .sig-wrap { border: 1.5px dashed var(--border); border-radius: var(--radius-sm); overflow: hidden; background: #fff; }
  .sig-canvas { width: 100%; height: 120px; display: block; touch-action: none; cursor: crosshair; }
  .sig-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; background: var(--surface); border-top: 1px solid var(--border); }
  .sig-hint { font-size: 12px; color: var(--text3); }
  .quick-btn-icon { position: relative; }
  .gbu-filter-input { background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius-sm); color: var(--text); padding: 9px 10px; font-size: 13px; min-width: 0; }
  .gbu-filter-input:focus { border-color: var(--accent); outline: none; }
  /* Fahrtenbuch: Handy-Ansicht (Karten statt Papierblatt).
     Das Papierformular (docs/fahrtenbuch-papier.html) hat 7 Spalten
     nebeneinander -- auf einem Handy heisst das Querscrollen bei jeder Zeile.
     Auf dem Bildschirm steht deshalb eine Karte je Fahrt; das Blatt zeichnet
     nur noch das PDF (src/fahrtenbuch-pdf.js). Nichts hier darf seitlich
     ueberlaufen: Breiten relativ, lange Orte brechen um. */
  .fb-kopfzeile { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .fb-kopfzeile select { flex: 1; min-width: 0; background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius-sm); color: var(--text); padding: 10px; font-size: 14px; font-weight: 600; }
  .fb-fz-name { flex: 1; min-width: 0; font-size: 15px; font-weight: 700; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fb-kmstand { font-family: 'Barlow', sans-serif; font-variant-numeric: tabular-nums; font-size: 13px; color: var(--text2); white-space: nowrap; }
  .fb-summe { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 6px; }
  .fb-summe > div { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 9px 10px; min-width: 0; }
  .fb-summe span { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: var(--text3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fb-summe b { display: block; font-family: 'Barlow', sans-serif; font-variant-numeric: tabular-nums; font-size: 14px; margin-top: 3px; color: var(--text); white-space: nowrap; }
  .fb-summe .fb-b b { color: var(--accent); }
  .fb-monat { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin: 16px 2px 7px; }
  .fb-monat b { font-size: 14px; font-weight: 700; color: var(--text); }
  .fb-monat span { font-family: 'Barlow', sans-serif; font-variant-numeric: tabular-nums; font-size: 12px; color: var(--text3); white-space: nowrap; }
  /* Karte = Knopf: die ganze Fahrt ist die Trefferflaeche (nichts kleiner als
     ein Daumen), Tastatur und Screenreader bekommen sie damit geschenkt. */
  .fb-karte { display: block; width: 100%; text-align: left; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; margin-bottom: 8px; cursor: pointer; font: inherit; color: var(--text); transition: transform .12s, background .12s; }
  .fb-karte:active { transform: scale(.985); background: var(--surface2); }
  .fb-karte-kopf { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .fb-nr { font-family: 'Barlow', sans-serif; font-variant-numeric: tabular-nums; font-size: 11px; font-weight: 700; color: var(--text3); background: var(--surface2); border-radius: 6px; padding: 2px 6px; white-space: nowrap; }
  .fb-datum { flex: 1; min-width: 0; font-size: 12px; color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fb-art { width: 24px; height: 24px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; flex: none; }
  .fb-art-B { background: var(--accent-soft); color: var(--on-accent-soft); }
  .fb-art-W { background: var(--k-petrol-bg); color: var(--k-petrol); }
  .fb-art-P { background: var(--surface2); color: var(--text2); }
  .fb-zweck { font-size: 15px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
  .fb-zweck.fb-leerfeld { color: var(--text3); font-weight: 500; font-style: italic; }
  .fb-weg { font-size: 13px; color: var(--text2); margin-top: 3px; line-height: 1.35; overflow-wrap: anywhere; }
  .fb-weg i { font-style: normal; color: var(--text3); padding: 0 4px; }
  .fb-karte-fuss { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-top: 7px; font-family: 'Barlow', sans-serif; font-variant-numeric: tabular-nums; font-size: 12px; color: var(--text3); }
  .fb-karte-fuss b { font-size: 14px; color: var(--text); white-space: nowrap; }
  .fb-marker { margin-top: 7px; font-size: 11.5px; line-height: 1.4; color: var(--text3); overflow-wrap: anywhere; }
  .fb-karte-storno { opacity: .72; }
  .fb-karte-storno .fb-zweck, .fb-karte-storno .fb-weg, .fb-karte-storno .fb-karte-fuss b { text-decoration: line-through; }
  .fb-karte-storno .fb-marker { color: var(--danger); }
  .fb-karte-wartet { border-style: dashed; }
  .fb-karte-geaendert .fb-marker { color: var(--warn); }
  /* Entwurf: angefangene Fahrt, noch nicht im Buch. Gestrichelt und blass —
     sie soll sichtbar unfertig aussehen, damit niemand sie fuer eingetragen
     haelt. Die fehlenden Angaben stehen als Chips darunter. */
  /* Suchauswahl (Kunden, Verantwortliche): Eingabefeld mit Trefferliste
     darunter. Die Treffer sind volle Zeilen — Daumenbreite, nicht Listenpunkt. */
  .suchauswahl { position: relative; }
  .suchauswahl-liste { margin-top: 6px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); overflow: hidden; max-height: 232px; overflow-y: auto; }
  .suchauswahl-treffer { display: block; width: 100%; text-align: left; background: none; border: none; border-bottom: 1px solid var(--border); color: var(--text); font: inherit; font-size: 14px; padding: 11px 12px; cursor: pointer; }
  .suchauswahl-treffer:last-child { border-bottom: none; }
  .suchauswahl-treffer:active { background: var(--surface2); }
  .suchauswahl-leer { font-size: 12.5px; color: var(--text3); padding: 10px 12px; line-height: 1.45; }
  .suchauswahl-gewaehlt { display: flex; align-items: center; gap: 8px; justify-content: space-between; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 8px 10px 12px; background: var(--surface); }
  .suchauswahl-gewaehlt span { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
  /* Übernahme vom letzten Einsatz beim selben Kunden. */
  .gbu-schalter { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600; color: var(--text); cursor: pointer; }
  .gbu-schalter input { width: 20px; height: 20px; flex: none; accent-color: var(--accent); }
  .gbu-uebernahme { border: 1px dashed var(--accent2); border-radius: var(--radius); padding: 12px 14px; background: var(--surface); display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .gbu-uebernahme > div:first-child { flex: 1; min-width: 150px; }
  .gbu-uebernahme b { display: block; font-size: 14px; }
  .gbu-uebernahme span { font-size: 12px; color: var(--text3); }
  .gbu-uebernahme-hinweis { flex-basis: 100%; font-size: 11.5px; color: var(--text3); line-height: 1.5; }
  .fb-entwurf { border-style: dashed; border-color: var(--accent2); background: var(--surface); }
  .fb-entwurf .fb-nr { background: var(--k-petrol-bg); color: var(--k-petrol); }
  .fb-entwurf-offen { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
  .fb-entwurf-offen span { font-size: 11px; font-weight: 600; color: var(--text3); background: var(--surface2); border-radius: 6px; padding: 2px 7px; }
  .fb-entwurf-zeile { display: flex; gap: 8px; align-items: stretch; margin-bottom: 8px; }
  .fb-entwurf-zeile .fb-karte { margin-bottom: 0; }
  .fb-entwurf-weg { flex: none; width: 44px; border: 1px dashed var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text3); font: inherit; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .fb-leer { text-align: center; color: var(--text2); font-size: 14px; line-height: 1.6; padding: 26px 16px; background: var(--surface); border: 1px dashed var(--border); border-radius: var(--radius); }
  /* Eingabemaske: gleiche Optik wie die uebrigen Masken der App (Bogen unten). */
  .fb-art-wahl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .fb-art-wahl button { border: 1.5px solid var(--border); background: var(--surface); color: var(--text2); border-radius: var(--radius-sm); padding: 10px 6px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; line-height: 1.25; }
  .fb-art-wahl button b { display: block; font-size: 15px; font-weight: 800; margin-bottom: 2px; }
  .fb-art-wahl button.aktiv { border-color: var(--accent); background: var(--accent-soft); color: var(--text); }
  .fb-vermerk-feld input { border-color: var(--warn) !important; }
  .fb-hinweis { font-size: 12px; color: var(--text3); line-height: 1.5; }
  .fb-fuss { font-size: 11.5px; color: var(--text3); line-height: 1.55; margin: 14px 2px 12px; }
  .fb-fuss b { font-weight: 700; color: var(--text2); }


  /* App-Einführung (Tutorial) */
  .tutorial-backdrop { position: fixed; inset: 0; background: rgba(10, 14, 12, 0.72); z-index: 300; display: flex; align-items: center; justify-content: center; padding: 22px; }
  .tutorial-card { position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 30px 24px 22px; max-width: 380px; width: 100%; text-align: center; box-shadow: var(--shadow); }
  .tutorial-skip { position: absolute; top: 10px; right: 14px; background: none; border: none; color: var(--text3); font-size: 13px; cursor: pointer; padding: 6px; }
  .tutorial-icon { font-size: 44px; margin-bottom: 10px; }
  .tutorial-card h2 { font-size: 18px; margin: 0 0 10px; color: var(--text); }
  .tutorial-card p { font-size: 14px; line-height: 1.55; color: var(--text2); margin: 0 0 18px; min-height: 88px; }
  .tutorial-dots { display: flex; justify-content: center; gap: 7px; margin-bottom: 18px; }
  .tutorial-code-link { display: block; margin: 14px auto 0; background: none; border: none; color: var(--text3); font-size: 13px; text-decoration: underline; cursor: pointer; padding: 8px; }
  .tutorial-code { display: flex; gap: 8px; margin-top: 14px; }
  .tutorial-code input { flex: 1; }
  .tutorial-code-fehler { color: var(--danger); font-size: 13px; margin: 8px 0 0; }
  .tutorial-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border); }
  .tutorial-dot.active { background: var(--accent); }
  .tutorial-buttons { display: flex; gap: 10px; }
  .tutorial-uebung { max-width: 560px; max-height: 88vh; overflow-y: auto; text-align: left; padding: 22px 18px 18px; }
  /* Nur die Karte scrollt (Regel oben) -- das Modal darin bekommt keinen
     eigenen Scrollbereich mehr. Sonst fuellt das innere .modal seine eigenen
     92vh und die Fehler-/Erfolgsmeldung samt "Weiter"-Knopf liegt unterhalb
     davon: sieht aus, als taete der Knopf nichts. */
  .tutorial-uebung .modal { max-height: none; overflow: visible; }
  .tutorial-auftrag { background: var(--surface2); border-left: 3px solid var(--accent); border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; font-size: 14px; line-height: 1.55; color: var(--text2); }
  .tutorial-auftrag b { color: var(--text); }
  .tutorial-hinweis { font-size: 12px; color: var(--text3); margin-top: 6px; }
  .tutorial-fehler { background: var(--danger-soft); border: 1px solid var(--danger); border-radius: 10px; padding: 11px 13px; margin: 14px 0; font-size: 14px; line-height: 1.5; color: var(--text); }
  .tutorial-erfolg { background: var(--accent-soft); border: 1px solid var(--accent); border-radius: 10px; padding: 11px 13px; margin: 14px 0; font-size: 14px; line-height: 1.5; color: var(--text); }
  .tutorial-fortschritt { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--text3); margin-bottom: 10px; }
  /* Eine Markierungsklasse statt border-color: outline verschiebt kein Layout
     und wirkt auch auf Bloecken ohne eigenen border-style — .gbu-chips hat
     keinen, dort bliebe eine border-color unsichtbar. Deren Regel oben bleibt
     unangetastet, sie gehoert auch der echten Maske.
     Zwei Klassen tief geschrieben, weil .field-group input/select/textarea
     (oben, ~Zeile 1332) selbst "outline: none" setzt und mit Klasse+Typ sonst
     gewaenne — ausgerechnet auf den echten Eingabefeldern, dem Regelfall.
     Zwei Klassen schlagen Klasse+Typ, damit braucht es kein !important. */
  .tutorial-uebung .tutorial-markiert { outline: 2px solid var(--danger); outline-offset: 4px; border-radius: 8px; }
  .foerder-box { background: rgba(255, 170, 0, .10); border: 1px solid #f9a825; border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; }
  .foerder-titel { font-weight: 800; font-size: 14px; margin-bottom: 6px; color: var(--text); }
  .foerder-text { font-size: 12.5px; line-height: 1.5; color: var(--text2); }
  .foerder-treffer { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; margin-top: 12px; }
  .foerder-info { flex: 1 1 180px; }
  .foerder-name { font-weight: 700; font-size: 14px; }
  .foerder-grund { font-size: 12px; color: var(--text2); line-height: 1.45; }
  .foerder-aktionen { display: flex; gap: 8px; }
  .foerder-ablauf { margin: 0 0 14px; padding-left: 20px; font-size: 13px; line-height: 1.6; color: var(--text2); }
  /* Die feste Notiz kommt als Klartext aus Dolibarr — Zeilenumbrueche muessen
     erhalten bleiben, deshalb pre-wrap statt einer Liste. */
  .foerder-notiz { white-space: pre-wrap; font-size: 12.5px; line-height: 1.55; color: var(--text2); background: var(--surface2); border-radius: 10px; padding: 11px 13px; margin-bottom: 12px; }
  .quick-btn-badge { position: absolute; top: -6px; right: -6px; min-width: 17px; height: 17px; border-radius: 999px; background: var(--danger-bg); color: var(--on-danger); font-size: 10.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; padding: 0 4px; }
`;

// ─── Vor-Ort-Gefährdungsbeurteilung (GBU) ───────────────────────────────────
// Checklisten-Inhalte + Validierung liegen in src/gbu-data.js. Hier: PDF,
// Offline-Warteschlange (localStorage), Unterschrift, Formular und Seite.

const loadGbuQueue = () => { try { return JSON.parse(localStorage.getItem("blattwerk_gbu_queue") || "[]") || []; } catch { return []; } };
const saveGbuQueue = (q) => { try { localStorage.setItem("blattwerk_gbu_queue", JSON.stringify(q)); } catch (_) {} };
const loadGbuLog = () => { try { return JSON.parse(localStorage.getItem("blattwerk_gbu_log") || "[]") || []; } catch { return []; } };
const pushGbuLog = (entry) => { try { localStorage.setItem("blattwerk_gbu_log", JSON.stringify([entry, ...loadGbuLog()].slice(0, 50))); } catch (_) {} };
const gbuPendingCount = () => loadGbuQueue().length;

// Von Kolleg:innen empfangene Beurteilungen (Automatik ueber /api/nc/gbu/meine
// UND der manuelle "Von Kollegen übernehmen"-Weg) — bewusst NICHT im selben
// Log wie die eigenen (blattwerk_gbu_log): das Log speist gbuLetzterEinsatz
// ("Übernehmen"-Vorschlag beim nächsten Einsatz beim selben Kunden), und eine
// fremde Beurteilung dort würde als Vorlage für eine neue vorgeschlagen. Die
// 50er-Deckelung des eigenen Logs dürfte ausserdem nie eigene, noch nicht
// hochgeladene Einträge verdrängen.
const loadGbuEmpfangen = () => { try { return JSON.parse(localStorage.getItem("blattwerk_gbu_empfangen") || "[]") || []; } catch { return []; } };
const pushGbuEmpfangen = (entry) => { try { localStorage.setItem("blattwerk_gbu_empfangen", JSON.stringify([entry, ...loadGbuEmpfangen()].slice(0, 50))); } catch (_) {} };

// ─── Lokale PDF-Ablage (IndexedDB, nie localStorage — Kontingent!) ─────────
const GBU_PDF_DB = "blattwerk";
const GBU_PDF_SPEICHER = "gbu-pdf";
const GBU_PDF_MAX = 20; // die letzten 20 Beurteilungen bleiben auf dem Gerät

// Zeit aus einem Ablage-Schlüssel ziehen ("gbu-<epoch>" eigene Beurteilung,
// "gbu-empf-<epoch>-<plId>" empfangene) — rein fürs Aufräumen hier lokal,
// gbuPdfUeberzaehlige selbst kennt (bewusst) keine Schlüsselform.
const gbuPdfZeitVon = (schluessel) => {
  const m = String(schluessel).match(/(\d{10,})/);
  return m ? Number(m[1]) : 0;
};

/** Auf die letzten GBU_PDF_MAX PDFs eindampfen (nach jedem Ablegen aufrufen). */
async function gbuPdfAufraeumen() {
  try {
    const schluessel = await idbSchluessel(GBU_PDF_DB, GBU_PDF_SPEICHER);
    const eintraege = schluessel.map((s) => ({ schluessel: s, zeit: gbuPdfZeitVon(s) }));
    for (const s of gbuPdfUeberzaehlige(eintraege, GBU_PDF_MAX)) await idbLoeschen(GBU_PDF_DB, GBU_PDF_SPEICHER, s);
  } catch (_) {} // Aufräumen darf nie eine Beurteilung gefährden
}

// Das PDF liegt lokal, BEVOR irgendein Netzzugriff versucht wird — genau das
// ist der Kern der Anforderung: VSG 4.2/SVLFG B09 verlangen Einsicht VOR ORT,
// ein Nachreichen bei Netz kommt zu spät. buildGbuPdf ist deterministisch
// (siehe submitGbuRecord oben), das hier gebaute PDF ist also byte-identisch
// zu dem, das später ggf. hochgeladen wird. Wirft nie: ein Fehler beim
// Ablegen darf die eigentliche Speicherung (Warteschlange) nicht gefährden.
async function gbuPdfSpeichernLokal(record, betrieb) {
  try {
    // Erstes GBU-PDF nach dem Start, bevor mandantHolen() geantwortet hat:
    // betrieb waere sonst BETRIEB_STANDARD (Platzhalter-Anschrift) statt der
    // echten Firma — einmal auf den echten Mandanten warten statt das
    // Platzhalter-PDF als Nachweis abzulegen.
    if (!mandantAusCache()) betrieb = mandantBetrieb(await mandantSicher());
    const pdfB64 = await buildGbuPdf(record, { betrieb });
    await idbSetzen(GBU_PDF_DB, GBU_PDF_SPEICHER, record.id, base64ZuBlob(pdfB64));
    await gbuPdfAufraeumen();
  } catch (e) { console.warn("GBU-PDF lokal ablegen fehlgeschlagen:", e); }
}

/**
 * "An Kollegen weitergeben": zuerst der native Teilen-Dialog (Bluetooth/
 * Nearby Share des Betriebssystems, kein Internet nötig), sonst "PDF
 * speichern" als Ausweg. `canShare` MUSS vor `share` geprüft werden — sonst
 * wirft `share` auf Geräten ohne Datei-Teilen NotAllowedError statt eines
 * Ausweichwegs. Ein Abbruch durch den Menschen (AbortError) ist kein Fehler.
 */
async function gbuTeilenOderSpeichern(blob, dateiname, showToast) {
  try {
    if (typeof navigator !== "undefined" && navigator.share && navigator.canShare) {
      const datei = new File([blob], dateiname, { type: "application/pdf" });
      if (navigator.canShare({ files: [datei] })) {
        await navigator.share({ files: [datei], title: dateiname });
        return;
      }
    }
  } catch (e) {
    if (e?.name === "AbortError") return;
    console.warn("Teilen fehlgeschlagen, weiche auf Speichern aus:", e);
  }
  await dateiSpeichern({ name: dateiname, typ: "application/pdf", url: URL.createObjectURL(blob) }, showToast);
}

// Upload-Ziele: Dolibarr-Projekt (falls gewählt) + Paperless-Archiv.
// Flags uploadedDolibarr/uploadedPl verhindern Doppel-Uploads beim Retry.
async function submitGbuRecord(api, record, betrieb) {
  // Siehe gbuPdfSpeichernLokal: erste Beurteilung nach dem Start bekommt so
  // den echten Betrieb statt BETRIEB_STANDARDs Platzhalter-Anschrift.
  if (!mandantAusCache()) betrieb = mandantBetrieb(await mandantSicher());
  const filename = buildGbuFilename(record.createdAt, record.kunde?.name || record.projekt?.ref || "", record.arbeitsart);
  const pdfB64 = await buildGbuPdf(record, { betrieb });
  const result = { ...record, filename };
  const errors = [];

  if (!record.uploadedDolibarr) {
    if (record.projekt?.ref && api) {
      try {
        const fd = new FormData();
        fd.append("modulepart", "project");
        fd.append("ref", record.projekt.ref);
        fd.append("subdir", "");
        fd.append("filename", filename);
        fd.append("filecontent", pdfB64);
        fd.append("fileencoding", "base64");
        fd.append("overwriteifexists", "1");
        await api.uploadDocument(fd);
        result.uploadedDolibarr = true;
      } catch (e) { errors.push("Dolibarr: " + (e?.message || e)); }
    } else {
      result.uploadedDolibarr = "skipped"; // kein Projekt gewählt bzw. kein Login
    }
  }

  // uploadedPl ?? uploadedNc: Geräte können noch wartende Warteschlangen-
  // Einträge mit dem alten Feldnamen haben (vor der Umstellung auf Paperless
  // erzeugt) — sonst würde eine schon hochgeladene Beurteilung erneut hochladen.
  // Ausdrücklich auf === true prüfen, nicht nur auf Wahrheitswert (Befund W2):
  // Geräte ohne Nextcloud-Login trugen früher die Zeichenkette "skipped" ein —
  // nicht leer, also wahr, also fälschlich als "schon hochgeladen" gelesen.
  // Kein Zugangsschlüssel nötig: /api/pl/upload nimmt keine Nextcloud-Zugangs-
  // daten mehr entgegen, der Server trägt den Paperless-Token selbst ein.
  if ((record.uploadedPl ?? record.uploadedNc) !== true) {
    try {
      // sha256 MUSS mit (Befund 2): der Erledigt-Merker (uploadedPl) schützt
      // nur, wenn die Antwort auch ankommt. Geht sie verloren (Funkloch,
      // Neustart, Zeitüberschreitung), bleibt der Merker false, der Eintrag
      // hängt weiter in der Warteschlange und wird beim nächsten Start erneut
      // hochgeladen — mit einem frisch erzeugten PDF. Weil buildGbuPdf das
      // Erstellungsdatum und die Datei-ID jetzt fest aus record ableitet
      // (statt "jetzt"/zufällig), ist dieses PDF byte-identisch zum ersten
      // Versuch, die Prüfsumme also gleich, und der Server (plPruefsummeQuery)
      // erkennt das Duplikat — genau wie beim Hochladen in PaperlessDocs.
      const bin = atob(pdfB64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const sha256 = await sha256Hex(new Blob([bytes]));
      const r = await apiFetch("/api/pl/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfBase64: pdfB64, dateiname: filename,
          titel: filename.replace(/\.pdf$/i, "").replace(/_/g, " "),
          datum: record.createdAt.slice(0, 10), thema: PL_THEMA.gbu, sha256,
        }),
      });
      if (!r.ok) { let m = ""; try { m = (await r.json()).error || ""; } catch (_) {} throw new Error(r.status + (m ? ": " + m : "")); }
      result.uploadedPl = true;

      // Weitergabe an die Kollegen, Stufe "mit Netz, automatisch": der
      // Server merkt sich, wer bei dieser Beurteilung dabei war, jedes
      // Gerät zieht das über /api/nc/gbu/meine nach (App-Start, online-
      // Event). Best effort und niemals fatal — ein Fehlschlag hier darf
      // den eigentlichen Upload (oben, bereits erledigt) nicht rückgängig
      // machen. beteiligteGemeldet verhindert, dass ein längst gemeldeter
      // Eintrag bei jedem erneuten processGbuQueue erneut gemeldet wird.
      if (!result.beteiligteGemeldet) {
        const beteiligte = gbuBeteiligteSchluessel(record, record.meLogin);
        if (beteiligte.length) {
          try {
            const nc = loadNcConfig();
            const rb = await apiFetch("/api/nc/gbu/beteiligte", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ server: nc.server, user: nc.user, pass: nc.pass, filename, sha256, datum: record.createdAt.slice(0, 10), beteiligte }),
            });
            if (rb.ok) result.beteiligteGemeldet = true;
          } catch (e) { console.warn("Beteiligte melden fehlgeschlagen:", e); }
        } else {
          result.beteiligteGemeldet = true; // niemand mit Login dabei — nichts zu melden
        }
      }
    } catch (e) { errors.push("Archiv: " + (e?.message || e)); }
  }

  return { record: result, errors };
}

// Warteschlange abarbeiten (App-Start, online-Event, GBU-Seite). Erfolgreiche
// Einträge wandern ins Log; fehlgeschlagene bleiben mit Fehlertext liegen.
let gbuQueueBusy = false;
async function processGbuQueue(api, showToast, betrieb) {
  if (gbuQueueBusy) return;
  const queue = loadGbuQueue();
  if (!queue.length || !navigator.onLine) return;
  gbuQueueBusy = true;
  try {
    await processGbuQueueInner(api, showToast, queue, betrieb);
  } finally { gbuQueueBusy = false; }
}
async function processGbuQueueInner(api, showToast, queue, betrieb) {
  const remaining = [];
  let done = 0;
  for (const rec of queue) {
    try {
      const { record, errors } = await submitGbuRecord(api, rec, betrieb);
      if (errors.length) {
        remaining.push({ ...record, lastError: errors.join(" · ") });
      } else {
        pushGbuLog({ ...record, lastError: null, sigDurchfuehrender: null, sigZweitePerson: null });
        done++;
      }
    } catch (e) {
      remaining.push({ ...rec, lastError: String(e?.message || e) });
    }
  }
  // Während des Uploads neu hinzugekommene Beurteilungen nicht verlieren.
  const addedMeanwhile = loadGbuQueue().filter((r) => !queue.some((q) => q.id === r.id));
  saveGbuQueue([...remaining, ...addedMeanwhile]);
  if (done && showToast) showToast(`${done} Gefährdungsbeurteilung(en) hochgeladen!`);
  if (remaining.length && showToast) showToast(`${remaining.length} Beurteilung(en) warten weiter (${remaining[0].lastError || "offline"})`, "error");
}

// Weitergabe an die Kollegen, Stufe "mit Netz, automatisch" — Gegenstück zu
// der Beteiligten-Meldung in submitGbuRecord: dort meldet das Gerät des
// Erstellers, wer dabei war; hier zieht sich jedes andere Gerät seine
// eigenen offenen Beurteilungen der letzten 30 Tage (App-Start, online-
// Event, wie processGbuQueue). Best effort: ein Fehlschlag bleibt unbemerkt,
// der nächste Aufruf versucht es erneut — plId kann außerdem noch null sein,
// solange Paperless das Dokument noch nicht verarbeitet hat.
let gbuMeineBusy = false;
async function gbuMeineNachziehen(me) {
  if (gbuMeineBusy) return;
  const login = me?.login;
  const nc = loadNcConfig();
  if (!login || !navigator.onLine || !ncHasAccess(nc)) return;
  gbuMeineBusy = true;
  try {
    const r = await apiFetch("/api/nc/gbu/meine", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server: nc.server, user: nc.user, pass: nc.pass, login }),
    });
    if (!r.ok) return;
    const { eintraege } = await r.json().catch(() => ({ eintraege: [] }));
    // Bereits geholte Dokumente nicht erneut herunterladen — das 30-Tage-
    // Fenster liefert bei jedem Aufruf dieselben Treffer.
    const bekannt = new Set(loadGbuEmpfangen().map((e) => e.plId).filter(Boolean));
    for (const e of eintraege || []) {
      if (!e.plId || bekannt.has(e.plId)) continue;
      try {
        const fr = await apiFetch(`/api/pl/file/${e.plId}`);
        if (!fr.ok) continue;
        const blob = await fr.blob();
        const id = `gbu-empf-${Date.now()}-${e.plId}`;
        await idbSetzen(GBU_PDF_DB, GBU_PDF_SPEICHER, id, blob);
        pushGbuEmpfangen({ id, plId: e.plId, titel: e.filename, datum: e.datum, empfangenAm: new Date().toISOString() });
      } catch (_) {} // ein einzelnes fehlgeschlagenes Dokument bricht die anderen nicht ab
    }
    await gbuPdfAufraeumen();
  } catch (_) {}
  finally { gbuMeineBusy = false; }
}

// Unterschrift per Finger/Maus. Immer weißer Grund (landet so im PDF).
// `initial` stellt eine schon geleistete Unterschrift wieder her (Zurück-Navigation).
function SignaturePad({ onChange, initial, height = 200 }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(!initial);

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#14243a"; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (initial) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, c.width, c.height); };
      img.src = initial;
    }
  }, []);

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvasRef.current.width / r.width), y: (e.clientY - r.top) * (canvasRef.current.height / r.height) };
  };
  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y + 0.1); ctx.stroke();
    setEmpty(false);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = pos(e);
    ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    // JPEG statt PNG: macht die Unterschrift ~10× kleiner und damit die
    // PDFs deutlich schneller (weißer Grund ist ohnehin gesetzt).
    onChange(canvasRef.current.toDataURL("image/jpeg", 0.85));
  };
  const clear = () => {
    const c = canvasRef.current, ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className="sig-wrap">
      <canvas
        ref={canvasRef} width={700} height={Math.round(height * 1.75)} className="sig-canvas" style={{ height }}
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}
      />
      <div className="sig-row">
        <span className="sig-hint">{empty ? "Hier unterschreiben" : ""}</span>
        <button type="button" className="btn btn-ghost btn-xs" onClick={clear}>Löschen</button>
      </div>
    </div>
  );
}

// Dreizustands-Schalter je Prüfpunkt.
function GbuTriState({ value, onChange }) {
  return (
    <div className="gbu-tri">
      {[["ok", "OK"], ["mangel", "Mangel"], ["nr", "n. r."]].map(([v, l]) => (
        <button key={v} type="button" className={`gbu-tri-btn ${value === v ? `gbu-tri-${v}` : ""}`} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

// Auswahl mit Suchfeld. Die Kunden- und Personenlisten sind auf dem Handy zu
// lang zum Durchscrollen — und im Freien mit Handschuhen erst recht. Zwei
// Betriebsarten:
//   - Auswahl (Vorgabe): der Wert ist eine Id, angezeigt wird der Name.
//   - `freitext`: der Wert IST der getippte Text, die Liste schlägt nur vor.
//     Aufsichtsführende(r) darf auch jemand sein, der nicht in Dolibarr steht.
function SuchAuswahl({ liste, personen, wert, onWaehlen, platzhalter, leerLabel = "— nichts gewählt —", freitext = false, max = 8 }) {
  const [such, setSuch] = useState("");
  const [offen, setOffen] = useState(false);
  const quelle = personen || liste || [];
  const idVon = (o) => String(o?.id ?? o?.rowid ?? o?.login ?? "");
  const nameVon = (o) => String(o?.name || o?.nom || o?.label || o?.login || "");
  const gewaehlt = freitext ? null : quelle.find((o) => idVon(o) === String(wert || ""));
  const treffer = gbuSuche(quelle, freitext ? wert : such);
  const zeigen = treffer.slice(0, max);

  // Freitext: das Eingabefeld ist der Wert. Vorschläge erscheinen erst, wenn
  // etwas getippt ist und der Name nicht schon genau passt — sonst stünde die
  // Liste dauerhaft im Weg.
  if (freitext) {
    const passtGenau = quelle.some((o) => nameVon(o).toLowerCase() === String(wert || "").trim().toLowerCase());
    return (
      <div className="suchauswahl">
        <input value={wert || ""} placeholder={platzhalter} onFocus={() => setOffen(true)}
          onChange={(e) => { onWaehlen(e.target.value); setOffen(true); }} />
        {offen && !passtGenau && String(wert || "").trim() && zeigen.length > 0 && (
          <div className="suchauswahl-liste">
            {zeigen.map((o) => (
              <button type="button" key={idVon(o) || nameVon(o)} className="suchauswahl-treffer"
                onClick={() => { onWaehlen(nameVon(o)); setOffen(false); }}>{nameVon(o)}</button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (gewaehlt) {
    return (
      <div className="suchauswahl-gewaehlt">
        <span>{nameVon(gewaehlt)}</span>
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => { onWaehlen(""); setSuch(""); }}>ändern</button>
      </div>
    );
  }
  return (
    <div className="suchauswahl">
      <input value={such} placeholder={platzhalter} onChange={(e) => { setSuch(e.target.value); setOffen(true); }}
        onFocus={() => setOffen(true)} />
      {(offen || such.trim()) && (
        <div className="suchauswahl-liste">
          {zeigen.length === 0 && <div className="suchauswahl-leer">{such.trim() ? "Nichts gefunden." : leerLabel}</div>}
          {zeigen.map((o) => (
            <button type="button" key={idVon(o)} className="suchauswahl-treffer"
              onClick={() => { onWaehlen(idVon(o)); setOffen(false); setSuch(""); }}>{nameVon(o)}</button>
          ))}
          {treffer.length > zeigen.length && (
            <div className="suchauswahl-leer">… und {treffer.length - zeigen.length} weitere — Suche eingrenzen.</div>
          )}
        </div>
      )}
    </div>
  );
}

function GbuForm({ api, me, project, onClose, onSaved, showToast }) {
  const mandant = useMandant();
  const [customers, setCustomers] = useState([]);
  const [projects, setProjects] = useState([]);
  // Verantwortliche = Aufsichtsführende(r) und das eingesetzte Personal. Beide
  // werden jetzt gesucht statt getippt; die Namen kommen aus Dolibarr, freie
  // Eingabe bleibt möglich (Aushilfen stehen dort nicht).
  const [personen, setPersonen] = useState([]);
  const [saving, setSaving] = useState(false);
  const meName = (`${me?.firstname || ""} ${me?.lastname || ""}`.trim()) || me?.login || "";
  const [form, setForm] = useState(() => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return {
      kundeId: project ? String(project.socid || project.fk_soc || "") : "",
      projektId: project ? String(project.id || project.rowid) : "",
      arbeitsart: "", zugang: "",
      niederschlag: GBU_NIEDERSCHLAG[0], wind: GBU_WIND[0],
      beschreibung: "", baum: "", besonderheiten: "", zweitePersonName: "",
      einsatzort: "", aufsichtsfuehrender: meName,
      dauerVon: `${pad(now.getHours())}:${pad(now.getMinutes())}`, dauerBis: "",
      arbeiten: [], arbeitenSonstiges: "",
      stromEntfernung: "", kommunikationsart: "", verkehrssicherungsart: "",
      // Einsatz nach Zeit: „8 h, so viele Bäume wie möglich" — die Stückzahl
      // steht vorher nicht fest, der Zeitrahmen ist dann das Maß des Einsatzes.
      anzahlOffen: false, zeitrahmenStunden: "",
    };
  });
  // Eingesetztes Personal (SVLFG-Formularkopf): bis zu 4 Personen mit Qualifikation.
  const [personal, setPersonal] = useState(() => [{ name: meName, quals: [] }]);
  // Baumsicherheitsbeurteilung (nur bei Baumpflege/Fällung).
  const [baumdaten, setBaumdaten] = useState({
    baumart: "", hoehe: "", bhd: "", stock: "",
    haenger: [], umfeld: [], stamm: [], krone: [],
    gewicht: "", kronenzustand: "", sicher: "", bemerkung: "",
  });
  const [items, setItems] = useState({}); // "block:item" -> { status, massnahme, massnahmeText }
  const [sig1, setSig1] = useState(null);
  const [sig2, setSig2] = useState(null);
  const [step, setStep] = useState(1); // 1 = Formular, 2 = Unterschrift Person 1, 3 = Unterschrift Person 2
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  // Fix-Runde Task 12 (18.09.2026): G-41-Hinweis bei Aufsichtsführender/-em
  // und eingesetztem Personal — warnt, blockiert nichts (kein Speichern-
  // Abbruch, keine Pflichtbestätigung). Gleiches Muster wie der Tages-Effekt
  // in App() (loadNcConfig/ncHasAccess), nur hier als eigener, zusätzlicher
  // Abruf: das Qualifikations-Register ist personenbezogen, der GBU-Tages-
  // Effekt liest nur die Zahl offener Fortbildungen fürs Abzeichen.
  const nc = loadNcConfig();
  const ncOk = ncHasAccess(nc);
  const [qualiStore, setQualiStore] = useState(null);
  useEffect(() => {
    if (!ncOk) return;
    apiFetch("/api/nc/qualifikationen", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server: nc.server, user: nc.user, pass: nc.pass }),
    }).then((r) => (r.ok ? r.json() : null)).then(setQualiStore).catch(() => {});
  }, [ncOk, nc.server, nc.user, nc.pass]);
  // Aufsichtsführende(r) und Personal sind Freitext-Namen (auch Aushilfen
  // ohne Dolibarr-Login) — Abgleich deshalb per Namen, nicht per Schlüssel.
  // Kein Treffer (unbekannter/neuer Name, Store noch nicht geladen) -> kein
  // Hinweis, nie ein falscher.
  const qualiPersonen = qualiPersonenVereinen(
    personen.map((p) => ({ key: qualiKeyAusLogin(p.login), name: p.name })),
    qualiStore?.personen,
  );
  const g41Fuer = (name) => {
    const n = String(name || "").trim().toLowerCase();
    if (!n) return null;
    const p = qualiPersonen.find((x) => x.name.trim().toLowerCase() === n);
    return p ? qualG41Hinweis(p, heuteIso()) : null;
  };

  useEffect(() => {
    api?.getThirdparties("customer").then((c) => setCustomers(Array.isArray(c) ? c : [])).catch(() => {});
    api?.getUsers().then((u) => setPersonen(ewPersonen(u))).catch(() => setPersonen([]));
    // Nur offene Projekte anbieten (das vorausgewählte Projekt aus dem Detail bleibt immer wählbar).
    api?.getProjects().then((p) => {
      let arr = (Array.isArray(p) ? p : []).filter(isOpenProject);
      if (project && !arr.some((x) => String(x.id || x.rowid) === String(project.id || project.rowid))) arr = [project, ...arr];
      setProjects(arr);
    }).catch(() => {});
  }, [api, project]);

  // `me` kann beim Öffnen direkt nach App-Start noch fehlen — Vorbelegung nachziehen,
  // sobald der Name da ist (nur solange die Felder noch leer sind).
  useEffect(() => {
    if (!meName) return;
    setForm((f) => (f.aufsichtsfuehrender ? f : { ...f, aufsichtsfuehrender: meName }));
    setPersonal((p) => (p.length === 1 && !p[0].name.trim() ? [{ ...p[0], name: meName }] : p));
  }, [meName]);

  const art = gbuArbeitsart(form.arbeitsart);
  const blocks = form.arbeitsart ? composeChecklist(form.arbeitsart, form.zugang) : [];
  const warnung = gbuWetterWarnung(form.wind, form.niederschlag, form.zugang, form.arbeitsart);
  const aufsichtG41 = g41Fuer(form.aufsichtsfuehrender);
  const selProject = projects.find((p) => String(p.id || p.rowid) === form.projektId) || project || null;
  const selCustomer = customers.find((c) => String(c.id || c.rowid) === String(form.kundeId || selProject?.socid || selProject?.fk_soc || ""));

  // „Wenn öfter beim Kunden, alles übernehmen": der letzte Einsatz bei genau
  // diesem Kunden aus dem Geräte-Log (dort liegt der volle Datensatz, nur ohne
  // Unterschriften — siehe pushGbuLog).
  const letzterEinsatz = gbuLetzterEinsatz(loadGbuLog(), {
    kundeId: form.kundeId || selCustomer?.id || selCustomer?.rowid,
    kundeName: selCustomer?.name || selProject?.thirdparty_name,
  });
  const uebernehmen = () => {
    const u = gbuUebernahme(letzterEinsatz);
    if (!u) return;
    setForm((f) => ({ ...f, ...u.form }));
    if (u.personal.length) setPersonal(u.personal);
    if (u.baumdaten) setBaumdaten((b) => ({ ...b, ...u.baumdaten }));
    setItems(u.items);
    showToast("Übernommen — Wetter, Zeiten und Unterschriften bitte neu ausfüllen.");
  };

  const setItem = (key, patch) => setItems((p) => ({ ...p, [key]: { ...(p[key] || {}), ...patch } }));
  const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const setBaum = (k) => (e) => setBaumdaten((p) => ({ ...p, [k]: e.target.value }));
  const toggleBaumList = (k, v) => setBaumdaten((p) => {
    // „Normalbaum" schließt die Hänger-Varianten aus (und umgekehrt).
    if (k === "haenger") {
      if (v === "Normalbaum") return { ...p, haenger: p.haenger.includes(v) ? [] : ["Normalbaum"] };
      return { ...p, haenger: toggleIn(p.haenger.filter((x) => x !== "Normalbaum"), v) };
    }
    return { ...p, [k]: toggleIn(p[k], v) };
  });
  const setPerson = (i, patch) => setPersonal((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const allOk = (b) => setItems((p) => {
    const n = { ...p };
    for (const it of b.items) n[`${b.id}:${it.id}`] = { status: "ok" };
    return n;
  });

  // Projekt wählen setzt den Kunden automatisch mit.
  const pickProject = (e) => {
    const id = e.target.value;
    const pr = projects.find((p) => String(p.id || p.rowid) === id);
    setForm((f) => ({ ...f, projektId: id, kundeId: pr ? String(pr.socid || pr.fk_soc || f.kundeId || "") : f.kundeId }));
  };

  const buildRecord = () => {
    // Maßnahmen-Freitext in die gespeicherte Maßnahme übernehmen.
    const finalItems = {};
    for (const [k, v] of Object.entries(items)) {
      const massnahme = v.massnahme === "Sonstige Maßnahme (Freitext)" ? (v.massnahmeText || "") : (v.massnahme || "");
      finalItems[k] = { status: v.status, massnahme };
    }
    const userName = (`${me?.firstname || ""} ${me?.lastname || ""}`.trim()) || me?.login || "";
    const baum = isBaumArbeit(form.arbeitsart);
    return {
      id: "gbu-" + Date.now(),
      createdAt: new Date().toISOString(),
      userName,
      kunde: selCustomer ? { id: selCustomer.id || selCustomer.rowid, name: selCustomer.name } : (selProject?.thirdparty_name ? { name: selProject.thirdparty_name } : null),
      projekt: selProject ? { id: selProject.id || selProject.rowid, ref: selProject.ref, title: selProject.title } : null,
      arbeitsart: form.arbeitsart, zugang: art?.zugangRelevant ? form.zugang : "",
      niederschlag: form.niederschlag, wind: form.wind,
      beschreibung: form.beschreibung.trim(), baum: form.baum.trim(), besonderheiten: form.besonderheiten.trim(),
      zweitePersonName: form.zweitePersonName.trim(),
      einsatzort: form.einsatzort.trim(),
      aufsichtsfuehrender: form.aufsichtsfuehrender.trim() || userName,
      dauerVon: form.dauerVon, dauerBis: form.dauerBis,
      personal: personal.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), quals: p.quals })),
      arbeiten: baum ? form.arbeiten : [],
      arbeitenSonstiges: baum ? form.arbeitenSonstiges.trim() : "",
      anzahlOffen: !!form.anzahlOffen,
      zeitrahmenStunden: form.zeitrahmenStunden === "" ? "" : Number(String(form.zeitrahmenStunden).replace(",", ".")),
      stromEntfernung: form.stromEntfernung.trim(),
      kommunikationsart: form.kommunikationsart.trim(),
      verkehrssicherungsart: form.verkehrssicherungsart.trim(),
      baumdaten: baum ? { ...baumdaten, baumart: baumdaten.baumart.trim(), hoehe: baumdaten.hoehe.trim(), bhd: baumdaten.bhd.trim(), stock: baumdaten.stock.trim(), bemerkung: baumdaten.bemerkung.trim() } : null,
      items: finalItems,
      sigDurchfuehrender: sig1, sigZweitePerson: sig2,
      uploadedDolibarr: false, uploadedPl: false,
    };
  };

  // Schritt 1 prüft nur das Formular (Unterschriften kommen in Schritt 2/3).
  const goToSign = () => {
    const errors = validateGbu({ ...buildRecord(), sigDurchfuehrender: "x", sigZweitePerson: "x" });
    if (errors.length) { showToast(errors[0], "error"); return; }
    setStep(2);
  };

  const save = async () => {
    const record = buildRecord();
    const errors = validateGbu(record);
    if (errors.length) { showToast(errors[0], "error"); return; }

    setSaving(true);
    saveGbuQueue([...loadGbuQueue(), record]);
    if (navigator.onLine) {
      // Ungeladener Mandant sperrt nichts — dieselbe Regel wie useBlock/useFunktion.
      if (!mandant || funktionAktiv(mandant, "gbu")) await processGbuQueue(api, showToast, mandantBetrieb(mandant));
    } else {
      showToast("Offline gespeichert – Upload folgt automatisch bei Netz");
    }
    setSaving(false);
    onSaved?.();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal gbu-modal">
        <div className="modal-handle" />
        <div className="modal-title">
          {step === 1 ? "Gefährdungsbeurteilung vor Ort" : step === 2 ? "Unterschrift: Durchführende(r)" : "Unterschrift: Zweite Person"}
        </div>

        {step === 1 && (<>
        <div className="form-section">
          <div className="form-section-title">Einsatz</div>
          <div className="field-group mb12"><label>Projekt</label>
            <select value={form.projektId} onChange={pickProject}>
              <option value="">— Kein Projekt (nur Nextcloud-Ablage) —</option>
              {projects.map((p) => <option key={p.id || p.rowid} value={p.id || p.rowid}>{p.ref} · {p.title}</option>)}
            </select>
          </div>
          <div className="field-group mb12"><label>Kunde</label>
            {/* Ein gewähltes Projekt bringt seinen Kunden mit — dann steht der
                Name da, auch wenn niemand ihn hier ausgewählt hat. */}
            <SuchAuswahl liste={customers} wert={form.kundeId || String(selCustomer?.id || selCustomer?.rowid || "")}
              platzhalter="Kunde suchen — Name tippen"
              leerLabel="Namen tippen, um zu suchen."
              onWaehlen={(id) => setForm((f) => ({ ...f, kundeId: id }))} />
          </div>
          {/* „Wenn öfter beim Kunden": der wiederkehrende Teil des letzten
              Einsatzes auf einen Griff. Wetter, Uhrzeit, Unterschriften und
              gemeldete Mängel bleiben bewusst draußen — die gehören neu
              beurteilt, sonst wäre es eine Kopie statt einer Beurteilung. */}
          {letzterEinsatz && (
            <div className="gbu-uebernahme mb12">
              <div>
                <b>Schon einmal hier gewesen</b>
                <span>{new Date(letzterEinsatz.createdAt).toLocaleDateString("de-DE")} · {gbuArbeitsart(letzterEinsatz.arbeitsart)?.label || letzterEinsatz.arbeitsart || "Einsatz"}</span>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={uebernehmen}>Vom letzten Einsatz übernehmen</button>
              <div className="gbu-uebernahme-hinweis">Wetter, Uhrzeit, Unterschriften und gemeldete Mängel werden nicht übernommen — die musst du vor Ort neu beurteilen.</div>
            </div>
          )}
          <div className="field-group mb12"><label>Einsatzort (Adresse/Beschreibung — auch für den Notruf)</label>
            <input value={form.einsatzort} onChange={set("einsatzort")} placeholder="z. B. Zur Musterstraße 10, Musterstadt — Garten hinterm Haus" />
          </div>
          <div className="field-group mb12"><label>Aufsichtsführende(r)</label>
            <SuchAuswahl personen={personen} freitext wert={form.aufsichtsfuehrender} platzhalter="Vor- und Nachname — tippen zum Suchen"
              onWaehlen={(v) => setForm((f) => ({ ...f, aufsichtsfuehrender: v }))} />
            {/* Fix-Runde Task 12: Hinweis, kein Abbruch — ein überfälliger
                Untersuchungstermin darf keinen Einsatz platzen lassen. */}
            {aufsichtG41 && (
              <div className="gbu-g41-hinweis" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--warn)", marginTop: 4 }}>
                ⚠ {aufsichtG41.text}
              </div>
            )}
          </div>
          <div className="form-row mb12">
            <div className="field-group" style={{ flex: 1 }}><label>Dauer von</label>
              <TimeField value={form.dauerVon} onChange={set("dauerVon")} />
            </div>
            <div className="field-group" style={{ flex: 1 }}><label>Dauer bis (voraussichtlich)</label>
              <TimeField value={form.dauerBis} onChange={set("dauerBis")} />
            </div>
          </div>
          <div className="form-row mb12">
            <div className="field-group" style={{ flex: 1 }}><label>Niederschlag</label>
              <select value={form.niederschlag} onChange={set("niederschlag")}>{GBU_NIEDERSCHLAG.map((w) => <option key={w}>{w}</option>)}</select>
            </div>
            <div className="field-group" style={{ flex: 1 }}><label>Wind</label>
              <select value={form.wind} onChange={set("wind")}>{GBU_WIND.map((w) => <option key={w}>{w}</option>)}</select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <div className="gbu-block-head">
            <div className="form-section-title" style={{ marginBottom: 0 }}>Eingesetztes Personal</div>
            {personal.length < GBU_PERSONAL_MAX && (
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setPersonal((p) => [...p, { name: "", quals: [] }])}>+ Person</button>
            )}
          </div>
          {personal.map((p, i) => {
            const personG41 = g41Fuer(p.name);
            return (
            <div className="gbu-item" key={i}>
              <div className="form-row" style={{ alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <SuchAuswahl personen={personen} freitext wert={p.name} platzhalter={`Name Person ${i + 1}`}
                    onWaehlen={(v) => setPerson(i, { name: v })} />
                </div>
                {personal.length > 1 && (
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setPersonal((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
                )}
              </div>
              <div className="gbu-chips" style={{ marginTop: 8 }}>
                {GBU_QUALIFIKATIONEN.map((q) => (
                  <button key={q} type="button" className={`gbu-chip ${p.quals.includes(q) ? "gbu-chip-active" : ""}`}
                    onClick={() => setPerson(i, { quals: toggleIn(p.quals, q) })}>{q}</button>
                ))}
              </div>
              {/* Fix-Runde Task 12: Hinweis, kein Abbruch (siehe Aufsichtsführende(r) oben). */}
              {personG41 && (
                <div className="gbu-g41-hinweis" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--warn)", marginTop: 6 }}>
                  ⚠ {personG41.text}
                </div>
              )}
            </div>
            );
          })}
        </div>

        <div className="form-section">
          <div className="form-section-title">Arbeitsart</div>
          <div className="gbu-chips">
            {GBU_ARBEITSARTEN.map((a) => (
              <button key={a.id} type="button" className={`gbu-chip ${form.arbeitsart === a.id ? "gbu-chip-active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, arbeitsart: a.id }))}>{a.label}</button>
            ))}
          </div>
          {isBaumArbeit(form.arbeitsart) && (<>
            <div className="field-group" style={{ marginTop: 12 }}>
              <label>{form.anzahlOffen ? "Arbeitsbereich (wo genau wird gearbeitet?) *" : "Baum/Bäume (Anzahl, Standort; Art falls bekannt) *"}</label>
              <input value={form.baum} onChange={set("baum")}
                placeholder={form.anzahlOffen
                  ? "z. B. Schlosspark, Altbaumbestand an der Allee"
                  : "z. B. 1 Bergahorn, Vorgarten — oder: 5 Obstbäume, Wiese"} />
            </div>
            {/* „Macht in 8 h so viele Bäume wie möglich": auf großen Grundstücken
                (Schlosspark, Streuobstwiese) steht die Stückzahl vorher nicht
                fest. Eine erfundene Zahl im Formular wäre schlechter als keine —
                also ist der Zeitrahmen das Maß, und das Feld oben beschreibt
                den Bereich. Beides steht im Datensatz und im PDF. */}
            <div className="field-group" style={{ marginTop: 12 }}>
              <label className="gbu-schalter">
                <input type="checkbox" checked={!!form.anzahlOffen}
                  onChange={(e) => setForm((f) => ({ ...f, anzahlOffen: e.target.checked }))} />
                <span>Anzahl steht nicht fest — Arbeit nach Zeit</span>
              </label>
            </div>
            {(form.anzahlOffen || form.zeitrahmenStunden !== "") && (
              <div className="field-group" style={{ marginTop: 12 }}>
                <label>Zeitrahmen in Stunden{form.anzahlOffen ? " *" : ""}</label>
                <input type="number" inputMode="decimal" step="0.5" min="0.5" max="24"
                  value={form.zeitrahmenStunden}
                  onChange={(e) => setForm((f) => ({ ...f, zeitrahmenStunden: e.target.value }))}
                  placeholder="z. B. 8" />
                <div className="fb-hinweis">
                  {gbuUmfangText({ anzahlOffen: form.anzahlOffen, zeitrahmenStunden: form.zeitrahmenStunden })
                    || "Halbe Stunden gehen (0,5 bis 24)."}
                  {form.anzahlOffen && " · Oben dann den Bereich benennen statt einer Stückzahl. Die Beurteilung gilt für gleichartige Bäume in diesem Bereich — weicht einer ab, Arbeit dort stoppen und neu beurteilen. Genau so steht es auch im PDF."}
                </div>
              </div>
            )}
            <div className="field-group" style={{ marginTop: 12 }}><label>Durchzuführende Arbeiten *</label>
              <div className="gbu-chips">
                {GBU_DURCHZUFUEHRENDE_ARBEITEN.map((a) => (
                  <button key={a} type="button" className={`gbu-chip ${form.arbeiten.includes(a) ? "gbu-chip-active" : ""}`}
                    onClick={() => setForm((f) => ({ ...f, arbeiten: toggleIn(f.arbeiten, a) }))}>{a}</button>
                ))}
              </div>
              <input style={{ marginTop: 8 }} value={form.arbeitenSonstiges} onChange={set("arbeitenSonstiges")} placeholder="Sonstiges…" />
            </div>
          </>)}
          {art?.beschreibungPflicht && (
            <div className="field-group" style={{ marginTop: 12 }}><label>Tätigkeit beschreiben *</label>
              <input value={form.beschreibung} onChange={set("beschreibung")} placeholder="z. B. Zaunbau, Pflasterarbeiten…" />
            </div>
          )}
        </div>

        {art?.zugangRelevant && (
          <div className="form-section">
            <div className="form-section-title">Zugang / Arbeitsverfahren</div>
            <div className="gbu-chips">
              {GBU_ZUGAENGE.map((z) => (
                <button key={z.id} type="button" className={`gbu-chip ${form.zugang === z.id ? "gbu-chip-active" : ""}`}
                  onClick={() => setForm((f) => ({ ...f, zugang: z.id }))}>{z.label}</button>
              ))}
            </div>
            {warnung && <div className="gbu-warn" style={{ marginTop: 12 }}><Icon name="warning" size={16} /> {warnung}</div>}
          </div>
        )}
        {!art?.zugangRelevant && warnung && <div className="gbu-warn"><Icon name="warning" size={16} /> {warnung}</div>}

        {isBaumArbeit(form.arbeitsart) && (
          <div className="form-section">
            <div className="form-section-title">Baumsicherheitsbeurteilung (SVLFG)</div>
            <div className="form-row mb12">
              <div className="field-group" style={{ flex: 1 }}><label>Baumart</label>
                <input value={baumdaten.baumart} onChange={setBaum("baumart")} placeholder="z. B. Bergahorn" />
              </div>
              <div className="field-group" style={{ flex: 1 }}><label>Baumhöhe</label>
                <input value={baumdaten.hoehe} onChange={setBaum("hoehe")} placeholder="z. B. 18 m" />
              </div>
            </div>
            <div className="form-row mb12">
              <div className="field-group" style={{ flex: 1 }}><label>BHD (Brusthöhendurchmesser)</label>
                <input value={baumdaten.bhd} onChange={setBaum("bhd")} placeholder="z. B. 60 cm" />
              </div>
              <div className="field-group" style={{ flex: 1 }}><label>Stockdurchmesser</label>
                <input value={baumdaten.stock} onChange={setBaum("stock")} placeholder="z. B. 80 cm" />
              </div>
            </div>
            <div className="field-group mb12"><label>Baum</label>
              <div className="gbu-chips">
                {GBU_BAUM_HAENGER.map((h) => (
                  <button key={h} type="button" className={`gbu-chip ${baumdaten.haenger.includes(h) ? "gbu-chip-active" : ""}`}
                    onClick={() => toggleBaumList("haenger", h)}>{h}</button>
                ))}
              </div>
            </div>
            <div className="field-group mb12"><label>Baumumfeld (Zutreffendes antippen)</label>
              <div className="gbu-chips">
                {GBU_BAUM_UMFELD.map((h) => (
                  <button key={h} type="button" className={`gbu-chip ${baumdaten.umfeld.includes(h) ? "gbu-chip-active" : ""}`}
                    onClick={() => toggleBaumList("umfeld", h)}>{h}</button>
                ))}
              </div>
            </div>
            <div className="field-group mb12"><label>Stammfuß / Stamm (Zutreffendes antippen)</label>
              <div className="gbu-chips">
                {GBU_BAUM_STAMM.map((h) => (
                  <button key={h} type="button" className={`gbu-chip ${baumdaten.stamm.includes(h) ? "gbu-chip-active" : ""}`}
                    onClick={() => toggleBaumList("stamm", h)}>{h}</button>
                ))}
              </div>
            </div>
            <div className="field-group mb12"><label>Baumkrone (Zutreffendes antippen)</label>
              <div className="gbu-chips">
                {GBU_BAUM_KRONE.map((h) => (
                  <button key={h} type="button" className={`gbu-chip ${baumdaten.krone.includes(h) ? "gbu-chip-active" : ""}`}
                    onClick={() => toggleBaumList("krone", h)}>{h}</button>
                ))}
              </div>
            </div>
            <div className="form-row mb12">
              <div className="field-group" style={{ flex: 1 }}><label>Gewichtsverteilung der Krone</label>
                <div className="gbu-chips">
                  {GBU_KRONE_GEWICHT.map((g) => (
                    <button key={g} type="button" className={`gbu-chip ${baumdaten.gewicht === g ? "gbu-chip-active" : ""}`}
                      onClick={() => setBaumdaten((p) => ({ ...p, gewicht: p.gewicht === g ? "" : g }))}>{g}</button>
                  ))}
                </div>
              </div>
              <div className="field-group" style={{ flex: 1 }}><label>Krone</label>
                <div className="gbu-chips">
                  {GBU_KRONE_ZUSTAND.map((g) => (
                    <button key={g} type="button" className={`gbu-chip ${baumdaten.kronenzustand === g ? "gbu-chip-active" : ""}`}
                      onClick={() => setBaumdaten((p) => ({ ...p, kronenzustand: p.kronenzustand === g ? "" : g }))}>{g}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="field-group mb12"><label>Baum ist sicher für die geplanten Arbeiten *</label>
              <div className="gbu-chips">
                {GBU_BAUM_SICHER.map((s) => (
                  <button key={s} type="button" className={`gbu-chip ${baumdaten.sicher === s ? "gbu-chip-active" : ""}`}
                    onClick={() => setBaumdaten((p) => ({ ...p, sicher: s }))}>{s}</button>
                ))}
              </div>
            </div>
            {baumdaten.sicher && baumdaten.sicher !== "ja" && (
              <div className="gbu-warn mb12"><Icon name="warning" size={16} />
                {baumdaten.sicher === "nein"
                  ? "Baum nicht sicher: Die geplanten Arbeiten dürfen so nicht durchgeführt werden — Vorgehen anpassen und begründen."
                  : "Eingehende Untersuchung erforderlich, bevor die Arbeiten durchgeführt werden."}
              </div>
            )}
            <div className="field-group"><label>Bemerkung{baumdaten.sicher && baumdaten.sicher !== "ja" ? " *" : " (optional)"}</label>
              <input value={baumdaten.bemerkung} onChange={setBaum("bemerkung")} placeholder="z. B. Faulstelle am Stammfuß — Fällung nur mit Winde" />
            </div>
          </div>
        )}

        {blocks.map((b) => (
          <div className="form-section" key={b.id}>
            <div className="gbu-block-head">
              <div className="form-section-title" style={{ marginBottom: 0 }}>{b.label}</div>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => allOk(b)}>Alle OK</button>
            </div>
            {b.items.map((it) => {
              const key = `${b.id}:${it.id}`;
              const st = items[key] || {};
              return (
                <div className="gbu-item" key={key}>
                  <div className="gbu-item-label">{it.label}</div>
                  <GbuTriState value={st.status} onChange={(v) => setItem(key, { status: v })} />
                  {st.status === "mangel" && (
                    <div className="field-group" style={{ marginTop: 8 }}>
                      <select value={st.massnahme || ""} onChange={(e) => setItem(key, { massnahme: e.target.value })}>
                        <option value="">— Maßnahme wählen —</option>
                        {it.measures.map((m) => <option key={m}>{m}</option>)}
                      </select>
                      {st.massnahme === "Sonstige Maßnahme (Freitext)" && (
                        <input style={{ marginTop: 6 }} value={st.massnahmeText || ""} onChange={(e) => setItem(key, { massnahmeText: e.target.value })} placeholder="Maßnahme beschreiben…" />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {form.arbeitsart && (
          <div className="form-section">
            <div className="form-section-title">Angaben zu den Gefahren am Einsatzort</div>
            <div className="field-group mb12"><label>Stromleitungen — Entfernung</label>
              <input value={form.stromEntfernung} onChange={set("stromEntfernung")} placeholder="z. B. Freileitung in ca. 15 m — oder: keine" />
            </div>
            <div className="field-group mb12"><label>Kommunikation — Art der Kommunikation</label>
              <input value={form.kommunikationsart} onChange={set("kommunikationsart")} placeholder="z. B. Zuruf/Handzeichen, Funk" />
            </div>
            <div className="field-group"><label>Verkehrssicherung — Art der Verkehrssicherung</label>
              <input value={form.verkehrssicherungsart} onChange={set("verkehrssicherungsart")} placeholder="z. B. Halteverbot, Kegel + Warnbaken — oder: nicht erforderlich" />
            </div>
          </div>
        )}

        {form.arbeitsart && (
          <div className="form-section">
            <div className="form-section-title">Besonderheiten (optional)</div>
            <div className="field-group"><textarea value={form.besonderheiten} onChange={set("besonderheiten")} placeholder="Nur wenn nötig – z. B. örtliche Auffälligkeiten" /></div>
          </div>
        )}

        <div className="form-row" style={{ marginTop: 4 }}>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={goToSign} disabled={!form.arbeitsart}>Weiter zur Unterschrift</button>
        </div>
        </>)}

        {step === 2 && (<>
          <div className="form-section">
            <div className="form-section-title">{buildRecord().userName || "Durchführende(r)"} unterschreibt</div>
            <SignaturePad onChange={setSig1} initial={sig1} height={400} />
          </div>
          <div className="form-row" style={{ marginTop: 4 }}>
            <button className="btn btn-ghost" onClick={() => setStep(1)}>Zurück</button>
            <button className="btn btn-primary" style={{ flex: 1 }}
              onClick={() => { if (!sig1) { showToast("Bitte erst unterschreiben", "error"); return; } setStep(3); }}>
              Weiter
            </button>
          </div>
        </>)}

        {step === 3 && (<>
          <div className="form-section">
            <div className="form-section-title">{form.zugang === "skt" ? "Zweite Person (Rettung) – Pflicht" : "Zweite Person – optional"}</div>
            <div className="field-group mb12"><label>Name zweite Person</label>
              <input value={form.zweitePersonName} onChange={set("zweitePersonName")} placeholder="Vor- und Nachname" />
            </div>
            <SignaturePad onChange={setSig2} initial={sig2} height={400} />
          </div>
          <div className="form-row" style={{ marginTop: 4 }}>
            <button className="btn btn-ghost" onClick={() => setStep(2)} disabled={saving}>Zurück</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={save} disabled={saving}>
              {saving ? "Speichere…" : (form.zugang !== "skt" && !sig2) ? "Ohne 2. Unterschrift speichern" : "Speichern & ablegen"}
            </button>
          </div>
        </>)}
      </div>
    </div>
  );
}

// PDF-Seiten als Canvas rendern (pdfjs) — mobile Browser zeigen PDFs in
// iframes nicht an, sondern erzwingen den Download. Gleiches Muster wie die
// OCR-PDF-Verarbeitung (lazy import + Worker via ?url).
function PdfCanvasView({ url, maxPages = 20 }) {
  const holder = useRef(null);
  const [state, setState] = useState("lade");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        const buf = await (await fetch(url)).arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: buf }).promise;
        if (cancelled || !holder.current) return;
        holder.current.replaceChildren();
        const width = holder.current.clientWidth || 320;
        const n = Math.min(pdf.numPages, maxPages);
        for (let i = 1; i <= n; i++) {
          const page = await pdf.getPage(i);
          const vp1 = page.getViewport({ scale: 1 });
          const scale = (width / vp1.width) * Math.min(window.devicePixelRatio || 1, 2);
          const vp = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width; canvas.height = vp.height;
          canvas.style.cssText = "width:100%;display:block;margin-bottom:8px;background:#fff;border-radius:6px;";
          if (cancelled || !holder.current) return;
          holder.current.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
        }
        if (!cancelled) setState("ok");
      } catch (e) {
        console.warn("PDF-Vorschau fehlgeschlagen", e);
        if (!cancelled) setState("fehler");
      }
    })();
    return () => { cancelled = true; };
  }, [url]);
  return (
    <div style={{ overflowY: "auto", maxHeight: "68vh", borderRadius: 8 }}>
      {state === "lade" && <div className="loading"><div className="spinner" /> Rendere PDF…</div>}
      {state === "fehler" && <div style={{ padding: 12, fontSize: 13, color: "var(--text2)" }}>Vorschau nicht möglich — bitte „Herunterladen" nutzen.</div>}
      <div ref={holder} />
    </div>
  );
}

// ─── Einweisungen an Arbeitsmitteln ─────────────────────────────────────────
// Nachweis nach § 12 Abs. 1 BetrSichV: vor der ersten Benutzung, danach
// mindestens jaehrlich, mit Datum und Namen schriftlich. Die Eintraege liegen
// serverseitig in Nextcloud (Blattwerk/Arbeitsschutz/einweisungen.json), nicht
// auf dem Geraet — ein Nachweis, der mit dem Handy verschwindet, ist keiner.

const heuteIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Offene Fristen fuer das Dashboard-Abzeichen zwischenspeichern. */
const EW_STAND_KEY = "blattwerk_ew_stand";
const ewStandLesen = () => { try { return JSON.parse(localStorage.getItem(EW_STAND_KEY) || "{}") || {}; } catch { return {}; } };
const ewStandSchreiben = (s) => { try { localStorage.setItem(EW_STAND_KEY, JSON.stringify(s)); } catch (_) {} };
const ewOffenCount = () => Number(ewStandLesen().offen || 0);

// Dasselbe für die Betriebsmittel: die Zahl der Stücke, deren Frist läuft oder
// abgelaufen ist. Gleiches Muster wie oben — einmal am Tag gerechnet und
// lokal gemerkt, damit das Abzeichen auf der Startseite nicht bei jedem
// Antippen die Losliste nachlädt.
const BM_STAND_KEY = "blattwerk_bm_stand";
const bmStandLesen = () => { try { return JSON.parse(localStorage.getItem(BM_STAND_KEY) || "{}") || {}; } catch { return {}; } };
const bmStandSchreiben = (s) => { try { localStorage.setItem(BM_STAND_KEY, JSON.stringify(s)); } catch (_) {} };
const bmOffenCount = () => Number(bmStandLesen().offen || 0);

/** Personen aus Dolibarr in die Form bringen, die die Fristenrechnung braucht. */
const ewPersonen = (users) => (Array.isArray(users) ? users : [])
  .filter((u) => u && u.login && Number(u.statut ?? 1) !== 0)
  .map((u) => ({
    login: String(u.login),
    name: [u.firstname, u.lastname].filter(Boolean).join(" ").trim() || String(u.login),
  }));

// fg der Dringend-Stufen (ueberfaellig/offen/ungueltig) nimmt var(--danger)
// statt eines eigenen Hex-Werts: genau das war Befund 4c — hier stand
// #e03131 fest verdrahtet, während PL_AMPEL (weiter unten) für dieselben
// Stufen schon var(--danger) benutzte. Zwei Quellen für dieselbe Farbe laufen
// auseinander, sobald nur eine geändert wird; PL_AMPEL bezieht sich deshalb
// jetzt direkt auf diese Tabelle statt sie zu wiederholen.
const EW_STUFE_FARBE = {
  gueltig: { bg: "var(--k-moos-bg)", fg: "var(--k-moos)" },
  bald: { bg: "var(--k-ocker-bg)", fg: "var(--k-ocker)" },
  ueberfaellig: { bg: "var(--danger-soft)", fg: "var(--danger)" },
  offen: { bg: "var(--danger-soft)", fg: "var(--danger)" },
  fehlt: { bg: "var(--surface2)", fg: "var(--text2)" },
  ungueltig: { bg: "var(--danger-soft)", fg: "var(--danger)" },
};

function EwBadge({ stufe }) {
  const c = EW_STUFE_FARBE[stufe] || EW_STUFE_FARBE.fehlt;
  return (
    <span style={{
      background: c.bg, color: c.fg, borderRadius: 999, padding: "3px 9px",
      fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap",
    }}>{EW_STUFEN_TEXT[stufe] || stufe}</span>
  );
}

/** Formular fuer eine einzelne Einweisung. */
/**
 * Protokoll einer Einweisung — dreistufig wie die Vor-Ort-GBU: erst das
 * Formular, dann die beiden Unterschriften. Beide sind Pflicht; ein Protokoll
 * mit nur einer Unterschrift belegt nicht, WER eingewiesen hat.
 */
function EinweisungForm({ geraetId, person, personen, onClose, onSaved, showToast, nc, me }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [sigEingewiesen, setSigEingewiesen] = useState(null);
  const [sigEinweiser, setSigEinweiser] = useState(null);
  const [form, setForm] = useState({
    geraet: geraetId || EW_GERAETE[0].id,
    login: person?.login || "",
    datum: heuteIso(),
    einweiser: "",
    einweiserQualifikation: "",
    jugendlich: false,
    kopf: {},
    voraussetzungen: {},
    inhalte: {},
    praxis: {},
    bemerkung: "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const setTief = (bereich, id, wert) => setForm((f) => ({ ...f, [bereich]: { ...f[bereich], [id]: wert } }));

  const geraet = ewGeraet(form.geraet);
  const kopfFelder = ewKopfFelder(form.geraet);
  const vDefs = ewVoraussetzungen(form.geraet);
  const gewaehlt = personen.find((p) => p.login === form.login);
  const faellig = ewParse(form.datum) ? ewFaelligAm(form.datum, form.jugendlich) : null;
  const fehlt = ewFehlt(form);

  // Beim Gerätewechsel gehören Kopfdaten, Voraussetzungen und Inhalte zum
  // alten Gerät — stehen lassen hieße, Angaben eines anderen Geräts zu
  // unterschreiben.
  const geraetWechseln = (e) => {
    const id = e.target.value;
    setForm((f) => ({ ...f, geraet: id, kopf: {}, voraussetzungen: {}, inhalte: {} }));
  };

  const alleInhalte = () => {
    const alle = {};
    for (const i of geraet.inhalte) alle[i.id] = true;
    setForm((f) => ({ ...f, inhalte: alle }));
  };

  const weiter = () => {
    if (fehlt.length) { showToast(fehlt[0], "error"); return; }
    if (form.datum > heuteIso()) { showToast("Die Einweisung kann nicht in der Zukunft liegen", "error"); return; }
    setStep(2);
  };

  const speichern = async () => {
    if (!sigEingewiesen) { showToast("Unterschrift der eingewiesenen Person fehlt", "error"); return; }
    if (!sigEinweiser) { showToast("Unterschrift der einweisenden Person fehlt", "error"); return; }
    setSaving(true);
    try {
      const eintrag = {
        ...form,
        name: gewaehlt?.name || form.login,
        erfasstAm: new Date().toISOString(),
        erfasstVon: me?.login || "",
      };
      const dateiname = ewDateiname(eintrag);
      const pdfBase64 = await buildEinweisungPdf({ ...eintrag, sigEingewiesen, sigEinweiser });
      const r = await apiFetch("/api/nc/einweisungen/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          server: nc.server, user: nc.user, pass: nc.pass,
          eintrag, dateiname, pdfBase64,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || r.status);
      const teile = [`Gespeichert. Nächste Einweisung bis ${d.faellig}`];
      if (d.kalender?.ok) teile.push("Termin im Kalender");
      if (d.paperless?.ok) teile.push("in Paperless abgelegt");
      showToast(teile.join(" · ") + ".");
      onSaved();
    } catch (e) {
      showToast("Speichern fehlgeschlagen: " + (e?.message || e), "error");
    } finally { setSaving(false); }
  };

  const check = (an, aus, label, hinweis) => (
    <div className="gbu-item">
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5 }}>
        <input type="checkbox" checked={an} onChange={(e) => aus(e.target.checked)} />
        <span>{label}</span>
      </label>
      {hinweis}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal gbu-modal">
        <div className="modal-handle" />
        <div className="modal-title">
          {step === 1 ? "Einweisung an einem Arbeitsmittel"
            : step === 2 ? "Unterschrift: eingewiesene Person"
              : "Unterschrift: einweisende Person"}
        </div>

        {step === 1 && (<>
          <div className="form-group">
            <label>Arbeitsmittel</label>
            <select value={form.geraet} onChange={geraetWechseln}>
              {EW_GERAETE.map((g) => <option key={g.id} value={g.id}>{g.nr}. {g.label}</option>)}
            </select>
          </div>

          <div className="section-label">Angaben zum Arbeitsmittel</div>
          {kopfFelder.map((f) => (
            <div key={f.id} className={f.typ === "bool" ? "" : "form-group"}>
              {f.typ === "bool"
                ? check(form.kopf[f.id] === true, (v) => setTief("kopf", f.id, v),
                  <>{f.label}{f.pflicht && <span style={{ color: "var(--danger)" }}> *</span>}</>)
                : (<>
                  <label>{f.label}{f.pflicht && <span style={{ color: "var(--danger)" }}> *</span>}</label>
                  <input type={f.typ === "datum" ? "date" : "text"} value={form.kopf[f.id] || ""}
                    onChange={(e) => setTief("kopf", f.id, e.target.value)} />
                </>)}
            </div>
          ))}

          <div className="section-label">Personen und Datum</div>
          <div className="form-group">
            <label>Eingewiesene Person</label>
            <select value={form.login} onChange={set("login")}>
              <option value="">— wählen —</option>
              {personen.map((p) => <option key={p.login} value={p.login}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Eingewiesen durch</label>
              <input value={form.einweiser} onChange={set("einweiser")} placeholder="Name" />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>deren Qualifikation</label>
              <input value={form.einweiserQualifikation} onChange={set("einweiserQualifikation")} placeholder="z. B. European Treeworker" />
            </div>
          </div>
          <div className="form-group">
            <label>Datum der Einweisung</label>
            <input type="date" value={form.datum} max={heuteIso()} onChange={set("datum")} />
          </div>
          {check(form.jugendlich, (v) => setForm((f) => ({ ...f, jugendlich: v })),
            "Person ist unter 18 — Wiederholung dann halbjährlich (§ 29 Abs. 2 JArbSchG)")}

          {vDefs.length > 0 && (<>
            <div className="section-label">Voraussetzungen, ohne die nicht eingewiesen wird</div>
            <div className="gbu-warn" style={{ marginBottom: 10 }}>
              <Icon name="shield" size={16} />
              <span>Eine Einweisung ersetzt keinen Lehrgang. Fehlt hier etwas, bleibt das Gerät für diese Person gesperrt.</span>
            </div>
            {vDefs.map((d) => {
              const w = form.voraussetzungen[d.id] || {};
              return (
                <div key={d.id} className="gbu-item">
                  <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5 }}>
                    <input type="checkbox" checked={w.erfuellt === true}
                      onChange={(e) => setTief("voraussetzungen", d.id, { ...w, erfuellt: e.target.checked })} />
                    <span>{d.text}</span>
                  </label>
                  {w.erfuellt === true && d.felder.map((f) => (
                    <div className="form-group" key={f.key} style={{ marginTop: 8 }}>
                      <label>{f.label}</label>
                      <input type={f.typ === "datum" ? "date" : "text"} value={w[f.key] || ""}
                        onChange={(e) => setTief("voraussetzungen", d.id, { ...w, [f.key]: e.target.value })} />
                    </div>
                  ))}
                </div>
              );
            })}
          </>)}

          <div className="gbu-block-head" style={{ marginTop: 14 }}>
            <div className="section-label" style={{ margin: 0 }}>
              Inhalte der Einweisung ({geraet.inhalte.filter((i) => form.inhalte[i.id]).length}/{geraet.inhalte.length})
            </div>
            <button type="button" className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }} onClick={alleInhalte}>
              Alle bestätigen
            </button>
          </div>
          {geraet.inhalte.map((i) => check(form.inhalte[i.id] === true, (v) => setTief("inhalte", i.id, v), i.label))}

          <div className="section-label">Praktischer Teil</div>
          {EINWEISUNG_PRAXIS.map((p) => check(form.praxis[p.id] === true, (v) => setTief("praxis", p.id, v), p.label))}

          <div className="form-group" style={{ marginTop: 12 }}>
            <label>Bemerkung (freiwillig)</label>
            <textarea rows={2} value={form.bemerkung} onChange={set("bemerkung")} />
          </div>

          {faellig && (
            <div style={{ fontSize: 12.5, color: "var(--text2)", marginBottom: 10 }}>
              Wiederholung spätestens am <b>{faellig}</b>. Der Termin wird im Team-Kalender eingetragen.
            </div>
          )}
          {fehlt.length > 0 && (
            <div className="gbu-warn" style={{ marginBottom: 10 }}>
              <Icon name="shield" size={16} />
              <span>Noch offen: {fehlt.slice(0, 3).join(" · ")}{fehlt.length > 3 ? ` (+${fehlt.length - 3})` : ""}</span>
            </div>
          )}

          <div className="form-row">
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Abbrechen</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={weiter} disabled={fehlt.length > 0}>Weiter</button>
          </div>
        </>)}

        {step === 2 && (<>
          <p style={{ fontSize: 12.5, color: "var(--text2)", margin: "0 0 8px" }}>{EINWEISUNG_BESTAETIGUNG}</p>
          <SignaturePad onChange={setSigEingewiesen} initial={sigEingewiesen} height={400} />
          <div className="form-row" style={{ marginTop: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setStep(1)}>Zurück</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => (sigEingewiesen ? setStep(3) : showToast("Bitte unterschreiben", "error"))}>Weiter</button>
          </div>
        </>)}

        {step === 3 && (<>
          <p style={{ fontSize: 12.5, color: "var(--text2)", margin: "0 0 8px" }}>
            {form.einweiser || "Einweisende Person"}{form.einweiserQualifikation ? ` · ${form.einweiserQualifikation}` : ""}
          </p>
          <SignaturePad onChange={setSigEinweiser} initial={sigEinweiser} height={400} />
          <div className="form-row" style={{ marginTop: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setStep(2)} disabled={saving}>Zurück</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={speichern} disabled={saving}>
              {saving ? "Speichere…" : "Protokoll speichern"}
            </button>
          </div>
        </>)}
      </div>
    </div>
  );
}

/** Uebersicht „wer ist woran eingewiesen" — je Person die 16 Arbeitsmittel. */
function EinweisungenTab({ api, me, showToast, nc, ncOk }) {
  const [store, setStore] = useState(null);
  const [laden, setLaden] = useState(false);
  const [personen, setPersonen] = useState([]);
  const [wer, setWer] = useState("");
  const [nurOffene, setNurOffene] = useState(false);
  const [form, setForm] = useState(null); // { geraetId }
  const heute = heuteIso();

  const laden_ = useCallback(() => {
    if (!ncOk) return;
    setLaden(true);
    apiFetch("/api/nc/einweisungen", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server: nc.server, user: nc.user, pass: nc.pass }),
    })
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status); return r.json(); })
      .then(setStore)
      .catch((e) => showToast("Einweisungen laden fehlgeschlagen: " + (e?.message || e), "error"))
      .finally(() => setLaden(false));
  }, [ncOk, nc.server, nc.user, nc.pass]);
  useEffect(() => { laden_(); }, [laden_]);

  // Personenliste: bevorzugt aus Dolibarr. `GET /users` haengt dort aber an
  // `user->user->lire` — wer das Recht nicht hat (im Betrieb betrifft das
  // Partner), bekaeme eine leere Liste und damit eine Seite ohne jede Zeile.
  // Deshalb immer mindestens die eigene Person, ergaenzt um alle, die schon
  // einen Nachweis haben. Lieber die halbe Liste als gar keine.
  useEffect(() => {
    const ausStore = (Array.isArray(store?.eintraege) ? store.eintraege : [])
      .map((e) => ({ login: e.login, name: e.name || e.login }));
    const selbst = me?.login
      ? [{ login: me.login, name: [me.firstname, me.lastname].filter(Boolean).join(" ").trim() || me.login }]
      : [];
    const vereinen = (...listen) => {
      const m = new Map();
      for (const p of listen.flat()) if (p && p.login && !m.has(p.login)) m.set(p.login, p);
      return [...m.values()];
    };
    api.getUsers()
      .then((u) => setPersonen(vereinen(ewPersonen(u), selbst, ausStore)))
      .catch(() => setPersonen(vereinen(selbst, ausStore)));
  }, [me?.login, store]);

  // Vorauswahl: die eigene Person, sonst die erste.
  useEffect(() => {
    if (wer || !personen.length) return;
    setWer(personen.find((p) => p.login === me?.login)?.login || personen[0].login);
  }, [personen, me?.login]);

  const eintraege = store?.eintraege || [];
  const person = personen.find((p) => p.login === wer) || null;

  const zeilen = EW_GERAETE.map((g) => {
    const letzte = ewLetzte(eintraege, g.id, wer);
    return { geraet: g, letzte, st: ewStatus(letzte, heute) };
  });
  const sichtbar = nurOffene ? zeilen.filter((z) => ewGesperrt(z.st.stufe) || z.st.stufe === "bald") : zeilen;
  const zahl = (stufe) => zeilen.filter((z) => z.st.stufe === stufe).length;

  // Abzeichen fuer das Dashboard aktuell halten (ueber alle Personen, nicht nur
  // die angezeigte) — sonst erinnert die Kachel nur an die eigene Lage.
  useEffect(() => {
    if (!store || !personen.length) return;
    let offen = 0;
    for (const p of personen) {
      for (const g of EW_GERAETE) {
        const st = ewStatus(ewLetzte(eintraege, g.id, p.login), heute).stufe;
        if (st === "ueberfaellig" || st === "bald" || st === "offen") offen++;
      }
    }
    ewStandSchreiben({ offen, stand: heute });
  }, [store, personen]);

  if (!ncOk) {
    return <div className="empty-state"><Icon name="shield" size={40} /><p>Kein Nextcloud-Zugang — Einweisungen können nicht geladen werden.</p></div>;
  }

  return (
    <>
      <div className="section-label">Person</div>
      <div className="gbu-chips mb12">
        {personen.map((p) => (
          <button key={p.login} type="button" className={`gbu-chip ${wer === p.login ? "gbu-chip-active" : ""}`}
            onClick={() => setWer(p.login)}>{p.name}</button>
        ))}
        {!personen.length && <div style={{ fontSize: 13, color: "var(--text2)" }}>Keine Benutzer aus Dolibarr geladen.</div>}
      </div>

      <div className="section-label">
        Arbeitsmittel{laden ? " · lädt…" : ""}
        {store && ` · ${zahl("gueltig")} gültig, ${zahl("ueberfaellig") + zahl("offen")} gesperrt, ${zahl("fehlt")} ohne Einweisung`}
      </div>

      <div className="form-row mb12" style={{ gap: 8 }}>
        <button className={`gbu-chip ${nurOffene ? "gbu-chip-active" : ""}`} onClick={() => setNurOffene((v) => !v)}>
          Nur was offen ist
        </button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setForm({ geraetId: EW_GERAETE[0].id })}>
          <Icon name="plus" size={16} /> Einweisung eintragen
        </button>
      </div>

      {sichtbar.map(({ geraet, letzte, st }) => (
        <div key={geraet.id} className="list-item" style={{ display: "block" }} onClick={() => setForm({ geraetId: geraet.id })}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{geraet.label}</div>
            <EwBadge stufe={st.stufe} />
          </div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            {st.stufe === "fehlt"
              ? "Darf von dieser Person nicht benutzt werden"
              : st.stufe === "offen"
                ? `Eingewiesen am ${letzte.datum} — Voraussetzung nicht belegt (Lehrgang, Beauftragung, G 41)`
                : st.stufe === "ungueltig"
                  ? `Eintrag vom ${letzte.datum} — Datum unbrauchbar, bitte neu eintragen`
                  : `Eingewiesen am ${letzte.datum}${letzte.einweiser ? ` durch ${letzte.einweiser}` : ""} · nächste bis ${st.faellig}`}
            {st.stufe === "bald" && ` (in ${st.tage} Tag(en))`}
            {st.stufe === "ueberfaellig" && ` (seit ${-st.tage} Tag(en) fällig)`}
          </div>
        </div>
      ))}
      {!sichtbar.length && !laden && (
        <div className="empty-state"><Icon name="shield" size={40} /><p>Nichts offen für {person?.name || "diese Person"}.</p></div>
      )}

      {form && (
        <EinweisungForm
          geraetId={form.geraetId} person={person} personen={personen} nc={nc} showToast={showToast} me={me}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); laden_(); }}
        />
      )}
    </>
  );
}

function GbuPage({ api, me, showToast, onBack, autoNew }) {
  const mandant = useMandant();
  const funktion = useFunktion();
  // „Vor Ort" bleibt der Einstieg: das ist der arbeitstaegliche Weg. Die
  // Grundlagen und die Einweisungen sind Nachschlagewerk, kein Formular.
  const [tab, setTab] = useState("vorort");
  const [showForm, setShowForm] = useState(!!autoNew);
  const [refresh, setRefresh] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [pdfSchluessel, setPdfSchluessel] = useState([]); // Ids/Schluessel mit lokalem PDF
  const [viewer, setViewer] = useState(null); // { name, loading, url? }
  const [uebernehmenLaeuft, setUebernehmenLaeuft] = useState(false);
  const dateiRef = useRef(null);
  const viewerUrlRef = useRef(null);
  const queue = loadGbuQueue();
  const log = loadGbuLog();
  const empfangen = loadGbuEmpfangen();
  const nc = loadNcConfig();
  const ncOk = ncHasAccess(nc);
  // Nur beim Zeitpunkt des Renderns gelesen (wie an den anderen Stellen der
  // App, die navigator.onLine abfragen) — der online/offline-Effekt unten
  // erzwingt bei einer Änderung ein neues Rendern über `refresh`.
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  // Personal und die zweite Pflichtunterlage sind eigene Funktionen
  // unterhalb von "gbu" - ihr Chip verschwindet, wenn sie abgeschaltet sind.
  // Faellt der gerade offene Reiter dabei weg (Konfigurationswechsel bei
  // offener Seite), geht es auf den ersten noch sichtbaren Chip zurueck,
  // statt einen nicht mehr anwaehlbaren Reiter offen zu lassen.
  const gbuChips = [["vorort", "Vor Ort"], ["grundlagen", "Grundlagen"], ["einweisungen", "Einweisungen"], ["personal", "Personal"], ["betriebsanweisung", "Betriebsanweisung"]]
    .filter(([id]) => (id !== "personal" || funktion("qualifikationen")) && (id !== "betriebsanweisung" || funktion("betriebsanweisungen")) && (id !== "einweisungen" || funktion("betriebsmittel")));
  useEffect(() => {
    if (!gbuChips.some(([id]) => id === tab) && gbuChips[0]) setTab(gbuChips[0][0]);
  }, [tab, mandant]);

  const retry = async () => {
    setRetrying(true);
    // Ungeladener Mandant sperrt nichts — dieselbe Regel wie useBlock/useFunktion.
    if (!mandant || funktionAktiv(mandant, "gbu")) await processGbuQueue(api, showToast, mandantBetrieb(mandant));
    setRetrying(false); setRefresh((r) => r + 1);
  };
  useEffect(() => { if (queue.length && navigator.onLine) retry(); }, []); // beim Öffnen nachholen
  useEffect(() => {
    const auf = () => setRefresh((r) => r + 1);
    window.addEventListener("online", auf); window.addEventListener("offline", auf);
    return () => { window.removeEventListener("online", auf); window.removeEventListener("offline", auf); };
  }, []);
  // Welche Beurteilungen liegen als PDF auf diesem Gerät? EIN idbSchluessel-
  // Aufruf statt eines idbHolen je Listenzeile.
  useEffect(() => {
    let aktiv = true;
    idbSchluessel(GBU_PDF_DB, GBU_PDF_SPEICHER).then((s) => { if (aktiv) setPdfSchluessel(s); }).catch(() => {});
    return () => { aktiv = false; };
  }, [refresh]);
  useEffect(() => () => { if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current); }, []);

  const fmtEntry = (r) => {
    const d = new Date(r.createdAt);
    return `${d.toLocaleDateString("de-DE")} ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} · ${r.kunde?.name || r.projekt?.ref || "ohne Kunde"} · ${gbuArbeitsart(r.arbeitsart)?.label || r.arbeitsart}${r.zugang ? ` (${gbuZugang(r.zugang)?.label})` : ""}`;
  };
  const fmtEmpfangen = (r) => `${r.datum ? new Date(r.datum).toLocaleDateString("de-DE") : "ohne Datum"} · ${r.titel || "Beurteilung"}`;

  const schliessenLokal = () => {
    if (viewerUrlRef.current) { URL.revokeObjectURL(viewerUrlRef.current); viewerUrlRef.current = null; }
    setViewer(null);
  };
  const oeffnenLokal = async (schluessel, titel) => {
    setViewer({ name: titel, loading: true });
    try {
      const blob = await idbHolen(GBU_PDF_DB, GBU_PDF_SPEICHER, schluessel);
      if (!blob) { setViewer(null); showToast("Kein lokales PDF — dieses Gerät hat keins gespeichert.", "error"); return; }
      const url = URL.createObjectURL(blob);
      if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
      viewerUrlRef.current = url;
      setViewer({ url, name: titel });
    } catch (e) { setViewer(null); showToast("PDF öffnen fehlgeschlagen: " + (e?.message || e), "error"); }
  };
  const teilenLokal = async (schluessel, dateiname) => {
    const blob = await idbHolen(GBU_PDF_DB, GBU_PDF_SPEICHER, schluessel);
    if (!blob) { showToast("Kein lokales PDF zum Weitergeben.", "error"); return; }
    await gbuTeilenOderSpeichern(blob, dateiname, showToast);
  };

  // Optionaler Empfangsweg (kein Netz noetig): eine von Kolleg:innen per
  // Bluetooth/Nearby Share erhaltene PDF-Datei als lokalen Eintrag ablegen,
  // ohne erneuten Upload.
  const dateiUebernehmen = async (ev) => {
    const datei = ev.target.files?.[0];
    ev.target.value = "";
    if (!datei) return;
    setUebernehmenLaeuft(true);
    try {
      const id = `gbu-empf-${Date.now()}-uebernommen`;
      await idbSetzen(GBU_PDF_DB, GBU_PDF_SPEICHER, id, datei);
      pushGbuEmpfangen({ id, titel: datei.name.replace(/\.pdf$/i, ""), datum: new Date().toISOString().slice(0, 10), empfangenAm: new Date().toISOString() });
      await gbuPdfAufraeumen();
      showToast("Übernommen — steht jetzt in der Liste.");
      setRefresh((r) => r + 1);
    } catch (e) { showToast("Übernehmen fehlgeschlagen: " + (e?.message || e), "error"); }
    finally { setUebernehmenLaeuft(false); }
  };

  // Archiv nur zeigen, wenn es auch erreichbar sein KANN — ohne Netz zeigt
  // PaperlessDocs sonst nur "Archiv nicht erreichbar" statt der lokal
  // vorhandenen Beurteilungen, die es tatsächlich gibt (VSG 4.2/SVLFG B09:
  // die Beurteilung muss VOR ORT einsehbar sein, nicht erst mit Empfang).
  const zeigeArchiv = !!me?.canViewAllGbu && online;

  return (
    <div className="main" key={refresh}>
      <div className="page-header">
        <div className="back-btn" onClick={onBack}><Icon name="back" size={20} /></div>
        <h2>Arbeitsschutz</h2>
      </div>

      <div className="gbu-chips mb12">
        {gbuChips.map(([id, label]) => (
          <button key={id} type="button" className={`gbu-chip ${tab === id ? "gbu-chip-active" : ""}`}
            onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === "einweisungen" && (
        <EinweisungenTab api={api} me={me} showToast={showToast} nc={nc} ncOk={ncOk} />
      )}

      {tab === "personal" && (
        <QualifikationenTab api={api} me={me} showToast={showToast} nc={nc} ncOk={ncOk} />
      )}

      {tab === "betriebsanweisung" && (
        <BetriebsanweisungTab api={api} me={me} showToast={showToast} nc={nc} ncOk={ncOk} />
      )}

      {/* Bewusst ohne Rechteprüfung: eine Grundbeurteilung, die nur die Geschäftsführung sehen darf, verfehlt ihren Zweck.
          Befund 3: /api/nc/einweisungen/save legt jedes Einweisungsprotokoll zusätzlich zu Thema/Arbeitsschutz mit
          Thema/Unterweisung ab. Ohne Ausschluss zeigte diese ungegatete Liste jedes unterschriebene Protokoll aller
          Kolleg:innen. Der Ausschluss steht serverseitig in /api/pl/list (fest an thema=Arbeitsschutz gekoppelt, nicht
          hier als Prop) — sonst könnte ihn ein Aufruf direkt gegen den Endpunkt einfach weglassen. */}
      {tab === "grundlagen" && (
        <PaperlessDocs thema={PL_THEMA.arbeitsschutz} titel="Grundsätzliche Unterlagen"
          hinweis='Die tätigkeitsbezogene Grundbeurteilung nach § 5 ArbSchG. Sie gilt dauerhaft — die Beurteilung der einzelnen Arbeitsstelle ersetzt sie nicht. Eigene Einweisungsprotokolle stehen im Reiter „Einweisungen".'
          eingebettet showToast={showToast} />
      )}

      {tab === "vorort" && (<>
      <div className="action-row">
        <button className="btn btn-primary" onClick={() => setShowForm(true)}><Icon name="plus" size={16} /> Neue Beurteilung</button>
      </div>

      {queue.length > 0 && (
        <>
          <div className="section-label">Ausstehende Uploads ({queue.length})</div>
          {queue.map((r) => (
            <div key={r.id} className="list-item" style={{ display: "block" }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{fmtEntry(r)}</div>
              <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 4 }}>{r.lastError || "Wartet auf Verbindung…"}</div>
            </div>
          ))}
          <div className="action-row">
            <button className="btn btn-ghost" onClick={retry} disabled={retrying}>{retrying ? "Versuche…" : "Jetzt erneut hochladen"}</button>
          </div>
        </>
      )}

      {/* canViewAllGbu wie zuvor bei der Nextcloud-Liste (Befund W1): nur die
          Geschäftsführung sieht alle Beurteilungen. PaperlessDocs kennt selbst
          kein Rechte-Gate, darum das Gate hier — unverändert übernommen, nicht
          neu erfunden. Alle anderen sehen nur ihr eigenes Geräte-Log. */}
      {zeigeArchiv ? (
        <PaperlessDocs thema={PL_THEMA.gbu} titel="Alle Beurteilungen" eingebettet showToast={showToast} />
      ) : (
        <>
          {me?.canViewAllGbu && (
            <div className="hint mb12">Offline — zeige die auf diesem Gerät gespeicherten Beurteilungen statt des Archivs.</div>
          )}
          <div className="section-label">{log.length ? `Letzte Beurteilungen von diesem Gerät (${log.length})` : "Noch keine Beurteilungen"}</div>
          {log.map((r) => {
            const hatPdf = pdfSchluessel.includes(r.id);
            return (
              <div key={r.id} className="list-item" style={{ display: "block" }}>
                <div style={{ fontWeight: 600, fontSize: 14, cursor: hatPdf ? "pointer" : "default" }}
                  onClick={() => hatPdf && oeffnenLokal(r.id, fmtEntry(r))}>
                  {fmtEntry(r)}{hatPdf && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--accent)" }}>· auf diesem Gerät</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span>
                    {/* uploadedPl ?? uploadedNc: ältere Warteschlangen-Einträge tragen noch das alte Feld. */}
                    {r.uploadedDolibarr === true ? "Projekt ✓" : "ohne Projekt"} · {(r.uploadedPl ?? r.uploadedNc) === true ? "Archiv ✓" : "Archiv übersprungen"}
                  </span>
                  {hatPdf && (
                    <button type="button" className="btn btn-secondary btn-xs" onClick={() => teilenLokal(r.id, buildGbuFilename(r.createdAt, r.kunde?.name || r.projekt?.ref || "", r.arbeitsart))}>
                      <Icon name="upload" size={12} /> Weitergeben
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Von Kollegen erhaltene Beurteilungen — automatisch (mit Netz,
              /api/nc/gbu/meine) oder manuell per Datei (ohne Netz). Eigene
              Liste, nicht Teil des Geräte-Logs (siehe loadGbuEmpfangen). */}
          <div className="section-label" style={{ marginTop: 16 }}>{empfangen.length ? `Von Kollegen empfangen (${empfangen.length})` : "Noch nichts von Kollegen empfangen"}</div>
          {empfangen.map((r) => {
            const hatPdf = pdfSchluessel.includes(r.id);
            return (
              <div key={r.id} className="list-item" style={{ display: "block" }}>
                <div style={{ fontWeight: 600, fontSize: 14, cursor: hatPdf ? "pointer" : "default" }}
                  onClick={() => hatPdf && oeffnenLokal(r.id, fmtEmpfangen(r))}>
                  {fmtEmpfangen(r)}
                </div>
                {hatPdf && (
                  <div style={{ marginTop: 4, textAlign: "right" }}>
                    <button type="button" className="btn btn-secondary btn-xs" onClick={() => teilenLokal(r.id, `${r.titel || "Beurteilung"}.pdf`)}>
                      <Icon name="upload" size={12} /> Weitergeben
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <div className="action-row">
            <button type="button" className="btn btn-ghost" disabled={uebernehmenLaeuft} onClick={() => dateiRef.current?.click()}>
              {uebernehmenLaeuft ? "Übernehme…" : "Beurteilung von Kollegen übernehmen"}
            </button>
          </div>
          <input ref={dateiRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={dateiUebernehmen} />
        </>
      )}
      </>)}

      {viewer && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && schliessenLokal()}>
          <div className="modal" style={{ maxWidth: "95vw", width: "95vw", height: "90vh", display: "flex", flexDirection: "column" }}>
            <div className="modal-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 15 }}>{viewer.name}</span>
              <button className="btn btn-secondary btn-xs" onClick={schliessenLokal}>Schließen</button>
            </div>
            {viewer.loading
              ? <div className="loading"><div className="spinner" /> Lade Dokument…</div>
              : <div style={{ flex: 1, overflowY: "auto" }}><PdfCanvasView url={viewer.url} maxPages={30} /></div>}
          </div>
        </div>
      )}

      {showForm && (
        <GbuFormSkt
          api={api} me={me} showToast={showToast}
          onClose={() => { setShowForm(false); if (autoNew && !queue.length && !log.length) onBack(); }}
          onSaved={() => { setShowForm(false); setRefresh((r) => r + 1); }}
        />
      )}
    </div>
  );
}

// ─── App-Einführung (wie SPD Maps): beim ersten Start nach dem Login ─────────
const TUTORIAL_STEPS = [
  {
    icon: "🌳",
    title: "Willkommen in der Blattwerk-App",
    text: "Gefährdungsbeurteilung, Belege, Bestellungen, Spesen, Zeit und Kalender — alles in einer App. Es folgen vier kurze Übungen — nichts davon wird wirklich angelegt.",
  },
  {
    icon: "🛡️",
    title: "Gefährdungsbeurteilung",
    text: "Vor jedem Arbeitsbeginn: Start → Gefährdungsbeurteilung. Antippen, unterschreiben, fertig — die App führt dich durch und legt das PDF automatisch ab. Geht auch ohne Empfang.",
  },
  {
    // Steht als eigene Karte da, weil beides sonst niemand von allein herausfindet:
    // dass die Pause ein Stopp ist, und dass man seine eigenen Zeiten nachlesen
    // kann. Das Nachlesen ist der Punkt — wer seine erfassten Zeiten nie sieht,
    // kann eine falsche Buchung auch nicht bemerken.
    icon: "⏱",
    title: "Zeit erfassen",
    text: "Timer starten, wenn du anfängst, stoppen, wenn du fertig bist. Für die Pause ebenfalls stoppen und danach neu starten — die Uhr läuft sonst durch. Vergessen? „Manuell“ trägt es nach, bis zum Vormonat zurück. Unter „Meine Zeiten“ siehst du jederzeit deinen Monat; wenn dort etwas nicht stimmt, sag Bescheid.",
  },
  {
    icon: "🔄",
    title: "Ein Tipp noch",
    text: "Wenn mal etwas fehlt: App komplett schließen und neu öffnen. Diese Einführung gibt's jederzeit wieder unter Profil.",
  },
];

// Zweiteiler: erst die kurzen Erklärkarten, danach die vier Übungen
// (TutorialUebungen, aus src/tutorial/Tutorial.jsx — bewusst ohne jeden
// Zugriff nach draußen, siehe dortiger Kommentar). `pflicht` reicht bis in
// beide Teile durch: nur wenn er false ist, gibt es „Später".
/**
 * Fehlergrenze um das Tutorial — die einzige in dieser App, und nur hier, weil
 * nur hier ein Renderfehler jemanden einsperrt: der Sperr-Modus deckt alles ab
 * und laesst sich nicht wegklicken. Stuerzt eine Uebungsmaske ab, bliebe sonst
 * ein schwarzer Bildschirm ohne einen einzigen Knopf. React faengt uebrigens
 * nur Renderfehler ab, keine aus Klick-Behandlern — fuer die ist das
 * "Abmelden" in der Uebung selbst der Ausweg.
 */
class TutorialFehlergrenze extends Component {
  constructor(props) { super(props); this.state = { fehler: null }; }
  static getDerivedStateFromError(fehler) { return { fehler }; }
  render() {
    if (!this.state.fehler) return this.props.children;
    return (
      <div className="tutorial-backdrop">
        <div className="tutorial-card">
          <div className="tutorial-icon">🧯</div>
          <h2>Da ist etwas schiefgegangen</h2>
          <p>Die Übung lässt sich gerade nicht anzeigen. Fang sie noch einmal von vorn an — oder melde dich ab und sag Bescheid, was du zuletzt gemacht hast.</p>
          <div className="tutorial-buttons">
            <button className="btn btn-ghost" onClick={this.props.onAbmelden}>Abmelden</button>
            <button className="btn btn-primary" style={{ marginLeft: "auto" }}
              onClick={() => { this.props.onNeustart(); this.setState({ fehler: null }); }}>
              Noch einmal von vorn
            </button>
          </div>
        </div>
      </div>
    );
  }
}

function AppTutorial({ heute, name, login, pflicht, onDone, onSpaeter, onAbmelden }) {
  const [i, setI] = useState(0);
  const [uebung, setUebung] = useState(false);
  const [codeOffen, setCodeOffen] = useState(false);
  const [code, setCode] = useState("");
  const [codeFalsch, setCodeFalsch] = useState(false);
  if (uebung) {
    return <TutorialUebungen heute={heute} name={name} login={login} pflicht={pflicht}
      onFertig={onDone} onSpaeter={onSpaeter} onAbmelden={onAbmelden} />;
  }
  const last = i === TUTORIAL_STEPS.length - 1;
  const step = TUTORIAL_STEPS[i];
  return (
    <div className="tutorial-backdrop">
      <div className="tutorial-card">
        {/* Im Pflicht-Modus fuehrt der Ausgang aus der App heraus, nicht an der
            Uebung vorbei — sonst gaebe es hier gar keinen. */}
        {pflicht
          ? <button className="tutorial-skip" onClick={onAbmelden}>Abmelden</button>
          : <button className="tutorial-skip" onClick={onSpaeter}>Später</button>}
        <div className="tutorial-icon">{step.icon}</div>
        <h2>{step.title}</h2>
        <p>{step.text}</p>
        <div className="tutorial-dots">
          {TUTORIAL_STEPS.map((_, idx) => (
            <span key={idx} className={"tutorial-dot" + (idx === i ? " active" : "")} />
          ))}
        </div>
        <div className="tutorial-buttons">
          {i > 0 && <button className="btn btn-ghost" onClick={() => setI(i - 1)}>Zurück</button>}
          <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => (last ? setUebung(true) : setI(i + 1))}>
            {last ? "Zu den Übungen" : "Weiter"}
          </button>
        </div>
        {/* Überspringen mit Code. Steht unter den Knöpfen und nicht daneben:
            der Weg durch die Übung soll der offensichtliche bleiben. */}
        {codeOffen ? (
          <div className="tutorial-code">
            {/* inputMode="numeric" aus demselben Grund wie bei den Uhrzeiten:
                sonst kommt auf dem Tablet keine Tastatur. */}
            <input
              type="text" inputMode="numeric" autoComplete="off" autoFocus
              placeholder="Code" maxLength={12}
              value={code}
              onChange={(e) => { setCode(e.target.value); setCodeFalsch(false); }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                if (tutorialCodeStimmt(code)) onDone({ uebersprungen: true });
                else setCodeFalsch(true);
              }}
            />
            <button className="btn btn-ghost" onClick={() => {
              if (tutorialCodeStimmt(code)) onDone({ uebersprungen: true });
              else setCodeFalsch(true);
            }}>Weiter</button>
          </div>
        ) : (
          <button className="tutorial-code-link" onClick={() => setCodeOffen(true)}>Ich habe einen Code</button>
        )}
        {codeFalsch && <p className="tutorial-code-fehler">Der Code stimmt nicht.</p>}
      </div>
    </div>
  );
}

// ─── Mandant (Mandantenfaehigkeit) ─────────────────────────────────────────
// Ohne Konfiguration (kein /data/mandant.json) liefert der Server bereits
// "alles an" (siehe mandant.js), block() faellt hier zusaetzlich auf "an"
// zurueck, solange noch gar keine Antwort da ist — sonst waere die App beim
// allerersten Rendern (vor dem ersten mandantHolen()) leer.
const MandantContext = createContext(null);
const useMandant = () => useContext(MandantContext);
const useBlock = () => {
  const m = useMandant();
  return (name) => (m?.bloecke ? m.bloecke[name] === true : true);
};
// Funktionen (src/funktionen.js) — der Server liefert sie aufgeloest
// (Block + Schalter + Kaskade), hier wird nur gelesen. Vor der ersten Antwort
// "an", aus demselben Grund wie bei useBlock.
const useFunktion = () => {
  const m = useMandant();
  return (key) => (m?.funktionen ? m.funktionen[key] === true : true);
};
// Betriebsdaten fuer die Nachweise (GBU-Kopfzeile, Ueberlassungsvereinbarung)
// liegen seit 18.09.2026 in src/betrieb.js — dort sind sie importierbar und
// damit im Verhalten pruefbar, statt nur per Quelltextmuster.
// tab -> noetiger Block und noetige Funktion. Deckt die echten `tab`-Werte
// aus dem Render-Schalter in App ab, nicht generische Namen.
const erlaubterTab = (tab, block, funktion = () => true) => {
  const bedarf = {
    geschaeft: "erp", invoices: "erp", proposals: "erp", supplierinvoices: "erp",
    customers: "erp", partners: "erp", suppliers: "erp", projects: "erp",
    time: "erp", expenses: "erp", orders: "erp", lager: "erp",
    kalender: "kalender", fahrtenbuch: "fahrtenbuch", chat: "chat", telefon: "telefon",
    gbu: "arbeitsschutz", betriebsmittel: "arbeitsschutz", baumkataster: "erp",
  };
  const funktionBedarf = {
    time: "zeiterfassung", expenses: "spesen", orders: "bestellungen", proposals: "angebote",
    invoices: "rechnungen", projects: "projekte", supplierinvoices: "lieferantenrechnungen",
    gbu: "gbu", betriebsmittel: "betriebsmittel", baumkataster: "baumkataster",
    fahrtenbuch: "fahrtenbuch", kalender: "kalender", chat: "chat", telefon: "telefon",
  };
  const noetig = bedarf[tab];
  const fn = funktionBedarf[tab];
  return (!noetig || block(noetig)) && (!fn || funktion(fn)) ? tab : "home";
};

// ─── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  // Beim Start die gespeicherte Adresse still auf den neuen Dolibarr-Host
  // heben (Umzug 09.09.2026); der Schluessel bleibt gueltig. Der Hinweis
  // kommt einmal als Toast, sobald showToast steht (Effekt unten).
  const configMigriert = useRef(false);
  const [config, setConfig] = useState(() => {
    try {
      const { config: c, geaendert } = migriereDolibarrConfig(JSON.parse(localStorage.getItem("dolibarr_config") || "null"));
      if (geaendert) { localStorage.setItem("dolibarr_config", JSON.stringify(c)); configMigriert.current = true; }
      return c;
    } catch { return null; }
  });
  const [api, setApi] = useState(null);
  const [connected, setConnected] = useState(false);
  // Rohe Antwort aus /users/info + Gruppen — bewusst getrennt von den daraus
  // abgeleiteten Rechten (`me` unten): kommt die Mandanten-Konfiguration
  // (async, eigener Effekt) erst NACH diesem Aufruf zurueck, wuerde eine feste
  // `setMe(buildPermissions(u, mandant))` mit dem zu diesem Zeitpunkt noch
  // leeren `mandant` fuer die GESAMTE Sitzung auf DEFAULT_PERMISSION_GROUPS
  // haengenbleiben — bei einem fremden Mandanten, dessen Dolibarr zufaellig
  // eine Gruppe wie "Geschäftsführer" kennt, waeren das zu viele Rechte, bis
  // zum naechsten Login. `me` (useMemo weiter unten) rechnet stattdessen bei
  // jeder Aenderung von `dolibarrUser` ODER `mandant` neu — ohne dafuer
  // `testConnection()` oder den Referenzdaten-Vorlauf erneut anzustossen.
  const [dolibarrUser, setDolibarrUser] = useState(null);
  const [meFehler, setMeFehler] = useState(false); // /users/info fehlgeschlagen (kein Ladezustand mehr, siehe useMemo)
  // Vor `tab` deklariert (nicht wie zuerst danach): die gecachte Fassung steht
  // synchron aus localStorage bereit (mandantAusCache()), block() faellt ohne
  // Konfiguration auf "an" zurueck (siehe useBlock oben) — damit kann schon
  // der allererste Tab-Zustand unten durch erlaubterTab laufen, statt einen
  // toten Tab fuer einen Renderzyklus (samt seiner Datenlade-Effekte) zu
  // mounten. Die echte Fassung laedt im Hintergrund nach.
  const [mandant, setMandant] = useState(() => mandantAusCache());
  useEffect(() => { mandantHolen().then((m) => m && setMandant(m)); }, []);
  // Abgeleitete Rechte: erst wenn /users/info geantwortet hat (dolibarrUser
  // gesetzt) UND unabhaengig davon, ob der Mandant zu diesem Zeitpunkt schon
  // da war — trifft die Mandanten-Antwort spaeter ein, rechnet dieser Memo
  // automatisch neu, weil `mandant` in den Abhaengigkeiten steht.
  const me = useMemo(() => {
    if (meFehler) return { id: null, isAdmin: false };
    if (!dolibarrUser) return null;
    return buildPermissions(dolibarrUser, mandant);
  }, [dolibarrUser, mandant, meFehler]);
  const block = (name) => (mandant?.bloecke ? mandant.bloecke[name] === true : true);
  const funktion = (key) => (mandant?.funktionen ? mandant.funktionen[key] === true : true);
  // #freigaben (Deep-Link aus der Matrix-Nachricht) startet im Geschäft —
  // die GeschaeftPage öffnet dann ihrerseits direkt die Freigaben-Unterseite.
  const [tab, setTab] = useState(() => {
    if (typeof window === "undefined") return "home";
    if (window.location.hash === "#freigaben") return erlaubterTab("geschaeft", block, funktion);
    // #chat/#telefon: Absprung der Klingel-Benachrichtigung (Stufe 2).
    if (window.location.hash === "#chat") return erlaubterTab("chat", block, funktion);
    if (window.location.hash === "#telefon") return erlaubterTab("telefon", block, funktion);
    if (window.location.hash === "#einstellungen") return "einstellungen";
    return "home";
  });
  // …und wenn die App schon offen ist (Android-WebView bekommt den Link per
  // onNewIntent, ein Neuladen findet dann nicht statt): auf hashchange hören.
  // Auch hier durch erlaubterTab: ein Deep-Link darf keinen abgeschalteten
  // Bereich oeffnen, nur weil er am erlaubterTab-Effekt (der nur bei einer
  // Aenderung von `mandant` laeuft) vorbeigeht.
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === "#freigaben") setTab(erlaubterTab("geschaeft", block, funktion));
      if (window.location.hash === "#chat") setTab(erlaubterTab("chat", block, funktion));
      if (window.location.hash === "#telefon") setTab(erlaubterTab("telefon", block, funktion));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [mandant]);
  // Der Chat (seit 19.09.2026 nativ, src/ui/ChatPage.jsx) synchronisiert schon
  // ab App-Start im Hintergrund, sobald eine Sitzung existiert — sonst stimmte
  // die Ungelesen-Marke nicht und das Telefon könnte nicht klingeln (der
  // ☎-Raum läuft über denselben Client). Ohne Sitzung (Erst-Login steht aus)
  // erst beim ersten Besuch des Reiters.
  const [chatGeladen, setChatGeladen] = useState(() => !!chatSitzungLesen(localStorage));
  const [chatUngelesen, setChatUngelesen] = useState(0);
  // Rückweg der Chat-Anmeldung: der Homeserver schickt mit ?loginToken=…
  // zurück (src/chat/sitzung.js). Das Token gilt einmal und nur kurz — also
  // sofort tauschen und aus der Adresszeile nehmen.
  useEffect(() => {
    const token = chatLoginTokenAusUrl(window.location.href);
    if (!token) return;
    window.history.replaceState(null, "", chatUrlBereinigt(window.location.href));
    chatMitTokenAnmelden(CHAT_HOMESERVER, token, (url, opt) => fetch(url, opt))
      .then((sitzung) => { chatSitzungMerken(localStorage, sitzung); setChatGeladen(true); setTab("chat"); })
      .catch((e) => showToast(`Chat-Anmeldung fehlgeschlagen: ${e.message || e}`, "error"));
  }, []);
  useEffect(() => { if (tab === "chat" || tab === "telefon") setChatGeladen(true); }, [tab]);
  // Zurück-Ziel für GbuPage (Befund 4b): "gbu" hat zwei Einstiege — die
  // Arbeitsschutz-Kachel im Start-Dashboard und die Gefährdungsbeurteilungen-
  // Kachel in Verwaltung. Ein fest verdrahtetes onBack={() => setTab("home")}
  // führt von Verwaltung aus am Ziel vorbei. Der Ref hält schlicht den zuletzt
  // aktiven Tab, bevor auf "gbu" gewechselt wurde — während des Renders
  // geschrieben (nicht im useEffect), damit der Wert schon beim allerersten
  // Wechsel nach "gbu" stimmt, nicht erst einen Renderzyklus später.
  const gbuVonRef = useRef("home");
  if (tab !== "gbu") gbuVonRef.current = tab;
  const [detail, setDetail] = useState(null); // { type, id, data }
  // Sprunglink aus dem Buchhaltungsbot-Bericht (#beleg-si-<id>, #beleg-ci-<id>, src/sprunglink.js):
  // Rechnung laden und als Detail oeffnen. Gibt es sie nicht oder ist der Bereich abgeschaltet
  // -> Freigaben-Liste. #bank-<id> oeffnet Verwaltung -> Bank auf dieser Zeile — nur mit Recht
  // (canViewBank) und eingeschalteter Funktion "bank", sonst ebenfalls Freigaben.
  const [bankZeile, setBankZeile] = useState(null); // { id } — neues Objekt je Sprung, damit derselbe Link zweimal wirkt
  useEffect(() => {
    const onHash = () => {
      if (!api || !istSprunglink(window.location.hash)) return;
      const bankId = bankSprung(window.location.hash);
      if (bankId) {
        if (!me) return; // Rechte noch nicht geladen — der Effekt laeuft mit `me` erneut
        if (!(me.canViewBank && block("erp") && funktion("bank"))) { window.location.hash = "#freigaben"; return; }
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        setDetail(null);
        setTab("verwaltung");
        setBankZeile({ id: bankId });
        return;
      }
      const s = belegSprung(window.location.hash);
      const erlaubt = s && erlaubterTab("geschaeft", block, funktion) === "geschaeft"
        && funktion(s.type === "invoice" ? "rechnungen" : "lieferantenrechnungen");
      (erlaubt ? (s.type === "invoice" ? api.getInvoice(s.id) : api.getSupplierInvoice(s.id)) : Promise.reject())
        .then((d) => {
          if (!d?.id) throw new Error("unbekannt");
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          setTab("geschaeft");
          setDetail({ type: s.type, data: d });
        })
        .catch(() => { window.location.hash = "#freigaben"; });
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [api, mandant, me]);
  // Kommt eine (spaeter geladene oder inzwischen geaenderte) Mandanten-
  // Konfiguration herein, waehrend man gerade in einem jetzt abgeschalteten
  // Bereich steht: zurueck auf "home", und eine offene Detailansicht (z. B.
  // eine Lieferantenrechnung aus einem abgeschalteten ERP-Block) gleich mit
  // schliessen — sonst bliebe genau die stehen.
  useEffect(() => {
    setTab((t) => {
      const erlaubt = erlaubterTab(t, block, funktion);
      if (erlaubt !== t) {
        setDetail(null);
        showToast("Diese Funktion ist für diesen Betrieb abgeschaltet.", "error");
      }
      return erlaubt;
    });
  }, [mandant]);
  const [toast, setToast] = useState(null);
  // Meldet src/registerSW.js, wenn eine neue Fassung uebernommen hat, waehrend
  // die App schon laeuft. Beim Start laedt sie sich selbst neu, dann kommt das
  // hier gar nicht erst an.
  const [neueFassung, setNeueFassung] = useState(false);
  useEffect(() => {
    const an = () => setNeueFassung(true);
    window.addEventListener("blattwerk:neue-fassung", an);
    return () => window.removeEventListener("blattwerk:neue-fassung", an);
  }, []);
  const [theme, setTheme] = useState(() => localStorage.getItem("dolibarr_theme") || "light");
  // Zwei Zustände, nicht einer: „muss" heißt, der Server hat geantwortet und
  // sagt „noch nicht abgeschlossen". Hat er gar nicht geantwortet, wird die
  // Übung angeboten, aber nichts gesperrt — ein Monteur im Funkloch, der seine
  // Zeit nicht buchen kann, weil ein Tutorial nicht laden konnte, wäre ein
  // selbstgemachter Ausfall.
  const [tutorialPflicht, setTutorialPflicht] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  // `opts.uebersprungen` kommt aus der Code-Eingabe in AppTutorial. Es wird
  // mitgeschrieben, damit in tutorial.json unterscheidbar bleibt, wer die
  // Einweisung durchlaufen und wer sie abgekuerzt hat — sonst behauptet die
  // Datei etwas, was nicht stimmt, und sie ist die einzige Stelle, an der es
  // spaeter noch steht.
  const finishTutorial = (opts) => {
    const uebersprungen = !!(opts && opts.uebersprungen);
    setShowTutorial(false);
    setTutorialPflicht(false);
    // Geräteweiter Schlüssel wäre auf einem geteilten Gerät falsch (siehe K1
    // in der Abschlussprüfung) — ohne Login wird nichts geschrieben.
    if (me?.login) {
      try { localStorage.setItem(`blattwerk_tutorial_fassung:${me.login}`, String(TUTORIAL_VERSION)); } catch (_) {}
      try { localStorage.removeItem(`blattwerk_tutorial_stand:${me.login}`); } catch (_) {}
    }
    const nc = loadNcConfig();
    if (!me?.login || !ncHasAccess(nc)) return;
    // Fehlschlag wird bewusst geschluckt: lokal ist es vermerkt, der nächste
    // Start mit Empfang trägt es nach (Startprüfung unten, Fall „nachtragen").
    apiFetch("/api/nc/tutorial/save", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server: nc.server, user: nc.user, pass: nc.pass, login: me.login, fassung: TUTORIAL_VERSION, uebersprungen }),
    }).catch(() => {});
  };

  // Startprüfung: läuft, sobald `connected && me?.login` steht — und dank des
  // Ref-Wächters nur einmal je Login. Ein simples `useRef(false)` würde nach
  // Ab-/Anmeldung eines anderen Logins auf demselben Gerät (Dienstkonto-
  // Nextcloud, siehe Konstante `me.login`-Identität) fälschlich blockiert
  // bleiben; der Ref hält deshalb den geprüften Login selbst, nicht nur ein
  // Ja/Nein. Das deckt zugleich React 18 StrictMode ab, das jeden Effekt im
  // Dev-Modus doppelt aufruft: der zweite Aufruf sieht denselben Login schon
  // eingetragen und bricht sofort ab.
  const tutorialGeprueftFuer = useRef(null);
  useEffect(() => {
    if (!connected || !me?.login) return;
    if (tutorialGeprueftFuer.current === me.login) return;
    tutorialGeprueftFuer.current = me.login;

    let abgebrochen = false;
    const login = me.login;
    const lokaleFassung = Number(localStorage.getItem(`blattwerk_tutorial_fassung:${login}`) || 0);
    const nc = loadNcConfig();

    // Die Entscheidung selbst steht als reine Funktion in uebungen.js
    // (tutorialEntscheidung) und ist dort getestet — hier nur noch die
    // Verdrahtung: Antwort holen, fragen, handeln.
    const handeln = (antwort) => {
      if (abgebrochen) return;
      const stand = tutorialEntscheidung({ lokaleFassung, antwort, login });
      if (stand === "frei") {
        // Kommt die Bestätigung vom Server, lohnt sich der lokale Cache —
        // sonst fragt der nächste Start wieder den Server. War es nur der
        // lokale Stand (Server ohne Antwort), steht der Cache schon so.
        if (antwort) { try { localStorage.setItem(`blattwerk_tutorial_fassung:${login}`, String(TUTORIAL_VERSION)); } catch (_) {} }
        return;
      }
      if (stand === "nachtragen") {
        // Offline abgeschlossen, jetzt wieder Empfang: nachtragen. Schlägt
        // es fehl, bleibt es lokal vermerkt, der nächste Start mit
        // Verbindung versucht es erneut.
        apiFetch("/api/nc/tutorial/save", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ server: nc.server, user: nc.user, pass: nc.pass, login, fassung: TUTORIAL_VERSION }),
        }).catch(() => {});
        return;
      }
      setTutorialPflicht(stand === "pflicht");
      setShowTutorial(true);
    };

    if (!ncHasAccess(nc)) { handeln(null); return; }

    apiFetch("/api/nc/tutorial", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server: nc.server, user: nc.user, pass: nc.pass }),
    }).then((r) => (r.ok ? r.json() : null))
      // Kein Objekt zurück (z. B. 401/502) zählt wie „nicht geantwortet" —
      // sonst würde ein Serverfehler fälschlich als „nicht abgeschlossen"
      // gelesen und die App gesperrt, obwohl niemand das weiß.
      .then(handeln)
      .catch(() => handeln(null));
    return () => { abgebrochen = true; };
  }, [connected, me?.login]);

  useEffect(() => {
    if (config) {
      const a = createApi(config.url, config.key);
      setApi(a);
      window.__api = a;               // für Konsole/manuelle Sync-Tests
      window.__saveTimeSpent = saveTimeSpent;
      a.testConnection().then(() => setConnected(true)).catch((e) => {
        setConnected(false);
        if (e?.weiterleitung) showToast(e.message, "error");
      });
      if (configMigriert.current) { configMigriert.current = false; showToast("Serveradresse aktualisiert: Dolibarr läuft jetzt unter " + DOLIBARR_URL_DEFAULT); }
      a.getCurrentUserWithGroups()
        .then((u) => { setMeFehler(false); setDolibarrUser(u); })
        .catch(() => { setMeFehler(true); setDolibarrUser(null); });
      // Referenzdaten sofort vorladen, wenn Login/Config gerade erst entsteht (nicht erst beim nächsten Online-Flip).
      if (offline.isOnline()) {
        offline.refreshRefCache(a).then((res) => {
          // Sichtbare Bestätigung, damit man weiß, wann es sicher ist, offline zu gehen.
          if (res?.anyLoaded) showToast(`Offline-Daten bereit: ${res.thirdparties > 0 ? res.thirdparties : 0} Kontakte, ${res.products > 0 ? res.products : 0} Artikel, ${res.projects > 0 ? res.projects : 0} Projekte`);
        }).catch(() => {});
        // Einmalig synchronisieren, falls die App offline geschlossen und später
        // schon online wieder geöffnet wurde: sonst hängt die Outbox bis zum
        // nächsten manuellen Tap oder Connectivity-Flip fest.
        offline.runSync({ api: a, saveTimeSpent, createThirdpartyWithFallback, submitSupplierInvoice, createCalendarForSyncedEntry }).then(() => refreshPending()).catch(() => {});
      }
    }
  }, [config]);

  // Erst laufen lassen, dann den Scanner-Brocken in der Leerlaufzeit nachholen
  // (siehe opencvVorwaermen) — sonst waere Offline-Scannen nach einem Update tot.
  useEffect(() => { if (connected) opencvVorwaermen(); }, [connected]);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => { localStorage.setItem("dolibarr_theme", theme); }, [theme]);

  useStillerUpdateCheck(showToast);

  // Offene Gefährdungsbeurteilungen nachladen: beim Start und sobald wieder Netz da ist.
  // gbuMeineNachziehen ist das Gegenstück für die AUTOMATISCHE Weitergabe an
  // Kolleg:innen (Stufe "mit Netz" — der Ersteller hat die Beteiligten schon
  // beim Hochladen gemeldet, submitGbuRecord): dieses Gerät zieht seine
  // eigenen offenen Beurteilungen der letzten 30 Tage nach.
  useEffect(() => {
    if (!api) return;
    const betrieb = mandantBetrieb(mandant);
    // Ungeladener Mandant sperrt nichts — dieselbe Regel wie useBlock/useFunktion.
    if (!mandant || funktionAktiv(mandant, "gbu")) processGbuQueue(api, showToast, betrieb);
    gbuMeineNachziehen(me);
    const onOnline = () => {
      if (!mandant || funktionAktiv(mandant, "gbu")) processGbuQueue(api, showToast, betrieb);
      gbuMeineNachziehen(me);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [api, showToast, mandant, me]);

  // Dokument-Uploads ohne Netz (src/pl-warteschlange.js): beim Start und sobald Netz da ist nachtragen.
  useEffect(() => {
    const lauf = () => plNachtragen({
      senden: plSenden,
      melden: (x, st) => showToast(`„${x.titel}" konnte nicht hochgeladen werden (Status ${st}).`, "error"),
    }).then((n) => { if (n > 0) showToast(`${n} ${n === 1 ? "Dokument" : "Dokumente"} nachträglich hochgeladen.`); }).catch(() => {});
    lauf();
    window.addEventListener("online", lauf);
    return () => window.removeEventListener("online", lauf);
  }, [showToast]);

  // Offline-Sync: Verbindungsstatus, ausstehende Einträge, Auto-Sync bei Reconnect.
  const [online, setOnline] = useState(offline.isOnline());
  const [pendingCount, setPendingCount] = useState(0);
  const [showQueue, setShowQueue] = useState(false);
  const [queue, setQueue] = useState([]);

  const refreshPending = useCallback(async () => {
    try { setPendingCount((await offline.getPending()).length); } catch {}
  }, []);

  useEffect(() => {
    refreshPending();
    const stop = offline.onConnectivity(async (isOn) => {
      setOnline(isOn);
      if (isOn && window.__api) {
        await offline.runSync({ api: window.__api, saveTimeSpent, createThirdpartyWithFallback, submitSupplierInvoice, createCalendarForSyncedEntry }).catch(() => {});
        await refreshPending();
      }
    });
    return stop;
  }, [refreshPending]);

  // Referenzdaten vorladen, sobald online + eingeloggt
  useEffect(() => {
    if (online && window.__api) { offline.refreshRefCache(window.__api).catch(() => {}); }
  }, [online]);

  // SSO-Auto-Konfiguration: Authentik-Forward-Auth reicht den Nutzer als Header
  // durch; /api/sso/config liefert dessen Dolibarr-Zugang und den Kalender.
  //
  // Laeuft EINMAL beim Start. Frueher stand hier `if (config) return`, und damit
  // hing der Kalender am Dolibarr-Zugang: sobald der einmal gespeichert war,
  // wurde /api/sso/config nie wieder abgefragt — der Kalender konnte also nie
  // nachtraeglich dazukommen. Genau der Fall nach einer Neuinstallation, wo der
  // Login zuerst passiert und der Kalender erst danach serverseitig da ist.
  const ssoGeholt = useRef(false);
  useEffect(() => {
    if (ssoGeholt.current) return;
    ssoGeholt.current = true;
    apiFetch("/api/sso/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        // Nextcloud-Kalender ist serverseitig pro Authentik-Nutzer hinterlegt:
        // voller Zugang -> übernehmen; sonst nur die Server-Adresse vorbefüllen.
        // Nicht nur "noch gar nichts gespeichert": beim ersten Start hat die App
        // hier schon einen Eintrag angelegt, der NUR die vorbefuellte
        // Server-Adresse enthaelt. Der wuerde die Uebernahme des Team-Kalenders
        // fuer immer blockieren. Ueberschrieben wird deshalb alles, was weder
        // einen gewaehlten Kalender noch einen eigenen Zugang enthaelt — eine
        // angefangene eigene Anmeldung bleibt damit unangetastet.
        const vorhanden = loadNcConfig();
        const leer = !vorhanden.calendarUrl && !vorhanden.pass && !vorhanden.managed;
        if (leer) {
          // Kein Passwort mehr im Vergleich: der Server liefert bewusst keines
          // (managed). Wer hier auf `pass` prueft, sieht den Team-Kalender nie.
          if (d.nextcloud && d.nextcloud.server && d.nextcloud.user) {
            saveNcConfig({ ...NC_DEFAULT, ...d.nextcloud });
          } else if (d.nextcloudServer) {
            saveNcConfig({ ...NC_DEFAULT, server: d.nextcloudServer });
          }
        }
        // Nur wenn noch keiner da ist — sonst wuerde ein Geraet, an dem jemand
        // bewusst einen anderen Zugang eingetragen hat, still ueberschrieben.
        if (d.dolibarr && d.dolibarr.url && d.dolibarr.key && !localStorage.getItem("dolibarr_config")) {
          const { config: c } = migriereDolibarrConfig(d.dolibarr);
          localStorage.setItem("dolibarr_config", JSON.stringify(c));
          setConfig(c);
        }
      })
      .catch(() => {});
  }, []);

  // Stand der Einweisungen einmal am Tag nachziehen, damit die Kachel auf dem
  // Startbildschirm auch dann warnt, wenn niemand den Reiter oeffnet. Bewusst
  // hoechstens einmal taeglich: das sind zwei zusaetzliche Abfragen, und
  // Fristen aendern sich nicht im Stundentakt.
  useEffect(() => {
    if (!api || !connected) return;
    if (ewStandLesen().stand === heuteIso()) return;
    const nc = loadNcConfig();
    if (!ncHasAccess(nc)) return;
    let abgebrochen = false;
    Promise.all([
      apiFetch("/api/nc/einweisungen", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: nc.server, user: nc.user, pass: nc.pass }),
      }).then((r) => (r.ok ? r.json() : null)),
      api.getUsers().catch(() => []),
      // Gleicher Tages-Effekt zieht den Qualifikations-Stand mit nach, damit das
      // Abzeichen auch dann aktuell ist, wenn niemand den Reiter Personal oeffnet.
      apiFetch("/api/nc/qualifikationen", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: nc.server, user: nc.user, pass: nc.pass }),
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([store, users, qualiStore]) => {
      if (abgebrochen) return;
      if (qualiStore) qualiStandSchreiben(qualiStore, heuteIso());
      if (!store) return;
      const heute = heuteIso();
      let offen = 0;
      // Auch hier nicht allein auf `GET /users` verlassen (Recht `user->user->lire`):
      // wer schon einen Nachweis hat, gehoert in die Zaehlung.
      const bekannt = new Map(ewPersonen(users).map((p) => [p.login, p]));
      for (const e of store.eintraege || []) {
        if (e && e.login && !bekannt.has(e.login)) bekannt.set(e.login, { login: e.login, name: e.name || e.login });
      }
      for (const p of bekannt.values()) {
        for (const g of EW_GERAETE) {
          const st = ewStatus(ewLetzte(store.eintraege, g.id, p.login), heute).stufe;
          if (st === "ueberfaellig" || st === "bald" || st === "offen") offen++;
        }
      }
      ewStandSchreiben({ offen, stand: heute });
    }).catch(() => {});
    return () => { abgebrochen = true; };
  }, [api, connected]);

  // Fristen der Betriebsmittel (Verfall, Prüfung, Alter). Eigener Effekt statt
  // eines gemeinsamen: die Einweisungen hängen an Nextcloud, die Lose an
  // Dolibarr — fällt das eine aus, soll das andere trotzdem zählen.
  useEffect(() => {
    if (!api || !connected) return;
    if (bmStandLesen().stand === heuteIso()) return;
    let abgebrochen = false;
    api.getLots().then((lose) => {
      if (abgebrochen) return;
      const heute = heuteIso();
      bmStandSchreiben({ offen: bmFaellige(Array.isArray(lose) ? lose : [], heute).length, stand: heute });
    }).catch(() => {});
    return () => { abgebrochen = true; };
  }, [api, connected]);

  const logout = () => {
    localStorage.removeItem("dolibarr_config");
    setConfig(null); setApi(null); setConnected(false); setDolibarrUser(null); setMeFehler(false);
  };

  if (!config) return (
    <>
      <style>{css}</style>
      <div className={`app theme-${theme}`}>
        <LoginScreen mandant={mandant} onLogin={(c, ausSso) => {
          localStorage.setItem("dolibarr_config", JSON.stringify(c));
          setConfig(c);
          // Zugang serverseitig für diesen Authentik-Nutzer hinterlegen,
          // damit sich weitere Geräte automatisch konfigurieren (Fehler egal).
          // Kam er gerade von dort, entfaellt das: der Server pruefte den Key
          // beim Speichern gegen Dolibarr — bei jeder Anmeldung erneut waere
          // das ein zusaetzlicher Umweg fuer ein Ergebnis, das schon feststeht.
          if (ausSso) return;
          apiFetch("/api/sso/register", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: c.url, key: c.key }),
          }).catch(() => {});
        }} />
      </div>
    </>
  );

  const goDetail = (type, data) => setDetail({ type, data });
  const closeDetail = () => setDetail(null);

  const { firma, logo } = mandantMarke(mandant);
  return (
    <MandantContext.Provider value={mandant}>
      <style>{css}</style>
      <div className={`app theme-${theme}`}>
        <header className="app-topbar">
          {logo && <img src={logo} alt={firma} />}
          <span className="brand">{firma}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <span title={online ? "Online" : "Offline"} style={{
              fontSize: 12, padding: "2px 8px", borderRadius: 12,
              background: online ? "var(--online)" : "var(--danger-bg)", color: online ? "var(--on-online)" : "var(--on-danger)",
            }}>{online ? "Online" : "Offline"}</span>
            {pendingCount > 0 && (
              <button onClick={async () => {
                setQueue(await offline.getPending().catch(() => []));
                setShowQueue(true);
              }} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 12, background: "var(--warn-soft)", color: "var(--warn)", border: 0 }}>
                {pendingCount} wartet
              </button>
            )}
          </div>
        </header>
        {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
        {/* Meldet sich nur, wenn die neue Fassung eintrifft, waehrend die App
            schon eine Weile offen ist — beim Start laedt sie sich selbst neu
            (siehe src/registerSW.js). Hier wird bewusst gefragt statt einfach
            neu geladen: mitten in einer Gefaehrdungsbeurteilung waere das der
            Verlust des halb ausgefuellten Formulars. */}
        {neueFassung && (
          <button className="update-banner" onClick={() => window.location.reload()}>
            Neue Fassung verfügbar — tippen zum Laden
          </button>
        )}
        {showTutorial && (
          <TutorialFehlergrenze
            onAbmelden={logout}
            onNeustart={() => {
              // Zwischenstand weg, sonst faengt der Neuversuch genau in der
              // Uebung wieder an, die gerade abgestuerzt ist.
              try { localStorage.removeItem(`blattwerk_tutorial_stand:${me?.login}`); } catch (_) {}
            }}
          >
            <AppTutorial
              heute={heuteIso()}
              name={[me?.firstname, me?.lastname].filter(Boolean).join(" ")}
              login={me?.login}
              pflicht={tutorialPflicht}
              onDone={finishTutorial}
              onSpaeter={() => setShowTutorial(false)}
              onAbmelden={logout}
            />
          </TutorialFehlergrenze>
        )}
        {showQueue && (
          <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowQueue(false)}>
            <div className="modal">
              <div className="modal-handle" />
              <div className="modal-title">Wartende Einträge</div>
              {queue.length === 0 && <div className="empty-state"><p>Nichts offen.</p></div>}
              {queue.map((q) => (
                <div key={q.id} className="list-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {({ receipt: "Beleg", time: "Zeitbuchung", thirdparty: "Kunde", project: "Projekt", task: "Aufgabe" })[q.type] || q.type}
                    </div>
                    <div style={{ fontSize: 12, color: q.status === "error" ? "var(--danger)" : q.status === "review" ? "var(--warn)" : "var(--text2)", marginTop: 4 }}>
                      {q.status === "error" ? `Fehler: ${q.error}` : q.status === "review" ? `Bitte prüfen: ${q.error}` : q.status}
                    </div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={async () => {
                    await offline.dismissEntry(q.id);
                    setQueue(await offline.getPending());
                    await refreshPending();
                  }}><Icon name="trash" size={13} /> Verwerfen</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={async () => {
                  if (!window.__api) return;
                  await offline.runSync({ api: window.__api, saveTimeSpent, createThirdpartyWithFallback, submitSupplierInvoice, createCalendarForSyncedEntry });
                  setQueue(await offline.getPending());
                  await refreshPending();
                }}>Jetzt synchronisieren</button>
                <button className="btn btn-secondary" onClick={() => setShowQueue(false)}>Schließen</button>
              </div>
            </div>
          </div>
        )}
        {chatGeladen && <ChatBereich sichtbar={!detail && tab === "chat"} showToast={showToast} onUngelesen={setChatUngelesen} />}
        {/* onOeffnen kommt von einem echten Klingeln (Push-Benachrichtigung
            oder "annehmen" im Bruecken-iframe), nicht von einem Tipp auf eine
            Kachel — trotzdem durch erlaubterTab, falls "telefon" inzwischen
            abgeschaltet ist (Konfigurationswechsel waehrend eines laufenden
            Anrufs waere sonst die letzte Luecke). */}
        {chatGeladen && <TelefonBereich sichtbar={!detail && tab === "telefon"} onOeffnen={() => { setDetail(null); setTab(erlaubterTab("telefon", block, funktion)); }} />}
        {detail ? (
          <>
            {detail.type === "invoice" && <InvoiceDetail api={api} data={detail.data} me={me} onBack={closeDetail} onOpenDetail={goDetail} showToast={showToast} />}
            {detail.type === "supplierinvoice" && <SupplierInvoiceDetail api={api} data={detail.data} me={me} onBack={closeDetail} showToast={showToast} />}
            {detail.type === "proposal" && <ProposalDetail api={api} data={detail.data} me={me} onBack={closeDetail} onOpenDetail={goDetail} showToast={showToast} />}
            {detail.type === "project" && <ProjectDetail api={api} data={detail.data} me={me} onBack={closeDetail} onOpenDetail={goDetail} showToast={showToast} />}
            {detail.type === "expense" && <ExpenseReportDetail api={api} data={detail.data} me={me} onBack={closeDetail} showToast={showToast} />}
          </>
        ) : (
          <>
            {tab === "home"      && <Dashboard api={api} connected={connected} me={me} onNavigate={setTab} showToast={showToast} />}
            {tab === "customers" && <ThirdpartyList api={api} type="customer" me={me} showToast={showToast} setPendingCount={setPendingCount} />}
            {tab === "partners" && <ThirdpartyList api={api} type="partners" me={me} showToast={showToast} setPendingCount={setPendingCount} />}
            {tab === "suppliers" && <ThirdpartyList api={api} type="supplier" me={me} showToast={showToast} setPendingCount={setPendingCount} />}
            {tab === "invoices"  && <InvoiceList api={api} showToast={showToast} onDetail={(d) => goDetail("invoice", d)} />}
            {tab === "supplierinvoices" && <SupplierInvoiceList api={api} showToast={showToast} onDetail={(d) => goDetail("supplierinvoice", d)} />}
            {tab === "proposals" && <ProposalList api={api} showToast={showToast} onDetail={(d) => goDetail("proposal", d)} />}
            {tab === "time"      && <TimeTracking api={api} me={me} showToast={showToast} setPendingCount={setPendingCount} />}
            {tab === "expenses"  && <Expenses api={api} me={me} showToast={showToast} />}
            {tab === "projects"  && <ProjectList api={api} me={me} showToast={showToast} setPendingCount={setPendingCount} onDetail={(d) => goDetail("project", d)} />}
            {tab === "geschaeft"  && <GeschaeftPage api={api} me={me} showToast={showToast} onOpenDetail={goDetail} onNavigate={setTab} />}
            {tab === "lager"      && <LagerPage api={api} showToast={showToast} />}
            {tab === "verwaltung" && <VerwaltungPage api={api} me={me} onNavigate={setTab} showToast={showToast} bankZeile={bankZeile} />}
            {tab === "fahrtenbuch" && <FahrtenbuchPage api={api} me={me} connected={connected} showToast={showToast} />}
            {tab === "orders"    && <BestellungenView api={api} me={me} showToast={showToast} autoNew onBack={() => setTab("home")} />}
            {tab === "gbu"       && <GbuPage api={api} me={me} showToast={showToast} onBack={() => setTab(gbuVonRef.current)} />}
            {tab === "betriebsmittel" && <BetriebsmittelPage api={api} showToast={showToast} onBack={() => setTab("verwaltung")} />}
            {tab === "baumkataster" && <BaumkatasterPage api={api} me={me} showToast={showToast} betrieb={mandantBetrieb(mandant)} onBack={() => setTab("verwaltung")} />}
            {tab === "kalender"  && <KalenderPage me={me} showToast={showToast} />}
            {tab === "profile"   && <Profile api={api} me={me} onLogout={logout} showToast={showToast} onShowTutorial={() => { setTutorialPflicht(false); setShowTutorial(true); }} />}
            {tab === "einstellungen" && <EinstellungenPage api={api} me={me} theme={theme} setTheme={setTheme} showToast={showToast} />}
            <BottomNav active={tab} chatUngelesen={chatUngelesen} onChange={(t) => { setDetail(null); setTab(t); }} />
          </>
        )}
      </div>
    </MandantContext.Provider>
  );
}

// ─── Login ──────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, mandant }) {
  const { firma, logo, gewerk } = mandantMarke(mandant);
  const [url, setUrl] = useState(DOLIBARR_URL_DEFAULT);
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLaeuft, setSsoLaeuft] = useState(false);
  const [err, setErr] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  // Handeingabe ist der Ausweg, nicht der Regelweg: den API-Schluessel hat nur,
  // wer sich in Dolibarr ins eigene Profil klickt. Im Einsatz kann das niemand
  // beantworten — vor der App haengt aber ohnehin Authentik, das den Zugang
  // schon kennt. Das Formular klappt nur auf, wenn es gebraucht wird.
  const [manuell, setManuell] = useState(false);

  // Gemeinsamer Abschluss beider Wege. window.__api ist keine Bequemlichkeit
  // fuer die Konsole: die Offline-Warteschlange (runSync, refreshRefCache)
  // haengt daran — ein zweiter Weg an dieser Zeile vorbei wuerde still nichts
  // mehr nachtragen.
  const verbinden = async (c, ausSso) => {
    const a = createApi(c.url, c.key);
    await a.testConnection();
    window.__api = a;                // erst nach erfolgreicher Prüfung
    window.__saveTimeSpent = saveTimeSpent;
    onLogin(c, ausSso);
  };

  const handleLogin = async () => {
    setErr(""); setLoading(true);
    try {
      await verbinden({ url: url.replace(/\/$/, ""), key });
    } catch (e) {
      setErr(verbindungsFehlerText(e));
    } finally { setLoading(false); }
  };

  const handleSso = async () => {
    setErr(""); setSsoLaeuft(true);
    try {
      const r = await apiFetch("/api/sso/config");
      const erg = ssoAnmeldung(r.ok ? await r.json() : null);
      if (erg.stand === "bereit") {
        try {
          await verbinden(erg.config, true);
          return;
        } catch {
          setManuell(true);
          setUrl(erg.config.url);
          setErr("Der hinterlegte Zugang wird von Dolibarr nicht mehr angenommen. Bitte einen neuen API-Schlüssel eintragen.");
          return;
        }
      }
      setManuell(true);
      setErr(erg.stand === "ohne-zugang"
        ? `Angemeldet als ${erg.name}, aber für dieses Konto ist noch kein Dolibarr-Zugang hinterlegt. Einmalig den API-Schlüssel eintragen — danach meldet sich jedes weitere Gerät von selbst an.`
        : "Über diese Adresse läuft keine Authentik-Anmeldung. Zugang bitte von Hand eintragen.");
    } catch (e) {
      // Abgelaufene Sitzung leitet sich in apiFetch selbst zur Anmeldung um —
      // dann steht die Seite ohnehin gleich woanders, eine Meldung waere nur
      // ein Aufblitzen.
      if (!e || !e.ssoAbgelaufen) setErr("Anmeldung über Authentik gerade nicht möglich. Besteht eine Verbindung?");
    } finally { setSsoLaeuft(false); }
  };

  return (
    <div className="login-wrap">
      <div className="login-logo">
        {logo && <img src={logo} alt={firma} style={{width:110,height:110,objectFit:"contain",borderRadius:16}} />}
        <h1>{firma}</h1>
        {/* Gewerk aus dem Mandanten — "Baum- und Gartenpflege" stand hier fest. */}
        {gewerk && <p>{gewerk}</p>}
      </div>
      <div className="login-card">
        <button className="btn btn-primary" onClick={handleSso} disabled={ssoLaeuft || loading}>
          {ssoLaeuft
            ? <><div className="spinner" style={{width:16,height:16}} /> Melde an...</>
            : "Anmelden über Authentik"}
        </button>
        {err && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{err}</div>}
        {!manuell && (
          <button className="btn btn-ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => setManuell(true)}>
            Zugang von Hand eintragen
          </button>
        )}
        {manuell && (
          <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div className="field-group mb12">
              <label>Dolibarr URL</label>
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://mein-dolibarr.de" type="url" />
            </div>
            <div className="field-group mb16">
              <label>API Key</label>
              <input value={key} onChange={e => setKey(e.target.value)} placeholder="Dein API-Schlüssel" type="password" />
            </div>
            <button className="btn btn-secondary" style={{ width: "100%" }} onClick={handleLogin} disabled={loading}>
              {loading ? <><div className="spinner" style={{width:16,height:16}} /> Verbinde...</> : "Verbinden"}
            </button>
          </div>
        )}
      </div>
      <div className="pwa-hint">
        <strong>📱 Als App installieren</strong>
        <b>Android:</b> Chrome-Menü → „Zum Startbildschirm hinzufügen"<br/>
        <b>iOS:</b> Safari → Teilen-Symbol → „Zum Home-Bildschirm"<br/>
        <b>Nur für den Ausweg:</b> Dolibarr → Profil → API-Schlüssel generieren
      </div>
    </div>
  );
}

function canChangeExpense(r) {
  const s = Number(r.status ?? r.fk_statut ?? r.statut ?? 0);
  // Entwurf/offen/erfasst: Dolibarr may still reject invalid transitions, but these are the only states shown.
  return [0,1,2].includes(s);
}
function ExpenseActions({ api, report, me, showToast, onChanged }) {
  const [busy, setBusy] = useState(false);
  if (!canChangeExpense(report)) return null;
  const id = report.id || report.rowid;
  const validate = async (e) => {
    e.stopPropagation();
    setBusy(true);
    try { await api.validateExpenseReport(id); showToast("Spese validiert!"); onChanged?.(); }
    catch (err) { showToast(doliError(err) || "Validieren fehlgeschlagen", "error"); }
    finally { setBusy(false); }
  };
  const remove = async (e) => {
    e.stopPropagation();
    if (!window.confirm("Diese Spese wirklich löschen?")) return;
    setBusy(true);
    try { await api.deleteExpenseReport(id); showToast("Spese gelöscht!"); onChanged?.(); }
    catch (err) { showToast(doliError(err) || "Löschen fehlgeschlagen", "error"); }
    finally { setBusy(false); }
  };
  return <div style={{display:"flex",gap:6,justifyContent:"flex-end",marginTop:6}}>
    {me?.canValidateExpenses && <button className="btn btn-success btn-sm" onClick={validate} disabled={busy}><Icon name="validate" size={13}/> Validieren</button>}
    <button className="btn btn-danger btn-sm" onClick={remove} disabled={busy}><Icon name="trash" size={13}/> Löschen</button>
  </div>;
}

// ─── Telefon (Festnetz über Matrix + LiveKit) ───────────────────────────────
// Eigene Telefon-Ansicht statt des ☎-Chatverlaufs (Wunsch vom 20.08.2026):
// Wählfeld, Klingelton, Annehmen/Auflegen/Tastentöne. Die Matrix-Seite läuft
// über den Client des nativen Chats (src/chat/client.js), der Ton direkt über LiveKit (src/telefon.js erklärt
// den Ablauf). Deshalb braucht das Telefon die Chat-Anmeldung.

// Bis 19.09.2026 lief das über eine postMessage-Brücke ins Element-iframe;
// seit der Chat nativ ist, spricht das Telefon direkt mit dessen Client.
const telefonBefehl = async (daten) => {
  if (daten.typ === "sende") { await chatTelefonSenden(daten.text); return { typ: "gesendet" }; }
  if (daten.typ === "openid") return { typ: "openid", ...(await chatOpenId()) };
  throw new Error(`Unbekannter Telefon-Befehl: ${daten.typ}`);
};

// Deutscher Rufton (425 Hz, 1 s an / 4 s aus) aus dem Oszillator — kein
// Audio-Asset nötig, und die APK-Hülle erlaubt Ton ohne Nutzer-Geste.
function klingelStart() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination);
    const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = 425;
    osc.connect(gain); osc.start();
    const start = Date.now();
    const timer = setInterval(() => {
      const t = (Date.now() - start) % 5000;
      gain.gain.setTargetAtTime(t < 1000 ? 0.25 : 0, ctx.currentTime, 0.02);
      if (t < 250 && navigator.vibrate) navigator.vibrate(300);
    }, 250);
    return () => { clearInterval(timer); try { osc.stop(); ctx.close(); } catch { /* schon zu */ } };
  } catch { return () => {}; }
}

function TelefonBereich({ sichtbar, onOeffnen }) {
  const [eingabe, setEingabe] = useState("");
  const [anruf, setAnruf] = useState(null); // { richtung, status: klingelt|verbinde|laeuft }
  const [stumm, setStumm] = useState(false);
  const bereit = useSyncExternalStore(chatAbonnieren, () => chatStand().phase === "bereit");
  const [fehler, setFehler] = useState("");
  const lkRef = useRef(null);
  const klingelStopRef = useRef(null);
  const benachrichtigungTimerRef = useRef(null);
  const audioRef = useRef(null);
  const anrufRef = useRef(null);
  anrufRef.current = anruf;

  const aufraeumen = useCallback(() => {
    if (klingelStopRef.current) { klingelStopRef.current(); klingelStopRef.current = null; }
    if (benachrichtigungTimerRef.current) { clearInterval(benachrichtigungTimerRef.current); benachrichtigungTimerRef.current = null; }
    if (lkRef.current) { try { lkRef.current.disconnect(); } catch { /* egal */ } lkRef.current = null; }
    if (audioRef.current) audioRef.current.replaceChildren();
    navigator.serviceWorker?.ready.then((reg) => reg.getNotifications({ tag: "bw-anruf" })
      .then((alle) => alle.forEach((n) => n.close()))).catch(() => {});
    setAnruf(null); setStumm(false);
  }, []);

  // Ereignisse des ☎-Raums: Klingeln und Statusmeldungen des Callbots.
  useEffect(() => {
    const horche = (d) => {
      if (d.typ === "klingeln" && istKlingeln("org.matrix.msc4075.rtc.notification", d.inhalt, d.alterMs)) {
        if (!anrufRef.current) {
          setAnruf({ richtung: "eingehend", status: "klingelt" });
          klingelStopRef.current = klingelStart();
          // Zusaetzlich als System-Benachrichtigung (vibriert auch bei Tab im
          // Hintergrund/Bildschirm aus). Eine Notification vibriert nur EINMAL —
          // fuer ein Dauer-Klingeln wird sie deshalb im Hintergrund alle paar
          // Sekunden mit renotify neu ausgeloest (jede Wiederholung vibriert
          // und plingt erneut), solange es klingelt. Die Android-WebView der
          // APK kennt keine Web-Notifications — dort bleibt es beim Ton in
          // der App (Stufe 2 bringt das native Klingeln).
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            const zeige = () => navigator.serviceWorker?.ready.then((reg) => reg.showNotification("📞 Eingehender Anruf", {
              body: "Festnetz Blattwerk — antippen zum Annehmen",
              tag: "bw-anruf", renotify: true, requireInteraction: true,
              vibrate: [500, 200, 500, 200, 500],
            })).catch(() => {});
            zeige();
            benachrichtigungTimerRef.current = setInterval(() => {
              if (anrufRef.current?.status === "klingelt" && document.hidden) zeige();
            }, 4000);
          }
          // Falls niemand rangeht: nach 90 s räumt der Dialplan auf (Mailbox) —
          // dann soll auch hier Ruhe sein (Ton, Vibrations-Timer, Notification).
          setTimeout(() => {
            if (anrufRef.current?.status === "klingelt") aufraeumenRef.current();
          }, 90000);
        }
      }
      if (d.typ === "nachricht" && (d.alterMs || 0) < 15000) {
        // Der callbot meldet das Ende im Raum ("✅ Anruf beendet", "📵 …") —
        // dann Klingeln/Anzeige abräumen, egal in welchem Zustand.
        if (/Anruf beendet|abgebrochen|Mailbox|📵/.test(d.text || "")) {
          if (anrufRef.current?.status === "klingelt" || anrufRef.current?.status === "verbinde") aufraeumenRef.current();
        }
      }
    };
    return chatTelefonAbonnieren(horche);
  }, []);
  const aufraeumenRef = useRef(aufraeumen);
  aufraeumenRef.current = aufraeumen;

  // Klick auf die Anruf-Benachrichtigung (public/sw-anruf.js) öffnet die
  // Telefon-Ansicht; die Berechtigung wird beim ersten Besuch des Tabs erfragt.
  useEffect(() => {
    const vomSw = (ev) => { if (ev.data?.quelle === "bw-anruf" && ev.data.typ === "oeffnen" && onOeffnen) onOeffnen(); };
    navigator.serviceWorker?.addEventListener("message", vomSw);
    return () => navigator.serviceWorker?.removeEventListener("message", vomSw);
  }, [onOeffnen]);
  useEffect(() => {
    if (sichtbar && typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [sichtbar]);

  const verbinde = useCallback(async () => {
    const antwort = await telefonBefehl({ typ: "openid" });
    const { url, body } = sfuAnfrage(antwort.token, antwort.deviceId);
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`Token-Dienst antwortet ${r.status}`);
    const ticket = await r.json();
    const { Room, RoomEvent, Track } = await import("livekit-client");
    const lk = new Room();
    lk.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio && audioRef.current) {
        const el = track.attach();
        el.autoplay = true;
        audioRef.current.appendChild(el);
      }
    });
    lk.on(RoomEvent.Disconnected, () => aufraeumenRef.current());
    await lk.connect(ticket.url || "wss://livekit.example.org", ticket.jwt);
    await lk.localParticipant.setMicrophoneEnabled(true);
    lkRef.current = lk;
    return lk;
  }, []);

  const starteAnruf = async () => {
    setFehler("");
    const nummer = nummerNormalisieren(eingabe);
    if (!nummer) { setFehler("Keine gültige Rufnummer (0… oder +…, mind. 6 Ziffern)."); return; }
    setAnruf({ richtung: "ausgehend", status: "verbinde", nummer });
    try {
      await telefonBefehl({ typ: "sende", text: `!call ${nummer}` });
      // "Wahl erst nach Beitritt": gewählt wird, sobald wir in der Leitung hängen.
      await verbinde();
      setAnruf({ richtung: "ausgehend", status: "laeuft", nummer });
    } catch (e) { setFehler(String(e.message || e)); aufraeumen(); }
  };

  const annehmen = async () => {
    setFehler("");
    if (klingelStopRef.current) { klingelStopRef.current(); klingelStopRef.current = null; }
    setAnruf({ richtung: "eingehend", status: "verbinde" });
    if (onOeffnen) onOeffnen();
    try {
      await verbinde();
      setAnruf({ richtung: "eingehend", status: "laeuft" });
    } catch (e) { setFehler(String(e.message || e)); aufraeumen(); }
  };

  const auflegen = async () => {
    const richtung = anruf?.richtung;
    aufraeumen();
    // !stop bricht Wunsch/klingelnden/laufenden RAUSRUF ab; eingehende Anrufe
    // legt es serverseitig nie auf — da genügt es, die Leitung zu verlassen.
    if (richtung === "ausgehend") telefonBefehl({ typ: "sende", text: "!stop" }).catch(() => {});
  };

  const taste = (z) => {
    if (anruf?.status === "laeuft" && istDtmf(z)) {
      telefonBefehl({ typ: "sende", text: z }).catch(() => setFehler("Tastenton kam nicht durch."));
    } else if (!anruf) {
      setEingabe((e) => (e + z).slice(0, 20));
    }
  };

  const stummSchalten = async () => {
    if (!lkRef.current) return;
    const neu = !stumm;
    setStumm(neu);
    try { await lkRef.current.localParticipant.setMicrophoneEnabled(!neu); } catch { setStumm(!neu); }
  };

  const tasten = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
  const sitzungDa = !!chatSitzungLesen(localStorage);

  return (
    <>
      {anruf?.richtung === "eingehend" && anruf.status === "klingelt" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(10,12,18,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26 }}>
          <div style={{ fontSize: 44 }}>📞</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Eingehender Anruf</div>
          <div style={{ color: "var(--text2)" }}>Festnetz Blattwerk</div>
          <div style={{ display: "flex", gap: 18, marginTop: 10 }}>
            <button className="btn btn-primary" style={{ fontSize: 17, padding: "14px 26px" }} onClick={annehmen}>✅ Annehmen</button>
            <button className="btn btn-secondary" style={{ fontSize: 17, padding: "14px 26px" }} onClick={() => { if (klingelStopRef.current) { klingelStopRef.current(); klingelStopRef.current = null; } setAnruf(null); }}>Ignorieren</button>
          </div>
        </div>
      )}
      <div style={{
        display: sichtbar ? "flex" : "none", flexDirection: "column",
        position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 480, bottom: "calc(58px + env(safe-area-inset-bottom))",
        zIndex: 50, background: "var(--bg)", padding: 18, gap: 12, overflowY: "auto",
      }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Telefon</div>
        {!sitzungDa && <div style={{ color: "var(--text2)", fontSize: 14 }}>Das Telefon nutzt die Chat-Anmeldung — bitte zuerst im Chat anmelden.</div>}
        {sitzungDa && !bereit && <div style={{ color: "var(--text2)", fontSize: 13 }}>Verbinde mit der Chat-Sitzung…</div>}
        {anruf ? (
          <div style={{ textAlign: "center", padding: "6px 0" }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {anruf.status === "verbinde" ? "Verbinde…" : anruf.richtung === "ausgehend" ? `Anruf: ${anruf.nummer || eingabe}` : "Gespräch läuft"}
            </div>
            <div style={{ color: "var(--text2)", fontSize: 12, marginTop: 4 }}>
              {anruf.status === "laeuft" ? "Ziffern unten senden Tastentöne (Warteschleifen)." : "Festnetz Blattwerk"}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ flex: 1, fontFamily: "monospace", fontSize: 22, minHeight: 28, letterSpacing: 1, overflowX: "auto", whiteSpace: "nowrap" }}>{eingabe || <span style={{ color: "var(--text3)", fontSize: 15, fontFamily: "inherit" }}>Rufnummer eingeben…</span>}</div>
            {eingabe && <button className="btn btn-ghost btn-xs" onClick={() => setEingabe((e) => e.slice(0, -1))}>⌫</button>}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {tasten.map((z) => (
            <button key={z} onClick={() => taste(z)} style={{
              padding: "16px 0", fontSize: 22, fontWeight: 600, borderRadius: 14,
              background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", cursor: "pointer",
            }}>{z}</button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 4 }}>
          {anruf ? (
            <>
              {anruf.status === "laeuft" && (
                <button className="btn btn-secondary" style={{ fontSize: 16, padding: "13px 20px" }} onClick={stummSchalten}>{stumm ? "🔈 Laut" : "🔇 Stumm"}</button>
              )}
              <button className="btn" style={{ fontSize: 16, padding: "13px 24px", background: "var(--danger)", color: "#fff", border: 0, borderRadius: 10, cursor: "pointer" }} onClick={auflegen}>📵 Auflegen</button>
            </>
          ) : (
            <button className="btn btn-primary" style={{ fontSize: 17, padding: "14px 34px" }} disabled={!bereit || !eingabe} onClick={starteAnruf}>📞 Anrufen</button>
          )}
        </div>
        {fehler && <div style={{ color: "var(--danger)", fontSize: 13 }}>{fehler}</div>}
        <div style={{ color: "var(--text3)", fontSize: 12, marginTop: "auto" }}>
          Anrufe laufen über die Geschäftsnummer 0641 58092149. Eingehende Anrufe klingeln hier, solange die App offen ist.
        </div>
      </div>
      <div ref={audioRef} style={{ display: "none" }} />
    </>
  );
}

// ─── Bottom Nav ─────────────────────────────────────────────────────────────
// Unten bleiben die drei Alltagsziele; Verwaltung, Zeit und Chat wohnen im
// Burger-Menü (Wunsch vom 20.08.2026 — sechs Punkte unten wurden zu eng).
function BottomNav({ active, onChange, chatUngelesen = 0 }) {
  const block = useBlock();
  const funktion = useFunktion();
  const [menueOffen, setMenueOffen] = useState(false);
  // Ein abgeschalteter Block blendet genau den Punkt aus, der in ihn
  // hineinfuehrt — per bedingtem Spread, damit die einzelnen Eintraege sonst
  // wortgleich bleiben (mehrere andere Tests lesen sie als festen Text).
  const items = [
    { key: "home",       icon: "home",     label: "Start"      },
    ...(block("erp") ? [{ key: "geschaeft",  icon: "invoice",  label: "Geschäft"   }] : []),
    ...(block("kalender") && funktion("kalender") ? [{ key: "kalender",   icon: "calendar", label: "Kalender"   }] : []),
  ];
  const menue = [
    { key: "verwaltung", icon: "shield",   label: "Verwaltung" },
    ...(block("erp") && funktion("zeiterfassung") ? [{ key: "time",       icon: "clock",    label: "Zeit"       }] : []),
    ...(block("fahrtenbuch") && funktion("fahrtenbuch") ? [{ key: "fahrtenbuch", icon: "car",     label: "Fahrtenbuch" }] : []),
    ...(block("erp") && funktion("lager") ? [{ key: "lager",      icon: "archive",  label: "Lager"      }] : []),
    ...(block("chat") && funktion("chat") ? [{ key: "chat",       icon: "chat",     label: "Chat"       }] : []),
    ...(block("telefon") && funktion("telefon") ? [{ key: "telefon",    icon: "phone",    label: "Telefon"    }] : []),
    { key: "einstellungen", icon: "settings", label: "Einstellungen" },
  ];
  const menueAktiv = menue.some(m => m.key === active);
  const waehle = (key) => { setMenueOffen(false); onChange(key); };
  return (
    <>
      {menueOffen && <div className="nav-menue-schleier" onClick={() => setMenueOffen(false)} />}
      {menueOffen && (
        <div className="nav-menue">
          {menue.map(m => (
            <div key={m.key} className={`nav-menue-item ${active === m.key ? "active" : ""}`} onClick={() => waehle(m.key)}>
              <Icon name={m.icon} size={21} />
              <span>{m.label}</span>
              {m.key === "chat" && chatUngelesen > 0 && <span className="nav-marke">{chatMarke(chatUngelesen)}</span>}
            </div>
          ))}
        </div>
      )}
      <nav className="bottom-nav">
        {items.map(i => (
          <div key={i.key} className={`nav-item ${active === i.key ? "active" : ""}`} onClick={() => waehle(i.key)}>
            <Icon name={i.icon} size={21} />
            <span>{i.label}</span>
          </div>
        ))}
        <div className={`nav-item ${menueAktiv ? "active" : ""}`} onClick={() => setMenueOffen(o => !o)}>
          <Icon name="menu" size={21} />
          <span>Menü</span>
          {/* Der Chat steckt im Menü — ohne Marke hier bliebe Ungelesenes unsichtbar. */}
          {chatUngelesen > 0 && active !== "chat" && <span className="nav-marke nav-marke-ecke">{chatMarke(chatUngelesen)}</span>}
        </div>
      </nav>
    </>
  );
}

// ─── Profile ─────────────────────────────────────────────────────────────────
// Shows the connected user (owner of the API key, via /users/info) and lets
// them edit their own profile fields. Saving issues PUT /users/{id}.
function Profile({ api, me, onLogout, showToast, onShowTutorial }) {
  const [user, setUser] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    if (!api) return;
    setLoading(true); setErr("");
    api.getCurrentUser()
      .then((u) => {
        setUser(u);
        setForm({
          firstname: u?.firstname || "",
          lastname: u?.lastname || "",
          email: u?.email || "",
          job: u?.job || "",
          office_phone: u?.office_phone || "",
          user_mobile: u?.user_mobile || "",
        });
      })
      .catch(() => setErr("Profil konnte nicht geladen werden."))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!user?.id) { showToast("Keine Benutzer-ID verfügbar", "error"); return; }
    setSaving(true);
    try {
      await api.updateUser(user.id, form);
      showToast("Profil gespeichert");
      load();
    } catch {
      showToast("Speichern fehlgeschlagen", "error");
    } finally { setSaving(false); }
  };

  const displayName = user
    ? [user.firstname, user.lastname].filter(Boolean).join(" ") || user.login || `#${user.id}`
    : "";
  const initials = (user?.firstname?.[0] || user?.login?.[0] || "?").toUpperCase()
    + (user?.lastname?.[0] || "").toUpperCase();

  return (
    <div className="main">
      <div className="page-header">
        <h2>Profil</h2>
      </div>

      {loading && <div className="loading"><div className="spinner" /> Lädt…</div>}
      {!loading && err && <div className="empty-state"><p>{err}</p></div>}

      {!loading && user && (
        <>
          <div className="profile-hero">
            <div className="profile-avatar">{initials}</div>
            <div className="profile-id">
              <div className="profile-name">{displayName}</div>
              <div className="profile-login">@{user.login}</div>
              <div className="profile-badges">
                {(me?.isAdmin || Number(user.admin) === 1) && <span className="badge badge-open">Administrator</span>}
                {user.email && <span className="chip">{user.email}</span>}
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Persönliche Daten</div>
            <div className="form-row mb12">
              <div className="field-group">
                <label>Vorname</label>
                <input value={form.firstname} onChange={e => set("firstname", e.target.value)} />
              </div>
              <div className="field-group">
                <label>Nachname</label>
                <input value={form.lastname} onChange={e => set("lastname", e.target.value)} />
              </div>
            </div>
            <div className="field-group mb12">
              <label>E-Mail</label>
              <input type="email" value={form.email} onChange={e => set("email", e.target.value)} />
            </div>
            <div className="field-group mb12">
              <label>Position</label>
              <input value={form.job} onChange={e => set("job", e.target.value)} placeholder="z. B. Geschäftsführer" />
            </div>
            <div className="form-row">
              <div className="field-group">
                <label>Telefon</label>
                <input value={form.office_phone} onChange={e => set("office_phone", e.target.value)} />
              </div>
              <div className="field-group">
                <label>Mobil</label>
                <input value={form.user_mobile} onChange={e => set("user_mobile", e.target.value)} />
              </div>
            </div>
          </div>

          <button className="btn btn-primary" style={{ width: "100%" }} disabled={saving} onClick={save}>
            {saving ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Speichere…</> : <><Icon name="check" size={17} /> Profil speichern</>}
          </button>

          <div className="divider" />

          <div className="form-section">
            <div className="form-section-title">Zugang</div>
            <div className="detail-row"><span className="lbl">Benutzername</span><span className="val">{user.login}</span></div>
            <div className="detail-row"><span className="lbl">Benutzer-ID</span><span className="val">#{user.id}</span></div>
            <div className="detail-row"><span className="lbl">Rolle</span><span className="val">{(me?.isAdmin || Number(user.admin) === 1) ? "Administrator" : "Benutzer"}</span></div>
          </div>

          {onShowTutorial && (
            <button className="btn btn-ghost" style={{ width: "100%", marginTop: 4 }} onClick={onShowTutorial}>
              Einführung und Übungen wiederholen
            </button>
          )}
          <button className="btn btn-secondary" style={{ width: "100%", marginTop: 8 }} onClick={onLogout}>
            <Icon name="logout" size={17} /> Abmelden
          </button>
        </>
      )}
    </div>
  );
}



// ─── Einstellungen (Burger-Menü) ─────────────────────────────────────────────
// Seit 09.09.2026 getrennt vom Profil: hier alles, was das Gerät bzw. die App
// betrifft (Darstellung, Buchungskonten, App-Update, Nextcloud, Adminbereich,
// Verbindung/Offline-Daten); im Profil bleibt nur die Person.
function EinstellungenPage({ api, me, theme, setTheme, showToast }) {
  const block = useBlock();
  const mandant = useMandant();
  // Nur Mandanten-Admins duerfen die Firmen-Adressen (Zugänge-Kacheln)
  // aendern — nicht jeder Dolibarr-Admin. darfDiensteAendern() ist reine
  // Praesentationslogik; die eigentliche Durchsetzung liegt in
  // PUT /api/mandant (istMandantAdmin, src/mandant-server.mjs).
  const darfZugaengeAendern = darfDiensteAendern(me, mandant);
  const [showAdmin, setShowAdmin] = useState(false);
  const [ladeRefs, setLadeRefs] = useState(false);
  const dol = (() => { try { return JSON.parse(localStorage.getItem("dolibarr_config") || "{}"); } catch { return {}; } })();
  const offlineNeu = async () => {
    if (!api) return;
    setLadeRefs(true);
    try {
      const res = await offline.refreshRefCache(api);
      showToast(res?.anyLoaded
        ? `Offline-Daten aktualisiert: ${res.thirdparties > 0 ? res.thirdparties : 0} Kontakte, ${res.products > 0 ? res.products : 0} Artikel, ${res.projects > 0 ? res.projects : 0} Projekte`
        : "Keine Offline-Daten geladen — Verbindung prüfen", res?.anyLoaded ? undefined : "error");
    } catch (e) { showToast("Offline-Daten: " + (e?.message || e), "error"); }
    finally { setLadeRefs(false); }
  };
  return (
    <div className="main">
      <div className="page-header"><h2>Einstellungen</h2></div>

      <div className="form-section">
        <div className="form-section-title">Darstellung</div>
        <div className="field-group">
          <label>Modus</label>
          <select value={theme} onChange={e => setTheme(e.target.value)}>
            <option value="light">Hell (Waldgrün)</option>
            <option value="beige">Beige (Holz)</option>
            <option value="dark">Dunkelgrün</option>
            <option value="anthrazit">Anthrazit</option>
          </select>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">Verbindung</div>
        <div className="detail-row"><span className="lbl">Dolibarr</span><span className="val" style={{ fontSize: 12, wordBreak: "break-all" }}>{dol.url || "—"}</span></div>
        <div className="detail-row"><span className="lbl">API-Schlüssel</span><span className="val">{dol.key ? `…${String(dol.key).slice(-4)}` : "—"}</span></div>
        <div style={{ fontSize: 12, color: "var(--text2)", margin: "8px 0 10px" }}>
          Adresse und Schlüssel werden beim Anmelden gesetzt (Abmelden im Profil, dann neu anmelden).
        </div>
        <button className="btn btn-secondary btn-sm" style={{ width: "100%" }} onClick={offlineNeu} disabled={ladeRefs || !api}>
          {ladeRefs ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Lade…</> : "Offline-Daten jetzt aktualisieren"}
        </button>
      </div>

      {/* Buchungskonten sind ein ERP-Begriff (SKR03 auf Dolibarr-Rechnungen) —
          ohne den ERP-Block gibt es hier nichts zu konfigurieren. */}
      {block("erp") && <KontoConfigPanel showToast={showToast} />}

      <ZugaengePanel mandant={mandant} darf={darfZugaengeAendern} showToast={showToast} />

      <AppUpdatePanel showToast={showToast} />

      <NextcloudPanel showToast={showToast} isAdmin={!!me?.isAdmin} />

      {me?.isAdmin && (
        <button className="btn btn-warn" style={{ width: "100%", marginBottom: 12 }} onClick={() => setShowAdmin(v => !v)}>
          <Icon name="settings" size={17} /> Adminbereich {showAdmin ? "schließen" : "öffnen"}
        </button>
      )}
      {me?.isAdmin && showAdmin && <AdminPanel api={api} showToast={showToast} />}
    </div>
  );
}

// Zugänge (Task 11, Ansage Inhaber 18.09.2026): Adressen der Firmen-Dienste
// (Webmail, Website, Nextcloud, Paperless, Vaultwarden, ERP, App-Updates) —
// "fest verdrahtet", nur ein Mandanten-Admin darf sie ändern. Ohne
// Adminrecht rein lesend: kein Eingabefeld, nur die Liste plus ein Satz, wer
// zuständig ist — niemand tippt hier eine Adresse ein.
//
// Editiert wird IMMER auf `mandant.roh` (die ungefilterte Fassung, die der
// Server nur Mandanten-Admins mitschickt), nie auf `mandant.zugaenge`: das
// oeffentliche Feld lässt absichtlich "nextcloud" aus (siehe
// mandantOeffentlich() in src/mandant.js) — ein Admin muss trotzdem die
// Nextcloud-Adresse pflegen können.
function ZugaengePanel({ mandant, darf, showToast }) {
  const mandantRoh = mandant?.roh;
  const [werte, setWerte] = useState(() => ({ ...(mandantRoh?.dienste || {}) }));
  useEffect(() => { setWerte({ ...(mandantRoh?.dienste || {}) }); }, [mandantRoh]);
  const [speichert, setSpeichert] = useState(false);

  const speichern = async () => {
    if (!mandantRoh) return; // ohne roh (kein Mandanten-Admin) gäbe es serverseitig ohnehin 403
    setSpeichert(true);
    try {
      const r = await fetch("/api/mandant", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...mandantRoh, dienste: { ...mandantRoh.dienste, ...werte } }),
      });
      const a = await r.json().catch(() => ({}));
      if (r.ok) showToast("Zugänge gespeichert.");
      else showToast(a.error || "Speichern fehlgeschlagen", "error");
    } catch (_) {
      showToast("Speichern fehlgeschlagen: keine Verbindung zum Server.", "error");
    } finally { setSpeichert(false); }
  };

  // Admin: aus der vollen (ungefilterten) Fassung, damit z. B. Nextcloud mit
  // auftaucht. Ohne Adminrecht steht `mandant.dienste` nur mit dolibarr/
  // updates da (Allowlist in mandantOeffentlich()) — `mandant.zugaenge` ist
  // dort das vollstaendigere, oeffentlich gedachte Feld und exakt das, was
  // auch die Kacheln auf der Startseite zeigen. Ohne diese Fallunterscheidung
  // saehe ein normaler Nutzer hier weniger Adressen als auf seiner eigenen
  // Startseite.
  const anzeige = mandantRoh ? dienstLinks(mandantRoh) : (mandant?.zugaenge || []);

  return (
    <div className="form-section">
      <div className="form-section-title">Zugänge</div>
      {darf ? (
        <>
          <p style={{ color: "var(--text2)", fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
            Adressen der Firmen-Dienste. Leer lassen = auf der Startseite keine Kachel.
          </p>
          {Object.entries(DIENST_LABEL).map(([schluessel, label]) => (
            <div className="field-group mb12" key={schluessel}>
              <label>{label}</label>
              <input
                value={werte[schluessel] || ""}
                onChange={(e) => setWerte((w) => ({ ...w, [schluessel]: e.target.value }))}
                placeholder="https://…example.org"
                inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false}
              />
            </div>
          ))}
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={speichern} disabled={speichert}>
            <Icon name="check" size={16} /> {speichert ? "Speichert…" : "Speichern"}
          </button>
        </>
      ) : (
        <>
          <p style={{ color: "var(--text2)", fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
            Diese Adressen verwaltet der Administrator.
          </p>
          {anzeige.length === 0 ? (
            <div className="pwa-hint">Noch keine Zugänge hinterlegt.</div>
          ) : (
            anzeige.map((l) => (
              <div className="detail-row" key={l.schluessel}>
                <span className="lbl">{l.label}{l.hinweis ? ` (${l.hinweis})` : ""}</span>
                <span className="val" style={{ fontSize: 12, wordBreak: "break-all" }}>{l.url}</span>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}

// Manifest holen — ueber den eigenen Server, NICHT direkt: der Update-Host
// schickt keine CORS-Header, ein direkter fetch aus der WebView endet in
// „Failed to fetch". Klappt der Proxy nicht (aelterer Server), direkt
// versuchen — dann steht wenigstens die echte Ursache in der Meldung.
async function updateManifestHolen(base) {
  const viaProxy = await fetch(`/api/appupdate/manifest?base=${encodeURIComponent(base)}`, { cache: "no-store" });
  if (viaProxy.ok) return viaProxy.json();
  if (viaProxy.status === 404) {
    const direkt = await fetch(manifestUrl(base), { cache: "no-store" });
    if (!direkt.ok) throw new Error(`HTTP ${direkt.status}`);
    return direkt.json();
  }
  const j = await viaProxy.json().catch(() => ({}));
  throw new Error(j.error || `HTTP ${viaProxy.status}`);
}

const UPDATE_BASE_KEY = "blattwerk_update_base";
const UPDATE_STILL_KEY = "blattwerk_update_still_geprueft";
const updateBasisLesen = () => {
  try { return localStorage.getItem(UPDATE_BASE_KEY) || UPDATE_BASE_DEFAULT; }
  catch { return UPDATE_BASE_DEFAULT; }
};

// Stiller Check beim App-Start, hoechstens einmal am Tag. Sass frueher im
// Einstellungs-Panel und lief deshalb nur, wenn man die Einstellungen offen
// hatte — wer nie dort hinging, erfuhr nie von einem Update (11.09.2026).
function useStillerUpdateCheck(showToast) {
  useEffect(() => {
    if (!nativeBridge()) return;               // im Browser gibt es nichts zu installieren
    const heute = updateTag();
    let letzter = null;
    try { letzter = localStorage.getItem(UPDATE_STILL_KEY); } catch (_) {}
    if (!stillFaellig(letzter, heute)) return;
    const basis = updateBasisLesen();
    if (!normalizeUpdateBase(basis)) return;
    const t = setTimeout(async () => {
      try {
        const res = pruefeManifest(await updateManifestHolen(basis), appVersion()?.versionCode);
        try { localStorage.setItem(UPDATE_STILL_KEY, heute); } catch (_) {}
        if (res?.verfuegbar) showToast(`Update ${res.versionName} verfügbar — Einstellungen → App-Update`);
      } catch (_) { /* offline ist der Normalfall, still bleiben */ }
    }, 4000);
    return () => clearTimeout(t);
  }, [showToast]);
}

// App-Update über den internen Host apps-alt.example.org/blattwerk
// (nginx `apps-static` auf .41:8095, nur LAN/NetBird). Nur in der APK sichtbar —
// im Browser gibt es nichts zu installieren.
function AppUpdatePanel({ showToast }) {
  const bridge = nativeBridge();
  const [base, setBase] = useState(updateBasisLesen);
  const [pruefe, setPruefe] = useState(false);
  const [ergebnis, setErgebnis] = useState(null);   // Rückgabe von pruefeManifest
  const [fehler, setFehler] = useState("");
  const [fortschritt, setFortschritt] = useState(-1);
  const eigene = appVersion();

  // Rückmeldungen der nativen Seite (MainActivity.UpdateBridge)
  useEffect(() => {
    window.__updateProgress = (p) => setFortschritt(Number(p) || 0);
    window.__updateReady = () => { setFortschritt(-1); showToast("Installation gestartet — Android fragt gleich nach"); };
    window.__updateFailed = (m) => { setFortschritt(-1); setFehler(String(m || "Update fehlgeschlagen")); };
    return () => { delete window.__updateProgress; delete window.__updateReady; delete window.__updateFailed; };
  }, [showToast]);

  const suchen = useCallback(async (still) => {
    if (!normalizeUpdateBase(base)) { if (!still) setFehler("Keine Update-Adresse hinterlegt"); return null; }
    setPruefe(true); setFehler("");
    try {
      const res = pruefeManifest(await updateManifestHolen(base), eigene?.versionCode);
      setErgebnis(res);
      return res;
    } catch (e) {
      if (!still) setFehler(updateFehlerText(String(e.message || e)));
      return null;
    } finally { setPruefe(false); }
  }, [base, eigene?.versionCode]);

  // Beim Oeffnen des Panels einmal nachsehen, damit hier nicht nur die eigene
  // Fassung steht. Der app-weite Start-Check (useStillerUpdateCheck) meldet
  // sich hoechstens einmal am Tag — dieser hier ist ungetaktet, weil ihn eine
  // bewusste Handlung ausloest: Inhaber hat die Einstellungen aufgemacht.
  useEffect(() => {
    if (!bridge) return;
    let weg = false;
    suchen(true).then(() => { if (weg) return; });
    return () => { weg = true; };
  }, [bridge, suchen]);

  if (!bridge) return null;

  const speichern = (v) => {
    setBase(v);
    try { localStorage.setItem(UPDATE_BASE_KEY, v); } catch (_) {}
  };

  const installieren = () => {
    const url = apkUrl(base, ergebnis?.apk);
    if (!url) { setFehler("Manifest nennt keine APK"); return; }
    setFehler(""); setFortschritt(0);
    bridge.downloadAndInstall(url);
  };

  return (
    <div className="form-section">
      <div className="form-section-title">App-Update</div>
      <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 10 }}>
        Installierte Version: <b>{eigene ? `${eigene.versionName} (${eigene.versionCode})` : "unbekannt"}</b>
      </div>
      <div className="field-group mb12">
        <label>Update-Adresse</label>
        <input type="text" value={base} onChange={(e) => speichern(e.target.value)} placeholder={UPDATE_BASE_DEFAULT} />
        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>
          Nur im Heimnetz oder über NetBird erreichbar.
        </div>
      </div>

      {ergebnis && !ergebnis.verfuegbar && ergebnis.grund === "aktuell" && (
        <div style={{ fontSize: 12, color: "var(--accent)", marginBottom: 8 }}>Die App ist aktuell.</div>
      )}
      {ergebnis?.verfuegbar && (
        <div style={{ fontSize: 13, marginBottom: 8 }}>
          <b>Version {ergebnis.versionName}</b> steht bereit.
          {ergebnis.notes && <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>{ergebnis.notes}</div>}
        </div>
      )}
      {fehler && (
        <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8, display: "flex", gap: 4 }}>
          <Icon name="warning" size={13} /><span>{fehler}</span>
        </div>
      )}
      {fortschritt >= 0 && (
        <div className="progress-bar" style={{ marginBottom: 8 }}>
          <div className="progress-fill" style={{ width: `${fortschritt}%` }} />
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => suchen(false)} disabled={pruefe || fortschritt >= 0}>
          {pruefe ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Suche…</> : <><Icon name="search" size={14} /> Nach Update suchen</>}
        </button>
        {ergebnis?.verfuegbar && (
          <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={installieren} disabled={fortschritt >= 0}>
            {fortschritt >= 0 ? `Lade… ${fortschritt}%` : <><Icon name="archive" size={14} /> Update installieren</>}
          </button>
        )}
      </div>
    </div>
  );
}

// Editor für die Buchungskonten-Auswahlliste + Schlagwort-Regeln (Lieferantenrechnungen).
function KontoConfigPanel({ showToast }) {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState(loadKontoConfig);

  const setKonto = (i, k, v) => setCfg(c => ({ ...c, konten: c.konten.map((x, idx) => idx === i ? { ...x, [k]: v } : x) }));
  const addKonto = () => setCfg(c => ({ ...c, konten: [...c.konten, { number: "", label: "" }] }));
  const delKonto = (i) => setCfg(c => ({ ...c, konten: c.konten.filter((_, idx) => idx !== i) }));

  const setRegelAcc = (i, v) => setCfg(c => ({ ...c, regeln: c.regeln.map((x, idx) => idx === i ? { ...x, account: v } : x) }));
  const setRegelKw = (i, text) => setCfg(c => ({ ...c, regeln: c.regeln.map((x, idx) => idx === i ? { ...x, keywords: text.split(/[\n,]/).map(s => s.trim().toLowerCase()).filter(Boolean) } : x) }));
  const addRegel = () => setCfg(c => ({ ...c, regeln: [...c.regeln, { account: c.standard || KONTO_STD, keywords: [] }] }));
  const delRegel = (i) => setCfg(c => ({ ...c, regeln: c.regeln.filter((_, idx) => idx !== i) }));

  const save = () => {
    const clean = {
      standard: cfg.standard || KONTO_STD,
      konten: cfg.konten.filter(k => (k.number || "").trim()).map(k => ({ number: k.number.trim(), label: (k.label || "").trim() })),
      regeln: cfg.regeln.filter(r => (r.account || "").trim() && (r.keywords || []).length),
    };
    clean.version = KONTO_CFG_VERSION;
    saveKontoConfig(clean); setCfg({ ...clean }); showToast("Buchungskonten gespeichert");
  };
  const reset = () => { if (!window.confirm("Konten & Regeln auf die Blattwerk-Standardwerte zurücksetzen?")) return; const d = { konten: DEFAULT_KONTEN, regeln: DEFAULT_KONTO_REGELN, standard: KONTO_STD, version: KONTO_CFG_VERSION }; saveKontoConfig(d); setCfg({ ...d }); showToast("Auf Standard zurückgesetzt"); };

  return (
    <div className="form-section">
      <div className="form-section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
        <span>Buchungskonten &amp; Regeln</span>
        <Icon name={open ? "minus" : "plus"} size={16} />
      </div>
      {open && (
        <>
          <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 12 }}>
            Auswahl-Konten (SKR03) und Schlagwort-Regeln für den Konto-Vorschlag bei Lieferantenrechnungen.
            Erste passende Regel gewinnt. <b>Konten bitte mit der Buchhaltung abstimmen.</b>
          </div>

          <div className="section-label">Auswahl-Konten</div>
          {cfg.konten.map((k, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <input style={{ width: 84 }} value={k.number} onChange={e => setKonto(i, "number", e.target.value)} placeholder="Konto" />
              <input style={{ flex: 1 }} value={k.label} onChange={e => setKonto(i, "label", e.target.value)} placeholder="Bezeichnung" />
              <button className="btn btn-danger btn-xs" onClick={() => delKonto(i)}><Icon name="trash" size={13} /></button>
            </div>
          ))}
          <button className="btn btn-secondary btn-sm" style={{ width: "100%", marginBottom: 16 }} onClick={addKonto}><Icon name="plus" size={14} /> Konto hinzufügen</button>

          <div className="section-label">Schlagwort-Regeln</div>
          {cfg.regeln.map((r, i) => (
            <div key={i} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 10, marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <select style={{ flex: 1 }} value={r.account} onChange={e => setRegelAcc(i, e.target.value)}>
                  {!cfg.konten.some(k => k.number === r.account) && r.account && <option value={r.account}>{r.account}</option>}
                  {cfg.konten.map(k => <option key={k.number} value={k.number}>{k.number} · {k.label}</option>)}
                </select>
                <button className="btn btn-danger btn-xs" onClick={() => delRegel(i)}><Icon name="trash" size={13} /></button>
              </div>
              <textarea rows={2} value={(r.keywords || []).join(", ")} onChange={e => setRegelKw(i, e.target.value)} placeholder="Schlagwörter, durch Komma getrennt" />
            </div>
          ))}
          <button className="btn btn-secondary btn-sm" style={{ width: "100%", marginBottom: 16 }} onClick={addRegel}><Icon name="plus" size={14} /> Regel hinzufügen</button>

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={reset}>Standard</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={save}><Icon name="check" size={16} /> Speichern</button>
          </div>
        </>
      )}
    </div>
  );
}

function NextcloudPanel({ showToast, isAdmin }) {
  // Gruppe der EIGENEN Firma, nicht fest "Blattwerk" (Abschlusspruefung
  // 18.09.2026, Befund I6): alle Mandanten teilen sich eine Nextcloud, ein
  // fremder Admin haette mit einem Klick seinen Kalender fuer Blattwerks
  // Gruppe freigegeben.
  const ncMandant = useMandant();
  const [cfg, setCfg] = useState(loadNcConfig());
  const [serverInput, setServerInput] = useState(loadNcConfig().server || "");
  const [phase, setPhase] = useState("idle"); // idle | waiting
  const [calendars, setCalendars] = useState([]);
  const [loadingCals, setLoadingCals] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  // `null` = noch nicht von Hand geaendert; dann gilt die Gruppe des
  // Mandanten, auch wenn die Konfiguration erst nach dem ersten Rendern
  // ankommt (mandantAusCache() liefert beim allerersten Start null).
  const [shareGroupEingabe, setShareGroup] = useState(null);
  const shareGroup = shareGroupEingabe ?? (ncMandant?.nextcloud?.gruppe || "");
  const cancelRef = useRef(false);
  const set = (patch) => setCfg(c => { const n = { ...c, ...patch }; saveNcConfig(n); return n; });
  const loggedIn = ncHasAccess(cfg);

  // Angemeldeten Nextcloud-Zugang serverseitig pro Authentik-Nutzer sichern,
  // damit ihn jedes weitere Gerät automatisch bekommt (kein erneuter Login-Flow,
  // überlebt Profil-Resets). Läuft nur hinter Authentik (sonst 403, wird ignoriert).
  useEffect(() => {
    if (!cfg.user || !cfg.pass) return;
    const body = JSON.stringify({
      server: cfg.server, user: cfg.user, pass: cfg.pass,
      calendarUrl: cfg.calendarUrl, calendarName: cfg.calendarName, enabled: cfg.enabled,
    });
    const t = setTimeout(() => {
      apiFetch("/api/sso/register-nc", { method: "POST", headers: { "Content-Type": "application/json" }, body }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [cfg.server, cfg.user, cfg.pass, cfg.calendarUrl, cfg.calendarName, cfg.enabled]);

  const loadCalendars = async (creds) => {
    const c = creds || cfg;
    if (!ncHasAccess(c)) { showToast("Bitte zuerst anmelden", "error"); return; }
    setLoadingCals(true);
    try {
      const r = await apiFetch("/api/nc/calendars", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ server: c.server, user: c.user, pass: c.pass }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || ("Status " + r.status));
      const cals = data.calendars || [];
      setCalendars(cals);
      if (!cals.length) { showToast("Keine Kalender gefunden"); return; }
      // Der Team-Kalender ist die Vorgabe — nicht mehr irgendein Kalender mit
      // "Blattwerk" im Namen, und ausdrücklich nicht des Inhabers privater. Er wird
      // auch dann gesetzt, wenn schon etwas gespeichert ist: nach dem Umzug am
      // 06.08.2026 zeigten gespeicherte Adressen auf den alten, privaten
      // Kalender, und Termine wären am Team vorbeigelaufen.
      const bw = ncFindTeamKalender(cals);
      if (bw && bw.url !== cfg.calendarUrl) {
        set({ calendarUrl: bw.url, calendarName: bw.name, enabled: true });
        showToast(`Team-Kalender „${bw.name}" ausgewählt`);
      }
    } catch (e) { showToast("Kalender laden fehlgeschlagen: " + (e?.message || e), "error"); }
    finally { setLoadingCals(false); }
  };

  // Admin: den gewählten Kalender in Nextcloud für die Team-Gruppe freigeben
  // (Schreibzugriff) — danach sehen alle Mitglieder ihn im eigenen Nextcloud
  // und die App findet ihn beim Anmelden automatisch.
  const shareWithGroup = async () => {
    if (!cfg.calendarUrl) { showToast("Bitte zuerst einen Kalender wählen", "error"); return; }
    const grp = (shareGroup || "").trim();
    if (!grp) { showToast("Bitte Gruppennamen angeben", "error"); return; }
    setShareBusy(true);
    try {
      const r = await apiFetch("/api/nc/share-group", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: cfg.user, pass: cfg.pass, calendarUrl: cfg.calendarUrl, group: grp }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || ("Status " + r.status));
      showToast(`Kalender für Gruppe „${grp}" freigegeben`);
    } catch (e) { showToast("Freigabe fehlgeschlagen: " + (e?.message || e), "error"); }
    finally { setShareBusy(false); }
  };

  const login = async () => {
    const raw = (serverInput || "").trim();
    if (!raw) { showToast("Bitte Nextcloud-Adresse eingeben", "error"); return; }
    const srv = /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
    cancelRef.current = false;
    setPhase("waiting");
    const popup = window.open("", "_blank"); // synchron öffnen (Popup-Blocker)
    try {
      const r = await apiFetch("/api/nc/login/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ server: srv }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || ("Start fehlgeschlagen (" + r.status + ")"));
      if (popup) popup.location = data.login; else window.location.href = data.login;
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        if (cancelRef.current) { setPhase("idle"); return; }
        await new Promise(res => setTimeout(res, 3000));
        if (cancelRef.current) { setPhase("idle"); return; }
        const pr = await apiFetch("/api/nc/login/poll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: data.endpoint, token: data.token }) });
        if (pr.status === 200) {
          const creds = await pr.json();
          const next = { server: creds.server || srv, user: creds.loginName, pass: creds.appPassword };
          set(next);
          try { popup && popup.close(); } catch (_) {}
          setPhase("idle");
          showToast("Angemeldet als " + creds.loginName);
          loadCalendars(next);
          return;
        }
      }
      throw new Error("Zeitüberschreitung – Anmeldung nicht abgeschlossen");
    } catch (e) { try { popup && popup.close(); } catch (_) {} setPhase("idle"); showToast("Login-Fehler: " + (e?.message || e), "error"); }
  };

  // `managed` MUSS mit zurueckgesetzt werden: bliebe es stehen, haette der
  // Eintrag danach kein calendarUrl mehr (also nicht verbunden), gaelte beim
  // naechsten Start aber wegen `managed` nicht als leer — der Team-Kalender
  // kaeme nie wieder. Eine Sackgasse, erreichbar mit einem einzigen Klick.
  const logout = () => { set({ user: "", pass: "", calendarUrl: "", calendarName: "", managed: false, team: false }); setCalendars([]); };

  return (
    <div className="form-section">
      <div className="form-section-title">Nextcloud-Kalender</div>
      <p style={{ color: "var(--text2)", fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
        Mit deinem <b>eigenen Nextcloud-Konto</b> anmelden — der Kalender-Tab zeigt dann den
        gemeinsamen Blattwerk-Kalender, und Zu-/Absagen laufen über dein Konto
        (dadurch für alle in der Gruppe sichtbar, auch direkt in Nextcloud).
      </p>

      {!loggedIn ? (
        <>
          <div className="field-group mb16">
            <label>Nextcloud-Adresse</label>
            <input value={serverInput} onChange={e => setServerInput(e.target.value)}
              placeholder="z. B. nextcloud.example.org" inputMode="url"
              autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          </div>
          {phase === "waiting" ? (
            <>
              <div className="chip" style={{ marginBottom: 10 }}>Warte auf Anmeldung im Browser-Tab…</div>
              <button className="btn btn-secondary" style={{ width: "100%" }} onClick={() => { cancelRef.current = true; }}>Abbrechen</button>
            </>
          ) : (
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={login}>
              <Icon name="cloud" size={17} /> Mit Nextcloud anmelden
            </button>
          )}
        </>
      ) : (
        <>
          <div className="chip" style={{ marginBottom: 12 }}>Angemeldet: {cfg.user} @ {(cfg.server || "").replace(/^https?:\/\//, "")}</div>
          {cfg.managed && cfg.team && (
            // Task 11: das gemeinsame Dienstkonto der Firma (ncTeamCreds,
            // ueber mandant.json.nextcloud.dienstkonto oder die alten
            // SSO_NC_TEAM_*-ENV-Werte konfiguriert) — kein persoenlicher,
            // im SSO-Store hinterlegter Zugang (der setzt `managed`, aber
            // NIE `team`). Nur Hinweis, keine Sperre: die Kalenderauswahl
            // unten bleibt bedienbar.
            <div className="pwa-hint" style={{ marginBottom: 12 }}>
              Kalenderzugang ist zentral verwaltet (Dienstkonto der Firma) — hier muss sich niemand einzeln anmelden.
              Verwendeter Kalender: <b>{cfg.calendarName || "—"}</b>.
            </div>
          )}
          <div className="field-group mb16">
            <label>Kalender (wohin geschrieben wird)</label>
            <select value={cfg.calendarUrl || ""} onChange={e => { const sel = calendars.find(c => c.url === e.target.value); set({ calendarUrl: e.target.value, calendarName: sel ? sel.name : cfg.calendarName }); }}>
              <option value="">— bitte wählen —</option>
              {cfg.calendarUrl && !calendars.find(c => c.url === cfg.calendarUrl) && <option value={cfg.calendarUrl}>{cfg.calendarName || "(gespeichert)"}</option>}
              {calendars.map(c => <option key={c.url} value={c.url} disabled={!c.writable}>{c.name}{c.writable ? "" : " (nur lesen)"}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} disabled={loadingCals} onClick={() => loadCalendars()}>{loadingCals ? "Lade…" : "Kalender laden"}</button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={logout}>Abmelden</button>
          </div>
          <div className="field-group mb16">
            <label>Termine synchronisieren</label>
            <select value={cfg.enabled ? "1" : "0"} onChange={e => set({ enabled: e.target.value === "1" })}>
              <option value="0">Aus</option>
              <option value="1">An</option>
            </select>
          </div>
          {cfg.enabled && !cfg.calendarUrl && <p style={{ color: "var(--warn)", fontSize: 12 }}>Bitte noch einen Kalender auswählen.</p>}
          {isAdmin && (
            <>
              <div className="section-label" style={{ marginTop: 4 }}>Team-Freigabe (Admin)</div>
              <p style={{ color: "var(--text2)", fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
                Gibt den gewählten Kalender in Nextcloud für die Gruppe frei (Schreibzugriff) —
                nötig, damit alle Mitglieder mit ihrem eigenen Konto zu-/absagen können.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ flex: 1 }} value={shareGroup} onChange={e => setShareGroup(e.target.value)} placeholder="Nextcloud-Gruppe" />
                <button className="btn btn-secondary" disabled={shareBusy} onClick={shareWithGroup}>
                  {shareBusy ? "Gebe frei…" : "Freigeben"}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// Funktionen je Betrieb schalten + Dolibarr-Abgleich. Speichert ueber
// PUT /api/mandant (nur Mandanten-Admin, wie die Rechte oben).
function FunktionenEditor({ api, mandant, mandantRoh, showToast }) {
  const [schalter, setSchalter] = useState(() => ({ ...(mandantRoh?.funktionen || {}) }));
  const [abgleich, setAbgleich] = useState(null);
  const [laeuft, setLaeuft] = useState(false);
  const entwurf = { ...mandant, funktionen: schalter };
  const liste = funktionenFuer(entwurf);
  const bloecke = [...new Set(liste.map(f => [].concat(f.block)[0] || ""))];

  const umschalten = (f) => {
    const neu = !(schalter[f.key] ?? funktionenStandard(mandant?.kuerzel)[f.key]);
    if (!neu) {
      const mit = kaskade(f.key).filter(k => funktionAktiv(entwurf, k));
      if (mit.length && !window.confirm(`${f.label} abschalten? Damit gehen auch aus: ${mit.map(k => funktionInfo(k).label).join(", ")}`)) return;
    }
    setSchalter(s => ({ ...s, [f.key]: neu }));
  };

  const speichern = async () => {
    const r = await fetch("/api/mandant", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...mandantRoh, funktionen: schalter }) });
    const a = await r.json().catch(() => ({}));
    if (r.ok) showToast("Funktionen gespeichert."); else showToast(a.error || "Speichern fehlgeschlagen", "error");
  };

  const pruefen = async () => {
    setLaeuft(true);
    try {
      const moduleAktiv = await api.getSetupModules().catch(() => null);
      const setup = await api.getAppSetup().catch(() => null);
      setAbgleich(dolibarrAbgleich(entwurf, { moduleAktiv, setup }));
    } finally { setLaeuft(false); }
  };
  const einrichten = async () => {
    setLaeuft(true);
    try {
      await api.postAppSetup(einrichtungsAuftrag(abgleich.punkte));
      showToast("Dolibarr eingerichtet.");
      await pruefen();
    } catch (err) { showToast(doliError(err) || "Einrichten fehlgeschlagen", "error"); }
    finally { setLaeuft(false); }
  };

  return (
    <>
      <div className="divider" />
      <div className="form-section-title">Funktionen dieses Betriebs</div>
      {bloecke.map(b => (
        <div className="field-group mb16" key={b || "allgemein"}>
          <label>{b ? `Block ${b}` : "Allgemein"}</label>
          <div className="permission-grid">
            {liste.filter(f => ([].concat(f.block)[0] || "") === b).map(f => (
              <label key={f.key} className={`permission-chip ${f.aktiv ? "active" : ""}`} title={!f.blockAktiv ? "Block ist aus" : f.pflicht ? "Pflicht" : ""}>
                <input type="checkbox" checked={f.aktiv} disabled={!f.blockAktiv || !!f.pflicht} onChange={() => umschalten(f)} />
                <span>{f.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      {!mandantRoh && <div className="pwa-hint" style={{marginBottom:12}}>Speichern nur mit Mandanten-Admin-Rechten.</div>}
      <div style={{display:"flex", gap:10}}>
        <button className="btn btn-primary" style={{flex:1}} onClick={speichern} disabled={!mandantRoh}><Icon name="check" size={16}/> Funktionen speichern</button>
        <button className="btn btn-secondary" style={{flex:1}} onClick={pruefen} disabled={laeuft}>Dolibarr prüfen</button>
      </div>
      {abgleich && !abgleich.geprueft && <div className="pwa-hint" style={{marginTop:12}}>Dolibarr nicht erreichbar — nicht geprüft.</div>}
      {abgleich?.geprueft && (
        <div style={{marginTop:12}}>
          {abgleich.punkte.filter(p => p.fehlt).length === 0
            ? <div className="chip">Dolibarr passt zu den aktiven Funktionen.</div>
            : abgleich.punkte.filter(p => p.fehlt).map((p, i) => (
              <div key={i} className="pwa-hint" style={{marginBottom:6}}>
                <b>{p.label}</b>: {p.art === "modul" ? `Dolibarr-Modul „${p.name}“ fehlt` : p.art === "zusatzfeld" ? `Zusatzfeld ${p.name} fehlt` : p.art === "kontenrahmen" ? `Kontenrahmen ${p.name} nicht gesetzt` : "Modul blattwerkapp nach custom/ kopieren und aktivieren"}
              </div>
            ))}
          {abgleich.punkte.some(p => p.fehlt) && (
            <button className="btn btn-success" style={{width:"100%", marginTop:8}} onClick={einrichten} disabled={!abgleich.einrichtbar || laeuft}>
              {abgleich.einrichtbar ? "Fehlendes in Dolibarr einrichten" : "Einrichten nur als Dolibarr-Admin und mit Modul blattwerkapp"}
            </button>
          )}
        </div>
      )}
    </>
  );
}

function AdminPanel({ api, showToast }) {
  const mandant = useMandant();
  // Nur mit Mandanten-Admin-Rechten liefert GET /api/mandant `roh` mit — ohne
  // dieses Feld darf hier niemand speichern (PUT /api/mandant ist serverseitig
  // auf MANDANT_ADMINS beschraenkt, siehe mandant-server.mjs). Ein Dolibarr-
  // Admin dieser Firma ist damit nicht automatisch Mandanten-Admin; ein
  // eigener Schreibweg fuer Mandanten-eigene Admins ist eine spaetere Aufgabe.
  const mandantRoh = mandant?.roh;
  const [groups, setGroups] = useState([]);
  const [cfg, setCfg] = useState(loadPermissionGroups(mandant));
  const [mailInfo, setMailInfo] = useState("");
  const warteschlangen = mandant ? warteschlangenStand(mandant, localStorage) : [];
  const fields = [
    ["validateInvoices", "Rechnungen validieren"],
    ["validateProposals", "Angebote validieren"],
    ["setProposalStatus", "Angebote beauftragt/abgelehnt setzen"],
    ["validateSupplierInvoices", "Lieferantenrechnungen validieren"],
    ["validateExpenses", "Spesen validieren"],
    ["closeProjects", "Projekte schließen"],
    ["recordPayments", "Zahlungen auf Rechnungen erfassen"],
    ["viewFinanzen", "Kontostände & Finanzübersicht sehen"],
    ["uploadDokumente", "Betriebsdokumente hochladen"],
    ...KACHELN.map((k) => [kachelKey(k.id), `Kachel „${k.label}" sehen (${k.ort})`]),
  ];

  useEffect(() => {
    api.getUserGroups?.()
      .then(g => setGroups(Array.isArray(g) ? g : []))
      .catch(() => setGroups([]));
  }, [api]);

  const actualGroups = groups
    .map(g => ({ id: g.id || g.rowid || g.fk_usergroup, name: g.name || g.nom || g.label }))
    .filter(g => g.name)
    .filter((g, idx, arr) => arr.findIndex(x => normGroup(x.name) === normGroup(g.name)) === idx);

  const isSelected = (key, groupName) => (cfg[key] || []).map(normGroup).includes(normGroup(groupName));
  const toggleGroup = (key, groupName) => {
    setCfg(c => {
      const current = c[key] || [];
      const exists = current.map(normGroup).includes(normGroup(groupName));
      const next = exists
        ? current.filter(n => normGroup(n) !== normGroup(groupName))
        : [...current, groupName];
      return { ...c, [key]: next };
    });
  };
  // Speichert jetzt ueber den Server (PUT /api/mandant) statt in localStorage,
  // damit die Einstellung fuer ALLE Geraete gilt statt nur fuer das, an dem
  // sie gesetzt wurde (Aufgabe: Rechte serverseitig statt im Geraet). Ohne
  // Mandanten-Admin-Rechte (mandantRoh fehlt) weist der Server mit 403 ab —
  // das wird unten als klare deutsche Meldung gezeigt, nie stillschweigend
  // als "gespeichert" behandelt.
  const speichern = async () => {
    // Only persist groups that really exist in this Dolibarr instance. This avoids
    // pseudo names like "admin", "administratoren" or "management" appearing in
    // the UI when Dolibarr only has "Admins" and "Geschäftsführer".
    const existing = actualGroups.map(g => normGroup(g.name));
    const cleaned = Object.fromEntries(fields.map(([key]) => [
      key,
      (cfg[key] || []).filter(name => (name === "*" && KACHEL_RECHTE.includes(key)) || existing.includes(normGroup(name)))
    ]));
    try {
      const r = await fetch("/api/mandant", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...mandantRoh, rechte: { ...cfg, ...cleaned } }),
      });
      const a = await r.json().catch(() => ({}));
      if (r.ok) {
        setCfg({ ...loadPermissionGroups(mandant), ...cleaned });
        showToast("Rechte gespeichert.");
      } else {
        showToast(a.error || "Speichern fehlgeschlagen", "error");
      }
    } catch (_) {
      showToast("Speichern fehlgeschlagen: keine Verbindung zum Server.", "error");
    }
  };

  return (
    <div className="form-section">
      <div className="form-section-title">Adminbereich · App-Rechte</div>
      <p style={{color:"var(--text2)",fontSize:13,lineHeight:1.5,marginBottom:12}}>
        Hier können nur Benutzergruppen ausgewählt werden, die in Dolibarr wirklich existieren.
      </p>
      {actualGroups.length === 0 ? (
        <div className="pwa-hint" style={{marginBottom:12}}>
          Keine Gruppen über die Dolibarr-API gefunden. Bitte prüfen, ob der API-Benutzer Benutzergruppen lesen darf.
        </div>
      ) : (
        <div className="chip" style={{marginBottom:12}}>Gefundene Gruppen: {actualGroups.map(g => g.name).join(", ")}</div>
      )}
      {fields.map(([key, label]) => (
        <div className="field-group mb16" key={key}>
          <label>{label}</label>
          <div className="permission-grid">
            {[...(KACHEL_RECHTE.includes(key) ? [{ id: "*", name: "*" }] : []), ...actualGroups].map(g => (
              <label key={`${key}-${g.id || g.name}`} className={`permission-chip ${isSelected(key, g.name) ? "active" : ""}`}>
                <input
                  type="checkbox"
                  checked={isSelected(key, g.name)}
                  onChange={() => toggleGroup(key, g.name)}
                />
                <span>{g.name === "*" ? "Alle" : g.name}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      {!mandantRoh && (
        <div className="pwa-hint" style={{marginBottom:12}}>
          Speichern ist hier nur mit Mandanten-Admin-Rechten möglich (Authentik-Login als Firmen-Admin). Ein Versuch zeigt eine Fehlermeldung statt still zu scheitern.
        </div>
      )}
      <button className="btn btn-primary" style={{width:"100%"}} onClick={speichern}><Icon name="check" size={16}/> Rechte speichern</button>

      {warteschlangen.length > 0 && (
        <>
          <div className="divider" />
          <div className="form-section-title">Wartende Einträge abgeschalteter Funktionen</div>
          {warteschlangen.map(w => (
            <div key={w.key} className="pwa-hint" style={{marginBottom:8}}>
              {w.anzahl} wartende Einträge in <b>{w.label}</b> (Funktion ist aus). Sie werden weder hochgeladen noch gelöscht.
              <button className="btn btn-secondary btn-sm" style={{marginLeft:8}} onClick={() => {
                const blob = new Blob([localStorage.getItem(WARTESCHLANGEN_SPEICHER[w.key]) || "[]"], { type: "application/json" });
                const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${w.key}-warteschlange.json`; a.click();
              }}>Exportieren</button>
            </div>
          ))}
          <div className="pwa-hint">Baumkataster-Offline-Daten werden hier nicht mitgezählt.</div>
        </>
      )}

      <FunktionenEditor api={api} mandant={mandant} mandantRoh={mandantRoh} showToast={showToast} />

      <div className="divider" />
      <div className="form-section-title">Mailversand</div>
      <p style={{color:"var(--text2)",fontSize:13,lineHeight:1.5,marginBottom:12}}>
        Der Versand läuft über Dolibarr. Dadurch werden die dort hinterlegten E-Mail-Vorlagen und SMTP-Einstellungen genutzt. Die App sendet bei Kundenrechnungen die Vorlage <b>Kundenrechnung</b> und bei Angeboten die Vorlage <b>Angebot</b> mit.
      </p>
      <div className="pwa-hint">Ein eigener Mail-Posteingang in der App braucht später ein kleines Backend. Zugangsdaten/OAuth-Tokens sollten nicht im Browser gespeichert werden.</div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
// Dienst -> Icon fuer die Zugaenge-Kacheln (rein optisch, kein eigenes
// Recht). Ohne Eintrag faellt Icon() selbst auf sein Warn-Symbol zurueck —
// bewusst kein weiterer Fallback hier noetig.
const DIENST_ICON = {
  dolibarr: "invoice", nextcloud: "folder", webmail: "mail", wordpress: "eye",
  paperless: "archive", vaultwarden: "shield", updates: "download",
};

function Dashboard({ api, connected, me, onNavigate, showToast }) {
  const block = useBlock();
  const funktion = useFunktion();
  const mandant = useMandant();
  const zugaenge = mandant?.zugaenge || [];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";
  const firstName = me?.firstname || me?.login || "";

  // Genau diese eine Stelle für den Offline-Bestand der Vor-Ort-GBU (Aufgabe
  // Teilprojekt B): wie viele PDFs liegen gerade auf DIESEM Gerät, unabhängig
  // vom Netz. `stand` ist der Zeitpunkt der Abfrage, nicht der Ablage — eine
  // Auffrischung braucht IndexedDB (async), deshalb kein Rendern in Echtzeit.
  const [gbuOffline, setGbuOffline] = useState(null); // { anzahl, stand }
  useEffect(() => {
    let aktiv = true;
    idbSchluessel(GBU_PDF_DB, GBU_PDF_SPEICHER).then((schluessel) => {
      if (!aktiv) return;
      const jetzt = new Date();
      setGbuOffline({ anzahl: schluessel.length, stand: `${String(jetzt.getHours()).padStart(2, "0")}:${String(jetzt.getMinutes()).padStart(2, "0")}` });
    }).catch(() => {});
    return () => { aktiv = false; };
  }, [connected]);

  return (
    <div className="main">
      <div className="dash-greeting">
        <h2>{greeting}{firstName ? `, ${firstName}` : ""}</h2>
        <p>{new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
      </div>
      {gbuOffline?.anzahl > 0 && (
        <p style={{ fontSize: 12.5, color: "var(--text2)", margin: "-6px 0 12px" }}>
          {gbuOffline.anzahl} Beurteilung{gbuOffline.anzahl === 1 ? "" : "en"} offline verfügbar (Stand {gbuOffline.stand})
        </p>
      )}
      <div className="dash-userbar" onClick={() => onNavigate("profile")}>
        <div className="connection-badge" style={{ margin: 0 }}>
          <div className={`dot ${connected ? "" : "offline"}`} />
          {connected ? "Verbunden" : "Nicht verbunden"}
        </div>
        <div className="dash-user-chip">
          <div className="dash-user-avatar"><Icon name="user" size={16} /></div>
          <span>{me?.firstname || me?.lastname ? `${me.firstname} ${me.lastname}`.trim() : (me?.login || "Profil")}</span>
        </div>
      </div>

      <div className="section-label">Schnellzugriff</div>
      {/* Ein abgeschalteter Block blendet genau die Kachel aus, die in ihn
          hineinfuehrt — per bedingtem Spread, damit die einzelnen Eintraege
          sonst wortgleich bleiben (test/qualifikationen liest die
          Arbeitsschutz-Kachel als festen Text). */}
      <QuickActionGrid onNavigate={onNavigate} buttons={kachelnFiltern(me, [
        ...(block("erp") && funktion("angebote") ? [{ label: "Neues Angebot",   nav: "proposals", color: "var(--k-moos-bg)", accent: "var(--k-moos)", icon: "angebotNeu" }] : []),
        ...(block("erp") && funktion("bestellungen") ? [{ label: "Bestellung aufgeben", nav: "orders", color: "var(--k-petrol-bg)", accent: "var(--k-petrol)", icon: "cart" }] : []),
        ...(block("erp") && funktion("zeiterfassung") ? [{ label: "Zeiterfassung", nav: "time", color: "var(--k-schiefer-bg)", accent: "var(--k-schiefer)", icon: "clock" }] : []),
        ...(block("fahrtenbuch") && funktion("fahrtenbuch") ? [{ label: "Fahrtenbuch", nav: "fahrtenbuch", color: "var(--k-erde-bg)", accent: "var(--k-erde)", icon: "car" }] : []),
        // Das Abzeichen zählt jetzt drei Dinge: noch nicht hochgeladene
        // Beurteilungen, Einweisungen, deren Frist läuft oder abgelaufen ist,
        // und Fortbildungen, die ablaufen oder abgelaufen sind (Reiter Personal).
        ...(block("arbeitsschutz") && funktion("gbu") ? [{ label: "Arbeitsschutz", nav: "gbu", color: "var(--k-ocker-bg)", accent: "var(--k-ocker)", icon: "shield", badge: gbuPendingCount() + ewOffenCount() + qualiOffenCount() }] : []),
        // Eigene Kachel statt eines Postens im Arbeitsschutz-Abzeichen: ein
        // abgelaufener Verbandkasten und eine fällige Einweisung verlangen
        // verschiedene Handgriffe, und ein zusammengezähltes Abzeichen sagt
        // nicht, welcher der beiden ansteht. Gehoert trotzdem zum Arbeitsschutz-
        // Block, nicht zum ERP-Block.
        ...(block("arbeitsschutz") && funktion("betriebsmittel") ? [{ label: "Betriebsmittel", nav: "betriebsmittel", color: "var(--k-pflaume-bg)", accent: "var(--k-pflaume)", icon: "werkzeug", badge: bmOffenCount() }] : []),
        ...(block("belege") && funktion("lieferantenrechnungen") ? [{ label: "Lieferantenrechnung", nav: "supplierinvoices", color: "var(--k-rost-bg)", accent: "var(--k-rost)", icon: "suppliers" }] : []),
        ...(block("erp") && funktion("spesen") ? [{ label: "Spesen",          nav: "expenses",  color: "var(--k-ziegel-bg)", accent: "var(--k-ziegel)", icon: "bon" }] : []),
      ])} />

    </div>
  );
}

function QuickActionGrid({ buttons, onNavigate }) {
  return (
    <div className="quick-actions">
      {buttons.map(q => (
        <div key={q.label} className="quick-btn" onClick={() => onNavigate(q.nav)}>
          <div className="quick-btn-icon" style={{ background: q.color, color: q.accent }}>
            <Icon name={q.icon} size={19} />
            {q.badge > 0 && <span className="quick-btn-badge">{q.badge}</span>}
          </div>
          <span>{q.label}</span>
        </div>
      ))}
    </div>
  );
}

// Eine Liste, vier Verwendungen — der einzige Unterschied ist das Schlagwort
// (Grundlagen bekommt serverseitig zusätzlich einen fest gekoppelten
// Themen-Ausschluss, siehe /api/pl/list in server.mjs, Befund 3). Der
// Wortlaut der Ampel kommt aus src/arbeitsschutz.js (EW_STUFEN_TEXT), damit ein
// abgelaufenes Dokument hier genauso heisst wie eine abgelaufene Einweisung —
// die FARBE NICHT: arbeitsschutz.js ist reine Fristenrechnung, keine
// Darstellung. ueberfaellig/ungueltig/bald verweisen deshalb auf dieselbe
// fg-Farbe wie das Einweisungs-Badge (EW_STUFE_FARBE oben) statt sie ein
// zweites Mal hinzuschreiben — genau das lief zuvor auseinander (Befund 4c:
// #e03131 vs. var(--danger)). "gueltig"/"kein" bleiben eigene, bewusst
// zurückhaltende Grautöne: hier steht der Text neben einem Datum in einer
// Liste, nicht in einem auffälligen Badge — ein grünes „gültig" wäre hier
// eine Behauptung, die sich der Fließtext nicht leisten soll.
const PL_AMPEL = {
  ueberfaellig: EW_STUFE_FARBE.ueberfaellig.fg,
  bald: EW_STUFE_FARBE.bald.fg,
  gueltig: "var(--text2)",
  ungueltig: EW_STUFE_FARBE.ungueltig.fg,
  kein: "var(--text2)",
};

// `eingebettet`: ohne eigene Seitenhülle (Kopfzeile/Zurück-Pfeil) — für den Fall,
// dass eine andere Seite die Liste in ihre eigene Hülle einbettet (Reiter,
// Abschnitt). Ohne den Schalter bringt die Komponente ihre eigene volle Seite
// mit (wie bei den Kacheln in VerwaltungPage). Mit Schalter steht `titel` als
// section-label über der Liste statt als <h2> — sonst gibt es zwei gestapelte
// Kopfzeilen, zwei Zurück-Pfeile, doppelte Innenabstände (Befund K1).
function PaperlessDocs({ thema, titel, hinweis, onBack, showToast, eingebettet }) {
  const [docs, setDocs] = useState(null);
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState("");
  const [viewer, setViewer] = useState(null);      // { url?, name, loading }
  const [gueltigBis, setGueltigBis] = useState("");
  const [hochladen, setHochladen] = useState(false);
  const dateiRef = useRef(null);
  const heute = new Date().toISOString().slice(0, 10);
  // Dokumentdatum (Befund 4a): plUpload in server.mjs kommentiert ausdrücklich,
  // dass NICHT das Hochladedatum einsortiert werden soll — die Liste sortiert
  // danach (ordering=-created). Vorbelegt mit heute (der Normalfall: ein
  // frisch entstandenes Dokument), beim Einscannen eines alten Schreibens
  // hier korrigierbar, genau wie das Import-Skript das Datum aus dem
  // Dateinamen zieht statt vom Scanzeitpunkt.
  const [datumDok, setDatumDok] = useState(heute);
  // Serverseitiges Limit ist 30 MB Rumpf (server.mjs) — Base64 blaeht die
  // Datei um ein Drittel auf, macht rund 22 MB Originalgroesse (Befund 5).
  const maxDateiBytes = 22 * 1024 * 1024;

  // Blob-URL des offenen PDFs (fuer URL.revokeObjectURL) und der Nachlade-Timer
  // nach dem Upload leben in Refs, damit ein einziger Aufraeum-Effekt sie beim
  // Verlassen der Seite sauber beendet, egal in welchem Zustand sie gerade sind.
  const viewerUrlRef = useRef(null);
  const reloadTimerRef = useRef(null);
  const unmountedRef = useRef(false);
  useEffect(() => {
    // Beim Einhaengen zuruecksetzen, nicht nur beim Verlassen setzen: React
    // ruft im Entwicklungsmodus einmal Aufraeumen und Einhaengen hintereinander
    // aus, um fehlendes Aufraeumen aufzudecken. Ohne das Zuruecksetzen bliebe
    // die Seite danach dauerhaft als "verlassen" vermerkt, und jedes PDF haenge
    // auf "Laedt...", weil oeffnen() das Setzen des Zustands verwirft.
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
    };
  }, []);

  const laden_ = useCallback(() => {
    setLaden(true); setFehler("");
    apiFetch(`/api/pl/list?thema=${encodeURIComponent(thema)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || r.status);
        return d;
      })
      .then((d) => setDocs(Array.isArray(d.docs) ? d.docs : []))
      // Fehler NICHT als leere Liste zeigen: „keine Unterlagen" und „Archiv
      // nicht erreichbar" sind zwei verschiedene Aussagen. Eine schon geladene
      // Liste bleibt bei einem fehlgeschlagenen Nachladen (z. B. 4s nach einem
      // Upload) stehen — nur beim allerersten Laden gibt es noch keine Liste,
      // die man erhalten koennte.
      .catch((e) => {
        setDocs((prev) => (Array.isArray(prev) ? prev : null));
        setFehler(String(e.message || e));
      })
      .finally(() => setLaden(false));
  }, [thema]);
  useEffect(() => { laden_(); }, [laden_]);

  // Schliesst den Betrachter und gibt die Blob-URL des gerade gezeigten PDFs
  // frei — der einzige Weg zurueck in den Zustand "kein Viewer offen".
  const schliessen = () => {
    if (viewerUrlRef.current) { URL.revokeObjectURL(viewerUrlRef.current); viewerUrlRef.current = null; }
    setViewer(null);
  };

  // Zweiter Weg neben der Anzeige: wer das Blatt ausdrucken oder weiterschicken
  // will, kommt so an die Datei. Gleiches Muster wie im Beleg-Betrachter.
  const herunterladen = (v) => {
    if (!v?.url) return;
    const a = document.createElement("a");
    a.href = v.url;
    a.download = (v.name || "dokument").replace(/[\\/:*?"<>|]/g, "_") + ".pdf";
    document.body.appendChild(a); a.click(); a.remove();
  };

  const oeffnen = async (d) => {
    setViewer({ name: d.titel, loading: true });
    try {
      const r = await apiFetch(`/api/pl/file/${d.id}${thema === PL_ALLE ? "?thema=alle" : ""}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
      const url = URL.createObjectURL(await r.blob());
      // Seite/Komponente wurde waehrend des Ladens verlassen: niemand sieht das
      // PDF mehr, die URL gleich wieder freigeben statt sie herrenlos zu lassen.
      if (unmountedRef.current) { URL.revokeObjectURL(url); return; }
      // Vorherige URL freigeben, bevor die neue an ihre Stelle tritt (Wechsel
      // zum naechsten Dokument darf nicht beide gleichzeitig im Speicher halten).
      if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
      viewerUrlRef.current = url;
      setViewer({ url, name: d.titel });
    } catch (e) {
      setViewer(null);
      showToast("PDF laden fehlgeschlagen: " + (e?.message || e), "error");
    }
  };

  const gewaehlt = async (ev) => {
    const datei = ev.target.files?.[0];
    ev.target.value = "";
    if (!datei) return;
    // Vor dem Einlesen pruefen: eine zu grosse Datei erst minutenlang hashen
    // und dann per 413 abgewiesen zu bekommen, ist doppelt unnoetig (Befund 5).
    if (datei.size > maxDateiBytes) {
      const groesseMb = (datei.size / 1024 / 1024).toFixed(1);
      showToast(`Datei zu groß (${groesseMb} MB) — maximal ${maxDateiBytes / 1024 / 1024} MB erlaubt.`, "error");
      return;
    }
    setHochladen(true);
    try {
      const sha256 = await sha256Hex(datei);
      const roh = new Uint8Array(await datei.arrayBuffer());
      let bin = ""; for (const b of roh) bin += String.fromCharCode(b);
      const r = await apiFetch("/api/pl/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfBase64: btoa(bin), dateiname: datei.name,
          titel: datei.name.replace(/\.[^.]+$/, "").replace(/_/g, " "),
          datum: datumDok || heute, thema, gueltigBis, sha256,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || r.status);
      if (d.doppelt) {
        showToast(`Liegt schon im Archiv: „${d.titel}"`);
      } else {
        showToast("Hochgeladen. Das Archiv sortiert es gleich ein.");
        setGueltigBis("");
        setDatumDok(heute);
        // Vorherigen abraeumen: zwei Uploads binnen vier Sekunden wuerden den
        // ersten Zeitgeber sonst nur ueberschreiben, nicht beenden.
        if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = setTimeout(laden_, 4000);   // der Consumer braucht einen Moment
      }
    } catch (e) {
      showToast("Hochladen fehlgeschlagen: " + (e?.message || e), "error");
    } finally { setHochladen(false); }
  };

  const body = (
    <>
      {hinweis && <p style={{ fontSize: 12.5, color: "var(--text2)", margin: "0 0 12px" }}>{hinweis}</p>}

      <div className="form-row mb12" style={{ gap: 8 }}>
        <input type="date" className="gbu-filter-input"
          value={datumDok} onChange={(e) => setDatumDok(e.target.value)} placeholder="Dokumentdatum" />
        <input type="date" className="gbu-filter-input"
          value={gueltigBis} onChange={(e) => setGueltigBis(e.target.value)} placeholder="Gültig bis" />
      </div>
      <button className="btn btn-primary mb12" style={{ width: "100%" }} disabled={hochladen}
        onClick={() => dateiRef.current?.click()}>
        <Icon name="plus" size={16} /> {hochladen ? "Lädt…" : "Dokument hochladen"}
      </button>
      <input ref={dateiRef} type="file" accept="application/pdf,image/*"
          style={{ display: "none" }} onChange={gewaehlt} />

      <div className="section-label">{eingebettet ? titel : "Unterlagen"}{laden ? " · lädt…" : docs ? ` (${docs.length})` : ""}</div>

      {fehler && (
        <div className="empty-state"><Icon name="shield" size={40} />
          <p>Archiv nicht erreichbar: {fehler}</p></div>
      )}

      {(docs || []).map((d) => {
        const f = fristStatus(d.gueltigBis, heute);
        return (
          <div key={d.id} className="list-item" style={{ display: "block" }} onClick={() => oeffnen(d)}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{d.titel}</div>
            <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
              {d.datum ? new Date(d.datum).toLocaleDateString("de-DE") : ""}
              {d.gueltigBis && (
                <span style={{ color: PL_AMPEL[f.stufe], fontWeight: f.stufe === "gueltig" ? 400 : 600 }}>
                  {" · gültig bis "}{new Date(d.gueltigBis).toLocaleDateString("de-DE")}
                  {f.stufe !== "gueltig" && f.stufe !== "kein" ? ` (${EW_STUFEN_TEXT[f.stufe]})` : ""}
                </span>
              )}
              {" · Antippen für PDF"}
            </div>
          </div>
        );
      })}

      {docs !== null && !docs.length && !laden && !fehler && (
        <div className="empty-state"><Icon name="archive" size={40} />
          <p>Noch keine Unterlagen mit dem Schlagwort {thema}.</p></div>
      )}

      {viewer && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && schliessen()}>
          {/* Aufbau bewusst Zeile fuer Zeile wie der Beleg-Betrachter weiter
              unten, der auf denselben Geraeten nachweislich funktioniert: kein
              iframe (mobile Browser zeigen PDFs darin nicht an, sondern
              erzwingen den Download), Knoepfe in der Titelzeile. Eine eigene
              Bauart hatte hier schon zweimal nicht getragen -- lieber die
              bewaehrte Schwesteransicht spiegeln als eine dritte erfinden. */}
          <div className="modal" style={{ maxWidth: "95vw", width: "95vw", height: "90vh", display: "flex", flexDirection: "column" }}>
            <div className="modal-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 15 }}>{viewer.name}</span>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button className="btn btn-secondary btn-xs" onClick={() => herunterladen(viewer)} disabled={!viewer.url}>
                  <Icon name="download" size={13} /> Laden
                </button>
                <button className="btn btn-secondary btn-xs" onClick={schliessen}>Schließen</button>
              </div>
            </div>
            {viewer.loading
              ? <div className="loading"><div className="spinner" /> Lade Dokument…</div>
              : <div style={{ flex: 1, overflowY: "auto" }}>
                  <PdfCanvasView url={viewer.url} maxPages={30} />
                </div>}
          </div>
        </div>
      )}
    </>
  );

  if (eingebettet) return body;

  return (
    <div className="main">
      <div className="page-header">
        <div className="back-btn" onClick={onBack}><Icon name="back" size={20} /></div>
        <h2>{titel}</h2>
      </div>
      {body}
    </div>
  );
}

// ─── Dokument hochladen (Verwaltung, Spec 2026-09-23) ───────────────────────
// Scan mit dem vorhandenen Beleg-Scanner (Foto -> Zuschneiden, mehrere Seiten ->
// eine PDF, src/seiten-pdf.js) oder eine Datei, nach Paperless mit Bereich +
// Quelle/App (/api/pl/upload, thema PL_ALLE). Der Schalter „Beleg" setzt
// zusaetzlich Beleg/zur Buchhaltung; pipeline/producer.py holt solche Dokumente
// in die Beleg-Pipeline (gebucht wird erst nach Freigabe). Ohne Netz oder bei
// Archiv-Ausfall wandert der Auftrag in die Warteschlange (src/pl-warteschlange.js),
// die App traegt ihn beim Start und bei Netz nach (useEffect in App).

/** Ein Upload an /api/pl/upload. Wirft bei Netzfehler/SSO-Ablauf (apiFetch), sonst { status, daten }. */
const plSenden = async (nutzlast) => {
  const r = await apiFetch("/api/pl/upload", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nutzlast),
  });
  return { status: r.status, daten: await r.json().catch(() => ({})) };
};

function DokumentHochladen({ onBack, showToast }) {
  const heute = new Date().toISOString().slice(0, 10);
  const [seiten, setSeiten] = useState([]);      // File[] (zugeschnittene JPEGs)
  const [datei, setDatei] = useState(null);      // File aus der Dateiauswahl
  const [titel, setTitel] = useState("");
  const [datum, setDatum] = useState(heute);
  const [beleg, setBeleg] = useState(false);
  const [kamera, setKamera] = useState(false);
  const [rohFoto, setRohFoto] = useState(null);  // Kamerabild vor dem Zuschneiden (ScanCropModal)
  const [laeuft, setLaeuft] = useState(false);
  const [wartend, setWartend] = useState(0);
  const dateiRef = useRef(null);
  const maxBytes = 22 * 1024 * 1024;   // wie PaperlessDocs: 30 MB Rumpf abzueglich Base64

  const wartendLesen = () => plAusstehend().then(setWartend).catch(() => {});
  useEffect(() => { wartendLesen(); }, []);

  const zuruecksetzen = () => { setSeiten([]); setDatei(null); setTitel(""); setDatum(heute); setBeleg(false); };

  const senden = async () => {
    if (!seiten.length && !datei) { showToast("Erst scannen oder eine Datei wählen.", "error"); return; }
    setLaeuft(true);
    try {
      let bytes; let name;
      if (seiten.length) {
        bytes = await bilderZuPdf(await Promise.all(seiten.map(async (f) => new Uint8Array(await f.arrayBuffer()))));
        name = `scan-${datum || heute}.pdf`;
      } else {
        bytes = new Uint8Array(await datei.arrayBuffer());
        name = datei.name;
      }
      if (bytes.length > maxBytes) throw new Error(`Datei zu groß (${(bytes.length / 1048576).toFixed(1)} MB, maximal 22 MB)`);
      const sha256 = await sha256Hex(new Blob([bytes]));
      let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
      const nutzlast = {
        pdfBase64: btoa(bin), dateiname: name,
        titel: titel.trim() || name.replace(/\.[^.]+$/, "").replace(/_/g, " "),
        datum: datum || heute, thema: PL_ALLE, beleg, sha256,
      };
      let status = 0; let d = {};
      if (navigator.onLine !== false) {
        try { ({ status, daten: d } = await plSenden(nutzlast)); }
        catch (e) { if (e?.ssoAbgelaufen) throw e; status = 0; }
      }
      const was = status ? plWsAntwort(status) : "spaeter";
      if (was === "spaeter") {
        await plEinreihen(nutzlast);
        showToast("Kein Netz oder Archiv nicht erreichbar: wird automatisch nachgeladen.");
        zuruecksetzen(); wartendLesen();
        return;
      }
      if (was === "verwerfen") throw new Error(d.error || status);
      if (d.doppelt) showToast(`Liegt schon im Archiv: „${d.titel}"`);
      else {
        showToast(beleg ? "Hochgeladen. Geht zusätzlich an die Buchhaltung." : "Hochgeladen. Paperless sortiert es ein.");
        zuruecksetzen();
      }
    } catch (e) {
      showToast("Hochladen fehlgeschlagen: " + (e?.message || e), "error");
    } finally { setLaeuft(false); }
  };

  return (
    <div className="main">
      <div className="page-header">
        <div className="back-btn" onClick={onBack}><Icon name="back" size={20} /></div>
        <h2>Dokument hochladen</h2>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text2)", margin: "0 0 12px" }}>
        Scannen (mehrere Seiten werden eine PDF) oder Datei wählen. Thema und Absender ordnet Paperless selbst zu.
      </p>
      {wartend > 0 && (
        <div className="pwa-hint mb12">{wartend} {wartend === 1 ? "Dokument wartet" : "Dokumente warten"} auf Netz und {wartend === 1 ? "wird" : "werden"} automatisch hochgeladen.</div>
      )}
      <div className="form-row mb12" style={{ gap: 8 }}>
        <button className="btn btn-secondary" style={{ flex: 1 }} disabled={laeuft || !!datei} onClick={() => setKamera(true)}>
          <Icon name="plus" size={16} /> {seiten.length ? `Seite ${seiten.length + 1} scannen` : "Scannen"}
        </button>
        <button className="btn btn-secondary" style={{ flex: 1 }} disabled={laeuft || seiten.length > 0} onClick={() => dateiRef.current?.click()}>
          <Icon name="folder" size={16} /> Datei wählen
        </button>
      </div>
      <input ref={dateiRef} type="file" accept="application/pdf,image/*" style={{ display: "none" }}
        onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ""; if (f) setDatei(f); }} />
      {seiten.length > 0 && (
        <div className="pwa-hint mb12">
          {seiten.length} {seiten.length === 1 ? "Seite" : "Seiten"} gescannt
          <button className="btn btn-secondary btn-xs" style={{ marginLeft: 8 }} disabled={laeuft}
            onClick={() => setSeiten((s) => s.slice(0, -1))}>Letzte entfernen</button>
        </div>
      )}
      {datei && (
        <div className="pwa-hint mb12">
          {datei.name}
          <button className="btn btn-secondary btn-xs" style={{ marginLeft: 8 }} disabled={laeuft}
            onClick={() => setDatei(null)}>Entfernen</button>
        </div>
      )}
      <div className="field-group mb12">
        <label>Titel (optional)</label>
        <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z. B. Versicherungsschein Fiat" />
      </div>
      <div className="field-group mb12">
        <label>Datum des Dokuments</label>
        <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
      </div>
      <label className="mb12" style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5 }}>
        <input type="checkbox" checked={beleg} onChange={(e) => setBeleg(e.target.checked)} />
        <span>Beleg → Buchhaltung (Rechnung oder Quittung: geht zusätzlich in die Beleg-Pipeline, gebucht wird erst nach Freigabe)</span>
      </label>
      <button className="btn btn-primary" style={{ width: "100%" }} disabled={laeuft || (!seiten.length && !datei)} onClick={senden}>
        <Icon name="upload" size={16} /> {laeuft ? "Lädt…" : "Hochladen"}
      </button>
      {/* Wie beim Beleg-Scan: Foto -> Kantenerkennung/Zuschneiden -> Seite. */}
      {kamera && <CameraCaptureModal showToast={showToast} onCancel={() => setKamera(false)}
        onCapture={(f) => { setKamera(false); setRohFoto(f); }} />}
      {rohFoto && <ScanCropModal file={rohFoto} showToast={showToast} onCancel={() => setRohFoto(null)}
        onConfirm={(f) => { setRohFoto(null); setSeiten((s) => [...s, f]); }} />}
    </div>
  );
}

// ─── Kontostände & Finanzübersicht (Verwaltung, nur Geschäftsführer) ─────────
// Rechnung ausschließlich in finanzUebersicht() (oben bei den reinen
// Funktionen, getestet in test/finanzen/uebersicht.test.js) — hier nur Laden
// und Anzeigen. Die Anlagen-Konfiguration (Nutzungsdauer/Einstufung je
// Gerät) liegt in Blattwerk/App/anlagen.json, damit beide Geschäftsführer
// dieselben Zahlen sehen; ohne Nextcloud-Zugang gelten die Vorschläge.
// Ab 2 Jahren, seit 11.09.2026: bei GEBRAUCHTEN Geraeten zaehlt nicht die
// Tabellen-Nutzungsdauer, sondern die geschaetzte Rest-Nutzungsdauer — ein
// gebraucht gekaufter Transporter fuer 3.700 EUR hat keine 6 Jahre mehr vor
// sich. Die Tabellenwerte gelten fuer Neuanschaffungen.
const AFA_JAHRE_AUSWAHL = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 20];
function FinanzenPage({ api, onBack, showToast }) {
  const [roh, setRoh] = useState(null);
  const [konfig, setKonfig] = useState({});
  const [fixkosten, setFixkosten] = useState({});
  const [fehler, setFehler] = useState("");
  const [nc] = useState(loadNcConfig);
  const ncOk = ncHasAccess(nc);

  useEffect(() => {
    Promise.all([
      api.getBankAccounts(),
      api.getInvoicesAlle(),
      api.getSupplierInvoicesAlle(),
    ]).then(([konten, re, lr]) => {
      setRoh({
        konten: Array.isArray(konten) ? konten : [],
        rechnungen: Array.isArray(re) ? re : [],
        lieferantenRechnungen: Array.isArray(lr) ? lr : [],
      });
    }).catch((e) => setFehler(doliError(e) || "Ladefehler"));
  }, [api]);

  useEffect(() => {
    if (!ncOk) return;
    apiFetch("/api/nc/anlagen", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server: nc.server, user: nc.user, pass: nc.pass }),
    }).then((r) => (r.ok ? r.json() : null))
      .then((st) => { if (st?.geraete) setKonfig(st.geraete); })
      .catch(() => {});
  }, [ncOk, nc.server, nc.user, nc.pass]);

  useEffect(() => {
    if (!ncOk) return;
    apiFetch("/api/nc/fixkosten", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server: nc.server, user: nc.user, pass: nc.pass }),
    }).then((r) => (r.ok ? r.json() : null))
      .then((st) => { if (st?.posten) setFixkosten(st.posten); })
      .catch(() => {});
  }, [ncOk, nc.server, nc.user, nc.pass]);

  const heute = todayISO();
  const daten = roh ? finanzUebersicht({ ...roh, heute, anlagenKonfig: konfig }) : null;
  const vorschau = daten
    ? prognose({
        anlagegueter: daten.anlagegueter,
        fixkosten: Object.entries(fixkosten).map(([key, k]) => ({ key, ...k })),
        heute, gewinn: daten.gewinn,
      })
    : null;
  // Über der GWG-Grenze, aber (noch) nicht als Anlagegut eingestuft — zum Nachsehen.
  const kandidaten = roh ? anlagegueterErkennen(roh.lieferantenRechnungen, konfig).filter((g) => !g.anlagegut) : [];

  const fixkostenSetzen = async (key, aenderung) => {
    const neu = { ...(fixkosten[key] || {}), ...aenderung };
    const leer = !neu.name && !neu.betrag;
    setFixkosten((f) => {
      const k = { ...f };
      if (leer) delete k[key]; else k[key] = neu;
      return k;
    });
    if (!ncOk) { showToast?.("Kein Nextcloud-Zugang — die Eingabe gilt nur bis zum Neuladen", "error"); return; }
    try {
      const r = await apiFetch("/api/nc/fixkosten/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: nc.server, user: nc.user, pass: nc.pass, key, konfig: leer ? {} : neu }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
    } catch (e) {
      showToast?.("Speichern fehlgeschlagen: " + (e?.message || e), "error");
    }
  };

  const konfigSetzen = async (key, aenderung) => {
    const neu = { ...(konfig[key] || {}), ...aenderung };
    setKonfig((k) => ({ ...k, [key]: neu }));
    if (!ncOk) { showToast?.("Kein Nextcloud-Zugang — die Einstellung gilt nur bis zum Neuladen", "error"); return; }
    try {
      const r = await apiFetch("/api/nc/anlagen/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: nc.server, user: nc.user, pass: nc.pass, key, konfig: neu }),
      });
      const st = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(st.error || r.status);
      if (st?.geraete) setKonfig(st.geraete);
    } catch (e) { showToast?.("Speichern fehlgeschlagen: " + (e?.message || e), "error"); }
  };

  const zeile = (lbl, wert, opts = {}) => (
    <div className="detail-row"><span className="lbl">{lbl}</span>
      <span className="val" style={{ fontWeight: opts.fett ? 700 : 400, color: opts.farbe || undefined }}>{fmtMoney(wert)}</span>
    </div>
  );
  const geraetZeile = (g, aktiv) => (
    <div key={g.key} className="list-item" style={{ cursor: "default", flexWrap: "wrap" }}>
      <div className="list-info">
        <div className="name">{g.name}</div>
        <div className="sub">
          {g.gekauft ? `Gekauft ${fbDatumDE(g.gekauft)}` : "Kaufdatum unbekannt"} · netto {fmtMoney(g.netto)}
          {g.quelle === "rechnung" && g.ref ? ` · ${g.ref}` : ""}{g.bezahlt ? "" : " · unbezahlt"}
        </div>
        {aktiv && (
          <div className="sub">
            AfA {fmtMoney(afaJahr(g))}/Jahr · bisher {fmtMoney(afaBisher(g, heute))} · Restwert {fmtMoney(restwert(g, heute))}
            {(g.nutzungsanteil ?? 1) < 1 && ` · ${Math.round((g.nutzungsanteil ?? 1) * 100)} % betrieblich`}
            {g.quelle === "manuell" && " · privat gezahlt, nicht in den Ausgaben"}
          </div>
        )}
      </div>
      {aktiv ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          <select className="gbu-filter-input" value={g.afaJahre}
            onChange={(e) => konfigSetzen(g.key, { afaJahre: Number(e.target.value) })}>
            {[...new Set([...AFA_JAHRE_AUSWAHL, g.afaJahre])].sort((x, y) => x - y).map((j) => <option key={j} value={j}>{j} Jahre</option>)}
          </select>
          <select className="gbu-filter-input" value={Math.round((g.nutzungsanteil ?? 1) * 100)}
            title="Betrieblicher Anteil — der private Rest wird nicht abgeschrieben"
            onChange={(e) => konfigSetzen(g.key, { nutzungsanteil: Number(e.target.value) / 100 })}>
            {[100, 90, 80, 70, 60, 50].map((pz) => <option key={pz} value={pz}>{pz} % betrieblich</option>)}
          </select>
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => konfigSetzen(g.key, { anlagegut: false })}>kein Anlagegut</button>
        </div>
      ) : (
        <button type="button" className="btn btn-primary btn-xs" onClick={() => konfigSetzen(g.key, { anlagegut: true })}>
          abschreiben ({g.afaJahre} J.)
        </button>
      )}
    </div>
  );

  return (
    <div className="main">
      <div className="page-header">
        <div className="back-btn" onClick={onBack}><Icon name="back" size={20} /></div>
        <h2>Kontostände</h2>
      </div>
      {fehler ? <div className="empty-state"><p>{fehler}</p></div>
        : !daten ? <div className="loading"><div className="spinner" /> Lade...</div>
        : (<>
          <div className="detail-hero">
            <div className="detail-ref">Privateinlagen</div>
            {/* Negativer Saldo des Privateinlage-Kontos = so viel hat die
                Person privat eingelegt/verauslagt (z. B. der Fiat) und noch
                nicht zurückbekommen. */}
            {/* Die VR-Konten bleiben hier bewusst draussen (Vorgabe 20.08.2026,
                bestaetigt 11.09.2026). Dass die Zahl trotzdem zu klein aussieht,
                liegt nicht an der Rechnung: privat bezahlte Lieferanten-
                rechnungen wurden teils auf das VR-Konto gebucht statt auf das
                Privateinlage-Konto. Das gehoert in Dolibarr umgebucht, nicht
                hier weggerechnet. */}
            {zeile("Privateinlage Inhaber", Math.max(0, -daten.standInhaber))}
            {zeile("Privateinlage Partner", Math.max(0, -daten.standPartner))}
          </div>
          <div className="detail-hero" style={{ marginTop: 12 }}>
            <div className="detail-ref">Firma</div>
            {zeile("Bank + Bargeld", daten.firmenKonten)}
            {zeile("− offene Lieferantenrechnungen", -daten.offeneLieferanten)}
            {zeile("− Schulden an Gesellschafter", -daten.schuldenGesellschafter)}
            {zeile("− Steuer-Rücklage (30 % v. Gewinn)", -daten.steuerRuecklage)}
            {zeile("Bereinigter Kontostand", daten.bereinigt, { fett: true, farbe: daten.bereinigt < 0 ? "var(--warn)" : "var(--accent2)" })}
            {zeile("Ausstehende Kundenrechnungen", daten.offeneKunden)}
          </div>
          <div className="detail-hero" style={{ marginTop: 12 }}>
            <div className="detail-ref">Gewinn (EÜR)</div>
            {zeile("Bezahlte Kundenrechnungen", daten.einnahmen)}
            {zeile("− bezahlte Lieferantenrechnungen", -daten.ausgaben)}
            {zeile("Geldfluss (Anlagegüter voll drin)", daten.geldfluss)}
            {/* Anlagegüter über 800 € netto zählen nicht sofort, sondern nur
                mit der anteiligen AfA (§ 7 EStG) — deshalb hier zurück und
                die AfA dafür herunter. */}
            {zeile("+ Anlagegüter aus Rechnungen zurück", daten.anlagenAbzug)}
            {zeile("− AfA bis heute (betrieblich)", -daten.afaSumme)}
            {daten.privatanteilAfa > 0.005 && zeile("davon privat, nicht abgezogen", daten.privatanteilAfa)}
            {zeile("Gewinn", daten.gewinn, { fett: true })}
            <div className="sub" style={{ fontSize: 12.5, color: "var(--text2)", marginTop: 8 }}>
              Gewinn ist nicht Kontostand: Geld, das in Fahrzeug und Geräte geflossen ist,
              mindert das Konto sofort, den Gewinn aber nur über die Jahre.
            </div>
          </div>
          {vorschau && (
            <div className="detail-hero" style={{ marginTop: 12 }}>
              <div className="detail-ref">Was dieses Jahr noch kommt</div>
              {/* Bewusst neben dem Gewinn, nicht darin: der Gewinn oben bleibt
                  eine Tatsache aus gebuchten Belegen und laesst sich gegen
                  Dolibarr abgleichen. Hier stehen Erwartungen. */}
              {zeile(`Restliche AfA ${new Date().getFullYear()}`, -vorschau.restAfa)}
              {zeile(`Fixkosten × ${vorschau.monate} Monate`, -vorschau.restFixkosten)}
              {zeile("Zusammen", -vorschau.gesamt, { fett: true })}
              {vorschau.erwarteterGewinn != null && zeile(
                "Erwarteter Gewinn zum Jahresende", vorschau.erwarteterGewinn,
                { fett: true, farbe: vorschau.erwarteterGewinn < 0 ? "var(--warn)" : "var(--accent2)" })}
              <div className="sub" style={{ fontSize: 12, color: "var(--text2)", margin: "8px 0 4px" }}>
                Schätzung — Umsatz bis Jahresende ist darin nicht enthalten.
                Der laufende Monat zählt nicht mit, seine Rechnungen sind gebucht oder kommen gleich.
              </div>
              <div className="section-label" style={{ marginTop: 10 }}>Feste Kosten</div>
              {Object.entries(fixkosten).length === 0 && (
                <div className="sub" style={{ color: "var(--text2)", marginBottom: 8 }}>
                  Noch nichts hinterlegt — Versicherung, Internet, Kontoführung, Kfz-Steuer und so weiter.
                </div>
              )}
              {Object.entries(fixkosten).map(([key, k]) => (
                <div key={key} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, opacity: k.aus ? 0.45 : 1 }}>
                  <input className="gbu-filter-input" style={{ flex: 2, minWidth: 0 }} defaultValue={k.name || ""}
                    placeholder="Bezeichnung"
                    onBlur={(e) => e.target.value !== (k.name || "") && fixkostenSetzen(key, { name: e.target.value })} />
                  <input className="gbu-filter-input" style={{ width: 78 }} type="number" inputMode="decimal"
                    defaultValue={k.betrag ?? ""} placeholder="€"
                    onBlur={(e) => Number(e.target.value) !== Number(k.betrag ?? 0) && fixkostenSetzen(key, { betrag: Number(e.target.value) })} />
                  <select className="gbu-filter-input" style={{ width: 106 }} value={k.rhythmus || "monat"}
                    onChange={(e) => fixkostenSetzen(key, { rhythmus: e.target.value })}>
                    {RHYTHMEN.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  {/* Naechste Faelligkeit: ohne sie verteilt die Vorschau einen
                      Jahresbetrag gleichmaessig auf alle Monate — auch wenn er
                      laengst bezahlt ist. Mit Datum wird abgezaehlt. */}
                  <input className="gbu-filter-input" style={{ width: 128 }} type="date"
                    title="nächste Fälligkeit — ohne Angabe wird gleichmäßig verteilt"
                    defaultValue={k.faellig || ""}
                    onBlur={(e) => e.target.value !== (k.faellig || "") && fixkostenSetzen(key, { faellig: e.target.value })} />
                  {/* Abschalten statt loeschen: ein ausgelaufener Vertrag soll
                      sichtbar bleiben, damit er nicht versehentlich neu angelegt wird. */}
                  <button type="button" className="btn btn-secondary btn-xs"
                    title={k.aus ? "wieder mitzählen" : "nicht mehr mitzählen"}
                    onClick={() => fixkostenSetzen(key, { aus: !k.aus })}>{k.aus ? "an" : "aus"}</button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-xs" style={{ marginTop: 4 }}
                onClick={() => fixkostenSetzen(`fk-${Date.now().toString(36)}`, { name: "", betrag: 0, rhythmus: "monat" })}>
                + Posten
              </button>
            </div>
          )}
          <div className="detail-hero" style={{ marginTop: 12 }}>
            <div className="detail-ref">Anlagegüter (AfA)</div>
            <div className="sub" style={{ fontSize: 12.5, color: "var(--text2)", marginBottom: 10 }}>
              Über 800 € netto wird abgeschrieben statt sofort abgezogen — monatsgenau ab Kaufmonat.
              Nutzungsdauer nach AfA-Tabelle vorbelegt (die gilt für Neugeräte); bei gebraucht Gekauftem
              die geschätzte Rest-Nutzungsdauer eintragen.
            </div>
            {/* Drei Zahlen, die leicht verwechselt werden — deshalb stehen sie
                nebeneinander statt dass nur die kleinste im Gewinn auftaucht. */}
            {zeile("AfA aufgelaufen bis heute", daten.afa.bisHeute)}
            {zeile(`AfA ${new Date().getFullYear()} gesamt (bis Jahresende)`, daten.afa.imJahr)}
            {zeile("AfA je vollem Jahr", daten.afa.proJahr)}
            <div className="sub" style={{ fontSize: 12, color: "var(--text2)", margin: "2px 0 12px" }}>
              Im Gewinn steckt die erste Zahl — dort zählen die Einnahmen ja auch nur bis heute.
            </div>
            {daten.anlagegueter.length === 0 && <div className="sub" style={{ color: "var(--text2)" }}>Keine Anlagegüter.</div>}
            {daten.anlagegueter.map((g) => geraetZeile(g, true))}
            {kandidaten.length > 0 && (<>
              <div className="section-label" style={{ marginTop: 14 }}>Über 800 € netto, nicht als Anlagegut eingestuft — prüfen</div>
              {kandidaten.map((g) => geraetZeile(g, false))}
            </>)}
          </div>
        </>)}
    </div>
  );
}

// ─── Fahrtenbuch ─────────────────────────────────────────────────────────────
// Die Seite bildet das Papierblatt ab (docs/fahrtenbuch-papier.html): Kopf mit
// Logo, Fahrzeug/Kennzeichen, Zeitraum, Blatt-Nr.; 7 Spalten, 14 Zeilen je
// Blatt, blätterbar. Eintragen = Zeile antippen und direkt tippen (Enter/Tab
// springt weiter), kein Formular. Ablage in Blattwerk/App/fahrtenbuch.json
// (Nummerierung + Änderungshistorie macht der Server, siehe src/fahrtenbuch.js),
// lokaler Cache + Warteschlange für Funklöcher. Änderungen an eingetragenen
// Zeilen brauchen einen Vermerk, Storno streicht die Zeile durch (bleibt).
const FB_CACHE_KEY = "blattwerk_fahrtenbuch_cache";
const FB_QUEUE_KEY = "blattwerk_fahrtenbuch_ausstehend";
// Entwuerfe: angefangene Fahrten, die noch nicht im Buch stehen. Bewusst NUR
// auf diesem Gerät — wer eintraegt, vergibt eine laufende Nummer, und die darf
// eine halbfertige Fahrt nicht bekommen (geschlossene Form).
const FB_ENTWURF_KEY = "blattwerk_fahrtenbuch_entwuerfe";
const fbLesen = (k, leer) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? leer; } catch { return leer; } };
const fbMerken = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
const fbId = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fbUhrzeit = (d = new Date()) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const fbKoord = (p) => p ? `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}` : "";
const fbFahrzeugName = (v) => v ? [v.name, v.kennzeichen].filter(Boolean).join(" · ") : "";
// Vorbelegung des Startorts und das Fahrzeug, das ohne eigenen Eintrag gilt —
// beides aus dem Mandanten (Abschlusspruefung 18.09.2026, Befund I3). Vorher
// standen hier Blattwerks Hofadresse und in src/fahrtenbuch.js Blattwerks
// Ducato; beides wurde in JEDE Fahrt jedes Mandanten geschrieben, der den
// Startort leer liess bzw. noch kein Fahrzeug angelegt hatte. Fuer einen
// fremden Mandanten ohne eigene Angabe gilt: lieber gar kein Vorschlag als
// ein falscher — `fbStart` ist dann "" (das Feld verlangt den Startort
// ohnehin, fahrtFehler weist leer ab) und `fbFahrzeugVorgabe` ein namenloser
// Platzhalter, der nur die Liste traegt, bis das erste echte Fahrzeug
// angelegt ist.
const fbStart = (m) => String(m?.fahrtenbuch?.startStandard || "").trim();
const FB_FAHRZEUG_PLATZHALTER = { id: "fahrzeug", name: "", kennzeichen: "" };
const fbFahrzeugVorgabe = (m) => {
  const f = m?.fahrtenbuch?.fahrzeug;
  return f && String(f.name || "").trim() ? { ...f } : { ...FB_FAHRZEUG_PLATZHALTER };
};
// Überlassungsvereinbarungen: gleiche Zwei-Schlüssel-Ablage wie das Fahrtenbuch.
// In die Warteschlange kommen die Daten samt Unterschriften, NIE das fertige
// PDF — zwei Unterschriftsbilder in einem jsPDF-Base64 sprengen das
// localStorage-Kontingent, und `fbMerken` schluckt den Fehler; ein
// unterschriebener Nachweis wäre dann still weg. Das PDF wird beim Nachtragen
// aus denselben Daten neu gebaut (deterministisch, siehe ueberlassung-pdf.js).
const UEB_CACHE_KEY = "blattwerk_ueberlassungen_cache";
const UEB_QUEUE_KEY = "blattwerk_ueberlassungen_ausstehend";
// Logo des MANDANTEN, nicht fest "/logo.png" — das ist Blattwerks Logo-Datei
// (Abschlusspruefung 18.09.2026, Befund I4/kleine Mitnahme). Ohne eigenes
// Logo bekommt das Blatt keines, statt eines fremden.
const uebLogoLaden = async (pfad) => {
  if (!pfad) return undefined;
  try {
    const blob = await (await fetch(pfad)).blob();
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(undefined); fr.readAsDataURL(blob); });
  } catch (_) { return undefined; }
};
const uebPdfBauen = async (v, sigs = {}, betrieb) => {
  const { buildUeberlassungPdf } = await import("./src/ueberlassung-pdf.js");
  return buildUeberlassungPdf({ ...v, sigFahrer: sigs.sigFahrer, sigBlattwerk: sigs.sigBlattwerk },
    { logo: await uebLogoLaden(betrieb?.logo), betrieb });
};
// Zweiter Weg aus demselben Renderer: das Leerformular zum Ausdrucken und
// Ausfüllen von Hand (Fahrzeug und Datum sind schon eingetragen). Beide Wege
// müssen durch `buildUeberlassungPdf`, sonst laufen Papier und App auseinander.
const uebLeerformular = async (fahrzeug, betrieb) => {
  const { buildUeberlassungPdf } = await import("./src/ueberlassung-pdf.js");
  return buildUeberlassungPdf({ fahrzeugId: fahrzeug?.id, fahrzeug: fbFahrzeugName(fahrzeug), von: todayISO() },
    { logo: await uebLogoLaden(betrieb?.logo), leer: true, betrieb });
};
// Die drei Fahrtarten als Auswahl mit Erklärung — auf dem Papier steht dort
// nur ein Buchstabe, auf dem Handy ist Platz für den Grund dahinter. Was
// gespeichert wird, ist weiterhin das Kürzel (`FB_ART`/`FB_ART_TYP`).
const FB_ART_WAHL = [
  { k: "B", t: "betrieblich", hilfe: "Kunde, Auftrag" },
  { k: "W", t: "Wohnung–Betrieb", hilfe: "Arbeitsweg" },
  { k: "P", t: "privat", hilfe: "nur km-Stände" },
];
// Werte der Eingabemaske aus einer gespeicherten Fahrt. Anders als das
// Papierblatt (`zeileAusFahrt`, 7 Spalten) zeigt die Maske auch Uhrzeit und
// Startort — beides steckt im Datenmodell und ging bisher nur unsichtbar mit.
const fbWerteAusFahrt = (f) => ({
  datum: f?.datum || "", zeitVon: f?.zeitVon || "", zeitBis: f?.zeitBis || "",
  start: f?.start || "", ziel: f?.ziel || "",
  kmBeginn: f?.kmBeginn ?? "", kmEnde: f?.kmEnde ?? "",
  distanz: f?.distanz ?? "",
  zweck: f?.zweck || "", art: FB_ART[f?.typ] || "B", fahrer: f?.fahrer || "",
});

function FahrtenbuchPage({ api, me, connected, showToast }) {
  // Betriebsdaten fuer die Ueberlassungsvereinbarung (Vertragspartner, Ort,
  // Logo) — nie fest "Blattwerk", siehe src/ueberlassung.js.
  const mandantFb = useMandant();
  const betrieb = mandantBetrieb(mandantFb);
  const fbStartStandard = fbStart(mandantFb);
  const fbFahrzeugStandard = fbFahrzeugVorgabe(mandantFb);
  const [nc] = useState(loadNcConfig);
  const ncOk = ncHasAccess(nc);
  const [server, setServer] = useState(() => fbLesen(FB_CACHE_KEY, null));
  const [ausstehend, setAusstehend] = useState(() => fbLesen(FB_QUEUE_KEY, []));
  const [laden, setLaden] = useState(false);
  const [tab, setTab] = useState("fahrten");
  const [fahrzeugId, setFahrzeugId] = useState("");
  const [edit, setEdit] = useState(null);    // { id, neu, werte, grund, alt }
  const [entwuerfe, setEntwuerfe] = useState(() => fbLesen(FB_ENTWURF_KEY, FB_ENTWUERFE_LEER));
  const [aufz, setAufz] = useState(null);    // GPS: { watchId, seit, punkte }
  const aufzRef = useRef(null);
  const [customers, setCustomers] = useState([]);
  const [personen, setPersonen] = useState([]);
  const [jahr, setJahr] = useState(new Date().getFullYear());
  const [fzForm, setFzForm] = useState(() => ({ name: fbFahrzeugStandard.name, kennzeichen: fbFahrzeugStandard.kennzeichen, kmStart: "" }));
  // Überlassungsvereinbarungen (Reiter „Fahrer / Überlassung"): Liste + Formular.
  const [ueb, setUeb] = useState(() => fbLesen(UEB_CACHE_KEY, UEB_STORE_LEER));
  const [uebAusstehend, setUebAusstehend] = useState(() => fbLesen(UEB_QUEUE_KEY, []));
  const [uebNeu, setUebNeu] = useState(false);
  const [uebWiderruf, setUebWiderruf] = useState(null); // { id, grund }

  // Bei abgeschalteter Funktion ist diese Seite nicht erreichbar (erlaubterTab); die Entwuerfe bleiben liegen, siehe warteschlangenStand.
  const store = ausstehendeZusammenfuehren(server || FB_STORE_LEER, ausstehend);
  const kmStand = kmStandJeFahrzeug(store);
  const meName = [me?.firstname, me?.lastname].filter(Boolean).join(" ").trim() || me?.login || "";
  const creds = { server: nc.server, user: nc.user, pass: nc.pass };
  const post = (url, body) => apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  // Fahrzeug: gewähltes, sonst das erste, sonst das Standardfahrzeug (wird beim
  // ersten Eintrag angelegt — den Ducato fahren mehrere, der Fahrer steht je Zeile).
  const fahrzeuge = store.fahrzeuge.length ? store.fahrzeuge : [fbFahrzeugStandard];
  const fahrzeug = fahrzeuge.find((v) => v.id === fahrzeugId) || fahrzeuge[0];
  const fahrzeugFehlt = !store.fahrzeuge.some((v) => v.id === fahrzeug.id);
  // Handy-Ansicht: eine Karte je Fahrt, nach Monaten gruppiert, neueste oben.
  // Das Papierblatt (14 Zeilen, 7 Spalten) zeichnet nur noch das PDF.
  const liste = fahrtenListe(store, { fahrzeugId: fahrzeug.id });
  // Entwürfe des gewählten Fahrzeugs (ältere ohne Fahrzeug bleiben sichtbar,
  // sonst wäre eine angefangene Fahrt nach einem Fahrzeugwechsel unauffindbar).
  const entwuerfeFz = entwuerfe.filter((e) => !e?.fahrzeugId || e.fahrzeugId === fahrzeug.id);

  const laden_ = useCallback(async () => {
    if (!ncOk) return;
    setLaden(true);
    try {
      const r = await post("/api/nc/fahrtenbuch", creds);
      const st = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(st.error || r.status);
      setServer(st); fbMerken(FB_CACHE_KEY, st);
    } catch (e) {
      if (!server) showToast("Fahrtenbuch laden fehlgeschlagen: " + (e?.message || e), "error");
    } finally { setLaden(false); }
  }, [ncOk, nc.server, nc.user, nc.pass]);
  useEffect(() => { laden_(); }, [laden_]);
  const uebLaden = useCallback(async () => {
    if (!ncOk) return;
    try {
      const r = await post("/api/nc/ueberlassungen", creds);
      const st = await r.json().catch(() => ({}));
      if (r.ok && st?.vereinbarungen) { setUeb(st); fbMerken(UEB_CACHE_KEY, st); }
    } catch (_) {}
  }, [ncOk, nc.server, nc.user, nc.pass]);
  useEffect(() => { uebLaden(); }, [uebLaden]);

  // Angezeigt wird der Serverstand plus das, was noch auf Empfang wartet —
  // sonst verschwände eine gerade unterschriebene Vereinbarung vor den Augen
  // des Fahrers. Für die Fahrer-Auswahl im Blatt zählen beide gleich.
  const uebAlle = { ...ueb, vereinbarungen: [...ueb.vereinbarungen, ...uebAusstehend.map((a) => ({ ...a.vereinbarung, ausstehend: true }))] };

  const uebNachtragen = useCallback(async () => {
    if (!ncOk || !uebAusstehend.length) return;
    let rest = uebAusstehend.slice(), letzte = null;
    for (const a of uebAusstehend) {
      try {
        const pdfBase64 = await uebPdfBauen(a.vereinbarung, a, betrieb);
        const r = await post("/api/nc/ueberlassungen/save", { ...creds, login: me?.login || "", vereinbarung: a.vereinbarung, pdfBase64, dateiname: uebDateiname(a.vereinbarung) });
        const st = await r.json().catch(() => ({}));
        if (r.status === 400) showToast("Nachtrag abgelehnt: " + (st.error || "?"), "error");
        else if (!r.ok) break;
        else letzte = st;
        rest = rest.filter((x) => x !== a);
      } catch { break; }
    }
    if (rest.length !== uebAusstehend.length) { setUebAusstehend(rest); fbMerken(UEB_QUEUE_KEY, rest); }
    if (letzte?.vereinbarungen) { setUeb(letzte); fbMerken(UEB_CACHE_KEY, letzte); }
  }, [ncOk, uebAusstehend, nc.server, nc.user, nc.pass, me?.login]);
  useEffect(() => { if (connected) uebNachtragen(); }, [connected, ncOk]);

  // Speichern: online direkt, sonst in die Warteschlange. Das PDF wird immer
  // sofort gebaut (jsPDF liegt im Vorab-Cache, geht also auch ohne Empfang) —
  // gespeichert wird es aber nur online; offline nur die Daten samt Unterschrift.
  const uebSpeichern = async (v, sigs) => {
    if (!ncOk) { showToast("Ohne Nextcloud-Zugang kann die Vereinbarung nicht abgelegt werden.", "error"); return false; }
    let pdfBase64;
    try { pdfBase64 = await uebPdfBauen(v, sigs, betrieb); }
    catch (e) { showToast("PDF fehlgeschlagen: " + (e?.message || e), "error"); return false; }
    if (connected !== false) {
      try {
        const r = await post("/api/nc/ueberlassungen/save", { ...creds, login: me?.login || "", vereinbarung: v, pdfBase64, dateiname: uebDateiname(v) });
        const st = await r.json().catch(() => ({}));
        if (r.status === 400) { showToast(st.error || "Abgelehnt", "error"); return false; }
        if (!r.ok) throw new Error(st.error || r.status);
        if (st?.vereinbarungen) { setUeb(st); fbMerken(UEB_CACHE_KEY, st); }
        showToast("Vereinbarung gespeichert und als PDF abgelegt.");
        setUebNeu(false); return true;
      } catch (_) { /* unten in die Warteschlange */ }
    }
    const q = [...uebAusstehend, { vereinbarung: v, sigFahrer: sigs.sigFahrer, sigBlattwerk: sigs.sigBlattwerk }];
    // Hier bewusst nicht `fbMerken`: das schluckt einen vollen Speicher still,
    // und dann wäre die unterschriebene Vereinbarung mit dem Formular weg.
    try { localStorage.setItem(UEB_QUEUE_KEY, JSON.stringify(q)); }
    catch (_) { showToast("Kein Platz mehr im Gerätespeicher — bitte mit Verbindung erneut speichern.", "error"); return false; }
    setUebAusstehend(q);
    showToast("Ohne Verbindung gespeichert — wird nachgetragen, sobald Empfang da ist.");
    setUebNeu(false); return true;
  };

  useEffect(() => {
    api?.getThirdparties("customer").then((c) => setCustomers(Array.isArray(c) ? c : [])).catch(() => {});
    api?.getUsers().then((u) => setPersonen(ewPersonen(u))).catch(() => setPersonen([]));
  }, [api]);
  useEffect(() => () => { if (aufzRef.current?.watchId != null) navigator.geolocation?.clearWatch(aufzRef.current.watchId); }, []);

  // Antwort einer Speicherung uebernehmen. Der Server liefert die frisch
  // nachgerechnete Pruefkette mit; der Stempelstand steht nur drin, wenn
  // dieser Vorgang auch gestempelt werden konnte — sonst bleibt der zuletzt
  // bekannte stehen, statt faelschlich "nie gestempelt" zu behaupten.
  const serverUebernehmen = (st) => {
    const neu = st.stempel?.ok ? { ...st, stempelStand: { nr: st.stempel.nr } } : { ...st, stempelStand: server?.stempelStand };
    setServer(neu); fbMerken(FB_CACHE_KEY, neu);
  };

  // Warteschlange nachtragen, sobald Verbindung da ist. 400 = fachlich
  // abgelehnt (z. B. Vermerk fehlt) → verwerfen und melden, sonst hinge der
  // Eintrag für immer; alles andere (Netz, 5xx) → später erneut.
  const nachtragen = useCallback(async () => {
    if (!ncOk || !ausstehend.length) return;
    let rest = ausstehend.slice(), letzte = null;
    for (const a of ausstehend) {
      try {
        const r = await post("/api/nc/fahrtenbuch/save", { ...creds, login: me?.login || "", ...a });
        const st = await r.json().catch(() => ({}));
        if (r.status === 400) showToast("Nachtrag abgelehnt: " + (st.error || "?"), "error");
        else if (!r.ok) break;
        else letzte = st;
        rest = rest.filter((x) => x !== a);
      } catch { break; }
    }
    if (rest.length !== ausstehend.length) { setAusstehend(rest); fbMerken(FB_QUEUE_KEY, rest); }
    if (letzte?.fahrten) serverUebernehmen(letzte);
  }, [ncOk, ausstehend, nc.server, nc.user, nc.pass, me?.login]);
  useEffect(() => { if (connected) nachtragen(); }, [connected, ncOk]);

  // Speichern: online direkt, sonst in die Warteschlange (und lokal anzeigen).
  const speichern = async ({ fahrt, grund, fahrzeug: fz }) => {
    const auftrag = { ...(fahrt ? { fahrt } : {}), ...(grund ? { grund } : {}), ...(fz ? { fahrzeug: fz } : {}) };
    if (ncOk && connected !== false) {
      try {
        const r = await post("/api/nc/fahrtenbuch/save", { ...creds, login: me?.login || "", ...auftrag });
        const st = await r.json().catch(() => ({}));
        if (r.status === 400) { showToast(st.error || "Abgelehnt", "error"); return false; }
        if (!r.ok) throw new Error(st.error || r.status);
        serverUebernehmen(st);
        return true;
      } catch (_) { /* unten in die Warteschlange */ }
    }
    if (fz) { const st = fahrzeugEintragen(server || FB_STORE_LEER, fz); setServer(st); fbMerken(FB_CACHE_KEY, st); }
    if (fahrt) { const q = [...ausstehend, { fahrt, ...(grund ? { grund } : {}) }]; setAusstehend(q); fbMerken(FB_QUEUE_KEY, q); }
    showToast("Ohne Verbindung gespeichert — wird nachgetragen, sobald Empfang da ist.");
    return true;
  };

  // ── Fahrt eintragen / ändern (Maske als Bogen von unten) ──
  // Letzte gültige Fahrt: ihr Ziel ist der Vorschlag für den nächsten Startort
  // (nach lfd. Nummer, nicht nach Anzeigereihenfolge — die Liste steht auf dem
  // Kopf, der Startort soll trotzdem vom zuletzt Gefahrenen kommen).
  const letzteFahrt = store.fahrten
    .filter((f) => f.fahrzeugId === fahrzeug.id && !f.storniert)
    .slice().sort((a, b) => (a.lfdNr ?? Infinity) - (b.lfdNr ?? Infinity)).slice(-1)[0];
  const neueZeile = (vor = {}) => {
    if (edit) return;
    setEdit({
      id: fbId("f"), neu: true, grund: "",
      werte: {
        datum: todayISO(), zeitVon: "", zeitBis: "",
        start: letzteFahrt?.ziel || fbStartStandard, ziel: "",
        kmBeginn: kmStand[fahrzeug.id] ?? "", kmEnde: "", distanz: "",
        zweck: "", art: "B", fahrer: meName, ...vor,
      },
    });
  };
  const zeileOeffnen = (f) => {
    if (edit || !f || f.ausstehend) { if (f?.ausstehend) showToast("Wartet noch auf Verbindung — danach änderbar."); return; }
    setEdit({ id: f.id, neu: false, grund: "", alt: f, werte: fbWerteAusFahrt(f) });
  };
  const abbrechen = () => setEdit(null);
  // ── Entwurf ──
  // „Fahrtenbuch auch Entwurf": eine angefangene Fahrt (Rückweg noch offen,
  // km-Stand noch nicht abgelesen) soll das Zuklappen der App überleben, ohne
  // schon im Buch zu stehen. Der Entwurf bleibt nur auf diesem Gerät; erst
  // „Eintragen" macht daraus eine Fahrt mit laufender Nummer.
  const entwuerfeMerken = (l) => { setEntwuerfe(l); fbMerken(FB_ENTWURF_KEY, l); };
  const entwurfSichern = () => {
    if (!edit) return;
    const l = entwurfSpeichern(entwuerfe, { id: edit.id, fahrzeugId: fahrzeug.id, werte: edit.werte });
    entwuerfeMerken(l);
    setEdit(null);
    showToast("Als Entwurf gesichert — steht noch nicht im Fahrtenbuch.");
  };
  const entwurfOeffnen = (e) => {
    if (edit) return;
    setEdit({ id: e.id, neu: true, grund: "", werte: { ...(e.werte || {}) } });
  };
  const entwurfVerwerfen = (id) => {
    entwuerfeMerken(entwurfLoeschen(entwuerfe, id));
    showToast("Entwurf verworfen.");
  };
  const setWert = (k, v) => setEdit((e) => e && ({ ...e, werte: { ...e.werte, [k]: v } }));
  const eintragen = async (storno = false) => {
    if (!edit) return;
    const kunde = customers.find((c) => String(c.name || c.nom || "").trim() && String(edit.werte.zweck || "").toLowerCase().includes(String(c.name || c.nom).toLowerCase()));
    // `fahrtFehler` verlangt einen Startort; die Maske zeigt ihn jetzt, leer
    // gelassen greift dieselbe Kette wie früher (Ziel der Vorfahrt, sonst Hof).
    const start = String(edit.werte.start || "").trim() || edit.alt?.start || letzteFahrt?.ziel || fbStartStandard;
    // Leergeräumtes Fahrer-Feld: `fahrtAusZeile` nimmt `z.fahrer` schon bei ""
    // (?? greift nur bei null/undefined) — ohne diese Zeile stünde die Fahrt
    // ohne Fahrer im Buch, und genau den verlangt das Formular.
    const fahrer = String(edit.werte.fahrer || "").trim() || edit.alt?.fahrer || meName;
    const vorlage = {
      id: edit.id, fahrzeugId: fahrzeug.id,
      fahrer, start,
      distanz: edit.alt?.distanz ?? "",
      kundeId: kunde ? String(kunde.id || kunde.rowid) : (edit.alt?.kundeId || ""),
      kundeName: kunde ? String(kunde.name || kunde.nom) : (edit.alt?.kundeName || ""),
      projektId: edit.alt?.projektId || "", projektName: edit.alt?.projektName || "",
      // GPS-Nachweis bleibt an der Fahrt hängen, auch wenn nachträglich getippt wird.
      ...(edit.werte._gps ? { gps: edit.werte._gps } : edit.alt?.gps ? { gps: edit.alt.gps } : {}),
    };
    const fahrt = storno ? { id: edit.id, storniert: true } : { ...fahrtAusZeile({ ...edit.werte, start, fahrer }, vorlage), storniert: false };
    if (!storno) {
      const fehler = fahrtFehler(fahrt);
      if (fehler) { showToast(fehler, "error"); return; }
    }
    if (!edit.neu && !edit.grund.trim()) { showToast("Bitte einen Änderungsvermerk eintragen (Grund).", "error"); return; }
    const ok = await speichern({ fahrt, grund: edit.neu ? "" : edit.grund.trim(), ...(fahrzeugFehlt ? { fahrzeug: fahrzeug } : {}) });
    if (ok) {
      // Aus dem Entwurf ist jetzt eine Fahrt geworden — sonst stünde sie doppelt da.
      if (entwuerfe.some((e) => e.id === edit.id)) entwuerfeMerken(entwurfLoeschen(entwuerfe, edit.id));
      setEdit(null);
    }
  };

  // ── GPS ──
  const aufzeichnungStart = () => {
    if (!navigator.geolocation) { showToast("Kein GPS in diesem Browser", "error"); return; }
    const seit = new Date();
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lon: pos.coords.longitude, genauigkeit: pos.coords.accuracy, t: pos.timestamp };
        setAufz((a) => { const n = a ? { ...a, punkte: [...a.punkte, p] } : { watchId, seit, punkte: [p] }; aufzRef.current = n; return n; });
      },
      (err) => showToast("GPS: " + (err?.message || "keine Position"), "error"),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    );
    const a = { watchId, seit, punkte: [] };
    aufzRef.current = a; setAufz(a);
    showToast("Aufzeichnung läuft — beim Stopp wird die Zeile vorbefüllt.");
  };
  const aufzeichnungStopp = () => {
    const a = aufzRef.current; if (!a) return;
    navigator.geolocation.clearWatch(a.watchId);
    const km = streckeAusPunkten(a.punkte);
    const beginn = parseFloat(edit?.werte?.kmBeginn ?? kmStand[fahrzeug.id]);
    // Die Werte gehen in die sichtbaren Felder der Maske — was das GPS gemessen
    // hat, muss vor dem Eintragen prüfbar (und korrigierbar) sein.
    const vor = {
      ziel: edit?.werte?.ziel || fbKoord(a.punkte[a.punkte.length - 1]),
      zeitVon: fbUhrzeit(a.seit), zeitBis: fbUhrzeit(),
      _gps: { punkte: a.punkte.length, km, von: a.seit.toISOString(), bis: new Date().toISOString() },
      ...(Number.isFinite(beginn) ? { kmBeginn: beginn, kmEnde: Math.round(beginn + km) } : { distanz: km }),
    };
    aufzRef.current = null; setAufz(null);
    if (edit?.neu) setEdit((e) => ({ ...e, werte: { ...e.werte, ...vor } })); else neueZeile(vor);
    showToast(`Aufzeichnung beendet: ${fbZahlDE(km)} km aus ${a.punkte.length} Punkten`);
  };

  // ── Export ──
  const logoDataUrl = async () => {
    try {
      const blob = await (await fetch("/logo.png")).blob();
      return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(undefined); fr.readAsDataURL(blob); });
    } catch { return undefined; }
  };
  const exportPdf = async (nurFahrzeug = true) => {
    try {
      const { buildFahrtenbuchPdf } = await import("./src/fahrtenbuch-pdf.js");
      const { base64 } = await buildFahrtenbuchPdf(store, { ...(nurFahrzeug ? { fahrzeugId: fahrzeug.id } : { jahr }), logo: await logoDataUrl() });
      const name = nurFahrzeug ? `Fahrtenbuch-${(fahrzeug.kennzeichen || fahrzeug.name || "Fahrzeug").replace(/[^\w-]+/g, "_")}.pdf` : `Fahrtenbuch-${jahr}.pdf`;
      await dateiSpeichern({ inhalt: base64, name, typ: "application/pdf", url: URL.createObjectURL(base64ZuBlob(base64)) }, showToast);
    } catch (e) { showToast("PDF fehlgeschlagen: " + (e?.message || e), "error"); }
  };
  const exportCsv = async () => {
    const csv = fahrtenCsv({ ...store, fahrten: store.fahrten.filter((f) => String(f.datum || "").startsWith(jahr + "-")) });
    const bytes = new TextEncoder().encode("﻿" + csv);
    let bin = ""; bytes.forEach((b) => { bin += String.fromCharCode(b); });
    await dateiSpeichern({ inhalt: btoa(bin), name: `Fahrtenbuch-${jahr}.csv`, typ: "text/csv", url: URL.createObjectURL(new Blob([bytes], { type: "text/csv" })) }, showToast);
  };
  const fahrzeugAnlegen = async () => {
    if (!fzForm.name.trim()) { showToast("Bitte einen Fahrzeugnamen eintragen.", "error"); return; }
    const ok = await speichern({ fahrzeug: { id: fbId("v"), ...fzForm } });
    if (ok) setFzForm({ name: "", kennzeichen: "", kmStart: "" });
  };

  const jahre = [...new Set([new Date().getFullYear(), ...store.fahrten.map((f) => Number(String(f.datum || "").slice(0, 4))).filter(Boolean)])].sort((a, b) => b - a);
  const ausw = fahrtenAuswertung(store, jahr, { fahrzeugId: fahrzeug.id });
  // Wochentag macht die Datumszeile auf dem Handy lesbar ("Di, 09.09.2026") —
  // auf dem Papierblatt fehlt dafür die Spaltenbreite.
  const fbTagDatum = (iso) => {
    const d = new Date(iso + "T12:00:00");
    const tag = Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-DE", { weekday: "short" }) + " ";
    return tag + fbDatumDE(iso);
  };
  const setzeFahrzeug = (id) => { setFahrzeugId(id); setEdit(null); };

  return (
    <div className="main">
      <div className="page-header" style={{ justifyContent: "space-between" }}>
        <h2>Fahrtenbuch</h2>
        {tab === "fahrten" && !edit && (
          <div style={{ display: "flex", gap: 6 }}>
            {aufz
              ? <button type="button" className="btn btn-danger btn-sm" onClick={aufzeichnungStopp}>GPS Stopp · {fbZahlDE(streckeAusPunkten(aufz.punkte))} km</button>
              : <button type="button" className="btn btn-secondary btn-sm" onClick={aufzeichnungStart}>GPS</button>}
            <button type="button" className="btn btn-primary btn-sm" onClick={() => neueZeile()}>
              <Icon name="plus" size={16} /> Fahrt
            </button>
          </div>
        )}
      </div>

      {!ncOk && <div className="gbu-warn" style={{ marginBottom: 12 }}><Icon name="warning" size={16} /><span>Kein Nextcloud-Zugang — Einträge bleiben nur auf diesem Gerät, bis der Kalender verbunden ist.</span></div>}
      {ausstehend.length > 0 && <div className="gbu-warn" style={{ marginBottom: 12 }}><Icon name="clock" size={16} /><span>{ausstehend.length} Eintrag/Einträge warten auf Verbindung.</span></div>}

      <div className="gbu-chips mb12">
        {[["fahrten", "Fahrten"], ["auswertung", "Auswertung"], ["fahrzeuge", "Fahrzeuge"], ["ueberlassung", "Fahrer / Überlassung"]].map(([id, label]) => (
          <button key={id} type="button" className={`gbu-chip ${tab === id ? "gbu-chip-active" : ""}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === "fahrten" && (<>
        <datalist id="fb-kunden">{customers.map((c) => <option key={c.id || c.rowid} value={c.name || c.nom} />)}</datalist>
        <datalist id="fb-fahrer">{[...new Set([meName, ...personen.map((p) => p.name), ...uebFahrerNamen(uebAlle, { fahrzeugId: fahrzeug.id })].filter(Boolean))].map((n) => <option key={n} value={n} />)}</datalist>

        <div className="fb-kopfzeile">
          {fahrzeuge.length > 1
            ? <select value={fahrzeug.id} onChange={(e) => setzeFahrzeug(e.target.value)}>
                {fahrzeuge.map((v) => <option key={v.id} value={v.id}>{fbFahrzeugName(v)}</option>)}
              </select>
            : <div className="fb-fz-name">{fbFahrzeugName(fahrzeug)}</div>}
          <div className="fb-kmstand">{kmStand[fahrzeug.id] != null ? `${kmStand[fahrzeug.id]} km` : "—"}{laden ? " · lädt…" : ""}</div>
        </div>
        <div className="fb-monat" style={{ marginTop: 4 }}><b>Summe aller Fahrten</b><span>{liste.anzahl} Fahrten</span></div>
        <div className="fb-summe">
          <div className="fb-b"><span>Betrieblich</span><b>{fbZahlDE(liste.summe.betrieblich)} km</b></div>
          <div><span>Wohnung–Betrieb</span><b>{fbZahlDE(liste.summe.wohnungBetrieb)} km</b></div>
          <div><span>Privat</span><b>{fbZahlDE(liste.summe.privat)} km</b></div>
        </div>

        {/* Entwürfe stehen oben: es sind die Fahrten, um die man sich noch
            kümmern muss. Sie haben keine laufende Nummer und zählen in keiner
            Summe mit — sie stehen noch nicht im Buch. */}
        {entwuerfeFz.length > 0 && (<>
          <div className="fb-monat" style={{ marginTop: 10 }}><b>Entwürfe</b><span>nur auf diesem Gerät</span></div>
          {entwuerfeFz.map((e) => {
            const k = entwurfKarte(e);
            const zeit = k.zeitVon || k.zeitBis ? `${k.zeitVon || "?"}–${k.zeitBis || "?"}` : "";
            return (
              <div className="fb-entwurf-zeile" key={k.id}>
                <button type="button" className="fb-karte fb-entwurf" style={{ flex: 1, minWidth: 0 }} onClick={() => entwurfOeffnen(e)}>
                  <div className="fb-karte-kopf">
                    <span className="fb-nr">Entwurf</span>
                    <span className="fb-datum">{k.datum ? fbTagDatum(k.datum) : "ohne Datum"}{zeit ? " · " + zeit : ""}</span>
                    <span className={`fb-art fb-art-${k.art}`}>{k.art}</span>
                  </div>
                  <div className={`fb-zweck ${k.zweck ? "" : "fb-leerfeld"}`}>{k.zweck || "ohne Zweck"}</div>
                  <div className="fb-weg">{k.start || "—"}<i>→</i>{k.ziel || "—"}</div>
                  <div className="fb-karte-fuss">
                    <span>{k.fahrer}</span>
                    <b>{k.km > 0 ? `${fbZahlDE(k.km)} km` : "— km"}</b>
                  </div>
                  {k.offen.length > 0
                    ? <div className="fb-entwurf-offen">{k.offen.map((o) => <span key={o}>fehlt: {o}</span>)}</div>
                    : <div className="fb-marker">Vollständig — zum Eintragen antippen.</div>}
                </button>
                <button type="button" className="fb-entwurf-weg" title="Entwurf verwerfen"
                  aria-label="Entwurf verwerfen" onClick={() => entwurfVerwerfen(k.id)}><Icon name="trash" size={16} /></button>
              </div>
            );
          })}
        </>)}

        {liste.anzahl === 0 && entwuerfeFz.length === 0 && (
          <div className="fb-leer">Noch keine Fahrt eingetragen.<br />Oben auf <b>+ Fahrt</b> tippen — oder <b>GPS</b> starten und die Strecke aufzeichnen lassen.</div>
        )}
        {liste.monate.map((m) => (
          <Fragment key={m.key}>
            <div className="fb-monat"><b>{m.label}</b><span>{fbZahlDE(m.summe.betrieblich)} km betrieblich</span></div>
            {m.fahrten.map((f) => {
              const k = fahrtKarte(f);
              const zeit = k.zeitVon || k.zeitBis ? `${k.zeitVon || "?"}–${k.zeitBis || "?"}` : "";
              const stand = k.kmBeginn !== "" && k.kmEnde !== "" ? `${k.kmBeginn} → ${k.kmEnde} km` : "";
              return (
                <button type="button" key={k.id}
                  className={`fb-karte ${k.storniert ? "fb-karte-storno" : ""} ${k.ausstehend ? "fb-karte-wartet" : ""} ${k.geaendert && !k.storniert ? "fb-karte-geaendert" : ""}`}
                  onClick={() => zeileOeffnen(f)}>
                  <div className="fb-karte-kopf">
                    <span className="fb-nr">{k.lfdNr ? "Nr. " + k.lfdNr : "neu"}</span>
                    <span className="fb-datum">{fbTagDatum(k.datum)}{zeit ? " · " + zeit : ""}</span>
                    <span className={`fb-art fb-art-${k.art}`}>{k.art}</span>
                  </div>
                  <div className={`fb-zweck ${k.zweck ? "" : "fb-leerfeld"}`}>{k.zweck || (k.art === "P" ? "Privatfahrt" : "ohne Zweck")}</div>
                  <div className="fb-weg">{k.start || "—"}<i>→</i>{k.ziel || "—"}</div>
                  <div className="fb-karte-fuss">
                    <span>{[stand, k.fahrer].filter(Boolean).join(" · ")}</span>
                    <b>{fbZahlDE(k.km)} km</b>
                  </div>
                  {/* Storno und Änderung bleiben sichtbar an der Fahrt — sie sind
                      der Nachweis, dass nichts still verschwunden ist. */}
                  {k.ausstehend && <div className="fb-marker">Wartet auf Verbindung.</div>}
                  {k.storniert && <div className="fb-marker">Storniert{k.grund ? ` — ${k.grund}` : ""}</div>}
                  {!k.storniert && k.geaendert && <div className="fb-marker">Geändert{k.grund ? ` — ${k.grund}` : ""}</div>}
                </button>
              );
            })}
          </Fragment>
        ))}

        <div className="fb-fuss">
          <b>B</b> betrieblich (Kunde/Auftrag) · <b>W</b> Wohnung–Betrieb · <b>P</b> privat (nur km-Stände nötig).
          Sofort nach der Fahrt eintragen. Geändert wird nur mit Vermerk, gelöscht gar nicht — eine falsche Fahrt wird storniert und bleibt stehen.
          {server?.kettePruefung && (
            <div style={{ marginTop: 6, color: server.kettePruefung.ok ? "var(--accent2)" : "var(--danger)" }}>
              {server.kettePruefung.ok
                ? `Prüfkette intakt: ${server.kettePruefung.n} Vorgänge${server.kettePruefung.ohneKette ? `, ${server.kettePruefung.ohneKette} Fahrten von vor der Kette` : ""}.`
                : `Prüfkette gebrochen ab Vorgang ${server.kettePruefung.bruch} — der Speicher wurde außerhalb der App verändert.`}
              {" "}{fbStempelText(server)}
            </div>
          )}
        </div>
        <div className="action-row action-row-2">
          <button type="button" className="btn btn-secondary" onClick={() => exportPdf(true)}><Icon name="download" size={16} /> PDF (Papierblatt)</button>
          <button type="button" className="btn btn-secondary" onClick={exportCsv}><Icon name="download" size={16} /> CSV {jahr}</button>
        </div>
      </>)}

      {/* Eingabemaske als Bogen von unten — auf dem Handy ist ein Formular mit
          ganzen Zeilen bedienbar, eine 7-spaltige Tabellenzeile ist es nicht. */}
      {edit && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && abbrechen()}>
          <div className="modal">
            <div className="modal-handle" />
            <div className="modal-title">{edit.neu ? "Fahrt eintragen" : `Fahrt ändern${edit.alt?.lfdNr ? " · Nr. " + edit.alt.lfdNr : ""}`}</div>

            <div className="form-row mb12">
              <div className="field-group"><label>Datum</label>
                <input type="date" value={edit.werte.datum || ""} onChange={(e) => setWert("datum", e.target.value)} /></div>
              <div className="field-group"><label>Art</label>
                <div className="fb-art-wahl">
                  {FB_ART_WAHL.map((a) => (
                    <button type="button" key={a.k} className={edit.werte.art === a.k ? "aktiv" : ""} onClick={() => setWert("art", a.k)}
                      title={`${a.t} — ${a.hilfe}`}><b>{a.k}</b>{a.t.split("–")[0]}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="form-row mb12">
              <div className="field-group"><label>Von (Uhrzeit)</label>
                <input type="time" value={edit.werte.zeitVon || ""} onChange={(e) => setWert("zeitVon", e.target.value)} /></div>
              <div className="field-group"><label>Bis</label>
                <input type="time" value={edit.werte.zeitBis || ""} onChange={(e) => setWert("zeitBis", e.target.value)} /></div>
            </div>
            <div className="field-group mb12"><label>Startort</label>
              <input value={edit.werte.start || ""} onChange={(e) => setWert("start", e.target.value)} placeholder={fbStartStandard} /></div>
            <div className="field-group mb12"><label>Ziel</label>
              <input value={edit.werte.ziel || ""} onChange={(e) => setWert("ziel", e.target.value)} placeholder="z. B. Lich, Kirchplatz 2" /></div>
            <div className="form-row mb12">
              <div className="field-group"><label>km-Stand Beginn</label>
                <input type="number" inputMode="numeric" value={edit.werte.kmBeginn ?? ""} onChange={(e) => setWert("kmBeginn", e.target.value)} /></div>
              <div className="field-group"><label>km-Stand Ende</label>
                <input type="number" inputMode="numeric" value={edit.werte.kmEnde ?? ""} onChange={(e) => setWert("kmEnde", e.target.value)} /></div>
            </div>
            <div className="field-group mb12"><label>Oder Strecke in km</label>
              <input type="number" inputMode="decimal" value={edit.werte.distanz ?? ""} onChange={(e) => setWert("distanz", e.target.value)}
                placeholder="nur wenn keine km-Stände" />
              <div className="fb-hinweis">
                {edit.werte.kmBeginn !== "" && edit.werte.kmEnde !== "" && edit.werte.kmBeginn != null && edit.werte.kmEnde != null
                  ? `Ergibt ${fbZahlDE(fahrtDistanz({ kmBeginn: edit.werte.kmBeginn, kmEnde: edit.werte.kmEnde }))} km.`
                  : "km-Stände sind die saubere Fassung — die Strecke allein nur, wenn der Tacho nicht abgelesen wurde."}
                {edit.werte._gps ? ` GPS: ${fbZahlDE(edit.werte._gps.km)} km aus ${edit.werte._gps.punkte} Punkten.` : ""}
              </div>
            </div>
            <div className="field-group mb12"><label>Zweck / Kunde{edit.werte.art === "B" ? " (Pflicht)" : ""}</label>
              <input list="fb-kunden" value={edit.werte.zweck || ""} onChange={(e) => setWert("zweck", e.target.value)}
                placeholder={edit.werte.art === "B" ? "Kunde, Anlass — z. B. Müller GmbH, Heckenschnitt" : "freiwillig"} /></div>
            <div className="field-group mb12"><label>Fahrer</label>
              <input list="fb-fahrer" value={edit.werte.fahrer || ""} onChange={(e) => setWert("fahrer", e.target.value)} /></div>

            {/* Ohne Vermerk weist der Server die Änderung mit 400 ab und der
                Eintrag wäre weg — das Feld darf hier nie fehlen. */}
            {!edit.neu && (
              <div className="field-group mb12 fb-vermerk-feld"><label>Änderungsvermerk (Pflicht)</label>
                <input value={edit.grund} onChange={(e) => setEdit((x) => ({ ...x, grund: e.target.value }))}
                  placeholder="Grund der Änderung — z. B. km-Stand vertippt" />
                <div className="fb-hinweis">Die alte Fassung bleibt im Fahrtenbuch erhalten.</div>
              </div>
            )}

            <div className={`action-row ${edit.neu ? "action-row-2" : ""}`}>
              <button type="button" className="btn btn-primary" onClick={() => eintragen(false)}>{edit.neu ? "Eintragen" : "Änderung speichern"}</button>
              {/* Nur bei einer neuen Fahrt: eine schon eingetragene Fahrt zum
                  Entwurf zurückzustufen hieße, sie aus dem Buch zu nehmen. */}
              {edit.neu && <button type="button" className="btn btn-secondary" onClick={entwurfSichern}>Als Entwurf sichern</button>}
            </div>
            <div className={`action-row ${!edit.neu && !edit.alt?.storniert ? "action-row-2" : ""}`}>
              {!edit.neu && !edit.alt?.storniert && <button type="button" className="btn btn-danger" onClick={() => eintragen(true)}>Stornieren</button>}
              <button type="button" className="btn btn-secondary" onClick={abbrechen}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
      {tab === "auswertung" && (<>
        <div className="form-row mb12">
          <div className="field-group"><label>Jahr</label>
            <select value={jahr} onChange={(e) => setJahr(Number(e.target.value))}>{jahre.map((j) => <option key={j} value={j}>{j}</option>)}</select>
          </div>
          <div className="field-group"><label>Fahrzeug</label>
            <select value={fahrzeug.id} onChange={(e) => setzeFahrzeug(e.target.value)}>
              {fahrzeuge.map((v) => <option key={v.id} value={v.id}>{fbFahrzeugName(v)}</option>)}
            </select>
          </div>
        </div>
        <div className="stats-grid">
          <div className="stat-card" style={{ cursor: "default" }}><div className="label">Betrieblich {jahr}</div><div className="value accent">{fbZahlDE(ausw.jahr.betrieblich)} km</div></div>
          <div className="stat-card" style={{ cursor: "default" }}><div className="label">Pauschale {fbZahlDE(KM_PAUSCHALE, 2)} €/km</div><div className="value green">{fmtMoney(ausw.jahr.pauschale)}</div></div>
        </div>
        <div className="detail-hero">
          <div className="detail-ref">{jahr}</div>
          <div className="detail-row"><span className="lbl">Betrieblich (B)</span><span className="val">{fbZahlDE(ausw.jahr.betrieblich)} km</span></div>
          <div className="detail-row"><span className="lbl">Wohnung–Betrieb (W)</span><span className="val">{fbZahlDE(ausw.jahr.wohnungBetrieb)} km</span></div>
          <div className="detail-row"><span className="lbl">Privat (P)</span><span className="val">{fbZahlDE(ausw.jahr.privat)} km</span></div>
          <div className="detail-row"><span className="lbl">Gesamt (betrieblich {fbZahlDE(ausw.jahr.anteilBetrieblich * 100, 0)} %)</span><span className="val">{fbZahlDE(ausw.jahr.gesamt)} km</span></div>
          <div className="detail-row"><span className="lbl">Vorschlag Betriebsausgabe (Pauschale)</span><span className="val" style={{ fontWeight: 700 }}>{fmtMoney(ausw.jahr.pauschale)}</span></div>
        </div>
        <div className="detail-hero">
          <div className="detail-ref" style={{ fontSize: 16 }}>Betriebliche km je Monat</div>
          {ausw.monate.filter((m) => m.gesamt > 0).map((m) => (
            <div key={m.monat} className="detail-row"><span className="lbl">{CAL_MONTHS[m.monat - 1]}</span>
              <span className="val">{fbZahlDE(m.betrieblich)} km · {fmtMoney(m.pauschale)}</span></div>
          ))}
          {!ausw.monate.some((m) => m.gesamt > 0) && <div className="sub" style={{ color: "var(--text2)" }}>Keine Fahrten in {jahr}.</div>}
        </div>
        <div className="detail-hero">
          <div className="detail-ref" style={{ fontSize: 16 }}>Kilometerstand</div>
          {store.fahrzeuge.map((v) => (
            <div key={v.id} className="detail-row"><span className="lbl">{fbFahrzeugName(v)}</span><span className="val">{kmStand[v.id] != null ? `${kmStand[v.id]} km` : "—"}</span></div>
          ))}
        </div>
        <div className="action-row action-row-2">
          <button type="button" className="btn btn-secondary" onClick={exportCsv}><Icon name="download" size={16} /> CSV {jahr}</button>
          <button type="button" className="btn btn-secondary" onClick={() => exportPdf(false)}><Icon name="download" size={16} /> PDF {jahr}</button>
        </div>
      </>)}

      {tab === "fahrzeuge" && (<>
        {store.fahrzeuge.map((v) => (
          <div key={v.id} className="list-item" style={{ cursor: "default" }}>
            <div className="list-info"><div className="name">{v.name}</div><div className="sub">{v.kennzeichen || "ohne Kennzeichen"}{v.kmStart != null ? ` · Startstand ${v.kmStart} km` : ""}</div></div>
            <div className="list-amount">{kmStand[v.id] != null ? `${kmStand[v.id]} km` : "—"}</div>
          </div>
        ))}
        <div className="form-section">
          <div className="form-section-title">Fahrzeug anlegen</div>
          <div className="form-group"><label>Bezeichnung</label><input value={fzForm.name} onChange={(e) => setFzForm((f) => ({ ...f, name: e.target.value }))} placeholder={fbFahrzeugStandard.name || "z. B. Transporter"} /></div>
          <div className="form-row">
            <div className="form-group"><label>Kennzeichen</label><input value={fzForm.kennzeichen} onChange={(e) => setFzForm((f) => ({ ...f, kennzeichen: e.target.value }))} placeholder={fbFahrzeugStandard.kennzeichen} /></div>
            <div className="form-group"><label>km-Stand heute</label><input type="number" inputMode="numeric" value={fzForm.kmStart} onChange={(e) => setFzForm((f) => ({ ...f, kmStart: e.target.value }))} /></div>
          </div>
          <button type="button" className="btn btn-primary" style={{ width: "100%" }} onClick={fahrzeugAnlegen}>Fahrzeug speichern</button>
        </div>
      </>)}

      {tab === "ueberlassung" && (uebNeu
        ? <UeberlassungForm fahrzeug={fahrzeug} kmStand={kmStand[fahrzeug.id]} meName={meName} showToast={showToast}
            onCancel={() => setUebNeu(false)} onSave={uebSpeichern} />
        : (<>
          <div className="gbu-warn" style={{ marginBottom: 12 }}><Icon name="shield" size={16} />
            <span>Wer den Firmenwagen fährt, unterschreibt vorher die Überlassung — Führerschein im Original prüfen (§ 21 StVG).</span></div>
          <div className="action-row action-row-2" style={{ marginBottom: 12 }}>
            <button type="button" className="btn btn-secondary" onClick={async () => {
              try {
                const b64 = await uebLeerformular(fahrzeug, betrieb);
                const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: "application/pdf" });
                await dateiSpeichern({ inhalt: b64, name: "Ueberlassung_Leerformular.pdf", typ: "application/pdf", url: URL.createObjectURL(blob) }, showToast);
              } catch (e) { showToast("Leerformular: " + (e?.message || e), "error"); }
            }}><Icon name="download" size={16} /> Leerformular (leer, zum Ausfüllen)</button>
            <button type="button" className="btn btn-primary" onClick={() => setUebNeu(true)}><Icon name="plus" size={16} /> Neue Vereinbarung</button>
          </div>
          {uebAusstehend.length > 0 && <div className="gbu-warn" style={{ marginBottom: 12 }}><Icon name="clock" size={16} /><span>{uebAusstehend.length} Vereinbarung(en) warten auf Verbindung.</span></div>}
          {uebAlle.vereinbarungen.length === 0 && <div className="empty-state"><Icon name="user" size={40} /><p>Noch keine Überlassungsvereinbarung.</p></div>}
          {uebAlle.vereinbarungen.slice().reverse().map((v) => {
            const st = uebStatus(v);
            const cls = st === "gueltig" ? "badge-paid" : st === "kuenftig" ? "badge-open" : "badge-cancelled";
            return (
              <div key={v.id} className="list-item" style={{ cursor: "default", flexWrap: "wrap" }}>
                <div className="list-info">
                  <div className="name">{v.name}</div>
                  <div className="sub">{v.fahrzeug} · {v.unbefristet ? `ab ${fbDatumDE(v.von)}, unbefristet` : `${fbDatumDE(v.von)} – ${fbDatumDE(v.bis)}`} · FS {v.fsKlasse}</div>
                  {v.widerrufenAm && <div className="sub">Widerrufen {fbDatumDE(String(v.widerrufenAm).slice(0, 10))}: {v.widerrufGrund}</div>}
                  {v.ausstehend && <div className="sub">Wartet auf Verbindung — PDF wird beim Nachtragen abgelegt.</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                  <span className={`badge ${cls}`}>{uebStatusLabel(st)}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {v.datei && !v.ausstehend && <button type="button" className="btn btn-secondary btn-xs" onClick={async () => {
                      try {
                        const r = await post("/api/nc/ueberlassungen/datei", { ...creds, jahr: String(v.von || "").slice(0, 4), datei: v.datei });
                        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
                        const blob = await r.blob();
                        const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
                        await dateiSpeichern({ inhalt: b64, name: v.datei, typ: "application/pdf", url: URL.createObjectURL(blob) }, showToast);
                      } catch (e) { showToast("PDF: " + (e?.message || e), "error"); }
                    }}>PDF</button>}
                    {!v.widerrufenAm && !v.ausstehend && st !== "abgelaufen" && <button type="button" className="btn btn-danger btn-xs" onClick={() => setUebWiderruf({ id: v.id, grund: "" })}>Widerrufen</button>}
                  </div>
                </div>
                {uebWiderruf?.id === v.id && (
                  <div style={{ width: "100%", display: "flex", gap: 6, marginTop: 8 }}>
                    <input className="gbu-filter-input" style={{ flex: 1 }} placeholder="Grund des Widerrufs" value={uebWiderruf.grund} onChange={(e) => setUebWiderruf((w) => ({ ...w, grund: e.target.value }))} />
                    <button type="button" className="btn btn-danger btn-xs" onClick={async () => {
                      if (!uebWiderruf.grund.trim()) { showToast("Bitte einen Grund eintragen.", "error"); return; }
                      try {
                        const r = await post("/api/nc/ueberlassungen/widerruf", { ...creds, login: me?.login || "", id: v.id, grund: uebWiderruf.grund.trim() });
                        const st2 = await r.json().catch(() => ({}));
                        if (!r.ok) throw new Error(st2.error || r.status);
                        if (st2?.vereinbarungen) { setUeb(st2); fbMerken(UEB_CACHE_KEY, st2); }
                        setUebWiderruf(null); showToast("Überlassung widerrufen.");
                      } catch (e) { showToast("Widerruf fehlgeschlagen: " + (e?.message || e), "error"); }
                    }}>Bestätigen</button>
                    <button type="button" className="btn btn-secondary btn-xs" onClick={() => setUebWiderruf(null)}>Abbrechen</button>
                  </div>
                )}
              </div>
            );
          })}
        </>))}
    </div>
  );
}

// Formular der Überlassungsvereinbarung: Fahrzeug vorbelegt (der Ducato wird
// von mehreren gefahren), Pflichten zum Abhaken, zwei Unterschriften über das
// Signatur-Pad der GBU-/Einweisungsmasken. Speichern erzeugt das PDF mit Logo
// und übergibt es dem Aufrufer (Ablage im Blattwerk-Ordner).
function UeberlassungForm({ fahrzeug, kmStand, meName, showToast, onSave, onCancel }) {
  // Derselbe Name wie im PDF — das Formular zeigt die Pflichten im Wortlaut,
  // den die Fahrerin danach unterschreibt.
  const uebBetrieb = mandantBetrieb(useMandant());
  const uebFirma = uebBetriebNamen(uebBetrieb).kurz || "den Betrieb";
  const [form, setForm] = useState(() => ({
    fahrzeugId: fahrzeug.id, fahrzeug: fbFahrzeugName(fahrzeug),
    name: "", anschrift: "", geburtsdatum: "", telefon: "", verhaeltnis: UEB_VERHAELTNIS[0],
    fsKlasse: "B", fsNummer: "", fsAusgestelltAm: "", fsAusgestelltDurch: "",
    fsGesehenAm: todayISO(), fsGesehenDurch: meName,
    von: todayISO(), bis: "", unbefristet: true, kmUebergabe: kmStand ?? "",
    selbstbeteiligung: UEB_SELBSTBETEILIGUNG_STANDARD,
    pflichten: Object.fromEntries(UEB_PFLICHTEN.map((p) => [p.id, false])),
    bemerkung: "", blattwerkVertreter: meName,
  }));
  const [sigFahrer, setSigFahrer] = useState(null);
  const [sigBlattwerk, setSigBlattwerk] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const fehlt = uebFehlt(form);

  const speichern = async () => {
    if (fehlt.length) { showToast(fehlt[0], "error"); return; }
    if (!sigFahrer) { showToast("Unterschrift des Fahrers fehlt", "error"); return; }
    if (!sigBlattwerk) { showToast("Unterschrift für Blattwerk fehlt", "error"); return; }
    setBusy(true);
    try {
      // Das PDF baut die Seite — sie weiß, ob es abgelegt oder erst nachgetragen wird.
      const v = { ...form, id: fbId("u"), selbstbeteiligung: Number(form.selbstbeteiligung), erfasstAm: new Date().toISOString() };
      await onSave(v, { sigFahrer, sigBlattwerk });
    } catch (e) { showToast("Speichern fehlgeschlagen: " + (e?.message || e), "error"); }
    finally { setBusy(false); }
  };

  return (
    <div className="form-section">
      <div className="form-section-title">Fahrzeug-Überlassungsvereinbarung</div>
      <div className="form-group"><label>Fahrzeug / Kennzeichen</label><input value={form.fahrzeug} onChange={set("fahrzeug")} /></div>
      <div className="section-label">Fahrer</div>
      <div className="form-group"><label>Name *</label><input value={form.name} onChange={set("name")} placeholder="Vor- und Nachname" /></div>
      <div className="form-group"><label>Anschrift *</label><input value={form.anschrift} onChange={set("anschrift")} placeholder="Straße, PLZ Ort" /></div>
      <div className="form-row">
        <div className="form-group"><label>Geburtsdatum *</label><input type="date" value={form.geburtsdatum} max={todayISO()} onChange={set("geburtsdatum")} /></div>
        <div className="form-group"><label>Telefon</label><input value={form.telefon} onChange={set("telefon")} /></div>
      </div>
      <div className="form-group"><label>Verhältnis zu {uebFirma} *</label>
        <select value={form.verhaeltnis} onChange={set("verhaeltnis")}>{UEB_VERHAELTNIS.map((x) => <option key={x} value={x}>{x}</option>)}</select>
      </div>
      <div className="section-label">Fahrerlaubnis (§ 21 StVG)</div>
      <div className="form-row">
        <div className="form-group"><label>Klasse *</label>
          <select value={form.fsKlasse} onChange={set("fsKlasse")}>{UEB_FS_KLASSEN.map((k) => <option key={k} value={k}>{k}</option>)}</select>
        </div>
        <div className="form-group"><label>Führerschein-Nr. *</label><input value={form.fsNummer} onChange={set("fsNummer")} /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>ausgestellt am</label><input type="date" value={form.fsAusgestelltAm} max={todayISO()} onChange={set("fsAusgestelltAm")} /></div>
        <div className="form-group"><label>ausgestellt durch</label><input value={form.fsAusgestelltDurch} onChange={set("fsAusgestelltDurch")} placeholder="Behörde" /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Im Original gesehen am *</label><input type="date" value={form.fsGesehenAm} max={todayISO()} onChange={set("fsGesehenAm")} /></div>
        <div className="form-group"><label>durch *</label><input value={form.fsGesehenDurch} onChange={set("fsGesehenDurch")} /></div>
      </div>
      <div className="section-label">Überlassung</div>
      <div className="form-row">
        <div className="form-group"><label>Von *</label><input type="date" value={form.von} onChange={set("von")} /></div>
        <div className="form-group"><label>Bis</label><input type="date" value={form.bis} disabled={form.unbefristet} onChange={set("bis")} /></div>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, marginBottom: 12 }}>
        <input type="checkbox" checked={form.unbefristet} onChange={set("unbefristet")} /> unbefristet (jederzeit widerruflich)
      </label>
      <div className="form-group"><label>km-Stand bei Übergabe</label>
        <input type="number" inputMode="numeric" min="0" step="1" value={form.kmUebergabe} onChange={set("kmUebergabe")} placeholder="aus dem Fahrtenbuch vorbelegt" />
      </div>
      <div className="form-group"><label>Selbstbeteiligung bei selbstverschuldetem Schaden (€) *</label>
        <input type="number" inputMode="decimal" min="0" step="50" value={form.selbstbeteiligung} onChange={set("selbstbeteiligung")} />
      </div>
      <div className="section-label">Pflichten des Fahrers (alle bestätigen)</div>
      {UEB_PFLICHTEN.map((p) => (
        <label key={p.id} className="gbu-item" style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5 }}>
          <input type="checkbox" checked={form.pflichten[p.id] === true} onChange={(e) => setForm((f) => ({ ...f, pflichten: { ...f.pflichten, [p.id]: e.target.checked } }))} />
          <span>{uebPflichtText(p, form, uebBetrieb)}</span>
        </label>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => setForm((f) => ({ ...f, pflichten: Object.fromEntries(UEB_PFLICHTEN.map((p) => [p.id, true])) }))}>Alle bestätigen</button>
      <div className="form-group"><label>Bemerkung</label><input value={form.bemerkung} onChange={set("bemerkung")} /></div>
      <div className="form-group"><label>Für {uebFirma} unterzeichnet</label><input value={form.blattwerkVertreter} onChange={set("blattwerkVertreter")} /></div>

      <div className="section-label">Unterschrift Fahrer{form.name ? ` — ${form.name}` : ""}</div>
      <SignaturePad onChange={setSigFahrer} initial={sigFahrer} height={260} />
      <div className="section-label" style={{ marginTop: 12 }}>Unterschrift {uebFirma} — {form.blattwerkVertreter || "…"}</div>
      <SignaturePad onChange={setSigBlattwerk} initial={sigBlattwerk} height={260} />

      {fehlt.length > 0 && <div className="sub" style={{ fontSize: 12, color: "var(--warn)", margin: "10px 0" }}>{fehlt[0]}</div>}
      <div className="action-row action-row-2" style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Abbrechen</button>
        <button type="button" className="btn btn-primary" onClick={speichern} disabled={busy}>{busy ? "Speichere…" : "Unterschrieben speichern"}</button>
      </div>
    </div>
  );
}
// ─── Ende Fahrtenbuch ────────────────────────────────────────────────────────

// ─── Betriebsdokumente: Ordner-Ablage in Nextcloud ───────────────────────────
// „Wichtige Dokumente" zum Vorzeigen unterwegs (KFZ-Schein, Versicherung,
// Gewerbeschein, Arbeitnehmer-Unterlagen …). Liegt unter
// Blattwerk/Dokumente/<Ordner>/ in Nextcloud (synct also auf alle Geräte);
// sehen dürfen alle, hochladen nur Geschäftsführer/Admins. Das Paperless-
// Archiv von früher bleibt als eigener Eintrag erreichbar. Eine Ebene tiefer gibt es
// „Fächer" (KFZ/<Fahrzeug>, Versicherung/<Fahrzeug>, Anleitungen/Klettern …): echte
// Unterordner in Nextcloud; ein neues Fach entsteht mit dem ersten Upload.
const DOKUMENTE_ORDNER = [
  { key: "KFZ",          icon: "receive",  accent: "schiefer" },
  { key: "Versicherung", icon: "shield",   accent: "rost" },
  { key: "Gewerbe",      icon: "archive",  accent: "moos" },
  { key: "Arbeitnehmer", icon: "user",     accent: "pflaume" },
  { key: "Verträge",     icon: "edit",     accent: "ocker" },
  { key: "Anleitungen",  icon: "settings", accent: "petrol" },
  { key: "Sonstiges",    icon: "invoice",  accent: "erde" },
];

function BetriebsDokumente({ me, onBack, showToast }) {
  const [nc] = useState(loadNcConfig);
  const [ordner, setOrdner] = useState(null);
  const [fach, setFach] = useState("");
  const [faecher, setFaecher] = useState([]);
  const [neuesFach, setNeuesFach] = useState("");
  const [files, setFiles] = useState(null);
  const [ansicht, setAnsicht] = useState(null);
  const [busy, setBusy] = useState(false);
  const [archiv, setArchiv] = useState(false);

  const ncCall = useCallback(async (pfad, extra) => {
    const r = await apiFetch(pfad, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server: nc.server, user: nc.user, pass: nc.pass, ...extra }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || "Status " + r.status);
    }
    return r;
  }, [nc]);

  const laden = useCallback((o, f = "") => {
    setFiles(null); setFach(f);
    ncCall("/api/nc/dokumente-list", { ordner: o, fach: f })
      .then((r) => r.json()).then((d) => { setFiles(d.files || []); if (!f) setFaecher(d.faecher || []); })
      .catch((e) => { setFiles([]); showToast("Laden fehlgeschlagen: " + e.message, "error"); });
  }, [ncCall, showToast]);

  const oeffnen = async (name) => {
    try {
      const r = await ncCall("/api/nc/dokumente-file", { ordner, fach, filename: name });
      const url = URL.createObjectURL(await r.blob());
      setAnsicht({ name, url });
    } catch (e) { showToast("Öffnen fehlgeschlagen: " + e.message, "error"); }
  };

  const hochladen = async (file) => {
    setBusy(true);
    try {
      const b64 = await new Promise((ok, err) => {
        const fr = new FileReader();
        fr.onload = () => ok(String(fr.result).split(",")[1]);
        fr.onerror = err;
        fr.readAsDataURL(file);
      });
      await ncCall("/api/nc/dokumente-upload", { ordner, fach, filename: file.name, dataBase64: b64 });
      showToast("Hochgeladen: " + file.name);
      laden(ordner, fach);
    } catch (e) { showToast("Hochladen fehlgeschlagen: " + e.message, "error"); }
    finally { setBusy(false); }
  };

  if (archiv) return (
    <PaperlessDocs thema={PL_THEMA.betriebsdokument} titel="Archiv (Paperless)"
      hinweis="Ältere Ablage — Neues bitte in die Ordner." onBack={() => setArchiv(false)} showToast={showToast} />
  );

  if (!ordner) return (
    <div className="main">
      <div className="page-header">
        <div className="back-btn" onClick={onBack}><Icon name="back" size={20} /></div>
        <h2>Wichtige Dokumente</h2>
      </div>
      {!ncReady(nc) && <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 10 }}>Kein Nextcloud-Konto verbunden (Einstellungen → Nextcloud) — Anzeigen/Hochladen geht erst danach.</p>}
      <div className="quick-actions">
        {DOKUMENTE_ORDNER.map((o) => (
          <div key={o.key} className="quick-btn" onClick={() => { setOrdner(o.key); laden(o.key); }}>
            <div className="quick-btn-icon" style={{ background: `var(--k-${o.accent}-bg)`, color: `var(--k-${o.accent})` }}><Icon name={o.icon} size={19} /></div>
            <span>{o.key}</span>
          </div>
        ))}
        <div className="quick-btn" onClick={() => setArchiv(true)}>
          <div className="quick-btn-icon" style={{ background: "var(--surface2)", color: "var(--text2)" }}><Icon name="archive" size={19} /></div>
          <span>Archiv (Paperless)</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="main">
      <div className="page-header">
        <div className="back-btn" onClick={() => { if (fach) laden(ordner); else { setOrdner(null); setFiles(null); setFaecher([]); } }}><Icon name="back" size={20} /></div>
        <h2>{fach ? `${ordner} · ${fach}` : ordner}</h2>
      </div>
      {me?.canUploadDokumente && (
        <label className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12, opacity: busy ? 0.6 : 1 }}>
          <Icon name="plus" size={15} /> {busy ? "Lade hoch…" : "Dokument hochladen"}
          <input type="file" accept="application/pdf,image/*" style={{ display: "none" }} disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) hochladen(f); }} />
        </label>
      )}
      {me?.canUploadDokumente && !fach && files !== null && (
        // Eingabefeld statt window.prompt: im WebView der Android-Hülle gibt es keinen Prompt-Dialog.
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input value={neuesFach} onChange={(e) => setNeuesFach(e.target.value)} placeholder="Neues Fach (z. B. Fahrzeug, Maschine)" style={{ flex: 1 }} />
          <button type="button" className="btn btn-secondary" disabled={!neuesFach.trim()}
            onClick={() => { setFach(neuesFach.replace(/[/\\]/g, " ").trim().slice(0, 80)); setFiles([]); setNeuesFach(""); }}>Anlegen</button>
        </div>
      )}
      {!fach && files !== null && faecher.map((f) => (
        <div key={"fach-" + f} className="list-item" onClick={() => laden(ordner, f)}>
          <div className="list-avatar" style={{ background: "var(--k-ocker-bg)", color: "var(--k-ocker)" }}><Icon name="archive" size={19} /></div>
          <div className="list-info"><div className="name">{f}</div><div className="sub">Fach</div></div>
        </div>
      ))}
      {files === null ? <div className="loading"><div className="spinner" /> Lade...</div>
        : files.length === 0 ? (faecher.length > 0 && !fach ? null : <div className="empty-state"><Icon name="archive" size={48} /><p>Noch keine Dokumente in „{fach || ordner}"{fach ? " — das Fach entsteht mit dem ersten Hochladen." : ""}</p></div>)
        : files.map((f) => (
          <div key={f.name} className="list-item" onClick={() => oeffnen(f.name)}>
            <div className="list-avatar" style={{ background: "var(--k-schiefer-bg)", color: "var(--k-schiefer)" }}><Icon name="download" size={19} /></div>
            <div className="list-info">
              <div className="name">{f.name}</div>
              <div className="sub">{f.modified ? new Date(f.modified).toLocaleDateString("de-DE") : ""}</div>
            </div>
          </div>
        ))}
      {ansicht && <DateiAnsichtModal titel={ansicht.name} datei={ansicht} showToast={showToast}
        onClose={() => { URL.revokeObjectURL(ansicht.url); setAnsicht(null); }} />}
    </div>
  );
}

// ─── Modul „Bank": Bankzeilen je Konto, nur lesend (src/bank.js) ───
function BankPage({ api, me, onBack, showToast, zeileId = null }) {
  const darfSchreiben = !!me?.canRecordPayments;
  const [konten, setKonten] = useState(null);
  const [kontoId, setKontoId] = useState(null);
  const [roh, setRoh] = useState(null);
  const [filter, setFilter] = useState("alle");
  const [fehler, setFehler] = useState("");
  const markiertRef = useRef(null);
  const [nc] = useState(loadNcConfig);
  const [ladeHoch, setLadeHoch] = useState(false);
  const [ohneZeile, setOhneZeile] = useState([]);
  const [wahl, setWahl] = useState(null);
  const [bogen, setBogen] = useState(null);
  const [auszug, setAuszug] = useState("");
  const [busy, setBusy] = useState(false);
  const [neuLaden, setNeuLaden] = useState(0);
  const [offenStore, setOffenStore] = useState(null);
  const [regelStore, setRegelStore] = useState(null);
  const [offeneRechnungen, setOffeneRechnungen] = useState([]);
  const [lieferanten, setLieferanten] = useState([]);
  const [anlage, setAnlage] = useState(null);
  const [zahlungFuer, setZahlungFuer] = useState(null);
  const [ohneBis, setOhneBis] = useState(null);
  // Teil 7 „neu“: höchste Bankzeilen-Id des letzten Besuchs je Konto (nur dieses Gerät); bleibt während des Besuchs stehen.
  const neuAbRef = useRef({});

  const hochladen = async (file) => {
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      showToast("Nur PDF-Dateien", "error");
      return;
    }
    setLadeHoch(true);
    try {
      const b64 = await new Promise((ok, err) => {
        const fr = new FileReader();
        fr.onload = () => ok(String(fr.result).split(",")[1]);
        fr.onerror = err;
        fr.readAsDataURL(file);
      });
      const r = await apiFetch("/api/nc/kontoauszug", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: nc.server, user: nc.user, pass: nc.pass, filename: `${todayISO()}_${String(Date.now()).slice(-6)}_${file.name}`.replace(/\s+/g, "_"), dataBase64: b64 }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Status " + r.status);
      showToast("Kontoauszug übergeben — der Abgleich kommt im Chat-Raum „Blattwerk Buchhaltung“");
    } catch (e) { showToast("Hochladen fehlgeschlagen: " + (e.message || e), "error"); }
    finally { setLadeHoch(false); }
  };

  useEffect(() => {
    api.getBankAccounts().then((konten) => {
      const liste = Array.isArray(konten) ? konten : [];
      setKonten(liste);
      if (zeileId) {
        api.getBankLine(zeileId).then((zeile) => {
          setKontoId(String(zeile.fk_account));
        }).catch(() => {
          showToast("Bankzeile nicht gefunden", "error");
          if (liste[0]) setKontoId(String(liste[0].id));
        });
      } else if (liste[0]) {
        setKontoId(String(liste[0].id));
      }
    }).catch((e) => setFehler(doliError(e) || "Ladefehler"));
  }, [api, zeileId]);

  useEffect(() => {
    if (!kontoId) return;
    setRoh(null);
    api.getBankLines(kontoId).then((z) => {
      const liste = Array.isArray(z) ? z : [];
      try {
        const gemerkt = JSON.parse(localStorage.getItem("blattwerk_bank_gesehen") || "{}") || {};
        if (!(kontoId in neuAbRef.current)) neuAbRef.current[kontoId] = Number(gemerkt[kontoId]) || 0;
        localStorage.setItem("blattwerk_bank_gesehen", JSON.stringify({ ...gemerkt, [kontoId]: Math.max(0, ...liste.map((x) => Number(x.id) || 0)) }));
      } catch (_) {}
      setRoh(liste);
    }).catch((e) => {
      if (String(e?.message || e).includes("API Error 404")) setRoh([]);
      else setFehler(doliError(e) || "Ladefehler");
    });
  }, [api, kontoId, neuLaden]);

  useEffect(() => {
    if (!darfSchreiben) return;
    api.getBankZahlungenOhneZeile().then((l) => setOhneZeile(Array.isArray(l) ? l : [])).catch(() => setOhneZeile([]));
  }, [api, darfSchreiben, neuLaden]);

  // Teil 5: was der Bot als „im Auszug, fehlt in Dolibarr" abgelegt hat, plus das
  // Gedaechtnis der App (erledigt/Regeln). Fehler bleiben still — der Abschnitt fehlt dann einfach.
  useEffect(() => {
    if (!(darfSchreiben && ncHasAccess(nc))) return;
    apiFetch("/api/nc/bank-offen", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server: nc.server, user: nc.user, pass: nc.pass }),
    }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d) { setOffenStore(d.offen); setRegelStore(d.regeln); }
    }).catch(() => {});
  }, [api, darfSchreiben, neuLaden]);

  // Lieferanten + offene Rechnungen (beide Richtungen) fuer den Vorschlag „Zahlung auf offene Rechnung".
  useEffect(() => {
    if (!darfSchreiben) return;
    api.getThirdparties("supplier").then((l) => setLieferanten(Array.isArray(l) ? l : [])).catch(() => setLieferanten([]));
    Promise.all([
      api.getSupplierInvoicesAlle().catch(() => []),
      api.getInvoicesAlle().catch(() => []),
    ]).then(([lief, kunde]) => {
      const l = (Array.isArray(lief) ? lief : [])
        .filter((r) => Number(r.statut) === 1)
        .map((r) => ({ id: r.id, ref: r.ref, rest: lieferantRestBetrag(r), art: "lieferant", socid: r.socid, inv: r }))
        .filter((r) => r.rest > 0);
      const k = (Array.isArray(kunde) ? kunde : [])
        .filter((r) => Number(r.statut) === 1)
        .map((r) => ({ id: r.id, ref: r.ref, rest: restBetrag(r), art: "kunde", socid: r.socid, inv: r }))
        .filter((r) => r.rest > 0);
      setOffeneRechnungen([...l, ...k]);
    }).catch(() => setOffeneRechnungen([]));
  }, [api, darfSchreiben]);

  useEffect(() => {
    markiertRef.current?.scrollIntoView({ block: "center" });
  }, [roh, zeileId]);

  const neuAb = neuAbRef.current[kontoId] || 0;
  const zeilen = wahl ? bankKandidaten(wahl, roh) : bankZeilen(roh, filter, offenStore, neuAb);
  const fehlend = bankOffeneFuerKonto(offenStore, regelStore, kontoId);
  const zumAbhaken = darfSchreiben ? bankSammelAbhaken(offenStore, kontoId, roh) : [];
  const zumAnlegen = darfSchreiben ? bankSammelAnlegen(fehlend, regelStore?.regeln, offeneRechnungen) : [];
  const konto = (konten || []).find((k) => String(k.id) === String(kontoId));
  const ohne = ohneBis ? bankOhneAuszug(roh, ohneBis) : null;

  // Alles abhaken, was der Bot sicher im Kontoauszug wiedergefunden hat (Betrag Cent-genau, ± 2 Tage).
  // Nacheinander statt parallel: bricht eine Zeile ab, ist klar, wie weit es kam; der Rest bleibt stehen.
  const sammelAbhaken = async () => {
    setBusy(true);
    let fertig = 0;
    try {
      for (const { zeile, auszug: nr } of zumAbhaken) { await api.bankAbgleich(zeile.id, true, nr); fertig += 1; }
      showToast(`${fertig} Bankzeilen als abgeglichen markiert`);
    } catch (e) {
      showToast(`${fertig} von ${zumAbhaken.length} abgehakt, dann: ${doliError(e) || e.message || "Fehler"}`, "error");
    } finally {
      setBusy(false);
      setNeuLaden((n) => n + 1);
    }
  };

  // Teil 7: alle Empfehlungen übernehmen, die ohne Rückfrage ausführbar sind (bankSammelAnlegen) – nacheinander, wie beim Abhaken.
  const sammelAnlegen = async () => {
    setBusy(true);
    let fertig = 0;
    try {
      for (const { e, vorschlag } of zumAnlegen) { await buchungAnlegen(e, { ...vorschlag, neuerName: "" }, true); fertig += 1; }
      showToast(`${fertig} Empfehlungen übernommen`);
    } catch (err) {
      showToast(`${fertig} von ${zumAnlegen.length} übernommen, dann: ${doliError(err) || err.message || "Fehler"}`, "error");
    } finally {
      setBusy(false);
      setNeuLaden((n) => n + 1);
    }
  };

  // Teil 7: Konto ohne Kontoauszug (Kasse, Privatkonten) – alle offenen Zeilen bis zum Stichtag abhaken.
  const ohneAuszugAbhaken = async () => {
    setBusy(true);
    let fertig = 0;
    try {
      for (const z of ohne.zeilen) { await api.bankAbgleich(z.id, true, auszug.trim()); fertig += 1; }
      showToast(`${fertig} Bankzeilen als abgeglichen markiert (${auszug.trim()})`);
      setOhneBis(null);
    } catch (e) {
      showToast(`${fertig} von ${ohne.zeilen.length} abgehakt, dann: ${doliError(e) || e.message || "Fehler"}`, "error");
    } finally {
      setBusy(false);
      setNeuLaden((n) => n + 1);
    }
  };

  // Teil 5: eine Buchung als erledigt melden (abgehakt, optional mit gelernter Regel).
  // Schlaegt nur das Abhaken fehl, bleibt das Angelegte stehen — das wird nur gemeldet.
  const erledigtMelden = async (e, regel) => {
    try {
      const r = await apiFetch("/api/nc/bank-offen/erledigt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: nc.server, user: nc.user, pass: nc.pass, id: e.id, regel }),
      });
      if (!r.ok) throw new Error("Status " + r.status);
    } catch (err) {
      showToast("Angelegt, aber nicht abgehakt: " + (err.message || err), "error");
    }
  };

  // Eine fehlende Buchung anlegen und abhaken; `a` = { art, konto, label, lieferantId, neuerName } (Bogen oder Empfehlung).
  const buchungAnlegen = async (e, a, still = false) => {
    const { art } = a;
    const anlage = a;
    let gelernterLieferant = 0;
    {
      if (art === "rechnung" || art === "bestellung") {
        const socid = await lieferantSicherstellen(api, anlage.lieferantId, anlage.neuerName);
        if (!socid) throw new Error("Lieferant fehlt");
        gelernterLieferant = socid;
        const kontoAusgewaehlt = (konten || []).find((k) => String(k.id) === String(kontoId));
        const kontoName = kontoAusgewaehlt?.label || kontoAusgewaehlt?.ref || "";
        const zeitpunkt = Math.floor(new Date(e.datum + "T12:00:00").getTime() / 1000);
        let bestellungId = 0;
        if (art === "bestellung") {
          bestellungId = await bestellungNachtraeglich(api, bankBestellung(e, { socid, kategorie: anlage.kategorie, kontoName, text: anlage.text }));
        }
        await submitSupplierInvoice(api, {
          ...(bestellungId ? { linked_objects: { order_supplier: bestellungId } } : {}),
          socid,
          ref_supplier: `BANK-${e.datum}-${e.id.slice(0, 6)}`,
          date: zeitpunkt,
          date_lim_reglement: zeitpunkt,
          note_private: `${bankEntwurfMarke(e.id)} Bezahlt am ${e.datum} vom Bankkonto „${kontoName}“ (Kontoauszug ${e.auszug}). Beleg fehlt – erst anhängen, dann validieren.`,
          lines: [{ desc: (String(anlage.text || "").trim() || e.text).slice(0, 250), qty: 1, subprice: Math.abs(e.betrag), tva_tx: 0, remise_percent: 0 }],
        });
        if (!still) showToast(bestellungId ? "Bestellung + Rechnungs-Entwurf angelegt – Beleg fehlt noch" : "Entwurf angelegt – Beleg fehlt noch (Geschäft → Lieferantenrechnungen)");
      } else if (art === "sonstige") {
        await api.bankBewegung({ konto: Number(kontoId), datum: e.datum, betrag: e.betrag, label: anlage.label, buchungskonto: anlage.konto, zahlart: "VIR" });
        if (!still) showToast(`Angelegt: ${anlage.label}`);
      }
      // „Schon gebucht“ (Fund des Bots) ist keine Regel: sonst würde die nächste echte Zahlung dieses Gegenübers ignoriert.
      await erledigtMelden(e, art === "ignorieren" && e.zuordnung?.id ? null : { schluessel: bankRegelSchluessel(e), art, konto: anlage.konto, lieferantId: gelernterLieferant || anlage.lieferantId, label: anlage.label });
    }
  };

  const anlageAusfuehren = async () => {
    if (!anlage) return;
    const { e, art } = anlage;
    const vorschlag = bankVorschlag(e, regelStore?.regeln, offeneRechnungen);
    setBusy(true);
    try {
      if (art === "zahlung") {
        const treffer = vorschlag.rechnungen.find((r) => String(r.id) === String(anlage.rechnungId));
        if (!treffer) throw new Error("Rechnung nicht gefunden");
        setZahlungFuer({ inv: treffer.inv, art: treffer.art, e });
        setAnlage(null);
        setBusy(false);
        return;
      }
      await buchungAnlegen(e, anlage);
      setAnlage(null);
      setNeuLaden((n) => n + 1);
    } catch (err) {
      showToast(doliError(err) || err.message || "Fehlgeschlagen", "error");
    } finally {
      setBusy(false);
    }
  };

  const zuordnenAusfuehren = async (z) => {
    setBusy(true);
    try {
      await api.bankZuordnen(wahl.id, wahl.art, z.id);
      showToast(`Zahlung ${wahl.ref} hängt jetzt an der Bankzeile`);
      setWahl(null);
      setBogen(null);
      setNeuLaden((n) => n + 1);
    } catch (e) {
      showToast(doliError(e) || "Fehlgeschlagen", "error");
    } finally {
      setBusy(false);
    }
  };

  const abgleichAusfuehren = async (z) => {
    const neu = !bankAbgeglichen(z);
    setBusy(true);
    try {
      await api.bankAbgleich(z.id, neu, auszug.trim());
      showToast(neu ? `Als abgeglichen markiert (Auszug ${auszug.trim()})` : "Abgleich zurückgenommen");
      setBogen(null);
      setNeuLaden((n) => n + 1);
    } catch (e) {
      showToast(doliError(e) || "Fehlgeschlagen", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="main">
      <div className="page-header">
        <div className="back-btn" onClick={onBack}><Icon name="back" size={20} /></div>
        <h2>Bank</h2>
      </div>
      {ncHasAccess(nc) ? (
        <label className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12, opacity: ladeHoch ? 0.6 : 1 }}>
          <Icon name="upload" size={15} /> {ladeHoch ? "Lade hoch…" : "Kontoauszug (PDF) hochladen"}
          <input type="file" accept="application/pdf" style={{ display: "none" }} disabled={ladeHoch}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) hochladen(f); }} />
        </label>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 12 }}>Kontoauszüge hochladen: erst unter Einstellungen → Nextcloud anmelden.</div>
      )}
      <div className="status-filter-menu">
        <label>Konto</label>
        <select value={kontoId || ""} onChange={(e) => setKontoId(e.target.value)}>
          {(konten || []).map((k) => <option key={k.id} value={String(k.id)}>{k.label || k.ref}</option>)}
        </select>
      </div>
      <StatusFilter options={BANK_FILTER} value={filter} onChange={setFilter} />
      {zumAbhaken.length > 0 && !wahl && (
        <button type="button" className="btn btn-primary" style={{ width: "100%", marginBottom: 12 }} disabled={busy} onClick={sammelAbhaken}>
          {busy ? "Hake ab…" : `${zumAbhaken.length} Zeilen stimmen mit dem Kontoauszug überein – alle abhaken`}
        </button>
      )}
      {darfSchreiben && !wahl && roh && offenStore && !bankHatAuszug(offenStore, kontoId) && roh.some((z) => !bankAbgeglichen(z)) && (
        <button type="button" className="btn btn-secondary" style={{ width: "100%", marginBottom: 12 }} disabled={busy}
          onClick={() => { setAuszug(bankAuszugVorschlag(konto, todayISO())); setOhneBis(todayISO()); }}>
          Konto ohne Kontoauszug – offene Zeilen bis Datum abhaken
        </button>
      )}
      {darfSchreiben && fehlend.length > 0 && (
        <>
          <div className="section-label">Im Auszug, fehlt in Dolibarr ({fehlend.length})</div>
          {zumAnlegen.length > 0 && !wahl && (
            <button type="button" className="btn btn-primary" style={{ width: "100%", marginBottom: 12 }} disabled={busy} onClick={sammelAnlegen}>
              {busy ? "Lege an…" : `${zumAnlegen.length} sichere Empfehlungen übernehmen (anlegen + abhaken)`}
            </button>
          )}
          {fehlend.map((e) => {
            const vorschlag = bankVorschlag(e, regelStore?.regeln, offeneRechnungen);
            return (
              <div key={e.id} className="list-item" style={{ cursor: "pointer" }}
                onClick={() => setAnlage({ e, art: vorschlag.art, konto: vorschlag.konto, lieferantId: vorschlag.lieferantId || bankLieferantFinden(e.name, lieferanten)?.id || "", neuerName: "", label: vorschlag.label, rechnungId: vorschlag.rechnungen[0]?.id || "" })}>
                <div className="list-avatar" style={{ background: "var(--k-ocker-bg)", color: "var(--k-ocker)" }}><Icon name="plus" size={19} /></div>
                <div className="list-info">
                  <div className="name">{e.name || String(e.text || "").slice(0, 40)}</div>
                  <div className="sub">{e.datum.split("-").reverse().join(".")} · {BANK_ARTEN.find((a) => a.key === vorschlag.art)?.label}{vorschlag.quelle === "gelernt" ? " · gelernt" : ""}{e.unsicher ? " · bitte prüfen" : ""}</div>
                  {bankZuordnungText(e) && <div className="sub" style={{ whiteSpace: "normal", color: "var(--accent)" }}>{bankZuordnungText(e).text}</div>}
                </div>
                <div className="list-amount">{fmtMoney(e.betrag)}</div>
              </div>
            );
          })}
        </>
      )}
      {darfSchreiben && ohneZeile.length > 0 && (
        <>
          <div className="section-label">Zahlungen ohne Bankzeile ({ohneZeile.length})</div>
          {ohneZeile.map((p) => (
            <div key={`${p.art}-${p.id}`} className="list-item" style={{ cursor: "pointer",
              ...(wahl?.id === p.id && wahl?.art === p.art ? { borderColor: "var(--accent)" } : {}) }}
              onClick={() => setWahl(wahl?.id === p.id && wahl?.art === p.art ? null : p)}>
              <div className="list-avatar" style={{ background: "var(--k-moos-bg)", color: "var(--k-moos)" }}><Icon name="invoice" size={19} /></div>
              <div className="list-info">
                <div className="name">{p.ref} · {p.partner}</div>
                <div className="sub">{fmtDate(p.datum)} · {p.rechnungen}</div>
              </div>
              <div className="list-amount">{fmtMoney(bankErwarteterBetrag(p))}</div>
            </div>
          ))}
          {wahl && <div style={{ fontSize: 12, color: "var(--text2)", margin: "4px 0 12px" }}>Passende Bankzeile antippen (gleicher Betrag). Nichts dabei? Anderes Konto wählen.</div>}
        </>
      )}
      {fehler ? <div className="empty-state"><p>{fehler}</p></div>
        : (konten === null || roh === null) ? <div className="loading"><div className="spinner" /> Lade...</div>
        : zeilen.length === 0 ? <div className="empty-state"><Icon name="transfer" size={48} /><p>{wahl ? "Keine Bankzeile mit diesem Betrag auf diesem Konto" : "Keine Bankzeilen"}</p></div>
        : zeilen.map((z) => (
          <div key={z.id} className="list-item" ref={String(z.id) === String(zeileId) ? markiertRef : null}
            style={{ cursor: darfSchreiben ? "pointer" : "default", ...(String(z.id) === String(zeileId) ? { borderColor: "var(--accent)" } : {}) }}
            onClick={() => { if (!darfSchreiben) return; if (wahl) setBogen({ art: "zuordnen", zeile: z }); else { setAuszug(z.num_releve || bankEmpfehlung(z, offenStore).auszug || ""); setBogen({ art: "abgleich", zeile: z }); } }}>
            <div className="list-avatar" style={{ background: "var(--k-schiefer-bg)", color: "var(--k-schiefer)" }}><Icon name="transfer" size={19} /></div>
            <div className="list-info">
              <div className="name">{bankText(z.label)}</div>
              <div className="sub">{fmtDate(z.dateo)}{z.num_releve ? ` · Auszug ${z.num_releve}` : ""}{bankNeu(z, neuAb) ? " · neu" : ""}</div>
              {bankEmpfehlung(z, offenStore).text && <div className="sub" style={{ whiteSpace: "normal", color: "var(--accent)" }}>{bankEmpfehlung(z, offenStore).text}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="list-amount">{fmtMoney(z.amount)}</div>
              {(() => { const st = bankEmpfehlung(z, offenStore).status; const [kl, txt] = { abgeglichen: ["badge-paid", "abgeglichen"], gefunden: ["badge-draft", "im Auszug"], pruefen: ["badge-cancelled", "prüfen"], ohne: ["badge-open", "offen"] }[st]; return <span className={`badge ${kl}`}>{txt}</span>; })()}
            </div>
          </div>
        ))}
      {bogen && (
        <div className="modal-overlay" onClick={() => !busy && setBogen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title">{bogen.art === "zuordnen" ? "Zahlung zuordnen" : "Abgleich"}</div>
            <div className="detail-hero" style={{ marginBottom: 12 }}>
              <div className="detail-row"><span className="lbl">Bankzeile</span><span className="val">{bankText(bogen.zeile.label)}</span></div>
              <div className="detail-row"><span className="lbl">Datum</span><span className="val">{fmtDate(bogen.zeile.dateo)}</span></div>
              <div className="detail-row"><span className="lbl">Betrag</span><span className="val">{fmtMoney(bogen.zeile.amount)}</span></div>
              {bogen.art === "zuordnen" && (<>
                <div className="detail-row"><span className="lbl">Zahlung</span><span className="val">{wahl.ref}</span></div>
                <div className="detail-row"><span className="lbl">Partner</span><span className="val">{wahl.partner}</span></div>
                <div className="detail-row"><span className="lbl">Rechnungen</span><span className="val">{wahl.rechnungen}</span></div>
              </>)}
            </div>
            {bogen.art === "abgleich" && !bankAbgeglichen(bogen.zeile) && (
              <div className="field-group mb12"><label>Auszugsnummer</label>
                <input value={auszug} onChange={(e) => setAuszug(e.target.value)} placeholder="z. B. 2026/09" />
              </div>
            )}
            <div className="action-row action-row-2">
              <button type="button" className="btn btn-secondary" onClick={() => setBogen(null)} disabled={busy}>Abbrechen</button>
              <button type="button" className="btn btn-primary"
                onClick={() => bogen.art === "zuordnen" ? zuordnenAusfuehren(bogen.zeile) : abgleichAusfuehren(bogen.zeile)}
                disabled={busy || (bogen.art === "abgleich" && !bankAbgeglichen(bogen.zeile) && !bankAuszugGueltig(auszug))}>
                {bogen.art === "zuordnen" ? "Zuordnen" : bankAbgeglichen(bogen.zeile) ? "Abgleich zurücknehmen" : "Als abgeglichen markieren"}
              </button>
            </div>
          </div>
        </div>
      )}
      {ohne && (
        <div className="modal-overlay" onClick={() => !busy && setOhneBis(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title">Abhaken ohne Kontoauszug</div>
            <div className="field-group mb12"><label>Alle offenen Zeilen bis einschließlich</label>
              <input type="date" value={ohneBis} max={todayISO()} onChange={(e) => { if (!e.target.value) return; if (auszug === bankAuszugVorschlag(konto, ohneBis)) setAuszug(bankAuszugVorschlag(konto, e.target.value)); setOhneBis(e.target.value); }} />
            </div>
            <div className="detail-hero" style={{ marginBottom: 12 }}>
              <div className="detail-row"><span className="lbl">Konto</span><span className="val">{konto?.label || konto?.ref}</span></div>
              <div className="detail-row"><span className="lbl">Offene Zeilen</span><span className="val">{ohne.zeilen.length} · {fmtMoney(ohne.summe)}</span></div>
              <div className="detail-row"><span className="lbl">Soll-Bestand am Stichtag</span><span className="val">{fmtMoney(ohne.bestand)}</span></div>
            </div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 12 }}>Stimmt der Soll-Bestand mit dem echten Stand (Kasse zählen) überein? Dann abhaken. Zurücknehmen geht je Zeile.</div>
            <div className="field-group mb12"><label>Auszugsnummer</label>
              <input value={auszug} onChange={(e) => setAuszug(e.target.value)} />
            </div>
            <div className="action-row action-row-2">
              <button type="button" className="btn btn-secondary" onClick={() => setOhneBis(null)} disabled={busy}>Abbrechen</button>
              <button type="button" className="btn btn-primary" onClick={ohneAuszugAbhaken} disabled={busy || ohne.zeilen.length === 0 || !bankAuszugGueltig(auszug)}>
                {busy ? "Hake ab…" : `${ohne.zeilen.length} Zeilen abhaken`}
              </button>
            </div>
          </div>
        </div>
      )}
      {anlage && (() => {
        const vorschlag = bankVorschlag(anlage.e, regelStore?.regeln, offeneRechnungen);
        const gesperrt = busy || (
          anlage.art === "zahlung" ? !anlage.rechnungId :
          anlage.art === "rechnung" || anlage.art === "bestellung" ? (!anlage.lieferantId && !String(anlage.neuerName || "").trim()) :
          anlage.art === "sonstige" ? (!anlage.konto || !anlage.label) : false
        );
        return (
          <div className="modal-overlay" onClick={() => !busy && setAnlage(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-handle" />
              <div className="modal-title">Buchung anlegen</div>
              <div className="detail-hero" style={{ marginBottom: 12 }}>
                <div className="detail-row"><span className="lbl">Datum</span><span className="val">{anlage.e.datum.split("-").reverse().join(".")}</span></div>
                <div className="detail-row"><span className="lbl">Betrag</span><span className="val">{fmtMoney(anlage.e.betrag)}</span></div>
                <div className="detail-row"><span className="lbl">Text</span><span className="val" style={{ whiteSpace: "normal" }}>{anlage.e.text}</span></div>
                <div className="detail-row"><span className="lbl">Auszug</span><span className="val">{anlage.e.auszug}</span></div>
              </div>
              {anlage.e.unsicher && <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 12 }}>Parser und Qwen haben diese Zeile unterschiedlich gelesen – Datum und Betrag bitte mit dem Auszug vergleichen.</div>}
              {bankZuordnungText(anlage.e) && (
                <div style={{ fontSize: 13, marginBottom: 12 }}>
                  {bankZuordnungText(anlage.e).text}{" "}
                  <a href={bankZuordnungText(anlage.e).sprung} onClick={() => setAnlage(null)} style={{ color: "var(--accent)" }}>Öffnen</a>
                </div>
              )}
              <div className="field-group mb12">
                <label>Was ist das?</label>
                <select value={anlage.art} onChange={(e) => setAnlage((a) => ({ ...a, art: e.target.value }))}>
                  {BANK_ARTEN.filter((b) => !["rechnung", "bestellung"].includes(b.key) || anlage.e.betrag < 0).map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                </select>
              </div>
              {anlage.art === "zahlung" && (
                <div className="field-group mb12">
                  <label>Rechnung</label>
                  <select value={anlage.rechnungId} onChange={(e) => setAnlage((a) => ({ ...a, rechnungId: e.target.value }))}>
                    <option value="">– wählen –</option>
                    {vorschlag.rechnungen.map((r) => <option key={`${r.art}-${r.id}`} value={r.id}>{r.ref} · {fmtMoney(r.rest)}</option>)}
                  </select>
                  {vorschlag.rechnungen.length === 0 && <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>Keine offene Rechnung mit diesem Betrag.</div>}
                </div>
              )}
              {(anlage.art === "rechnung" || anlage.art === "bestellung") && (
                <LieferantWahl value={anlage.lieferantId} neuerName={anlage.neuerName} options={lieferanten} vorschlagName={anlage.e.name}
                  onChange={(id, name) => setAnlage((a) => ({ ...a, lieferantId: id, neuerName: name }))} />
              )}
              {anlage.art === "bestellung" && (
                <>
                  <div className="field-group mb12"><label>Was wurde gekauft?</label>
                    <input value={anlage.text ?? anlage.e.text ?? ""} onChange={(ev) => setAnlage((a) => ({ ...a, text: ev.target.value }))} />
                  </div>
                  <div className="field-group mb12"><label>Kategorie</label>
                    <select value={anlage.kategorie || ""} onChange={(ev) => setAnlage((a) => ({ ...a, kategorie: ev.target.value }))}>
                      <option value="">– keine –</option>
                      {FOERDER_KATEGORIEN.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                    </select>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text2)", margin: "-4px 0 12px" }}>Legt die Bestellung (bestätigt) und einen damit verknüpften Rechnungs-Entwurf an. Beleg danach anhängen.</div>
                </>
              )}
              {anlage.art === "sonstige" && (
                <>
                  <div className="field-group mb12">
                    <label>Buchungskonto</label>
                    <select value={anlage.konto} onChange={(e) => setAnlage((a) => ({ ...a, konto: e.target.value }))}>
                      <option value="">– wählen –</option>
                      {BANK_SONSTIGE_KONTEN.map((k) => <option key={k.number} value={k.number}>{k.number} · {k.label}</option>)}
                    </select>
                  </div>
                  <div className="field-group mb12">
                    <label>Bezeichnung</label>
                    <input value={anlage.label} onChange={(e) => setAnlage((a) => ({ ...a, label: e.target.value }))} />
                  </div>
                </>
              )}
              <div className="action-row action-row-2">
                <button type="button" className="btn btn-secondary" onClick={() => setAnlage(null)} disabled={busy}>Abbrechen</button>
                <button type="button" className="btn btn-primary" onClick={anlageAusfuehren} disabled={gesperrt}>
                  {anlage.art === "zahlung" ? "Zahlung erfassen…" : anlage.art === "rechnung" ? "Entwurf anlegen" : anlage.art === "bestellung" ? "Bestellung anlegen" : anlage.art === "sonstige" ? "Anlegen" : "Abhaken"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {zahlungFuer && (
        <ZahlungDialog api={api} inv={zahlungFuer.inv} art={zahlungFuer.art} showToast={showToast}
          vorgabe={{ datum: zahlungFuer.e.datum, kontoId, betrag: Math.abs(zahlungFuer.e.betrag) }}
          onClose={async (ok) => {
            if (ok) {
              await erledigtMelden(zahlungFuer.e, null);
              setNeuLaden((n) => n + 1);
            }
            setZahlungFuer(null);
          }} />
      )}
    </div>
  );
}

// Sammelseite „Verwaltung" in der Fußleiste: die Unterlagen des Betriebs.
// Die Dokument-Kacheln stehen allen offen — eine Gefährdungsbeurteilung oder
// eine Police, die nur die Geschäftsführung sehen darf, verfehlt ihren Zweck.
// Einzige Ausnahme: die Kontostände (nur Geschäftsführer, Inhaber 20.08.2026).
function VerwaltungPage({ api, me, onNavigate, showToast, bankZeile = null }) {
  const block = useBlock();
  // Zugänge stehen seit 20.09.2026 hier statt auf der Startseite (Wunsch Inhaber).
  const zugaenge = useMandant()?.zugaenge || [];
  const funktion = useFunktion();
  const [subview, setSubview] = useState(null);
  // Sprunglink #bank-<id> (App setzt bankZeile): direkt in die Bank-Ansicht.
  useEffect(() => { if (bankZeile) setSubview("bank"); }, [bankZeile]);

  if (subview === "finanzen") return (
    <FinanzenPage api={api} onBack={() => setSubview(null)} showToast={showToast} />
  );
  if (subview === "bank") return (
    <BankPage api={api} me={me} onBack={() => setSubview(null)} showToast={showToast} zeileId={bankZeile?.id || null} />
  );
  if (subview === "pruefprotokolle") return (
    <PaperlessDocs thema={PL_THEMA.pruefprotokoll} titel="Prüfprotokolle Kletterzeug"
      hinweis="Prüfungen der PSA gegen Absturz nach DGUV Regel 112-198."
      onBack={() => setSubview(null)} showToast={showToast} />
  );
  if (subview === "betrieb") return (
    <BetriebsDokumente me={me} onBack={() => setSubview(null)} showToast={showToast} />
  );
  if (subview === "alle") return (
    <PaperlessDocs thema={PL_ALLE} titel="Alle Dokumente"
      hinweis="Alles aus der Blattwerk-Ablage in Paperless, die neuesten 100."
      onBack={() => setSubview(null)} showToast={showToast} />
  );
  if (subview === "hochladen") return (
    <DokumentHochladen onBack={() => setSubview(null)} showToast={showToast} />
  );

  // Gefährdungsbeurteilungen und Betriebsmittel fuehren in Tabs, die am
  // Arbeitsschutz-Block haengen (siehe erlaubterTab) — ohne diesen Block
  // waere die Kachel ein toter Knopf, deshalb hier per bedingtem Spread
  // ausgeblendet statt nur den setTab-Aufruf zu bewachen (eine Kachel, die
  // sichtbar nichts tut, ist schlechter als keine Kachel).
  // kachelnFiltern: Sichtbarkeit je Gruppe aus dem Adminbereich (src/kacheln.js).
  const tiles = kachelnFiltern(me, [
    ...(block("arbeitsschutz") && funktion("gbu") ? [{ label: "Gefährdungsbeurteilungen", nav: "gbu",              color: "var(--k-ocker-bg)", accent: "var(--k-ocker)", icon: "shield"  }] : []),
    // „Wichtige Dokumente" und „Kontostaende" haengen seit 18.09.2026 sichtbar
    // an denselben Bloecken wie ihre Endpunkte (Befund I5) — sonst zeigt die
    // Kachel auf eine Route, die mit 404 antwortet.
    ...(block("belege") ? [{ label: "Wichtige Dokumente", key: "betrieb", color: "var(--k-moos-bg)", accent: "var(--k-moos)", icon: "archive" }] : []),
    { label: "Kletterzeug-Prüfprotokolle", key: "pruefprotokolle", color: "var(--k-rost-bg)", accent: "var(--k-rost)", icon: "validate" },
    // Spec 2026-09-23: Hochladen standardmaessig fuer alle, „Alle Dokumente" nur fuer Admins (Server prueft mit).
    ...(block("belege") ? [{ label: "Dokument hochladen", key: "hochladen", color: "var(--k-ocker-bg)", accent: "var(--k-ocker)", icon: "upload" }] : []),
    ...(block("belege") ? [{ label: "Alle Dokumente", key: "alle", color: "var(--k-schiefer-bg)", accent: "var(--k-schiefer)", icon: "folder" }] : []),
    // Abzeichen = Stücke, deren Frist läuft oder abgelaufen ist. Es steht auch
    // hier, nicht nur auf der Startseite: wer über die Verwaltung geht, soll
    // nicht erst hineintippen müssen, um zu sehen, dass etwas offen ist.
    ...(block("arbeitsschutz") && funktion("betriebsmittel") ? [{ label: "Betriebsmittel", nav: "betriebsmittel", color: "var(--k-pflaume-bg)", accent: "var(--k-pflaume)", icon: "werkzeug", badge: bmOffenCount() }] : []),
    ...(block("erp") && funktion("baumkataster") ? [{ label: "Baumkataster", nav: "baumkataster", color: "var(--k-moos-bg)", accent: "var(--k-moos)", icon: "eye" }] : []),
    ...(me?.canViewFinanzen && block("erp") ? [
      { label: "Kontostände", key: "finanzen", color: "var(--k-schiefer-bg)", accent: "var(--k-schiefer)", icon: "invoice" },
    ] : []),
    // Modul „Bank": eigene Funktion (src/funktionen.js), einzeln einschaltbar, nur Finanzen/Buchhaltung.
    ...(me?.canViewBank && block("erp") && funktion("bank") ? [
      { label: "Bank", key: "bank", color: "var(--k-schiefer-bg)", accent: "var(--k-schiefer)", icon: "transfer" },
    ] : []),
  ]);

  return (
    <div className="main">
      <div className="page-header"><h2>Verwaltung</h2></div>
      <div className="quick-actions">
        {tiles.map(t => (
          <div key={t.key || t.nav} className="quick-btn"
            onClick={() => (t.nav ? onNavigate(t.nav) : setSubview(t.key))}>
            <div className="quick-btn-icon" style={{ background: t.color, color: t.accent }}><Icon name={t.icon} size={19} /></div>
            <span>{t.label}</span>
          </div>
        ))}
      </div>
      {/* Startseite der Firma (Task 11, Ansage Inhaber 18.09.2026): Kacheln
          fuer die hinterlegten Dienste. Ein Dienst ohne Adresse taucht hier
          gar nicht erst auf (dienstLinks() in src/mandant.js filtert das
          bereits serverseitig) — kein toter Link. */}
      {zugaenge.length > 0 && (
        <>
          <div className="section-label">Zugänge</div>
          <div className="quick-actions">
            {zugaenge.map((z) => (
              <div
                key={z.schluessel} className="quick-btn"
                title={z.hinweis || undefined}
                onClick={() => window.open(z.url, "_blank", "noopener,noreferrer")}
              >
                <div className="quick-btn-icon" style={{ background: "var(--k-moos-bg)", color: "var(--k-moos)" }}>
                  <Icon name={DIENST_ICON[z.schluessel] || "folder"} size={19} />
                </div>
                <span>{z.label}</span>
                {/* z. B. Paperless: nackte LAN-Adresse statt Domainname — die
                    Kachel bleibt, aber wer von unterwegs draufklickt, soll
                    vorher wissen, dass sie nur im Firmennetz/VPN antwortet. */}
                {z.hinweis && <span style={{ fontSize: 10, fontWeight: 400, color: "var(--text3)" }}>{z.hinweis}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Kalender (Prinzip wie SPD Maps: Monat/Woche/Tag + Nextcloud) ────────────
const CAL_WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const CAL_MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const calFmtTime = (date, allDay) => allDay ? "Ganztägig" : date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr";
const calFmtDay = (date) => date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
const calFmtShortDay = (date) => date.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
const calStartOfWeek = (d) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
// Woher stammt ein Termin? (App-verwaltete UIDs aus Projekt-/Aufgabenanlage)
const calEventKind = (uid) => {
  const u = String(uid || "");
  if (u.startsWith("blattwerk-project-")) return "Projekt";
  if (u.startsWith("blattwerk-task-")) return "Aufgabe";
  return null;
};

function KalenderPage({ me, showToast }) {
  const [nc] = useState(loadNcConfig);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("month"); // 'month' | 'week' | 'day'
  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [selected, setSelected] = useState(() => new Date());
  const [detail, setDetail] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  // Bestehender Termin, der gerade bearbeitet wird (null = keiner).
  const [editEvent, setEditEvent] = useState(null);
  const [subOpen, setSubOpen] = useState(false);
  const today = new Date();

  const refresh = useCallback(() => {
    if (!ncReady(nc)) return;
    setLoading(true); setError("");
    const now = new Date();
    ncFetchEvents(nc, new Date(now.getFullYear(), now.getMonth() - 6, 1), new Date(now.getFullYear(), now.getMonth() + 18, 1))
      .then(setEvents)
      .catch((e) => setError("Kalender konnte nicht geladen werden: " + (e.message || e)))
      .finally(() => setLoading(false));
  }, [nc]);

  useEffect(() => { refresh(); }, [refresh]);

  const eventsOn = (day) => events.filter((e) => calSameDay(e.start, day));
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const upcoming = events.filter((e) => e.start >= startToday).slice(0, 12);

  if (!ncReady(nc)) {
    return (
      <div className="main">
        <div className="page-header"><h2>Kalender</h2></div>
        <div className="empty-state">
          <Icon name="calendar" size={44} />
          <p>Kein Nextcloud-Kalender verbunden.<br />
            In <b>Einstellungen → Nextcloud-Kalender</b> mit deinem eigenen Nextcloud-Konto anmelden —
            der gemeinsame Blattwerk-Kalender wird dann automatisch gewählt und
            alle Termine samt Zu-/Absagen erscheinen hier.</p>
        </div>
      </div>
    );
  }

  function EventList({ list }) {
    if (list.length === 0) return <p className="cal-status">Keine Termine.</p>;
    return (
      <ul className="cal-events">
        {list.map((e, i) => {
          const kind = calEventKind(e.uid);
          return (
            <li key={(e.uid || "") + i} className={"cal-event" + (kind ? " cal-event-blattwerk" : "")} onClick={() => setDetail(e)}>
              <div className="cal-event-time">
                {e.start.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                {" · "}{calFmtTime(e.start, e.allDay)}
              </div>
              <div className="cal-event-title">{e.title || "(ohne Titel)"}{kind && <span className="chip" style={{ marginLeft: 8 }}>{kind}</span>}</div>
              {e.location && <div className="cal-event-meta">📍 {e.location}</div>}
            </li>
          );
        })}
      </ul>
    );
  }

  function MonthView() {
    const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const offset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return (
      <>
        <div className="cal-header">
          <button className="cal-nav" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>‹</button>
          <span className="cal-month-label">{CAL_MONTHS[month.getMonth()]} {month.getFullYear()}</span>
          <button className="cal-nav" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>›</button>
        </div>
        <div className="cal-grid">
          {CAL_WEEKDAYS.map((d) => <div key={d} className="cal-wd">{d}</div>)}
          {cells.map((day, i) => {
            if (!day) return <div key={"e" + i} />;
            const has = events.some((e) => calSameDay(e.start, day));
            const isSel = calSameDay(day, selected);
            const isToday = calSameDay(day, today);
            return (
              <button key={day.toISOString()} className={"cal-day" + (isSel ? " cal-day-sel" : "") + (isToday && !isSel ? " cal-day-today" : "")} onClick={() => setSelected(day)}>
                {day.getDate()}
                {has && <span className="cal-dot" />}
              </button>
            );
          })}
        </div>
        <div className="cal-day-header">{calFmtDay(selected)}</div>
        <EventList list={eventsOn(selected)} />
      </>
    );
  }

  function WeekView() {
    const ws = calStartOfWeek(selected);
    const days = Array.from({ length: 7 }, (_, i) => new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i));
    return (
      <>
        <div className="cal-header">
          <button className="cal-nav" onClick={() => setSelected((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7))}>‹</button>
          <span className="cal-month-label">Woche ab {ws.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</span>
          <button className="cal-nav" onClick={() => setSelected((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7))}>›</button>
        </div>
        {days.map((day) => {
          const evs = eventsOn(day);
          return (
            <div key={day.toISOString()} className={"week-day" + (calSameDay(day, today) ? " week-day-today" : "")}>
              <div className="week-day-head" onClick={() => { setSelected(day); setView("day"); }}>{calFmtShortDay(day)}</div>
              {evs.length === 0 ? <p className="cal-status week-empty">—</p> : <EventList list={evs} />}
            </div>
          );
        })}
      </>
    );
  }

  function DayView() {
    return (
      <>
        <div className="cal-header">
          <button className="cal-nav" onClick={() => setSelected((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1))}>‹</button>
          <span className="cal-month-label">{calFmtDay(selected)}</span>
          <button className="cal-nav" onClick={() => setSelected((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1))}>›</button>
        </div>
        <EventList list={eventsOn(selected)} />
      </>
    );
  }

  function DetailModal() {
    const e = detail;
    const kind = calEventKind(e.uid);
    // Zu-/Absagen (wie SPD Maps): eigener Status aus den ATTENDEE-Zeilen
    const [rsvpBusy, setRsvpBusy] = useState(false);
    const atts = e.attendees || [];
    const myMail = rsvpEmail(me);
    const myName = rsvpName(me);
    const mine = atts.find(a => (a.mail || "").toLowerCase() === myMail || (myName && a.name === myName));
    const myAnswer = mine ? (mine.partstat === "ACCEPTED" ? "yes" : mine.partstat === "TENTATIVE" ? "maybe" : mine.partstat === "DECLINED" ? "no" : null) : null;
    const yesList = atts.filter(a => a.partstat === "ACCEPTED").map(a => a.name);
    const maybeList = atts.filter(a => a.partstat === "TENTATIVE").map(a => a.name);
    const noList = atts.filter(a => a.partstat === "DECLINED").map(a => a.name);
    const doRsvp = async (answer) => {
      setRsvpBusy(true);
      try {
        const newIcs = await ncRsvpEvent(nc, e, { name: myName, email: myMail, answer });
        const parsed = parseIcalEvents(newIcs).find(x => x.uid === e.uid);
        const updated = { ...e, attendees: parsed?.attendees || [], ics: newIcs };
        setEvents(prev => prev.map(x => (x === e ? updated : x)));
        setDetail(updated);
        showToast(answer === "yes" ? "Zugesagt ✓" : answer === "maybe" ? "Als Vielleicht vermerkt" : answer === "no" ? "Abgesagt" : "Antwort entfernt");
      } catch (err) {
        showToast("Speichern fehlgeschlagen: " + (err.message || err), "error");
      } finally { setRsvpBusy(false); }
    };
    const remove = async () => {
      if (!window.confirm(kind
        ? `Dieser Termin gehört zu einem ${kind === "Projekt" ? "Projekt" : "einer Aufgabe"} der App. Nur aus dem Nextcloud-Kalender löschen?`
        : "Diesen Termin wirklich löschen?")) return;
      // Optimistisch aus der Ansicht nehmen, Löschen läuft im Hintergrund.
      setEvents((prev) => prev.filter((x) => x !== e));
      setDetail(null);
      try {
        const res = await apiFetch("/api/nc/event/delete", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user: nc.user, pass: nc.pass, calendarUrl: nc.calendarUrl, uid: e.uid, href: e.href }),
        });
        if (!res.ok) throw new Error("Status " + res.status);
        showToast("Termin gelöscht");
      } catch (err) {
        showToast("Löschen fehlgeschlagen: " + (err.message || err), "error");
        refresh();
      }
    };
    return (
      <div className="modal-overlay" onClick={() => setDetail(null)}>
        <div className="modal" onClick={(ev) => ev.stopPropagation()}>
          <div className="modal-handle" />
          <div className="modal-title">{e.title || "(ohne Titel)"}</div>
          <p className="cal-event-meta">
            {calFmtDay(e.start)} · {calFmtTime(e.start, e.allDay)}
            {e.end && !e.allDay ? "–" + calFmtTime(e.end, false) : ""}
          </p>
          {e.location && <p className="cal-event-meta">📍 {e.location}</p>}
          {e.note && <p className="cal-event-meta">{e.note}</p>}
          {kind && <p className="cal-event-meta">Automatisch angelegt aus: {kind} (Blattwerk-App)</p>}
          {e.ics && (
            <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className={"btn btn-sm " + (myAnswer === "yes" ? "btn-success" : "btn-secondary")} disabled={rsvpBusy}
                  onClick={() => doRsvp(myAnswer === "yes" ? null : "yes")}>✓ Zusagen</button>
                <button className={"btn btn-sm " + (myAnswer === "maybe" ? "btn-warn" : "btn-secondary")} disabled={rsvpBusy}
                  onClick={() => doRsvp(myAnswer === "maybe" ? null : "maybe")}>? Vielleicht</button>
                <button className={"btn btn-sm " + (myAnswer === "no" ? "btn-danger" : "btn-secondary")} disabled={rsvpBusy}
                  onClick={() => doRsvp(myAnswer === "no" ? null : "no")}>✕ Absagen</button>
                {rsvpBusy && <div className="spinner" style={{ width: 15, height: 15, alignSelf: "center" }} />}
              </div>
              <p className="cal-event-meta" style={{ marginTop: 8 }}>
                <b>Zusagen ({yesList.length}):</b> {yesList.join(", ") || "—"}<br />
                <b>Vielleicht ({maybeList.length}):</b> {maybeList.join(", ") || "—"}<br />
                <b>Absagen ({noList.length}):</b> {noList.join(", ") || "—"}
              </p>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            {e.ics && (e.uid || e.href) && (
              <button className="btn btn-primary" onClick={() => { setDetail(null); setEditEvent(e); }}>
                <Icon name="edit" size={15} /> Bearbeiten
              </button>
            )}
            {(e.uid || e.href) && <button className="btn btn-danger" onClick={remove}><Icon name="trash" size={15} /> Löschen</button>}
            <button className="btn btn-secondary" onClick={() => setDetail(null)}>Schließen</button>
          </div>
        </div>
      </div>
    );
  }

  // Dasselbe Formular legt an und bearbeitet: `bearbeite` ist der bestehende
  // Termin (oder null). Beim Bearbeiten wird das vorhandene ICS umgeschrieben,
  // damit Zu-/Absagen und Erinnerungen erhalten bleiben.
  function CreateModal({ bearbeite }) {
    const pad2 = (n) => String(n).padStart(2, "0");
    const alsDatum = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const alsUhrzeit = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    const defDate = bearbeite ? alsDatum(bearbeite.start) : alsDatum(selected);
    // Ganztags-Termine enden in iCal am Folgetag; im Formular steht der letzte
    // Tag einschliesslich, sonst waechst der Termin bei jedem Speichern.
    const bisDatum = bearbeite?.allDay && bearbeite.end
      ? alsDatum(new Date(bearbeite.end.getTime() - 24 * 3600 * 1000))
      : defDate;
    const [title, setTitle] = useState(bearbeite?.title || "");
    const [date, setDate] = useState(defDate);
    const [allDay, setAllDay] = useState(!!bearbeite?.allDay);
    const [from, setFrom] = useState(bearbeite && !bearbeite.allDay ? alsUhrzeit(bearbeite.start) : "09:00");
    const [to, setTo] = useState(bearbeite && !bearbeite.allDay && bearbeite.end ? alsUhrzeit(bearbeite.end) : "10:00");
    const [endDate, setEndDate] = useState(bisDatum);
    const [location, setLocation] = useState(bearbeite?.location || "");
    const [note, setNote] = useState(bearbeite?.note || "");
    const [saving, setSaving] = useState(false);
    const schliessen = () => { setCreateOpen(false); setEditEvent(null); };
    const save = async () => {
      if (!title.trim()) { showToast("Bitte einen Titel eingeben", "error"); return; }
      setSaving(true);
      try {
        const startSec = allDay
          ? Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000)
          : Math.floor(new Date(`${date}T${from}:00`).getTime() / 1000);
        const endSec = allDay
          ? (endDate && endDate > date ? Math.floor((new Date(`${endDate}T00:00:00Z`).getTime() + 24 * 3600 * 1000) / 1000) : 0)
          : Math.floor(new Date(`${date}T${to}:00`).getTime() / 1000);
        const felder = {
          title: title.trim(), startSec, endSec: endSec > startSec ? endSec : 0,
          allDay, location: location.trim(), note: note.trim(),
        };
        if (bearbeite) await ncEditEvent(nc, bearbeite, felder);
        else await ncPutEvent(nc, { uid: ncManualUid(), ...felder });
        showToast(bearbeite ? "Termin geändert" : "Termin angelegt");
        schliessen();
        refresh();
      } catch (err) {
        showToast((bearbeite ? "Ändern" : "Anlegen") + " fehlgeschlagen: " + (err.message || err), "error");
      } finally { setSaving(false); }
    };
    return (
      <div className="modal-overlay" onClick={schliessen}>
        <div className="modal" onClick={(ev) => ev.stopPropagation()}>
          <div className="modal-handle" />
          <div className="modal-title">{bearbeite ? "Termin bearbeiten" : "Neuer Termin"}</div>
          {bearbeite && icsIstReihe(bearbeite.ics) && (
            <p className="cal-event-meta" style={{ color: "var(--warn)" }}>
              Das ist ein wiederkehrender Termin — die Änderung gilt für die <b>ganze Reihe</b>.
              Einzelne Termine einer Reihe ändert nur Nextcloud selbst.
            </p>
          )}
          <div className="field-group mb12">
            <label>Titel</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Heckenschnitt Familie Muster" />
          </div>
          <div className="field-group mb12">
            <label>Datum</label>
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} />
          </div>
          <div className="field-group mb12">
            <label style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none" }}>
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} style={{ width: "auto" }} /> Ganztägig
            </label>
          </div>
          {allDay ? (
            <div className="field-group mb12">
              <label>Bis (einschließlich)</label>
              <input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <div className="field-group mb12" style={{ flex: 1 }}>
                <label>Von</label>
                <TimeField value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="field-group mb12" style={{ flex: 1 }}>
                <label>Bis</label>
                <TimeField value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
          )}
          <div className="field-group mb12">
            <label>Ort</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="optional" />
          </div>
          <div className="field-group mb16">
            <label>Notiz</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? <><div className="spinner" style={{ width: 15, height: 15 }} /> Speichert…</> : "Termin anlegen"}
            </button>
            <button className="btn btn-secondary" onClick={schliessen}>Abbrechen</button>
          </div>
        </div>
      </div>
    );
  }

  // Abo-Link (wie SPD Maps): öffentlicher ICS-Export des Blattwerk-Kalenders,
  // als webcal: fürs direkte "Im eigenen Kalender abonnieren" (iPhone, Google …).
  function SubscribeModal() {
    const [state, setState] = useState({ loading: true, webcal: "", exportUrl: "", error: "" });
    const [msg, setMsg] = useState("");
    useEffect(() => {
      let alive = true;
      (async () => {
        try {
          const r = await apiFetch("/api/nc/subscribe-url", {
            method: "POST", headers: { "Content-Type": "application/json" },
            // create: der Besitzer veröffentlicht den Kalender beim ersten Öffnen
            // automatisch; bei allen anderen ignoriert Nextcloud den Versuch.
            body: JSON.stringify({ user: nc.user, pass: nc.pass, calendarUrl: nc.calendarUrl, create: true }),
          });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(data.error || ("Status " + r.status));
          if (alive) setState({ loading: false, webcal: data.webcal || "", exportUrl: data.exportUrl || "", error: "" });
        } catch (e) {
          if (alive) setState({ loading: false, webcal: "", exportUrl: "", error: String(e.message || e) });
        }
      })();
      return () => { alive = false; };
    }, []);
    const copyLink = async () => {
      try { await navigator.clipboard.writeText(state.exportUrl); setMsg("Link kopiert — im Kalender unter „Abo/Kalender hinzufügen“ einfügen."); }
      catch { setMsg("Kopieren nicht möglich. Link: " + state.exportUrl); }
    };
    return (
      <div className="modal-overlay" onClick={() => setSubOpen(false)}>
        <div className="modal" onClick={(ev) => ev.stopPropagation()}>
          <div className="modal-handle" />
          <div className="modal-title">Kalender abonnieren</div>
          <p className="cal-event-meta">
            Den Blattwerk-Kalender im eigenen Kalender (iPhone, Google, Outlook …) abonnieren —
            neue Termine erscheinen dann automatisch dort.
          </p>
          {state.loading && <div className="loading"><div className="spinner" /> Abo-Link wird geladen…</div>}
          {!state.loading && state.webcal && (
            <>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <a className="btn btn-primary" href={state.webcal} style={{ textDecoration: "none" }}>📅 Im Kalender abonnieren</a>
                <button className="btn btn-secondary" onClick={copyLink}>Link kopieren</button>
              </div>
              {msg && <p className="cal-event-meta" style={{ marginTop: 8, wordBreak: "break-all" }}>{msg}</p>}
            </>
          )}
          {!state.loading && !state.webcal && (
            <p className="cal-event-meta" style={{ color: "var(--warn)" }}>
              {state.error
                ? "Abo-Link konnte nicht geladen werden: " + state.error
                : "Noch kein Abo-Link vorhanden — der Kalender-Besitzer muss dieses Fenster einmal öffnen (dann wird der Kalender veröffentlicht) oder ihn in Nextcloud per Link teilen."}
            </p>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={() => setSubOpen(false)}>Schließen</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="main">
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2>Kalender</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setSubOpen(true)}>📅 Abonnieren</button>
          <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}><Icon name="plus" size={15} /> Termin</button>
        </div>
      </div>
      <p className="cal-status" style={{ paddingTop: 0 }}>Nextcloud: {nc.calendarName || "Kalender"}</p>

      <div className="cal-viewswitch">
        {[["month", "Monat"], ["week", "Woche"], ["day", "Tag"]].map(([v, label]) => (
          <button key={v} className={"seg" + (view === v ? " seg-active" : "")} onClick={() => setView(v)}>{label}</button>
        ))}
      </div>

      {loading && <div className="loading"><div className="spinner" /> Kalender wird geladen…</div>}
      {error && <p className="cal-status cal-error">{error}</p>}

      {view === "month" && <MonthView />}
      {view === "week" && <WeekView />}
      {view === "day" && <DayView />}

      <div className="cal-day-header" style={{ marginTop: 16 }}>Nächste Termine</div>
      <EventList list={upcoming} />

      {detail && <DetailModal />}
      {(createOpen || editEvent) && <CreateModal bearbeite={editEvent} />}
      {subOpen && <SubscribeModal />}
    </div>
  );
}

// ─── Dashboard quick timer (start screen) ────────────────────────────────────
function DashboardTimer({ api, tasks, me, showToast, setPendingCount, onOpenFull }) {
  const timer = useTimeTracker(api, showToast, me, setPendingCount);
  const { state, elapsed, saving } = timer;
  return (
    <div className={`timer-display ${state.running ? "timer-running" : ""}`} style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "1px" }}>
          {state.running ? "⏱ Zeiterfassung läuft" : "Zeiterfassung"}
        </span>
        <span onClick={onOpenFull} style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", cursor: "pointer" }}>Alle Einträge ›</span>
      </div>
      <div className="timer-time" style={{ fontSize: 40 }}>{fmtTimer(elapsed)}</div>
      <div style={{ display: "grid", gap: 8, marginTop: 14, textAlign: "left" }}>
        <div className="field-group">
          <select value={state.task} onChange={e => timer.setMeta({ task: e.target.value })}>
            <option value="">— Aufgabe wählen —</option>
            {tasks.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <input className="search-bar" style={{ marginBottom: 0 }} value={state.note}
          onChange={e => timer.setMeta({ note: e.target.value })} placeholder="Beschreibung (optional)" />
      </div>
      <button className={`btn ${state.running ? "btn-danger" : "btn-success"}`} style={{ width: "100%", marginTop: 12 }}
        disabled={saving} onClick={() => state.running ? timer.stop() : timer.start()}>
        {saving ? <><div className="spinner" style={{ width: 15, height: 15 }} />Speichere…</> : state.running ? "⏹ Stoppen & Speichern" : "▶ Timer starten"}
      </button>
    </div>
  );
}

// ─── Thirdparties ───────────────────────────────────────────────────────────
function ThirdpartyList({ api, type, me, showToast, setPendingCount }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [kind, setKind] = useState(type === "partners" ? "customer" : type);
  const isPartners = type === "partners";
  const activeType = isPartners ? kind : type;
  const title = isPartners ? "Geschäftspartner" : activeType === "customer" ? "Kunden" : activeType === "prospect" ? "Interessenten" : "Lieferanten";

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api.getThirdparties(activeType); setItems(Array.isArray(d) ? d : []); }
    catch { showToast("Ladefehler", "error"); }
    finally { setLoading(false); }
  }, [api, activeType, showToast]);

  useEffect(() => { if (api) load(); }, [load]);

  const filtered = items.filter(i =>
    [i.name, i.email, i.phone, i.town].some(f => (f||"").toLowerCase().includes(search.toLowerCase()))
  );
  const avatarColor = activeType === "supplier" ? ["var(--k-ocker-bg)", "var(--k-ocker)"] : activeType === "prospect" ? ["var(--k-petrol-bg)", "var(--k-petrol)"] : ["var(--k-moos-bg)", "var(--k-moos)"];

  return (
    <div className="main">
      <div className="page-header">
        <h2>{title}</h2>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Icon name="plus" size={15} /> Neu
        </button>
      </div>
      {isPartners && (
        <StatusFilter
          options={[{key:"customer",label:"Kunden"},{key:"supplier",label:"Lieferanten"},{key:"prospect",label:"Interessenten"}]}
          value={kind}
          onChange={setKind}
        />
      )}
      <input className="search-bar" placeholder="Name, E-Mail, Ort..." value={search} onChange={e => setSearch(e.target.value)} />
      {loading ? <div className="loading"><div className="spinner" /> Lade...</div>
        : filtered.length === 0 ? <div className="empty-state"><Icon name={activeType==="supplier"?"suppliers":"customers"} size={48}/><p>Keine Einträge</p></div>
        : filtered.map(item => (
          <div key={item.id} className="list-item" onClick={() => { setEditing(item); setShowForm(true); }}>
            <div className="list-avatar" style={{ background: avatarColor[0], color: avatarColor[1] }}>
              {(item.name||"?")[0].toUpperCase()}
            </div>
            <div className="list-info">
              <div className="name">{item.name}</div>
              <div className="sub">{[item.email, item.phone, item.town].filter(Boolean).join(" · ") || "Keine Details"}</div>
            </div>
            <Icon name="edit" size={15} />
          </div>
        ))}
      {showForm && <ThirdpartyForm api={api} type={activeType} editing={editing} me={me} setPendingCount={setPendingCount} onClose={() => setShowForm(false)}
        onSaved={(opts) => {
          setShowForm(false);
          if (opts?.offline) { showToast("Offline gespeichert – wird synchronisiert, sobald wieder online."); return; }
          load();
          showToast(opts?.deleted ? "Gelöscht!" : editing ? "Gespeichert!" : "Angelegt!");
        }} showToast={showToast} />}
    </div>
  );
}

function ThirdpartyForm({ api, type, editing, me, setPendingCount, onClose, onSaved, showToast }) {
  const [form, setForm] = useState({
    name: editing?.name||"", email: editing?.email||"", phone: editing?.phone||"",
    address: editing?.address||"", zip: editing?.zip||"", town: editing?.town||"",
    client: editing ? (editing.client||0) : (type==="customer"?1:(type==="prospect"?2:0)),
    fournisseur: editing ? (editing.fournisseur||0) : (type==="supplier"?1:0),
    code_client: editing?.code_client && editing.code_client !== "-1" ? editing.code_client : "",
    code_fournisseur: editing?.code_fournisseur && editing.code_fournisseur !== "-1" ? editing.code_fournisseur : "",
    status: 1,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    if (!form.name) { showToast("Name ist Pflicht", "error"); return; }
    setSaving(true);
    // Only send codes if the user actually provided one
    const payload = { ...form, ...(editing ? {} : DE_LAND) };
    if (!payload.code_client) delete payload.code_client;
    if (!payload.code_fournisseur) delete payload.code_fournisseur;
    const userProvidedCode = !!(type === "customer" ? form.code_client : form.code_fournisseur);
    try {
      if (editing) {
        await api.updateThirdparty(editing.id, payload);
        onSaved();
      } else if (offline.isOnline() && window.__api) {
        await createThirdpartyWithFallback(api, payload, type, userProvidedCode);
        onSaved();
      } else {
        // Offline: in die Outbox statt direktem API-Call. Es entsteht keine
        // Server-ID; der Sync legt den Kunden/Lieferanten später an.
        await offline.enqueue({
          type: "thirdparty",
          payload: {
            name: payload.name, client: payload.client, fournisseur: payload.fournisseur,
            email: payload.email, phone: payload.phone, address: payload.address,
            zip: payload.zip, town: payload.town, ...DE_LAND,
          },
          createdBy: me?.login || "",
        });
        setPendingCount(c => c + 1);
        onSaved({ offline: true });
      }
    } catch (err) { showToast(friendlyThirdpartyError(err, type), "error"); }
    finally { setSaving(false); }
  };

  // Loeschen gibt es nur beim Bearbeiten eines bestehenden Partners und nur
  // fuer Admins oder den Anleger (`canDeleteRecord`, gleiche Regel wie beim
  // Projekt). Bewusst hier im Bearbeiten-Dialog und nicht als Papierkorb in der
  // Liste: auf dem Tablet liegt die Liste unter dem Daumen, ein Fehlgriff waere
  // dort einen Datensatz wert. Anders als beim Projekt gibt es nichts
  // mitzuloeschen — ein Geschaeftspartner haengt an keinem Kalendereintrag.
  const remove = async () => {
    if (!editing) return;
    // Offline nicht in die Outbox: die ist bewusst CREATE-only, und ein
    // vorgemerktes Loeschen auf eine ID, die der Sync spaeter umschreibt,
    // traefe im Zweifel den falschen Datensatz.
    if (!offline.isOnline()) { showToast("Löschen geht nur online.", "error"); return; }
    if (!window.confirm(`„${editing.name || "Diesen Geschäftspartner"}" wirklich löschen?`)) return;
    setDeleting(true);
    try {
      await api.deleteThirdparty(editing.id || editing.rowid);
      onSaved({ deleted: true });
    } catch (err) { showToast(friendlyThirdpartyDeleteError(err), "error"); setDeleting(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-title">{editing?"Bearbeiten":type==="customer"?"Neuer Kunde":type==="prospect"?"Neuer Interessent":"Neuer Lieferant"}</div>
        {[
          { k:"name", l:"Name *", p:"Firmenname oder Person" },
          { k:"email", l:"E-Mail", p:"email@beispiel.de", t:"email" },
          { k:"phone", l:"Telefon", p:"+49 ...", t:"tel" },
          { k:"address", l:"Adresse", p:"Straße und Hausnummer" },
        ].map(f => (
          <div className="field-group mb12" key={f.k}>
            <label>{f.l}</label>
            <input type={f.t||"text"} value={form[f.k]} onChange={set(f.k)} placeholder={f.p} />
          </div>
        ))}
        <div className="form-row mb20">
          <div className="field-group"><label>PLZ</label><input value={form.zip} onChange={set("zip")} placeholder="12345" /></div>
          <div className="field-group"><label>Ort</label><input value={form.town} onChange={set("town")} placeholder="Stadt" /></div>
        </div>
        <div className="field-group mb20">
          <label>{type==="supplier" ? "Lieferantennummer (optional)" : "Kundennummer (optional)"}</label>
          <input
            value={type==="customer" ? form.code_client : form.code_fournisseur}
            onChange={set(type==="customer" ? "code_client" : "code_fournisseur")}
            placeholder="Leer lassen für automatische Vergabe" />
        </div>
        <div style={{display:"flex",gap:10}}>
          <button className="btn btn-secondary" style={{flex:1}} onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" style={{flex:1}} onClick={save} disabled={saving||deleting}>
            {saving?<><div className="spinner" style={{width:15,height:15}}/>Speichere...</>:"Speichern"}
          </button>
        </div>
        {editing && canDeleteRecord(editing, me) && (
          <button className="btn btn-danger" style={{width:"100%",marginTop:10}} onClick={remove} disabled={saving||deleting}>
            {deleting?<><div className="spinner" style={{width:15,height:15}}/>Lösche...</>:<><Icon name="trash" size={16}/> Löschen</>}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Invoice List ───────────────────────────────────────────────────────────
function InvoiceList({ api, showToast, onDetail }) {
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, cust] = await Promise.all([api.getInvoices().catch(()=>[]), api.getThirdparties("customer").catch(()=>[])]);
      setItems(Array.isArray(inv)?inv:[]); setCustomers(Array.isArray(cust)?cust:[]);
    } catch { showToast("Ladefehler","error"); }
    finally { setLoading(false); }
  }, [api, showToast]);

  useEffect(() => { if(api) load(); }, [load]);

  const statusMap = { 0:["Entwurf","badge-draft"], 1:["Offen","badge-open"], 2:["Bezahlt","badge-paid"], 3:["Verlassen","badge-cancelled"] };
  const match = (INVOICE_FILTERS.find(o=>o.key===filter)||INVOICE_FILTERS[0]).match;
  const s = search.trim().toLowerCase();
  const shown = items.filter(inv => match(Number(inv.statut)))
    .filter(inv => !s
      || String(inv.ref||"").toLowerCase().includes(s)
      || String(customers.find(c=>c.id==inv.socid)?.name||"").toLowerCase().includes(s));

  return (
    <div className="main">
      <div className="page-header">
        <h2>Rechnungen</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}><Icon name="plus" size={15}/> Neu</button>
      </div>
      <input className="search-bar" placeholder="Suchen (Kunde, Ref)…" value={search} onChange={e=>setSearch(e.target.value)} />
      <StatusFilter options={INVOICE_FILTERS} value={filter} onChange={setFilter} />
      {loading ? <div className="loading"><div className="spinner"/> Lade...</div>
        : shown.length===0 ? <div className="empty-state"><Icon name="invoice" size={48}/><p>Keine Rechnungen</p></div>
        : shown.map(inv => {
          const [label,cls] = rechnungStatusBadge(inv, hatGutschriftIn(inv, items), statusMap);
          const cust = customers.find(c=>c.id==inv.socid);
          return (
            <div key={inv.id} className="list-item" onClick={()=>onDetail(inv)}>
              <div className="list-avatar" style={{background:"var(--k-moos-bg)",color:"var(--k-moos)"}}><Icon name="invoice" size={19}/></div>
              <div className="list-info">
                <div className="name">{inv.ref||`RE-${inv.id}`}</div>
                <div className="sub">{cust?.name||"—"} · {fmtDate(inv.date)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div className="list-amount">{fmtMoney(inv.total_ttc)}</div>
                {/* Teilbezahlt: ohne diese Zeile sähe eine halb bezahlte
                    Rechnung in der Liste genauso aus wie eine unbezahlte. */}
                {Number(inv.statut)===1 && (parseFloat(inv.totalpaid)||0) > 0
                  ? <span className="badge badge-open">noch {fmtMoney(restBetrag(inv))}</span>
                  : <span className={`badge ${cls}`}>{label}</span>}
              </div>
            </div>
          );
        })}
      {showForm && <DocForm api={api} type="invoice" customers={customers} onClose={()=>setShowForm(false)}
        onSaved={()=>{setShowForm(false);load();showToast("Rechnung erstellt!");}} showToast={showToast}/>}
    </div>
  );
}

// ─── Lieferschein Dialog ──────────────────────────────────────────────────────
function LieferscheinDialog({ api, inv, showToast, onClose }) {
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [saving, setSaving] = useState(false);
  const productLines = (inv.lines || []).filter(l => l.fk_product || l.product_id);

  useEffect(() => {
    api.getWarehouses().then(w => {
      const list = Array.isArray(w) ? w : [];
      setWarehouses(list);
      if (list.length === 1) setWarehouseId(String(list[0].id));
    }).catch(() => {});
  }, [api]);

  const create = async () => {
    if (!warehouseId) { showToast("Bitte Lager wählen", "error"); return; }
    setSaving(true);
    try {
      const shipment = await api.createShipment({
        socid: inv.socid,
        fk_project: inv.fk_project || inv.fk_projet || inv.projectid || undefined,
        date_livraison: Math.floor(Date.now() / 1000),
        note_private: `Zu Rechnung ${inv.ref || inv.id}`,
        lines: productLines.map(l => ({
          fk_origin_line: l.id,
          product_id: l.fk_product || l.product_id,
          qty: parseFloat(l.qty) || 1,
          warehouse_id: parseInt(warehouseId),
        })),
      });
      await api.validateShipment(shipment.id);
      showToast("Lieferschein erstellt & Lager ausgebucht!");
      onClose(true);
    } catch (err) {
      showToast(doliError(err) || "Lieferschein fehlgeschlagen", "error");
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => onClose(false)}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h3 style={{marginBottom:14}}>Lieferschein erstellen</h3>
        {productLines.length === 0 ? (
          <p style={{color:"var(--text2)",fontSize:13,marginBottom:16}}>Keine Artikel mit Produktbezug auf dieser Rechnung – Lieferschein nicht möglich.</p>
        ) : (<>
          <p style={{fontSize:13,color:"var(--text2)",marginBottom:12}}>{productLines.length} Position(en) werden ausgebucht:</p>
          {productLines.map(l => (
            <div key={l.id} style={{fontSize:13,padding:"6px 0",borderBottom:"1px solid var(--border)"}}>
              <span style={{fontWeight:600}}>{l.product_label || l.label || `Artikel #${l.fk_product||l.product_id}`}</span>
              <span style={{color:"var(--text2)",marginLeft:8}}>× {l.qty}</span>
            </div>
          ))}
          <div className="field-group" style={{marginTop:14,marginBottom:16}}>
            <label>Lager *</label>
            <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
              <option value="">— Lager wählen —</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.label || w.ref || `Lager #${w.id}`}</option>)}
            </select>
          </div>
        </>)}
        <div style={{display:"flex",gap:8}}>
          <button className="btn btn-secondary" style={{flex:1}} onClick={() => onClose(false)}>Überspringen</button>
          {productLines.length > 0 && (
            <button className="btn btn-primary" style={{flex:1}} onClick={create} disabled={saving}>
              {saving ? <><div className="spinner" style={{width:14,height:14}}/>Erstelle...</> : <><Icon name="receive" size={15}/> Erstellen & Ausbuchen</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Zahlung erfassen ─────────────────────────────────────────────────────────
// Vollständige Zahlungsabwicklung wie in Dolibarr: Betrag, Datum, Zahlungsart,
// Konto. Im Konto-Dropdown stehen auch die Privateinlage-Konten (1892/1893) —
// „privat gezahlt" wird als Zahlung vom Privateinlage-Konto des Gesellschafters
// gebucht (so wie der Fiat am 14.08.2026), damit die Firma sichtbar bei ihm in
// der Kreide steht statt die EÜR zu verfälschen.
// `art` unterscheidet Kunden- und Lieferantenrechnung: andere Route, anderes
// Zahlungsart-Feld, andere Restbetrag-Logik — die Maske ist dieselbe.
function ZahlungDialog({ api, inv, art = "kunde", showToast, onClose, mahnstand, vorgabe = null }) {
  const rest = art === "lieferant" ? lieferantRestBetrag(inv) : restBetrag(inv);
  // Gemahnte Gesamtforderung (Rest + Mahnkosten + Zinsen bis heute), sobald
  // mindestens eine Mahnstufe raus ist — kommt aus GET mahnung/stand.
  const forderung = art === "kunde" ? mahnstand?.forderung : null;
  const maxBetrag = forderung?.gesamt > rest ? forderung.gesamt : rest;
  const [konten, setKonten] = useState([]);
  const [zahlungsarten, setZahlungsarten] = useState([]);
  const [betrag, setBetrag] = useState(vorgabe?.betrag != null ? String(vorgabe.betrag) : String(rest));
  const [datum, setDatum] = useState(vorgabe?.datum || todayISO());
  const [zahlungsartId, setZahlungsartId] = useState("");
  const [kontoId, setKontoId] = useState("");
  const [kommentar, setKommentar] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getBankAccounts().then((k) => {
      const list = (Array.isArray(k) ? k : []).filter((a) => Number(a.clos || 0) === 0);
      setKonten(list);
      if (vorgabe?.kontoId) { setKontoId(String(vorgabe.kontoId)); return; }
      // Vorbelegung: das erste Firmenkonto (in der Praxis die Volksbank) —
      // wer privat gezahlt hat, wählt sein Privateinlage-Konto bewusst aus.
      const firma = list.find((a) => kontoRolle(a) === "firma");
      if (firma) setKontoId(String(firma.id));
    }).catch(() => setKonten([]));
    api.getPaymentTypes().then((z) => {
      const list = Array.isArray(z) ? z : [];
      setZahlungsarten(list);
      // Überweisung (VIR) ist der Normalfall.
      const vir = list.find((t) => t.code === "VIR");
      if (vir) setZahlungsartId(String(vir.id));
    }).catch(() => setZahlungsarten([]));
  }, [api]);

  const buchen = async () => {
    const wahl = { betrag: parseFloat(String(betrag).replace(",", ".")), datum, zahlungsartId, kontoId, kommentar };
    const fehler = zahlungFehler(wahl, rest, maxBetrag);
    if (fehler) { showToast(fehler, "error"); return; }
    setSaving(true);
    try {
      // Auf die Rechnung selbst geht hoechstens ihr Restbetrag — der
      // Mehrbetrag einer gemahnten Rechnung sind Mahnkosten/Verzugszinsen
      // (nicht steuerbarer Schadensersatz, keine Rechnungsposition) und
      // wird stattdessen als Agenda-Vermerk am Beleg dokumentiert, damit
      // die EUeR den Zufluss beim Kontoabgleich zuordnen kann.
      const aufRechnung = Math.min(wahl.betrag, rest);
      const mehrbetrag = Math.round((wahl.betrag - aufRechnung) * 100) / 100;
      if (art === "lieferant") {
        await api.addSupplierInvoicePayment(inv.id, lieferantZahlungBody(inv, wahl));
      } else {
        const plan = zahlungPlan(inv, { ...wahl, betrag: aufRechnung });
        await api.zahlungBuchen(plan.pfad, plan.body);
      }
      if (mehrbetrag > 0.005) {
        try {
          await api.createAgendaEvent({
            label: `Mahnkosten/Verzugszinsen vereinnahmt: ${mehrbetrag.toFixed(2).replace(".", ",")} € (${inv.ref})`,
            note: `Zahlungseingang vom ${wahl.datum} über ${wahl.betrag.toFixed(2).replace(".", ",")} € zu ${inv.ref}: ${aufRechnung.toFixed(2).replace(".", ",")} € auf die Rechnung gebucht, ${mehrbetrag.toFixed(2).replace(".", ",")} € Mahnkosten/Verzugszinsen (echter Schadensersatz, nicht umsatzsteuerbar) als Betriebseinnahme vereinnahmt.`,
            datep: `${wahl.datum} 12:00:00`,
            fk_element: inv.id,
            elementtype: "invoice",
            socid: inv.socid,
          });
        } catch {
          // Die Zahlung ist gebucht — scheitert nur der Vermerk, soll das
          // die Buchung nicht rueckwirkend als Fehler erscheinen lassen.
          showToast("Zahlung gebucht, aber der Mahnkosten-Vermerk scheiterte — bitte in Dolibarr nachtragen.", "error");
        }
      }
      showToast(Math.abs(wahl.betrag - rest) < 0.005 || mehrbetrag > 0.005 ? "Zahlung gebucht — Rechnung bezahlt!" : "Teilzahlung gebucht!");
      onClose(true);
    } catch (err) {
      // Kein automatischer zweiter Versuch: eine wiederholte Zahlungsbuchung
      // wäre im Zweifel eine Doppelzahlung. Der Fehler wird gezeigt, der
      // Dialog bleibt offen, die Person entscheidet.
      showToast(doliError(err) || "Zahlung fehlgeschlagen", "error");
      setSaving(false);
    }
  };

  const ZAHLUNGSART_NAMEN = { VIR: "Überweisung", LIQ: "Bar", CB: "Karte", PRE: "Lastschrift", CHQ: "Scheck" };

  return (
    <div className="modal-overlay" onClick={() => onClose(false)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>Zahlung erfassen</h3>
        <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: forderung?.gesamt > rest ? 4 : 14 }}>
          {inv.ref} · offen: {fmtMoney(rest)}
        </p>
        {forderung?.gesamt > rest && (
          <p style={{ fontSize: 12, color: "var(--warn)", marginBottom: 14 }}>
            Gemahnt — Gesamtforderung {fmtMoney(forderung.gesamt)} (inkl. {fmtMoney(forderung.gebuehr)} Mahnkosten
            {forderung.zinsen > 0 ? ` + ${fmtMoney(forderung.zinsen)} Zinsen` : ""}). Zahlt der Kunde mehr als den
            Rechnungsbetrag, wird der Mehrbetrag automatisch als Mahnkosten am Beleg vermerkt.
          </p>
        )}
        <div className="field-group">
          <label>Betrag (€) *</label>
          <input type="number" inputMode="decimal" step="0.01" min="0" value={betrag}
            onChange={(e) => setBetrag(e.target.value)} />
        </div>
        <div className="field-group">
          <label>Zahlungsdatum *</label>
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </div>
        <div className="field-group">
          <label>Zahlungsart *</label>
          <select value={zahlungsartId} onChange={(e) => setZahlungsartId(e.target.value)}>
            <option value="">— wählen —</option>
            {zahlungsarten.map((t) => (
              <option key={t.id} value={t.id}>{ZAHLUNGSART_NAMEN[t.code] || t.label || t.code}</option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label>Konto (wohin ist das Geld geflossen?) *</label>
          <select value={kontoId} onChange={(e) => setKontoId(e.target.value)}>
            <option value="">— wählen —</option>
            {konten.map((k) => (
              <option key={k.id} value={k.id}>
                {(k.label || `Konto #${k.id}`) + (kontoRolle(k) !== "firma" ? " (privat gezahlt)" : "")}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group" style={{ marginBottom: 16 }}>
          <label>Bemerkung</label>
          <input value={kommentar} onChange={(e) => setKommentar(e.target.value)} placeholder="optional" />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => onClose(false)}>Abbrechen</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={buchen} disabled={saving}>
            {saving ? <><div className="spinner" style={{ width: 14, height: 14 }} />Buche...</> : <><Icon name="validate" size={15} /> Zahlung buchen</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Invoice Detail ──────────────────────────────────────────────────────────
// Bestaetigungsfenster fuers Storno: Nummer, Betrag, Kunde, Weg, Grund,
// Vermerk — und ein roter Knopf. Nichts passiert ohne diesen Dialog.
function StornoDialog({ api, inv, kunde, onClose, showToast }) {
  const wege = stornoWege(inv);
  const [wahl, setWahl] = useState(wege[0] || "");
  const [grund, setGrund] = useState(STORNO_GRUENDE[0].code);
  const [notiz, setNotiz] = useState("");
  const [busy, setBusy] = useState(false);
  const WEG_TEXT = {
    loeschen:   ["Entwurf löschen", "Die Rechnung ist noch nicht validiert und wird endgültig entfernt."],
    gutschrift: ["Stornorechnung (Gutschrift) erstellen", Number(inv.statut) === 2
      ? "GoBD-sauber: Gutschrift mit denselben Positionen wird angelegt und validiert; der Betrag bleibt als Guthaben beim Kunden."
      : "GoBD-sauber: Gutschrift mit denselben Positionen wird angelegt, validiert und mit dieser Rechnung verrechnet — sie gilt dann als beglichen."],
    verlassen:  ["Nur als „verlassen“ klassifizieren", "Kein Beleg — Dolibarr setzt den Status auf „verlassen“ mit dem gewählten Grund. Für Rechnungen, die den Kunden nie erreicht haben."],
  };
  const ausfuehren = async () => {
    if (!wahl) return;
    setBusy(true);
    try {
      const e = await stornoAusfuehren(api, inv, { wahl, grund, notiz: notiz.trim(), heute: todayISO() });
      if (e.art === "geloescht") showToast("Entwurf gelöscht.");
      else if (e.art === "verlassen") showToast("Rechnung als „verlassen“ klassifiziert.");
      else if (e.fertig) showToast(e.guthaben ? "Gutschrift erstellt — Betrag steht als Guthaben beim Kunden." : "Stornorechnung erstellt und verrechnet.");
      else showToast(e.fehler || "Storno unvollständig", "error");
      onClose(e);
    } catch (err) {
      showToast("Storno fehlgeschlagen: " + stornoFehlerText(err), "error");
      setBusy(false);
    }
  };
  return (
    <div className="modal-overlay" onClick={() => !busy && onClose(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-title">Rechnung stornieren</div>
        <div className="detail-hero" style={{ marginBottom: 12 }}>
          <div className="detail-row"><span className="lbl">Rechnung</span><span className="val">{inv.ref || `#${inv.id}`}</span></div>
          <div className="detail-row"><span className="lbl">Betrag</span><span className="val">{fmtMoney(inv.total_ttc)}</span></div>
          <div className="detail-row"><span className="lbl">Kunde</span><span className="val">{kunde?.name || kunde?.nom || "—"}</span></div>
        </div>
        {wege.length > 1 && (
          <div className="field-group mb12"><label>Weg</label>
            {wege.map((w) => (
              <label key={w} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text)" }}>
                <input type="radio" name="storno-weg" checked={wahl === w} onChange={() => setWahl(w)} />
                <span><b>{WEG_TEXT[w][0]}</b><br /><span style={{ color: "var(--text2)", fontSize: 12.5 }}>{WEG_TEXT[w][1]}</span></span>
              </label>
            ))}
          </div>
        )}
        {wege.length === 1 && wahl && <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 12 }}><b>{WEG_TEXT[wahl][0]}</b> — {WEG_TEXT[wahl][1]}</p>}
        {wahl !== "loeschen" && (<>
          <div className="field-group mb12"><label>Grund</label>
            <select value={grund} onChange={(e) => setGrund(e.target.value)}>
              {STORNO_GRUENDE.map((g) => <option key={g.code} value={g.code}>{g.label}</option>)}
            </select>
          </div>
          <div className="field-group mb12"><label>Vermerk (optional)</label>
            <input value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. ersetzt durch FA…-0013" />
          </div>
        </>)}
        <div className="action-row action-row-2">
          <button type="button" className="btn btn-secondary" onClick={() => onClose(null)} disabled={busy}>Abbrechen</button>
          <button type="button" className="btn btn-danger" onClick={ausfuehren} disabled={busy || !wahl}>{busy ? "Bitte warten…" : "Stornieren"}</button>
        </div>
      </div>
    </div>
  );
}

function InvoiceDetail({ api, data, me, onBack, onOpenDetail, showToast }) {
  const [inv, setInv] = useState(data);
  const [customers, setCustomers] = useState([]);
  const [docs, setDocs] = useState([]);
  const [showEmail, setShowEmail] = useState(false);
  const [showMahnung, setShowMahnung] = useState(false);
  const [mahnstand, setMahnstand] = useState(null);
  const [showShipmentDialog, setShowShipmentDialog] = useState(false);
  const [showZahlung, setShowZahlung] = useState(false);
  const [showStorno, setShowStorno] = useState(false);
  const [gutschriften, setGutschriften] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pdf, setPdf] = useState(null);
  const [pdfLaedt, setPdfLaedt] = useState(false);

  useEffect(() => {
    api.getThirdparties("customer").then(c=>setCustomers(Array.isArray(c)?c:[])).catch(()=>{});
    api.getDocuments("invoice", inv.id).then(d=>setDocs(Array.isArray(d)?d:[])).catch(()=>{});
  }, [api, inv.id]);
  // Gutschriften, die auf diese Rechnung zeigen (nach einem Storno).
  const ladeGutschriften = useCallback(() => {
    if (Number(inv.type ?? 0) === 2 || Number(inv.statut) === 0) { setGutschriften([]); return; }
    api.getGutschriftenZu(inv.id).then((g) => setGutschriften(Array.isArray(g) ? g : [])).catch(() => setGutschriften([]));
  }, [api, inv.id, inv.statut, inv.type]);
  useEffect(() => { ladeGutschriften(); }, [ladeGutschriften]);

  // Mahnstand vom Server: welche Stufe ist als naechstes dran, ab wann.
  // Mahnungen laufen sequenziell (Zahlungserinnerung -> 2. Mahnung ->
  // Letzte Mahnung) mit 7 Tagen Frist dazwischen — der Server entscheidet,
  // die App zeigt nur den jeweils gueltigen Knopf.
  const ladeMahnstand = useCallback(() => {
    if (Number(inv.statut) === 1) api.getMahnstand(inv.id).then(setMahnstand).catch(()=>setMahnstand(null));
    else setMahnstand(null);
  }, [api, inv.id, inv.statut]);
  useEffect(() => { ladeMahnstand(); }, [ladeMahnstand]);

  const reload = () => api.getInvoice(inv.id).then(d=>setInv(d)).catch(()=>{});
  const reloadFull = () => api.getInvoice(inv.id).then(d=>{ if(d) setInv(d); }).catch(()=>{});

  const validate = async () => {
    setLoading(true);
    try {
      await api.validateInvoice(inv.id);
      await reload();
      showToast("Rechnung validiert!");
      // Frueher sprang hier der Lieferschein-Dialog von selbst auf. Blattwerk
      // ist ein Dienstleistungsbetrieb — in Dolibarr steht seit Bestehen kein
      // einziger Lieferschein (16.08.2026 nachgesehen) —, und ein Fenster, das
      // nach jedem Validieren nach etwas fragt, das niemand braucht, ist im
      // Weg. Der Lieferschein bleibt ueber den Knopf unten erreichbar, fuer
      // den Fall, dass doch einmal Ware ausgeliefert wird.
    }
    catch (err) { showToast(doliError(err) || "Validieren fehlgeschlagen", "error"); }
    finally { setLoading(false); }
  };

  // Loeschen eines Entwurfs laeuft ueber den Storno-Dialog (Bestaetigung mit
  // Nummer/Betrag/Kunde); der Admin-Sonderfall „validiert, aber noch nicht
  // rausgegangen" behaelt seine direkte Rueckfrage.
  const remove = async () => {
    if (Number(inv.statut) === 0) { setShowStorno(true); return; }
    if (!window.confirm(`Validierte Rechnung ${inv.ref || ""} wirklich löschen? Nach GoBD ist Storno/Gutschrift der richtige Weg.`)) return;
    setLoading(true);
    try { await api.deleteInvoice(inv.id); showToast("Rechnung gelöscht!"); onBack(); }
    catch (err) { showToast(doliError(err) || "Löschen fehlgeschlagen", "error"); setLoading(false); }
  };
  const stornoFertig = (e) => {
    setShowStorno(false);
    if (!e) return;
    if (e.art === "geloescht") { onBack(); return; }
    reload(); ladeMahnstand(); ladeGutschriften();
  };
  const darfStornieren = stornoWege(inv).length > 0 && Number(inv.statut) !== 0
    && (me?.canValidateInvoices || me?.canRecordPayments || me?.isAdmin);

  // Eine **validierte** Ausgangsrechnung zu loeschen ist nach GoBD der falsche
  // Griff: die Aufzeichnung ist unveraenderbar, korrigiert wird mit Storno oder
  // Gutschrift. Der Entwurf ist dagegen noch nichts — den darf jeder wegwerfen,
  // der ihn angelegt hat.
  //
  // Fuer Admins bleibt der Knopf trotzdem bis Status "Offen" stehen: es gibt den
  // Fall der versehentlich validierten Rechnung, die noch niemand gesehen hat,
  // und wer dann nicht loeschen kann, macht es notgedrungen in Dolibarr selbst
  // — dort ohne diese Ueberlegung. Entschieden am 16.08.2026 mit Inhaber.
  const darfLoeschen = Number(inv.statut) === 0
    || (me?.isAdmin && Number(inv.statut) === 1);

  // Abhaken ohne Zahlungserfassung — für außerhalb der App abgewickelte Fälle
  // (gleiches Motiv wie „als fakturiert" beim Angebot). Dolibarr setzt die
  // Rechnung auf Bezahlt, ohne eine Zahlung oder Bankbewegung anzulegen.
  const abhaken = async () => {
    if (!window.confirm("Ohne Zahlungserfassung als bezahlt abhaken? Es wird KEINE Zahlung und keine Kontobewegung gebucht — nur der Status wechselt.")) return;
    setLoading(true);
    try { await api.setInvoicePaid(inv.id); await reload(); showToast("Rechnung abgehakt."); }
    catch (err) { showToast(doliError(err) || "Abhaken fehlgeschlagen", "error"); }
    finally { setLoading(false); }
  };

  const bezahltBetrag = parseFloat(inv.totalpaid) || 0;
  const rest = restBetrag(inv);
  const darfZahlen = Number(inv.statut) === 1 && me?.canRecordPayments;

  const statusMap = { 0:["Entwurf","badge-draft"], 1:["Offen","badge-open"], 2:["Bezahlt","badge-paid"], 3:["Verlassen","badge-cancelled"] };
  const [label,cls] = rechnungStatusBadge(inv, gutschriften.length > 0, statusMap);
  const cust = customers.find(c=>c.id==inv.socid);

  return (
    <div className="main">
      <div className="page-header">
        <div className="back-btn" onClick={onBack}><Icon name="back" size={20}/></div>
        <h2>Rechnung</h2>
        <span className={`badge ${cls}`}>{label}</span>
      </div>
      <div className="detail-hero">
        <div className="detail-ref">{inv.ref||`RE-${inv.id}`}</div>
        <div className="detail-client">{cust?.name||"—"}</div>
        <div className="detail-amount">{fmtMoney(inv.total_ttc)}</div>
        <div style={{marginTop:16}}>
          <div className="detail-row"><span className="lbl">Netto</span><span className="val">{fmtMoney(inv.total_ht)}</span></div>
          <div className="detail-row"><span className="lbl">MwSt</span><span className="val">{fmtMoney(inv.total_tva)}</span></div>
          <div className="detail-row"><span className="lbl">Datum</span><span className="val">{fmtDate(inv.date)}</span></div>
          <div className="detail-row"><span className="lbl">Fällig</span><span className="val">{fmtDate(inv.date_echeance)}</span></div>
          {Number(inv.statut) === 3 && (
            <div className="detail-row"><span className="lbl">Verlassen</span>
              <span className="val">{STORNO_GRUENDE.find((g) => g.code === inv.close_code)?.label || inv.close_code || "—"}{inv.close_note ? ` · ${inv.close_note}` : ""}</span></div>
          )}
          {gutschriften.map((g) => (
            <div key={g.id} className="detail-row"><span className="lbl">Gutschrift</span>
              <span className="val">
                {onOpenDetail
                  ? <a href="#" onClick={(e) => { e.preventDefault(); onOpenDetail("invoice", g); }}>{g.ref || `#${g.id}`}</a>
                  : (g.ref || `#${g.id}`)} · {fmtMoney(g.total_ttc)}
              </span></div>
          ))}
          {Number(inv.type ?? 0) === 2 && inv.fk_facture_source && (
            <div className="detail-row"><span className="lbl">Storno zu</span><span className="val">Rechnung #{inv.fk_facture_source}</span></div>
          )}
          {bezahltBetrag > 0 && (<>
            <div className="detail-row"><span className="lbl">Bezahlt</span><span className="val">{fmtMoney(bezahltBetrag)}</span></div>
            {Number(inv.statut) === 1 && <div className="detail-row"><span className="lbl">Noch offen</span><span className="val" style={{ color: "var(--warn)", fontWeight: 600 }}>{fmtMoney(rest)}</span></div>}
          </>)}
          <ProjectLinkEditor
            api={api}
            docId={inv.id}
            currentProjectId={inv.fk_project || inv.fk_projet || inv.projectid || ""}
            updateFn={(id, data) => api.updateInvoice(id, data)}
            onUpdated={reloadFull}
            showToast={showToast}
          />
        </div>
      </div>

      <div className="action-row action-row-2">
        {Number(inv.statut)===0 && me?.canValidateInvoices && <button className="btn btn-success" onClick={validate} disabled={loading}><Icon name="validate" size={16}/> Validieren</button>}
        {darfZahlen && <button className="btn btn-success" onClick={()=>setShowZahlung(true)} disabled={loading}><Icon name="validate" size={16}/> Zahlung erfassen</button>}
        {darfZahlen && <button className="btn btn-ghost" onClick={abhaken} disabled={loading}><Icon name="validate" size={16}/> Abhaken ohne Zahlung</button>}
        {darfLoeschen && <button className="btn btn-danger" onClick={remove} disabled={loading}><Icon name="trash" size={16}/> Löschen</button>}
        {darfStornieren && <button className="btn btn-danger" onClick={()=>setShowStorno(true)} disabled={loading}><Icon name="warning" size={16}/> Stornieren</button>}
        <button className="btn btn-warn" onClick={()=>setShowEmail(true)}><Icon name="mail" size={16}/> Per Mail senden</button>
        {/* Mahnknopf nur bei validierten, noch offenen Rechnungen — und nur
            fuer die naechste Stufe laut Server. Vor Faelligkeit bzw. vor
            Ablauf der 7-Tage-Frist steht er ausgegraut mit Datum da. */}
        {Number(inv.statut)===1 && mahnstand?.naechste_stufe && (
          <button className="btn btn-ghost" disabled={!mahnstand.erlaubt || loading}
            onClick={()=>setShowMahnung(true)}>
            <Icon name="mail" size={16}/> {MAHN_NAMEN[mahnstand.naechste_stufe]}{!mahnstand.erlaubt && mahnstand.erlaubt_ab ? ` (ab ${fmtDate(mahnstand.erlaubt_ab)})` : ""}
          </button>
        )}
        {Number(inv.statut) > 0 && (inv.lines || []).some((l) => l.fk_product) && (
          <button className="btn btn-ghost" onClick={() => setShowShipmentDialog(true)}><Icon name="archive" size={16}/> Lieferschein</button>
        )}
      </div>
      <div className="action-row">
        <button className="btn btn-secondary" disabled={!inv.ref || pdfLaedt}
          onClick={async ()=>{ setPdfLaedt(true); const p = await pdfErzeugen(api,"invoice",inv.ref||"",showToast); setPdfLaedt(false); if (p) setPdf(p); }}>
          <Icon name="download" size={16}/> {pdfLaedt ? "PDF wird erstellt…" : "PDF ansehen"}
        </button>
      </div>

      {pdf && <DateiAnsichtModal titel={pdf.name} datei={pdf} showToast={showToast}
        onClose={() => { URL.revokeObjectURL(pdf.url); setPdf(null); }} />}
      <NotizEditor api={api} docId={inv.id} note={inv.note_public || ""}
        updateFn={(id, data) => api.updateInvoice(id, data)}
        onUpdated={reloadFull}
        showToast={showToast}/>
      <FileUploadSection api={api} modulepart="invoice" docid={inv.id} ref_doc={inv.ref||`RE-${inv.id}`} docs={docs}
        onUploaded={()=>api.getDocuments("invoice",inv.id).then(d=>setDocs(Array.isArray(d)?d:[])).catch(()=>{})} showToast={showToast} />

      {showEmail && <EmailModal api={api} art="rechnung" docId={inv.id} onClose={()=>setShowEmail(false)}
        defaultTo={cust?.email||""} defaultSubject={`Rechnung ${inv.ref}`}
        onSend={async(d)=>{ await api.sendMailBeleg({ art:"rechnung", id:inv.id, ...d }); setShowEmail(false); showToast("E-Mail gesendet!"); }}
        showToast={showToast} />}

      {/* Gleiche Maske wie der Rechnungsversand, nur mit der Mahnvorlage der
          naechsten Stufe (facture_relance) — Text bleibt editierbar. Der
          Server prueft die Stufe beim Versand erneut und protokolliert sie. */}
      {showMahnung && mahnstand?.naechste_stufe && <EmailModal api={api} art="mahnung" docId={inv.id} stufe={mahnstand.naechste_stufe}
        onClose={()=>setShowMahnung(false)}
        titel={`${MAHN_NAMEN[mahnstand.naechste_stufe]} senden`}
        defaultTo={cust?.email||""} defaultSubject={`${MAHN_NAMEN[mahnstand.naechste_stufe]} zur Rechnung ${inv.ref}`}
        onSend={async(d)=>{ await api.sendMailBeleg({ art:"mahnung", id:inv.id, stufe:mahnstand.naechste_stufe, ...d }); setShowMahnung(false); showToast(`${MAHN_NAMEN[mahnstand.naechste_stufe]} gesendet!`); ladeMahnstand(); }}
        showToast={showToast} />}

      {showShipmentDialog && (
        <LieferscheinDialog api={api} inv={inv} showToast={showToast}
          onClose={() => setShowShipmentDialog(false)} />
      )}

      {showStorno && <StornoDialog api={api} inv={inv} kunde={cust} showToast={showToast} onClose={stornoFertig} />}
      {showZahlung && (
        <ZahlungDialog api={api} inv={inv} showToast={showToast} mahnstand={mahnstand}
          onClose={(gebucht) => { setShowZahlung(false); if (gebucht) { reload(); ladeMahnstand(); } }} />
      )}
    </div>
  );
}


// ─── Supplier Invoice List ──────────────────────────────────────────────────
function SupplierInvoiceList({ api, showToast, onDetail, onBack }) {
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("datum_neu");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (offline.isOnline()) {
        const [inv, supp] = await Promise.all([
          api.getSupplierInvoices().catch(() => []),
          api.getThirdparties("supplier").catch(() => []),
        ]);
        setItems(Array.isArray(inv) ? inv : []);
        let suppList = Array.isArray(supp) ? supp : [];
        if (suppList.length === 0) {
          // Fallback: leerer/fehlgeschlagener Online-Abruf → Lieferanten aus dem Offline-Cache,
          // damit die Auswahl nie „leer eingefroren" bleibt.
          const cached = await offline.readRefs("thirdparty").catch(() => []);
          suppList = (Array.isArray(cached) ? cached : []).filter(s => Number(s.fournisseur) > 0);
        }
        setSuppliers(suppList);
      } else {
        // Offline: Lieferantenliste aus dem lokalen Ref-Cache, ergänzt um noch
        // nicht synchronisierte, offline angelegte Lieferanten aus der Outbox
        // (gleiches Muster wie die Kundenliste in ProjectList).
        const [cached, pending] = await Promise.all([
          offline.readRefs("thirdparty").catch(() => []),
          offline.getPending().catch(() => []),
        ]);
        const cachedSuppliers = (Array.isArray(cached) ? cached : []).filter(s => Number(s.fournisseur) > 0);
        const pendingSuppliers = (Array.isArray(pending) ? pending : [])
          .filter(e => e.type === "thirdparty" && e.payload?.fournisseur)
          .map(e => ({ id: "local:" + e.id, name: (e.payload?.name || "Unbenannt") + " (offline)" }));
        setItems([]); // Rechnungslisten sind online-only; offline nur die Auswahl fürs Erstellen bereitstellen
        setSuppliers([...cachedSuppliers, ...pendingSuppliers]);
      }
    } catch {
      showToast("Ladefehler", "error");
    } finally {
      setLoading(false);
    }
  }, [api, showToast]);

  useEffect(() => { if (api) load(); }, [load]);
  // Bei Verbindungswechsel (online↔offline) neu laden — sonst bleibt eine einmal
  // leer geladene Lieferantenliste hängen, bis man die Ansicht neu betritt.
  useEffect(() => {
    const reload = () => { if (api) load(); };
    window.addEventListener("online", reload);
    window.addEventListener("offline", reload);
    return () => { window.removeEventListener("online", reload); window.removeEventListener("offline", reload); };
  }, [load, api]);

  const statusMap = { 0:["Entwurf","badge-draft"], 1:["Offen","badge-open"], 2:["Bezahlt","badge-paid"], 3:["Storno","badge-cancelled"] };
  const match = (INVOICE_FILTERS.find(o => o.key === filter) || INVOICE_FILTERS[0]).match;
  const suppName = (inv) => {
    const suppId = inv.socid || inv.fk_soc || inv.fourn_id || inv.fk_fourn;
    return suppliers.find(s => String(s.id) === String(suppId))?.name || inv.nom || "";
  };
  const shown = items
    .filter(inv => match(Number(inv.statut)))
    .filter(inv => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return [inv.ref, inv.ref_supplier, suppName(inv)].some(v => String(v || "").toLowerCase().includes(q));
    })
    .sort((a, b) => {
      if (sortBy === "datum_alt") return (a.date || 0) - (b.date || 0);
      if (sortBy === "betrag") return parseFloat(b.total_ttc || 0) - parseFloat(a.total_ttc || 0);
      if (sortBy === "lieferant") return suppName(a).localeCompare(suppName(b), "de");
      return (b.date || 0) - (a.date || 0); // datum_neu
    });

  return (
    <div className="main">
      <div className="page-header">
        {onBack && <div className="back-btn" onClick={onBack}><Icon name="back" size={20}/></div>}
        <h2>Lieferantenrechnungen</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}><Icon name="plus" size={15}/> Neu</button>
      </div>
      <StatusFilter options={INVOICE_FILTERS} value={filter} onChange={setFilter} />
      <div className="form-row mb12" style={{ gap: 8 }}>
        <input className="gbu-filter-input" style={{ flex: 2 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Suchen (Lieferant, Ref)…" />
        <select className="gbu-filter-input" style={{ flex: 1 }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="datum_neu">Neueste zuerst</option>
          <option value="datum_alt">Älteste zuerst</option>
          <option value="betrag">Betrag (hoch → niedrig)</option>
          <option value="lieferant">Lieferant A–Z</option>
        </select>
      </div>
      {loading ? <div className="loading"><div className="spinner"/> Lade...</div>
        : shown.length === 0 ? <div className="empty-state"><Icon name="suppliers" size={48}/><p>Keine Lieferantenrechnungen</p></div>
        : shown.map(inv => {
          const [label, cls] = statusMap[inv.statut] || ["–", "badge-draft"];
          const suppId = inv.socid || inv.fk_soc || inv.fourn_id || inv.fk_fourn;
          const supp = suppliers.find(s => String(s.id) === String(suppId));
          return (
            <div key={inv.id} className="list-item" onClick={() => onDetail(inv)}>
              <div className="list-avatar" style={{background:"var(--k-rost-bg)",color:"var(--k-rost)"}}><Icon name="suppliers" size={19}/></div>
              <div className="list-info">
                <div className="name">{inv.ref || inv.ref_supplier || `LF-${inv.id}`}</div>
                <div className="sub">{supp?.name || inv.nom || "—"} · {fmtDate(inv.date)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div className="list-amount">{fmtMoney(inv.total_ttc)}</div>
                <span className={`badge ${cls}`}>{label}</span>
              </div>
            </div>
          );
        })}
      {showForm && <SupplierInvoiceForm api={api} suppliers={suppliers} onClose={() => setShowForm(false)}
        onSaved={(created) => {
          setShowForm(false);
          // Offline: Toast kommt schon aus SupplierInvoiceForm.save() selbst (siehe
          // ProjectForm/ProjectList-Muster) - hier nur schließen, kein load()/onDetail()
          // möglich (keine echte ID, Liste ist offline eh online-only, siehe load() oben).
          if (created?.offline) return;
          load();
          showToast("Lieferantenrechnung erstellt!");
          if (created?.id) onDetail(created);
        }} showToast={showToast}/>}
    </div>
  );
}

// ─── Supplier Invoice Detail ────────────────────────────────────────────────
// Buchungskonto einer Rechnungszeile auflösen: Pipeline und App schreiben
// fk_code_ventilation als "10050"+SKR03-Konto (vgl. beleg-pipeline common.py).
// KI-Pruefung der Beleg-Pipeline (Giza, seit 17.09.2026): Der Pruefer schreibt
// seinen Befund als Block in note_private. Bis er da ist, bleibt der Entwurf
// sichtbar, aber nicht validierbar — freigeben soll niemand, was noch keiner
// gegengelesen hat. Kein eigener Dolibarr-Status: die Notiz IST das Signal.
const PRUEF_MARKE = "=== KI-Prüfung (Giza) ===";
const PRUEF_ENDE = "=== Ende KI-Prüfung ===";
function pruefungSteht(inv) {
  return String(inv?.note_private || "").includes(PRUEF_MARKE);
}
function pruefungText(inv) {
  const t = String(inv?.note_private || "");
  const a = t.indexOf(PRUEF_MARKE);
  if (a < 0) return "";
  const b = t.indexOf(PRUEF_ENDE, a);
  return t.slice(a + PRUEF_MARKE.length, b < 0 ? t.length : b).trim();
}

function ventilationKonto(line) {
  const fk = String(line?.fk_code_ventilation ?? "");
  if (!fk || fk === "0") return null;
  const number = fk.length > 5 && fk.startsWith("10050") ? fk.slice(5) : fk;
  let label = "";
  try { label = (loadKontoConfig().konten || []).find((k) => k.number === number)?.label || ""; } catch (_) {}
  return { number, label };
}

// ─── Betriebsmittel: ein Los je Einzelstück ─────────────────────────────────
//
// Dolibarrs Barcode hängt am ARTIKEL. Alle vier Reifen desselben Typs hätten
// denselben Code, und niemand könnte sagen, welcher vorne links sitzt, wie alt
// er ist oder wann der Verbandkasten verfällt. Träger der Stück-Identität ist
// deshalb das Los (`llx_product_lot`): eigene Nummer, eigener Barcode, eigene
// Datumsangaben. Der Ort bleibt das Lager — die Lagerliste bildet die
// physischen Orte schon ab (Fahrzeuge, Koffer, Kisten, Regale).
//
// Dolibarr rechnet aus diesen Daten NICHTS aus und warnt bei keiner Frist;
// das macht `src/betriebsmittel.js`. Die Stufen heißen wie im Arbeitsschutz,
// damit Farben und Wortlaut (`EW_STUFE_FARBE`, `EW_STUFEN_TEXT`) hier
// weiterbenutzt werden — zwei Quellen für dieselbe Ampel laufen auseinander.
const BM_STUFEN_TEXT = {
  ...EW_STUFEN_TEXT,
  offen: "nie geprüft",
  kein: "kein Datum",
};

/** Kürzel je Artikel, aus dem die laufende Seriennummer gebaut wird. */
const bmNaechsteNummer = (produkt, vorhandene, jahr) =>
  bmSeriennummer(bmKuerzel(produkt?.label || produkt?.ref), jahr, null,
    (vorhandene || []).map((l) => l.batch));

/**
 * Etiketten als PDF — eine Seite je Stück in Etikettengröße, kein A4-Bogen.
 * jsPDF und die QR-Bibliothek werden erst hier geladen; die App schleppt
 * ohnehin genug mit sich herum.
 */
async function etikettenDrucken(lose, produkte, showToast) {
  const heute = todayISO();
  const { etiketten, fehler } = etikettenAusLosen(lose, produkte, heute);
  if (fehler.length) showToast(`${fehler.length} Stück ohne Code übersprungen`, "error");
  if (!etiketten.length) { showToast("Nichts zu drucken", "error"); return; }
  showToast("Etiketten werden erstellt…");
  const { jsPDF } = await import("jspdf");
  const doc = await buildEtikettenPdf(etiketten, { jsPDF });
  const b64 = doc.output("datauristring").split(",")[1];
  const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: "application/pdf" });
  await dateiSpeichern({ inhalt: b64, name: etikettDateiname(etiketten, heute), typ: "application/pdf", url: URL.createObjectURL(blob) }, showToast);
}

/**
 * Legt aus den Positionen einer Lieferantenrechnung Lose an und druckt deren
 * Etiketten. Der Auslöser sitzt bewusst hier und nicht am Lieferschein: es
 * gibt in dieser Dolibarr-Instanz keinen einzigen Lieferschein, die
 * Lieferantenrechnung dagegen erfasst die Beleg-Pipeline ohnehin.
 */
/**
 * Eine Etikettenzeile = ein Stueck. Auch bei Menge 4 entstehen vier Zeilen mit
 * vier eigenen Nummern — sonst gaebe es wieder einen Code fuer alle vier, und
 * genau das wollte Inhaber nicht.
 */
const bmZeilenFuerProdukt = (p, stueck, vorhandene, jahr) => {
  const neu = [];
  for (let i = 0; i < Math.max(1, stueck); i++) {
    neu.push({
      fk_product: p.id ?? p.rowid,
      produkt: p,
      batch: bmNaechsteNummer(p, vorhandene.concat(neu), jahr),
      eatby: "",
      manufacturing_date: "",
      qc_frequency: "",
      einbauposition: "",
      // Verfallsdatum ist an diesen Artikeln Pflicht (Verbandkaesten):
      // ohne es ist das Etikett sinnlos.
      verfallPflicht: Number(p.sell_or_eat_by_mandatory) === 2,
    });
  }
  return neu;
};

/**
 * Legt die Lose an und druckt. Gibt zurueck, was angelegt wurde — auch wenn es
 * unterwegs schiefgeht: was schon in Dolibarr steht, bleibt stehen, sonst
 * staenden halbe Lose ohne Etikett herum.
 */
async function bmAnlegenUndDrucken(api, zeilen, produkte, showToast) {
  const angelegt = [];
  try {
    for (const z of zeilen) {
      const token = bmToken();
      // Der Code gehoert ins Extrafield `bm_token`, nicht in `barcode`:
      // Dolibarrs /productlots schreibt die Barcode-Spalte nicht (POST und
      // PUT geben 200 zurueck und lassen sie NULL, 12.09.2026 nachgemessen).
      // Wer das aendert, druckt Etiketten, die sich nicht aufloesen lassen.
      const koerper = {
        fk_product: z.fk_product,
        batch: z.batch,
        array_options: { options_bm_token: token },
      };
      if (z.eatby) koerper.eatby = z.eatby;
      if (z.manufacturing_date) koerper.manufacturing_date = z.manufacturing_date;
      if (z.qc_frequency) koerper.qc_frequency = Number(z.qc_frequency);
      if (z.einbauposition) koerper.array_options.options_einbauposition = z.einbauposition;
      await api.createLot(koerper);
      angelegt.push({ ...koerper });
    }
  } catch (e) {
    showToast(`${angelegt.length} von ${zeilen.length} angelegt, dann: ${doliError(e) || e?.message || e}`, "error");
    if (angelegt.length) await etikettenDrucken(angelegt, produkte, showToast);
    return null;
  }
  showToast(`${angelegt.length} Stück angelegt.`);
  await etikettenDrucken(angelegt, produkte, showToast);
  return angelegt;
}

/** Die Felder je Stueck. In beiden Masken dieselben. */
function EtikettenZeile({ z, setze }) {
  return (
    <div className="field-group" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
      <div style={{ fontWeight: 600 }}>{z.batch}</div>
      <div className="hint" style={{ marginBottom: 6 }}>{z.produkt?.label}</div>
      <label>Verfällt am {z.verfallPflicht && <span style={{ color: "var(--danger)" }}>*</span>}
        <input type="date" value={z.eatby} onChange={(e) => setze("eatby", e.target.value)} />
      </label>
      <label>Herstelldatum / DOT
        <input type="date" value={z.manufacturing_date} onChange={(e) => setze("manufacturing_date", e.target.value)} />
      </label>
      <label>Prüfintervall (Tage)
        <input type="number" min="0" placeholder="365 = jährlich" value={z.qc_frequency}
          onChange={(e) => setze("qc_frequency", e.target.value)} />
      </label>
      <label>Einbauposition
        <select value={z.einbauposition} onChange={(e) => setze("einbauposition", e.target.value)}>
          <option value="">—</option>
          <option value="VL">Vorne links</option>
          <option value="VR">Vorne rechts</option>
          <option value="HL">Hinten links</option>
          <option value="HR">Hinten rechts</option>
          <option value="ER">Ersatzrad</option>
        </select>
      </label>
    </div>
  );
}

function EtikettenModal({ api, inv, showToast, onClose }) {
  const [produkte, setProdukte] = useState([]);
  const [zeilen, setZeilen] = useState([]);
  const [laden, setLaden] = useState(true);
  const [speichern, setSpeichern] = useState(false);

  useEffect(() => {
    let weg = false;
    (async () => {
      try {
        const [ps, lose] = await Promise.all([
          api.getProducts().catch(() => []),
          api.getLots().catch(() => []),
        ]);
        if (weg) return;
        const liste = Array.isArray(ps) ? ps : [];
        setProdukte(liste);
        const nachId = new Map(liste.map((p) => [String(p.id ?? p.rowid), p]));
        const jahr = new Date().getFullYear();
        // Je Stück eine Zeile: aus Menge 4 werden vier Reifen, nicht ein
        // Sammelposten. Ohne das gäbe es wieder nur einen Code für alle vier.
        const vorhandene = Array.isArray(lose) ? lose.slice() : [];
        const neu = [];
        for (const z of inv.lines || []) {
          const p = nachId.get(String(z.fk_product));
          if (!p || !Number(p.tobatch)) continue;
          neu.push(...bmZeilenFuerProdukt(p, Math.round(Number(z.qty) || 1), vorhandene.concat(neu), jahr));
        }
        setZeilen(neu);
      } finally { if (!weg) setLaden(false); }
    })();
    return () => { weg = true; };
  }, [api, inv]);

  const setze = (i, feld, wert) => setZeilen((zs) => zs.map((z, k) => (k === i ? { ...z, [feld]: wert } : z)));

  const anlegenUndDrucken = async () => {
    const fehlt = zeilen.find((z) => z.verfallPflicht && !z.eatby);
    if (fehlt) { showToast(`${fehlt.batch}: Verfallsdatum fehlt`, "error"); return; }
    setSpeichern(true);
    const angelegt = await bmAnlegenUndDrucken(api, zeilen, produkte, showToast);
    if (angelegt) onClose(true); else setSpeichern(false);
  };

  return (
    <div className="modal-backdrop" onClick={() => !speichern && onClose(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Etiketten drucken</h3>
        {laden ? <div className="loading"><div className="spinner" /> Lade…</div>
          : !zeilen.length ? (
            <div className="empty-state">
              <p>Auf dieser Rechnung steht kein Artikel mit Stück-Führung.</p>
              <p className="hint">Stück-Führung wird am Artikel eingeschaltet (Chargen/Seriennummer).
                Sie lohnt sich dort, wo gleiche Teile unterscheidbar bleiben müssen — Reifen,
                Akkus, Verbandkästen, PSA.</p>
            </div>
          ) : (<>
            <p className="hint" style={{ marginBottom: 10 }}>
              Je Stück ein eigener Code. Der Code auf dem Etikett ist eine
              undurchsichtige Nummer — er verrät nichts und lässt sich nur über
              diese App auflösen.
            </p>
            {zeilen.map((z, i) => (
              <EtikettenZeile key={i} z={z} setze={(feld, wert) => setze(i, feld, wert)} />
            ))}
          </>)}
        <div className="action-row action-row-2" style={{ marginTop: 12 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => onClose(false)} disabled={speichern}>Abbrechen</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={anlegenUndDrucken} disabled={speichern || !zeilen.length}>
            {speichern ? "…" : `${zeilen.length} Etikett${zeilen.length === 1 ? "" : "en"} drucken`}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Stuecke fuer **Altbestand** anlegen — die Reifen und Akkus, die schon im
 * Schuppen liegen, bevor es die Etiketten gab. Ueber die Lieferantenrechnung
 * kommen nur Neuzugaenge; ohne diese Maske bliebe der halbe Bestand ohne Code.
 *
 * Bewusst zweistufig: erst Artikel und Stueckzahl, dann die Felder je Stueck.
 * Wer zehn Reifen auf einmal anlegt, will nicht zehnmal dasselbe Formular
 * ausfuellen, bevor er ueberhaupt weiss, ob die Nummern stimmen.
 */
function BestandEtikettModal({ api, showToast, onClose }) {
  const [produkte, setProdukte] = useState([]);
  const [lose, setLose] = useState([]);
  const [laden, setLaden] = useState(true);
  const [speichern, setSpeichern] = useState(false);
  const [produktId, setProduktId] = useState("");
  const [stueck, setStueck] = useState(1);
  const [zeilen, setZeilen] = useState([]);

  useEffect(() => {
    let weg = false;
    (async () => {
      try {
        const [ps, ls] = await Promise.all([
          api.getProducts().catch(() => []),
          api.getLots().catch(() => []),
        ]);
        if (weg) return;
        setProdukte(Array.isArray(ps) ? ps : []);
        setLose(Array.isArray(ls) ? ls : []);
      } finally { if (!weg) setLaden(false); }
    })();
    return () => { weg = true; };
  }, [api]);

  // Nur Artikel mit Stueck-Fuehrung. Fuer alles andere kennt Dolibarr kein Los,
  // ein Etikett haette nichts, worauf es zeigen koennte.
  const auswahl = useMemo(
    () => produkte.filter((p) => Number(p.tobatch) > 0)
      .sort((a, b) => String(a.label || "").localeCompare(String(b.label || ""), "de")),
    [produkte],
  );

  const weiter = () => {
    const p = auswahl.find((x) => String(x.id ?? x.rowid) === String(produktId));
    if (!p) { showToast("Kein Artikel gewählt", "error"); return; }
    const n = Math.min(50, Math.max(1, Math.round(Number(stueck) || 1)));
    setZeilen(bmZeilenFuerProdukt(p, n, lose, new Date().getFullYear()));
  };

  const setze = (i, feld, wert) => setZeilen((zs) => zs.map((z, k) => (k === i ? { ...z, [feld]: wert } : z)));

  const anlegenUndDrucken = async () => {
    const fehlt = zeilen.find((z) => z.verfallPflicht && !z.eatby);
    if (fehlt) { showToast(`${fehlt.batch}: Verfallsdatum fehlt`, "error"); return; }
    setSpeichern(true);
    const angelegt = await bmAnlegenUndDrucken(api, zeilen, produkte, showToast);
    if (angelegt) onClose(true); else setSpeichern(false);
  };

  return (
    <div className="modal-backdrop" onClick={() => !speichern && onClose(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Stück anlegen</h3>
        {laden ? <div className="loading"><div className="spinner" /> Lade…</div>
          : !zeilen.length ? (<>
            <p className="hint" style={{ marginBottom: 10 }}>
              Für Bestand, der schon da ist. Je Stück entsteht eine eigene
              Nummer mit eigenem Code — vier Reifen sind vier Stücke, kein
              Sammelposten.
            </p>
            {!auswahl.length ? (
              <div className="empty-state">
                <p>Kein Artikel mit Stück-Führung.</p>
                <p className="hint">Die schaltet man am Artikel ein (Chargen/Seriennummer).</p>
              </div>
            ) : (<>
              <label>Artikel
                <select value={produktId} onChange={(e) => setProduktId(e.target.value)}>
                  <option value="">— wählen —</option>
                  {auswahl.map((p) => (
                    <option key={p.id ?? p.rowid} value={p.id ?? p.rowid}>{p.label || p.ref}</option>
                  ))}
                </select>
              </label>
              <label>Wie viele Stück?
                <input type="number" min="1" max="50" value={stueck}
                  onChange={(e) => setStueck(e.target.value)} />
              </label>
            </>)}
          </>) : (<>
            <p className="hint" style={{ marginBottom: 10 }}>
              {zeilen.length} Stück · {zeilen[0].produkt?.label}
            </p>
            {zeilen.map((z, i) => (
              <EtikettenZeile key={i} z={z} setze={(feld, wert) => setze(i, feld, wert)} />
            ))}
          </>)}
        <div className="action-row action-row-2" style={{ marginTop: 12 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} disabled={speichern}
            onClick={() => (zeilen.length ? setZeilen([]) : onClose(false))}>
            {zeilen.length ? "Zurück" : "Abbrechen"}
          </button>
          {zeilen.length ? (
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={anlegenUndDrucken} disabled={speichern}>
              {speichern ? "…" : `${zeilen.length} Etikett${zeilen.length === 1 ? "" : "en"} drucken`}
            </button>
          ) : (
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={weiter} disabled={!produktId || !auswahl.length}>
              Weiter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Die Warnung, um die es Inhaber ging: welches Stück läuft ab, welches ist nie
 * geprüft worden. Dolibarr kennt die Daten, meldet sich aber nie von selbst.
 *
 * Die Liste zeigt standardmäßig **nur** das Auffällige. Eine Liste, in der
 * auch das Unauffällige steht, wird nicht gelesen — und genau die Stücke mit
 * der härtesten Anforderung (PSA gegen Absturz, jährliche Sachkundigenprüfung)
 * gingen darin unter.
 */
function BetriebsmittelPage({ api, showToast, onBack }) {
  const [lose, setLose] = useState([]);
  const [produkte, setProdukte] = useState([]);
  const [laden, setLaden] = useState(true);
  const [alle, setAlle] = useState(false);
  const [arbeitet, setArbeitet] = useState(null);
  const [showAnlegen, setShowAnlegen] = useState(false);
  const heute = todayISO();

  const laden0 = useCallback(async () => {
    setLaden(true);
    try {
      const [ls, ps] = await Promise.all([api.getLots().catch(() => []), api.getProducts().catch(() => [])]);
      const liste = Array.isArray(ls) ? ls : [];
      setLose(liste);
      setProdukte(Array.isArray(ps) ? ps : []);
      bmStandSchreiben({ offen: bmFaellige(liste, heute).length, stand: heuteIso() });
    } finally { setLaden(false); }
  }, [api, heute]);
  useEffect(() => { laden0(); }, [laden0]);

  const nachId = new Map(produkte.map((p) => [String(p.id ?? p.rowid), p]));
  const faellig = bmFaellige(lose, heute);
  const sichtbar = alle
    ? lose.map((l) => ({ ...l, status: bmStatus(l, heute) }))
    : faellig;

  /** „Heute geprüft" — der häufigste Handgriff, deshalb ein Knopf, kein Formular. */
  const geprueft = async (los) => {
    setArbeitet(los.id ?? los.rowid);
    try {
      await api.updateLot(los.id ?? los.rowid, { array_options: { options_letzte_pruefung: heute } });
      showToast(`${los.batch}: Prüfung auf heute gesetzt.`);
      await laden0();
    } catch (e) { showToast(doliError(e) || "Konnte die Prüfung nicht eintragen", "error"); }
    finally { setArbeitet(null); }
  };

  return (
    <div className="main">
      <div className="page-header">
        <div className="back-btn" onClick={onBack}><Icon name="back" size={20} /></div>
        <h2>Betriebsmittel</h2>
      </div>

      {laden ? <div className="loading"><div className="spinner" /> Lade…</div> : (<>
        {faellig.length > 0 ? (
          <div className="gbu-warn" style={{ marginBottom: 12 }}>
            <Icon name="shield" size={16} />
            <span><strong>{faellig.length}</strong> {faellig.length === 1 ? "Stück braucht" : "Stück brauchen"} Aufmerksamkeit —
              abgelaufen, nie geprüft oder demnächst fällig (Vorwarnung {BM_VORWARNUNG_TAGE} Tage).</span>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 12 }}><p>Keine Frist läuft ab.</p></div>
        )}

        <div className="action-row action-row-2" style={{ marginBottom: 12 }}>
          <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setAlle((a) => !a)}>
            {alle ? "Nur Fälliges zeigen" : `Alle ${lose.length} Stücke zeigen`}
          </button>
          {/* Fuer Bestand, der schon da ist — ueber die Lieferantenrechnung
              kommen nur Neuzugaenge. */}
          <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setShowAnlegen(true)}>
            <Icon name="barcode" size={14} /> Stück anlegen
          </button>
        </div>

        {!sichtbar.length ? <div className="empty-state"><p>Nichts anzuzeigen.</p></div> : sichtbar.map((los) => {
          const p = nachId.get(String(los.fk_product));
          const farbe = EW_STUFE_FARBE[los.status.stufe] || {};
          const id = los.id ?? los.rowid;
          return (
            <div key={id} className="list-card">
              <div className="list-card-main">
                <div className="list-card-title">{los.batch}</div>
                <div className="list-card-sub">{p?.label || `Artikel ${los.fk_product}`}</div>
                <div className="list-card-sub" style={{ color: farbe.fg || "var(--text2)" }}>
                  {BM_STUFEN_TEXT[los.status.stufe] || los.status.stufe}
                  {los.status.grund ? ` · ${los.status.grund}` : ""}
                  {los.status.faellig ? ` · ${los.status.faellig}` : ""}
                </div>
                {/* Alle Fristen, nicht nur die schärfste: sonst sieht man die
                    zweite erst, wenn die erste erledigt ist. */}
                {bmFristen(los, heute).length > 1 && (
                  <div className="hint">
                    {bmFristen(los, heute).map((f) => `${f.grund}: ${f.faellig || "offen"}`).join(" · ")}
                  </div>
                )}
              </div>
              <div className="action-row action-row-2">
                <button className="btn btn-ghost btn-sm" disabled={arbeitet === id} onClick={() => geprueft(los)}>
                  <Icon name="check" size={14} /> Heute geprüft
                </button>
                <button className="btn btn-ghost btn-sm" disabled={arbeitet === id}
                  onClick={() => etikettenDrucken([los], produkte, showToast)}>
                  <Icon name="barcode" size={14} /> Etikett
                </button>
              </div>
            </div>
          );
        })}
      </>)}

      {showAnlegen && (
        <BestandEtikettModal api={api} showToast={showToast}
          onClose={(neu) => { setShowAnlegen(false); if (neu) laden0(); }} />
      )}
    </div>
  );
}

function SupplierInvoiceDetail({ api, data, me, onBack, showToast }) {
  const [inv, setInv] = useState(data);
  const [suppliers, setSuppliers] = useState([]);
  const [docs, setDocs] = useState([]);
  const [docsGeladen, setDocsGeladen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const loadDocs = useCallback(() => {
    api.getDocuments("supplier_invoice", inv.id).then(d => setDocs(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setDocsGeladen(true));
  }, [api, inv.id]);

  useEffect(() => {
    api.getThirdparties("supplier").then(s => setSuppliers(Array.isArray(s) ? s : [])).catch(() => {});
    loadDocs();
    // Aus der Liste kommt die Rechnung ohne Zeilen → einmal komplett nachladen.
    api.getSupplierInvoice(inv.id).then(d => { if (d) setInv(d); }).catch(() => {});
  }, [api, inv.id, loadDocs]);

  const reload = () => api.getSupplierInvoice(inv.id).then(d => setInv(d)).catch(() => {});
  const statusMap = { 0:["Entwurf","badge-draft"], 1:["Offen","badge-open"], 2:["Bezahlt","badge-paid"], 3:["Storno","badge-cancelled"] };
  const [label, cls] = statusMap[inv.statut] || ["–", "badge-draft"];
  const suppId = inv.socid || inv.fk_soc || inv.fourn_id || inv.fk_fourn;
  const supp = suppliers.find(s => String(s.id) === String(suppId));

  const validate = async () => {
    if (istBankEntwurf(inv) && docs.length === 0) { showToast("Erst den Beleg anhängen, dann validieren", "error"); return; }
    setLoading(true);
    try { await api.validateSupplierInvoice(inv.id); await reload(); showToast("Lieferantenrechnung validiert!"); }
    catch (err) { showToast(doliError(err) || "Validieren fehlgeschlagen", "error"); }
    finally { setLoading(false); }
  };

  const remove = async () => {
    if (!window.confirm("Diese Lieferantenrechnung wirklich löschen?")) return;
    setLoading(true);
    try { await api.deleteSupplierInvoice(inv.id); showToast("Lieferantenrechnung gelöscht!"); onBack(); }
    catch (err) { showToast(doliError(err) || "Löschen fehlgeschlagen", "error"); setLoading(false); }
  };

  // Zahlung erfassen / Abhaken — gleiche Rechte- und Statuslogik wie bei der
  // Kundenrechnung (InvoiceDetail).
  const [showZahlung, setShowZahlung] = useState(false);
  // Etiketten für Betriebsmittel. Der Knopf steht immer da: ob auf der
  // Rechnung überhaupt ein Artikel mit Stück-Führung steht, weiß erst das
  // Modal — dafür müsste die Artikelliste sonst bei jedem Aufruf der Detail-
  // seite geladen werden, nur um einen Knopf auszublenden.
  const [showEtiketten, setShowEtiketten] = useState(false);
  const darfZahlen = Number(inv.statut) === 1 && me?.canRecordPayments;
  const abhaken = async () => {
    if (!window.confirm("Ohne Zahlungserfassung als bezahlt abhaken? Es wird KEINE Zahlung und keine Kontobewegung gebucht — nur der Status wechselt.")) return;
    setLoading(true);
    try { await api.setSupplierInvoicePaid(inv.id); await reload(); showToast("Rechnung abgehakt."); }
    catch (err) { showToast(doliError(err) || "Abhaken fehlgeschlagen", "error"); }
    finally { setLoading(false); }
  };

  // Bearbeiten: Zeilen-Änderungen erlaubt Dolibarr nur im Entwurf → validierte
  // Rechnung erst zurücksetzen (danach unten neu validieren).
  const startEdit = async () => {
    if (Number(inv.statut) === 1) {
      if (!window.confirm("Die Rechnung ist validiert. Zum Bearbeiten wird sie auf „Entwurf“ zurückgesetzt – danach bitte erneut validieren. Fortfahren?")) return;
      setLoading(true);
      try { await api.setSupplierInvoiceToDraft(inv.id); await reload(); }
      catch (err) { showToast(doliError(err) || "Zurücksetzen auf Entwurf fehlgeschlagen", "error"); setLoading(false); return; }
      setLoading(false);
    }
    setShowEdit(true);
  };

  return (
    <div className="main">
      <div className="page-header">
        <div className="back-btn" onClick={onBack}><Icon name="back" size={20}/></div>
        <h2>Lieferantenrechnung</h2>
        <span className={`badge ${cls}`}>{label}</span>
      </div>
      {docsGeladen && docs.length === 0 && Number(inv.statut) !== 3 && (
        <div style={{ border: "1px solid var(--warn)", color: "var(--warn)", borderRadius: "var(--radius-sm)", padding: "10px 12px", marginBottom: 12, fontSize: 13 }}>
          {istBankEntwurf(inv) ? "Aus dem Kontoauszug angelegt – ohne Beleg lässt sich diese Rechnung nicht validieren." : "Kein Beleg angehängt."}
        </div>
      )}
      <div className="detail-hero">
        <div className="detail-ref">{inv.ref || inv.ref_supplier || `LF-${inv.id}`}</div>
        <div className="detail-client">{supp?.name || inv.nom || "—"}</div>
        <div className="detail-amount">{fmtMoney(inv.total_ttc)}</div>
        <div style={{marginTop:16}}>
          <div className="detail-row"><span className="lbl">Lieferanten-Nr.</span><span className="val">{inv.ref_supplier || "—"}</span></div>
          <div className="detail-row"><span className="lbl">Netto</span><span className="val">{fmtMoney(inv.total_ht)}</span></div>
          <div className="detail-row"><span className="lbl">MwSt</span><span className="val">{fmtMoney(inv.total_tva)}</span></div>
          <div className="detail-row"><span className="lbl">Datum</span><span className="val">{fmtDate(inv.date)}</span></div>
          <div className="detail-row"><span className="lbl">Fällig</span><span className="val">{fmtDate(inv.date_echeance || inv.date_lim_reglement)}</span></div>
          <ProjectLinkEditor
            api={api}
            docId={inv.id}
            currentProjectId={inv.fk_project || inv.fk_projet || inv.projectid || ""}
            updateFn={(id, data) => api.updateSupplierInvoice(id, data)}
            onUpdated={() => api.getSupplierInvoice(inv.id).then(d => { if(d) setInv(d); }).catch(() => {})}
            showToast={showToast}
          />
        </div>
      </div>

      {Array.isArray(inv.lines) && inv.lines.length > 0 && (
        <div className="detail-hero" style={{marginTop:12}}>
          <div className="section-label">Positionen</div>
          {inv.lines.map((l, i) => {
            const qty = parseFloat(l.qty || 0);
            const gross = parseFloat(l.total_ttc ?? 0) || (parseFloat(l.pu_ht ?? l.subprice ?? 0) * (1 + parseFloat(l.tva_tx || 0) / 100) * qty);
            const konto = me?.canViewAccounting ? ventilationKonto(l) : null;
            return (
              <div key={l.id || l.rowid || i}>
                <div className="detail-row">
                  <span className="lbl" style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"60%"}}>{stripHtml(l.description || l.desc || l.product_label || "Position")}</span>
                  <span className="val">{qty} × · {fmtMoney(gross)}</span>
                </div>
                {konto && (
                  <div style={{fontSize:11.5, color:"var(--text3)", margin:"-4px 0 6px", textAlign:"right"}}>
                    Konto {konto.number}{konto.label ? ` · ${konto.label}` : ""}
                  </div>
                )}
              </div>
            );
          })}
          {me?.canViewAccounting && !inv.lines.some((l) => ventilationKonto(l)) && (
            <div style={{fontSize:12, color:"var(--text3)", marginTop:6}}>Noch keinem Buchungskonto zugeordnet.</div>
          )}
        </div>
      )}

      {Number(inv.statut) === 0 && (
        <div className="card" style={{marginTop:12}}>
          <div className="card-title">KI-Prüfung</div>
          {pruefungSteht(inv)
            ? <pre style={{whiteSpace:"pre-wrap", fontSize:12, margin:0}}>{pruefungText(inv)}</pre>
            : <div style={{fontSize:12, color:"var(--text3)"}}>Läuft noch. Der Prüfer auf Giza sieht sich den Beleg stündlich an; danach lässt er sich freigeben.</div>}
        </div>
      )}

      <div className="action-row action-row-2">
        {Number(inv.statut) === 0 && me?.canValidateSupplierInvoices && (pruefungSteht(inv)
          ? <button className="btn btn-success" onClick={validate} disabled={loading}><Icon name="validate" size={16}/> Validieren</button>
          : <button className="btn btn-success" disabled title="Die KI-Prüfung läuft noch — der Beleg ist danach freizugeben."><Icon name="validate" size={16}/> Prüfung läuft …</button>)}
        {darfZahlen && <button className="btn btn-success" onClick={()=>setShowZahlung(true)} disabled={loading}><Icon name="validate" size={16}/> Zahlung erfassen</button>}
        {darfZahlen && <button className="btn btn-ghost" onClick={abhaken} disabled={loading}><Icon name="validate" size={16}/> Abhaken ohne Zahlung</button>}
        {[0,1].includes(Number(inv.statut)) && <button className="btn btn-secondary" onClick={startEdit} disabled={loading}><Icon name="edit" size={16}/> Bearbeiten</button>}
        {[0,1].includes(Number(inv.statut)) && <button className="btn btn-danger" onClick={remove} disabled={loading}><Icon name="trash" size={16}/> Löschen</button>}
        <button className="btn btn-secondary" onClick={() => setShowEtiketten(true)} disabled={loading}><Icon name="barcode" size={16}/> Etiketten drucken</button>
      </div>

      {showZahlung && (
        <ZahlungDialog api={api} inv={inv} art="lieferant" showToast={showToast}
          onClose={(gebucht) => { setShowZahlung(false); if (gebucht) reload(); }} />
      )}
      {showEtiketten && (
        <EtikettenModal api={api} inv={inv} showToast={showToast} onClose={() => setShowEtiketten(false)} />
      )}

      <FileUploadSection api={api} modulepart="supplier_invoice" docid={inv.id} ref_doc={inv.ref || inv.ref_supplier || `LF-${inv.id}`} docs={docs}
        onUploaded={loadDocs} showToast={showToast} />

      {showEdit && <SupplierInvoiceEditModal api={api} invoiceId={inv.id} lieferant={supp?.name || inv.nom}
        onClose={() => setShowEdit(false)}
        onSaved={() => { setShowEdit(false); reload(); showToast("Rechnung aktualisiert!"); }}
        showToast={showToast} />}
    </div>
  );
}

// ─── Supplier Invoice Edit (Positionen + Kopf-Daten nachträglich ändern) ────
function SupplierInvoiceEditModal({ api, invoiceId, lieferant, onClose, onSaved, showToast }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refSupplier, setRefSupplier] = useState("");
  const [date, setDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(todayISO());
  const [lines, setLines] = useState([]);
  const orig = useRef({ lines: [], refSupplier: "", date: "", dueDate: "" });
  const savingRef = useRef(false);
  const [kontoCfg] = useState(loadKontoConfig);
  const [prodAcc, setProdAcc] = useState({});
  const kontoMem = useRef(loadKontoMemory());
  // Mit dem Serverstand abgleichen (Task 8) — läuft nebenher; ohne Netz
  // bleibt der synchron gestartete lokale Stand einfach stehen.
  useEffect(() => { kontoMemAbgleichen().then((m) => { kontoMem.current = m; }); }, []);

  // Buchungskonto je Position: gesetztes fk_code_ventilation → am Artikel
  // hinterlegtes Konto → gemerkte Zuordnung → Stichwort-Vorschlag.
  const kontoOfLine = (l) => {
    if (l.account) return { number: l.account, quelle: "" };
    const v = String(l.fk_code_ventilation || "");
    if (v.startsWith("10050") && v.length > 5) return { number: v.slice(5), quelle: "" };
    const pid = l.fk_product ? String(l.fk_product) : "";
    const amArtikel = pid && (prodAcc[pid] || kontoMem.current[pid]);
    if (amArtikel) return { number: String(amArtikel), quelle: "vom Artikel" };
    return { number: suggestKonto(l.desc, kontoCfg), quelle: "Vorschlag" };
  };

  const tsToISO = (ts) => ts ? new Date(ts * 1000).toISOString().slice(0, 10) : todayISO();

  useEffect(() => {
    (async () => {
      try {
        const d = await api.getSupplierInvoice(invoiceId);
        const rs = d.ref_supplier || "";
        const di = tsToISO(d.date);
        const du = tsToISO(d.date_echeance || d.date_lim_reglement);
        // Preis wird wie im Anlege-Formular als BRUTTO/Stück angezeigt.
        const ls = (Array.isArray(d.lines) ? d.lines : []).map(l => {
          const tva = parseFloat(l.tva_tx || 0);
          const net = parseFloat(l.pu_ht ?? l.subprice ?? 0);
          return {
            lineid: l.id || l.rowid,
            desc: stripHtml(l.description || l.desc || ""),
            qty: parseFloat(l.qty || 0),
            price: Math.round(net * (1 + tva / 100) * 100) / 100,
            tva,
            remise_percent: parseFloat(l.remise_percent || 0),
            fk_product: l.fk_product || "",
            product_type: l.product_type ?? 0,
            fk_code_ventilation: l.fk_code_ventilation || "",
          };
        });
        setRefSupplier(rs); setDate(di); setDueDate(du); setLines(ls);
        orig.current = { lines: JSON.parse(JSON.stringify(ls)), refSupplier: rs, date: di, dueDate: du };
        // Konten der verknüpften Artikel für den Vorschlag (Fehler egal)
        api.getProducts().then((ps) => {
          const m = {};
          (Array.isArray(ps) ? ps : []).forEach((p) => { if (p.accountancy_code_buy) m[String(p.id)] = p.accountancy_code_buy; });
          setProdAcc(m);
        }).catch(() => {});
      } catch (err) {
        showToast(doliError(err) || "Rechnung konnte nicht geladen werden", "error");
        onClose();
      } finally { setLoading(false); }
    })();
  }, [api, invoiceId]);

  const updLine = (i, k, v) => setLines(l => l.map((li, idx) => idx === i ? { ...li, [k]: v } : li));
  const delLine = (i) => setLines(l => l.filter((_, idx) => idx !== i));
  const addLine = () => setLines(l => [...l, { lineid: null, desc: "", qty: 1, price: 0, tva: 19, remise_percent: 0, fk_product: "", product_type: 0 }]);

  const total = lines.reduce((s, l) => s + parseFloat(l.qty || 0) * parseFloat(l.price || 0) * (1 - parseFloat(l.remise_percent || 0) / 100), 0);

  const lineBody = (l) => {
    const tva = parseFloat(l.tva || 0);
    const grossUnit = parseFloat(l.price || 0);
    const netUnit = tva > 0 ? grossUnit / (1 + tva / 100) : grossUnit;
    return {
      description: l.desc,
      pu_ht: Math.round(netUnit * 100000) / 100000, // netto (HT), 5 NK
      tva_tx: tva,
      qty: parseFloat(l.qty || 0),
      remise_percent: parseFloat(l.remise_percent || 0),
      price_base_type: "HT",
      product_type: l.product_type ?? 0,
      ...(l.fk_product ? { fk_product: parseInt(l.fk_product) } : {}),
    };
  };

  const save = async () => {
    if (savingRef.current) return;
    if (lines.some(l => !String(l.desc || "").trim())) { showToast("Jede Position braucht eine Beschreibung", "error"); return; }
    if (!lines.length) { showToast("Mindestens eine Position nötig", "error"); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      // 1) Kopf-Daten nur schicken, wenn geändert
      const head = {};
      if (refSupplier.trim() !== orig.current.refSupplier) head.ref_supplier = refSupplier.trim() || `o.Nr.-${Date.now()}`;
      if (date !== orig.current.date) head.date = Math.floor(new Date(date).getTime() / 1000);
      if (dueDate !== orig.current.dueDate) head.date_lim_reglement = Math.floor(new Date(dueDate).getTime() / 1000);
      if (Object.keys(head).length) await api.updateSupplierInvoice(invoiceId, head);

      // 2) Gelöschte Zeilen entfernen
      const keptIds = new Set(lines.filter(l => l.lineid).map(l => String(l.lineid)));
      for (const ol of orig.current.lines) {
        if (ol.lineid && !keptIds.has(String(ol.lineid))) await api.deleteSupplierInvoiceLine(invoiceId, ol.lineid);
      }

      // 3) Geänderte Zeilen aktualisieren, neue anlegen
      for (const l of lines) {
        const kontoNeu = l.account && l.account !== kontoOfLine({ ...l, account: "" }).number ? l.account : null;
        if (l.lineid) {
          const ol = orig.current.lines.find(o => String(o.lineid) === String(l.lineid));
          const changed = !ol || ol.desc !== l.desc || parseFloat(ol.qty) !== parseFloat(l.qty || 0)
            || parseFloat(ol.price) !== parseFloat(l.price || 0) || parseFloat(ol.tva) !== parseFloat(l.tva || 0)
            || parseFloat(ol.remise_percent) !== parseFloat(l.remise_percent || 0);
          // Konto lässt sich nur beim Anlegen setzen (Dolibarr ignoriert es im
          // PUT) → geändertes Konto heißt: Zeile neu schreiben statt updaten.
          if (l.account && (kontoNeu || changed)) {
            const body = lineBody(l);
            await setLineKonto(api, invoiceId, { ...l, id: l.lineid }, l.account,
              { desc: body.description, qty: body.qty, pu_ht: body.pu_ht, tva_tx: body.tva_tx, remise_percent: body.remise_percent, lieferant });
          } else if (changed) {
            await api.updateSupplierInvoiceLine(invoiceId, l.lineid, lineBody(l));
          }
        } else {
          await api.addSupplierInvoiceLine(invoiceId, {
            ...lineBody(l),
            ...(l.account ? { fk_code_ventilation: parseInt("10050" + l.account, 10) } : {}),
          });
          if (l.account && l.fk_product) rememberKonto(l.fk_product, l.account, lieferant);
        }
      }
      onSaved();
    } catch (err) {
      console.error("Lieferantenrechnung bearbeiten fehlgeschlagen", err);
      showToast(doliError(err) || "Speichern fehlgeschlagen", "error");
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal">
        <div className="modal-handle"/>
        <div className="modal-title">Lieferantenrechnung bearbeiten</div>
        {loading ? <div className="loading"><div className="spinner"/> Lade…</div> : <>
          <div className="field-group mb16">
            <label>Rechnungs-Nr. des Lieferanten</label>
            <input type="text" value={refSupplier} onChange={e => setRefSupplier(e.target.value)} placeholder="z. B. RE-2026-0815 (vom Beleg)" />
          </div>
          <div className="form-row mb16">
            <div className="field-group"><label>Rechnungsdatum</label><input type="date" value={date} onChange={e => setDate(e.target.value)}/></div>
            <div className="field-group"><label>Fällig am</label><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/></div>
          </div>

          <div className="section-label">Positionen <span style={{fontWeight:400,color:"var(--text2)",fontSize:11}}>· Preis = Brutto/Stück</span></div>
          {lines.map((l, i) => (
            <div key={l.lineid || `new-${i}`} className="form-section" style={{marginBottom:10}}>
              <div className="field-group mb16">
                <label>Beschreibung</label>
                <input type="text" value={l.desc} onChange={e => updLine(i, "desc", e.target.value)} placeholder="Artikel / Leistung" />
              </div>
              <div className="form-row mb16">
                <div className="field-group"><label>Menge</label><input type="number" inputMode="decimal" step="any" value={l.qty} onChange={e => updLine(i, "qty", e.target.value)}/></div>
                <div className="field-group"><label>Brutto/Stück €</label><input type="number" inputMode="decimal" step="0.01" value={l.price} onChange={e => updLine(i, "price", e.target.value)}/></div>
              </div>
              <div className="form-row mb12">
                <div className="field-group"><label>MwSt %</label>
                  <select value={l.tva} onChange={e => updLine(i, "tva", e.target.value)}>
                    <option value={19}>19 %</option><option value={7}>7 %</option><option value={0}>0 %</option>
                  </select>
                </div>
                <div className="field-group" style={{display:"flex", alignItems:"flex-end"}}>
                  <button className="btn btn-danger btn-sm" style={{width:"100%"}} onClick={() => delLine(i)} disabled={lines.length <= 1}><Icon name="trash" size={14}/> Entfernen</button>
                </div>
              </div>
              {(() => {
                const k = kontoOfLine(l);
                const warn = belegWarnungen({ ...l, tva_tx: l.tva, pu_ht: parseFloat(l.price || 0) / (1 + parseFloat(l.tva || 0) / 100), total_ht: null }, k.number,
                  { bruttoGesamt: total, refSupplier });
                return (
                  <div className="field-group">
                    <label>Buchungskonto {k.quelle && <span style={{fontWeight:400,color:"var(--warn)",textTransform:"none",letterSpacing:0}}>· {k.quelle}, bitte bestätigen</span>}</label>
                    <select value={k.number} onChange={e => updLine(i, "account", e.target.value)}
                      style={{ borderColor: k.quelle ? "var(--warn)" : "var(--border)" }}>
                      {!kontoCfg.konten.some(x => x.number === k.number) && <option value={k.number}>{k.number}</option>}
                      {kontoCfg.konten.map(x => <option key={x.number} value={x.number}>{x.number} · {x.label}</option>)}
                    </select>
                    {warn.map((t, wi) => (
                      <div key={wi} style={{ fontSize: 11, color: "var(--warn)", marginTop: 4, display: "flex", gap: 4 }}>
                        <Icon name="warning" size={12} /><span>{t}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          ))}
          <button className="btn btn-secondary" style={{width:"100%", marginBottom:12}} onClick={addLine}><Icon name="plus" size={15}/> Position hinzufügen</button>
          <div className="line-total">Gesamt (brutto): {total.toFixed(2).replace(".", ",")} €</div>

          <div style={{display:"flex", gap:10, marginTop:16}}>
            <button className="btn btn-secondary" style={{flex:1}} onClick={onClose} disabled={saving}>Abbrechen</button>
            <button className="btn btn-primary" style={{flex:1}} onClick={save} disabled={saving}>
              {saving ? <><div className="spinner" style={{width:15,height:15}}/>Speichere...</> : "Speichern"}
            </button>
          </div>
        </>}
      </div>
    </div>
  );
}

// ─── OpenCV (lazy, nur für den Beleg-Scan) ──────────────────────────────────
let _cvPromise = null;
function loadOpenCv() {
  if (!_cvPromise) {
    _cvPromise = import("@techstark/opencv-js").then(async (mod) => {
      const cvModule = mod.default || mod;
      if (cvModule instanceof Promise) return await cvModule;
      if (cvModule.Mat) return cvModule;
      await new Promise((resolve) => { cvModule.onRuntimeInitialized = () => resolve(); });
      return cvModule;
    });
  }
  return _cvPromise;
}

/**
 * Holt OpenCV in einer ruhigen Minute nach, ohne den Start aufzuhalten.
 *
 * Der Brocken (15,5 MB) liegt seit 14.08.2026 nicht mehr im Vorab-Cache des
 * Service Workers — das kostete beim ersten Start jeder Fassung genau diese
 * 15,5 MB, waehrend die App hochkam. Ohne Ersatz waere aber das
 * **Offline-Scannen** kaputt: wer die neue Fassung im Hof laedt und drei
 * Stunden spaeter ohne Empfang einen Beleg aufnehmen will, haette einen toten
 * „Scannen"-Knopf — und das sieht nach kaputter App aus, nicht nach einer
 * Cache-Regel. Also: erst laufen lassen, dann in der Leerlaufzeit nachladen.
 * Der Abruf fuellt den Laufzeit-Cache des Service Workers (CacheFirst-Regel in
 * vite.config.js), danach ist der Scanner auch ohne Netz vollstaendig.
 *
 * Nur einmal je Sitzung, nur online, und nicht im Sparmodus des Netzes.
 */
let _cvVorgewaermt = false;
function opencvVorwaermen(fenster = typeof window !== "undefined" ? window : null) {
  if (_cvVorgewaermt || !fenster) return false;
  if (fenster.navigator?.onLine === false) return false;
  if (fenster.navigator?.connection?.saveData) return false;
  _cvVorgewaermt = true;
  const holen = () => { loadOpenCv().catch(() => { _cvVorgewaermt = false; }); };
  // requestIdleCallback kennt Safari lange nicht — der Wecker ist kein
  // Zusatz, sondern der einzige Weg auf einem Teil der Geraete.
  if (typeof fenster.requestIdleCallback === "function") fenster.requestIdleCallback(holen, { timeout: 15000 });
  else fenster.setTimeout(holen, 5000);
  return true;
}

// Punkte als [tl, tr, br, bl] ordnen (über Summe/Differenz der Koordinaten).
const cornerOrder = (pts) => {
  const bySum = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const tl = bySum[0], br = bySum[3];
  const rest = bySum.slice(1, 3).sort((a, b) => (a.y - a.x) - (b.y - b.x));
  return [tl, rest[0], br, rest[1]]; // tl, tr, br, bl
};
const ptDist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Erkennt das größte konvexe 4-Eck (Dokument) in einem Bild-Element.
// Gibt 4 Punkte in Bild-Pixelkoordinaten zurück oder null.
function detectDocumentQuad(cv, imgEl) {
  const maxDim = 900;
  const scale = Math.min(1, maxDim / Math.max(imgEl.naturalWidth, imgEl.naturalHeight));
  const w = Math.round(imgEl.naturalWidth * scale), h = Math.round(imgEl.naturalHeight * scale);
  const cnv = document.createElement("canvas"); cnv.width = w; cnv.height = h;
  cnv.getContext("2d").drawImage(imgEl, 0, 0, w, h);
  const src = cv.imread(cnv);
  const gray = new cv.Mat(), blur = new cv.Mat(), edges = new cv.Mat();
  const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
  const contours = new cv.MatVector(), hierarchy = new cv.Mat();
  let bestPts = null;
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 50, 150);
    cv.dilate(edges, edges, kernel);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    let bestArea = w * h * 0.2;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const approx = new cv.Mat();
      cv.approxPolyDP(c, approx, 0.02 * cv.arcLength(c, true), true);
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const area = Math.abs(cv.contourArea(approx));
        if (area > bestArea) {
          bestArea = area;
          bestPts = [];
          for (let k = 0; k < 4; k++) bestPts.push({ x: approx.data32S[k * 2] / scale, y: approx.data32S[k * 2 + 1] / scale });
        }
      }
      approx.delete(); c.delete();
    }
  } finally {
    src.delete(); gray.delete(); blur.delete(); edges.delete(); kernel.delete(); contours.delete(); hierarchy.delete();
  }
  return bestPts;
}

// Perspektivische Entzerrung + Graustufen mit lokalem Kontrast (CLAHE) → JPEG-Blob.
// Graustufen statt hartem Schwellwert: bewahrt feine Striche (Komma in „9,49") → bessere OCR.
function warpDocument(cv, imgEl, cornersPts) {
  const c = document.createElement("canvas"); c.width = imgEl.naturalWidth; c.height = imgEl.naturalHeight;
  c.getContext("2d").drawImage(imgEl, 0, 0);
  const [tl, tr, br, bl] = cornerOrder(cornersPts);
  const W = Math.round(Math.min(2400, Math.max(ptDist(br, bl), ptDist(tr, tl), 32)));
  const H = Math.round(Math.min(3200, Math.max(ptDist(tr, br), ptDist(tl, bl), 32)));
  const src = cv.imread(c);
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, W, 0, W, H, 0, H]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const dst = new cv.Mat(), gray = new cv.Mat(), proc = new cv.Mat();
  const out = document.createElement("canvas"); out.width = W; out.height = H;
  try {
    cv.warpPerspective(src, dst, M, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
    cv.cvtColor(dst, gray, cv.COLOR_RGBA2GRAY);
    let done = false;
    try { const clahe = new cv.CLAHE(2.5, new cv.Size(8, 8)); clahe.apply(gray, proc); clahe.delete(); done = true; }
    catch { /* CLAHE evtl. nicht verfügbar → einfache Kontrastspreizung */ }
    if (!done) cv.normalize(gray, proc, 0, 255, cv.NORM_MINMAX);
    cv.imshow(out, proc);
  } finally {
    src.delete(); srcTri.delete(); dstTri.delete(); M.delete(); dst.delete(); gray.delete(); proc.delete();
  }
  return new Promise(res => out.toBlob(b => res(b), "image/jpeg", 0.92));
}

// ─── Beleg-OCR (lokal, lazy geladen) ────────────────────────────────────────
// Rendert Seite 1 eines PDFs auf ein Canvas und gibt eine PNG-DataURL zurück.
async function pdfFirstPageToDataURL(file) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width; canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return canvas.toDataURL("image/png");
}

// Skaliert das Beleg-Bild vor der OCR hoch: Tesseract braucht große Glyphen — am echten
// toom-Bon las 1,0× GAR KEINEN Betrag, 1,6× dagegen „16,99" (Geräte-Experiment 2026-07-01).
async function upscaleForOcr(input) {
  const img = new Image();
  const url = (typeof input === "string") ? input : URL.createObjectURL(input);
  try {
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const maxDim = Math.max(img.naturalWidth, img.naturalHeight, 1);
    const scale = Math.min(1.8, Math.max(1, 5000 / maxDim));
    if (scale <= 1.05) return input;
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    const x = c.getContext("2d"); x.imageSmoothingEnabled = true; x.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } catch { return input; }
  finally { if (typeof input !== "string") URL.revokeObjectURL(url); }
}

// Führt Tesseract über ein Bild/PDF aus und liefert den Rohtext.
// Nutzt einen Worker mit Kassenbon-Seitenmodus (PSM 6 = einheitlicher Textblock);
// bei Problemen Fallback auf die einfache recognize().
async function runOcr(file, onProgress) {
  const T = (await import("tesseract.js")).default;
  const raw = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)
    ? await pdfFirstPageToDataURL(file) : file;
  const input = await upscaleForOcr(raw);
  const logger = m => { if (m.status === "recognizing text" && onProgress) onProgress(m.progress); };
  try {
    const worker = await T.createWorker("deu+eng", 1, { logger });
    try {
      await worker.setParameters({ tessedit_pageseg_mode: (T.PSM && T.PSM.SINGLE_BLOCK) || "6" });
      const { data } = await worker.recognize(input);
      return data.text || "";
    } finally { await worker.terminate(); }
  } catch {
    const { data } = await T.recognize(input, "deu+eng", { logger });
    return data.text || "";
  }
}

// Fuzzy-Artikel-Match für Beleg-Positionen: OCR-/Scan-Bezeichnungen ("Super E10 A")
// sollen vorhandene Dolibarr-Artikel ("Kraftstoff Super E10") treffen statt als
// Freitext zu landen oder Dubletten anzulegen (gleiche Idee wie find_product im
// Pipeline-Finisher). Token-Abdeckung in beide Richtungen; exakte Token zählen
// voll, reine Teilwort-Treffer halb ("Schrauben" matcht nicht "Schraubendreher").
function fuzzyFindProduct(desc, products) {
  const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9äöüß ]/g, " ").replace(/\s+/g, " ").trim();
  const toks = s => norm(s).split(" ").filter(t => t.length >= 2);
  const wanted = norm(desc);
  const wt = toks(desc);
  if (!wt.length) return null;
  const wLen = wt.reduce((s, t) => s + t.length, 0);
  let best = null, bestScore = 0;
  for (const p of products || []) {
    const label = norm(p.label);
    if (!label) continue;
    if (label === wanted || norm(p.ref) === wanted) return p;
    const ht = toks(p.label);
    const hLen = ht.reduce((s, t) => s + t.length, 0) || 1;
    let m = 0;
    for (const t of wt) {
      if (ht.includes(t)) { m += t.length; continue; }
      // Komposita: Grundwort steht im Deutschen am ENDE — Suffix-Treffer in
      // beide Richtungen ("Handschuhe"≙"Arbeitshandschuhe") zählen voll,
      // sonstige Teilworte ("Schrauben" in "Schraubendreher") nur halb
      const head = ht.find(h => h.endsWith(t) || t.endsWith(h));
      if (head) { m += Math.min(t.length, head.length); continue; }
      if (t.length >= 4 && label.includes(t)) m += t.length / 2;
    }
    if (!m) continue;
    const score = (m / wLen) * 0.7 + (m / hLen) * 0.3;
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return bestScore >= 0.55 ? best : null;
}

// Belegdatum aus OCR-Text: erster Treffer, der ein echtes und plausibles Datum
// ergibt. „Plausibel" heißt: nicht in der Zukunft (mehr als eine Woche, für
// vordatierte Rechnungen) und nicht älter als gut ein Jahr — ältere Belege
// kommen vor, aber dann trägt man das Datum von Hand nach, statt eine verlesene
// Jahreszahl ungeprüft zu buchen. `heute` ist Parameter, damit prüfbar.
export function belegDatum(text, heute = new Date()) {
  const grenzeAlt = new Date(heute.getTime() - 400 * 864e5);
  const grenzeNeu = new Date(heute.getTime() + 7 * 864e5);
  for (const m of String(text || "").matchAll(/(\d{2})[.\/]\s?(\d{2})[.\/]\s?(20\d{2})/g)) {
    const [tag, monat, jahr] = [+m[1], +m[2], +m[3]];
    if (monat < 1 || monat > 12 || tag < 1 || tag > 31) continue;
    const d = new Date(jahr, monat - 1, tag);
    if (d.getFullYear() !== jahr || d.getMonth() !== monat - 1 || d.getDate() !== tag) continue; // 31.02.
    if (d < grenzeAlt || d > grenzeNeu) continue;
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  return "";
}

// Template-Parser: nutzt die feste Bon-Struktur (Kopf → EAN-Artikel+STK-Zeile → SUMME → Zahlung).
function parseBelegText(text) {
  const out = { refSupplier:"", date:"", supplier:"", lines:[] };
  const rows = text.split(/\r?\n/).map(r=>r.trim()).filter(Boolean);
  const pm=(a,b)=>parseFloat(a.replace(/\s/g,"")+"."+b);
  // Geld: Komma-Dezimal darf von ".7"-Müll gefolgt sein (16, 99.78 → 16,99); Punkt-Dezimal nicht (Datum 27.06.).
  const moneyInLine=(r)=>{
    const collect=(re)=>{const a=[];for(const m of r.matchAll(re)){const end=m.index+m[0].length;if(r.slice(end).trimStart().startsWith("%"))continue;a.push({v:pm(m[1],m[2]),index:m.index,end});}return a;};
    const all=[...collect(/(\d{1,4}),\s?(\d{2})(?!\d)/g),...collect(/(\d{1,4})\.\s?(\d{2})(?![\d.])/g)].sort((a,b)=>a.index-b.index);
    const res=[];let lastEnd=-1;
    for(const m of all){if(m.index<lastEnd)continue;if(m.v>0)res.push(m);lastEnd=m.end;} // Überlappung "16, 99.78" → nur 16,99
    return res;
  };
  const pctLine=(r)=>/\d\s*%/.test(r);
  const hasWord=(s)=>(s.replace(/\beur\b/ig," ").replace(/[^A-Za-zÄÖÜäöüß ]/g," ").split(/\s+/).some(t=>t.length>=3&&/[aeiouäöüy]/i.test(t)));
  // Datum: ALLE Treffer durchgehen und den ersten plausiblen nehmen — nicht
  // blind den ersten. Am 17.08.2026 buchte ein Beleg auf den 17.08.**2020**,
  // weil die OCR die Jahreszahl verlas; die Freigabe-Mail zeigte das Datum,
  // aber nichts wies darauf hin, dass es 6 Jahre daneben lag. Auf Kassenbons
  // stehen ohnehin fremde Datumsangaben („gültig bis 12/28" auf dem
  // Kartenbeleg), die hier nie gewinnen dürfen.
  out.date=belegDatum(text);
  const rm=text.match(/(?:rechnung|beleg|bon|quittung|rg)[^\dA-Za-z]{0,3}(?:nr\.?|no\.?|nummer)?[^\dA-Za-z]{0,4}([A-Za-z0-9][A-Za-z0-9\-\/]{3,})/i); if(rm&&/\d/.test(rm[1]))out.refSupplier=rm[1];
  const brandFull=rows.find(r=>/(baumarkt|gmbh|\bmarkt\b|baustoff|gartencenter|garten\-?center)/i.test(r)&&r.replace(/[^A-Za-zÄÖÜäöüß]/g,"").length>=6);
  const brandTok=rows.find(r=>/(hornbach|\bobi\b|bauhaus|toom|hagebau|raiffeisen|agravis|globus)/i.test(r));
  const nameRow=rows.find(r=>(r.replace(/[^A-Za-zÄÖÜäöüß]/g,"").length>=5)&&!/\d{2}[.\/]/.test(r)&&!/telefon|straße|strasse|www|respekt|selber/i.test(r));
  const nsrc=brandFull||nameRow||brandTok;
  if(nsrc){let s=nsrc.replace(/[\\|©®*_=~:;{}\[\]@+]+/g," ").replace(/\d/g," ").replace(/\s{2,}/g," ").trim();let t=s.split(" ").filter(Boolean);while(t.length&&t[0].replace(/[^A-Za-zÄÖÜäöüß]/g,"").length<3)t.shift();while(t.length&&t[t.length-1].replace(/[^A-Za-zÄÖÜäöüß]/g,"").length<3)t.pop();out.supplier=t.join(" ").slice(0,40);}
  let defTva=19; if(/\b7[.,]00\s*%/.test(text)&&!/(1[0-9])[.,]00\s*%/.test(text))defTva=7;

  // ── Zonen: Artikel stehen zwischen Kopf (Adresse/Telefon) und SUMME/GEGEBEN/Kundenbeleg ──
  let zoneEnd=rows.findIndex(r=>/(summe|sunme|gesamt|gegeben|kundenbel|zwischensum|zu\s*zahlen|\bbetrag\b)/i.test(r));
  if(zoneEnd<0)zoneEnd=rows.length;
  let zoneStart=0;
  for(let i=0;i<zoneEnd;i++) if(/(telefon|\bfax\b|straße|strasse|inhaber|^\D{0,6}\d{5}\s+[A-ZÄÖÜ])/i.test(rows[i])||/gmbh/i.test(rows[i])) zoneStart=i+1;

  const NOISE=/(summe|sunme|gesamt|total|zwischensum|mwst|mvst|mhst|iwst|ust\b|netto|entgelt|brutto|zu\s*zahlen|gegeben|rückgeld|ruckgeld|wechselgeld|betrag|steuer|teuer|tse|terminal|karte|kartenzahl|\bcash\b|ec-?cash|girocard|contactless|trace|\bbon\b|beleg|datum|uhrzeit|\bzeit\b|\buhr\b|\buid\b|id\s*nr|signat|seriennr|kasse|zahlung|erfolgt|autorisier|putorisier|telefon|\bfax\b|straße|strasse|\bcode\b|\bnr\b|apfolg|respekt|selber)/i;
  const tokWords=(s)=>s.replace(/[^A-Za-zÄÖÜäöüß0-9\- ]/g," ").split(/\s+/).filter(t=>t.replace(/[^A-Za-zÄÖÜäöüß]/g,"").length>=3&&/[aeiouäöüy]/i.test(t)).slice(0,4);

  // ── Gesamtbetrag: Mehrheit über alle Nicht-%-Zeilen, dann Summen-/Cent-/MwSt-Fallbacks ──
  const tally={};
  for(const r of rows){ if(pctLine(r))continue; for(const m of moneyInLine(r)){const k=m.v.toFixed(2);tally[k]=(tally[k]||0)+1;} }
  let total=0,bestN=0;
  for(const[k,n]of Object.entries(tally)){const v=parseFloat(k);if(v>0&&v<100000&&(n>bestN||(n===bestN&&v>total))){total=v;bestN=n;}}
  if(bestN<2){
    total=0;const dec=[],cent=[];
    for(const r of rows){ if(!/(summe|sunme|gesamt|zu\s*zahlen|\bbetrag\b|total)/i.test(r))continue; const d=moneyInLine(r).map(m=>m.v); dec.push(...d); if(!d.length)for(const m of r.matchAll(/(?<!\d)(\d{3,6})(?!\d)/g)){const v=parseInt(m[1])/100;if(v>=0.5&&v<100000)cent.push(v);} }
    if(dec.length)total=Math.max(...dec); else if(cent.length)total=Math.min(...cent);
    else{const ms=[];for(const r of rows){if(!/%/.test(r))continue;const np=moneyInLine(r).map(m=>m.v);if(np.length>=2)ms.push(np.reduce((s,v)=>s+v,0));}if(ms.length)total=Math.max(...ms);}
  }

  // ── EAN-Artikel: EAN-Zeile = Name; folgende STK-Zeile = Menge (+ evtl. Stückpreis/Zeilensumme) ──
  const eanItems=[]; const usedRows=new Set();
  for(let i=zoneStart;i<zoneEnd;i++){
    const r=rows[i]; const em=r.match(/\d{8,13}/); if(!em)continue;
    const name=tokWords(r.slice(em.index+em[0].length)).slice(0,3).join(" ");
    if(!name)continue;
    let qty=1,unit=0,lineTotal=0;
    for(let j=i;j<=Math.min(i+2,zoneEnd-1);j++){
      const rr=rows[j];
      const qm=rr.match(/(\d{1,4})[.,]?(\d{0,3})\s*(?:stk|st\b|stück|x\b)/i);
      if(!qm)continue;
      qty=parseInt(qm[1])||1;
      if(!qm[2]&&qty>=1000&&qty%1000===0)qty=qty/1000; // "2000STK" = OCR-verklebtes "2.000 STK"
      const mny=moneyInLine(rr).filter(m=>!pctLine(rr));
      if(mny.length>=2){unit=mny[0].v;lineTotal=mny[mny.length-1].v;}
      else if(mny.length===1){unit=mny[0].v;}
      usedRows.add(j); break;
    }
    usedRows.add(i);
    eanItems.push({name,qty:Math.max(1,Math.min(999,qty)),unit,lineTotal});
  }
  if(eanItems.length){
    // Preise vervollständigen: Zeilensumme/Menge, Einzelartikel über Gesamtsumme/Menge.
    for(const it of eanItems){
      if(!it.unit&&it.lineTotal)it.unit=Math.round(it.lineTotal/it.qty*100)/100;
      if(it.unit&&!it.lineTotal)it.lineTotal=Math.round(it.unit*it.qty*100)/100;
    }
    if(eanItems.length===1&&total>0){
      const it=eanItems[0];
      const fits=it.unit>0&&Math.abs(it.unit*it.qty-total)<=Math.max(0.05,total*0.02);
      if(!fits)it.unit=Math.round(total/it.qty*100)/100; // Preisspalte unlesbar → Summe/Menge
    }
    out.lines=eanItems.map(it=>({desc:it.name,qty:it.qty,price:it.unit||0,tva:defTva,fk_product:"",remise_percent:0,account:""}));
    return out;
  }

  // ── Generische Positions-Kandidaten nur in der Artikel-Zone ──
  const cand=[];
  for(let i=zoneStart;i<zoneEnd;i++){
    const r=rows[i]; if(usedRows.has(i))continue;
    const money=moneyInLine(r); if(!money.length||NOISE.test(r)||pctLine(r))continue;
    const last=money[money.length-1]; if(!(last.v>0)||last.v>100000)continue;
    let desc=r.slice(0,last.index).replace(/[|©®*_=~]+/g," ").replace(/[^A-Za-zÄÖÜäöüß0-9 .,\-\/]/g,"").replace(/\s{2,}/g," ").trim();
    let qty=1;const qm=desc.match(/^(\d{1,3})\s*(?:x|stk|stück|st)\b\s*/i);if(qm){qty=parseInt(qm[1])||1;desc=desc.slice(qm[0].length).trim();}
    desc=desc.replace(/[.,\-\/ ]+$/,"").trim();
    if(!hasWord(desc))continue;
    const unit=qty>1?Math.round(last.v/qty*100000)/100000:last.v;
    cand.push({desc,qty,price:unit,tva:defTva,fk_product:"",remise_percent:0,account:""});
  }
  const sum=cand.reduce((s,l)=>s+l.qty*l.price,0);
  if(cand.length&&total>0&&Math.abs(sum-total)<=Math.max(0.05,total*0.02)){out.lines=cand;return out;}

  // ── Fallback: EINE Position (Summe + Namens-Hinweis) ──
  let descHint="";
  for(const r of rows){const em=r.match(/\d{8,}/);if(!em||NOISE.test(r))continue;const a=tokWords(r.slice(em.index+em[0].length)).slice(0,3);if(a.length){descHint=a.join(" ");break;}}
  if(!descHint){for(let i=zoneStart;i<zoneEnd;i++){const r=rows[i];if(NOISE.test(r)||!moneyInLine(r).length)continue;if(i>0&&!NOISE.test(rows[i-1])){const w=tokWords(rows[i-1]).slice(0,3);if(w.length){descHint=w.join(" ");break;}}}}
  let price=0; if(total>0&&total<100000)price=total; else if(cand.length===1)price=cand[0].price;
  out.lines=[{desc:descHint,qty:1,price,tva:defTva,fk_product:"",remise_percent:0,account:""}];
  return out;
}

/**
 * Wartet, bis sich die Belichtung der Kamera eingependelt hat.
 *
 * Die Rueckkamera des Durabook-Tablets (`RearCam-5M`) liefert die ersten ~15
 * Bilder pechschwarz — die Belichtungsautomatik laeuft erst hoch (am Geraet
 * gemessen, 14.08.2026: 15 Bilder = 7,6 KB schwarz, 90 Bilder = 24 KB Motiv).
 * Wer sofort ausloest, fotografiert den Beleg schwarz.
 *
 * Darum wird die Helligkeit mitgemessen und erst freigegeben, wenn sie sich
 * nicht mehr nennenswert aendert. Mit Hoechstwartezeit, damit eine wirklich
 * dunkle Szene (dort aendert sich nie etwas) den Ausloeser nicht dauerhaft
 * sperrt, und mit Mindestwartezeit, damit die ersten beiden gleich-schwarzen
 * Messungen nicht als "stabil" durchgehen.
 *
 * `messen` liefert die mittlere Helligkeit 0–255 oder null, solange noch kein
 * Bild da ist. Uhr und Schlaf sind einspeisbar, damit der Test nicht wartet.
 */
async function warteAufBelichtung(messen, opt = {}) {
  const {
    minMs = 700, maxMs = 3000, schrittMs = 150, schwelle = 1.5, ruhigNoetig = 2,
    schlafen = (ms) => new Promise((r) => setTimeout(r, ms)),
    jetzt = () => Date.now(),
    abbruch = () => false,
  } = opt;
  const start = jetzt();
  let vorher = null, ruhig = 0;
  while (jetzt() - start < maxMs) {
    await schlafen(schrittMs);
    if (abbruch()) return { grund: "abbruch", ms: jetzt() - start };
    let wert = null;
    try { wert = await messen(); } catch (_) { wert = null; }
    if (wert == null || !Number.isFinite(wert)) continue; // Bild noch nicht da
    if (vorher != null && Math.abs(wert - vorher) <= schwelle) ruhig++; else ruhig = 0;
    vorher = wert;
    if (ruhig >= ruhigNoetig && jetzt() - start >= minMs) return { grund: "stabil", ms: jetzt() - start };
  }
  return { grund: "zeit", ms: jetzt() - start };
}

/**
 * Sucht die Kamera aus, mit der fotografiert werden soll.
 *
 * Reihenfolge: zuletzt benutzte (die hat der Mensch von Hand gewaehlt) →
 * Rueckkamera am Namen erkannt → die erste. `facingMode: "environment"` hilft
 * unter Linux/UVC nicht, dort hat kein Geraet eine Blickrichtung; auf dem
 * Durabook-Tablet heisst die hintere aber `RearCam-5M` und wird so gefunden.
 *
 * Zurueck kommt auch, ob neu geoeffnet werden muss: jedes getUserMedia kostet
 * auf dem Tablet beim ersten Mal 2–4 s (am Geraet gemessen, 14.08.2026), ein
 * zweites Oeffnen derselben Kamera waere also teuer und ohne Nutzen.
 */
function kameraWaehlen(cams, gemerkteId, aktiveId) {
  if (!cams || !cams.length) return { idx: -1, neuOeffnen: false };
  let idx = gemerkteId ? cams.findIndex(c => c.deviceId === gemerkteId) : -1;
  if (idx < 0) idx = cams.findIndex(d => /rear|back|environment|world/i.test(d.label || ""));
  if (idx < 0) idx = 0;
  const ziel = cams[idx];
  // Ohne Geraete-Kennung (Browser gibt sie erst nach Freigabe heraus) laesst
  // sich nicht vergleichen — dann bleibt die laufende Kamera stehen.
  const neuOeffnen = !!(ziel?.deviceId && aktiveId && ziel.deviceId !== aktiveId);
  return { idx, neuOeffnen };
}

const KAMERA_KEY = "blattwerk_scanner_kamera";
const gemerkteKamera = () => { try { return localStorage.getItem(KAMERA_KEY) || ""; } catch (_) { return ""; } };
const kameraMerken = (id) => { try { if (id) localStorage.setItem(KAMERA_KEY, id); } catch (_) {} };

// ─── Beleg-Scanner (Auto-Kantenerkennung + manuelles Nachjustieren) ─────────
// Kamera-Aufnahme direkt in der App (Live-Bild + Kamerawechsel).
// Noetig, weil <input capture="environment"> nur auf Handys die Kamera oeffnet -
// auf dem Tablet/Desktop (Chromium) kommt sonst nur der Dateidialog.
// Liefert eine JPEG-Datei wie der Datei-Input, damit Scan/Offline-Pfad gleich bleiben.
function CameraCaptureModal({ onCancel, onCapture, showToast }) {
  const videoRef = useRef();
  const streamRef = useRef(null);
  const [devices, setDevices] = useState([]);
  const [deviceIdx, setDeviceIdx] = useState(0);
  const [ready, setReady] = useState(false);
  const [warmlaufen, setWarmlaufen] = useState(false);
  const genRef = useRef(0);   // zaehlt jeden Kamerawechsel, damit ein alter Anlauf nichts mehr freigibt
  const probeRef = useRef(null);

  const stop = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  // Mittlere Helligkeit des laufenden Bildes (winziges Abbild reicht dafuer).
  const helligkeit = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    let c = probeRef.current;
    if (!c) { c = probeRef.current = document.createElement("canvas"); c.width = 32; c.height = 24; }
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return s / (d.length / 4);
  };

  // Ausloeser erst freigeben, wenn die Belichtung steht (siehe warteAufBelichtung).
  const freigeben = async (meine) => {
    setWarmlaufen(true);
    await warteAufBelichtung(helligkeit, { abbruch: () => genRef.current !== meine });
    if (genRef.current !== meine) return;
    setWarmlaufen(false);
    setReady(true);
  };

  const start = async (idx, list, opt = {}) => {
    const meine = ++genRef.current;
    stop();
    setReady(false);
    setWarmlaufen(false);
    const cams = list || devices;
    const dev = cams[idx];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: dev?.deviceId
          ? { deviceId: { exact: dev.deviceId }, width: { ideal: 3840 }, height: { ideal: 2160 } }
          : { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        audio: false,
      });
      if (genRef.current !== meine) { stream.getTracks().forEach(t => t.stop()); return null; }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      // Beim ersten Griff nach der Kamera (nur um die Geraetenamen zu bekommen)
      // lohnt der Anlauf nicht — gleich danach wird auf die Rueckkamera gewechselt.
      if (opt.freigeben !== false) await freigeben(meine);
      return stream;
    } catch (e) {
      if (!opt.still) showToast("Kamera nicht verfügbar: " + (e?.message || e), "error");
      return null;
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { showToast("Dieses Gerät bietet keine Kamera an", "error"); onCancel(); return; }
      // Erst Zugriff holen, sonst liefert enumerateDevices keine Kameranamen.
      // Gleich mit der zuletzt benutzten Kamera, dann faellt das zweite
      // Oeffnen weg (kostet auf dem Tablet 2–4 s).
      const merk = gemerkteKamera();
      let first = await start(0, merk ? [{ deviceId: merk }] : [], { freigeben: false, still: !!merk });
      // Die gemerkte Kamera kann weg sein (abgezogen, anderes Geraet) — dann
      // ohne Wunsch nochmal, statt den Scanner mit einer Fehlermeldung zu schliessen.
      if (!first && merk && alive) first = await start(0, [], { freigeben: false });
      if (!alive) return;
      let gewechselt = false;
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        const cams = all.filter(d => d.kind === "videoinput");
        if (alive && cams.length) {
          setDevices(cams);
          const aktiv = first?.getVideoTracks?.()[0]?.getSettings?.().deviceId || "";
          const { idx, neuOeffnen } = kameraWaehlen(cams, merk, aktiv);
          setDeviceIdx(Math.max(idx, 0));
          kameraMerken(cams[idx]?.deviceId);
          if (neuOeffnen) { gewechselt = true; start(idx, cams); }
        }
      } catch (_) {}
      // Ohne Wechsel laeuft die zuerst geoeffnete Kamera weiter — die braucht
      // ihren Belichtungs-Anlauf dann hier, sonst bliebe der Ausloeser gesperrt.
      if (first && !gewechselt && alive) freigeben(genRef.current);
      if (!first && alive) onCancel();
    })();
    return () => { alive = false; genRef.current++; stop(); };
  }, []);

  const shoot = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { showToast("Bild noch nicht bereit", "error"); return; }
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    c.toBlob(blob => {
      if (!blob) { showToast("Aufnahme fehlgeschlagen", "error"); return; }
      stop();
      onCapture(new File([blob], `beleg-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.95);
  };

  const switchCam = () => {
    if (devices.length < 2) return;
    const next = (deviceIdx + 1) % devices.length;
    setDeviceIdx(next);
    kameraMerken(devices[next]?.deviceId); // von Hand gewaehlt schlaegt die Namenserkennung
    start(next, devices);
  };

  const camName = devices[deviceIdx]?.label || (deviceIdx === 0 ? "Kamera 1" : `Kamera ${deviceIdx + 1}`);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && (stop(), onCancel())}>
      <div className="modal">
        <div className="modal-handle"/>
        <div className="modal-title">Beleg aufnehmen</div>
        <div style={{position:"relative", background:"#000", borderRadius:12, overflow:"hidden", marginBottom:12}}>
          <video ref={videoRef} playsInline muted style={{width:"100%", display:"block", maxHeight:"55vh", objectFit:"contain"}} />
          {!ready && (
            <div style={{position:"absolute", inset:0, display:"grid", placeItems:"center", color:"#fff", fontSize:14, background:warmlaufen?"transparent":"#000", textShadow:"0 1px 3px #000"}}>
              {warmlaufen ? "Belichtung stellt sich ein…" : "Kamera startet…"}
            </div>
          )}
        </div>
        {devices.length > 1 && (
          <div style={{fontSize:12, color:"var(--text2)", marginBottom:8, textAlign:"center"}}>
            Aktiv: {camName} ({deviceIdx + 1}/{devices.length})
          </div>
        )}
        <div style={{display:"flex", gap:10}}>
          <button className="btn btn-secondary" style={{flex:1}} onClick={() => { stop(); onCancel(); }}>Abbrechen</button>
          {devices.length > 1 && (
            <button className="btn btn-secondary" style={{flex:1}} onClick={switchCam}>Kamera wechseln</button>
          )}
          <button className="btn btn-primary" style={{flex:1}} disabled={!ready} onClick={shoot}>Foto aufnehmen</button>
        </div>
      </div>
    </div>
  );
}

function ScanCropModal({ file, onCancel, onConfirm, showToast }) {
  const [imgEl, setImgEl] = useState(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [corners, setCorners] = useState(null); // 4× {x,y} in Bildkoordinaten
  const [status, setStatus] = useState("Lade…");
  const [processing, setProcessing] = useState(false);
  const svgRef = useRef();
  const dragRef = useRef(-1);
  const urlRef = useRef("");

  const insetCorners = (w, h) => [
    { x: w * 0.1, y: h * 0.1 }, { x: w * 0.9, y: h * 0.1 },
    { x: w * 0.9, y: h * 0.9 }, { x: w * 0.1, y: h * 0.9 },
  ];

  useEffect(() => {
    const url = URL.createObjectURL(file); urlRef.current = url;
    const img = new Image();
    img.onload = async () => {
      setImgEl(img); setDims({ w: img.naturalWidth, h: img.naturalHeight });
      setCorners(insetCorners(img.naturalWidth, img.naturalHeight));
      setStatus("Erkenne Kanten…");
      try {
        const cv = await loadOpenCv();
        const quad = detectDocumentQuad(cv, img);
        if (quad) { setCorners(cornerOrder(quad)); setStatus(""); }
        else setStatus("Keine Kante erkannt – Ecken manuell setzen");
      } catch (e) { console.error(e); setStatus("Auto-Erkennung nicht verfügbar – manuell zuschneiden"); }
    };
    img.onerror = () => { showToast("Bild konnte nicht geladen werden", "error"); onCancel(); };
    img.src = url;
    return () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); };
  }, [file]);

  const toSvgPoint = (e) => {
    const svg = svgRef.current; if (!svg) return null;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM(); if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: Math.max(0, Math.min(dims.w, p.x)), y: Math.max(0, Math.min(dims.h, p.y)) };
  };
  const onPointerDown = (i) => (e) => { e.preventDefault(); dragRef.current = i; e.target.setPointerCapture?.(e.pointerId); };
  const onPointerMove = (e) => {
    if (dragRef.current < 0) return;
    const p = toSvgPoint(e); if (!p) return;
    setCorners(cs => cs.map((c, idx) => idx === dragRef.current ? p : c));
  };
  const onPointerUp = () => { dragRef.current = -1; };

  const redetect = async () => {
    if (!imgEl) return;
    setStatus("Erkenne Kanten…");
    try { const cv = await loadOpenCv(); const q = detectDocumentQuad(cv, imgEl); if (q) { setCorners(cornerOrder(q)); setStatus(""); } else setStatus("Keine Kante erkannt"); }
    catch { setStatus("Auto-Erkennung nicht verfügbar"); }
  };

  const confirm = async () => {
    if (!imgEl || !corners) return;
    setProcessing(true);
    try {
      const cv = await loadOpenCv();
      const blob = await warpDocument(cv, imgEl, corners);
      onConfirm(new File([blob], `scan-${todayISO()}-${Math.round(performance.now())}.jpg`, { type: "image/jpeg" }));
    } catch (e) { console.error("Scan-Entzerrung fehlgeschlagen", e); showToast("Zuschnitt fehlgeschlagen", "error"); setProcessing(false); }
  };

  const handleR = Math.max(12, Math.max(dims.w, dims.h) * 0.018);
  const strokeW = Math.max(2, Math.max(dims.w, dims.h) * 0.004);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !processing && onCancel()}>
      <div className="modal" style={{ maxWidth: "96vw", width: "96vw", height: "92vh", display: "flex", flexDirection: "column" }}>
        <div className="modal-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span>Beleg zuschneiden</span>
          <span style={{ fontSize: 12, color: "var(--text2)", fontWeight: 400 }}>{status}</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", touchAction: "none" }}>
          {imgEl && corners && (
            <svg ref={svgRef} viewBox={`0 0 ${dims.w} ${dims.h}`} style={{ maxWidth: "100%", maxHeight: "100%" }}
              onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
              <image href={urlRef.current} x="0" y="0" width={dims.w} height={dims.h} />
              <polygon points={corners.map(c => `${c.x},${c.y}`).join(" ")} fill="rgba(67,160,71,0.18)" stroke="var(--accent)" strokeWidth={strokeW} />
              {corners.map((c, i) => (
                <circle key={i} cx={c.x} cy={c.y} r={handleR} fill="var(--accent)" stroke="#fff" strokeWidth={strokeW}
                  style={{ cursor: "grab" }} onPointerDown={onPointerDown(i)} />
              ))}
            </svg>
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--text2)", margin: "8px 0" }}>Ecken auf die Belegkanten ziehen, dann übernehmen.</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onCancel} disabled={processing}>Abbrechen</button>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={redetect} disabled={processing}><Icon name="search" size={15} /> Auto</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirm} disabled={processing}>
            {processing ? <><div className="spinner" style={{ width: 15, height: 15 }} /> …</> : "Übernehmen"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Buchungskonten (SKR03) – Vorschlag je Position ─────────────────────────
// Kuratierte Auswahl der real genutzten Einkaufskonten (Dropdown-Pool).
// Alle Nummern am 2026-08-04 gegen den in Dolibarr importierten SKR03 geprüft
// (llx_accounting_account, rowid = "10050"+Nummer, alle aktiv). Bezeichnungen
// entsprechen dem Kontenrahmen, gekürzt auf Dropdown-Länge.
const DEFAULT_KONTEN = [
  // Material / Wareneinsatz
  { number: "3400", label: "Wareneingang 19 % (Material, Erde, Dünger)" },
  { number: "3300", label: "Wareneingang 7 % (lebende Pflanzen)" },
  { number: "3000", label: "Betriebsstoffe Maschinen (Sonderkraftstoff, Öle)" },
  { number: "3100", label: "Fremdleistungen (Subunternehmer)" },
  // Werkzeug / Ausrüstung
  { number: "4985", label: "Werkzeuge und Kleingeräte (inkl. PSA)" },
  { number: "4980", label: "Sonstiger Betriebsbedarf" },
  { number: "0480", label: "Geringwertige Wirtschaftsgüter (bis 800 €)" },
  { number: "0485", label: "Sammelposten Wirtschaftsgüter (250–1000 €)" },
  { number: "0440", label: "Werkzeuge (aktiviert, über 800 €)" },
  { number: "0210", label: "Maschinen (aktiviert, über 800 €)" },
  // Fahrzeuge
  { number: "4530", label: "Laufende Fahrzeug-Betriebskosten (Kraftstoff)" },
  { number: "4540", label: "Fahrzeug-Reparaturen (Werkstatt, Reifen)" },
  { number: "4580", label: "Sonstige Fahrzeugkosten (HU/AU, Zulassung)" },
  { number: "4510", label: "Kfz-Steuer" },
  { number: "4520", label: "Fahrzeug-Versicherungen" },
  { number: "0350", label: "Lkw / Transporter (aktiviert)" },
  { number: "0380", label: "Sonstige Transportmittel (Anhänger)" },
  // Instandhaltung / Entsorgung / Miete
  { number: "4800", label: "Reparatur technische Anlagen (Maschinen)" },
  { number: "4805", label: "Reparatur andere Anlagen" },
  { number: "4969", label: "Abraum- und Abfallbeseitigung (Entsorgung)" },
  { number: "4960", label: "Miete Einrichtungen (Geräte, Hubsteiger)" },
  { number: "4210", label: "Miete unbewegliche WG (Halle, Lagerplatz)" },
  { number: "4240", label: "Gas, Strom, Wasser" },
  // Versicherungen / Beiträge
  { number: "4360", label: "Versicherungen (betrieblich, ohne Vorsteuer)" },
  { number: "4138", label: "Beiträge Berufsgenossenschaft (SVLFG)" },
  { number: "4380", label: "Beiträge (Verband, Innung, IHK)" },
  // Verwaltung
  { number: "4930", label: "Bürobedarf und Porto" },
  { number: "4920", label: "Telefon / Mobilfunk / Internet" },
  { number: "4600", label: "Werbekosten (Beschriftung, Website)" },
  { number: "4945", label: "Fortbildungskosten (SKT, Lehrgänge)" },
  { number: "4950", label: "Rechts- und Beratungskosten" },
  { number: "4955", label: "Buchführungskosten (Steuerberater)" },
  { number: "4970", label: "Nebenkosten des Geldverkehrs (Bankgebühren)" },
  { number: "2120", label: "Zinsen langfristige Verbindlichkeiten" },
  // Sonstiges
  { number: "4650", label: "Bewirtungskosten (70 % abziehbar)" },
  { number: "4674", label: "Verpflegungsmehraufwand (Pauschale)" },
  { number: "4900", label: "Sonstige betriebliche Aufwendungen" },
  { number: "1800", label: "Privatentnahme (nicht betrieblich)" },
];
// Schlagwort→Konto-Regeln: gewerksneutrale Grundregeln + Gewerk-Paket aus
// src/konto-regeln.js (Task 8, Mandantenfaehigkeit). Reihenfolge = Prioritaet
// (erste Regel mit Treffer gewinnt), Quelle der Wahrheit ist dort — hier nur
// die Auswahl nach dem Profil des jeweiligen Mandanten. Blattwerk selbst
// laeuft als "baumpflege" und bekommt damit exakt die bisherige, produktions-
// bewaehrte Regelliste (siehe Kommentar in src/konto-regeln.js).
const DEFAULT_KONTO_REGELN = regelnFuer(mandantAusCache()?.profil || "baumpflege");
// Prüfregeln aus dem Buchhalter-Review (2026-08-04, Details im Vault unter
// Knowledge/buchhaltung-blattwerk-skr03.md). Sie erzeugen HINWEISE, keine
// Blockaden: die Buchung bleibt möglich, der Fehler wird nur sichtbar, bevor
// freigegeben wird. Bewusst nur Fälle, die aus den Belegdaten ableitbar sind.
// GWG_GRENZE steht bei den Anlagegütern (Finanzübersicht), hier nur die Rest-Schwellen.
const SAMMELPOSTEN_GRENZE = 250, KLEINBETRAG_GRENZE = 250;
const KONTEN_OHNE_VORSTEUER = { "4360": "Versicherungsprämien", "4520": "Kfz-Versicherungen", "4510": "Kfz-Steuer", "4970": "Bankgebühren", "4380": "Beiträge", "4138": "Berufsgenossenschaft" };
const PRIVATKLEIDUNG = ["jeans", "t-shirt", "tshirt", "fleece", "pullover", "unterwäsche", "unterwaesche", "socken", "freizeit"];
function belegWarnungen(line, konto, kontext = {}) {
  const w = [];
  const tva = parseFloat(line.tva_tx ?? line.tva ?? 0);
  const qty = Math.abs(parseFloat(line.qty || 1)) || 1;
  const netGesamt = Math.abs(parseFloat(line.total_ht ?? line.pu_ht ?? line.subprice ?? 0) * (line.total_ht != null ? 1 : qty));
  const netStueck = netGesamt / qty;
  const text = stripHtml(line.description || line.desc || line.product_label || "").toLowerCase();
  const aufwandskonto = /^[34]/.test(konto) && konto !== "0480" && konto !== "0485";
  if (aufwandskonto || /^49/.test(konto)) {
    if (netStueck > GWG_GRENZE) w.push(`${netStueck.toFixed(0)} € netto pro Stück: über der 800-€-Grenze — aktivieren und abschreiben (0440/0210), nicht als Aufwand buchen`);
    else if (netStueck > SAMMELPOSTEN_GRENZE && konto === "4985") w.push(`${netStueck.toFixed(0)} € netto: über 250 € — Sammelposten (0485) oder GWG (0480) prüfen`);
  }
  if (KONTEN_OHNE_VORSTEUER[konto] && tva > 0) w.push(`${KONTEN_OHNE_VORSTEUER[konto]} sind umsatzsteuerfrei — hier stehen ${tva} % Vorsteuer`);
  if (konto === "3300" && tva > 7) w.push(`Wareneingang 7 % mit ${tva} % gebucht — lebende Pflanzen sind 7 %, Substrat/Zubehör 19 % (Position ggf. aufteilen)`);
  if (konto === "3400" && tva > 0 && tva < 19) w.push(`Wareneingang 19 % mit ${tva} % gebucht — Steuersatz gegen den Beleg prüfen`);
  if (konto === "4650") w.push("Bewirtung: nur 70 % abziehbar, Vorsteuer 100 % — Anlass und Teilnehmer müssen auf dem Beleg stehen");
  if (konto === "4674") w.push("Verpflegungsmehraufwand läuft nur über Pauschalen per Eigenbeleg — ein Restaurantbeleg gehört hier nicht hin");
  if (konto === "3100") w.push("Subunternehmer: Freistellungsbescheinigung nach § 48b anfordern, sonst 15 % Bauabzugsteuer einbehalten");
  if (konto === KONTO_STD) w.push("Keine Regel hat gegriffen — Konto bitte bewusst wählen, sonst sammelt sich hier Ungeklärtes");
  if (PRIVATKLEIDUNG.some((k) => text.includes(k))) w.push("Normale Kleidung ist privat (1800) — nur typische Schutz-/Berufskleidung ist Betriebsausgabe");
  if (kontext.bruttoGesamt > KLEINBETRAG_GRENZE && !String(kontext.refSupplier || "").trim()) w.push(`Beleg über ${KLEINBETRAG_GRENZE} € ohne Rechnungsnummer — ab dieser Grenze braucht es eine Rechnung auf die Blattwerk GbR, sonst kein Vorsteuerabzug`);
  return w;
}

// Buchungskonto einer bestehenden Rechnungszeile setzen. Dolibarr übernimmt
// fk_code_ventilation NUR beim Anlegen einer Zeile (der PUT-Endpunkt ignoriert
// das Feld, live geprüft 2026-08-04) → Zeile identisch neu anlegen, dann die
// alte löschen; scheitert das Löschen, wird die neue zurückgenommen, damit die
// Position nicht doppelt steht und die Rechnungssumme stimmt.
async function setLineKonto(api, invoiceId, line, konto, extra = {}) {
  const oldId = line.lineid || line.id || line.rowid;
  const desc = extra.desc ?? stripHtml(line.description || line.desc || "");
  const newLine = await api.addSupplierInvoiceLine(invoiceId, {
    desc, description: desc,
    qty: parseFloat(extra.qty ?? line.qty ?? 1),
    pu_ht: parseFloat(extra.pu_ht ?? line.pu_ht ?? line.subprice ?? 0),
    tva_tx: parseFloat(extra.tva_tx ?? line.tva_tx ?? line.tva ?? 0),
    remise_percent: parseFloat(extra.remise_percent ?? line.remise_percent ?? 0),
    price_base_type: "HT",
    product_type: line.product_type ?? 0,
    fk_code_ventilation: parseInt("10050" + konto, 10),
    ...(line.fk_product ? { fk_product: parseInt(line.fk_product) } : {}),
  });
  try {
    if (oldId) await api.deleteSupplierInvoiceLine(invoiceId, oldId);
  } catch (delErr) {
    const newId = typeof newLine === "number" ? newLine : (newLine?.id || newLine?.rowid);
    if (newId) await api.deleteSupplierInvoiceLine(invoiceId, newId).catch(() => {});
    throw new Error("Konto nicht geändert — Beleg blieb unverändert");
  }
  if (line.fk_product) {
    rememberKonto(line.fk_product, konto, extra.lieferant);
    api.updateProduct(parseInt(line.fk_product), { accountancy_code_buy: konto }).catch(() => {});
  }
}

// Fallback bewusst 4900 statt 4985: was keine Regel trifft, ist „ungeklärt" und
// soll nicht in den Werkzeugen verschwinden (dort verstecken sich sonst
// aktivierungspflichtige Anschaffungen und Privatanteile). In der Freigaben-
// Seite ist ein reiner Vorschlag gelb markiert und muss bestätigt werden.
const KONTO_STD = "4900";
// Hochzählen, wenn DEFAULT_KONTEN/DEFAULT_KONTO_REGELN erweitert werden: Geräte
// mit älterer gespeicherter Konfiguration bekommen die neuen Standardkonten und
// -regeln dazu, ohne dass eigene Ergänzungen verlorengehen.
const KONTO_CFG_VERSION = 7;
const mergeKontoConfig = (c) => {
  // Eigene Bezeichnungen für Standardkonten behalten — nur neue Konten kommen dazu.
  const eigeneLabel = {};
  (c.konten || []).forEach((k) => { if (k && k.number && k.label) eigeneLabel[k.number] = k.label; });
  const konten = DEFAULT_KONTEN.map((k) => (eigeneLabel[k.number] ? { ...k, label: eigeneLabel[k.number] } : k));
  const haveNr = new Set(konten.map((k) => k.number));
  (c.konten || []).forEach((k) => { if (k && k.number && !haveNr.has(k.number)) { konten.push(k); haveNr.add(k.number); } });
  // Eigene Regeln (nicht aus den alten Defaults) hinten anhängen, damit sie
  // erhalten bleiben, aber die gepflegten Standardregeln zuerst greifen.
  // Eine gespeicherte Regel gilt auch dann als „alter Default", wenn ihre
  // Stichwörter komplett in der neuen Standardregel desselben Kontos aufgehen —
  // sonst bliebe bei jeder Erweiterung der Stichwortlisten eine überflüssige
  // Kopie der Vorgängerversion im Panel stehen.
  const defaultKeys = new Set(DEFAULT_KONTO_REGELN.map((r) => r.account + "|" + (r.keywords || []).join(",")));
  const defaultWords = {};
  DEFAULT_KONTO_REGELN.forEach((r) => {
    (defaultWords[r.account] = defaultWords[r.account] || new Set());
    (r.keywords || []).forEach((k) => defaultWords[r.account].add(k));
  });
  const istAlterDefault = (r) => defaultKeys.has(r.account + "|" + (r.keywords || []).join(","))
    || ((r.keywords || []).length > 0 && defaultWords[r.account]
        && r.keywords.every((k) => defaultWords[r.account].has(k)));
  const eigene = (c.regeln || []).filter((r) => r && !istAlterDefault(r));
  return { konten, regeln: [...DEFAULT_KONTO_REGELN, ...eigene], standard: c.standard || KONTO_STD, version: KONTO_CFG_VERSION };
};
const loadKontoConfig = () => {
  try {
    const c = JSON.parse(localStorage.getItem("blattwerk_konten") || "null");
    if (c && Array.isArray(c.konten) && Array.isArray(c.regeln)) {
      if ((c.version || 1) >= KONTO_CFG_VERSION) return { standard: KONTO_STD, ...c };
      const merged = mergeKontoConfig(c);
      try { localStorage.setItem("blattwerk_konten", JSON.stringify(merged)); } catch (_) {}
      return merged;
    }
  } catch { /* fällt auf Defaults zurück */ }
  return { konten: DEFAULT_KONTEN, regeln: DEFAULT_KONTO_REGELN, standard: KONTO_STD, version: KONTO_CFG_VERSION };
};
const saveKontoConfig = (c) => localStorage.setItem("blattwerk_konten", JSON.stringify(c));
const suggestKonto = (desc, cfg) => {
  const t = (desc || "").toLowerCase();
  if (t.trim()) for (const r of cfg.regeln) { if ((r.keywords || []).some(k => k && t.includes(k))) return r.account; }
  return cfg.standard || KONTO_STD;
};
// Klartext zur Kontonummer (leer, wenn das Konto nicht im Auswahl-Pool steht).
const kontoLabel = (number, cfg) => ((cfg?.konten || []).find((k) => k.number === number)?.label || "");
// Lokaler Cache + Server-Abgleich (Task 8, Mandantenfähigkeit). Details und
// die Merge-Regel (Server gewinnt) stehen in src/konto-gedaechtnis-client.js.
// Die beiden Namen hier bleiben, weil mehrere Stellen bereits synchron per
// `useRef(loadKontoMemory())` beim Mount lesen — ein Wechsel auf eine
// async-Funktion würde dort entweder das erste Rendern verzögern oder einen
// Ladezustand erzwingen, den es vorher nicht gab. Start deshalb synchron aus
// dem lokalen Cache (funktioniert offline sofort, kein Beleg wartet aufs
// Netz), Auffrischen mit dem Serverstand läuft daneben über
// kontoMemAbgleichen() (siehe die drei useRef-Stellen unten).
const loadKontoMemory = kontoMemAusCache;
const rememberKonto = (pid, acc, lieferant) => kontoMemMerken(pid, acc, lieferant);

// Legt eine Lieferantenrechnung (Kopf + Positionen) als ENTWURF an, merkt
// Einkaufspreise/Buchungskonten je Artikel und lädt optional vorab kodierte
// Belege hoch. Reine API-Orchestrierung ohne UI-Kopplung - wird sowohl vom
// Online-Formular (SupplierInvoiceForm.save) als auch vom Offline-Sync-Replay
// (sync.js "supplierinvoice", injiziert über runSync) verwendet. Ruft nie
// validateSupplierInvoice auf - die Rechnung bleibt immer im Entwurfsstatus,
// exakt wie beim bisherigen manuellen Anlegen.
async function submitSupplierInvoice(api, data) {
  // data: {
  //   socid, ref_supplier, date, date_lim_reglement, note_public, note_private?, fk_project?,
  //   lines: [{ desc, qty, subprice (netto), tva_tx, remise_percent, fk_product?, account?, _accSet? }],
  //   documents?: [{ filename, base64 }],  // bereits kodiert (FileReader online, Blob offline)
  // }
  const lines = data.lines || [];
  const payload = {
    socid: parseInt(data.socid),
    ref_supplier: data.ref_supplier,
    date: data.date,
    date_lim_reglement: data.date_lim_reglement,
    note_public: data.note_public || "",
    ...(data.note_private ? { note_private: data.note_private } : {}),
    lines: lines.map(l => ({
      desc: l.desc,
      qty: parseFloat(l.qty || 0),
      subprice: l.subprice,
      tva_tx: l.tva_tx,
      remise_percent: parseFloat(l.remise_percent || 0),
      ...(l.fk_product ? { fk_product: parseInt(l.fk_product) } : {}),
    })),
    ...(data.fk_project ? { fk_project: parseInt(data.fk_project) } : {}),
    // Dolibarr verknüpft beim Anlegen über linked_objects, z. B. { order_supplier: 12 }
    ...(data.linked_objects ? { linked_objects: data.linked_objects } : {}),
  };
  const created = await api.createSupplierInvoice(payload);

  // Einkaufspreis je produktverknüpfter Zeile merken (netto, je Lieferant)
  try {
    await Promise.all(lines.filter(l => l.fk_product && l.subprice > 0).map(l =>
      api.addPurchasePrice(parseInt(l.fk_product), {
        buyprice: l.subprice, price_base_type: "HT", fourn_id: parseInt(data.socid), tva_tx: l.tva_tx,
      }).catch(() => {})
    ));
  } catch { /* Einkaufspreis-Merken darf den Speichervorgang nie blockieren */ }

  // Buchungskonto je Artikel setzen/merken (neue Artikel bekamen es schon beim Anlegen)
  try {
    await Promise.all(lines.filter(l => l.fk_product && l.account).map(l => {
      rememberKonto(l.fk_product, l.account, data.lieferantName);
      return l._accSet ? Promise.resolve() : api.updateProduct(parseInt(l.fk_product), { accountancy_code_buy: l.account }).catch(() => {});
    }));
  } catch { /* Konto-Setzen darf den Speichervorgang nie blockieren */ }

  let uploadResult = { ok: 0, fail: 0 };
  if (data.documents && data.documents.length) {
    const id = typeof created === "number" ? created : (created?.id || created?.rowid);
    let fresh = created;
    if (id) fresh = await api.getSupplierInvoice(id).catch(() => created);
    const ref = fresh?.ref || fresh?.ref_supplier || created?.ref || created?.ref_supplier;
    if (!ref) {
      uploadResult = { ok: 0, fail: data.documents.length };
    } else {
      for (const doc of data.documents) {
        try {
          const fd = new FormData();
          fd.append("modulepart", "supplier_invoice");
          fd.append("ref", ref);
          fd.append("subdir", "");
          fd.append("filename", buildFilename(ref, doc.filename));
          fd.append("filecontent", doc.base64);
          fd.append("fileencoding", "base64");
          fd.append("overwriteifexists", "0");
          await api.uploadDocument(fd);
          uploadResult.ok++;
        } catch (err) {
          console.error("Upload Lieferantenrechnung fehlgeschlagen", err);
          uploadResult.fail++;
        }
      }
    }
  }

  return { created, uploadResult };
}

// ─── Supplier Invoice Form ──────────────────────────────────────────────────
function SupplierInvoiceForm({ api, suppliers, onClose, onSaved, showToast }) {
  const [socid, setSocid] = useState("");
  const [projectid, setProjectid] = useState("");
  const [projects, setProjects] = useState([]);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(todayISO());
  const [refSupplier, setRefSupplier] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([{desc:"", qty:1, price:0, tva:19, fk_product:"", remise_percent:0}]);
  const [products, setProducts] = useState([]);
  const [files, setFiles] = useState([]);
  const [autoCreate, setAutoCreate] = useState(true);
  const [scanFile, setScanFile] = useState(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrText, setOcrText] = useState("");
  const [supplierHint, setSupplierHint] = useState("");
  const [kontoCfg] = useState(loadKontoConfig);
  const kontoMem = useRef(loadKontoMemory());
  // Mit dem Serverstand abgleichen (Task 8) — läuft nebenher; ohne Netz
  // bleibt der synchron gestartete lokale Stand einfach stehen.
  useEffect(() => { kontoMemAbgleichen().then((m) => { kontoMem.current = m; }); }, []);
  const kontoOf = (l) => l.account || (l.fk_product && kontoMem.current[String(l.fk_product)]) || suggestKonto(l.desc, kontoCfg);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const fileInputRef = useRef();
  const cameraInputRef = useRef();
  const offlineInputRef = useRef();
  const [offlineBusy, setOfflineBusy] = useState(false);
  // Kamera-Modal: "scan" = aufnehmen + gleich auslesen, "offline" = nur ablegen.
  const [camMode, setCamMode] = useState(null);
  // Handys oeffnen mit capture="…" die native Kamera (bessere Qualitaet/Autofokus);
  // auf Tablet/Desktop ignoriert Chromium das Attribut -> eigenes Kamera-Modal.
  const nativeCapture = typeof document !== "undefined" && "capture" in document.createElement("input");
  const openCamera = (mode) => {
    if (nativeCapture) {
      (mode === "offline" ? offlineInputRef : cameraInputRef).current?.click();
    } else {
      setCamMode(mode);
    }
  };

  useEffect(() => {
    if (offline.isOnline()) {
      api.getProducts().then(p => setProducts(Array.isArray(p) ? p : [])).catch(() => {});
    } else {
      // Offline: Artikelliste aus dem lokalen Ref-Cache (Feldname tva_tx passend
      // zur Live-API, siehe cache.js) statt api.getProducts().
      offline.readRefs("product").then(p => setProducts(Array.isArray(p) ? p : [])).catch(() => {});
    }
  }, [api]);
  useEffect(() => {
    if (offline.isOnline()) {
      api.getProjects().then(p => setProjects(Array.isArray(p) ? p.filter(isOpenProject) : [])).catch(() => {});
    } else {
      offline.readRefs("project").then(p => setProjects(Array.isArray(p) ? p.filter(isOpenProject) : [])).catch(() => {});
    }
  }, [api]);

  // Beleg-Foto ohne Online-OCR direkt in die Offline-Outbox legen; Sync lädt es
  // via putReceipt nach Blattwerk/Belege/, die bestehende Pipeline bucht dann wie gewohnt.
  // Kein `me`/`setPendingCount` in diesem Formular verfügbar (siehe Props oben) – createdBy
  // bleibt leer, der Pending-Badge zieht bei der nächsten Connectivity-Prüfung/Sync nach.
  const handleOfflineReceipt = async (file) => {
    if (!file) return;
    setOfflineBusy(true);
    try {
      await offline.enqueue({ type: "receipt", payload: { note: "" }, blob: file, createdBy: "" });
      showToast("Beleg offline gespeichert – wird bei Verbindung übertragen");
    } catch (e) {
      console.error("Offline-Beleg fehlgeschlagen", e);
      showToast("Beleg konnte nicht offline gespeichert werden", "error");
    } finally { setOfflineBusy(false); }
  };

  const pickProject = (pid) => {
    setProjectid(pid);
    const pr = projects.find(p => String(p.id) === String(pid));
    const psoc = pr?.socid || pr?.fk_soc;
    if (psoc) {
      const sup = suppliers.find(s => String(s.id) === String(psoc));
      if (sup) pickSupplier(sup);
    }
  };

  const supplierMatches = supplierQuery.trim().length >= 1
    ? suppliers.filter(s => (s.name || "").toLowerCase().includes(supplierQuery.toLowerCase())).slice(0, 8)
    : suppliers.slice(0, 8);

  const pickSupplier = (s) => {
    setSocid(s.id);
    setSupplierQuery(s.name || "");
    setSupplierOpen(false);
  };

  const addLine = () => setLines(l => [...l, {desc:"", qty:1, price:0, tva:19, fk_product:"", remise_percent:0}]);
  const delLine = (i) => setLines(l => l.filter((_, idx) => idx !== i));
  const updLine = (i, k, v) => setLines(l => l.map((li, idx) => idx === i ? {...li, [k]: v} : li));
  const pickProduct = async (i, prod) => {
    // Lieferantenrechnung: zuerst gemerkten Einkaufspreis (netto) je Lieferant holen
    // und als Brutto zur Anzeige zurückrechnen; sonst Listenpreis des Produkts.
    let grossPrice = null;
    try {
      const pp = await api.getPurchasePrices(prod.id);
      const list = Array.isArray(pp) ? pp : (pp ? [pp] : []);
      const mine = list.find(p => String(p.fourn_id || p.fk_soc) === String(socid)) || list[0];
      if (mine) {
        const net = parseFloat(mine.price ?? mine.unitprice ?? mine.buyprice ?? 0);
        const tva = parseFloat(mine.tva_tx ?? prod.tva_tx ?? 19);
        if (net > 0) grossPrice = Math.round(net * (1 + tva / 100) * 100) / 100;
      }
    } catch { /* kein Einkaufspreis → Listenpreis nutzen */ }
    setLines(l => l.map((li, idx) => idx === i ? {
      ...li,
      desc: prod.label || prod.ref || li.desc,
      price: grossPrice != null ? grossPrice : (prod.price != null && prod.price !== "" ? parseFloat(prod.price) : li.price),
      tva: prod.tva_tx != null && prod.tva_tx !== "" ? parseFloat(prod.tva_tx) : li.tva,
      fk_product: prod.id,
    } : li));
  };
  // Preis-Feld ist hier BRUTTO/Stück → Summe ohne erneuten MwSt-Aufschlag (sonst 18,98 → 22,59).
  const total = lines.reduce((s,l) => s + parseFloat(l.qty||0) * parseFloat(l.price||0) * (1 - parseFloat(l.remise_percent||0)/100), 0);

  const addFiles = (selected) => {
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    const allowedExt = /\.(pdf|jpe?g|png)$/i;
    const next = Array.from(selected || []).filter(f => allowedTypes.includes(f.type) || allowedExt.test(f.name));
    if (!next.length) { showToast("Nur PDF, JPG/JPEG oder PNG erlaubt", "error"); return; }
    setFiles(prev => [...prev, ...next]);
  };

  const toBase64 = (file) => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
  });

  // Beleg-Upload (FormData/uploadDocument) läuft jetzt in submitSupplierInvoice
  // (data.documents) - gemeinsame Logik für Online-Formular und Offline-Sync.

  // Ordnet jede Zeile einem Produkt zu: vorhandenes per Namen finden, sonst (optional) neu anlegen.
  const resolveProducts = async () => {
    const norm = s => (s || "").trim().toLowerCase();
    let createdCount = 0, linkedCount = 0;
    const resolved = [];
    for (const l of lines) {
      if (l.fk_product || !norm(l.desc)) { resolved.push(l); continue; }
      // exakt → fuzzy (Token-Abdeckung): erst wenn beides nicht trifft, neu anlegen
      const hit = products.find(p => norm(p.label) === norm(l.desc) || norm(p.ref) === norm(l.desc))
        || fuzzyFindProduct(l.desc, products);
      if (hit) { resolved.push({ ...l, fk_product: hit.id, _accSet: false }); linkedCount++; continue; }
      if (!autoCreate) { resolved.push(l); continue; }
      try {
        const acc = kontoOf(l); // bestätigtes/vorgeschlagenes Buchungskonto direkt am neuen Artikel setzen
        // Verkaufspreis = Einkaufspreis dieser Zeile, nie darunter (des Inhabers
        // Regel 20.08.2026). Ohne Preis stand jeder Auto-Artikel auf 0 € — wer
        // ihn später in ein Angebot zog, verkaufte ihn geschenkt.
        const res = await api.createProduct({ label: l.desc.trim(), ref: `BW-${Date.now().toString(36).toUpperCase().slice(-6)}`, type: 0, tva_tx: parseFloat(l.tva || 19), accountancy_code_buy: acc, ...verkaufspreisAusEinkauf(l) });
        const newId = typeof res === "number" ? res : (res?.id || res?.rowid);
        resolved.push(newId ? { ...l, fk_product: newId, _accSet: true } : l);
        if (newId) createdCount++;
      } catch { resolved.push(l); }
    }
    return { resolved, createdCount, linkedCount };
  };

  const save = async () => {
    if (savingRef.current) return; // Doppel-Tipp abfangen, bevor React den Button sperrt
    if (!socid) { showToast("Bitte Lieferant auswählen", "error"); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      if (!offline.isOnline()) {
        // v1: nur bereits gecachte Artikel offline verknüpfbar - kein offline
        // createProduct. Neue Artikel (per Auto-Anlage oder unverknüpfte Zeile)
        // blockieren den Offline-Speichervorgang statt sie stillschweigend zu verwerfen.
        if (autoCreate || lines.some(l => !l.fk_product)) {
          showToast("Neuer Artikel offline nicht möglich – bitte nur vorhandene Artikel wählen (Haken „Neue Artikel automatisch anlegen“ entfernen)", "error");
          return;
        }
        const offlineLines = lines.map(l => {
          const tva = parseFloat(l.tva || 0);
          const grossUnit = parseFloat(l.price || 0);
          const netUnit = tva > 0 ? grossUnit / (1 + tva / 100) : grossUnit;
          return {
            desc: l.desc,
            qty: parseFloat(l.qty || 0),
            subprice: Math.round(netUnit * 100000) / 100000, // netto (HT), 5 NK
            tva_tx: tva,
            remise_percent: parseFloat(l.remise_percent || 0),
            fk_product: l.fk_product,
            account: kontoOf(l),
          };
        });
        // Lieferant kann selbst noch ein nicht synchronisierter Outbox-Eintrag sein
        // (gleiches Muster wie ProjectForm -> offline angelegter Kunde).
        const isLocalSupplierRef = String(socid).startsWith("local:");
        const deps = isLocalSupplierRef ? [String(socid).slice("local:".length)] : [];
        await offline.enqueue({
          type: "supplierinvoice",
          payload: {
            supplierRef: socid,
            // Für das Konto-Gedächtnis (Task 8) — nur gesetzt, wenn der Lieferant
            // schon in der geladenen Liste steht; ein noch nicht synchronisierter
            // lokaler Lieferant ("local:…") liefert hier bewusst nichts, statt
            // einen weiteren Netzruf zu riskieren.
            supplierName: suppliers.find(s => String(s.id) === String(socid))?.name,
            // Projekt-Picker bietet offline nur gecachte, bereits synchronisierte
            // Projekte an (kein "local:"-Pending wie beim Lieferanten) - trotzdem
            // als projectid mitgeben, damit fk_project beim Sync nicht verloren geht.
            projectid,
            date: Math.floor(new Date(date).getTime() / 1000),
            dueDate: Math.floor(new Date(dueDate).getTime() / 1000),
            // Platzhalter bereits jetzt (Erfassungszeitpunkt) erzeugen, nicht erst
            // beim Sync - sonst könnten zwei offline erfasste Rechnungen desselben
            // Lieferanten in derselben Sekunde denselben Platzhalter bekommen
            // (Dolibarr UNIQUE-Index fk_soc+ref_supplier).
            ref_supplier: refSupplier.trim() || `o.Nr.-${Date.now()}`,
            lines: offlineLines,
            note,
          },
          deps,
          // Kein `me`/`setPendingCount` in diesem Formular verfügbar (siehe Props
          // oben, gleiches Muster wie handleOfflineReceipt) - createdBy bleibt leer,
          // der Pending-Badge zieht bei der nächsten Connectivity-Prüfung/Sync nach.
          createdBy: "",
        });
        onSaved({ offline: true });
        showToast("Offline gespeichert – wird synchronisiert, sobald wieder online.");
        return;
      }

      const { resolved, createdCount, linkedCount } = await resolveProducts();
      if (createdCount) { setProducts(await api.getProducts().catch(() => products)); }
      const sourceLines = resolved;
      // Jede Datei einzeln kodieren (statt Promise.all) - ein Lesefehler bei einer
      // Datei darf die anderen und die Rechnungsanlage selbst nicht blockieren.
      let preEncodeFail = 0;
      const documents = [];
      for (const f of files) {
        try {
          const b64 = await toBase64(f);
          documents.push({ filename: f.name, base64: b64.split(",")[1] });
        } catch (err) {
          console.error("Beleg-Kodierung fehlgeschlagen", err);
          preEncodeFail++;
        }
      }
      const { created, uploadResult: rawUploadResult } = await submitSupplierInvoice(api, {
        socid: parseInt(socid),
        // Für das Konto-Gedächtnis (Task 8) — schon lokal geladen, kein Zusatzruf.
        lieferantName: suppliers.find(s => String(s.id) === String(socid))?.name,
        // Dolibarr erzwingt je Lieferant eine eindeutige Rechnungs-Nr. (UNIQUE-Index
        // uk_facture_fourn_ref_supplier über fk_soc + ref_supplier). Leer lassen führt
        // ab der 2. Rechnung desselben Lieferanten zu "ErrorRefAlreadyExists" – daher
        // bei leerer Eingabe einen eindeutigen Platzhalter setzen.
        ref_supplier: refSupplier.trim() || `o.Nr.-${Date.now()}`,
        date: Math.floor(new Date(date).getTime() / 1000),
        date_lim_reglement: Math.floor(new Date(dueDate).getTime() / 1000),
        note_public: note,
        fk_project: projectid ? parseInt(projectid) : null,
        lines: sourceLines.map(l => {
          const tva = parseFloat(l.tva || 0);
          const grossUnit = parseFloat(l.price || 0);
          const netUnit = tva > 0 ? grossUnit / (1 + tva / 100) : grossUnit;
          return {
            desc: l.desc,
            qty: parseFloat(l.qty || 0),
            subprice: Math.round(netUnit * 100000) / 100000, // netto (HT), 5 NK
            tva_tx: tva,
            remise_percent: parseFloat(l.remise_percent || 0),
            fk_product: l.fk_product || null,
            account: l.fk_product ? kontoOf(l) : null,
            _accSet: l._accSet,
          };
        }),
        documents,
      });
      const uploadResult = { ok: rawUploadResult.ok, fail: rawUploadResult.fail + preEncodeFail };
      onSaved(created);
      const prodInfo = (createdCount || linkedCount) ? ` · ${createdCount} Artikel neu, ${linkedCount} verknüpft` : "";
      if (files.length && uploadResult.fail) {
        showToast("Rechnung erstellt, aber mindestens ein Upload ist fehlgeschlagen" + prodInfo, "error");
      } else if (files.length && uploadResult.ok) {
        showToast("Rechnung mit Anhang erstellt!" + prodInfo);
      } else if (prodInfo) {
        showToast("Rechnung erstellt!" + prodInfo);
      }
    } catch (err) {
      console.error("Lieferantenrechnung speichern fehlgeschlagen", err);
      showToast(doliError(err) || "Fehler beim Erstellen der Rechnung", "error");
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  // Kamera-Scan: Foto erst zuschneiden/entzerren, dann als Datei übernehmen + auslesen.
  const startScan = (f) => {
    if (!f) return;
    if (/^image\//.test(f.type) || /\.(jpe?g|png)$/i.test(f.name)) setScanFile(f);
    else addFiles([f]);
  };
  const onScanConfirm = (croppedFile) => {
    setScanFile(null);
    setFiles(prev => [...prev, croppedFile]);
    readBeleg(croppedFile);
  };

  // Beleg-Pipeline: Datei(en) nach Nextcloud Blattwerk/Belege/ hochladen — die
  // Server-Pipeline (Vision-Worker) erstellt daraus einen Dolibarr-Entwurf und
  // schickt eine Freigabe-Mail. Nutzt die in der App hinterlegten NC-Zugangsdaten.
  const [pipeBusy, setPipeBusy] = useState(false);
  const ncForUpload = loadNcConfig();
  const pipelineAvailable = ncHasAccess(ncForUpload);
  const sendToPipeline = async () => {
    if (!files.length) { showToast("Erst einen Beleg scannen/wählen", "error"); return; }
    setPipeBusy(true);
    try {
      for (const f of files) {
        const b64 = await new Promise((ok, err) => {
          const r = new FileReader();
          r.onload = () => ok(String(r.result).split(",")[1]);
          r.onerror = err;
          r.readAsDataURL(f);
        });
        const name = `${todayISO()}_${String(Date.now()).slice(-6)}_${f.name}`.replace(/\s+/g, "_");
        const res = await apiFetch("/api/nc/putfile", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ server: ncForUpload.server, user: ncForUpload.user, pass: ncForUpload.pass, filename: name, dataBase64: b64 }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || ("Status " + res.status));
        }
      }
      showToast(`${files.length} Beleg(e) an die Pipeline übergeben — Freigabe-Mail folgt`);
      onClose();
    } catch (e) {
      showToast("Pipeline-Upload fehlgeschlagen: " + (e.message || e), "error");
    } finally { setPipeBusy(false); }
  };

  const readBeleg = async (fileArg) => {
    const file = (fileArg instanceof File) ? fileArg : files[0];
    if (!file) { showToast("Erst einen Beleg scannen/wählen", "error"); return; }
    setOcrBusy(true); setOcrProgress(0);
    try {
      const text = await runOcr(file, setOcrProgress);
      setOcrText(text);
      const parsed = parseBelegText(text);
      if (parsed.date) setDate(parsed.date);
      if (parsed.refSupplier) setRefSupplier(parsed.refSupplier);
      // Positionen direkt mit vorhandenen Artikeln verknüpfen (sichtbar als
      // "✓ Verknüpft" an der Zeile) — statt Freitext/Neuanlage beim Speichern
      if (parsed.lines.length) setLines(parsed.lines.map(l => {
        const hit = fuzzyFindProduct(l.desc, products);
        return hit ? { ...l, fk_product: hit.id } : l;
      }));
      // Lieferant: gegen Liste abgleichen — exakt ODER fuzzy (1 OCR-Tippfehler: "toon"≈"toom").
      if (parsed.supplier) {
        const norm = s => (s || "").toLowerCase().replace(/[^a-zäöüß0-9 ]/g, " ").replace(/\s+/g, " ").trim();
        const stop = /^(gmbh|co|kg|ohg|ag|baumarkt|markt|gartencenter|baustoffe?|handel|und|der|die|das)$/;
        const lev1 = (a, b) => {
          if (a === b) return true;
          if (Math.abs(a.length - b.length) > 1) return false;
          if (a.length === b.length) { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 1) return false; return true; }
          const [s, l] = a.length < b.length ? [a, b] : [b, a];
          let i = 0, j = 0, d = 0;
          while (i < s.length && j < l.length) { if (s[i] === l[j]) { i++; j++; } else { if (++d > 1) return false; j++; } }
          return true;
        };
        const tokens = norm(parsed.supplier).split(" ").filter(t => t.length >= 3 && !stop.test(t));
        const hit = suppliers.find(s => {
          const n = norm(s.name || s.nom || ""); if (!n) return false;
          if (tokens.some(t => n.includes(t))) return true;
          const sToks = n.split(" ").filter(t => t.length >= 4 && !stop.test(t));
          return tokens.some(t => t.length >= 4 && sToks.some(st => lev1(t, st)));
        });
        if (hit) { setSocid(hit.id); setSupplierHint(""); } else setSupplierHint(parsed.supplier);
      }
      const clean = parsed.lines.filter(l => l.desc || l.price > 0).length;
      showToast(clean >= 1
        ? `${parsed.lines.length} Position(en) erkannt – bitte prüfen/ergänzen`
        : "Konnte wenig lesen – bitte Positionen manuell ergänzen (siehe erkannten Text)",
        "success");
    } catch (e) {
      console.error("OCR fehlgeschlagen", e);
      showToast("Beleg-Auslesen fehlgeschlagen", "error");
    } finally { setOcrBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle"/>
        <div className="modal-title">Neue Lieferantenrechnung</div>

        <SearchSelect
          label="Projekt optional"
          value={projectid}
          onChange={pickProject}
          options={projects}
          getLabel={p => `${p.ref ? `${p.ref} · ` : ""}${p.title || p.label || p.ref || `Projekt #${p.id || p.rowid}`}`}
          getSub={p => p.description || ""}
          placeholder="Projekt eintippen…"
          optional
        />

        <SearchSelect
          label="Lieferant *"
          value={socid}
          onChange={setSocid}
          options={suppliers}
          getLabel={s => s.name || s.nom || `Lieferant #${s.id || s.rowid}`}
          getSub={s => [s.town, s.email].filter(Boolean).join(" · ")}
          placeholder="Lieferant eintippen…"
        />
        {supplierHint && !socid && <div style={{fontSize:12,color:"var(--warn)",margin:"-8px 0 12px"}}>Beleg-Händler erkannt: „{supplierHint}" – bitte oben passenden Lieferanten wählen.</div>}

        <div className="field-group mb16">
          <label>Rechnungs-Nr. des Lieferanten</label>
          <input type="text" value={refSupplier} onChange={e => setRefSupplier(e.target.value)} placeholder="z. B. RE-2026-0815 (vom Beleg)" />
          <div style={{fontSize:11,color:"var(--text2)",marginTop:4}}>Muss je Lieferant eindeutig sein. Leer = automatischer Platzhalter.</div>
        </div>

        <div className="form-row mb16">
          <div className="field-group"><label>Rechnungsdatum</label><input type="date" value={date} onChange={e => setDate(e.target.value)}/></div>
          <div className="field-group"><label>Fällig am</label><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/></div>
        </div>

        <div className="section-label">Beleg hochladen / scannen</div>
        <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" style={{display:"none"}} onChange={e => addFiles(e.target.files)} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e => { startScan(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={offlineInputRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e => { handleOfflineReceipt(e.target.files?.[0]); e.target.value = ""; }} />
        <div style={{display:"flex", gap:10, marginBottom:12}}>
          <button className="btn btn-secondary" style={{flex:1}} onClick={() => fileInputRef.current?.click()}><Icon name="upload" size={16}/> Datei</button>
          <button className="btn btn-secondary" style={{flex:1}} onClick={() => openCamera("scan")}><Icon name="image" size={16}/> Scannen</button>
        </div>
        <button className="btn btn-secondary" style={{width:"100%", marginBottom:12}} onClick={() => openCamera("offline")} disabled={offlineBusy}>
          {offlineBusy ? <><div className="spinner" style={{width:15,height:15}}/> Speichere…</> : <><Icon name="archive" size={16}/> Beleg offline ablegen</>}
        </button>
        <div style={{fontSize:11,color:"var(--text2)",marginTop:-8,marginBottom:12}}>Foto direkt ablegen, ohne Auslesen – wird bei Verbindung automatisch übertragen und von der Pipeline gebucht.</div>
        {files.length > 0 && pipelineAvailable && (
          <button className="btn btn-primary" style={{width:"100%", marginBottom:8}} onClick={sendToPipeline} disabled={pipeBusy || ocrBusy}>
            {pipeBusy ? <><div className="spinner" style={{width:15,height:15}}/> Übergebe an Pipeline…</>
              : <><Icon name="upload" size={16}/> Automatisch buchen lassen (Pipeline)</>}
          </button>
        )}
        {files.length > 0 && (
          <button className="btn btn-secondary" style={{width:"100%", marginBottom:12}} onClick={() => readBeleg()} disabled={ocrBusy || pipeBusy}>
            {ocrBusy ? <><div className="spinner" style={{width:15,height:15}}/> Lese Beleg… {Math.round(ocrProgress*100)}%</>
              : <><Icon name="search" size={16}/> Beleg auslesen (lokal)</>}
          </button>
        )}
        {files.length > 0 && <div style={{fontSize:11,color:"var(--text2)",marginBottom:8}}>
          {pipelineAvailable
            ? "Pipeline: Beleg wird nachts automatisch ausgelesen, du bekommst eine Freigabe-Mail an finanzen@. Lokal: sofort hier ausfüllen (Ergebnis prüfen)."
            : "Lokale Texterkennung – Ergebnis bitte immer prüfen."}
        </div>}
        {ocrText && (
          <details style={{marginBottom:12}}>
            <summary style={{fontSize:12,color:"var(--accent)",cursor:"pointer"}}>Erkannten Beleg-Text anzeigen</summary>
            <pre style={{fontSize:11,whiteSpace:"pre-wrap",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",padding:10,marginTop:6,maxHeight:200,overflowY:"auto",color:"var(--text2)"}}>{ocrText}</pre>
          </details>
        )}
        {files.length > 0 && <div style={{marginBottom:16}}>{files.map((f,i)=>(
          <div key={`${f.name}-${i}`} className="file-item">
            <Icon name={f.name.match(/\.(jpg|jpeg|png)$/i) ? "image" : "folder"} size={18}/>
            <span className="fname">{f.name}</span>
            <button className="btn btn-danger btn-xs" onClick={() => setFiles(prev => prev.filter((_,idx)=>idx!==i))}>Entfernen</button>
          </div>
        ))}</div>}

        <div className="section-label">Positionen <span style={{fontWeight:400,color:"var(--text2)",fontSize:11}}>· Preis = Brutto/Stück</span></div>
        {lines.map((l, i) => (
          <DocLine
            key={i}
            line={l}
            products={products}
            canDelete={lines.length > 1}
            onUpd={(k,v) => updLine(i,k,v)}
            onPick={(p) => pickProduct(i,p)}
            onDel={() => delLine(i)}
            kontoOptions={kontoCfg.konten}
            kontoValue={kontoOf(l)}
            onKonto={(v) => updLine(i, "account", v)}
          />
        ))}
        <button className="btn btn-secondary" style={{width:"100%", marginBottom:12}} onClick={addLine}><Icon name="plus" size={15}/> Position hinzufügen</button>
        <label style={{display:"flex", alignItems:"center", gap:8, fontSize:13, margin:"4px 0 12px"}}>
          <input type="checkbox" checked={autoCreate} onChange={e=>setAutoCreate(e.target.checked)} />
          Neue Artikel automatisch in Dolibarr anlegen
        </label>
        <div className="line-total">Gesamt (brutto): {total.toFixed(2).replace(".", ",")} €</div>

        <div className="field-group mb20"><label>Anmerkung</label><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optionale Notiz..." rows={3}/></div>

        <div style={{display:"flex", gap:10}}>
          <button className="btn btn-secondary" style={{flex:1}} onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" style={{flex:1}} onClick={save} disabled={saving}>
            {saving ? <><div className="spinner" style={{width:15,height:15}}/>Erstelle...</> : "Erstellen"}
          </button>
        </div>
      </div>
      {scanFile && <ScanCropModal file={scanFile} onCancel={() => setScanFile(null)} onConfirm={onScanConfirm} showToast={showToast} />}
      {camMode && <CameraCaptureModal
        showToast={showToast}
        onCancel={() => setCamMode(null)}
        onCapture={(f) => { const m = camMode; setCamMode(null); if (m === "offline") handleOfflineReceipt(f); else startScan(f); }}
      />}
    </div>
  );
}

// ─── Proposal List ──────────────────────────────────────────────────────────
function ProposalList({ api, showToast, onDetail }) {
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("accepted");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prop, cust] = await Promise.all([api.getProposals().catch(()=>[]), api.getThirdparties("customer").catch(()=>[])]);
      setItems(Array.isArray(prop)?prop:[]); setCustomers(Array.isArray(cust)?cust:[]);
    } catch { showToast("Ladefehler","error"); }
    finally { setLoading(false); }
  }, [api, showToast]);

  useEffect(() => { if(api) load(); }, [load]);

  const statusMap = { 0:["Entwurf","badge-draft"], 1:["Offen","badge-open"], 2:["Angenommen","badge-paid"], 3:["Abgelehnt","badge-cancelled"], 4:["Fakturiert","badge-paid"] };
  const match = (PROPOSAL_FILTERS.find(o=>o.key===filter)||PROPOSAL_FILTERS[0]).match;
  const shown = items.filter(p => match(Number(p.statut)));

  return (
    <div className="main">
      <div className="page-header">
        <h2>Angebote</h2>
        <button className="btn btn-primary btn-sm" onClick={()=>setShowForm(true)}><Icon name="plus" size={15}/> Neu</button>
      </div>
      <StatusFilter options={PROPOSAL_FILTERS} value={filter} onChange={setFilter} />
      {loading ? <div className="loading"><div className="spinner"/> Lade...</div>
        : shown.length===0 ? <div className="empty-state"><Icon name="proposal" size={48}/><p>Keine Angebote</p></div>
        : shown.map(p => {
          const [label,cls] = statusMap[p.statut]||["–","badge-draft"];
          const cust = customers.find(c=>c.id==p.socid);
          return (
            <div key={p.id} className="list-item" onClick={()=>onDetail(p)}>
              <div className="list-avatar" style={{background:"var(--k-petrol-bg)",color:"var(--k-petrol)"}}><Icon name="proposal" size={19}/></div>
              <div className="list-info">
                <div className="name">{p.ref||`ANG-${p.id}`}</div>
                <div className="sub">{cust?.name||"—"} · {fmtDate(p.date)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div className="list-amount">{fmtMoney(p.total_ttc)}</div>
                <span className={`badge ${cls}`}>{label}</span>
              </div>
            </div>
          );
        })}
      {showForm && <DocForm api={api} type="proposal" customers={customers} onClose={()=>setShowForm(false)}
        onSaved={()=>{setShowForm(false);load();showToast("Angebot erstellt!");}} showToast={showToast}/>}
    </div>
  );
}

// ─── Angebot bearbeiten / kopieren: reine Umrechnung ─────────────────────────
// Der Stueckpreis einer Angebotszeile heisst bei Dolibarr `subprice` und ist
// NETTO. Das ist bewusst nicht derselbe Name wie bei der Lieferantenrechnung,
// die `pu_ht` verlangt — wer den Namen verwechselt, bekommt eine 200er-Antwort
// mit Preis 0. Nachgelesen am Quelltext der laufenden Instanz (Dolibarr 23.0.2,
// comm/propal/class/api_proposals.class.php): `postLine` reicht
// `$request_data->subprice` an `addline()` durch, `putLine` an `updateline()`,
// und `Propal::create()` liest beim Anlegen mit Zeilen ebenfalls
// `$line->subprice`. (10.08.2026)
// Dolibarr legt den Zusatztext als HTML-Schnipsel ab: Zeilenumbrueche stehen
// als <br> drin (an einer echten Zeile geprueft: "…H-Stuetzen<br>\nKo…").
// stripHtml allein wuerde daraus eine durchgehende Zeile machen und beim
// Speichern die Umbrueche wegwerfen — deshalb hin und zurueck uebersetzen.
// Der nachfolgende \n wird mitgeschluckt: Dolibarr schreibt "<br>\n" zurueck,
// sonst wuerde aus jedem Umbruch bei jedem Speichern einer mehr.
const descNachText = (roh) => stripHtml(
  String(roh || "").replace(/<\/p>\s*<p[^>]*>/gi, "\n\n").replace(/<br\s*\/?>[ \t]*\r?\n?/gi, "\n")
).replace(/\n{3,}/g, "\n\n");
const textNachDesc = (text) => String(text || "").trim().replace(/\r\n?/g, "\n").replace(/\n/g, "<br>");

// Der sichtbare Name einer Position steht bei Dolibarr NICHT in desc, sondern
// kommt aus dem verknuepften Artikel (product_label). desc ist der freie Zusatz
// darunter — genau das Feld, in dem bei Inhaber Saetze wie "aufgrund von
// Abseilmaterial und der aufwaendigen…" stehen. (Am Bestand geprueft 10.08.2026.)
const angebotArtikelName = (l) => stripHtml(l.product_label || l.label || l.product_ref || "");

const angebotZeileAusDoli = (l) => {
  const artikelName = angebotArtikelName(l);
  let text = descNachText(l.desc || l.description || "");
  // Frueher schrieb die App den Artikelnamen zusaetzlich nach desc. Dolibarr
  // blendet ihn im PDF ohnehin aus (pdf.lib.php: `$desc != $label`), im
  // Formular saehe er aber wie ein echter Zusatztext aus. Also gar nicht erst
  // anzeigen — beim Speichern verschwindet die Dopplung damit von selbst.
  if (artikelName && text.trim() === artikelName.trim()) text = "";
  return {
    lineid: l.id || l.rowid || null,
    desc: text,
    artikelName,
    qty: parseFloat(l.qty ?? 1) || 0,
    price: parseFloat(l.subprice ?? l.pu_ht ?? 0) || 0,
    tva: parseFloat(l.tva_tx ?? 0) || 0,
    remise_percent: parseFloat(l.remise_percent || 0) || 0,
    fk_product: l.fk_product || "",
    product_type: l.product_type ?? 0,
  };
};

// Eine Position ist gueltig, wenn sie einen Artikel ODER einen Text hat. Nur
// ein Artikel ohne Text ist der Normalfall — so sehen fast alle bestehenden
// Zeilen aus; die frueher verlangte Pflicht-Beschreibung machte genau die
// unspeicherbar.
const angebotZeileLeer = (l) => !l.fk_product && !String(l.desc || "").trim();

const angebotZeileBody = (l) => ({
  desc: textNachDesc(l.desc),
  qty: parseFloat(l.qty || 0) || 0,
  subprice: parseFloat(l.price || 0) || 0,
  tva_tx: parseFloat(l.tva || 0) || 0,
  remise_percent: parseFloat(l.remise_percent || 0) || 0,
  price_base_type: "HT",
  product_type: l.product_type ?? 0,
  ...(l.fk_product ? { fk_product: parseInt(l.fk_product) } : {}),
});

const angebotZeileGleich = (a, b) =>
  String(a.desc || "").trim() === String(b.desc || "").trim()
  && parseFloat(a.qty || 0) === parseFloat(b.qty || 0)
  && parseFloat(a.price || 0) === parseFloat(b.price || 0)
  && parseFloat(a.tva || 0) === parseFloat(b.tva || 0)
  && parseFloat(a.remise_percent || 0) === parseFloat(b.remise_percent || 0);

// Aus altem und neuem Stand die drei noetigen Aufrufslisten bauen. Unveraenderte
// Zeilen tauchen in keiner davon auf — jeder ueberfluessige PUT rechnet die
// Summen des Angebots neu und kostet eine Runde zum Server.
//
// Ein gewechselter Artikel ist bewusst KEIN Grund, die Zeile neu zu schreiben:
// Dolibarrs `updateline` kennt kein fk_product, Loeschen+Neuanlegen wuerde die
// Zeile ans Ende der Liste schieben, und beim Angebot ist die Reihenfolge das,
// was der Kunde spaeter im PDF sieht. Wer wirklich einen anderen Artikel
// verknuepfen will, loescht die Zeile und legt sie neu an.
const angebotZeilenPlan = (alt, neu) => {
  const altListe = Array.isArray(alt) ? alt : [];
  const neuListe = Array.isArray(neu) ? neu : [];
  const behalten = new Set(neuListe.filter((l) => l.lineid).map((l) => String(l.lineid)));
  const loeschen = altListe.filter((o) => o.lineid && !behalten.has(String(o.lineid))).map((o) => o.lineid);
  const aendern = [];
  const anlegen = [];
  for (const l of neuListe) {
    const o = l.lineid ? altListe.find((a) => String(a.lineid) === String(l.lineid)) : null;
    if (!o) anlegen.push(angebotZeileBody(l));
    else if (!angebotZeileGleich(o, l)) aendern.push({ lineid: l.lineid, body: angebotZeileBody(l) });
  }
  return { loeschen, aendern, anlegen };
};

// Payload fuer die Kopie: gleicher Kunde, gleiche Positionen, heutiges Datum,
// wieder Entwurf. Status, Referenz und Unterschriftsdatum des Originals bleiben
// bewusst draussen — die Kopie ist ein neues Angebot, kein Duplikat des Vorgangs.
const angebotKopie = (voll, datumSek) => {
  const projekt = voll.fk_project || voll.fk_projet || voll.projectid || "";
  return {
    socid: parseInt(voll.socid || voll.fk_soc),
    date: datumSek,
    note_public: voll.note_public || "",
    note_private: `Kopie von Angebot ${voll.ref || voll.id}`,
    ...(projekt ? { fk_project: parseInt(projekt) } : {}),
    lines: (Array.isArray(voll.lines) ? voll.lines : []).map((l) => angebotZeileBody(angebotZeileAusDoli(l))),
  };
};

// ─── Proposal Edit ────────────────────────────────────────────────────────────
// Nur im Entwurf. Ein validiertes Angebot liegt beim Kunden — das waere ein
// Zuruecksetzen auf Entwurf und damit eine andere Entscheidung als "Tippfehler
// vor dem Versenden korrigieren".
function ProposalEditModal({ api, proposalId, onClose, onSaved, showToast }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([]);
  const [products, setProducts] = useState([]);
  const orig = useRef({ lines: [], date: "", note: "" });
  const savingRef = useRef(false);

  useEffect(() => { api.getProducts().then((p) => setProducts(Array.isArray(p) ? p : [])).catch(() => {}); }, [api]);

  useEffect(() => {
    (async () => {
      try {
        const d = await api.getProposal(proposalId);
        const di = d.date ? new Date(d.date * 1000).toISOString().slice(0, 10) : todayISO();
        const nt = d.note_public || "";
        const ls = (Array.isArray(d.lines) ? d.lines : []).map(angebotZeileAusDoli);
        setDate(di); setNote(nt); setLines(ls);
        orig.current = { lines: JSON.parse(JSON.stringify(ls)), date: di, note: nt };
      } catch (err) {
        showToast(doliError(err) || "Angebot konnte nicht geladen werden", "error");
        onClose();
      } finally { setLoading(false); }
    })();
  }, [api, proposalId]);

  const updLine = (i, k, v) => setLines((l) => l.map((li, idx) => idx === i ? { ...li, [k]: v } : li));
  const delLine = (i) => setLines((l) => l.filter((_, idx) => idx !== i));
  const addLine = () => setLines((l) => [...l, { lineid: null, desc: "", artikelName: "", qty: 1, price: 0, tva: 0, remise_percent: 0, fk_product: "", product_type: 0 }]);
  // Der Artikelname geht bewusst NICHT nach desc: dort steht der Zusatztext.
  // Frueher landete er dort und stand damit doppelt in der Zeile.
  const pickProduct = (i, prod) => setLines((l) => l.map((li, idx) => idx === i ? {
    ...li,
    artikelName: prod.label || prod.ref || "",
    price: prod.price != null && prod.price !== "" ? parseFloat(prod.price) : li.price,
    // Der Steuersatz kommt bewusst NICHT vom Artikel: er haengt am Steuerstatus
    // von Blattwerk (Kleinunternehmer nach § 19 UStG, Dolibarr steht auf
    // FACTURE_TVAOPTION=0), nicht an der Ware. Acht eingekaufte Artikel tragen
    // im Katalog 19 % — angelegt von der Beleg-Pipeline — und wuerden sonst
    // beim Auswaehlen Umsatzsteuer in ein Kundenangebot ziehen, waehrend der
    // Fusstext § 19 UStG sagt. Von Hand umstellen geht weiterhin.
    fk_product: prod.id,
    product_type: prod.type ?? li.product_type ?? 0,
  } : li));

  const total = lines.reduce((s, l) => s + (parseFloat(l.qty || 0) * parseFloat(l.price || 0) * (1 - parseFloat(l.remise_percent || 0) / 100)) * (1 + parseFloat(l.tva || 0) / 100), 0);

  const save = async () => {
    if (savingRef.current) return;
    if (!lines.length) { showToast("Mindestens eine Position nötig", "error"); return; }
    if (lines.some(angebotZeileLeer)) { showToast("Jede Position braucht einen Artikel oder einen Text", "error"); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      const head = {};
      if (date !== orig.current.date) head.date = Math.floor(new Date(date).getTime() / 1000);
      if (note !== orig.current.note) head.note_public = note;
      if (Object.keys(head).length) await api.updateProposal(proposalId, head);

      const plan = angebotZeilenPlan(orig.current.lines, lines);
      for (const lineid of plan.loeschen) await api.deleteProposalLine(proposalId, lineid);
      for (const a of plan.aendern) await api.updateProposalLine(proposalId, a.lineid, a.body);
      for (const b of plan.anlegen) await api.addProposalLine(proposalId, b);
      onSaved();
    } catch (err) {
      console.error("Angebot bearbeiten fehlgeschlagen", err);
      showToast(doliError(err) || "Speichern fehlgeschlagen", "error");
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal">
        <div className="modal-handle"/>
        <div className="modal-title">Angebot bearbeiten</div>
        {loading ? <div className="loading"><div className="spinner"/> Lade…</div> : <>
          <div className="field-group mb16">
            <label>Datum</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}/>
          </div>
          <div className="section-label">Positionen</div>
          {lines.map((l, i) => (
            <DocLine key={l.lineid || `neu-${i}`} line={l} products={products} canDelete={lines.length > 1} zusatztext
              onUpd={(k, v) => updLine(i, k, v)} onPick={(prod) => pickProduct(i, prod)} onDel={() => delLine(i)} />
          ))}
          <button className="btn btn-secondary" style={{width:"100%",marginBottom:12}} onClick={addLine}><Icon name="plus" size={15}/> Position hinzufügen</button>
          <div className="line-total">Gesamt (brutto): {total.toFixed(2).replace(".",",")} €</div>
          <div className="field-group mb20"><label>Anmerkung</label><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notiz oder Bedingungen..." rows={3}/></div>
          <div style={{display:"flex",gap:10}}>
            <button className="btn btn-secondary" style={{flex:1}} onClick={onClose} disabled={saving}>Abbrechen</button>
            <button className="btn btn-primary" style={{flex:1}} onClick={save} disabled={saving}>
              {saving ? <><div className="spinner" style={{width:15,height:15}}/>Speichere...</> : "Speichern"}
            </button>
          </div>
        </>}
      </div>
    </div>
  );
}

// ─── Proposal Detail ──────────────────────────────────────────────────────────
// Eine Angebotszeile so, wie die Rechnung sie braucht. Steht als eigene
// Funktion hier und nicht inline im Ablauf, weil genau hier am 16.08.2026 Geld
// verloren ging: `remise_percent` fehlte, und aus 265,00 EUR (Angebot
// PR2608-0021, eine Zeile mit 100 % Nachlass) wurden 302,50 EUR auf der
// Rechnung. Ein Rabatt, der beim Rechnungstellen verschwindet, faellt erst dem
// Kunden auf — deshalb ist die Umrechnung jetzt geprueft (test/angebot/
// rechnung-aus-angebot.test.js).
//
// Der Beschreibungstext weicht bewusst NICHT auf "Position" aus, wenn die Zeile
// einen Artikel hat: dort ist er im Angebot absichtlich leer, damit Dolibarr
// den Artikelnamen setzt. "Position" stuende sonst so auf dem PDF beim Kunden.
const rechnungZeileAusAngebot = (l) => {
  const artikel = l.fk_product ? parseInt(l.fk_product) : null;
  const text = l.desc || l.description || l.label || "";
  return {
    desc: text || (artikel ? "" : "Position"),
    qty: parseFloat(l.qty || 1),
    subprice: parseFloat(l.subprice ?? l.price ?? l.total_ht ?? 0),
    tva_tx: parseFloat(l.tva_tx ?? l.vat_rate ?? 19),
    remise_percent: parseFloat(l.remise_percent || 0),
    product_type: Number(l.product_type ?? 0),
    ...(l.date_start ? { date_start: l.date_start } : {}),
    ...(l.date_end ? { date_end: l.date_end } : {}),
    ...(artikel ? { fk_product: artikel } : {}),
  };
};

function ProposalDetail({ api, data, me, onBack, onOpenDetail, showToast }) {
  const [prop, setProp] = useState(data);
  const [customers, setCustomers] = useState([]);
  const [docs, setDocs] = useState([]);
  const [showEmail, setShowEmail] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [copying, setCopying] = useState(false);
  const [pdf, setPdf] = useState(null);
  const [pdfLaedt, setPdfLaedt] = useState(false);

  useEffect(() => {
    api.getThirdparties("customer").then(c=>setCustomers(Array.isArray(c)?c:[])).catch(()=>{});
    api.getDocuments("propal", prop.id).then(d=>setDocs(Array.isArray(d)?d:[])).catch(()=>{});
  }, [api, prop.id]);

  // Kopie: neues Angebot als Entwurf, gleicher Kunde und gleiche Positionen.
  // Geht in jedem Status — genau dafuer ist sie da: das Angebot vom letzten Jahr
  // als Vorlage nehmen, statt alles noch einmal zu tippen.
  const copy = async () => {
    if (copying) return;
    if (!window.confirm("Eine Kopie dieses Angebots als Entwurf anlegen?")) return;
    setCopying(true);
    try {
      const voll = await api.getProposal(prop.id);
      const created = await api.createProposal(angebotKopie(voll, Math.floor(Date.now()/1000)));
      const neuId = typeof created === "number" ? created : (created?.id || created?.rowid);
      showToast("Kopie als Entwurf angelegt!");
      if (neuId && onOpenDetail) {
        const frisch = await api.getProposal(neuId).catch(() => ({ id: neuId }));
        onOpenDetail("proposal", frisch);
      }
    } catch (err) {
      showToast(doliError(err) || "Kopieren fehlgeschlagen", "error");
    } finally { setCopying(false); }
  };

  const validate = async () => {
    try { await api.validateProposal(prop.id); const d = await api.getProposal(prop.id); setProp(d); showToast("Angebot validiert!"); }
    catch (err) { showToast(doliError(err) || "Validieren fehlgeschlagen", "error"); }
  };

  const remove = async () => {
    if (!window.confirm("Dieses Angebot wirklich löschen?")) return;
    try { await api.deleteProposal(prop.id); showToast("Angebot gelöscht!"); onBack(); }
    catch (err) { showToast(doliError(err) || "Löschen fehlgeschlagen", "error"); }
  };

  // Von Hand abhaken, ohne eine Rechnung daraus zu machen. Es gibt Auftraege,
  // die ausserhalb der App abgerechnet werden (Sammelrechnung, Bar, ein Beleg
  // aus Dolibarr selbst) — ohne diesen Weg blieben genau die fuer immer als
  // offen in der Liste stehen, und die Liste taugt dann nicht mehr als
  // Uebersicht ueber das, was noch zu tun ist.
  const alsFakturiert = async () => {
    if (!window.confirm("Dieses Angebot als fakturiert abhaken? Es wird dabei KEINE Rechnung erstellt.")) return;
    try {
      await api.setProposalInvoiced(prop.id);
      const fresh = await api.getProposal(prop.id);
      setProp(fresh);
      showToast("Angebot als fakturiert abgehakt.");
    } catch (err) {
      showToast(doliError(err) || "Konnte nicht auf „Fakturiert“ gesetzt werden", "error");
    }
  };

  const setStatus = async (status) => {
    const label = status === 2 ? "beauftragt" : "abgelehnt";
    if (!window.confirm(`Dieses Angebot wirklich auf ${label} setzen?`)) return;
    try {
      try { await api.setProposalStatus(prop.id, status); }
      catch (e1) {
        if (status === 2) await api.acceptProposal(prop.id);
        else await api.refuseProposal(prop.id);
      }
      const fresh = await api.getProposal(prop.id);
      setProp(fresh);
      showToast(`Angebot als ${label} markiert!`);
    } catch (err) {
      showToast(doliError(err) || `Statuswechsel auf ${label} fehlgeschlagen`, "error");
    }
  };

  const createInvoiceFromProposal = async () => {
    if (!window.confirm("Aus diesem Angebot eine Rechnung erstellen?")) return;
    try {
      let created;
      try {
        created = await api.createInvoiceFromProposal(prop.id);
      } catch (firstErr) {
        // Fallback: create a customer invoice with the same customer/project and copied lines.
        // This is less perfect than Dolibarr's native conversion, but keeps the workflow usable.
        const full = await api.getProposal(prop.id).catch(() => prop);
        const lines = Array.isArray(full.lines) ? full.lines : [];
        created = await api.createInvoice({
          socid: parseInt(full.socid || full.fk_soc),
          date: Math.floor(Date.now()/1000),
          ...(full.fk_project || full.fk_projet || full.projectid ? { fk_project: parseInt(full.fk_project || full.fk_projet || full.projectid) } : {}),
          note_public: full.note_public || "",
          note_private: `Erstellt aus Angebot ${full.ref || prop.ref || prop.id}`,
          // Nachlass auf den ganzen Beleg gibt es zusaetzlich zu dem je Zeile.
          ...(parseFloat(full.remise_percent || 0) ? { remise_percent: parseFloat(full.remise_percent) } : {}),
          ...(parseFloat(full.remise_absolue || 0) ? { remise_absolue: parseFloat(full.remise_absolue) } : {}),
          lines: lines.map(rechnungZeileAusAngebot),
        });
      }
      const invoiceId = typeof created === "number" ? created : (created?.id || created?.rowid || created?.invoice_id || created?.fk_invoice);
      // Das Angebot ist damit erledigt und wird auf "Fakturiert" gesetzt —
      // sonst steht es in der Liste weiter als offen und man bietet demselben
      // Kunden womoeglich ein zweites Mal dasselbe an.
      //
      // Bewusst NACH dem Anlegen und mit eigenem Fehlerpfad: die Rechnung ist
      // an dieser Stelle schon in Dolibarr. Schluege das Abhaken die ganze
      // Aktion fehl, sagte die Meldung "Rechnung konnte nicht erstellt werden",
      // obwohl sie es wurde — und der naechste Versuch legte eine zweite an.
      let abgehakt = true;
      try { await api.setProposalInvoiced(prop.id); }
      catch (_) { abgehakt = false; }
      showToast(abgehakt
        ? "Rechnung aus Angebot erstellt, Angebot ist fakturiert."
        : "Rechnung erstellt — das Angebot konnte aber nicht auf „Fakturiert“ gesetzt werden.",
        abgehakt ? undefined : "error");
      const freshProp = await api.getProposal(prop.id).catch(() => null);
      if (freshProp) setProp(freshProp);
      if (invoiceId && onOpenDetail) {
        const inv = await api.getInvoice(invoiceId).catch(() => ({ id: invoiceId }));
        onOpenDetail("invoice", inv);
      }
    } catch (err) {
      showToast(doliError(err) || "Rechnung konnte nicht aus dem Angebot erstellt werden", "error");
    }
  };

  const statusMap = { 0:["Entwurf","badge-draft"], 1:["Offen","badge-open"], 2:["Angenommen","badge-paid"], 3:["Abgelehnt","badge-cancelled"], 4:["Fakturiert","badge-paid"] };
  const [label,cls] = statusMap[prop.statut]||["–","badge-draft"];
  const cust = customers.find(c=>c.id==prop.socid);

  return (
    <div className="main">
      <div className="page-header">
        <div className="back-btn" onClick={onBack}><Icon name="back" size={20}/></div>
        <h2>Angebot</h2>
        <span className={`badge ${cls}`}>{label}</span>
      </div>
      <div className="detail-hero">
        <div className="detail-ref">{prop.ref||`ANG-${prop.id}`}</div>
        <div className="detail-client">{cust?.name||"—"}</div>
        <div className="detail-amount">{fmtMoney(prop.total_ttc)}</div>
        <div style={{marginTop:16}}>
          <div className="detail-row"><span className="lbl">Netto</span><span className="val">{fmtMoney(prop.total_ht)}</span></div>
          <div className="detail-row"><span className="lbl">MwSt</span><span className="val">{fmtMoney(prop.total_tva)}</span></div>
          <div className="detail-row"><span className="lbl">Datum</span><span className="val">{fmtDate(prop.date)}</span></div>
          <ProjectLinkEditor
            api={api}
            docId={prop.id}
            currentProjectId={prop.fk_project || prop.fk_projet || prop.projectid || ""}
            updateFn={(id, data) => api.updateProposal(id, data)}
            onUpdated={() => api.getProposal(prop.id).then(d => { if(d) setProp(d); }).catch(() => {})}
            showToast={showToast}
          />
        </div>
      </div>
      <div className="action-row action-row-2">
        {Number(prop.statut)===0 && <button className="btn btn-secondary" onClick={()=>setShowEdit(true)}><Icon name="edit" size={16}/> Bearbeiten</button>}
        <button className="btn btn-secondary" onClick={copy} disabled={copying}><Icon name="copy" size={16}/> {copying ? "Kopiere…" : "Kopieren"}</button>
        {Number(prop.statut)===0 && me?.canValidateProposals && <button className="btn btn-success" onClick={validate}><Icon name="validate" size={16}/> Validieren</button>}
        {Number(prop.statut)===1 && me?.canSetProposalStatus && <button className="btn btn-success" onClick={()=>setStatus(2)}><Icon name="validate" size={16}/> Beauftragt</button>}
        {Number(prop.statut)===1 && me?.canSetProposalStatus && <button className="btn btn-warn" onClick={()=>setStatus(3)}><Icon name="close" size={16}/> Abgelehnt</button>}
        {[1,2].includes(Number(prop.statut)) && me?.canValidateInvoices && <button className="btn btn-primary" onClick={createInvoiceFromProposal}><Icon name="invoice" size={16}/> In Rechnung</button>}
        {Number(prop.statut)===2 && me?.canSetProposalStatus && <button className="btn btn-secondary" onClick={alsFakturiert}><Icon name="check" size={16}/> Fakturiert</button>}
        {[0,1,2].includes(Number(prop.statut)) && <button className="btn btn-danger" onClick={remove}><Icon name="trash" size={16}/> Löschen</button>}
        <button className="btn btn-warn" onClick={()=>setShowEmail(true)}><Icon name="mail" size={16}/> Per Mail senden</button>
      </div>
      <div className="action-row">
        <button className="btn btn-secondary" disabled={!prop.ref || pdfLaedt}
          onClick={async ()=>{ setPdfLaedt(true); const p = await pdfErzeugen(api,"proposal",prop.ref||"",showToast); setPdfLaedt(false); if (p) setPdf(p); }}>
          <Icon name="download" size={16}/> {pdfLaedt ? "PDF wird erstellt…" : "PDF ansehen"}
        </button>
      </div>
      <PflanzenSchalter docId={prop.id} an={anwuchsAn(prop)}
        updateFn={(id, data) => api.updateProposal(id, data)}
        onUpdated={() => api.getProposal(prop.id).then(d => { if (d) setProp(d); }).catch(() => {})}
        showToast={showToast}/>
      <NotizEditor api={api} docId={prop.id} note={prop.note_public || ""}
        updateFn={(id, data) => api.updateProposal(id, data)}
        onUpdated={() => api.getProposal(prop.id).then(d => { if (d) setProp(d); }).catch(() => {})}
        showToast={showToast}/>
      <FileUploadSection api={api} modulepart="propal" docid={prop.id} ref_doc={prop.ref||`ANG-${prop.id}`} docs={docs}
        onUploaded={()=>api.getDocuments("propal",prop.id).then(d=>setDocs(Array.isArray(d)?d:[])).catch(()=>{})} showToast={showToast}/>
      {pdf && <DateiAnsichtModal titel={pdf.name} datei={pdf} showToast={showToast}
        onClose={() => { URL.revokeObjectURL(pdf.url); setPdf(null); }} />}
      {showEdit && <ProposalEditModal api={api} proposalId={prop.id}
        onClose={()=>setShowEdit(false)}
        onSaved={async ()=>{ setShowEdit(false); showToast("Angebot gespeichert!");
          const d = await api.getProposal(prop.id).catch(()=>null); if (d) setProp(d); }}
        showToast={showToast}/>}
      {showEmail && <EmailModal api={api} art="angebot" docId={prop.id} onClose={()=>setShowEmail(false)}
        defaultTo={cust?.email||""} defaultSubject={`Angebot ${prop.ref}`}
        onSend={async(d)=>{ await api.sendMailBeleg({ art:"angebot", id:prop.id, ...d }); setShowEmail(false); showToast("E-Mail gesendet!"); }}
        showToast={showToast}/>}
    </div>
  );
}

// ─── File Upload Section ────────────────────────────────────────────────────
// Zeigt ein gespeichertes Dokument (Bild/PDF) an – funktioniert auch für Entwürfe,
// da der Inhalt über /documents/download geladen wird (keine Validierung nötig).
// Gemeinsame Huelle fuer alles, was schon als fertige Datei vorliegt. Mobile
// Browser zeigen PDFs nicht in einem iframe an — deshalb zeichnet PdfCanvasView
// die Seiten selbst (gefunden 22.07.2026).
function DateiAnsichtModal({ titel, datei, onClose, showToast, loading, ladeText }) {
  const istBild = /^image\//.test(datei?.typ || "") || /\.(jpe?g|png|gif|webp)$/i.test(titel || "");
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{maxWidth:"95vw", width:"95vw", height:"90vh", display:"flex", flexDirection:"column"}}>
        <div className="modal-title" style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:8}}>
          <span style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{titel || "Beleg"}</span>
          <div style={{display:"flex", gap:6, flexShrink:0}}>
            <button className="btn btn-secondary btn-xs" disabled={!datei?.url}
              onClick={() => dateiSpeichern({ ...datei, name: datei?.name || titel }, showToast)}>
              <Icon name="download" size={13}/> Speichern
            </button>
            <button className="btn btn-secondary btn-xs" onClick={onClose}>Schließen</button>
          </div>
        </div>
        {loading ? <div className="loading"><div className="spinner"/> {ladeText || "Lade…"}</div>
          : istBild ? <img src={datei.url} alt={titel} style={{maxWidth:"100%", maxHeight:"100%", objectFit:"contain", margin:"auto"}}/>
          : <div style={{flex:1, overflowY:"auto"}}><PdfCanvasView url={datei?.url} maxPages={30} /></div>}
      </div>
    </div>
  );
}

function DocViewerModal({ api, modulepart, doc, onClose, showToast }) {
  const [url, setUrl] = useState("");
  const [inhalt, setInhalt] = useState("");
  const [typ, setTyp] = useState("");
  const [loading, setLoading] = useState(true);
  const isImg = /\.(jpe?g|png|gif|webp)$/i.test(docName(doc));
  useEffect(() => {
    let revoke;
    (async () => {
      try {
        // Der nötige Pfad relativ zum Modul-Wurzelverzeichnis unterscheidet sich je
        // Dolibarr-Version/Modul (mit/ohne Hash-Ordner wie "9/7/REF/…") → Kandidaten
        // aus relativename/filepath/level1name ableiten und durchprobieren.
        const nm = docName(doc);
        const candidates = [];
        if (doc.relativename && String(doc.relativename).includes("/")) candidates.push(doc.relativename);
        if (doc.filepath) {
          const segs = String(doc.filepath).split("/").filter(Boolean);
          for (let s = 0; s < segs.length; s++) candidates.push([...segs.slice(s), nm].join("/"));
        }
        if (doc.level1name) candidates.push(`${doc.level1name}/${nm}`);
        candidates.push(nm);
        // Beim Download heißt der Bereich in Dolibarrs Datei-Zugriffsprüfung anders
        // als beim Listing (files.lib kennt kein "supplier_invoice") — mit dem
        // Listing-Namen bekommen Nicht-Admins 403 Forbidden. Gleiche Übersetzung
        // wie beim PDF-Export, siehe dateiBereich.
        const dlPart = dateiBereich(modulepart);
        let res = null, lastErr = null;
        for (const original of [...new Set(candidates.filter(Boolean))]) {
          try { res = await api.downloadDocument({ module_part: dlPart, original_file: original }); break; }
          catch (e) { lastErr = e; }
        }
        if (!res) throw lastErr || new Error("Beleg nicht gefunden");
        const b64 = res?.content; if (!b64) throw new Error("Kein Inhalt");
        const typ = res["content-type"] || (isImg ? "image/jpeg" : "application/pdf");
        const u = URL.createObjectURL(base64ZuBlob(b64, typ)); revoke = u;
        setUrl(u); setInhalt(b64); setTyp(typ);
      } catch (e) { showToast(doliError(e) || "Beleg konnte nicht geladen werden", "error"); onClose(); }
      finally { setLoading(false); }
    })();
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [api, modulepart, doc]);
  return (
    <DateiAnsichtModal
      titel={docName(doc) || "Anhang"}
      datei={{ url, inhalt, typ, name: docName(doc) || "beleg" }}
      loading={loading} ladeText="Lade Beleg…"
      onClose={onClose} showToast={showToast} />
  );
}

function FileUploadSection({ api, modulepart, docid, ref_doc, docs, onUploaded, showToast }) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [viewDoc, setViewDoc] = useState(null);
  const inputRef = useRef();

  const handleFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    let ok=0, fail=0;
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    const allowedExt = /\.(pdf|jpe?g|png)$/i;
    for (const file of Array.from(files)) {
      try {
        if (!allowedTypes.includes(file.type) && !allowedExt.test(file.name)) { fail++; continue; }
        const autoName = buildFilename(ref_doc, file.name);
        const b64 = await toBase64(file);
        const fd = new FormData();
        fd.append("modulepart", modulepart);
        fd.append("ref", ref_doc);
        fd.append("subdir", "");
        fd.append("filename", autoName);
        fd.append("filecontent", b64.split(",")[1]);
        fd.append("fileencoding", "base64");
        fd.append("overwriteifexists", "0");
        await api.uploadDocument(fd);
        ok++;
      } catch { fail++; }
    }
    setUploading(false);
    if (ok) { showToast(`${ok} Datei(en) hochgeladen!`); onUploaded(); }
    if (fail) showToast(`${fail} Datei(en) fehlgeschlagen`, "error");
  };

  const toBase64 = (file) => new Promise((res, rej) => {
    const r = new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file);
  });

  return (
    <div className="form-section">
      <div className="form-section-title">Anhänge</div>
      <div className={`upload-zone ${dragOver?"drag":""}`}
        onDragOver={e=>{e.preventDefault();setDragOver(true);}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);handleFiles(e.dataTransfer.files);}}
        onClick={()=>inputRef.current?.click()}>
        <input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={e=>handleFiles(e.target.files)} />
        {uploading
          ? <><div className="spinner" style={{margin:"0 auto 8px",display:"block"}}/>Lade hoch...</>
          : <><Icon name="upload" size={28}/><div style={{marginTop:8}}>Tippen zum Hochladen</div>
            <div style={{fontSize:12,marginTop:4,color:"var(--text3)"}}>PDF, JPG/JPEG oder PNG<br/>Dateiname wird automatisch auf<br/><b style={{color:"var(--accent)"}}>{ref_doc}_DATUM_name.ext</b> umbenannt</div></>
        }
      </div>
      {docs.length>0 && docs.map((d,i)=>(
        <div key={i} className="file-item" style={{cursor:"pointer"}} onClick={()=>setViewDoc(d)}>
          <Icon name={docName(d).match(/\.(jpg|jpeg|png|gif)$/i)?"image":"folder"} size={18}/>
          <span className="fname">{docName(d) || "Anhang"}</span>
          <span className="fsize">{d.size ? `${Math.round(d.size/1024)} KB` : ""}</span>
          <Icon name="eye" size={16}/>
        </div>
      ))}
      {viewDoc && <DocViewerModal api={api} modulepart={modulepart} doc={viewDoc} onClose={()=>setViewDoc(null)} showToast={showToast}/>}
    </div>
  );
}

// ─── Email Modal ────────────────────────────────────────────────────────────
function EmailModal({ api, art, docId, onClose, defaultTo, defaultSubject, onSend, showToast, titel, stufe }) {
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState("");
  const [kopieAn, setKopieAn] = useState("");
  const [vorlageLaedt, setVorlageLaedt] = useState(true);
  const [sending, setSending] = useState(false);
  const angefasst = useRef({ subject: false, body: false });

  // Vorbefüllen wie die Dolibarr-Sendemaske: Vorlage (z. B. "Kundenrechnung")
  // mit ausgefüllten Platzhaltern vom Server holen. Bei art="mahnung" kommt
  // die Stufe von aussen (der Mahnstand des Servers bestimmt sie) — die
  // Maske selbst bietet keine Auswahl an, Mahnungen laufen sequenziell.
  useEffect(() => {
    let aktiv = true;
    api.getMailVorlage(art, docId, art === "mahnung" ? stufe : undefined)
      .then(v => { if (!aktiv) return;
        setTo(t => t || v?.empfaenger || "");
        if (!angefasst.current.subject && v?.betreff) setSubject(v.betreff);
        if (!angefasst.current.body && v?.text) setBody(v.text);
        setKopieAn(v?.kopie_an || "");
      })
      .catch(() => {})
      .finally(() => { if (aktiv) setVorlageLaedt(false); });
    return () => { aktiv = false; };
  }, [api, art, docId, stufe]);

  const send = async () => {
    if (!to) { showToast("Empfänger fehlt","error"); return; }
    setSending(true);
    try {
      await onSend({ empfaenger: to, betreff: subject, text: body });
    } catch { showToast("Sendefehler","error"); }
    finally { setSending(false); }
  };

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-handle"/>
        <div className="modal-title">{titel || "Per E-Mail senden"}</div>
        <div className="field-group mb12"><label>An</label><input type="email" value={to} onChange={e=>setTo(e.target.value)} placeholder="empfaenger@beispiel.de"/></div>
        <div className="field-group mb12"><label>Betreff</label><input value={subject} onChange={e=>{angefasst.current.subject=true; setSubject(e.target.value);}} placeholder="Betreff"/></div>
        <div className="field-group mb20"><label>Nachricht</label>
          <textarea value={body} onChange={e=>{angefasst.current.body=true; setBody(e.target.value);}} placeholder={vorlageLaedt?"Vorlage wird geladen…":"Begleittext..."} rows={10}/>
        </div>
        <div style={{fontSize:12,color:"var(--text2)",marginBottom:16}}>
          📎 Das PDF wird automatisch angehängt (und bei Bedarf erzeugt).
          {kopieAn ? <><br/>📬 Eine Kopie geht automatisch verdeckt an {kopieAn}.</> : null}
        </div>
        <div style={{display:"flex",gap:10}}>
          <button className="btn btn-secondary" style={{flex:1}} onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" style={{flex:1}} onClick={send} disabled={sending}>
            {sending?<><div className="spinner" style={{width:15,height:15}}/>Sendet...</>:<><Icon name="mail" size={16}/>Senden</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared Doc Form ────────────────────────────────────────────────────────
function DocForm({ api, type, customers, onClose, onSaved, showToast }) {
  const [socid, setSocid] = useState("");
  // Nur beim Angebot: der Absatz zur Anwuchsgarantie steht in dessen Fusstext.
  const [pflanzen, setPflanzen] = useState(false);
  const [projectid, setProjectid] = useState("");
  const [projects, setProjects] = useState([]);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([{desc:"",artikelName:"",qty:1,price:0,tva:0,fk_product:"",remise_percent:0,product_type:0}]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => { api.getProducts().then(p=>setProducts(Array.isArray(p)?p:[])).catch(()=>{}); }, [api]);
  useEffect(() => { api.getProjects().then(p=>setProjects(Array.isArray(p)?p.filter(isOpenProject):[])).catch(()=>{}); }, [api]);

  const pickProject = (pid) => {
    setProjectid(pid);
    const pr = projects.find(p => String(p.id) === String(pid));
    const psoc = pr?.socid || pr?.fk_soc;
    if (psoc) setSocid(String(psoc));
  };

  const addLine = () => setLines(l=>[...l,{desc:"",artikelName:"",qty:1,price:0,tva:0,fk_product:"",remise_percent:0,product_type:0}]);
  const delLine = (i) => setLines(l=>l.filter((_,idx)=>idx!==i));
  const updLine = (i,k,v) => setLines(l=>l.map((li,idx)=>idx===i?{...li,[k]:v}:li));
  // Fill a whole line from a selected Dolibarr product/service and link it via fk_product.
  // Der Name geht in artikelName (nur Anzeige), NICHT in desc: desc ist bei
  // Dolibarr der Zusatztext unter dem Artikel. Frueher stand der Name in
  // beidem — im PDF blieb das folgenlos (pdf.lib.php blendet `$desc == $label`
  // aus), in der Datenbank war es Doppelung.
  const pickProduct = (i,prod) => setLines(l=>l.map((li,idx)=>idx===i?{
    ...li,
    artikelName: prod.label||prod.ref||"",
    price: prod.price!=null && prod.price!=="" ? parseFloat(prod.price) : li.price,
    // Der Steuersatz kommt bewusst NICHT vom Artikel: er haengt am Steuerstatus
    // von Blattwerk (Kleinunternehmer nach § 19 UStG, Dolibarr steht auf
    // FACTURE_TVAOPTION=0), nicht an der Ware. Acht eingekaufte Artikel tragen
    // im Katalog 19 % — angelegt von der Beleg-Pipeline — und wuerden sonst
    // beim Auswaehlen Umsatzsteuer in ein Kundenangebot ziehen, waehrend der
    // Fusstext § 19 UStG sagt. Von Hand umstellen geht weiterhin.
    fk_product: prod.id,
    product_type: prod.type ?? li.product_type ?? 0,
  }:li));
  const total = lines.reduce((s,l)=>s+(parseFloat(l.qty||0)*parseFloat(l.price||0)*(1-parseFloat(l.remise_percent||0)/100))*(1+parseFloat(l.tva||0)/100),0);

  const save = async () => {
    if (savingRef.current) return; // Doppel-Tipp abfangen, bevor React den Button sperrt
    if (!socid) { showToast("Bitte Kunde wählen","error"); return; }
    if (lines.some(angebotZeileLeer)) { showToast("Jede Position braucht einen Artikel oder einen Text","error"); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      const payload = {
        socid: parseInt(socid),
        date: Math.floor(new Date(date).getTime()/1000),
        note_public: note,
        lines: lines.map(angebotZeileBody),
        ...(projectid ? { fk_project: parseInt(projectid) } : {}),
        // Immer mitschicken, auch ohne Haekchen: Dolibarr ersetzt den
        // Platzhalter im Fusstext nur, wenn das Angebot ueberhaupt eine Zeile
        // in der Zusatzfeld-Tabelle hat (functions.lib.php: der ganze
        // __EXTRAFIELD_*__-Block haengt an `fetch_optionals() > 0`). Ohne die
        // Zeile stuende "__EXTRAFIELD_ANWUCHS_HINWEIS__" im Klartext im PDF
        // beim Kunden — an einem Wegwerf-Angebot genau so gesehen (10.08.2026).
        ...(type === "proposal" ? { array_options: anwuchsFeld(pflanzen) } : {}),
      };
      if (type==="invoice") await api.createInvoice(payload);
      else await api.createProposal(payload);
      onSaved();
    } catch (err) {
      console.error(type==="invoice"?"Rechnung speichern fehlgeschlagen":"Angebot speichern fehlgeschlagen", err);
      showToast(doliError(err) || "Fehler beim Erstellen","error");
    }
    finally { setSaving(false); savingRef.current = false; }
  };

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-handle"/>
        <div className="modal-title">{type==="invoice"?"Neue Rechnung":"Neues Angebot"}</div>
        <SearchSelect
          label="Projekt optional"
          value={projectid}
          onChange={pickProject}
          options={projects}
          getLabel={p => `${p.ref ? `${p.ref} · ` : ""}${p.title || p.label || p.ref || `Projekt #${p.id || p.rowid}`}`}
          getSub={p => p.description || ""}
          placeholder="Projekt eintippen…"
          optional
        />
        <SearchSelect
          label="Kunde *"
          value={socid}
          onChange={setSocid}
          options={customers}
          getLabel={c => c.name || c.nom || `Kunde #${c.id || c.rowid}`}
          getSub={c => [c.town, c.email].filter(Boolean).join(" · ")}
          placeholder="Kunde eintippen…"
        />
        <div className="field-group mb16">
          <label>Datum</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}/>
        </div>
        <div className="section-label">Positionen</div>
        {lines.map((l,i)=>(
          <DocLine key={i} line={l} products={products} canDelete={lines.length>1} zusatztext
            onUpd={(k,v)=>updLine(i,k,v)} onPick={(prod)=>pickProduct(i,prod)} onDel={()=>delLine(i)} />
        ))}
        <button className="btn btn-secondary" style={{width:"100%",marginBottom:12}} onClick={addLine}><Icon name="plus" size={15}/> Position hinzufügen</button>
        <div className="line-total">Gesamt (brutto): {total.toFixed(2).replace(".",",")} €</div>
        <div className="field-group mb20"><label>Anmerkung</label><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Notiz oder Bedingungen..." rows={3}/></div>
        {type === "proposal" && (
          <label className="pflanzen-zeile" style={{marginBottom:16}}>
            <input type="checkbox" checked={pflanzen} onChange={e=>setPflanzen(e.target.checked)} />
            <span>
              <b>Angebot enthält Pflanzen</b>
              <span className="pflanzen-hinweis">Nimmt den Absatz zur Anwuchsgarantie in den Fußtext des PDFs auf. Ohne Pflanzen bleibt er weg.</span>
            </span>
          </label>
        )}
        <div style={{display:"flex",gap:10}}>
          <button className="btn btn-secondary" style={{flex:1}} onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" style={{flex:1}} onClick={save} disabled={saving}>
            {saving?<><div className="spinner" style={{width:15,height:15}}/>Erstelle...</>:"Erstellen"}
          </button>
        </div>
      </div>
    </div>
  );
}

// One invoice/proposal line with a product/service autocomplete on the description
// field. Typing filters Dolibarr products by label or ref; picking one links the
// product (fk_product) and fills price + VAT, just like the Dolibarr web UI.
//
// Mit `zusatztext` (Kundenrechnung und Angebot) liegen Artikel und Text
// getrennt vor — so, wie Dolibarr eine Zeile wirklich speichert: der sichtbare
// Name kommt aus `product_label`, `desc` ist der freie Zusatz darunter. Ohne
// den Schalter bleibt es beim alten Verhalten (Lieferantenrechnung,
// Bestellung), wo ein Feld reicht und der Text ohnehin nicht zum Kunden geht.
function DocLine({ line, products, canDelete, onUpd, onPick, onDel, kontoOptions, kontoValue, onKonto, zusatztext }) {
  const [open, setOpen] = useState(false);
  const [suche, setSuche] = useState("");
  // Ohne Trennung sucht man im Beschreibungsfeld selbst, mit Trennung in einem
  // eigenen Feld — sonst landet der Suchbegriff im Text der Position.
  const q = (zusatztext ? suche : (line.desc || "")).toLowerCase().trim();
  const matches = q.length>=1 ? products.filter(p=>
    (p.label||"").toLowerCase().includes(q) || (p.ref||"").toLowerCase().includes(q)
  ).slice(0,8) : [];
  const vorschlaege = open && matches.length > 0 && (
    <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:50,marginTop:4,background:"var(--surface)",
      border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",boxShadow:"var(--shadow)",maxHeight:220,overflowY:"auto"}}>
      {matches.map(p=>(
        <div key={p.id} onMouseDown={e=>{e.preventDefault(); onPick(p); setSuche(""); setOpen(false);}}
          style={{padding:"10px 12px",cursor:"pointer",borderBottom:"1px solid var(--border)"}}>
          <div style={{fontSize:14,fontWeight:600}}>{p.label||p.ref}</div>
          <div style={{fontSize:12,color:"var(--text2)",marginTop:2}}>
            {[p.ref, p.price!=null&&p.price!==""?fmtMoney(p.price):null].filter(Boolean).join(" · ")}
          </div>
        </div>
      ))}
    </div>
  );
  const artikelName = line.artikelName
    || (products.find(p => String(p.id) === String(line.fk_product)) || {}).label
    || (line.fk_product ? "Dolibarr-Artikel" : "");
  // Eine bereits gespeicherte Zeile kann den Artikel nicht wechseln: Dolibarrs
  // `updateline` kennt kein fk_product. Statt einen Knopf anzubieten, der
  // klaglos nichts tut, steht der Artikel hier fest.
  const gespeichert = !!line.lineid;

  return (
    <div className="line-item-row">
      {zusatztext ? (<>
        <div className="field-group mb12" style={{position:"relative"}}>
          <label>Artikel {!line.fk_product && <span style={{fontWeight:400,color:"var(--text3)",textTransform:"none",letterSpacing:0}}>· optional</span>}</label>
          {line.fk_product ? (
            <div className="artikel-chip">
              <span><Icon name="validate" size={14}/> {artikelName}</span>
              {gespeichert
                ? <span className="artikel-chip-hinweis">nicht wechselbar</span>
                : <button className="btn btn-secondary btn-xs" onClick={()=>{ onUpd("fk_product",""); onUpd("artikelName",""); }}>Lösen</button>}
            </div>
          ) : (
            <input value={suche} placeholder="Artikel aus dem Katalog suchen…"
              onChange={e=>{ setSuche(e.target.value); setOpen(true); }}
              onFocus={()=>setOpen(true)}
              onBlur={()=>setTimeout(()=>setOpen(false),150)} />
          )}
          {!line.fk_product && vorschlaege}
          {gespeichert && line.fk_product && <div style={{fontSize:11,color:"var(--text2)",marginTop:4}}>
            Anderer Artikel? Position löschen und neu anlegen.
          </div>}
        </div>
        <div className="field-group mb12">
          <label>{line.fk_product ? "Zusatztext" : "Beschreibung"} <span style={{fontWeight:400,color:"var(--text3)",textTransform:"none",letterSpacing:0}}>
            · {line.fk_product ? "optional, steht im PDF unter dem Artikel" : "Pflicht ohne Artikel"}</span></label>
          <textarea value={line.desc||""} rows={2}
            placeholder={line.fk_product ? "z. B. Umfang, Besonderheiten, Vereinbarungen…" : "Freie Leistungsbeschreibung"}
            onChange={e=>onUpd("desc", e.target.value)} />
        </div>
      </>) : (
        <div className="field-group mb12" style={{position:"relative"}}>
          <label>Beschreibung</label>
          <input value={line.desc} placeholder="Leistung / Artikel (tippen für Vorschläge)"
            onChange={e=>{ onUpd("desc",e.target.value); onUpd("fk_product",""); setOpen(true); }}
            onFocus={()=>setOpen(true)}
            onBlur={()=>setTimeout(()=>setOpen(false),150)} />
          {vorschlaege}
          {line.fk_product && <div style={{fontSize:11,color:"var(--accent2)",marginTop:4}}>
            ✓ Verknüpft: {artikelName}
          </div>}
        </div>
      )}
      <div className="form-row mb12">
        <div className="field-group"><label>Menge</label><input type="number" value={line.qty} onChange={e=>onUpd("qty",e.target.value)} min="0" step="0.01"/></div>
        <div className="field-group"><label>Preis (€)</label><input type="number" value={line.price} onChange={e=>onUpd("price",e.target.value)} min="0" step="0.01"/></div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
        <div className="field-group" style={{flex:1}}>
          <label>MwSt</label>
          <select value={line.tva} onChange={e=>onUpd("tva",e.target.value)}>
            {[0,7,19].map(t=><option key={t} value={t}>{t}%</option>)}
          </select>
        </div>
        <div className="field-group" style={{flex:1}}>
          <label>Rabatt %</label>
          <input type="number" value={line.remise_percent||0} onChange={e=>onUpd("remise_percent",e.target.value)} min="0" max="100" step="0.5"/>
        </div>
        {canDelete&&<button className="btn btn-danger btn-xs" onClick={onDel}><Icon name="trash" size={13}/></button>}
      </div>
      {kontoOptions && (
        <div className="field-group mb12">
          <label>Buchungskonto <span style={{fontWeight:400,color:"var(--text3)",textTransform:"none",letterSpacing:0}}>· Vorschlag, bitte prüfen</span></label>
          <select value={kontoValue} onChange={e=>onKonto(e.target.value)}>
            {!kontoOptions.some(k=>k.number===kontoValue) && kontoValue && <option value={kontoValue}>{kontoValue}</option>}
            {kontoOptions.map(k => <option key={k.number} value={k.number}>{k.number} · {k.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

// ─── Projects ───────────────────────────────────────────────────────────────
function ProjectList({ api, me, showToast, setPendingCount, onDetail }) {
  const [projects, setProjects] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("open");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.getProjects()
      .then(p => setProjects(Array.isArray(p)?p.filter(isOpenProject):[]))
      .catch(()=>showToast("Ladefehler","error"))
      .finally(()=>setLoading(false));
  }, [api, showToast]);

  useEffect(() => {
    if (!api) return;
    load();
    if (offline.isOnline()) {
      api.getThirdparties("customer").then(c=>setCustomers(Array.isArray(c)?c:[])).catch(()=>{});
    } else {
      // Offline: Kundenliste aus dem lokalen Ref-Cache, ergänzt um noch nicht
      // synchronisierte, offline angelegte Kunden aus der Outbox (als "local:<uuid>").
      Promise.all([
        offline.readRefs("thirdparty").catch(() => []),
        offline.getPending().catch(() => []),
      ]).then(([cached, pending]) => {
        const cachedCustomers = (Array.isArray(cached) ? cached : []).filter(c => Number(c.client) > 0);
        const pendingCustomers = (Array.isArray(pending) ? pending : [])
          .filter(e => e.type === "thirdparty" && e.payload?.client)
          .map(e => ({ id: "local:" + e.id, name: (e.payload?.name || "Unbenannt") + " (offline)" }));
        setCustomers([...cachedCustomers, ...pendingCustomers]);
      }).catch(() => {});
    }
  }, [load]);

  const match = (PROJECT_FILTERS.find(o=>o.key===filter)||PROJECT_FILTERS[0]).match;
  const filtered = projects
    .filter(p=>match(Number(p.statut)))
    .filter(p=>(p.title||p.ref||"").toLowerCase().includes(search.toLowerCase()));

  const statusColor = (s) => ({0:"var(--text3)",1:"var(--accent)",2:"var(--accent2)",3:"var(--danger)"}[s]||"var(--text2)");
  const statusLabel = (s) => ({0:"Entwurf",1:"Offen",2:"Abgeschlossen",3:"Storno"}[s]||"—");

  return (
    <div className="main">
      <div className="page-header">
        <h2>Projekte</h2>
        <button className="btn btn-primary btn-sm" onClick={()=>setShowForm(true)}><Icon name="plus" size={15}/> Neu</button>
      </div>
      <input className="search-bar" placeholder="Projekt suchen..." value={search} onChange={e=>setSearch(e.target.value)}/>
      <StatusFilter options={PROJECT_FILTERS} value={filter} onChange={setFilter} />
      {loading ? <div className="loading"><div className="spinner"/> Lade...</div>
        : filtered.length===0 ? <div className="empty-state"><Icon name="project" size={48}/><p>Keine Projekte</p></div>
        : filtered.map(p=>{
          const pct = p.usage_time_progress||0;
          return (
            <div key={p.id} className="project-card" onClick={()=>onDetail(p)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div className="project-title">{p.title||p.ref||`Projekt #${p.id}`}</div>
                <span style={{fontSize:11,fontWeight:700,color:statusColor(p.statut)}}>{statusLabel(p.statut)}</span>
              </div>
              <div className="project-meta">
                {p.date_start && <span>Start: {fmtDate(p.date_start)}</span>}
                {p.date_end && <span>Ende: {fmtDate(p.date_end)}</span>}
                {p.budget_amount>0 && <span>Budget: {fmtMoney(p.budget_amount)}</span>}
              </div>
              {p.description && <div style={{fontSize:13,color:"var(--text2)",marginTop:8,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{p.description}</div>}
              <div className="progress-bar">
                <div className="progress-fill" style={{width:`${Math.min(pct,100)}%`}}/>
              </div>
              <div style={{fontSize:11,color:"var(--text2)",marginTop:4,textAlign:"right"}}>{pct}% Fortschritt</div>
            </div>
          );
        })}
      {showForm && <ProjectForm api={api} customers={customers} me={me} setPendingCount={setPendingCount} onClose={()=>setShowForm(false)}
        onSaved={(opts)=>{
          setShowForm(false);
          if (opts?.offline) { showToast("Offline gespeichert – wird synchronisiert, sobald wieder online."); return; }
          load();
          showToast("Projekt erstellt!");
        }} showToast={showToast}/>}
    </div>
  );
}

// ─── Project Form ─────────────────────────────────────────────────────────────
function ProjectForm({ api, customers, me, setPendingCount, onClose, onSaved, showToast }) {
  const [form, setForm] = useState({
    title:"", ref:"", socid:"", dateStart:todayISO(), timeStart:"08:00", dateEnd:"", timeEnd:"17:00", budget:"", description:"", statut:"1",
  });
  const [saving, setSaving] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const customerMatches = customerQuery.trim().length >= 1
    ? customers.filter(c => (c.name || "").toLowerCase().includes(customerQuery.toLowerCase())).slice(0, 8)
    : customers.slice(0, 8);

  const pickCustomer = (c) => {
    setForm(p => ({ ...p, socid: c.id }));
    setCustomerQuery(c.name || "");
    setCustomerOpen(false);
  };

  const clearCustomer = () => {
    setForm(p => ({ ...p, socid: "" }));
    setCustomerQuery("");
    setCustomerOpen(false);
  };

  const save = async () => {
    if (!form.title) { showToast("Titel ist Pflicht", "error"); return; }
    setSaving(true);
    // form.socid ist entweder eine echte Dolibarr-ID (String einer Zahl) oder,
    // wenn der gewählte Kunde selbst noch offline/unsynchronisiert ist, ein
    // "local:<uuid>"-Verweis auf einen Outbox-Eintrag (siehe Kundenliste oben).
    const chosen = form.socid;
    const isLocalCustomerRef = typeof chosen === "string" && chosen.startsWith("local:");
    try {
      if (!isLocalCustomerRef && offline.isOnline() && window.__api) {
        const payload = {
          ref: form.ref || genCode("PJ"),
          title: form.title,
          statut: parseInt(form.statut),
          public: 1,
          date_start: toEpochLocal(form.dateStart, form.timeStart),
          agenda_date_start: toEpochDolibarrWallTime(form.dateStart, form.timeStart),
          description: form.description,
        };
        if (form.socid) payload.socid = parseInt(form.socid);
        if (form.dateEnd) {
          payload.date_end = toEpochLocal(form.dateEnd, form.timeEnd);
          payload.agenda_date_end = toEpochDolibarrWallTime(form.dateEnd, form.timeEnd);
        }
        if (form.budget) payload.budget_amount = parseFloat(form.budget);
        const created = await api.createProject(payload);
        const projectId = typeof created === "number" ? created : (created?.id || created?.rowid);
        if (projectId) {
          try { await createAgendaForProject(api, projectId, { ...payload, id: projectId }); } catch (e) { console.warn("Agenda-Termin für Projekt konnte nicht erstellt werden", e); }
          // Dolibarr-Zeiterfassung läuft technisch über Aufgaben, nicht direkt über Projekte.
          // Darum wird direkt eine Standard-Aufgabe angelegt, damit das neue Projekt sofort
          // in der Zeiterfassung auswählbar ist. Zusätzlich wird das Projekt als "public"
          // angelegt; damit sehen interne Mitarbeiter das Projekt auch ohne manuelle Kontaktrolle.
          try {
            const defaultTaskPayload = {
              ref: genCode("TASK"),
              label: "Allgemein",
              description: "Standard-Aufgabe für Zeiterfassung",
              fk_project: parseInt(projectId),
              date_start: toEpochLocal(form.dateStart, form.timeStart),
              agenda_date_start: toEpochDolibarrWallTime(form.dateStart, form.timeStart),
              ...(form.dateEnd ? { date_end: toEpochLocal(form.dateEnd, form.timeEnd), agenda_date_end: toEpochDolibarrWallTime(form.dateEnd, form.timeEnd) } : {}),
              progress: 0,
              array_options: { options_billable: "1" },
            };
            const defaultTask = await api.createTask(defaultTaskPayload);
            const defaultTaskId = typeof defaultTask === "number" ? defaultTask : (defaultTask?.id || defaultTask?.rowid);
            if (defaultTaskId) {
              try { await createAgendaForTask(api, defaultTaskId, defaultTaskPayload, { ...payload, id: projectId }); } catch (e) { console.warn("Agenda-Termin für Standard-Aufgabe konnte nicht erstellt werden", e); }
            }
          } catch (e) {
            console.warn("Standard-Aufgabe konnte nicht erstellt werden", e);
          }
          try {
            const users = await api.getUsers();
            const arr = Array.isArray(users) ? users : [];
            await Promise.allSettled(arr.map(u => api.addUserToProject(projectId, u.id || u.rowid)));
          } catch (e) {
            console.warn("Mitarbeiter konnten nicht zusätzlich als Projektkontakte gesetzt werden", e);
          }
        }
        onSaved();
      } else {
        // Offline (oder der gewählte Kunde ist selbst noch ein nicht synchronisierter
        // Outbox-Eintrag): Anlage in die Outbox statt direktem API-Call. Folgeschritte,
        // die eine echte Server-Projekt-ID brauchen (Agenda-Termin, Standard-Aufgabe,
        // Mitarbeiter-Zuordnung), können hier nicht ausgeführt werden und entfallen -
        // das ist ein bekannter Funktionsunterschied zur Online-Anlage.
        const deps = isLocalCustomerRef ? [chosen.slice("local:".length)] : [];
        await offline.enqueue({
          type: "project",
          payload: {
            ref: form.ref || genCode("PJ"),
            public: 1,
            title: form.title,
            description: form.description || "",
            thirdpartyRef: chosen || null,
            dateStart: toEpochLocal(form.dateStart, form.timeStart),
            dateEnd: form.dateEnd ? toEpochLocal(form.dateEnd, form.timeEnd) : null,
            // Für den Kalender-Nachsync (siehe createCalendarForSyncedEntry):
            // Dolibarr zeigt Agenda-Termine als Wandzeit an, siehe
            // toEpochDolibarrWallTime weiter oben - dateStart/dateEnd allein
            // ergäben dort eine falsche Uhrzeit.
            agendaDateStart: toEpochDolibarrWallTime(form.dateStart, form.timeStart),
            agendaDateEnd: form.dateEnd ? toEpochDolibarrWallTime(form.dateEnd, form.timeEnd) : null,
          },
          deps,
          createdBy: me?.login || "",
        });
        setPendingCount(c => c + 1);
        onSaved({ offline: true });
      }
    } catch (err) { showToast(err.message || "Speicherfehler", "error"); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-handle"/>
        <div className="modal-title">Neues Projekt</div>
        <div className="field-group mb12">
          <label>Titel *</label>
          <input value={form.title} onChange={set("title")} placeholder="Projektname"/>
        </div>
        <div className="field-group mb12">
          <label>Referenz (optional)</label>
          <input value={form.ref} onChange={set("ref")} placeholder="Leer lassen für automatische Vergabe"/>
        </div>
        <SearchSelect
          label="Kunde optional"
          value={form.socid}
          onChange={(id) => setForm(p => ({ ...p, socid: id }))}
          options={customers}
          getLabel={c => c.name || c.nom || `Kunde #${c.id || c.rowid}`}
          getSub={c => [c.town, c.email].filter(Boolean).join(" · ")}
          placeholder="Kunde eintippen…"
          optional
        />
        <div className="form-row mb12">
          <div className="field-group"><label>Startdatum</label><input type="date" value={form.dateStart} onChange={set("dateStart")}/></div>
          <div className="field-group"><label>Startzeit</label><TimeField value={form.timeStart} onChange={set("timeStart")}/></div>
        </div>
        <div className="form-row mb12">
          <div className="field-group"><label>Enddatum</label><input type="date" value={form.dateEnd} onChange={set("dateEnd")}/></div>
          <div className="field-group"><label>Endzeit</label><TimeField value={form.timeEnd} onChange={set("timeEnd")}/></div>
        </div>
        <div className="form-row mb12">
          <div className="field-group"><label>Budget (€)</label><input type="number" value={form.budget} onChange={set("budget")} min="0" step="0.01" placeholder="0,00"/></div>
          <div className="field-group"><label>Status</label>
            <select value={form.statut} onChange={set("statut")}>
              <option value="0">Entwurf</option>
              <option value="1">Offen</option>
            </select>
          </div>
        </div>
        <div className="field-group mb20"><label>Beschreibung</label><textarea value={form.description} onChange={set("description")} placeholder="Worum geht es?" rows={3}/></div>
        <div style={{display:"flex",gap:10}}>
          <button className="btn btn-secondary" style={{flex:1}} onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" style={{flex:1}} onClick={save} disabled={saving}>
            {saving?<><div className="spinner" style={{width:15,height:15}}/>Erstelle...</>:"Erstellen"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Project Detail ──────────────────────────────────────────────────────────
function ProjectDetail({ api, data, me, onBack, onOpenDetail, showToast }) {
  const block = useBlock();
  const funktion = useFunktion();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [project, setProject] = useState(data);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showGbuForm, setShowGbuForm] = useState(false);
  const [linked, setLinked] = useState({ invoices: [], supplierInvoices: [], proposals: [], expenses: [] });
  const [linkedLoading, setLinkedLoading] = useState(false);

  const loadTasks = useCallback(() => {
    const pid = String(data.id || data.rowid);
    setLoading(true);
    return api.getProjectTasks(pid)
      .then(async t => {
        let arr = Array.isArray(t) ? t : [];
        // Einige Dolibarr-Versionen liefern /projects/{id}/tasks leer zurück.
        // Dann nehmen wir die globale Taskliste und filtern lokal nach Projekt.
        if (arr.length === 0) {
          const all = await api.getTasks().catch(() => []);
          arr = (Array.isArray(all) ? all : []).filter(x => String(x.fk_project || x.fk_projet || x.projectid || "") === pid);
        }
        setTasks(arr);
      })
      .catch(async () => {
        const all = await api.getTasks().catch(() => []);
        setTasks((Array.isArray(all) ? all : []).filter(x => String(x.fk_project || x.fk_projet || x.projectid || "") === pid));
      })
      .finally(()=>setLoading(false));
  }, [api, data.id, data.rowid]);

  useEffect(() => { loadTasks(); }, [loadTasks]);
  useEffect(() => { api.getUsers().then(u=>setUsers(Array.isArray(u)?u:[])).catch(()=>{}); }, [api]);

  const sameProject = (obj) => String(obj?.fk_project || obj?.fk_projet || obj?.projectid || obj?.fk_project_id || "") === String(project.id || project.rowid);
  const loadLinkedObjects = useCallback(() => {
    if (!api) return;
    setLinkedLoading(true);
    Promise.all([
      api.getInvoices().catch(() => []),
      api.getSupplierInvoices().catch(() => []),
      api.getProposals().catch(() => []),
      api.getExpenseReports().catch(() => []),
    ]).then(([invoices, supplierInvoices, proposals, expenses]) => {
      setLinked({
        invoices: (Array.isArray(invoices) ? invoices : []).filter(sameProject),
        supplierInvoices: (Array.isArray(supplierInvoices) ? supplierInvoices : []).filter(sameProject),
        proposals: (Array.isArray(proposals) ? proposals : []).filter(sameProject),
        expenses: (Array.isArray(expenses) ? expenses : []).filter(sameProject),
      });
    }).finally(() => setLinkedLoading(false));
  }, [api, project.id, project.rowid]);
  useEffect(() => { loadLinkedObjects(); }, [loadLinkedObjects]);

  const remove = async () => {
    if (!window.confirm("Dieses Projekt wirklich löschen?")) return;
    setDeleting(true);
    try {
      const projectId = project.id || project.rowid;
      const agendaEvents = await api.getAgendaEvents().catch(() => []);
      const taskIds = (tasks || []).map(t => t.id || t.rowid).filter(Boolean);
      await deleteAgendaEventsQuietly(api, findAgendaEventsForProject(agendaEvents, projectId, taskIds));
      const nc = loadNcConfig();
      if (ncReady(nc)) {
        await ncDeleteEvent(nc, ncProjectUid(projectId));
        await Promise.allSettled(taskIds.map(tid => ncDeleteEvent(nc, ncTaskUid(tid))));
      }
      await api.deleteProject(projectId);
      showToast("Projekt und zugehörige Termine gelöscht!");
      onBack();
    } catch { showToast("Löschen fehlgeschlagen", "error"); setDeleting(false); }
  };

  const closeProject = async () => {
    if (!window.confirm("Dieses Projekt wirklich schließen?")) return;
    setClosing(true);
    try {
      await api.closeProject(project.id || project.rowid);
      const fresh = await api.getProject(project.id || project.rowid).catch(() => ({ ...project, statut: 2 }));
      setProject(fresh);
      showToast("Projekt geschlossen!");
    } catch (err) {
      showToast(doliError(err) || "Projekt konnte nicht geschlossen werden", "error");
    } finally { setClosing(false); }
  };

  const removeTask = async (task) => {
    if (!window.confirm("Diese Aufgabe wirklich löschen?")) return;
    try {
      const taskId = task.id || task.rowid;
      const agendaEvents = await api.getAgendaEvents().catch(() => []);
      await deleteAgendaEventsQuietly(api, findAgendaEventsForTask(agendaEvents, taskId));
      const nc = loadNcConfig();
      if (ncReady(nc)) await ncDeleteEvent(nc, ncTaskUid(taskId));
      await api.deleteTask(taskId);
      showToast("Aufgabe und zugehöriger Termin gelöscht!");
      loadTasks();
    } catch { showToast("Aufgabe konnte nicht gelöscht werden", "error"); }
  };

  const done = tasks.filter(t=>t.progress==100).length;

  return (
    <div className="main">
      <div className="page-header">
        <div className="back-btn" onClick={onBack}><Icon name="back" size={20}/></div>
        <h2>{project.title||project.ref}</h2>
      </div>
      <div className="detail-hero">
        <div className="detail-ref" style={{fontSize:16}}>{project.ref}</div>
        {project.description && <div style={{color:"var(--text2)",fontSize:14,margin:"8px 0 14px"}}>{project.description}</div>}
        <div className="detail-row"><span className="lbl">Start</span><span className="val">{fmtDate(project.date_start)}</span></div>
        <div className="detail-row"><span className="lbl">Ende</span><span className="val">{fmtDate(project.date_end)}</span></div>
        {project.budget_amount>0&&<div className="detail-row"><span className="lbl">Budget</span><span className="val">{fmtMoney(project.budget_amount)}</span></div>}
        <div className="progress-bar" style={{marginTop:14}}>
          <div className="progress-fill" style={{width:`${Math.min(project.usage_time_progress||0,100)}%`}}/>
        </div>
        <div style={{fontSize:12,color:"var(--text2)",marginTop:4,textAlign:"right"}}>{project.usage_time_progress||0}% Fortschritt</div>
      </div>

      {me?.canCloseProject && isOpenProject(project) && (
        <div className="action-row">
          <button className="btn btn-warn" onClick={closeProject} disabled={closing}><Icon name="validate" size={16}/> Projekt schließen</button>
        </div>
      )}

      {canDeleteRecord(project, me) && (
        <div className="action-row">
          <button className="btn btn-danger" onClick={remove} disabled={deleting}><Icon name="trash" size={16}/> Löschen</button>
        </div>
      )}

      <div className="action-row">
        <button className="btn btn-primary" onClick={() => setShowTaskForm(true)}><Icon name="plus" size={16}/> Aufgabe erstellen</button>
        {block("arbeitsschutz") && funktion("gbu") && <button className="btn btn-ghost" onClick={() => setShowGbuForm(true)}><Icon name="shield" size={16}/> Gefährdungsbeurteilung</button>}
      </div>

      <div className="section-label">{loading?"Lade Aufgaben...":tasks.length===0?"Keine Aufgaben":`Aufgaben (${done}/${tasks.length} erledigt)`}</div>
      {!loading && tasks.map(t=>(
        <div key={t.id} className="task-item">
          <div className={`task-check ${t.progress==100?"done":""}`}>
            {t.progress==100&&<Icon name="check" size={11}/>}
          </div>
          <div style={{flex:1}}>
            <div style={{fontWeight:600,fontSize:14}}>{t.label||t.ref||`Task #${t.id}`}</div>
            {t.description&&<div style={{fontSize:12,color:"var(--text2)",marginTop:2}}>{t.description}</div>}
            <div style={{fontSize:12,color:"var(--text3)",marginTop:4}}>{t.progress||0}% · {fmtDateTime(t.date_start)} – {fmtDateTime(t.date_end)}</div>
          </div>
          <button className="btn btn-danger btn-xs" onClick={() => removeTask(t)}><Icon name="trash" size={13}/></button>
        </div>
      ))}

      <ProjectLinkedObjects linked={linked} loading={linkedLoading} onOpenDetail={onOpenDetail} />

      {showTaskForm && (
        <TaskForm
          api={api}
          project={project}
          users={users}
          onClose={() => setShowTaskForm(false)}
          onSaved={() => { setShowTaskForm(false); loadTasks(); showToast("Aufgabe erstellt!"); }}
          showToast={showToast}
        />
      )}

      {showGbuForm && (
        <GbuFormSkt
          api={api} me={me} project={project} showToast={showToast}
          onClose={() => setShowGbuForm(false)}
          onSaved={() => setShowGbuForm(false)}
        />
      )}
    </div>
  );
}


// Zeigt das verknüpfte Projekt eines Dokuments und ermöglicht das Ändern via PUT.
// ─── Anwuchsgarantie: nur auf Angeboten mit Pflanzen ─────────────────────────
// Der Absatz stand bis zum 10.08.2026 fest im Fusstext JEDES Angebots — auch
// auf einem reinen Haecksler-Einsatz, wo von Pflanzen keine Rede ist. Jetzt
// steht im Fusstext (`PROPOSAL_FREE_TEXT`) an seiner Stelle der Platzhalter
// `__EXTRAFIELD_ANWUCHS_HINWEIS__`, und dieses Zusatzfeld am Angebot traegt den
// Text — oder eben nichts. Dolibarr setzt Platzhalter im Fusstext ueber
// `make_substitutions` ein (core/lib/pdf.lib.php, pdf_pagefoot).
//
// Der Wortlaut muss zu dem passen, der beim Umstellen in den Bestand
// geschrieben wurde: nur so erkennt der Schalter unten einen bestehenden
// Hinweis wieder. Erkannt wird am Stichwort, gesetzt wird der volle Text.
const ANWUCHS_HINWEIS = "Eine Gewähr für das Anwachsen der gelieferten bzw. eingepflanzten Pflanzen (Anwuchsgarantie) wird ausdrücklich nicht übernommen. Voraussetzung für ein erfolgreiches Anwachsen ist insbesondere die sach- und fachgerechte Pflege, Bewässerung und Standortpflege durch den Kunden. Hiervon unberührt bleiben gesetzliche Mängelansprüche hinsichtlich der Qualität der gelieferten Pflanzen zum Zeitpunkt der Übergabe.";

const anwuchsAn = (doc) => /Anwuchsgarantie/i.test(doc?.array_options?.options_anwuchs_hinweis || "");
const anwuchsFeld = (an) => ({ options_anwuchs_hinweis: an ? ANWUCHS_HINWEIS : "" });

// Kein eigener Merker neben dem Text: der Text selbst IST der Zustand. Ein
// zweites Feld koennte davon abweichen, und Angebote aus Dolibarrs eigener
// Oberflaeche haetten es gar nicht.
function PflanzenSchalter({ docId, an, updateFn, onUpdated, showToast }) {
  const [speichert, setSpeichert] = useState(false);
  const umschalten = async () => {
    if (speichert) return;
    setSpeichert(true);
    try {
      await updateFn(docId, { array_options: anwuchsFeld(!an) });
      showToast(!an ? "Hinweis zur Anwuchsgarantie aufgenommen" : "Hinweis entfernt");
      onUpdated?.();
    } catch (err) {
      showToast(doliError(err) || "Konnte nicht gespeichert werden", "error");
    } finally { setSpeichert(false); }
  };
  return (
    <div className="notiz-block">
      <label className="pflanzen-zeile">
        <input type="checkbox" checked={an} onChange={umschalten} disabled={speichert} />
        <span>
          <b>Angebot enthält Pflanzen</b>
          <span className="pflanzen-hinweis">
            Nimmt den Absatz zur Anwuchsgarantie in den Fußtext des PDFs auf. Ohne Pflanzen bleibt er weg.
          </span>
        </span>
      </label>
    </div>
  );
}

// Notiz am Beleg (`note_public`) — der Text, der bei Dolibarr im PDF unter den
// Positionen steht: Gueltigkeitsdauer, Zahlungshinweis, Absprachen. Etwas
// anderes als der Zusatztext einer Position, der zu einer einzelnen Leistung
// gehoert; beides gibt es bewusst nebeneinander, so wie in Dolibarr auch.
// Nachtraeglich aenderbar in jedem Status: `PUT /proposals|invoices/{id}` setzt
// das Feld direkt am Objekt, ohne Entwurf-Zwang (am Quelltext der Instanz
// nachgelesen und an einem Wegwerf-Angebot geprueft, 10.08.2026).
function NotizEditor({ api, docId, note, updateFn, onUpdated, showToast }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note || "");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setText(note || ""); }, [note]);

  const save = async () => {
    setSaving(true);
    try {
      await updateFn(docId, { note_public: text });
      showToast("Notiz gespeichert!");
      setEditing(false);
      onUpdated?.();
    } catch (err) {
      showToast(doliError(err) || "Notiz konnte nicht gespeichert werden", "error");
    } finally { setSaving(false); }
  };

  return (
    <div className="notiz-block">
      <div className="section-label" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
        <span>Notiz <span style={{fontWeight:400,color:"var(--text3)",textTransform:"none",letterSpacing:0}}>· steht im PDF</span></span>
        {!editing && <button className="btn btn-secondary btn-xs" onClick={() => setEditing(true)}>
          <Icon name="edit" size={12}/> {note ? "Ändern" : "Hinzufügen"}
        </button>}
      </div>
      {editing ? (
        <>
          <div className="field-group mb12">
            <textarea value={text} rows={4} onChange={(e) => setText(e.target.value)}
              placeholder="z. B. Angebot 30 Tage gültig. Ausführung nach Absprache." />
          </div>
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-secondary btn-sm" style={{flex:1}} onClick={() => { setText(note || ""); setEditing(false); }} disabled={saving}>Abbrechen</button>
            <button className="btn btn-primary btn-sm" style={{flex:1}} onClick={save} disabled={saving}>{saving ? "Speichere…" : "Speichern"}</button>
          </div>
        </>
      ) : (
        <div className="notiz-text">{note ? note : <span style={{color:"var(--text3)"}}>Keine Notiz</span>}</div>
      )}
    </div>
  );
}

function ProjectLinkEditor({ api, docId, currentProjectId, updateFn, onUpdated, showToast }) {
  const [editing, setEditing] = useState(false);
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Nur offene Projekte anbieten; ein bereits verknüpftes (ggf. geschlossenes) bleibt sichtbar.
    api.getProjects().then(p => {
      const arr = Array.isArray(p) ? p : [];
      setProjects(arr.filter(x => isOpenProject(x) || String(x.id || x.rowid) === String(currentProjectId || "")));
    }).catch(() => {});
  }, [api, currentProjectId]);

  useEffect(() => {
    setSelectedId(currentProjectId ? String(currentProjectId) : "");
  }, [currentProjectId]);

  const currentProject = projects.find(p => String(p.id || p.rowid) === String(currentProjectId || ""));

  const save = async () => {
    setSaving(true);
    try {
      await updateFn(docId, { fk_project: selectedId ? parseInt(selectedId) : 0 });
      showToast("Projekt verknüpft!");
      setEditing(false);
      onUpdated?.();
    } catch (err) {
      showToast(doliError(err) || "Projekt konnte nicht verknüpft werden", "error");
    } finally { setSaving(false); }
  };

  return editing ? (
    <div style={{marginBottom:12}}>
      <SearchSelect
        label="Projekt"
        value={selectedId}
        onChange={setSelectedId}
        options={projects}
        getLabel={p => `${p.ref ? `${p.ref} · ` : ""}${p.title || p.label || p.ref || `Projekt #${p.id || p.rowid}`}`}
        getSub={p => p.description || ""}
        placeholder="Projekt eintippen…"
        optional
      />
      <div style={{display:"flex",gap:8}}>
        <button className="btn btn-secondary btn-sm" style={{flex:1}} onClick={() => setEditing(false)}>Abbrechen</button>
        <button className="btn btn-primary btn-sm" style={{flex:1}} onClick={save} disabled={saving}>{saving ? "Speichere…" : "Speichern"}</button>
      </div>
    </div>
  ) : (
    <div className="detail-row">
      <span className="lbl">Projekt</span>
      <span className="val" style={{display:"flex",alignItems:"center",gap:8}}>
        <span>{currentProject ? (currentProject.title || currentProject.ref || `#${currentProject.id}`) : "—"}</span>
        <button className="btn btn-secondary btn-xs" onClick={() => setEditing(true)}><Icon name="edit" size={12}/> Ändern</button>
      </span>
    </div>
  );
}

function ProjectLinkedObjects({ linked, loading, onOpenDetail }) {
  const statusProposal = (s) => ({0:"Entwurf",1:"Offen",2:"Angenommen",3:"Abgelehnt",4:"Fakturiert"}[Number(s)] || "—");
  const statusInvoice = (s) => ({0:"Entwurf",1:"Offen",2:"Bezahlt",3:"Storno"}[Number(s)] || "—");
  const total = (linked.invoices?.length || 0) + (linked.supplierInvoices?.length || 0) + (linked.proposals?.length || 0) + (linked.expenses?.length || 0);
  const Row = ({ icon, title, sub, amount, onClick }) => (
    <div className="linked-row" onClick={onClick}>
      <div className="linked-icon"><Icon name={icon} size={16}/></div>
      <div style={{flex:1,minWidth:0}}>
        <div className="linked-title">{title}</div>
        <div className="linked-sub">{sub}</div>
      </div>
      {amount !== undefined && <div className="linked-amount">{fmtMoney(amount)}</div>}
    </div>
  );
  return (
    <div className="form-section">
      <div className="form-section-title">Verknüpfte Vorgänge</div>
      {loading ? <div className="loading" style={{padding:12}}><div className="spinner"/> Lade Verknüpfungen...</div>
        : total === 0 ? <div style={{fontSize:13,color:"var(--text2)",padding:"6px 2px"}}>Noch keine verknüpften Angebote, Rechnungen, Eingangsrechnungen oder Spesen.</div>
        : <>
          {linked.proposals?.length > 0 && <div className="section-label">Angebote</div>}
          {linked.proposals?.map(p => <Row key={`p-${p.id||p.rowid}`} icon="proposal" title={p.ref || `Angebot #${p.id||p.rowid}`} sub={`${statusProposal(p.statut)} · ${fmtDate(p.date)}`} amount={p.total_ttc} onClick={() => onOpenDetail?.("proposal", p)} />)}
          {linked.invoices?.length > 0 && <div className="section-label">Rechnungen</div>}
          {linked.invoices?.map(i => <Row key={`i-${i.id||i.rowid}`} icon="invoice" title={i.ref || `Rechnung #${i.id||i.rowid}`} sub={`${statusInvoice(i.statut)} · ${fmtDate(i.date)}`} amount={i.total_ttc} onClick={() => onOpenDetail?.("invoice", i)} />)}
          {linked.supplierInvoices?.length > 0 && <div className="section-label">Lieferantenrechnungen</div>}
          {linked.supplierInvoices?.map(si => <Row key={`si-${si.id||si.rowid}`} icon="suppliers" title={si.ref || si.ref_supplier || `Eingang #${si.id||si.rowid}`} sub={`${statusInvoice(si.statut)} · ${fmtDate(si.date)}`} amount={si.total_ttc} onClick={() => onOpenDetail?.("supplierinvoice", si)} />)}
          {linked.expenses?.length > 0 && <div className="section-label">Spesen</div>}
          {linked.expenses?.map(e => <Row key={`e-${e.id||e.rowid}`} icon="car" title={e.ref || `Spese #${e.id||e.rowid}`} sub={`${fmtDate(e.date_debut || e.date)} · ${e.note_public || e.note_private || "Spesenbericht"}`} amount={e.total_ttc || e.total_ht || e.total} onClick={() => onOpenDetail?.("expense", e)} />)}
        </>}
    </div>
  );
}

function ExpenseReportDetail({ api, data, me, onBack, showToast }) {
  const [report, setReport] = useState(data);
  const [docs, setDocs] = useState([]);
  const [users, setUsers] = useState([]);
  const id = report.id || report.rowid;
  const reload = useCallback(() => {
    if (!id) return;
    api.getExpenseReport(id).then(r => setReport(r || report)).catch(() => {});
    api.getDocuments("expensereport", id).then(d => setDocs(Array.isArray(d) ? d : [])).catch(() => {});
  }, [api, id]);
  useEffect(() => { reload(); api.getUsers().then(u => setUsers(Array.isArray(u) ? u : [])).catch(() => {}); }, [reload, api]);
  const author = users.find(u => String(u.id || u.rowid) === String(report.fk_user_author || report.user_author_id || report.fk_user));
  return (
    <div className="main">
      <div className="page-header">
        <div className="back-btn" onClick={onBack}><Icon name="back" size={20}/></div>
        <h2>Spese</h2>
      </div>
      <div className="detail-hero">
        <div className="detail-ref">{report.ref || `Spese #${id}`}</div>
        <div className="detail-client">{author ? ([author.firstname, author.lastname].filter(Boolean).join(" ") || author.login) : "—"}</div>
        <div className="detail-amount">{fmtMoney(report.total_ttc || report.total_ht || report.total)}</div>
        <div style={{marginTop:16}}>
          <div className="detail-row"><span className="lbl">Datum</span><span className="val">{fmtDate(report.date_debut || report.date)}</span></div>
          <div className="detail-row"><span className="lbl">Status</span><span className="val">{report.status ?? report.statut ?? "—"}</span></div>
        </div>
      </div>
      <ExpenseActions api={api} report={report} me={me} showToast={showToast} onChanged={reload} />
      <FileUploadSection api={api} modulepart="expensereport" docid={id} ref_doc={report.ref || `EXP-${id}`} docs={docs}
        onUploaded={() => api.getDocuments("expensereport", id).then(d => setDocs(Array.isArray(d) ? d : [])).catch(() => {})} showToast={showToast}/>
    </div>
  );
}

function TaskForm({ api, project, users, onClose, onSaved, showToast }) {
  const [form, setForm] = useState({ label:"", description:"", userId:"", dateStart:todayISO(), timeStart:"08:00", dateEnd:"", timeEnd:"17:00", progress:"0", billable:"1" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    if (!form.label.trim()) { showToast("Aufgabentitel ist Pflicht", "error"); return; }
    setSaving(true);
    try {
      const payload = {
        ref: genCode("TASK"),
        fk_project: parseInt(project.id || project.rowid),
        label: form.label,
        description: form.description,
        date_start: toEpochLocal(form.dateStart, form.timeStart),
        agenda_date_start: toEpochDolibarrWallTime(form.dateStart, form.timeStart),
        progress: parseInt(form.progress || 0),
        array_options: { options_billable: form.billable },
        ...(form.dateEnd ? { date_end: toEpochLocal(form.dateEnd, form.timeEnd), agenda_date_end: toEpochDolibarrWallTime(form.dateEnd, form.timeEnd) } : {}),
        ...(form.userId ? { userownerid: parseInt(form.userId) } : {}),
      };
      const createdTask = await api.createTask(payload);
      const taskId = typeof createdTask === "number" ? createdTask : (createdTask?.id || createdTask?.rowid);
      if (taskId) {
        try { await createAgendaForTask(api, taskId, payload, project); } catch (e) { console.warn("Agenda-Termin für Aufgabe konnte nicht erstellt werden", e); }
      }
      onSaved();
    } catch (err) {
      console.error(err);
      showToast(`Aufgabe konnte nicht erstellt werden: ${doliError(err)}`, "error");
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-handle"/>
        <div className="modal-title">Neue Aufgabe</div>
        <div className="field-group mb12"><label>Titel *</label><input value={form.label} onChange={set("label")} placeholder="z. B. Baumschnitt vorbereiten"/></div>
        <div className="field-group mb12"><label>Zuständig</label>
          <select value={form.userId} onChange={set("userId")}>
            <option value="">— Keine Zuweisung —</option>
            {users.map(u => <option key={u.id||u.rowid} value={u.id||u.rowid}>{u.firstname||u.lastname ? `${u.firstname||""} ${u.lastname||""}`.trim() : (u.login||u.email||`User ${u.id||u.rowid}`)}</option>)}
          </select>
        </div>
        <div className="form-row mb12">
          <div className="field-group"><label>Startdatum</label><input type="date" value={form.dateStart} onChange={set("dateStart")}/></div>
          <div className="field-group"><label>Startzeit</label><TimeField value={form.timeStart} onChange={set("timeStart")}/></div>
        </div>
        <div className="form-row mb12">
          <div className="field-group"><label>Enddatum</label><input type="date" value={form.dateEnd} onChange={set("dateEnd")}/></div>
          <div className="field-group"><label>Endzeit</label><TimeField value={form.timeEnd} onChange={set("timeEnd")}/></div>
        </div>
        <div className="form-row mb12">
          <div className="field-group"><label>Fortschritt</label><input type="number" min="0" max="100" value={form.progress} onChange={set("progress")}/></div>
          <div className="field-group"><label>Abrechnung</label>
            <select value={form.billable} onChange={set("billable")}>
              <option value="1">Abrechenbar</option>
              <option value="0">Nicht abrechenbar</option>
            </select>
          </div>
        </div>
        <div className="field-group mb20"><label>Beschreibung</label><textarea value={form.description} onChange={set("description")} rows={3} placeholder="Details zur Aufgabe..."/></div>
        <div style={{display:"flex",gap:10}}>
          <button className="btn btn-secondary" style={{flex:1}} onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" style={{flex:1}} onClick={save} disabled={saving}>{saving?"Speichert...":"Erstellen"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Geschäft Page ───────────────────────────────────────────────────────────
// ─── Beleg-Freigaben: Pipeline-Freigabe direkt in der App (statt Dolibarr) ──
// Zeigt alle Lieferantenrechnungs-ENTWÜRFE mit Beleg, Positionen, Artikel und
// Buchungskonto; Freigeben/Ablehnen läuft über den Approve-Server der Pipeline
// (server.mjs-Proxy /api/beleg/*, Token aus dessen State) — Entwürfe ohne
// Freigabe-Lauf werden direkt per Dolibarr-API validiert bzw. gelöscht.
function FreigabenView({ api, showToast, onBack }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);   // { inv, docs, state, supplier }
  const [busy, setBusy] = useState(null); // Rechnungs-id der laufenden Aktion
  const [editId, setEditId] = useState(null);
  const [viewDoc, setViewDoc] = useState(null);
  const [kontoCfg] = useState(loadKontoConfig);
  const [prodAcc, setProdAcc] = useState({});   // fk_product -> accountancy_code_buy
  const kontoMem = useRef(loadKontoMemory());
  // Mit dem Serverstand abgleichen (Task 8) — läuft nebenher; ohne Netz
  // bleibt der synchron gestartete lokale Stand einfach stehen.
  useEffect(() => { kontoMemAbgleichen().then((m) => { kontoMem.current = m; }); }, []);

  const ventKonto = (v) => { const s = String(v || ""); return s.startsWith("10050") && s.length > 5 ? s.slice(5) : ""; };
  const tsDate = (ts) => (ts ? new Date(ts * 1000).toLocaleDateString("de-DE") : "—");

  // Buchungskonto einer Zeile: gesetzt (fk_code_ventilation, so bucht Dolibarr)
  // → sonst am Artikel hinterlegt → gemerkte Zuordnung → Stichwort-Vorschlag.
  // Damit steht bei JEDER Position eine Kategorie, auch bei frischen App-Scans.
  const kontoOfLine = (l) => {
    const gesetzt = ventKonto(l.fk_code_ventilation);
    if (gesetzt) return { number: gesetzt, quelle: "" };
    const pid = l.fk_product ? String(l.fk_product) : "";
    const amArtikel = pid && (prodAcc[pid] || kontoMem.current[pid]);
    if (amArtikel) return { number: String(amArtikel), quelle: "vom Artikel" };
    return { number: suggestKonto(stripHtml(l.description || l.desc || ""), kontoCfg), quelle: "Vorschlag" };
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pend, drafts, supp, prods] = await Promise.all([
        apiFetch("/api/beleg/pending").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        api.getSupplierInvoices().catch(() => []),
        api.getThirdparties("supplier").catch(() => []),
        api.getProducts().catch(() => []),
      ]);
      const states = pend && Array.isArray(pend.pending) ? pend.pending : [];
      const sName = {};
      (Array.isArray(supp) ? supp : []).forEach((s) => { sName[String(s.id)] = s.name || s.nom; });
      const accMap = {};
      (Array.isArray(prods) ? prods : []).forEach((p) => { if (p.accountancy_code_buy) accMap[String(p.id)] = p.accountancy_code_buy; });
      setProdAcc(accMap);
      const open = (Array.isArray(drafts) ? drafts : []).filter((i) => String(i.status ?? i.statut) === "0");
      const withDocs = await Promise.all(open.map(async (inv) => ({
        inv,
        docs: await api.getDocuments("supplier_invoice", inv.id).then((d) => (Array.isArray(d) ? d : [])).catch(() => []),
        state: states.find((s) => String(s.invoice_id) === String(inv.id)) || null,
        supplier: sName[String(inv.socid)] || `Lieferant ${inv.socid}`,
      })));
      setRows(withDocs);
    } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { if (api) load(); }, [load]);

  const doAction = async (row, action) => {
    const id = row.inv.id;
    if (action === "reject") {
      const msg = row.state?.token
        ? "Wirklich ablehnen? Der Dolibarr-Entwurf wird gelöscht, der Beleg wandert nach _queue/rejected/."
        : "Entwurf wirklich löschen?";
      if (!window.confirm(msg)) return;
    }
    setBusy(id);
    try {
      if (row.state?.token) {
        const r = await apiFetch("/api/beleg/action", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, token: row.state.token }),
        });
        const b = await r.json().catch(() => ({}));
        if (!r.ok || b.error) throw new Error(b.error || "Status " + r.status);
        showToast(action === "approve" ? "Freigegeben — wird im Hintergrund gebucht" : "Abgelehnt");
      } else if (action === "approve") {
        const invFrisch = row.inv.note_private !== undefined ? row.inv : await api.getSupplierInvoice(id).catch(() => row.inv);
        if (istBankEntwurf(invFrisch)) {
          const d = await api.getDocuments("supplier_invoice", id).catch(() => []);
          if (!Array.isArray(d) || d.length === 0) throw new Error("Erst den Beleg anhängen, dann validieren");
        }
        await api.validateSupplierInvoice(id);
        showToast("Rechnung validiert");
      } else {
        await api.deleteSupplierInvoice(id);
        showToast("Entwurf gelöscht");
      }
      setRows((rs) => rs.filter((x) => x.inv.id !== id));
    } catch (err) { showToast(doliError(err) || String(err.message || err), "error"); }
    finally { setBusy(null); }
  };

  return (
    <div className="main">
      <div className="page-header">
        <div className="back-btn" onClick={onBack}><Icon name="back" size={20}/></div>
        <h2>Beleg-Freigaben</h2>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>Neu laden</button>
      </div>
      {loading ? <div className="loading"><div className="spinner"/> Lade…</div>
        : rows.length === 0 ? <div className="empty-state"><Icon name="validate" size={48}/><p>Nichts zur Freigabe offen</p></div>
        : rows.map((row) => {
          const { inv, docs, state } = row;
          const lines = Array.isArray(inv.lines) ? inv.lines : [];
          const running = state && (state.status === "approving" || state.status === "rejecting");
          return (
            <div key={inv.id} className="form-section" style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{row.supplier}</div>
                <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{fmtMoney(inv.total_ttc)}</div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>
                {tsDate(inv.date)} · {inv.ref}
                {state ? (state.source === "app" ? " · App-Scan" : " · Pipeline") : " · neu (noch ohne Freigabe-Lauf)"}
              </div>
              <div style={{ marginTop: 8 }}>
                {lines.map((l) => {
                  const k = kontoOfLine(l);
                  const warn = belegWarnungen(l, k.number,
                    { bruttoGesamt: parseFloat(inv.total_ttc || 0), refSupplier: inv.ref_supplier });
                  return (
                    <div key={l.id || l.rowid} style={{ fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                      <div>{parseFloat(l.qty || 1)}× {stripHtml(l.description || l.desc || l.product_label || "Position")} — {fmtMoney(l.total_ttc)}</div>
                      <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>
                        {l.product_label ? `Artikel: ${l.product_label}` : "kein Artikel verknüpft"}
                      </div>
                      {/* Buchungskonto nur anzeigen — geändert wird es unter „Bearbeiten“
                          (bewusst kein zweites Bedienelement in der Karte). */}
                      <div style={{ fontSize: 11, color: k.quelle ? "var(--warn)" : "var(--text3)", marginTop: 1 }}>
                        Konto {k.number}{kontoLabel(k.number, kontoCfg) ? ` · ${kontoLabel(k.number, kontoCfg)}` : ""}
                        {k.quelle ? ` · ${k.quelle}` : ""}
                      </div>
                      {warn.map((t, i) => (
                        <div key={i} style={{ fontSize: 11, color: "var(--warn)", marginTop: 2, display: "flex", gap: 4 }}>
                          <Icon name="warning" size={12} /><span>{t}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
                {lines.length === 0 && <div style={{ fontSize: 12, color: "var(--danger)" }}>Keine Positionen — vor der Freigabe bearbeiten.</div>}
                {lines.some((l) => kontoOfLine(l).quelle) && (
                  <div style={{ fontSize: 11, color: "var(--warn)", marginTop: 6 }}>
                    Gelbe Konten sind nur ein Vorschlag — unter „Bearbeiten“ bestätigen oder ändern.
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {docs.length > 0 && <button className="btn btn-secondary btn-sm" onClick={() => setViewDoc(docs[0])}><Icon name="image" size={14}/> Beleg</button>}
                <button className="btn btn-secondary btn-sm" onClick={() => setEditId(inv.id)} disabled={busy === inv.id || running}><Icon name="edit" size={14}/> Bearbeiten</button>
                <div style={{ flex: 1 }} />
                <button className="btn btn-danger btn-sm" onClick={() => doAction(row, "reject")} disabled={busy === inv.id || running}>
                  <Icon name={state ? "close" : "trash"} size={14}/> {state ? "Ablehnen" : "Löschen"}
                </button>
                <button className="btn btn-success btn-sm" onClick={() => doAction(row, "approve")} disabled={busy === inv.id || running}>
                  {running ? "läuft…" : <><Icon name="validate" size={14}/> Freigeben</>}
                </button>
              </div>
            </div>
          );
        })}
      {editId && <SupplierInvoiceEditModal api={api} invoiceId={editId}
        lieferant={rows.find((r) => String(r.inv.id) === String(editId))?.supplier}
        onClose={() => setEditId(null)}
        onSaved={() => { setEditId(null); load(); showToast("Entwurf aktualisiert"); }}
        showToast={showToast} />}
      {viewDoc && <DocViewerModal api={api} modulepart="supplier_invoice" doc={viewDoc} onClose={() => setViewDoc(null)} showToast={showToast} />}
    </div>
  );
}

function GeschaeftPage({ api, me, showToast, onOpenDetail, onNavigate }) {
  const block = useBlock();
  const funktion = useFunktion();
  // Deep-Link aus der Matrix-Nachricht: …/#freigaben öffnet direkt die
  // Freigaben — aber nur, wenn der Block das hergibt, sonst startet die Seite
  // (wie beim Render-Guard weiter unten) auf den normalen Kacheln statt auf
  // einer toten Unterseite.
  const [subview, setSubview] = useState(() =>
    (typeof window !== "undefined" && window.location.hash === "#freigaben" && block("belege") && funktion("lieferantenrechnungen")) ? "freigaben" : null);
  // Zweiter Link-Klick bei bereits laufender App: die Seite wird nicht neu
  // geladen, nur der Hash wechselt (vgl. MainActivity.onNewIntent).
  useEffect(() => {
    const onHash = () => { if (window.location.hash === "#freigaben") setSubview("freigaben"); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Beleg-Freigaben haengen an der Beleg-Pipeline (Block "belege"), nicht am
  // ERP-Block, der GeschaeftPage ueberhaupt erst erreichbar macht — ein
  // Deep-Link (#freigaben) darf die Unterseite deshalb nicht am Block vorbei
  // oeffnen.
  if (subview === "freigaben" && block("belege") && funktion("lieferantenrechnungen")) return <FreigabenView api={api} showToast={showToast} onBack={() => setSubview(null)} />;
  if (subview === "orders" && funktion("bestellungen"))          return <BestellungenView api={api} me={me} showToast={showToast} onBack={() => setSubview(null)} />;
  if (subview === "deliveries" && funktion("lager"))      return <LieferungenView api={api} showToast={showToast} onBack={() => setSubview(null)} />;
  if (subview === "supplierinvoices" && funktion("lieferantenrechnungen"))return <SupplierInvoiceList api={api} showToast={showToast} onDetail={(d) => onOpenDetail("supplierinvoice", d)} onBack={() => setSubview(null)} />;
  if (subview === "warehouse" && funktion("lager"))       return <LagerView api={api} showToast={showToast} onBack={() => setSubview(null)} />;
  if (subview === "shipments" && funktion("lager"))       return <LieferscheineView api={api} showToast={showToast} onBack={() => setSubview(null)} />;

  const tiles = [
    { label: "Beleg-Freigaben",          key: "freigaben",        color: "var(--k-ocker-bg)", accent: "var(--k-ocker)", icon: "validate", sichtbar: block("belege") && funktion("lieferantenrechnungen") },
    { label: "Bestellungen aufgeben",    key: "orders",           color: "var(--k-petrol-bg)", accent: "var(--k-petrol)", icon: "cart", sichtbar: funktion("bestellungen") },
    { label: "Lieferantenrechnungen",    key: "supplierinvoices", color: "var(--k-rost-bg)", accent: "var(--k-rost)", icon: "invoice",  sichtbar: funktion("lieferantenrechnungen") },
    { label: "Rechnungen",               nav: "invoices",  color: "var(--k-schiefer-bg)", accent: "var(--k-schiefer)", icon: "invoice",  sichtbar: funktion("rechnungen") },
    { label: "Angebote",                 nav: "proposals", color: "var(--k-moos-bg)", accent: "var(--k-moos)", icon: "proposal", sichtbar: funktion("angebote") },
    { label: "Projekte",                 nav: "projects",  color: "var(--k-erde-bg)", accent: "var(--k-erde)", icon: "project",  sichtbar: funktion("projekte") },
    { label: "Geschäftspartner",         nav: "partners",  color: "var(--k-pflaume-bg)", accent: "var(--k-pflaume)", icon: "customers" },
  ].filter((t) => t.sichtbar !== false);

  return (
    <div className="main">
      <div className="page-header"><h2>Geschäft</h2></div>
      <div className="quick-actions">
        {tiles.map(t => (
          <div key={t.key || t.nav} className="quick-btn"
            onClick={() => (t.nav ? onNavigate(t.nav) : setSubview(t.key))}>
            <div className="quick-btn-icon" style={{ background: t.color, color: t.accent }}><Icon name={t.icon} size={19} /></div>
            <span>{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Förder-Check: Regeln und Programmtexte liegen in src/foerderung.js, hier nur
// die Anzeige. Der Hinweis erscheint BEIM ANLEGEN (nicht erst in der Liste) —
// SVLFG und LEADER fördern ausschließlich, was nach der Bewilligung gekauft
// wird; wer zuerst bestellt, verliert den Zuschuss endgültig.

const foerderEuro = (n) => (n == null ? "" : `${Math.round(n).toLocaleString("de-DE")} €`);

function FoerderHinweis({ treffer, gewaehlt, onWaehlen, onProgramm }) {
  if (!treffer.length) return null;
  return (
    <div className="foerder-box">
      <div className="foerder-titel">Erst Antrag, dann kaufen</div>
      <div className="foerder-text">
        {treffer.length === 1 ? "Ein Förderprogramm passt" : `${treffer.length} Förderprogramme passen`} zu dieser Bestellung.
        Gefördert wird nur, was nach der Bewilligung gekauft wird — wer zuerst bestellt, bekommt nichts.
      </div>
      {treffer.map(t => (
        <div key={t.programm.key} className="foerder-treffer">
          <div className="foerder-info">
            <div className="foerder-name">{t.programm.name}</div>
            <div className="foerder-grund">
              {t.grund} · {t.programm.satzText}
              {t.schaetzung != null && !t.unsicher ? ` · grob ${foerderEuro(t.schaetzung)}` : ""}
            </div>
          </div>
          <div className="foerder-aktionen">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onProgramm(t.programm)}>Programm</button>
            {onWaehlen && (
              <button type="button" className={`btn btn-sm ${gewaehlt === t.programm.key ? "btn-success" : "btn-secondary"}`}
                onClick={() => onWaehlen(gewaehlt === t.programm.key ? "" : t.programm.key)}>
                {gewaehlt === t.programm.key ? "Antrag zuerst ✓" : "Antrag zuerst"}
              </button>
            )}
          </div>
        </div>
      ))}
      {gewaehlt && onWaehlen && (
        <div className="foerder-text" style={{marginTop:10}}>
          Die Bestellung wird als <b>„Wartet auf Förderzusage“</b> gespeichert und bleibt Entwurf — erst nach der Zusage wirklich bestellen.
        </div>
      )}
    </div>
  );
}

function FoerderProgrammModal({ programm, onClose }) {
  if (!programm) return null;
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle"/>
        <div className="modal-title">{programm.name}</div>
        <div className="foerder-grund" style={{marginBottom:14}}>{programm.traeger}</div>
        <div className="detail-row"><span className="lbl">Förderung</span><span className="val">{programm.satzText}</span></div>
        <div className="detail-row"><span className="lbl">Deckel</span><span className="val">{programm.deckelText}</span></div>
        <div className="detail-row"><span className="lbl">Frist</span><span className="val">{programm.fristText || "—"}</span></div>
        <div className="detail-row"><span className="lbl">Kontakt</span><span className="val">{programm.kontakt}</span></div>
        {programm.hinweis && <div className="foerder-text" style={{margin:"12px 0"}}>{programm.hinweis}</div>}
        <div className="section-label" style={{marginTop:14}}>Ablauf</div>
        <ol className="foerder-ablauf">{programm.ablauf.map((a, i) => <li key={i}>{a}</li>)}</ol>
        {programm.produkte?.length > 0 && (
          <>
            <div className="section-label">Geförderte Produkte</div>
            <ul className="foerder-ablauf">{programm.produkte.map(pr => <li key={pr.label}>{pr.label} — bis {foerderEuro(pr.max)}</li>)}</ul>
          </>
        )}
        <div className="section-label">Links</div>
        <ul className="foerder-ablauf">
          {programm.links.map(l => <li key={l.url}><a href={l.url} target="_blank" rel="noreferrer">{l.label}</a></li>)}
        </ul>
        <button className="btn btn-secondary" style={{width:"100%", marginTop:14}} onClick={onClose}>Schließen</button>
      </div>
    </div>
  );
}

// Sortierung der Bestellliste. „Priorität" ist die Voreinstellung: die Liste
// existiert, damit man sieht, was als Nächstes gekauft werden muss.
const ORDER_SORT = [
  { key: "prio",   label: "Priorität",          cmp: (a, b) => prioRang(bestellZusatz(a).prio) - prioRang(bestellZusatz(b).prio) || (b.date || 0) - (a.date || 0) },
  { key: "datum",  label: "Datum (neu zuerst)", cmp: (a, b) => (b.date || 0) - (a.date || 0) },
  { key: "betrag", label: "Betrag",             cmp: (a, b) => (parseFloat(b.total_ttc) || 0) - (parseFloat(a.total_ttc) || 0) },
];

// ─── Lager (Burger-Menü) ─────────────────────────────────────────────────────
// Lager, Lieferungen und Lieferscheine stehen seit 20.09.2026 nicht mehr unter
// „Geschäft", sondern als eigener Punkt im Burger-Menü (Wunsch Inhaber).
function LagerPage({ api, showToast }) {
  const [subview, setSubview] = useState(null);
  if (subview === "warehouse")  return <LagerView api={api} showToast={showToast} onBack={() => setSubview(null)} />;
  if (subview === "deliveries") return <LieferungenView api={api} showToast={showToast} onBack={() => setSubview(null)} />;
  if (subview === "shipments")  return <LieferscheineView api={api} showToast={showToast} onBack={() => setSubview(null)} />;
  const tiles = [
    { label: "Lager",                key: "warehouse",  farbe: "pflaume",  icon: "archive"  },
    { label: "Lieferungen erhalten", key: "deliveries", farbe: "petrol",   icon: "receive"  },
    { label: "Lieferscheine",        key: "shipments",  farbe: "schiefer", icon: "transfer" },
  ];
  return (
    <div className="main">
      <div className="page-header"><h2>Lager</h2></div>
      <div className="quick-actions">
        {tiles.map(t => (
          <div key={t.key} className="quick-btn" onClick={() => setSubview(t.key)}>
            <div className="quick-btn-icon" style={{ background: `var(--k-${t.farbe}-bg)`, color: `var(--k-${t.farbe})` }}><Icon name={t.icon} size={19} /></div>
            <span>{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Bestellungen (Supplier Purchase Orders) ─────────────────────────────────
function BestellungenView({ api, me, showToast, onBack, autoNew }) {
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("open");
  const [showForm, setShowForm] = useState(!!autoNew);
  const [selected, setSelected] = useState(null);
  const [kategorie, setKategorie] = useState("");
  const [sortKey, setSortKey] = useState("prio");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ord, supp] = await Promise.all([
        api.getSupplierOrders().catch(() => null),
        api.getThirdparties("supplier").catch(() => []),
      ]);
      if (ord === null) { showToast("Bestellungs-Modul in Dolibarr nicht verfügbar", "error"); setItems([]); }
      else setItems(Array.isArray(ord) ? ord : []);
      setSuppliers(Array.isArray(supp) ? supp : []);
    } catch { showToast("Ladefehler", "error"); }
    finally { setLoading(false); }
  }, [api, showToast]);

  useEffect(() => { if (api) load(); }, [load]);

  if (selected) return (
    <BestellungDetail api={api} data={selected} me={me} suppliers={suppliers} showToast={showToast}
      onBack={() => setSelected(null)} onChanged={() => { setSelected(null); load(); }} />
  );

  const statusMap = {
    0: ["Entwurf","badge-draft"], 1: ["Bestellt","badge-open"], 2: ["Genehmigt","badge-open"],
    3: ["In Lieferung","badge-open"], 4: ["Erhalten","badge-paid"], 5: ["Abgeschlossen","badge-paid"],
    [-1]: ["Storniert","badge-cancelled"], 6: ["Abgelehnt","badge-cancelled"],
  };
  const match = (ORDER_FILTERS.find(o => o.key === filter) || ORDER_FILTERS[0]).match;
  const sortieren = (ORDER_SORT.find(o => o.key === sortKey) || ORDER_SORT[0]).cmp;
  const shown = items
    .filter(o => match(Number(o.statut ?? o.status ?? 0)))
    .filter(o => !kategorie || bestellZusatz(o).kategorie === kategorie)
    .sort(sortieren);

  return (
    <div className="main">
      <div className="page-header">
        <div className="back-btn" onClick={onBack}><Icon name="back" size={20}/></div>
        <h2>Bestellungen</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}><Icon name="plus" size={15}/> Neu</button>
      </div>
      <StatusFilter options={ORDER_FILTERS} value={filter} onChange={setFilter} />
      <div className="status-filter-menu">
        <label>Kategorie</label>
        <select value={kategorie} onChange={e => setKategorie(e.target.value)}>
          <option value="">Alle</option>
          {FOERDER_KATEGORIEN.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      </div>
      <div className="status-filter-menu">
        <label>Sortierung</label>
        <select value={sortKey} onChange={e => setSortKey(e.target.value)}>
          {ORDER_SORT.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>
      {loading ? <div className="loading"><div className="spinner"/> Lade...</div>
        : shown.length === 0 ? <div className="empty-state"><Icon name="proposal" size={48}/><p>Keine Bestellungen</p></div>
        : shown.map(o => {
          const st = Number(o.statut ?? o.status ?? 0);
          const [lbl, cls] = statusMap[st] || ["–","badge-draft"];
          const suppId = o.socid || o.fk_soc || o.fourn_id;
          const supp = suppliers.find(s => String(s.id) === String(suppId));
          const z = bestellZusatz(o);
          const pi = prioInfo(z.prio);
          // Nur das Warten verdrängt den Bestellstatus — eine Zusage ist kein
          // Grund, „Bestellt" zu verstecken.
          const fs = z.foerderStatus === "wartet" ? foerderStatusInfo(z.foerderStatus) : null;
          return (
            <div key={o.id} className="list-item" onClick={() => setSelected(o)}>
              <div className="list-avatar" style={{background:"var(--k-moos-bg)",color:"var(--k-moos)"}}><Icon name="proposal" size={19}/></div>
              <div className="list-info">
                <div className="name">{pi ? `${pi.punkt} ` : ""}{o.ref || `Best-${o.id}`}</div>
                <div className="sub">
                  {supp?.name || "—"} · {fmtDate(o.date)}
                  {z.kategorie ? ` · ${kategorieLabel(z.kategorie)}` : ""}
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div className="list-amount">{fmtMoney(o.total_ttc)}</div>
                <span className={`badge ${fs ? fs.cls : cls}`}>{fs ? fs.label : lbl}</span>
              </div>
            </div>
          );
        })}
      {showForm && <BestellungenForm api={api} me={me} suppliers={suppliers} onClose={() => setShowForm(false)}
        onSaved={(info) => { setShowForm(false); load(); showToast("Bestellung erstellt!" + (info || "")); }} showToast={showToast} />}
    </div>
  );
}

function BestellungDetail({ api, data, me, suppliers, showToast, onBack, onChanged }) {
  const [order, setOrder] = useState(data);
  const [loading, setLoading] = useState(false);
  const [programm, setProgramm] = useState(null);

  const reload = () => api.getSupplierOrder(order.id).then(d => { if(d) setOrder(d); }).catch(() => {});

  // Priorität, Kategorie und Förderstatus liegen in Dolibarr-Zusatzfeldern.
  // Immer alle vier schreiben: ein weggelassenes Feld behielte in Dolibarr
  // seinen alten Wert, und „Förderung zugesagt" mit dem Programm von gestern
  // wäre schlimmer als gar keine Angabe.
  const zusatz = bestellZusatz(order);
  const zusatzSpeichern = async (aenderung) => {
    const neu = { ...zusatz, ...aenderung };
    setLoading(true);
    try {
      await api.updateSupplierOrder(order.id, { array_options: bestellZusatzFelder(neu) });
      await reload();
    } catch (err) { showToast(doliError(err) || "Speichern fehlgeschlagen", "error"); }
    finally { setLoading(false); }
  };

  const validate = async () => {
    setLoading(true);
    try { await api.validateSupplierOrder(order.id); await reload(); showToast("Bestellung validiert!"); }
    catch (err) { showToast(doliError(err) || "Validieren fehlgeschlagen", "error"); }
    finally { setLoading(false); }
  };

  const remove = async () => {
    if (!window.confirm("Diese Bestellung wirklich löschen?")) return;
    setLoading(true);
    try { await api.deleteSupplierOrder(order.id); showToast("Bestellung gelöscht!"); onChanged(); }
    catch (err) { showToast(doliError(err) || "Löschen fehlgeschlagen", "error"); setLoading(false); }
  };

  const st = Number(order.statut ?? order.status ?? 0);
  const statusLabel = { 0:"Entwurf", 1:"Bestellt", 2:"Genehmigt", 3:"In Lieferung", 4:"Erhalten", 5:"Abgeschlossen", [-1]:"Storniert", 6:"Abgelehnt" };
  const statusCls = { 0:"badge-draft", 1:"badge-open", 2:"badge-open", 3:"badge-open", 4:"badge-paid", 5:"badge-paid", [-1]:"badge-cancelled", 6:"badge-cancelled" };
  const suppId = order.socid || order.fk_soc || order.fourn_id;
  const supp = suppliers.find(s => String(s.id) === String(suppId));

  return (
    <div className="main">
      <div className="page-header">
        <div className="back-btn" onClick={onBack}><Icon name="back" size={20}/></div>
        <h2>Bestellung</h2>
        <span className={`badge ${statusCls[st] || "badge-draft"}`}>{statusLabel[st] || "—"}</span>
      </div>
      <div className="detail-hero">
        <div className="detail-ref">{order.ref || `Best-${order.id}`}</div>
        <div className="detail-client">{supp?.name || "—"}</div>
        <div className="detail-amount">{fmtMoney(order.total_ttc)}</div>
        <div style={{marginTop:16}}>
          <div className="detail-row"><span className="lbl">Netto</span><span className="val">{fmtMoney(order.total_ht)}</span></div>
          <div className="detail-row"><span className="lbl">MwSt</span><span className="val">{fmtMoney(order.total_tva)}</span></div>
          <div className="detail-row"><span className="lbl">Datum</span><span className="val">{fmtDate(order.date)}</span></div>
          <ProjectLinkEditor
            api={api}
            docId={order.id}
            currentProjectId={order.fk_project || order.fk_projet || order.projectid || ""}
            updateFn={(id, d) => api.updateSupplierOrder(id, d)}
            onUpdated={reload}
            showToast={showToast}
          />
        </div>
      </div>
      <div className="detail-hero">
        <div className="section-label">Einordnung</div>
        <div className="field-group mb12">
          <label>Priorität</label>
          <select value={zusatz.prio} onChange={e => zusatzSpeichern({ prio: e.target.value })} disabled={loading}>
            <option value="">Keine Angabe</option>
            {FOERDER_PRIOS.map(pr => <option key={pr.key} value={pr.key}>{pr.punkt} {pr.label}</option>)}
          </select>
        </div>
        <div className="field-group mb12">
          <label>Kategorie</label>
          <select value={zusatz.kategorie} onChange={e => zusatzSpeichern({ kategorie: e.target.value })} disabled={loading}>
            <option value="">Keine Angabe</option>
            {FOERDER_KATEGORIEN.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </div>
        {String(order.note_private || "").includes(FOERDER_NOTIZ_MARKE) && (
          <div className="foerder-notiz">{order.note_private}</div>
        )}
        {zusatz.foerderung && (
          <>
            <div className="field-group mb12">
              <label>Förderantrag</label>
              <select value={zusatz.foerderStatus} onChange={e => zusatzSpeichern({ foerderStatus: e.target.value })} disabled={loading}>
                {FOERDER_STATUS.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
              </select>
            </div>
            {(() => {
              const p = programmMitKontakt(FOERDER_PROGRAMME.find(x => x.key === zusatz.foerderung), mandantAusCache());
              return p ? (
                <button className="btn btn-secondary btn-sm" onClick={() => setProgramm(p)}>{p.name} ansehen</button>
              ) : null;
            })()}
            {zusatz.foerderStatus === "wartet" && (
              <div className="foerder-text" style={{marginTop:10}}>
                Noch nicht bestellen — gefördert wird nur, was nach der Bewilligung gekauft wird.
              </div>
            )}
          </>
        )}
      </div>
      <FoerderProgrammModal programm={programm} onClose={() => setProgramm(null)} />
      <div className="action-row action-row-2">
        {st === 0 && me?.canValidateSupplierInvoices && <button className="btn btn-success" onClick={validate} disabled={loading}><Icon name="validate" size={16}/> Validieren</button>}
        {st <= 1 && <button className="btn btn-danger" onClick={remove} disabled={loading}><Icon name="trash" size={16}/> Löschen</button>}
      </div>
    </div>
  );
}

function BestellungenForm({ api, me, suppliers, onClose, onSaved, showToast }) {
  const [socid, setSocid] = useState("");
  const [neuerLieferant, setNeuerLieferant] = useState("");
  const [projectid, setProjectid] = useState("");
  const [projects, setProjects] = useState([]);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([{desc:"", qty:1, price:0, tva:19, fk_product:"", remise_percent:0}]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [prio, setPrio] = useState("");
  const [kategorie, setKategorie] = useState("");
  const [foerderung, setFoerderung] = useState("");
  const [programm, setProgramm] = useState(null);
  const mandant = useMandant();

  // Der Check läuft beim Tippen mit, nicht erst beim Absenden: er soll die
  // Bestellung verhindern, nicht sie kommentieren.
  const treffer = useMemo(
    () => foerderTreffer({ mandant, kategorie, betragNetto: positionenNetto(lines), text: positionenText(lines) }),
    [mandant, kategorie, lines]
  );
  // Ein Programm, das nach dem Ändern der Positionen nicht mehr passt, darf
  // nicht als gewählt stehen bleiben.
  useEffect(() => {
    if (foerderung && !treffer.some(t => t.programm.key === foerderung)) setFoerderung("");
  }, [treffer, foerderung]);

  useEffect(() => { api.getProducts().then(p => setProducts(Array.isArray(p) ? p : [])).catch(() => {}); }, [api]);
  useEffect(() => { api.getProjects().then(p => setProjects(Array.isArray(p) ? p.filter(isOpenProject) : [])).catch(() => {}); }, [api]);

  const pickProject = (pid) => {
    setProjectid(pid);
    const pr = projects.find(p => String(p.id) === String(pid));
    const psoc = pr?.socid || pr?.fk_soc;
    if (psoc) setSocid(String(psoc));
  };

  const addLine = () => setLines(l => [...l, {desc:"", qty:1, price:0, tva:19, fk_product:"", remise_percent:0}]);
  const delLine = (i) => setLines(l => l.filter((_, idx) => idx !== i));
  const updLine = (i, k, v) => setLines(l => l.map((li, idx) => idx === i ? {...li, [k]: v} : li));
  const pickProduct = (i, prod) => setLines(l => l.map((li, idx) => idx === i ? {
    ...li,
    desc: prod.label || prod.ref || li.desc,
    price: prod.price != null && prod.price !== "" ? parseFloat(prod.price) : li.price,
    tva: prod.tva_tx != null && prod.tva_tx !== "" ? parseFloat(prod.tva_tx) : li.tva,
    fk_product: prod.id,
  } : li));
  const total = lines.reduce((s,l) => s + (parseFloat(l.qty||0) * parseFloat(l.price||0) * (1-parseFloat(l.remise_percent||0)/100)) * (1+parseFloat(l.tva||0)/100), 0);

  // Lieferant ist optional: Dolibarr verlangt aber zwingend einen — ohne Auswahl
  // wird die Bestellung auf den Platzhalter „Lieferant noch offen" gebucht
  // (einmalig automatisch angelegt) und kann später umgehängt werden.
  const PLACEHOLDER_SUPPLIER = "Lieferant noch offen";
  const resolveSupplier = async () => {
    if (!socid && neuerLieferant.trim()) return { id: await lieferantSicherstellen(api, "", neuerLieferant), name: neuerLieferant.trim(), neu: true };
    if (socid) return { id: parseInt(socid), name: suppliers.find(s => String(s.id) === String(socid))?.name || "" };
    const hit = suppliers.find(s => (s.name || "").trim().toLowerCase() === PLACEHOLDER_SUPPLIER.toLowerCase());
    if (hit) return { id: parseInt(hit.id), name: PLACEHOLDER_SUPPLIER };
    const res = await api.createThirdparty({
      name: PLACEHOLDER_SUPPLIER, fournisseur: 1, client: 0,
      ...DE_LAND, typent_id: 0, code_fournisseur: "auto",
    });
    const newId = typeof res === "number" ? res : (res?.id || res?.rowid);
    if (!newId) throw new Error("Platzhalter-Lieferant konnte nicht angelegt werden");
    return { id: parseInt(newId), name: PLACEHOLDER_SUPPLIER };
  };

  const save = async () => {
    setSaving(true);
    try {
      const sup = await resolveSupplier();
      const created = await api.createSupplierOrder({
        socid: sup.id,
        date: Math.floor(new Date(date).getTime() / 1000),
        note_public: note,
        // Das Ergebnis des Förder-Checks bleibt als feste Notiz an der
        // Bestellung — der Hinweis im Formular ist weg, sobald es zu ist.
        // note_private, NICHT note_public: note_public steht auf der
        // Bestellung, die der Lieferant sieht.
        note_private: foerderNotiz(treffer, { gewaehlt: foerderung }),
        lines: lines.map(l => ({
          // Link zum Artikel mit in die Positionsbeschreibung (bleibt so auch in Dolibarr sichtbar)
          desc: l.desc + ((l.url || "").trim() ? `\n${l.url.trim()}` : ""),
          qty: parseFloat(l.qty || 0),
          subprice: parseFloat(l.price || 0),
          tva_tx: parseFloat(l.tva || 0),
          remise_percent: parseFloat(l.remise_percent || 0),
          ...(l.fk_product ? { fk_product: parseInt(l.fk_product) } : {}),
        })),
        ...(projectid ? { fk_project: parseInt(projectid) } : {}),
        array_options: bestellZusatzFelder({
          prio, kategorie, foerderung,
          // Ein gewähltes Programm heißt: Antrag zuerst. Die Bestellung bleibt
          // Entwurf und trägt sichtbar, worauf sie wartet.
          foerderStatus: foerderung ? "wartet" : "",
        }),
      });
      // Bestell-Mail an finanzen@ — ein Mail-Fehler macht die Bestellung nicht kaputt
      let mailInfo = "";
      try {
        const newId = typeof created === "number" ? created : (created?.id || created?.rowid);
        const fresh = newId ? await api.getSupplierOrder(newId).catch(() => null) : null;
        let doliUrl = "";
        try { doliUrl = (JSON.parse(localStorage.getItem("dolibarr_config") || "{}").url || "").replace(/\/api\/index\.php.*$/, "").replace(/\/+$/, ""); } catch (_) {}
        const supName = socid || sup.neu ? (sup.name || "") : "noch offen — bitte Lieferant wählen";
        const r = await apiFetch("/api/mail/order", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ref: fresh?.ref || "", orderId: newId || "", supplier: supName, date,
            besteller: `${me?.firstname || ""} ${me?.lastname || ""}`.trim() || me?.login || "",
            note, total: total.toFixed(2).replace(".", ","),
            prio: prioInfo(prio)?.label || "", kategorie: kategorieLabel(kategorie),
            foerderung: foerderung ? (programmMitKontakt(FOERDER_PROGRAMME.find(p => p.key === foerderung), mandantAusCache())?.name || foerderung) : "",
            foerderNotiz: treffer.length ? foerderNotiz(treffer, { gewaehlt: foerderung }) : "",
            lines: lines.map(l => ({ qty: l.qty, desc: l.desc, price: l.price ? String(l.price) : "", url: (l.url || "").trim() })),
            dolibarrUrl: doliUrl,
          }),
        });
        if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || ("Status " + r.status)); }
        mailInfo = " Mail an finanzen@ ist raus.";
      } catch (mailErr) {
        console.error("Bestell-Mail fehlgeschlagen", mailErr);
        mailInfo = " Mail-Versand fehlgeschlagen: " + (mailErr.message || mailErr);
      }
      onSaved((foerderung ? " Wartet auf Förderzusage — noch nicht kaufen." : "") + mailInfo);
    } catch (err) { showToast(doliError(err) || "Fehler beim Erstellen", "error"); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle"/>
        <div className="modal-title">Neue Bestellung</div>
        <SearchSelect label="Projekt optional" value={projectid} onChange={pickProject} options={projects}
          getLabel={p => `${p.ref ? `${p.ref} · ` : ""}${p.title || p.label || p.ref || `#${p.id}`}`}
          getSub={p => p.description || ""} placeholder="Projekt eintippen…" optional />
        <LieferantWahl label="Lieferant optional" value={socid} neuerName={neuerLieferant} options={suppliers} optional
          onChange={(id, name) => { setSocid(id); setNeuerLieferant(name); }}
          leerHinweis="Ohne Auswahl wird die Bestellung auf „Lieferant noch offen“ gebucht." />
        <div className="field-group mb16">
          <label>Bestelldatum</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}/>
        </div>
        <div className="field-group mb12">
          <label>Priorität</label>
          <select value={prio} onChange={e => setPrio(e.target.value)}>
            <option value="">Keine Angabe</option>
            {FOERDER_PRIOS.map(pr => <option key={pr.key} value={pr.key}>{pr.punkt} {pr.label}</option>)}
          </select>
        </div>
        <div className="field-group mb16">
          <label>Kategorie</label>
          <select value={kategorie} onChange={e => setKategorie(e.target.value)}>
            <option value="">Keine Angabe</option>
            {FOERDER_KATEGORIEN.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </div>
        <div className="section-label">Positionen</div>
        {lines.map((l, i) => (
          <div key={i}>
            <DocLine line={l} products={products} canDelete={lines.length > 1}
              onUpd={(k, v) => updLine(i, k, v)} onPick={p => pickProduct(i, p)} onDel={() => delLine(i)} />
            <div className="field-group mb16" style={{marginTop:-4}}>
              <label>Link zum Artikel (optional)</label>
              <input type="url" inputMode="url" value={l.url || ""} onChange={e => updLine(i, "url", e.target.value)} placeholder="https://… (Shop-/Produktseite)" />
            </div>
          </div>
        ))}
        <button className="btn btn-secondary" style={{width:"100%", marginBottom:12}} onClick={addLine}><Icon name="plus" size={15}/> Position hinzufügen</button>
        <div className="line-total">Gesamt (brutto): {total.toFixed(2).replace(".", ",")} €</div>
        <div className="field-group mb20"><label>Anmerkung</label><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optionale Notiz..." rows={3}/></div>
        <FoerderHinweis treffer={treffer} gewaehlt={foerderung} onWaehlen={setFoerderung} onProgramm={setProgramm} />
        <div style={{display:"flex", gap:10}}>
          <button className="btn btn-secondary" style={{flex:1}} onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" style={{flex:1}} onClick={save} disabled={saving}>
            {saving ? <><div className="spinner" style={{width:15,height:15}}/>Erstelle...</> : foerderung ? "Als Förderfall anlegen" : "Bestellen"}
          </button>
        </div>
        <FoerderProgrammModal programm={programm} onClose={() => setProgramm(null)} />
      </div>
    </div>
  );
}

// ─── Lieferungen erhalten (Stock movements in) ───────────────────────────────
function LieferungenView({ api, showToast, onBack }) {
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [qty, setQty] = useState("1");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [noModule, setNoModule] = useState(false);

  useEffect(() => {
    if (!api) return;
    api.getProducts().then(p => setProducts(Array.isArray(p) ? p : [])).catch(() => {});
    api.getWarehouses().then(w => {
      if (!Array.isArray(w) || w.length === 0) setNoModule(true);
      else setWarehouses(w);
    }).catch(() => setNoModule(true));
  }, [api]);

  const save = async () => {
    if (!productId) { showToast("Bitte Artikel wählen", "error"); return; }
    if (!warehouseId) { showToast("Bitte Lager wählen", "error"); return; }
    if (!(parseFloat(qty) > 0)) { showToast("Bitte Menge eingeben", "error"); return; }
    setSaving(true);
    try {
      await api.createStockMovement({
        product_id: parseInt(productId),
        warehouse_id: parseInt(warehouseId),
        qty: parseFloat(qty),
        type: 1,
        label: note || "Lieferung erhalten",
        datem: Math.floor(new Date(date).getTime() / 1000),
      });
      showToast("Lieferung gebucht!");
      setProductId(""); setQty("1"); setNote("");
    } catch (err) { showToast(doliError(err) || "Buchung fehlgeschlagen", "error"); }
    finally { setSaving(false); }
  };

  return (
    <div className="main">
      <div className="page-header">
        <div className="back-btn" onClick={onBack}><Icon name="back" size={20}/></div>
        <h2>Lieferung erhalten</h2>
      </div>
      {noModule && <div style={{background:"var(--warn-soft)",border:"1px solid var(--warn)",borderRadius:12,padding:14,marginBottom:16,fontSize:13,color:"var(--warn)"}}>
        Lagermodul in Dolibarr nicht verfügbar oder keine Lager angelegt.
      </div>}
      <div className="form-section">
        <SearchSelect label="Artikel *" value={productId} onChange={setProductId} options={products}
          getLabel={p => p.label || p.ref || `#${p.id}`}
          getSub={p => [p.ref, p.description].filter(Boolean).join(" · ")} placeholder="Artikel eintippen…" />
        <div className="field-group mb12">
          <label>Lager *</label>
          <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
            <option value="">— Lager wählen —</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.label || w.ref || `Lager #${w.id}`}</option>)}
          </select>
        </div>
        <div className="form-row mb12">
          <div className="field-group"><label>Menge *</label><input type="number" value={qty} onChange={e => setQty(e.target.value)} min="0.001" step="0.001"/></div>
          <div className="field-group"><label>Datum</label><input type="date" value={date} onChange={e => setDate(e.target.value)}/></div>
        </div>
        <div className="field-group mb20"><label>Bemerkung</label><input value={note} onChange={e => setNote(e.target.value)} placeholder="z.B. Lieferschein-Nr."/></div>
        <button className="btn btn-primary" style={{width:"100%"}} onClick={save} disabled={saving || noModule}>
          {saving ? <><div className="spinner" style={{width:15,height:15}}/>Buche...</> : <><Icon name="receive" size={16}/> Wareneingang buchen</>}
        </button>
      </div>
    </div>
  );
}

// ─── Lieferscheine (Shipments) ───────────────────────────────────────────────
function LieferscheineView({ api, showToast, onBack }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [customers, setCustomers] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        api.getShipments().catch(() => []),
        api.getThirdparties("customer").catch(() => []),
      ]);
      setItems(Array.isArray(s) ? s : []);
      setCustomers(Array.isArray(c) ? c : []);
    } finally { setLoading(false); }
  }, [api]);

  useEffect(() => { if (api) load(); }, [load]);

  if (detail) return <LieferscheinDetail item={detail} customers={customers} onBack={() => setDetail(null)} />;

  const statusLabel = (s) => {
    const n = Number(s);
    if (n === 0) return ["Entwurf", "badge-draft"];
    if (n === 1) return ["Validiert", "badge-open"];
    if (n === 2) return ["Geliefert", "badge-paid"];
    return ["–", "badge-draft"];
  };

  return (
    <div className="main">
      <div className="page-header">
        <div className="back-btn" onClick={onBack}><Icon name="back" size={20}/></div>
        <h2>Lieferscheine</h2>
      </div>
      {loading ? <div className="loading"><div className="spinner"/> Lade...</div>
        : items.length === 0
          ? <div className="empty-state"><Icon name="receive" size={48}/><p>Keine Lieferscheine</p></div>
          : items.map(s => {
            const [lbl, cls] = statusLabel(s.statut ?? s.status);
            const cust = customers.find(c => String(c.id) === String(s.socid));
            return (
              <div key={s.id} className="list-item" onClick={() => setDetail(s)}>
                <div className="list-avatar" style={{background:"var(--k-petrol-bg)",color:"var(--k-petrol)"}}><Icon name="receive" size={19}/></div>
                <div className="list-info">
                  <div className="list-name">{s.ref || `LS-${s.id}`}</div>
                  <div className="list-sub">{cust?.name || "—"} · {fmtDate(s.date_livraison || s.date_delivery)}</div>
                </div>
                <span className={`badge ${cls}`}>{lbl}</span>
              </div>
            );
          })}
    </div>
  );
}

function LieferscheinDetail({ item, customers, onBack }) {
  const cust = customers.find(c => String(c.id) === String(item.socid));
  const lines = item.lines || [];
  return (
    <div className="main">
      <div className="page-header">
        <div className="back-btn" onClick={onBack}><Icon name="back" size={20}/></div>
        <h2>Lieferschein</h2>
      </div>
      <div className="detail-hero">
        <div className="detail-ref">{item.ref || `LS-${item.id}`}</div>
        <div className="detail-client">{cust?.name || "—"}</div>
        <div style={{marginTop:12}}>
          <div className="detail-row"><span className="lbl">Datum</span><span className="val">{fmtDate(item.date_livraison || item.date_delivery)}</span></div>
          {item.note_private && <div className="detail-row"><span className="lbl">Notiz</span><span className="val">{item.note_private}</span></div>}
        </div>
      </div>
      {lines.length > 0 && (
        <div className="form-section" style={{marginTop:12}}>
          <div style={{fontWeight:600,marginBottom:8,fontSize:14}}>Positionen</div>
          {lines.map((l, i) => (
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--border)",fontSize:13}}>
              <span>{l.product_label || l.label || `Artikel #${l.fk_product || l.product_id}`}</span>
              <span style={{color:"var(--text2)"}}>× {l.qty_asked || l.qty}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Lager (Warehouse stock management) ──────────────────────────────────────
function LagerView({ api, showToast, onBack }) {
  const [mode, setMode] = useState("einbuchen"); // "einbuchen" | "ausbuchen" | "umbuchen"
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [warehouseFromId, setWarehouseFromId] = useState("");
  const [warehouseToId, setWarehouseToId] = useState("");
  const [qty, setQty] = useState("1");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [noModule, setNoModule] = useState(false);

  useEffect(() => {
    if (!api) return;
    api.getProducts().then(p => setProducts(Array.isArray(p) ? p : [])).catch(() => {});
    api.getWarehouses().then(w => {
      if (!Array.isArray(w) || w.length === 0) setNoModule(true);
      else setWarehouses(w);
    }).catch(() => setNoModule(true));
  }, [api]);

  const reset = () => { setProductId(""); setWarehouseId(""); setWarehouseFromId(""); setWarehouseToId(""); setQty("1"); setNote(""); };

  const saveEinbuchen = async () => {
    if (!productId) { showToast("Bitte Artikel wählen", "error"); return; }
    if (!warehouseId) { showToast("Bitte Lager wählen", "error"); return; }
    if (!(parseFloat(qty) > 0)) { showToast("Bitte Menge eingeben", "error"); return; }
    setSaving(true);
    try {
      await api.createStockMovement({
        product_id: parseInt(productId),
        warehouse_id: parseInt(warehouseId),
        qty: parseFloat(qty),
        type: 0,
        label: note || "Bestandskorrektur +",
        datem: Math.floor(new Date(date).getTime() / 1000),
      });
      showToast("Bestand eingebucht!"); reset();
    } catch (err) { showToast(doliError(err) || "Buchung fehlgeschlagen", "error"); }
    finally { setSaving(false); }
  };

  const saveAusbuchen = async () => {
    if (!productId) { showToast("Bitte Artikel wählen", "error"); return; }
    if (!warehouseId) { showToast("Bitte Lager wählen", "error"); return; }
    if (!(parseFloat(qty) > 0)) { showToast("Bitte Menge eingeben", "error"); return; }
    setSaving(true);
    try {
      await api.createStockMovement({
        product_id: parseInt(productId),
        warehouse_id: parseInt(warehouseId),
        qty: -parseFloat(qty),
        type: 0,
        label: note || "Verkauf / Ausgang",
        datem: Math.floor(new Date(date).getTime() / 1000),
      });
      showToast("Bestand ausgebucht!"); reset();
    } catch (err) { showToast(doliError(err) || "Buchung fehlgeschlagen", "error"); }
    finally { setSaving(false); }
  };

  const saveUmbuchen = async () => {
    if (!productId) { showToast("Bitte Artikel wählen", "error"); return; }
    if (!warehouseFromId || !warehouseToId) { showToast("Bitte Quell- und Ziellager wählen", "error"); return; }
    if (warehouseFromId === warehouseToId) { showToast("Quell- und Ziellager sind identisch", "error"); return; }
    if (!(parseFloat(qty) > 0)) { showToast("Bitte Menge eingeben", "error"); return; }
    setSaving(true);
    const ts = Math.floor(new Date(date).getTime() / 1000);
    const label = note || "Lagertransfer";
    try {
      await api.createStockMovement({ product_id: parseInt(productId), warehouse_id: parseInt(warehouseFromId), qty: -parseFloat(qty), type: 0, label, datem: ts });
      await api.createStockMovement({ product_id: parseInt(productId), warehouse_id: parseInt(warehouseToId),   qty:  parseFloat(qty), type: 0, label, datem: ts });
      showToast("Umgebucht!"); reset();
    } catch (err) { showToast(doliError(err) || "Umbuchung fehlgeschlagen", "error"); }
    finally { setSaving(false); }
  };

  const WSelect = ({ label, value, onChange }) => (
    <div className="field-group mb12">
      <label>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">— Lager wählen —</option>
        {warehouses.map(w => <option key={w.id} value={w.id}>{w.label || w.ref || `Lager #${w.id}`}</option>)}
      </select>
    </div>
  );

  return (
    <div className="main">
      <div className="page-header">
        <div className="back-btn" onClick={onBack}><Icon name="back" size={20}/></div>
        <h2>Lager</h2>
      </div>
      {noModule && <div style={{background:"var(--warn-soft)",border:"1px solid var(--warn)",borderRadius:12,padding:14,marginBottom:16,fontSize:13,color:"var(--warn)"}}>
        Lagermodul in Dolibarr nicht verfügbar oder keine Lager angelegt.
      </div>}

      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <button className={`btn btn-sm ${mode === "einbuchen" ? "btn-primary" : "btn-secondary"}`} style={{flex:1}} onClick={() => { setMode("einbuchen"); reset(); }}>
          <Icon name="archive" size={15}/> Einbuchen
        </button>
        <button className={`btn btn-sm ${mode === "ausbuchen" ? "btn-primary" : "btn-secondary"}`} style={{flex:1}} onClick={() => { setMode("ausbuchen"); reset(); }}>
          <Icon name="minus" size={15}/> Ausbuchen
        </button>
        <button className={`btn btn-sm ${mode === "umbuchen" ? "btn-primary" : "btn-secondary"}`} style={{flex:1}} onClick={() => { setMode("umbuchen"); reset(); }}>
          <Icon name="transfer" size={15}/> Umbuchen
        </button>
      </div>

      <div className="form-section">
        <SearchSelect label="Artikel *" value={productId} onChange={setProductId} options={products}
          getLabel={p => p.label || p.ref || `#${p.id}`}
          getSub={p => [p.ref, p.description].filter(Boolean).join(" · ")} placeholder="Artikel eintippen…" />

        {mode === "umbuchen" ? (<>
          <WSelect label="Aus Lager *" value={warehouseFromId} onChange={setWarehouseFromId} />
          <WSelect label="In Lager *"  value={warehouseToId}   onChange={setWarehouseToId}   />
        </>) : (
          <WSelect label="Lager *" value={warehouseId} onChange={setWarehouseId} />
        )}

        <div className="form-row mb12">
          <div className="field-group"><label>Menge *</label><input type="number" value={qty} onChange={e => setQty(e.target.value)} min="0.001" step="0.001"/></div>
          <div className="field-group"><label>Datum</label><input type="date" value={date} onChange={e => setDate(e.target.value)}/></div>
        </div>
        <div className="field-group mb20"><label>Bemerkung</label><input value={note} onChange={e => setNote(e.target.value)} placeholder="Optionale Bemerkung"/></div>

        <button className="btn btn-primary" style={{width:"100%"}} disabled={saving || noModule}
          onClick={mode === "einbuchen" ? saveEinbuchen : mode === "ausbuchen" ? saveAusbuchen : saveUmbuchen}>
          {saving ? <><div className="spinner" style={{width:15,height:15}}/>Buche...</>
            : mode === "einbuchen" ? <><Icon name="archive" size={16}/> Einbuchen</>
            : mode === "ausbuchen" ? <><Icon name="minus" size={16}/> Ausbuchen</>
            : <><Icon name="transfer" size={16}/> Umbuchen</>}
        </button>
      </div>
    </div>
  );
}

// ─── Time Tracking ──────────────────────────────────────────────────────────
function TimeTracking({ api, me, showToast, setPendingCount }) {
  const [logs, setLogs] = useState([]);
  const tasks = useProjectTasks(api);
  const [showManual, setShowManual] = useState(false);
  const timer = useTimeTracker(api, showToast, me, setPendingCount);
  const { state, elapsed, saving } = timer;

  // Der Monat, den die Übersicht zeigt. Ein Monat, weil das die Einheit ist, in
  // der abgerechnet wird — und weil jemand, der seine eigenen Zeiten nicht
  // einsehen kann, eine falsche Buchung auch nicht bemerken kann.
  const [monat, setMonat] = useState(() => { const h = new Date(); return { jahr: h.getFullYear(), m: h.getMonth() }; });
  const [uebersicht, setUebersicht] = useState(null);
  const [ladeFehler, setLadeFehler] = useState("");
  const [laedt, setLaedt] = useState(false);

  const ladeMonat = useCallback(async () => {
    if (!offline.isOnline()) { setLadeFehler("Ohne Verbindung — die Übersicht kommt vom Server."); return; }
    setLaedt(true); setLadeFehler("");
    try {
      const { von, bis } = monatsGrenzen(monat.jahr, monat.m);
      setUebersicht(await api.getMeineZeiten(fmtDoliDateTime(von), fmtDoliDateTime(bis)));
    } catch (e) { setUebersicht(null); setLadeFehler(doliError(e)); }
    finally { setLaedt(false); }
  }, [api, monat]);

  useEffect(() => { ladeMonat(); }, [ladeMonat]);

  // Die "letzten Einträge" bleiben daneben stehen: sie zeigen auch dann etwas an,
  // wenn offline gebucht wurde und der Server die Zeile noch gar nicht kennt.
  const addLog = useCallback((entry) => setLogs((l) => [entry, ...l].slice(0, 20)), []);

  const startStop = async () => {
    if (!state.running) { timer.start(); }
    else { const saved = await timer.stop(); if (saved) { addLog(saved); ladeMonat(); } }
  };

  const monatWechseln = (schritt) => setMonat(m => {
    const d = new Date(m.jahr, m.m + schritt, 1);
    return { jahr: d.getFullYear(), m: d.getMonth() };
  });
  const heute = new Date();
  const istAktuellerMonat = monat.jahr === heute.getFullYear() && monat.m === heute.getMonth();
  const tage = nachTagen(uebersicht?.zeilen);

  return (
    <div className="main">
      <div className="page-header">
        <h2>Zeiterfassung</h2>
        <button className="btn btn-secondary btn-sm" onClick={()=>setShowManual(true)}>Manuell</button>
      </div>
      <div className={`timer-display ${state.running?"timer-running":""}`}>
        <div style={{fontSize:11,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:10}}>{state.running?"⏱ Läuft...":"Bereit"}</div>
        <div className="timer-time">{fmtTimer(elapsed)}</div>
        <div className="field-group" style={{marginTop:16,textAlign:"left"}}>
          <label>Aufgabe</label>
          <select value={state.task} onChange={e=>timer.setMeta({task:e.target.value})}>
            <option value="">— Aufgabe wählen —</option>
            {tasks.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div className="field-group" style={{marginTop:10,textAlign:"left"}}>
          <label>Beschreibung</label>
          <input value={state.note} onChange={e=>timer.setMeta({note:e.target.value})} placeholder="Was wird gemacht?"/>
        </div>
      </div>
      <button className={`btn ${state.running?"btn-danger":"btn-success"}`} style={{width:"100%",padding:18,fontSize:17,marginBottom:14}} onClick={startStop} disabled={saving}>
        {saving?<><div className="spinner" style={{width:16,height:16}}/>Speichere…</>:state.running?"⏹ Stoppen & Speichern":"▶ Timer starten"}
      </button>
      <div className="section-label" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
        <span>Meine Zeiten</span>
        <span style={{display:"flex",alignItems:"center",gap:6}}>
          <button className="btn btn-secondary btn-sm" onClick={()=>monatWechseln(-1)} aria-label="Voriger Monat">‹</button>
          <span style={{minWidth:120,textAlign:"center",textTransform:"none",letterSpacing:0}}>
            {new Date(monat.jahr,monat.m,1).toLocaleDateString("de-DE",{month:"long",year:"numeric"})}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={()=>monatWechseln(1)} disabled={istAktuellerMonat} aria-label="Nächster Monat">›</button>
        </span>
      </div>

      {laedt&&<div style={{padding:14,color:"var(--text2)",fontSize:13,display:"flex",alignItems:"center",gap:8}}><div className="spinner" style={{width:14,height:14}}/>Lade…</div>}
      {!laedt&&ladeFehler&&<div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--radius)",padding:14,marginBottom:8,fontSize:13,color:"var(--text2)"}}>{ladeFehler}</div>}

      {!laedt&&!ladeFehler&&uebersicht&&<>
        <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--radius)",padding:14,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontWeight:600,fontSize:14}}>Summe im Monat</span>
          <span style={{fontVariantNumeric:"tabular-nums",fontWeight:700,color:"var(--accent2)",fontSize:16}}>{fmtDauer(uebersicht.summe)}</span>
        </div>
        {tage.length===0
          ? <div style={{padding:14,color:"var(--text2)",fontSize:13}}>In diesem Monat ist nichts erfasst.</div>
          : tage.map(t=>(
            <div key={t.tag} style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--radius)",padding:14,marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontWeight:600,fontSize:14}}>{t.datum.toLocaleDateString("de-DE",{weekday:"short",day:"2-digit",month:"2-digit"})}</div>
                <div style={{fontVariantNumeric:"tabular-nums",fontWeight:600,color:"var(--accent2)"}}>{fmtDauer(t.dauer)}</div>
              </div>
              {t.zeilen.map(z=>(
                <div key={z.id} style={{borderTop:"1px solid var(--border)",paddingTop:8,marginTop:8,fontSize:13}}>
                  {/* Der Zeitraum steht in der Notiz — Dolibarr kennt kein Ende.
                      Deshalb hier die Notiz zeigen und nicht bloß den Beginn. */}
                  <div>{z.notiz||"Zeiterfassung"}</div>
                  <div style={{color:"var(--text2)",marginTop:2,display:"flex",justifyContent:"space-between",gap:8}}>
                    <span>{[z.projekt,z.aufgabe].filter(Boolean).join(" · ")}</span>
                    <span style={{fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>{fmtDauer(z.dauer)}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        <div style={{fontSize:12,color:"var(--text2)",padding:"2px 2px 14px"}}>
          Stimmt etwas nicht? Bitte melden — die Aufzeichnung ist die Grundlage der Abrechnung.
        </div>
      </>}

      {logs.length>0&&<>
        <div className="section-label">In dieser Sitzung gebucht</div>
        {logs.map((l,i)=>(
          <div key={i} style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--radius)",padding:14,marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:600,fontSize:14}}>{l.note||"Zeiterfassung"}</div>
              <div style={{fontSize:12,color:"var(--text2)",marginTop:2}}>{l.timespent_date?fmtDate(l.timespent_date):"—"}</div>
            </div>
            <div style={{fontVariantNumeric:"tabular-nums",fontWeight:600,color:"var(--accent2)"}}>{fmtTimer(parseInt(l.timespent_duration||0))}</div>
          </div>
        ))}
      </>}
      {showManual&&<ManualTimeEntry api={api} tasks={tasks} me={me} setPendingCount={setPendingCount} onClose={()=>setShowManual(false)}
        onSaved={(entry)=>{setShowManual(false);showToast(entry?.offline?"Offline gespeichert – wird synchronisiert, sobald wieder online.":"Zeit eingetragen!");addLog(entry);ladeMonat();}} showToast={showToast}/>}
    </div>
  );
}

// Von Hand nachtragen heißt: Beginn und Ende eintragen, nicht eine Stundenzahl.
// § 17 MiLoG verlangt beide, und der Nachtrag ist genau der Fall, in dem jemand
// vergessen hat, den Timer zu drücken — aus einer bloßen Stundenzahl ließe sich
// der Beginn nur erfinden. Die alte Maske tat das auch: sie buchte jede
// nachgetragene Schicht auf 12:00 GMT, also 14:00 im Sommer.
function ManualTimeEntry({ api, tasks, me, setPendingCount, onClose, onSaved, showToast }) {
  const [date,setDate]=useState(todayISO());
  const [von,setVon]=useState("08:00");
  const [bis,setBis]=useState("16:00");
  const [pause,setPause]=useState(30);
  const [task,setTask]=useState("");
  const [note,setNote]=useState("");
  const [saving,setSaving]=useState(false);

  // Nachgetragen werden darf bis zum Ersten des Vormonats — weit genug, um einen
  // vergessenen Tag noch vor der Abrechnung zu retten, aber nicht so weit, dass
  // aus dem Korrekturweg eine Sammelerfassung am Jahresende wird.
  const heute = new Date();
  const frueheste = nachtragGrenze(heute);
  const spanne = spanneRechnen(date, von, bis, pause);
  const zuAlt = spanne.beginn && spanne.beginn < frueheste.getTime();
  const inZukunft = spanne.beginn && spanne.beginn > heute.getTime();
  const hinweis = spanne.dauer ? pausenHinweis(spanne.dauer, spanne.pause) : "";
  const verspaetet = !zuAlt && !inZukunft && spanne.beginn ? nachtragHinweis(spanne.beginn, heute) : "";
  const sperre = spanne.fehler
    || (zuAlt ? `Weiter zurück als zum ${frueheste.toLocaleDateString("de-DE")} kann hier nichts nachgetragen werden. Bitte im Büro melden.` : "")
    || (inZukunft ? "Zeiten für die Zukunft lassen sich nicht erfassen." : "");

  const save = async () => {
    if(sperre){showToast(sperre,"error");return;}
    if(!task){showToast("Bitte eine Aufgabe wählen","error");return;}
    const notiz = zeitNotiz(zeitraumText(spanne.beginn, spanne.ende, spanne.pause), note);
    const dur = spanne.dauer;
    setSaving(true);
    try {
      if (offline.isOnline() && window.__api) {
        await saveTimeSpent(api, task, {
          date: fmtDoliDateTime(spanne.beginn),
          duration: dur,
          userId: resolveUserId(me),
          note: notiz,
        });
        onSaved({ timespent_date: Math.floor(spanne.beginn/1000), timespent_duration: dur, note: notiz });
      } else {
        await offline.enqueue({
          type: "time",
          payload: {
            taskOrProjectRef: task,
            date: fmtDoliDateTime(spanne.beginn),
            durationSeconds: dur,
            userId: resolveUserId(me),
            note: notiz,
          },
          createdBy: me?.login || "",
        });
        setPendingCount(c => c + 1);
        onSaved({ offline: true, timespent_date: Math.floor(spanne.beginn/1000), timespent_duration: dur, note: notiz });
      }
    } catch (e) { showToast(`Speicherfehler: ${doliError(e)}`, "error"); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-handle"/>
        <div className="modal-title">Manuelle Zeiterfassung</div>
        <div className="field-group mb12"><label>Datum</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            min={`${frueheste.getFullYear()}-${String(frueheste.getMonth()+1).padStart(2,"0")}-01`} max={todayISO()}/>
        </div>
        <div className="form-row mb12">
          <div className="field-group"><label>Von</label><TimeField value={von} onChange={e=>setVon(e.target.value)}/></div>
          <div className="field-group"><label>Bis</label><TimeField value={bis} onChange={e=>setBis(e.target.value)}/></div>
        </div>
        <div className="field-group mb12"><label>Pause (Minuten)</label><input type="number" value={pause} onChange={e=>setPause(e.target.value)} min="0" max="480" step="5"/></div>
        <div style={{background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"var(--radius)",padding:"10px 12px",marginBottom:12,fontSize:13}}>
          {sperre
            ? <span style={{color:"var(--danger)"}}>{sperre}</span>
            : <>Arbeitszeit <b style={{fontVariantNumeric:"tabular-nums"}}>{fmtTimer(spanne.dauer)}</b><span style={{color:"var(--text2)"}}> · {zeitraumText(spanne.beginn, spanne.ende, spanne.pause)}</span></>}
          {hinweis&&<div style={{marginTop:6,color:"var(--warn)"}}>{hinweis}</div>}
          {verspaetet&&<div style={{marginTop:6,color:"var(--warn)"}}>{verspaetet}</div>}
        </div>
        <div className="field-group mb12"><label>Aufgabe</label>
          <select value={task} onChange={e=>setTask(e.target.value)}>
            <option value="">— Aufgabe wählen —</option>
            {tasks.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div className="field-group mb20"><label>Beschreibung</label><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Was wurde gemacht?"/></div>
        <div style={{display:"flex",gap:10}}>
          <button className="btn btn-secondary" style={{flex:1}} onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" style={{flex:1}} onClick={save} disabled={saving||!!sperre}>
            {saving?<><div className="spinner" style={{width:15,height:15}}/>Speichere...</>:"Eintragen"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Expenses / Mileage (Spesen) ─────────────────────────────────────────────
// Records a kilometer flat-rate (Kilometerpauschale) as a Dolibarr expense-report
// line so it shows up under expenses. An expense report needs an employee
// (fk_user_author) and a fee type; the kilometer type (code EX_KME) is picked
// automatically from the dictionary, with the rate defaulting to 0,30 €/km.
const EXPENSE_STATUS = { 0:"Entwurf", 2:"Erfasst", 4:"Genehmigt", 5:"Bezahlt", 6:"Storniert", 99:"Abgelehnt" };

function Expenses({ api, me, showToast }) {
  const [users, setUsers] = useState([]);
  const [types, setTypes] = useState([]);
  const [reports, setReports] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectid, setProjectid] = useState("");
  const [loading, setLoading] = useState(true);
  const [author, setAuthor] = useState("");
  const [typeId, setTypeId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [km, setKm] = useState("");
  const [rate, setRate] = useState("0.30");
  const [desc, setDesc] = useState("");
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();
  const [saving, setSaving] = useState(false);

  const userName = (u) => [u.firstname, u.lastname].filter(Boolean).join(" ") || u.login || `#${u.id}`;
  const isKm = (t) => /KME|KILO/i.test(t?.code || "");
  const fixedRateForType = (t) => {
    const txt = `${t?.code || ""} ${t?.label || ""}`;
    if (/VMA\s*14|VMA14|VERPFLEG.*14/i.test(txt)) return 14;
    if (/VMA\s*28|VMA28|VERPFLEG.*28/i.test(txt)) return 28;
    return null;
  };
  const applyExpenseType = (id) => {
    setTypeId(id);
    const t = types.find(x => String(x.id ?? x.rowid) === String(id));
    const fixed = fixedRateForType(t);
    if (fixed !== null) { setKm("1"); setRate(String(fixed)); }
    else if (isKm(t)) { setRate("0.30"); }
  };

  const loadReports = useCallback(() => {
    api.getExpenseReports().then(r=>setReports(Array.isArray(r)?r:[])).catch(()=>setReports([]));
  }, [api]);

  useEffect(() => {
    if (!api) return;
    setLoading(true);
    Promise.all([
      api.getUsers().catch(()=>[]),
      api.getExpenseTypes().catch(()=>[]),
      api.getExpenseReports().catch(()=>[]),
      api.getProjects().catch(()=>[]),
    ]).then(([u, t, r, p]) => {
      const ul = Array.isArray(u)?u:[]; setUsers(ul); if (ul[0]) setAuthor(String(ul[0].id));
      const tl = Array.isArray(t)?t:[]; setTypes(tl);
      const kmType = tl.find(isKm) || tl[0];
      if (kmType) setTypeId(String(kmType.id ?? kmType.rowid));
      setReports(Array.isArray(r)?r:[]);
      setProjects((Array.isArray(p)?p:[]).filter(isOpenProject));
    }).finally(()=>setLoading(false));
  }, [api]);

  const selType = types.find(t=>String(t.id ?? t.rowid)===String(typeId));
  const total = (parseFloat(km)||0) * (parseFloat(rate)||0);
  const allowedExpenseFile = (f) => ["application/pdf", "image/jpeg", "image/png"].includes(f.type) || /\.(pdf|jpe?g|png)$/i.test(f.name);
  const uploadExpenseFiles = async (reportId, reportRef) => {
    if (!files.length) return;
    setUploading(true);
    let ok = 0, fail = 0;
    for (const file of files) {
      try {
        if (!allowedExpenseFile(file)) { fail++; continue; }
        const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
        const fd = new FormData();
        fd.append("modulepart", "expensereport");
        fd.append("ref", reportRef);
        fd.append("subdir", "");
        fd.append("filename", buildFilename(reportRef, file.name));
        fd.append("filecontent", String(b64).split(",")[1]);
        fd.append("fileencoding", "base64");
        fd.append("overwriteifexists", "0");
        await api.uploadDocument(fd);
        ok++;
      } catch { fail++; }
    }
    setUploading(false);
    if (ok) showToast(`${ok} Anhang/Anhänge hochgeladen!`);
    if (fail) showToast(`${fail} Anhang/Anhänge fehlgeschlagen`, "error");
  };

  const save = async () => {
    if (!author) { showToast("Bitte Mitarbeiter wählen","error"); return; }
    if (!typeId) { showToast("Spesenart nicht verfügbar","error"); return; }
    if (!(parseFloat(km)>0)) { showToast("Kilometer eingeben","error"); return; }
    setSaving(true);
    try {
      const ts = toEpoch(date);
      const er = await api.createExpenseReport({
        fk_user_author: parseInt(author),
        date_debut: ts,
        date_fin: ts,
        status: 0,
        ...(projectid ? { fk_project: parseInt(projectid) } : {}),
      });
      const erId = (er && typeof er === "object") ? (er.id ?? er.rowid) : er;
      await api.addExpenseLine(erId, {
        date: ts,
        fk_c_type_fees: parseInt(typeId),
        qty: parseFloat(km),
        value_unit: parseFloat(rate),
        vatrate: 0,
        comments: desc || (isKm(selType) ? `Kilometerpauschale ${km} km × ${fmtMoney(rate)}` : (selType?.label || "Spese")),
        ...(projectid ? { fk_project: parseInt(projectid) } : {}),
      });
      let reportRef = (er && typeof er === "object" && (er.ref || er.ref_ext)) ? (er.ref || er.ref_ext) : "";
      if (!reportRef) {
        try { const fresh = await api.getExpenseReport(erId); reportRef = fresh?.ref || fresh?.ref_ext || ""; } catch {}
      }
      await uploadExpenseFiles(erId, reportRef || `EXP-${erId}`);
      showToast("Spese erfasst!");
      setKm(""); setDesc(""); setFiles([]); if (fileRef.current) fileRef.current.value = "";
      loadReports();
    } catch (err) {
      const m = String(err?.message||"").match(/"message"\s*:\s*"([^"]+)"/);
      showToast(m ? m[1] : "Erfassen fehlgeschlagen", "error");
    } finally { setSaving(false); }
  };

  return (
    <div className="main">
      <div className="page-header"><h2>Spesen</h2></div>

      <div className="form-section">
        <div className="form-section-title">Kilometerpauschale</div>
        <div className="field-group mb12">
          <label>Mitarbeiter</label>
          <select value={author} onChange={e=>setAuthor(e.target.value)}>
            <option value="">— Mitarbeiter wählen —</option>
            {users.map(u=><option key={u.id} value={u.id}>{userName(u)}</option>)}
          </select>
        </div>
        <SearchSelect
          label="Projekt optional"
          value={projectid}
          onChange={setProjectid}
          options={projects}
          getLabel={p => p.ref ? `${p.ref} · ${p.title || p.label || p.ref}` : (p.title || p.label || `Projekt #${p.id || p.rowid}`)}
          getSub={p => p.description || ""}
          placeholder="Projekt eintippen…"
          optional
        />
        <div className="field-group mb12">
          <label>Spesenart</label>
          <select value={typeId} onChange={e=>applyExpenseType(e.target.value)}>
            <option value="">— Art wählen —</option>
            {types.map(t=><option key={t.id ?? t.rowid} value={t.id ?? t.rowid}>{t.label || t.code}</option>)}
          </select>
        </div>
        <div className="form-row mb12">
          <div className="field-group"><label>{isKm(selType)?"Kilometer":(fixedRateForType(selType)!==null?"Anzahl":"Menge")}</label>
            <input type="number" value={km} onChange={e=>setKm(e.target.value)} min="0" step={isKm(selType)?"0.1":"1"} placeholder="0"/></div>
          <div className="field-group"><label>{isKm(selType)?"Satz (€/km)":"Betrag (€)"}</label>
            <input type="number" value={rate} onChange={e=>setRate(e.target.value)} min="0" step="0.01" readOnly={fixedRateForType(selType)!==null}/></div>
        </div>
        <div className="field-group mb12"><label>Datum</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
        <div className="field-group mb12"><label>Beschreibung</label><input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="z.B. Fahrt zum Kunden"/></div>
        <div className="field-group mb12">
          <label>Belege / Fotos</label>
          <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={e=>setFiles(Array.from(e.target.files || []))} />
          <div style={{fontSize:12,color:"var(--text2)"}}>PDF, JPG/JPEG oder PNG. Auf dem Handy kann darüber auch direkt ein Foto/Scan aufgenommen werden.</div>
          {files.length > 0 && <div className="chip" style={{width:"fit-content",marginTop:4}}>{files.length} Datei(en) ausgewählt</div>}
        </div>
        <div className="line-total" style={{marginBottom:12}}>Summe: {fmtMoney(total)}</div>
        <button className="btn btn-primary" style={{width:"100%"}} onClick={save} disabled={saving || loading || uploading}>
          {(saving || uploading)?<><div className="spinner" style={{width:15,height:15}}/>Speichere…</>:<><Icon name="car" size={16}/> Als Spese erfassen</>}
        </button>
        {!loading && users.length===0 && <div style={{fontSize:12,color:"var(--warn)",marginTop:10}}>Keine Mitarbeiter über die API verfügbar. Spesenmodul in Dolibarr aktivieren.</div>}
      </div>

      <div className="section-label">Letzte Spesen</div>
      {loading ? <div className="loading"><div className="spinner"/> Lade...</div>
        : reports.length===0 ? <div className="empty-state"><Icon name="car" size={48}/><p>Keine Spesen</p></div>
        : reports.map(r=>(
          <div key={r.id} className="list-item" style={{cursor:"default"}}>
            <div className="list-avatar" style={{background:"var(--k-ziegel-bg)",color:"var(--k-ziegel)"}}><Icon name="car" size={19}/></div>
            <div className="list-info">
              <div className="name">{r.ref||`Spese #${r.id}`}</div>
              <div className="sub">{fmtDate(r.date_debut)} · {EXPENSE_STATUS[r.status]||EXPENSE_STATUS[r.fk_statut]||"—"}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div className="list-amount">{fmtMoney(r.total_ttc)}</div>
              <ExpenseActions api={api} report={r} me={me} showToast={showToast} onChanged={loadReports} />
            </div>
          </div>
        ))}
    </div>
  );
}

// Für src/ui/GbuFormSkt.jsx (eigene Datei, gleiche Hausordnung wie src/tutorial/):
// die Maske braucht Unterschriften-Pad, Suchauswahl, Icons und die GBU-Ablage
// von hier. Zirkulärer Import ist unkritisch — alles wird erst beim Rendern benutzt.
export { SignaturePad, SuchAuswahl, Icon, apiFetch, loadNcConfig, loadGbuQueue, saveGbuQueue, loadGbuLog, processGbuQueue, ewPersonen, isOpenProject };
// Offline-Weitergabe (Teilprojekt B, 18.09.2026): eigene Zeile statt die
// obige zu erweitern — zwei parallele Zweige (Kataster, GBU-Offline)
// erweitern diese Datei gleichzeitig, eine gemeinsame lange Export-Zeile
// wäre ein garantierter Merge-Konflikt.
export { GBU_PDF_DB, GBU_PDF_SPEICHER, gbuPdfSpeichernLokal, gbuTeilenOderSpeichern, useMandant };
