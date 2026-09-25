// Sprunglinks aus dem Buchhaltungsbot-Bericht (pipeline/buchhaltung.py, link()):
//   #beleg-si-<id>  Lieferantenrechnung   #beleg-ci-<id>  Kundenrechnung   #bank-<id>  Bankzeile
// Bewusst mit "-" statt "/": die Android-Huelle reicht bei laufender App nur Fragmente durch, die
// auf [A-Za-z0-9_-]{1,32} passen (MainActivity.SAFE_FRAGMENT) — mit "/" braeuchte es ein neues APK.
// #bank-<id> oeffnet Verwaltung -> Bank (Modul „Bank", nur mit Recht + Funktion "bank"); Kaputtes -> Freigaben-Liste.
export const istSprunglink = (hash) => /^#(beleg|bank)-/.test(hash || "");

export function belegSprung(hash) {
  const m = /^#beleg-(si|ci)-(\d+)$/.exec(hash || "");
  return m ? { type: m[1] === "si" ? "supplierinvoice" : "invoice", id: m[2] } : null;
}

export function bankSprung(hash) {
  const m = /^#bank-(\d+)$/.exec(hash || "");
  return m ? m[1] : null;
}
