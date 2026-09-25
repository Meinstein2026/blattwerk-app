// Der Service Worker ist die einzige Stelle, die sich selbst aussperren kann:
// beantwortet eine alte Fassung die Anmelde-Navigation aus dem Cache, kommt die
// Authentik-Sitzung nie zustande und die App haengt dauerhaft (07.08.2026).
// Neue Fassungen reparieren das nur, wenn sie das Geraet auch erreichen —
// deshalb hier mehrere Vorkehrungen gegen genau diesen Fall.
//
// Warum eine neue Fassung frueher zwei Kaltstarts brauchte (10.08.2026):
// `sw.js` ruft `skipWaiting()` + `clientsClaim()`, die neue Fassung uebernimmt
// also sofort. Nur: die Seite, die gerade laeuft, hat ihr `index.html` und ihr
// Bundle schon aus dem ALTEN Cache geholt und behaelt beides bis zum naechsten
// Laden. Ohne Reaktion auf `controllerchange` sah man die Neuerung deshalb erst
// beim uebernaechsten Start — was von aussen wie ein kaputter Cache aussieht
// und Leute dazu bringt, App-Daten zu loeschen. Genau das soll hier nie wieder
// noetig sein.

// Wie lange nach dem Start ein automatisches Neuladen unbedenklich ist. In
// diesen Sekunden hat noch niemand ein Formular ausgefuellt; spaeter waere ein
// Neuladen ein Datenverlust (halbe Gefaehrdungsbeurteilung, angefangener Beleg)
// und wir fragen stattdessen nach.
const SOFORT_NEULADEN_MS = 90_000;
// Reissleine gegen eine Neulade-Schleife, falls eine Fassung sich nie sauber
// aktiviert: mehr als das laedt eine Sitzung nicht von selbst neu.
const MAX_AUTO_NEULADEN = 3;

// Die eigentliche Entscheidung, getrennt von Browser-Objekten, damit sie
// pruefbar ist: laedt die Seite sich selbst neu, oder fragt sie nach?
export function sollSofortNeuladen({ hatteController, alterMs, zaehler }) {
  if (!hatteController) return false;          // Erstinstallation: nichts Altes da
  if (alterMs >= SOFORT_NEULADEN_MS) return false; // laeuft schon: erst fragen
  return zaehler < MAX_AUTO_NEULADEN;          // Reissleine gegen Schleifen
}

const zaehlerHolen = () => {
  try { return parseInt(sessionStorage.getItem("bw_sw_reloads") || "0", 10) || 0; }
  catch { return 0; }
};
const zaehlerHoch = () => {
  try { sessionStorage.setItem("bw_sw_reloads", String(zaehlerHolen() + 1)); } catch { /* egal */ }
};

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!window.isSecureContext) return;

  // Ob dieses Dokument ueberhaupt von einem Worker bedient wird. Bei der
  // allerersten Installation ist das `null` — dann feuert `controllerchange`
  // zwar auch, aber es gibt nichts Altes, das man wegladen muesste.
  const hatteController = !!navigator.serviceWorker.controller;
  const startZeit = Date.now();
  let schonNeugeladen = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (schonNeugeladen) return;
    if (sollSofortNeuladen({ hatteController, alterMs: Date.now() - startZeit, zaehler: zaehlerHolen() })) {
      schonNeugeladen = true;
      zaehlerHoch();
      window.location.reload();
      return;
    }
    if (!hatteController) return; // Erstinstallation: es gibt nichts zu melden
    // Die App laeuft schon eine Weile: nicht ungefragt neu laden, sondern der
    // Oberflaeche Bescheid geben. Sie zeigt einen Hinweis zum Antippen.
    // Wichtig auch fuer den Fall, dass jemand den Hinweis stehen laesst: die
    // alte Fassung laedt ihre Nachlade-Bausteine (OpenCV, jsPDF, PDF-Worker)
    // unter Dateinamen, die es im neuen Cache nicht mehr gibt — Scanner und
    // PDF-Ansicht koennen also ab jetzt fehlschlagen, bis neu geladen wurde.
    window.dispatchEvent(new CustomEvent("blattwerk:neue-fassung"));
  });

  window.addEventListener("load", () => {
    // updateViaCache "none": /sw.js wird mit max-age ausgeliefert. Der Browser
    // umgeht seinen HTTP-Cache fuer das Worker-Skript zwar von sich aus, die
    // Android-WebView haelt sich daran aber nicht zuverlaessig — sonst laeuft
    // die kaputte Fassung noch stundenlang weiter.
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        // Beim Start einmal aktiv nachfragen. Die Registrierung allein prueft
        // in der WebView nicht zuverlaessig auf eine neue Fassung.
        reg.update().catch(() => {});
        // Beim Zurueckkehren in die App nachsehen, ob es eine neue Fassung
        // gibt. Ohne das aktualisiert sich der Worker erst bei einem echten
        // Neuladen — und genau dazu kommt es nicht, wenn er die Navigation
        // selbst aus dem Cache bedient.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });
      })
      .catch((error) => {
        console.warn("Service Worker konnte nicht registriert werden:", error);
      });
  });
}
