import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ command, mode }) => {
  // Production-Build ohne VITE_DOLIBARR_URL_DEFAULT liefe gegen die
  // eingebauten Platzhalter-Domains (src/intern.js) — kein Fehler beim
  // Bauen, aber eine kaputte App im Deploy. loadEnv sieht auch
  // .env.production/.env.local, nicht nur echte Coolify-ENV-Variablen.
  // BW_PLATZHALTER_OK=1 ist der Ausweg für CI/den öffentlichen Export.
  if (command === "build") {
    const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
    if (!env.VITE_DOLIBARR_URL_DEFAULT && env.BW_PLATZHALTER_OK !== "1") {
      throw new Error(
        "vite build: VITE_DOLIBARR_URL_DEFAULT ist nicht gesetzt. Echten Wert in .env.production/Coolify " +
        "eintragen (siehe .env.example) oder für CI/den öffentlichen Export BW_PLATZHALTER_OK=1 setzen."
      );
    }
  }
  return {
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null, // wir registrieren selbst in registerSW.js
      filename: "sw.js",
      workbox: {
        // Anruf-Benachrichtigungen: der Klick-Handler lebt in public/sw-anruf.js
        // und wird hier in den generierten Service Worker eingebunden.
        importScripts: ["sw-anruf.js"],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff2}"],
        // OpenCV (15,5 MB) lag frueher im Vorab-Cache und musste damit fertig
        // heruntergeladen sein, bevor der Service Worker als installiert galt —
        // fuer einen Brocken, den erst das Zuschneiden eines Belegs braucht.
        // Das traf jede Erstinstallation und jedes Geraet mit geleertem
        // Speicher (nicht jedes Update: Workbox uebernimmt unveraenderte
        // Eintraege anhand ihrer Revision aus dem alten Cache). 17250 -> 2099 KiB.
        // Der Nachschub kommt jetzt aus der CacheFirst-Regel unten, angestossen
        // von opencvVorwaermen() in der Leerlaufzeit — sonst waere Offline-
        // Scannen nach einem Update tot. Der PDF-Worker (.mjs) war nie im
        // Vorab-Cache, die Endung steht gar nicht in globPatterns.
        // browser-index-* ist das Matrix-SDK des Chats (0,8 MB) — kommt erst,
        // wenn jemand im Chat angemeldet ist, und dann aus der Regel unten.
        globIgnores: ["**/opencv-*.js", "**/pdf.worker*", "**/browser-index-*.js", "**/matrix_sdk_crypto_wasm*"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Das Krypto-WASM des Chats (7,5 MB, Endung .wasm steht nicht in
        // globPatterns) kommt wie OpenCV erst bei Bedarf und bleibt dann liegen.
        runtimeCaching: [{
          urlPattern: /\/assets\/(opencv|pdf\.worker|matrix_sdk_crypto_wasm|browser-index)[^/]*$/,
          handler: "CacheFirst",
          options: {
            cacheName: "grosse-chunks",
            expiration: { maxEntries: 10 },
            cacheableResponse: { statuses: [0, 200] },
          },
        }],
        navigateFallback: "/index.html",
        // API/Proxy nie cachen — nur App-Shell offline halten.
        // Der Authentik-Outpost MUSS ebenfalls draussen bleiben: laeuft die
        // SSO-Sitzung ab, schickt der Server eine Umleitung nach
        // /outpost.goauthentik.io/start. Ohne diesen Eintrag beantwortet der
        // Service Worker genau diese Navigation aus dem Cache mit index.html —
        // die Anmeldeseite erscheint nie, die Sitzung kann nicht erneuert
        // werden, und jeder API-Aufruf scheitert dauerhaft mit dem nichts-
        // sagenden "Failed to fetch". (Gefunden am 07.08.2026.)
        // /chat ist die durchgereichte Element-Instanz (server.mjs) — wuerde
        // der Service Worker deren Navigationen mit index.html beantworten,
        // laedt im Chat-iframe die App statt Element.
        navigateFallbackDenylist: [/^\/api\//, /^\/outpost\.goauthentik\.io\//, /^\/chat(\/|$)/],
      },
      manifest: false, // bestehendes public/manifest.webmanifest behalten
    }),
  ],
  // Nur für den Dev-Server: die Vorbündelung kopiert das Krypto-Paket des
  // Chats nach .vite/deps, aber NICHT dessen .wasm — die Anfrage landet dann
  // auf index.html („Incorrect response MIME type"). Der Produktivbuild ist
  // nicht betroffen, dort liegt das WASM als eigenes Asset.
  optimizeDeps: { exclude: ["@matrix-org/matrix-sdk-crypto-wasm"] },
  test: {
    include: ["test/**/*.test.js"],
    environment: "node",
  },
  };
});
