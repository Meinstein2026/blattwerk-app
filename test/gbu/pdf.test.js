// PDF-Reproduzierbarkeit (Befund 2, Abschlussprüfung 2026-08-09): geht die
// Antwort von /api/pl/upload verloren (Funkloch, Neustart, Zeitüberschreitung),
// bleibt der Erledigt-Merker der Warteschlange falsch und derselbe Datensatz
// wird beim nächsten Start erneut hochgeladen — mit einem neu erzeugten PDF.
// Ohne ein festes Erstellungsdatum und eine feste Datei-ID wäre dieses PDF nie
// byte-gleich zum ersten Versuch (jsPDF stempelt sonst "jetzt" plus eine
// zufällige ID hinein), Paperless' Prüfsummen-Duplikaterkennung liefe ins
// Leere und es entstünde ein echtes Doppel im Archiv.
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGbuPdf } from "../../src/gbu-pdf.js";
import { sha256Hex } from "../../src/paperless.js";

const REKORD = {
  id: "gbu-1723209600000",
  createdAt: "2026-08-09T10:15:30.000Z",
  userName: "Max Muster",
  kunde: { name: "Testkunde" },
  projekt: null,
  arbeitsart: "maehen", zugang: "",
  niederschlag: "trocken", wind: "leicht",
  beschreibung: "Rasenfläche gemäht", baum: "", besonderheiten: "",
  zweitePersonName: "",
  einsatzort: "Musterweg 1, Musterstadt",
  aufsichtsfuehrender: "Max Muster",
  dauerVon: "08:00", dauerBis: "12:00",
  personal: [{ name: "Max Muster", quals: [] }],
  arbeiten: [], arbeitenSonstiges: "",
  stromEntfernung: "", kommunikationsart: "", verkehrssicherungsart: "",
  baumdaten: null,
  items: {},
  uploadedDolibarr: false, uploadedPl: false,
};

// Wie mandantBetrieb(null) in dolibarr-app.jsx (Blattwerks eigene Werte,
// 1:1 aus MANDANT_STANDARD.betrieb) — buildGbuPdf verweigert seit der
// Review zu Task 5 ohne betrieb.name, alle Aufrufe hier brauchen daher
// vollständige Betriebsdaten statt implizit auf "leer" zu laufen.
const BLATTWERK_BETRIEB = {
  name: "Blattwerk GbR", ort: "Musterstadt", uvTraeger: "SVLFG", grundGbu: "",
  anschrift: "Musterstraße 1, 12345 Musterstadt", gewerk: "Baum- und Gartenpflege", appName: "Blattwerk",
};

/** Wie submitGbuRecord in dolibarr-app.jsx: sha256 der PDF-BYTES, nicht des Base64-Textes. */
const sha256VonBase64 = async (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return sha256Hex(new Blob([bytes]));
};

describe("buildGbuPdf: Reproduzierbarkeit", () => {
  afterEach(() => vi.useRealTimers());

  it("erzeugt aus demselben Datensatz byte-identische PDFs, obwohl die Uhr dazwischen weiterläuft", async () => {
    // Vor Befund 2 hätte jsPDF (setCreationDate()/setFileId() ohne Argumente)
    // hier den jeweils aktuellen Zeitpunkt und eine zufällige Datei-ID
    // hineingestempelt — mit fortlaufender Uhr wäre der zweite Aufruf
    // garantiert ein anderes PDF. vi.setSystemTime simuliert genau das
    // "erneuter Versuch nach ein paar Minuten", das den echten Vorfall auslöst.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T10:15:31.000Z"));
    const pdf1 = await buildGbuPdf(REKORD, { betrieb: BLATTWERK_BETRIEB });

    vi.setSystemTime(new Date("2026-08-09T10:17:48.000Z")); // gut zwei Minuten später "jetzt"
    const pdf2 = await buildGbuPdf(REKORD, { betrieb: BLATTWERK_BETRIEB });

    expect(pdf2).toBe(pdf1);
    const [h1, h2] = await Promise.all([sha256VonBase64(pdf1), sha256VonBase64(pdf2)]);
    expect(h2).toBe(h1);
  });

  it("erzeugt aus unterschiedlichen Datensätzen unterschiedliche PDFs", async () => {
    // Gegenprobe: Reproduzierbarkeit darf nicht bedeuten, dass immer dasselbe
    // PDF herauskommt, unabhängig vom Inhalt.
    const pdf1 = await buildGbuPdf(REKORD, { betrieb: BLATTWERK_BETRIEB });
    const pdf2 = await buildGbuPdf({ ...REKORD, id: "gbu-9999999999999", createdAt: "2026-08-10T09:00:00.000Z" }, { betrieb: BLATTWERK_BETRIEB });
    expect(pdf2).not.toBe(pdf1);
  });
});

describe("buildGbuPdf: Betriebsdaten sind Pflicht", () => {
  // Review-Fund zu Task 5: ohne betrieb.name wurde bisher stillschweigend
  // eine Kopfzeile "· <Ort> · UV-Träger: <…>" erzeugt — ein Dokument, das
  // aussieht wie eine gültige Gefährdungsbeurteilung, es aber nicht ist.
  it("verweigert ganz ohne betrieb", async () => {
    await expect(buildGbuPdf(REKORD)).rejects.toThrow(/betrieb\.name/);
  });

  it("verweigert mit betrieb ohne Firmenname", async () => {
    await expect(buildGbuPdf(REKORD, { betrieb: { ...BLATTWERK_BETRIEB, name: "" } })).rejects.toThrow(/betrieb\.name/);
  });

  it("verweigert bei reinem Leerraum als Firmenname", async () => {
    await expect(buildGbuPdf(REKORD, { betrieb: { ...BLATTWERK_BETRIEB, name: "   " } })).rejects.toThrow(/betrieb\.name/);
  });

  it("erzeugt normal, sobald betrieb.name gesetzt ist", async () => {
    await expect(buildGbuPdf(REKORD, { betrieb: BLATTWERK_BETRIEB })).resolves.toEqual(expect.any(String));
  });
});
