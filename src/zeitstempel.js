// Externer Zeitstempel nach RFC 3161 für die Fahrtenbuch-Prüfkette.
//
// Warum überhaupt: die Kette in fahrtenbuch.json beweist, dass nichts still
// geändert wurde — aber nicht, WANN sie entstanden ist. Wer die Datei besitzt,
// könnte sie theoretisch komplett neu durchrechnen. Ein fremder Zeitstempel-
// Dienst unterschreibt „diesen Hash gab es am <Zeitpunkt>" und macht genau das
// unmöglich. Übertragen wird nur der Hash — keine Fahrten, keine Namen.
//
// Dienst: DigiCert (http://timestamp.digicert.com), gratis, ohne Anmeldung,
// öffentliche CA. Antwort (.tsr) prüft der Steuerprüfer selbst:
//   openssl ts -verify -digest <hash> -in <nr>.tsr -CAfile <digicert-kette.pem>
//
// Hier steht nur die reine Bytearbeit (Anfrage bauen, Antwort auswerten);
// HTTP und Ablage in Nextcloud macht server.mjs.

export const TSA_URL_DEFAULT = "http://timestamp.digicert.com";

// ─── DER (nur so viel, wie eine TimeStampReq braucht) ───────────────────────
const derLen = (n) => {
  if (n < 0x80) return [n];
  const bytes = [];
  for (let r = n; r > 0; r = Math.floor(r / 256)) bytes.unshift(r % 256);
  return [0x80 | bytes.length, ...bytes];
};
const tlv = (tag, inhalt) => [tag, ...derLen(inhalt.length), ...inhalt];
const hexBytes = (hex) => {
  const s = String(hex || "").trim().toLowerCase();
  if (!/^[0-9a-f]*$/.test(s) || s.length % 2) throw new Error("Kein Hex");
  const out = [];
  for (let i = 0; i < s.length; i += 2) out.push(parseInt(s.slice(i, i + 2), 16));
  return out;
};

// AlgorithmIdentifier für SHA-256: OID 2.16.840.1.101.3.4.2.1 + NULL.
const SHA256_ALG = [0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00];

/**
 * TimeStampReq (RFC 3161 §2.4.1) für einen SHA-256-Hex-Hash.
 * `nonce` (8 Byte) bindet die Antwort an genau diese Anfrage — ohne ihn könnte
 * jemand eine alte, aufgehobene Antwort unterschieben. certReq=TRUE, damit das
 * Zertifikat der TSA in der Antwort steckt und die .tsr allein prüfbar ist.
 */
export function tsqBauen(sha256Hex, nonce) {
  const hash = hexBytes(sha256Hex);
  if (hash.length !== 32) throw new Error("SHA-256 erwartet 32 Byte");
  const n = Array.from(nonce || []);
  if (n.length !== 8) throw new Error("Nonce erwartet 8 Byte");
  // Fuehrende Null waere keine gueltige DER-Ganzzahl, gesetztes oberstes Bit
  // waere negativ — beides mit einem Griff ausgeschlossen.
  n[0] = (n[0] & 0x7f) | 0x01;
  const inhalt = [
    ...tlv(0x02, [0x01]),                                   // version 1
    ...tlv(0x30, [...SHA256_ALG, ...tlv(0x04, hash)]),      // messageImprint
    ...tlv(0x02, n),                                        // nonce
    ...tlv(0x01, [0xff]),                                   // certReq TRUE
  ];
  return Uint8Array.from(tlv(0x30, inhalt));
}

/** Ein TLV ab `pos` lesen: { tag, start, ende } (start = erstes Inhaltsbyte). */
function tlvLesen(b, pos) {
  if (pos + 1 >= b.length) throw new Error("DER zu kurz");
  const tag = b[pos];
  let len = b[pos + 1], start = pos + 2;
  if (len & 0x80) {
    const anzahl = len & 0x7f;
    if (!anzahl || anzahl > 4 || start + anzahl > b.length) throw new Error("DER-Länge unbrauchbar");
    len = 0;
    for (let i = 0; i < anzahl; i++) len = len * 256 + b[start + i];
    start += anzahl;
  }
  if (start + len > b.length) throw new Error("DER-Länge zeigt über das Ende");
  return { tag, start, ende: start + len };
}

// PKIStatus (RFC 3161 §2.4.2): 0/1 = Stempel erteilt, alles andere ist eine
// Absage. Der Text kommt in die Fehlermeldung, damit im Log steht, warum.
const STATUS_TEXT = {
  0: "erteilt", 1: "erteilt (mit Änderungen)", 2: "abgelehnt", 3: "noch nicht bearbeitet",
  4: "Widerruf läuft", 5: "widerrufen",
};

/**
 * TimeStampResp auswerten: SEQUENCE { PKIStatusInfo { status INTEGER, … }, … }.
 * Es wird nur der Status gelesen — die Signatur prüft openssl gegen die
 * DigiCert-Kette, das gehört nicht in diesen Server (und wäre ohne
 * Wurzelzertifikate ohnehin wertlos).
 */
export function tsrStatus(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || []);
  const aussen = tlvLesen(b, 0);
  if (aussen.tag !== 0x30) throw new Error("Antwort ist keine DER-Sequenz");
  const info = tlvLesen(b, aussen.start);
  if (info.tag !== 0x30) throw new Error("PKIStatusInfo fehlt");
  const st = tlvLesen(b, info.start);
  if (st.tag !== 0x02) throw new Error("Status ist keine Ganzzahl");
  let status = 0;
  for (let i = st.start; i < st.ende; i++) status = status * 256 + b[i];
  const token = info.ende < aussen.ende; // TimeStampToken liegt hinter der Statusinfo
  return { status, ok: (status === 0 || status === 1) && token, text: STATUS_TEXT[status] || "unbekannt (" + status + ")" };
}
