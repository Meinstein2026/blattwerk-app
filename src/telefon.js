// Festnetz-Telefonie in der App — die Datenseite, ohne UI.
//
// Wie ein Anruf technisch laeuft (Details: messenger-hub/docs/runbook-telefonie.md):
// Die Signalisierung ist der Matrix-Raum "☎ Anrufe Festnetz". Das Gateway
// (callbot auf .50) klingelt dort per MSC4075-Event, gewaehlt wird per
// Textnachricht ("!call <nummer>"), Tastentoene im laufenden Gespraech sind
// blosse Ziffern-Nachrichten. Der TON laeuft getrennt davon ueber LiveKit:
// wer dem (fuer den Raum fest abgeleiteten) LiveKit-Raum beitritt, haengt in
// der Leitung — beim Rausrufen loest erst dieser Beitritt das Waehlen aus
// ("Wahl erst nach Beitritt"). Das Eintritts-Ticket stellt lk-jwt gegen ein
// Matrix-OpenID-Token aus; das holt die App ueber die Bruecke zur
// Element-Sitzung im Chat-iframe (src/chat-proxy.js), eigene Matrix-
// Anmeldung braucht sie deshalb nicht.

import { intern } from "./intern.js";

export const TELEFON_RAUM = intern("TELEFON_RAUM", "!example-telefon:matrix.example.org");

// Deterministischer LiveKit-Raumname des ☎-Raums: unpadded Base64 von
// sha256(json([raum_id, "m.call#ROOM"])) — im Runbook hergeleitet und
// gegen Live-Messungen verifiziert. Enthaelt bewusst einen Schraegstrich.
// NUR Doku/Log-Abgleich: an lk-jwt geht die MATRIX-Raum-Id, NICHT dieser
// Hash — der Dienst hasht selbst (LiveKitRoomAliasFor). Der fertige Hash
// wuerde doppelt gehasht und man landet allein in einem fremden leeren
// LiveKit-Raum (so scheiterte der erste Live-Test am 20.08.: Bot waehlt
// erst nach Beitritt, sah den Beitritt aber nie).
export const LK_CALL_ROOM = "qPBQriBth71wDT9NVLV44J7okfTGDyywKXyg/wOnZIY";

export const LKJWT_URL = intern("LKJWT_URL", "https://lkjwt.example.org");

export const KLINGEL_EVENT = "org.matrix.msc4075.rtc.notification";

// Ein Klingel-Event zaehlt nur frisch: der callbot setzt lifetime 30 s, und
// beim Start spielt Element die Raum-Historie noch einmal durch — ohne die
// Frische-Pruefung wuerde jeder App-Start mit dem letzten alten Anruf klingeln.
export const KLINGEL_MAX_ALTER_MS = 30000;

export function istKlingeln(typ, inhalt, alterMs) {
  if (typ !== KLINGEL_EVENT) return false;
  if (!inhalt || inhalt.notification_type !== "ring") return false;
  return (alterMs || 0) <= KLINGEL_MAX_ALTER_MS;
}

// Der callbot waehlt bei "!call <nummer>" bzw. einer blossen Rufnummer
// (0…/+49…, mindestens 6 Ziffern). Die App normalisiert die Eingabe vom
// Tastenfeld: Leerraum/Trenner raus, Rest muss eine plausible Nummer sein.
export function nummerNormalisieren(eingabe) {
  const roh = String(eingabe || "").replace(/[\s/()-]/g, "");
  if (!/^\+?\d{6,20}$/.test(roh)) return null;
  if (!roh.startsWith("0") && !roh.startsWith("+")) return null;
  return roh;
}

// Anfrage an den lk-jwt-Dienst (gleicher Austausch, den Element Call macht):
// Matrix-OpenID-Token rein, LiveKit-Ticket raus. room = Matrix-Raum-Id,
// siehe Warnung bei LK_CALL_ROOM (am 20.08. per JWT-Decode verifiziert:
// diese Raum-Id ergibt im Token exakt den Gateway-Raum).
export function sfuAnfrage(openidToken, deviceId) {
  return {
    url: `${LKJWT_URL}/sfu/get`,
    body: { room: TELEFON_RAUM, openid_token: openidToken, device_id: deviceId },
  };
}

// Waehrend eines laufenden Gespraechs sind kurze Ziffernfolgen Tastentoene
// (DTMF) — der callbot nimmt die nackte Form bis 5 Zeichen, laengere wuerden
// als neue Wahl verstanden. `,` = 0,5 s Pause.
export function istDtmf(zeichen) {
  return /^[0-9*#,]{1,5}$/.test(String(zeichen || ""));
}
