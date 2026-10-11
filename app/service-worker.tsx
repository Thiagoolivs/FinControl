"use client";

import { useEffect } from "react";

/** Registra o service worker (instalação como app e, depois, notificações). Em desenvolvimento, não. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((error: unknown) => {
      console.warn("Service worker não registrado:", error);
    });
  }, []);
  return null;
}
