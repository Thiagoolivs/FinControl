"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "../actions";
import { subscribePushAction, testPushAction, unsubscribePushAction } from "./notification-actions";

type Support = { push: boolean; ios: boolean; standalone: boolean };

function readSupport(): Support {
  return {
    push: "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
    ios: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    standalone: window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && navigator.standalone === true),
  };
}

let cachedSupport: Support | null = null;
const supportSnapshot = () => (cachedSupport ??= readSupport());
const noSubscribe = () => () => {};

/** Chave VAPID pública (base64url) → bytes, como o PushManager pede. */
function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

/**
 * Notificações deste aparelho. A permissão só é pedida no toque do botão, nunca ao abrir o app.
 * No iPhone, push só funciona com o app instalado: fora dele, mostra como instalar.
 */
export function NotificationSettings({ publicKey }: { publicKey: string | null }) {
  const support = useSyncExternalStore<Support | null>(noSubscribe, supportSnapshot, () => null);
  const [endpoint, setEndpoint] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!support?.push) return;
    navigator.serviceWorker
      .getRegistration("/")
      .then((found) => found?.pushManager.getSubscription())
      .then((subscription) => setEndpoint(subscription?.endpoint ?? null))
      .catch(() => setEndpoint(null));
  }, [support?.push]);

  if (!publicKey) {
    return (
      <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
        Push desligado no servidor. Gere as chaves com <code>npx web-push generate-vapid-keys</code> e defina{" "}
        <code>VAPID_PUBLIC_KEY</code>, <code>VAPID_PRIVATE_KEY</code> e <code>VAPID_SUBJECT</code> (ex.: <code>mailto:voce@exemplo.com</code>) no Railway.
      </p>
    );
  }
  if (support === null) return null;
  if (support.ios && !support.standalone) {
    return (
      <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
        No iPhone, notificação só chega com o app instalado. Instale pela seção App acima e abra o FinControl pelo ícone da tela de
        início para ligar aqui.
      </p>
    );
  }
  if (!support.push) {
    return <p className="m-0 text-[15px] text-text-secondary">Este navegador não recebe notificações.</p>;
  }
  if (endpoint === undefined) return null;

  const enable = () =>
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState({ error: "Permissão negada. Libere as notificações do FinControl nas configurações do navegador." });
          return;
        }
        const ready = await registration();
        const subscription = await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
        const json = subscription.toJSON();
        const result = await subscribePushAction({ endpoint: subscription.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" });
        setState(result);
        if (!result.error) setEndpoint(subscription.endpoint);
      } catch (error) {
        setState({ error: `Não deu para ligar as notificações: ${error instanceof Error ? error.message : "erro desconhecido"}` });
      }
    });

  const disable = () =>
    startTransition(async () => {
      const ready = await navigator.serviceWorker.getRegistration("/");
      const subscription = await ready?.pushManager.getSubscription();
      await subscription?.unsubscribe();
      if (endpoint) setState(await unsubscribePushAction(endpoint));
      setEndpoint(null);
    });

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
        Chega notificação só dos alertas com push ligado em Alertas, logo abaixo. Por padrão: conexão com erro, saldo projetado
        negativo, reserva de imposto baixa e teto do MEI. Vários alertas de uma leitura viram uma notificação só.
      </p>
      {endpoint ? (
        <>
          <p className="m-0 text-[15px] text-positive">Ligadas neste aparelho.</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" loading={pending} onClick={() => startTransition(async () => setState(await testPushAction()))}>
              Enviar teste
            </Button>
            <Button variant="link" disabled={pending} onClick={disable}>
              Desligar
            </Button>
          </div>
        </>
      ) : (
        <Button variant="secondary" className="self-start" loading={pending} onClick={enable}>
          Ativar notificações
        </Button>
      )}
      {state.error ? <p role="alert" className="m-0 text-[13px] text-negative">{state.error}</p> : null}
      {state.notice ? <p role="status" className="m-0 text-[13px] text-text-secondary">{state.notice}</p> : null}
    </div>
  );
}
