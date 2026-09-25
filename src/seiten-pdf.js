// Mehrere Scan-Seiten (JPEG) -> eine A4-PDF, je Bild eine Seite, seitenfuellend
// mit 5 mm Rand, Seitenverhaeltnis bleibt. jsPDF lazy wie in den anderen PDF-Modulen.
// Kachel „Dokument hochladen" (Spec 2026-09-23).
export async function bilderZuPdf(bilder) {
  if (!Array.isArray(bilder) || bilder.length === 0) throw new Error("keine Seiten");
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const B = 210, H = 297, RAND = 5;
  bilder.forEach((bild, i) => {
    if (i > 0) doc.addPage("a4", "p");
    const p = doc.getImageProperties(bild);
    const s = Math.min((B - 2 * RAND) / p.width, (H - 2 * RAND) / p.height);
    const w = p.width * s, h = p.height * s;
    doc.addImage(bild, "JPEG", (B - w) / 2, (H - h) / 2, w, h);
  });
  return new Uint8Array(doc.output("arraybuffer"));
}
