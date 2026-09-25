// Artikel-Zuordnung des Finishers (pipeline/finisher.py, find_product).
//
// Am 17.08.2026 hat der Fuzzy-Match Positionen wildfremden Artikeln zugeordnet:
// aus „T-Shirt inkl. Aufdruck" wurde der Artikel „Versandkosten, inklusive
// Überweisungskosten", aus „… Dorn 31 mm - Kurz" ein „Kurzadapter", aus „ART
// Abziehkirsche" die „Gartenarbeiten Basis". Ursache war die alte Teilwort-Regel:
// jedes Wort ab 2 Zeichen, das als *Teilstring* im Artikelnamen vorkam, hob den
// Score über die Trefferschwelle (inkl ⊂ inklusive).
//
// Beträge und Summen stimmten dabei — in der Freigabe-Mail war der Fehler nicht
// zu sehen, und nach dem Freigeben hing der Umsatz am falschen Artikel und dessen
// Konto. Deshalb hier die echten Fälle als Regression, zusammen mit einem
// positiven Fall, damit ein späteres Anziehen der Schwelle nicht still das
// Wiederfinden bekannter Artikel kaputtmacht.
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Der echte Python-Code wird aufgerufen, nicht in JS nachgebaut: eine Nachbildung
// würde genau den Fehler nicht finden, den man beim Nachbauen selbst macht.
const runFindProduct = (stamm, proben) => {
  const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(root, "pipeline"))})
from finisher import find_product
find_product.cache = json.loads(sys.argv[1])
print(json.dumps([find_product(None, t)[0] for t in json.loads(sys.argv[2])]))
`;
  const out = execFileSync("python3", ["-c", script, JSON.stringify(stamm), JSON.stringify(proben)],
    { encoding: "utf8" });
  return JSON.parse(out);
};

const STAMM = [
  { id: 500, label: "Versandkosten, inklusive Überweisungskosten" },
  { id: 11, label: "Kurzadapter Mini 7 auf 13 polig" },
  { id: 19, label: "Gartenarbeiten Basis" },
  { id: 65, label: "PETG Schwarz" },
  { id: 42, label: "Kraftstoff Super E10" },
];

// Reihenfolge der LLM-Knoten (pipeline/worker_ocr.py, llm_knoten). Fällt ein Knoten
// wegen Arbeitsspeicher aus — am 17.08.2026 auf dem Pipeline-Host passiert —, muss die
// Pipeline auf den nächsten ausweichen statt stehenzubleiben.
const runLlmKnoten = (cfg, zuletzt = null) => {
  const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(root, "pipeline"))})
import worker_ocr
cfg, zuletzt = json.loads(sys.argv[1]), json.loads(sys.argv[2])
if zuletzt:
    worker_ocr.llm_knoten.zuletzt = zuletzt
print(json.dumps(worker_ocr.llm_knoten(cfg)))
`;
  return JSON.parse(execFileSync("python3",
    ["-c", script, JSON.stringify(cfg), JSON.stringify(zuletzt)], { encoding: "utf8" }));
};

describe("LLM-Knoten-Reihenfolge", () => {
  it("nimmt die Liste in der angegebenen Reihenfolge", () => {
    expect(runLlmKnoten({ OLLAMA_URLS: "http://a:11434, http://b:11434 ,http://c:11434/" }))
      .toEqual(["http://a:11434", "http://b:11434", "http://c:11434"]);
  });

  it("fällt auf OLLAMA_URL zurück und dann auf localhost", () => {
    expect(runLlmKnoten({ OLLAMA_URL: "http://nur-einer:11434" })).toEqual(["http://nur-einer:11434"]);
    expect(runLlmKnoten({})).toEqual(["http://localhost:11434"]);
  });

  it("stellt den zuletzt erfolgreichen Knoten nach vorn", () => {
    // sonst läuft jeder weitere Beleg erneut in den Timeout des toten ersten Knotens
    expect(runLlmKnoten({ OLLAMA_URLS: "http://tot:11434,http://lebt:11434" }, "http://lebt:11434"))
      .toEqual(["http://lebt:11434", "http://tot:11434"]);
  });

  it("wirft Duplikate raus", () => {
    expect(runLlmKnoten({ OLLAMA_URLS: "http://a:11434,http://a:11434/,http://b:11434" }))
      .toEqual(["http://a:11434", "http://b:11434"]);
  });
});

