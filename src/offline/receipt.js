// Belegfoto in den bestehenden Blattwerk/Belege/-Ordner hochladen.
// Von dort übernimmt die vorhandene Server-Pipeline (OCR → Dolibarr-Entwurf → Freigabe-Mail).

function loadNc() {
  try { return JSON.parse(localStorage.getItem("blattwerk_nextcloud") || "null"); } catch { return null; }
}
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.readAsDataURL(blob);
  });
}

export async function putReceipt({ blob, filename }) {
  const nc = loadNc();
  if (!nc?.server || !nc?.user || !nc?.pass) throw new Error("Nextcloud nicht eingerichtet");
  const dataBase64 = await blobToBase64(blob);
  const res = await fetch("/api/nc/putfile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ server: nc.server, user: nc.user, pass: nc.pass, filename, dataBase64 }),
  });
  if (!res.ok) throw new Error("Beleg-Upload fehlgeschlagen (" + res.status + ")");
  return res.json();
}
