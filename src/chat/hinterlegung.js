// Firmen-Hinterlegung des Sicherheitsschlüssels (Entscheidung Inhaber 19.09.2026,
// Variante B): die App verschlüsselt ihn für den öffentlichen Schlüssel der
// Firma (RSA-OAEP/SHA-256), der Server legt nur den Geheimtext in Nextcloud ab.
// Öffnen kann ihn allein, wer den privaten Schlüssel hat (Vault):
//   base64 -d chiffre.b64 | openssl pkeyutl -decrypt -inkey privat.pem \
//     -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256
export const HINTERLEGUNG_STORE = "/Blattwerk/App/chat-hinterlegung.json";
/** Öffentlicher Schlüssel der Firma (RSA-4096, SPKI/DER base64) — mit der Mandantenfähigkeit in die mandant.json. */
export const HINTERLEGUNG_SCHLUESSEL = "MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAnJs++05Wb97yQIr7wvPhUFwljskFzzi/0QWVfoMcaeL6bg1J3C5dhoCIwBgQ/h9wsm7UyNXdEol5tUQSli82FO0urPGh4qYf2vkAncIl6osDJB9tNQxhM0mK2abWRSFdh+mX0MSP/vYvwQxl/J6Hug66O1S87i0KsTA/dkcGQ2gU9DCLpXY2jWKM/G8djhvce2JaHNBDbujl+94UoejgTd1pgdt1dO++qQDaF2k2VyDqObcyrjT8ItNVRNNjvBXZw6T9Atlr82sTAs9oP31GTOsY6r0F80maH9QIdQJq7H7pm4cVSupJVV+A49l6NyYaz99jDrsYg1jLXS05iFN+rMkNIp2bfn2EU+aqt6ujexzpBBFsX3OJTQmmlfnlLKdCTmkwfU5LsSDJRSKWbKpmlny9g7MnkAzXyys17wQSSjlpFVwj4sPhauZPfRFYb2b6PmPLsf2TjH63Qcp2uYaG6ttLPgqG5InmokJMdCrwtmMUmkz+ojrBqxANeNCpgtcWMZCRZ5HEvyWKJmSoasSzny+wMAL9FQ7Rh7JSeRJtepSi8eVSRoBtaNJSGPESEKFpjxAa4bBq7TTA3Gxm8Q9VCXv1rQB5HK0Bb/AtKIv+ojun0ivm52g1uglpJEozFcXV6Q6L5Jy6FHWhxRoQvZXZ/X7BNBwNy0uggzmWq0Gb1TUCAwEAAQ==";
export const HINTERLEGUNG_LEER = { version: 1, konten: {} };

const b64 = (bytes) => { let s = ""; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b); return btoa(s); };
const roh = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** `spkiB64` = öffentlicher Schlüssel (SPKI/DER, base64). Liefert den Geheimtext base64. */
export async function hinterlegungVerschluesseln(spkiB64, klartext) {
  const key = await crypto.subtle.importKey("spki", roh(spkiB64), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  return b64(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, new TextEncoder().encode(klartext)));
}

export const hinterlegungNorm = (s) => (s && typeof s === "object" && s.konten && typeof s.konten === "object" ? s : { ...HINTERLEGUNG_LEER });

/** "" = in Ordnung, sonst der Grund. */
export function hinterlegungPruefen({ userId, deviceId, chiffre }) {
  if (!/^@[^:\s]+:\S+$/.test(String(userId || ""))) return "Konto unbrauchbar";
  if (!/^[\w-]{1,64}$/.test(String(deviceId || ""))) return "Gerät unbrauchbar";
  if (!/^[A-Za-z0-9+/]{4,2048}={0,2}$/.test(String(chiffre || ""))) return "Geheimtext unbrauchbar";
  return "";
}

/** Additiv: je Konto eine Liste; dasselbe Gerät ersetzt nur den eigenen Eintrag. */
export function hinterlegungEintragen(store, { userId, deviceId, chiffre, login, am }) {
  const s = hinterlegungNorm(store);
  const bisher = (Array.isArray(s.konten[userId]) ? s.konten[userId] : []).filter((e) => e.deviceId !== deviceId);
  return { ...s, version: 1, konten: { ...s.konten, [userId]: [...bisher, { deviceId, chiffre, login, am }] } };
}

// ── App-Seite: abschicken, bei Netzfehler merken und später nachholen ───────
const OFFEN_KEY = "blattwerk_chat_hinterlegung_offen";

/** Schickt den Geheimtext ab. Scheitert das, bleibt er (nur der Geheimtext!) im Speicher liegen. */
export async function hinterlegungSenden(eintrag, { holen = fetch, speicher = localStorage } = {}) {
  try {
    const r = await holen("/api/nc/chat-hinterlegung", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(eintrag) });
    if (!r.ok) throw new Error(`Status ${r.status}`);
    speicher.removeItem(OFFEN_KEY);
    return true;
  } catch { speicher.setItem(OFFEN_KEY, JSON.stringify(eintrag)); return false; }
}

/** Beim Chat-Start: eine liegengebliebene Hinterlegung nachreichen. */
export async function hinterlegungNachholen(opt = {}) {
  let offen = null;
  try { offen = JSON.parse((opt.speicher || localStorage).getItem(OFFEN_KEY) || "null"); } catch (_) {}
  return offen ? hinterlegungSenden(offen, opt) : true;
}
