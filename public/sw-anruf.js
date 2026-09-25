// Anruf-Benachrichtigung: Klick holt die App nach vorn und öffnet die
// Telefon-Ansicht. Wird per importScripts in den generierten Service Worker
// geladen (vite.config.js) — der Workbox-Teil weiß von Anrufen nichts.
self.addEventListener("notificationclick", (event) => {
  if (event.notification.tag !== "bw-anruf") return;
  event.notification.close();
  event.waitUntil((async () => {
    const fenster = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (fenster.length) {
      // Die App läuft schon: nach vorn holen und ihr das Öffnen überlassen —
      // ein navigate() würde die laufende Seite (samt Klingel-Zustand) neu laden.
      fenster[0].postMessage({ quelle: "bw-anruf", typ: "oeffnen" });
      return fenster[0].focus();
    }
    return self.clients.openWindow("/#telefon");
  })());
});
