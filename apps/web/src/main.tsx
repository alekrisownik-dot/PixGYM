import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { Backdrop } from "./ui/backdrop";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Backdrop />
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register("/sw.js");
}
