// Beleg-Versand per E-Mail. Der fruehere Weg POST /invoices/{id}/sendbyemail
// existiert in Dolibarr 23 schlicht nicht (grep ueber htdocs: kein Treffer,
// am 20.08.2026 an der Instanz geprueft) — jeder Versand lief auf 404. Der
// Versand geht jetzt ueber das eigene blattwerkapp-Modul, das Dolibarrs
// eigene Mail-Klasse aufruft: Vorlage "Kundenrechnung", PDF-Anhang,
// Agenda-Eintrag und die Blindkopie an MAIN_MAIL_AUTOCOPY_TO (finanzen@)
// wie in der Dolibarr-Sendemaske.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const schnitt = (von, bis) => {
  const a = src.indexOf(von);
  const b = src.indexOf(bis, a);
  if (a < 0 || b < 0) throw new Error("Abschnitt nicht gefunden: " + von);
  return src.slice(a, b);
};

const aufrufe = [];
const sandbox = { call: (method, pfad, body) => { aufrufe.push({ method, pfad, body }); } };
vm.createContext(sandbox);
const quelle = schnitt("getMailVorlage:", "getInvoiceDocuments:");
const api = vm.runInContext("({" + quelle + "})", sandbox);

describe("Die Versand-Endpunkte", () => {
  it("holen die Vorlage aus dem blattwerkapp-Modul", () => {
    api.getMailVorlage("rechnung", 42);
    expect(aufrufe.at(-1)).toEqual({ method: "GET", pfad: "/blattwerkapp/mail/vorlage?art=rechnung&id=42", body: undefined });
  });

  it("senden ueber das blattwerkapp-Modul", () => {
    const daten = { art: "rechnung", id: 42, empfaenger: "kunde@example.org", betreff: "Rechnung RE-1", text: "Guten Tag" };
    api.sendMailBeleg(daten);
    expect(aufrufe.at(-1)).toEqual({ method: "POST", pfad: "/blattwerkapp/mail/versand", body: daten });
  });

  it("der tote sendbyemail-Weg taucht nirgends mehr auf", () => {
    // Der Endpunkt existiert serverseitig nicht; wer ihn wieder einbaut,
    // baut einen Knopf, der immer 404 liefert. (Ein Kommentar im Quelltext
    // erwaehnt den Namen als Warnung — gesucht wird deshalb nach dem
    // Aufruf-Muster mit schliessendem Backtick, nicht nach dem blossen Wort.)
    expect(src).not.toContain("sendbyemail`");
  });
});

describe("Die Zahlungserinnerung", () => {
  it("holt ihre Vorlage als art=mahnung (Vorlage facture_relance serverseitig)", () => {
    api.getMailVorlage("mahnung", 44);
    expect(aufrufe.at(-1)).toEqual({ method: "GET", pfad: "/blattwerkapp/mail/vorlage?art=mahnung&id=44", body: undefined });
  });

  it("gibt die Mahnstufe an den Server weiter (2. Mahnung, Letzte Mahnung)", () => {
    api.getMailVorlage("mahnung", 44, 2);
    expect(aufrufe.at(-1).pfad).toBe("/blattwerkapp/mail/vorlage?art=mahnung&id=44&stufe=2");
    api.getMailVorlage("mahnung", 44, 3);
    expect(aufrufe.at(-1).pfad).toBe("/blattwerkapp/mail/vorlage?art=mahnung&id=44&stufe=3");
  });

  it("laesst die Vorlagen-URL von Rechnung und Angebot unangetastet", () => {
    // Ohne Stufe darf kein stufe-Parameter in der URL stehen — der Endpunkt
    // der Rechnung/des Angebots kennt ihn nicht zu brauchen.
    api.getMailVorlage("rechnung", 42);
    expect(aufrufe.at(-1).pfad).toBe("/blattwerkapp/mail/vorlage?art=rechnung&id=42");
  });

  it("fragt den Mahnstand beim Server ab", () => {
    api.getMahnstand(44);
    expect(aufrufe.at(-1)).toEqual({ method: "GET", pfad: "/blattwerkapp/mahnung/stand?id=44", body: undefined });
  });

  it("bietet keine freie Stufenwahl mehr in der Maske an", () => {
    // Die fruehe Fassung hatte drei Stufen-Chips in der EmailModal — wer
    // sie wieder einbaut, hebelt die Reihenfolge- und Fristpruefung des
    // Servers in der Bedienung aus.
    expect(src).not.toMatch(/\[\[1,"Zahlungserinnerung"\]/);
  });

  it("sendet ueber denselben Versand-Endpunkt wie die Rechnung", () => {
    const daten = { art: "mahnung", id: 44, empfaenger: "kunde@example.org", betreff: "Zahlungserinnerung zur Rechnung IN-1", text: "Guten Tag" };
    api.sendMailBeleg(daten);
    expect(aufrufe.at(-1)).toEqual({ method: "POST", pfad: "/blattwerkapp/mail/versand", body: daten });
  });

  it("zeigt nur die naechste Stufe laut Mahnstand, gesperrt vor der Frist", () => {
    // Mahnungen laufen sequenziell (Zahlungserinnerung -> 2. Mahnung ->
    // Letzte Mahnung) mit 7 Tagen Frist dazwischen; entscheiden tut der
    // Server (mahnstand). Der Knopf haengt an naechste_stufe, ist vor
    // erlaubt_ab ausgegraut, und die Maske bekommt die Stufe fest
    // uebergeben. Geprueft am Quelltext, weil die Ansicht ohne Dolibarr
    // nicht renderbar ist.
    expect(src).toMatch(/Number\(inv\.statut\)===1 && mahnstand\?\.naechste_stufe && \(/);
    expect(src).toMatch(/disabled=\{!mahnstand\.erlaubt \|\| loading\}/);
    expect(src).toMatch(/MAHN_NAMEN\[mahnstand\.naechste_stufe\]/);
    expect(src).toMatch(/stufe=\{mahnstand\.naechste_stufe\}/);
    expect(src).toMatch(/sendMailBeleg\(\{ art:"mahnung", id:inv\.id, stufe:mahnstand\.naechste_stufe/);
  });
});
