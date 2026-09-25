// Code 128, Zeichensatz C — nur Ziffern, paarweise gepackt (12.09.2026).
//
// Warum selbst geschrieben und nicht als Bibliothek: gebraucht wird nicht das
// fertige Bild, sondern die **Modulfolge**. Nur damit lassen sich die Balken
// auf ganze Druckerpunkte ausrichten; ein gerastertes Bild verschmiert die
// Kanten, und ein verschmierter 0,25-mm-Balken wird nicht mehr gelesen.
//
// Zeichensatz C packt zwei Ziffern in ein Symbol und ist damit doppelt so
// dicht wie B. Deshalb ist das Token eine reine Ziffernfolge gerader Laenge.
//
// Die Mustertabelle ist gegen `pyzbar` gegengeprueft (Test
// `test/betriebsmittel/code128.test.js` plus ein gerasterter Probedruck) —
// eine vertauschte Zeile faellt sonst nicht auf: der Code sieht tadellos aus
// und liest sich als Unsinn.

/** Elementbreiten je Symbolwert: Balken, Luecke, Balken, Luecke, Balken, Luecke. */
const MUSTER = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "233111",
];
const START_C = 105;
const STOP = 106;
const STOP_ENDBALKEN = 2;   // der Stopp traegt hinten zwei Module extra

/**
 * Symbolwerte inklusive Start, Pruefzeichen und Stopp.
 * Wirft, wenn der Text keine Ziffernfolge gerader Laenge ist — lieber hier
 * als ein Etikett, das sich nicht scannen laesst.
 */
export const code128cWerte = (text) => {
  const s = String(text ?? "");
  if (!/^\d+$/.test(s) || s.length % 2 !== 0) {
    throw new Error("Code 128 C braucht eine Ziffernfolge gerader Laenge");
  }
  const daten = [];
  for (let i = 0; i < s.length; i += 2) daten.push(Number(s.slice(i, i + 2)));
  // Pruefzeichen: Start + Position x Wert, modulo 103. Position zaehlt ab 1.
  const summe = daten.reduce((acc, w, i) => acc + (i + 1) * w, START_C);
  return [START_C, ...daten, summe % 103, STOP];
};

/**
 * Balken und Luecken als Modulbreiten, beginnend mit einem Balken und
 * abwechselnd. Summe = Gesamtbreite in Modulen.
 */
export const code128cElemente = (text) => {
  const elemente = [];
  for (const wert of code128cWerte(text)) {
    for (const z of MUSTER[wert]) elemente.push(Number(z));
  }
  elemente.push(STOP_ENDBALKEN);
  return elemente;
};

/** Gesamtbreite in Modulen. Fuer 10 Ziffern sind es 90. */
export const code128cModule = (text) => code128cElemente(text).reduce((a, b) => a + b, 0);

/**
 * Die Balken als `{ x, breite }` in Modulen — Luecken fallen weg, gezeichnet
 * wird nur, was schwarz ist.
 */
export const code128cBalken = (text) => {
  const balken = [];
  let x = 0;
  code128cElemente(text).forEach((breite, i) => {
    if (i % 2 === 0) balken.push({ x, breite });   // gerade Indizes sind Balken
    x += breite;
  });
  return balken;
};
