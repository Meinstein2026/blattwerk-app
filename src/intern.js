// Liest einen internen Konfigurationswert — echte Hosts/Domains — aus der
// Laufzeit- bzw. Build-Umgebung, nie aus dem Quelltext. Zwei Laufzeiten
// brauchen zwei Wege: im Browser-Bundle (Vite) ersetzt der Build
// `import.meta.env.VITE_<NAME>` aus `.env.production`/`.env.local` (beide
// nicht committet); unter purem Node (`node server.mjs`) liest
// `process.env.VITE_<NAME>` aus der Coolify-Umgebung. Ohne gesetzten Wert
// gilt der Platzhalter — damit baut und testet der öffentliche Export ohne
// jede echte Adresse.
export const intern = (name, platzhalter) => {
  const schluessel = `VITE_${name}`;
  const ausVite = typeof import.meta !== "undefined" ? import.meta.env?.[schluessel] : undefined;
  const ausNode = typeof process !== "undefined" ? process.env?.[schluessel] : undefined;
  const wert = ausVite ?? ausNode;
  return typeof wert === "string" && wert.trim() ? wert.trim() : platzhalter;
};
