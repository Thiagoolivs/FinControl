"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

/** Evento do Chrome/Edge/Android que permite abrir o pedido de instalação por um botão. */
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

type Platform = "standalone" | "ios" | "other";

function readPlatform(): Platform {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && navigator.standalone === true);
  if (standalone) return "standalone";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "other";
}

function subscribe(onChange: () => void) {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Como instalar na tela de início, de acordo com o aparelho. No iPhone, notificação só funciona instalado. */
export function InstallApp() {
  const platform = useSyncExternalStore<Platform | null>(subscribe, readPlatform, () => null);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const done = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  if (platform === null) return null;
  if (platform === "standalone" || installed) {
    return <p className="m-0 text-[15px] text-text-secondary">Instalado na tela de início.</p>;
  }
  if (platform === "ios") {
    return (
      <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
        No Safari, toque em <span className="text-text-primary">Compartilhar</span> e depois em{" "}
        <span className="text-text-primary">Adicionar à Tela de Início</span>. No iPhone, as notificações só funcionam com o app
        instalado.
      </p>
    );
  }
  if (prompt) {
    return (
      <Button
        variant="secondary"
        className="self-start"
        onClick={async () => {
          await prompt.prompt();
          const choice = await prompt.userChoice;
          if (choice.outcome === "accepted") setInstalled(true);
          setPrompt(null);
        }}
      >
        Instalar o FinControl
      </Button>
    );
  }
  return (
    <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
      No Android, use o menu do Chrome e <span className="text-text-primary">Instalar app</span>. No computador, o ícone de
      instalar fica na barra de endereço do Chrome ou do Edge.
    </p>
  );
}
