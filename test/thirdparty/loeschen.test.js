// Geschaeftspartner loeschen. Zu pruefen ist hier keine Maske, sondern zwei
// Dinge, an denen man sich irren kann: der Endpunkt (Dolibarr haengt an
// `/thirdparties/{id}`, nicht an einem Massen-Endpunkt) und die Uebersetzung
// der beiden Absagen, die Dolibarr auf ein DELETE kennt — 409 (Partner haengt
// noch an Belegen) und 403 (dem Dolibarr-Benutzer fehlt `societe->supprimer`).
// Beides am 16.08.2026 am Quelltext der Instanz nachgelesen. (16.08.2026)
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

const sandbox = {};
vm.createContext(sandbox);
const { friendlyThirdpartyDeleteError, canDeleteRecord } = vm.runInContext(
  schnitt("const creatorId =", "// Derive delete permissions")
  + schnitt("const canDeleteRecord =", "\n\n")
  + schnitt("function friendlyThirdpartyDeleteError(", "\n// ─── Status filters")
  + "\n({ friendlyThirdpartyDeleteError, canDeleteRecord })", sandbox);

// So kommt der Fehler aus `createApi.call` an: Status und roher Antworttext.
const apiFehler = (status, body) => new Error(`API Error ${status}: ${body}`);

describe("Der Endpunkt", () => {
  // `DELETE /thirdparties/{id}` ist der einzige Loeschweg fuer einen Partner.
  // Der Client-Aufruf existierte schon, hatte aber bis 16.08.2026 keinen
  // Aufrufer — wer ihn beim Aufraeumen entfernt, nimmt der App den Knopf.
  it("bleibt DELETE /thirdparties/{id}", () => {
    const zeile = schnitt("deleteThirdparty:", "\n");
    expect(zeile).toContain('call("DELETE", `/thirdparties/${id}`)');
  });
});

describe("Dolibarrs Absagen beim Loeschen", () => {
  // Der Regelfall bei gewachsenen Daten. Dolibarrs eigener Text spricht von
  // „that product" — der Satz stammt aus einem kopierten Baustein und wuerde
  // beim Geschaeftspartner nur verwirren.
  it("erklaert den 409 mit den haengenden Belegen, nicht mit einem Produkt", () => {
    const t = friendlyThirdpartyDeleteError(
      apiFehler(409, '{"error":{"code":409,"message":"Can\'t delete, that product is probably used"}}'));
    expect(t).toContain("Belegen");
    expect(t.toLowerCase()).not.toContain("product");
    expect(t.toLowerCase()).not.toContain("produkt");
  });

  // 403 ist erreichbar, obwohl der Knopf sichtbar ist: die App-Rolle „Admin"
  // kommt aus der Gruppenzugehoerigkeit, das Loeschrecht aus Dolibarrs
  // Rechtematrix. Wer das nicht liest, sucht den Fehler in der App.
  it("weist beim 403 auf das fehlende Dolibarr-Recht hin", () => {
    const t = friendlyThirdpartyDeleteError(apiFehler(403, "Forbidden"));
    expect(t).toMatch(/Recht/i);
    expect(t).toMatch(/löschen/i);
  });

  it("reicht andere Fehler als Klartext durch", () => {
    expect(friendlyThirdpartyDeleteError(
      apiFehler(500, '{"error":{"message":"Datenbank weg"}}'))).toBe("Datenbank weg");
    expect(friendlyThirdpartyDeleteError(undefined)).toBe("Löschen fehlgeschlagen");
  });

  // Die Statuszahl kommt aus dem Kopf der Meldung, nicht irgendwoher aus dem
  // Antworttext: eine Kundennummer „409" im Namen darf nicht als Belegwarnung
  // durchgehen.
  it("liest den Status nur aus dem Meldungskopf", () => {
    const t = friendlyThirdpartyDeleteError(
      apiFehler(500, '{"error":{"message":"Partner 409 GmbH nicht gefunden"}}'));
    expect(t).toBe("Partner 409 GmbH nicht gefunden");
  });
});

describe("Wer loeschen darf", () => {
  // Gleiche Regel wie beim Projekt: Admin oder Anleger. Bewusst nicht enger —
  // sonst waere dieselbe Aktion an zwei Stellen der App verschieden geregelt.
  const partner = { id: "7", name: "Muster GmbH", user_creation_id: "12" };

  it("laesst den Admin jeden Partner loeschen", () => {
    expect(canDeleteRecord(partner, { isAdmin: true, id: "3" })).toBe(true);
  });

  it("laesst den Anleger seinen eigenen Partner loeschen", () => {
    expect(canDeleteRecord(partner, { isAdmin: false, id: "12" })).toBe(true);
  });

  it("verweigert es allen anderen", () => {
    expect(canDeleteRecord(partner, { isAdmin: false, id: "13" })).toBe(false);
    expect(canDeleteRecord(partner, null)).toBe(false);
  });

  // Fehlt der Anleger im Datensatz, faellt die Pruefung zu — nicht auf.
  it("faellt ohne Anleger-Feld zu", () => {
    expect(canDeleteRecord({ id: "7" }, { isAdmin: false, id: "12" })).toBe(false);
  });
});
