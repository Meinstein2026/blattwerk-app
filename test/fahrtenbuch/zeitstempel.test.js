// RFC-3161-Bytearbeit fuer den externen Zeitstempel der Pruefkette.
// Gegenprobe von Hand am 12.09.2026: die hier gebaute Anfrage ist strukturell
// gleich mit `openssl ts -query -sha256 -cert` (nur der Zufalls-Nonce weicht
// ab), DigiCert hat sie mit "Granted" beantwortet, und
// `openssl ts -verify -digest <hash> -in <datei>.tsr -CAfile ca-bundle.crt`
// sagt "Verification: OK". Genau dieser Befehl steht in CLAUDE.md fuer den
// Steuerpruefer — er muss weiter stimmen.
import { describe, expect, it } from "vitest";
import { TSA_URL_DEFAULT, tsqBauen, tsrStatus } from "../../src/zeitstempel.js";

const hex = (u8) => Buffer.from(u8).toString("hex");
const HASH = "a".repeat(64);
const NONCE = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
// SEQUENCE { INTEGER 1, SEQUENCE { SEQUENCE { OID sha256, NULL }, OCTET STRING },
//            INTEGER nonce, BOOLEAN TRUE }
const ERWARTET = "3043" + "020101"
  + "3031" + "300d" + "0609608648016503040201" + "0500" + "0420" + HASH
  + "0208" + "0102030405060708" + "0101ff";

describe("tsqBauen", () => {
  it("baut die Anfrage Byte fuer Byte nach RFC 3161", () => {
    expect(hex(tsqBauen(HASH, NONCE))).toBe(ERWARTET);
  });

  it("haelt den Nonce positiv und ohne fuehrende Null (sonst kein gueltiges DER)", () => {
    // Oberstes Bit gesetzt waere eine negative Ganzzahl …
    expect(hex(tsqBauen(HASH, Uint8Array.from([0xff, 0, 0, 0, 0, 0, 0, 0]))).slice(-22, -14)).toBe("7f000000");
    // … und ein Null-Byte am Anfang eine nicht-minimale Kodierung.
    expect(hex(tsqBauen(HASH, Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0]))).slice(-22, -14)).toBe("01000000");
  });

  it("nimmt nur einen echten SHA-256-Hash und einen 8-Byte-Nonce", () => {
    expect(() => tsqBauen("abc", NONCE)).toThrow();                    // ungerade Laenge
    expect(() => tsqBauen("zz".repeat(32), NONCE)).toThrow(/Hex/);     // kein Hex
    expect(() => tsqBauen("ab".repeat(20), NONCE)).toThrow(/32 Byte/); // zu kurz
    expect(() => tsqBauen(HASH, [1, 2, 3])).toThrow(/Nonce/);
  });

  it("stempelt gratis und ohne Anmeldung bei DigiCert", () => {
    expect(TSA_URL_DEFAULT).toBe("http://timestamp.digicert.com");
  });
});

// TimeStampResp ::= SEQUENCE { PKIStatusInfo { status INTEGER }, TimeStampToken OPTIONAL }
const antwort = (status, tokenBytes = [0x30, 0x03, 0x02, 0x01, 0x00]) => {
  const info = [0x30, 0x03, 0x02, 0x01, status];
  const inhalt = [...info, ...tokenBytes];
  const len = inhalt.length < 0x80 ? [inhalt.length] : [0x82, inhalt.length >> 8, inhalt.length & 0xff];
  return Uint8Array.from([0x30, ...len, ...inhalt]);
};

describe("tsrStatus", () => {
  it("erkennt erteilte Stempel (0 und 1)", () => {
    expect(tsrStatus(antwort(0))).toEqual({ status: 0, ok: true, text: "erteilt" });
    expect(tsrStatus(antwort(1)).ok).toBe(true);
  });

  it("erkennt Absagen", () => {
    expect(tsrStatus(antwort(2))).toMatchObject({ ok: false, text: "abgelehnt" });
    expect(tsrStatus(antwort(5))).toMatchObject({ ok: false, text: "widerrufen" });
    expect(tsrStatus(antwort(9))).toMatchObject({ ok: false, text: "unbekannt (9)" });
  });

  it("laesst ein 'erteilt' ohne beiliegenden Stempel nicht durchgehen", () => {
    expect(tsrStatus(antwort(0, []))).toMatchObject({ status: 0, ok: false });
  });

  it("liest auch die langen Laengen echter Antworten (die sind ein paar KB)", () => {
    const gross = antwort(0, [0x30, 0x82, 0x01, 0x00, ...new Array(256).fill(0x00)]);
    expect(gross.length).toBeGreaterThan(255);
    expect(tsrStatus(gross).ok).toBe(true);
  });

  it("wirft bei Muell statt still ok zu melden", () => {
    expect(() => tsrStatus(Uint8Array.from([0x04, 0x01, 0x00]))).toThrow(/Sequenz/);
    expect(() => tsrStatus(Uint8Array.from([0x30]))).toThrow(/zu kurz/);
    expect(() => tsrStatus(Uint8Array.from([0x30, 0x03, 0x02, 0x01, 0x00]))).toThrow(/PKIStatusInfo/);
    expect(() => tsrStatus(Uint8Array.from([0x30, 0x05, 0x30, 0x09, 0x02, 0x01, 0x00]))).toThrow(/ueber das Ende|über das Ende/);
  });
});
