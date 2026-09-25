// Der Absatz zur Anwuchsgarantie stand bis zum 10.08.2026 fest im Fusstext
// JEDES Angebots — auch auf einem reinen Haecksler-Einsatz. Jetzt steht dort
// der Platzhalter __EXTRAFIELD_ANWUCHS_HINWEIS__, und das Zusatzfeld am
// Angebot traegt den Text oder eben nichts.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const von = src.indexOf("const ANWUCHS_HINWEIS =");
const bis = src.indexOf("// Kein eigener Merker", von);
if (von < 0 || bis < 0) throw new Error("Abschnitt nicht gefunden");
const sandbox = {};
vm.createContext(sandbox);
const { ANWUCHS_HINWEIS, anwuchsAn, anwuchsFeld } = vm.runInContext(
  src.slice(von, bis) + "\n({ ANWUCHS_HINWEIS, anwuchsAn, anwuchsFeld })", sandbox);

describe("anwuchsAn — der Text ist der Zustand", () => {
  it("erkennt ein Angebot mit Hinweis", () => {
    expect(anwuchsAn({ array_options: { options_anwuchs_hinweis: ANWUCHS_HINWEIS } })).toBe(true);
  });

  it("erkennt auch den Wortlaut aus dem Bestand wieder", () => {
    // Beim Umstellen wurde der Absatz per SQL in alle 17 vorhandenen Angebote
    // geschrieben. Erkannt wird am Stichwort, nicht am exakten Vergleich —
    // sonst wuerde ein spaeter geaenderter Wortlaut als "aus" gelten.
    expect(anwuchsAn({ array_options: { options_anwuchs_hinweis: "… (Anwuchsgarantie) wird nicht übernommen." } })).toBe(true);
  });

  it("meldet aus, wenn nichts drinsteht", () => {
    expect(anwuchsAn({ array_options: { options_anwuchs_hinweis: "" } })).toBe(false);
    expect(anwuchsAn({ array_options: { options_anwuchs_hinweis: null } })).toBe(false);
    expect(anwuchsAn({ array_options: {} })).toBe(false);
    expect(anwuchsAn({})).toBe(false);
    expect(anwuchsAn(null)).toBe(false);
  });
});

describe("anwuchsFeld", () => {
  it("schreibt beim Einschalten den vollen Absatz", () => {
    expect(anwuchsFeld(true).options_anwuchs_hinweis).toBe(ANWUCHS_HINWEIS);
    expect(ANWUCHS_HINWEIS).toContain("Anwuchsgarantie");
    expect(ANWUCHS_HINWEIS.length).toBe(408); // Wortlaut aus dem Fusstext, unveraendert
  });

  it("schreibt beim Ausschalten einen leeren Wert — nicht gar nichts", () => {
    // Entscheidend: Dolibarr ersetzt den Platzhalter nur, wenn das Angebot
    // ueberhaupt eine Zeile in der Zusatzfeld-Tabelle hat (functions.lib.php:
    // der __EXTRAFIELD_*__-Block haengt an `fetch_optionals() > 0`). Ohne
    // Zeile stuende "__EXTRAFIELD_ANWUCHS_HINWEIS__" im Klartext im
    // Kunden-PDF — an einem Wegwerf-Angebot genau so gesehen.
    expect(anwuchsFeld(false)).toEqual({ options_anwuchs_hinweis: "" });
    expect(anwuchsFeld(false)).toHaveProperty("options_anwuchs_hinweis");
  });
});

describe("Die Verdrahtung", () => {
  it("schickt das Feld beim Anlegen eines Angebots IMMER mit", () => {
    // Auch ohne Haekchen — sonst fehlt die Zeile und der Platzhalter leckt.
    const docForm = src.slice(src.indexOf("function DocForm({"), src.indexOf("// One invoice/proposal line"));
    expect(docForm).toContain('type === "proposal" ? { array_options: anwuchsFeld(pflanzen) }');
    expect(docForm).not.toContain("pflanzen ? { array_options: anwuchsFeld(true) } : {}");
  });

  it("bietet den Schalter im Angebots-Detail an", () => {
    expect(src).toContain("<PflanzenSchalter");
    expect(src).toContain("an={anwuchsAn(prop)}");
  });

  it("haengt den Schalter nicht an den Status", () => {
    // Auch bei einem offenen oder beauftragten Angebot muss sich das noch
    // umstellen lassen — man merkt es oft erst beim Gegenlesen des PDFs.
    const detail = src.slice(src.indexOf("<PflanzenSchalter"), src.indexOf("<NotizEditor api={api} docId={prop.id}"));
    expect(detail).not.toMatch(/statut/);
  });
});
