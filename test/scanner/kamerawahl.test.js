// Jedes getUserMedia kostet auf dem Durabook-Tablet beim ersten Mal 2–4 s
// (am Geraet gemessen 14.08.2026: RearCam 4,2 s, danach 0,1 s). Der Scanner
// oeffnete die Kamera zweimal — einmal um die Namen zu bekommen, einmal um auf
// die Rueckkamera zu wechseln. kameraWaehlen entscheidet, ob das zweite
// Oeffnen ueberhaupt noetig ist.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const src = fs.readFileSync(path.join(process.cwd(), "dolibarr-app.jsx"), "utf8");
const a = src.indexOf("function kameraWaehlen");
const b = src.indexOf("const KAMERA_KEY", a);
if (a < 0 || b < 0) throw new Error("kameraWaehlen nicht gefunden");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src.slice(a, b) + "\nthis.kameraWaehlen = kameraWaehlen;", sandbox);
const { kameraWaehlen } = sandbox;

// So heissen die Kameras auf dem Tablet wirklich (enumerateDevices, Firefox).
const REAR = { deviceId: "r1", label: "RearCam-5M: RearCam-5M" };
const FRONT = { deviceId: "f1", label: "USB Camera: USB2.0 FHD webcam" };

describe("kameraWaehlen", () => {
  it("nimmt die Rueckkamera am Namen — auch wenn sie schon an erster Stelle steht", () => {
    // Genau der alte Fehler: die Pruefung hiess `rear > 0`, bei Index 0 fiel sie durch.
    expect(kameraWaehlen([REAR, FRONT], "", "f1")).toEqual({ idx: 0, neuOeffnen: true });
  });

  it("oeffnet nicht neu, wenn die richtige Kamera schon laeuft", () => {
    expect(kameraWaehlen([REAR, FRONT], "", "r1")).toEqual({ idx: 0, neuOeffnen: false });
  });

  it("bevorzugt die zuletzt von Hand gewaehlte vor der Namenserkennung", () => {
    expect(kameraWaehlen([REAR, FRONT], "f1", "f1")).toEqual({ idx: 1, neuOeffnen: false });
    expect(kameraWaehlen([REAR, FRONT], "f1", "r1")).toEqual({ idx: 1, neuOeffnen: true });
  });

  it("faellt auf die Namenserkennung zurueck, wenn die gemerkte Kamera weg ist", () => {
    expect(kameraWaehlen([REAR, FRONT], "weg-123", "f1")).toEqual({ idx: 0, neuOeffnen: true });
  });

  it("nimmt ohne Treffer die erste Kamera", () => {
    const x = { deviceId: "x", label: "Integrated Camera" };
    expect(kameraWaehlen([x, FRONT], "", "x")).toEqual({ idx: 0, neuOeffnen: false });
  });

  it("laesst die laufende Kamera stehen, solange keine Kennungen vorliegen", () => {
    // Vor der Freigabe gibt der Browser weder Label noch deviceId heraus —
    // ein Neuoeffnen auf Verdacht waere hier reine Wartezeit.
    const anonym = [{ deviceId: "", label: "" }, { deviceId: "", label: "" }];
    expect(kameraWaehlen(anonym, "", "")).toEqual({ idx: 0, neuOeffnen: false });
  });

  it("kommt mit leerer Geraeteliste klar", () => {
    expect(kameraWaehlen([], "", "")).toEqual({ idx: -1, neuOeffnen: false });
    expect(kameraWaehlen(undefined, "", "")).toEqual({ idx: -1, neuOeffnen: false });
  });
});
