import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../dolibarr-app.jsx";
import { registerServiceWorker } from "./registerSW.js";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);

registerServiceWorker();
