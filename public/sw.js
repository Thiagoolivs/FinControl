// Service worker do FinControl. Não guarda nenhum dado financeiro no aparelho: a navegação vai sempre
// à rede e, sem rede, mostra a página offline. Os arquivos estáticos ficam com o cache normal do navegador.
const CACHE = "fincontrol-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

// Push: um alerta (ou o resumo de um sync). A tag faz a próxima do mesmo tipo substituir a anterior.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "FinControl", {
      body: data.body || "",
      tag: data.tag || "fincontrol",
      renotify: Boolean(data.tag),
      lang: "pt-BR",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { href: typeof data.href === "string" && data.href.startsWith("/") ? data.href : "/alertas" },
    }),
  );
});

// Clique abre a tela do alerta (não a home), reaproveitando a janela do app se já estiver aberta.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.href || "/alertas", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ("navigate" in open) await open.navigate(target);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