// Artikelnamen im Stamm bleiben kurz: ein Baumsteigeisen heißt „Baumsteigeisen",
// nicht „Distel Baumsteigeisen Alu 3.1 Weaver Dorn 31 mm - Kurz". Hersteller, Maße
// und Ausführung stehen weiterhin in der Rechnungszeile.
const runKurzname = (proben) => {
  const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(root, "pipeline"))})
from finisher import kurzname
print(json.dumps([kurzname(t) for t in json.loads(sys.argv[1])]))
`;
  return JSON.parse(execFileSync("python3", ["-c", script, JSON.stringify(proben)],
    { encoding: "utf8" }));
};

describe("Artikelnamen kürzen (kurzname)", () => {
  it("kürzt die realen Bezeichnungen vom 17.08.2026", () => {
    expect(runKurzname([
      "Distel Baumsteigeisen Alu 3.1 Weaver Dorn 31 mm - Kurz",
      "Teufelberger Materialschlaufen für Treemotion",
      "ART Abziehkirsche 32 mm",
      "T-Shirt inkl. Aufdruck E190, weiß, Front und Rücken gem. Vorgabe",
      "Polo inkl. Aufdruck JN070, weiß, Front und Rücken gem. Vorgabe",
    ])).toEqual([
      "Baumsteigeisen", "Materialschlaufen", "Abziehkirsche", "T-Shirt", "Polo",
    ]);
  });

  it("lässt eine Farbangabe mit Schrägstrich nicht zum Artikelnamen werden", () => {
    // „rot/schwarz" überlebte als ein Token die Filterung und war das längste Wort
    expect(runKurzname(["Gleistein Safety Wire Positioner Set rot/schwarz 4 m"]))
      .toEqual(["Positioner"]);
  });

  it("lässt kurze Bezeichnungen unangetastet", () => {
    expect(runKurzname(["Kettenöl", "Motorsäge", "Kraftstoff Super"]))
      .toEqual(["Kettenöl", "Motorsäge", "Kraftstoff Super"]);
  });

  it("bleibt bei leerer Eingabe brauchbar", () => {
    expect(runKurzname(["", "   ", "31 mm"])).toEqual(["Position", "Position", "Position"]);
  });
});

describe("Artikel-Zuordnung (find_product)", () => {
  it("schiebt neue Positionen keinem vorhandenen Artikel unter", () => {
    const proben = [
      "T-Shirt inkl. Aufdruck E190, weiß, Front und Rücken gem. Vorgabe",
      "Polo inkl. Aufdruck JN070, weiß, Front und Rücken gem. Vorgabe",
      "Distel Baumsteigeisen Alu 3.1 Weaver Dorn 31 mm - Kurz",
      "ART Abziehkirsche 32 mm",
      "Gleistein Safety Wire Positioner Set rot/schwarz 4 m",
    ];
    expect(runFindProduct(STAMM, proben)).toEqual([null, null, null, null, null]);
  });

  it("findet einen wirklich vorhandenen Artikel weiterhin", () => {
    expect(runFindProduct(STAMM, ["Kraftstoff Super E10", "Super E10"])).toEqual([42, 42]);
  });

  it("lässt ein einzelnes gemeinsames Füllwort keinen Treffer auslösen", () => {
    // „für" und „Set" stecken in vielen Bezeichnungen und dürfen nichts entscheiden
    expect(runFindProduct([{ id: 7, label: "Kettenöl für Motorsägen" }],
      ["Teufelberger Materialschlaufen für Treemotion"])).toEqual([null]);
  });
});
