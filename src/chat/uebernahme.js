// Einmalige Schlüssel-Übernahme aus der Element-Instanz unter /chat/.
//
// Warum: die App meldet sich als NEUES Gerät an (src/chat/sitzung.js). Ein
// neues Gerät kann alte verschlüsselte Nachrichten nicht lesen und gilt den
// anderen als unverifiziert — bis es entweder den Sicherheitsschlüssel
// bekommt (den die wenigsten zur Hand haben) oder ein verifiziertes Gerät
// derselben Person ihm die Geheimnisse übergibt. Genau so ein Gerät gibt es
// fast immer schon: die Element-Sitzung, die bis 19.09.2026 im Chat-Reiter
// lief. Sie liegt unter demselben Origin, also lässt sie sich unsichtbar
// laden und über die ÖFFENTLICHE Krypto-Schnittstelle des SDK befragen
// (exportSecretsBundle — dieselbe, die Elements QR-Anmeldung benutzt — und
// exportRoomKeysAsJson). Element-Interna fassen wir nicht an; einzig der
// Zugriff `mxMatrixClientPeg` ist eine Debug-Schnittstelle, auf die sich
// schon die alte Telefon-Brücke verließ.
//
// Beide Clients sind getrennte Geräte mit getrennten Speichern — dass Element
// dabei kurz mitläuft, stört den nativen Client nicht.

export const UEBERNAHME_KEY = "blattwerk_mx_uebernahme";
const WARTE_MS = 45000;

/** Gibt es unter diesem Origin eine Element-Sitzung derselben Person? */
export function elementSitzungPasst(speicher, userId) {
  try { return !!userId && speicher.getItem("mx_user_id") === userId; } catch { return false; }
}

/** Schon für dieses Gerät erledigt (oder vergeblich versucht)? */
export const uebernahmeErledigt = (speicher, deviceId) => { try { return speicher.getItem(UEBERNAHME_KEY) === deviceId; } catch { return false; } };
export const uebernahmeMerken = (speicher, deviceId) => { try { speicher.setItem(UEBERNAHME_KEY, deviceId); } catch (_) {} };

/**
 * Lädt Element unsichtbar, wartet auf dessen Client und holt die Geheimnisse.
 * Wirft, wenn Element nicht hochkommt, jemand anderes angemeldet ist oder die
 * Element-Sitzung selbst keine Cross-Signing-Schlüssel hat (dann wäre die
 * Übergabe wertlos — ein unverifiziertes Gerät kann kein anderes beglaubigen).
 */
export function geheimnisseAusElement(userId, { dokument = document, warteMs = WARTE_MS } = {}) {
  return new Promise((resolve, reject) => {
    const rahmen = dokument.createElement("iframe");
    rahmen.src = "/chat/";
    rahmen.title = "Schlüssel-Übernahme";
    rahmen.setAttribute("aria-hidden", "true");
    rahmen.style.cssText = "position:fixed;width:1px;height:1px;left:-9999px;top:0;border:0;visibility:hidden";
    let fertig = false;
    const ende = (fehler, wert) => {
      if (fertig) return;
      fertig = true; clearInterval(takt); clearTimeout(frist); rahmen.remove();
      fehler ? reject(fehler) : resolve(wert);
    };
    const frist = setTimeout(() => ende(new Error("Element-Sitzung hat nicht geantwortet")), warteMs);
    const takt = setInterval(async () => {
      let c = null;
      try { c = rahmen.contentWindow?.mxMatrixClientPeg?.get?.(); } catch (_) { /* noch nicht geladen */ }
      const k = c?.getCrypto?.();
      if (!c || !k || !c.isInitialSyncComplete?.()) return;
      clearInterval(takt);
      try {
        if (c.getUserId() !== userId) throw new Error("In Element ist ein anderes Konto angemeldet");
        const buendel = await k.exportSecretsBundle();
        if (!buendel?.cross_signing) throw new Error("Die Element-Sitzung ist selbst nicht verifiziert");
        const raumSchluessel = await k.exportRoomKeysAsJson();
        ende(null, { buendel, raumSchluessel });
      } catch (e) { ende(e); }
    }, 500);
    dokument.body.appendChild(rahmen);
  });
}
