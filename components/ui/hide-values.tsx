"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import { HIDE_VALUES_COOKIE, HIDE_VALUES_MAX_AGE } from "@/lib/preferences";
import { Icon } from "./icon";

type HiddenState = { hidden: boolean; toggle: () => void };

const HiddenContext = createContext<HiddenState | null>(null);

/**
 * "Ocultar valores": os componentes de dinheiro leem daqui e renderizam o valor ou a máscara, nunca os dois.
 * O estado inicial vem do cookie lido no servidor, então a página já nasce certa.
 */
export function HideValuesProvider({ initialHidden, children }: { initialHidden: boolean; children: ReactNode }) {
  const [hidden, setHidden] = useState(initialHidden);
  function toggle() {
    const next = !hidden;
    setHidden(next);
    document.cookie = `${HIDE_VALUES_COOKIE}=${next ? "1" : "0"}; Path=/; Max-Age=${HIDE_VALUES_MAX_AGE}; SameSite=Lax`;
  }
  return <HiddenContext value={{ hidden, toggle }}>{children}</HiddenContext>;
}

export function useValuesHidden(): boolean {
  return useContext(HiddenContext)?.hidden ?? false;
}

export function HideValuesButton() {
  const context = useContext(HiddenContext);
  if (!context) return null;
  return (
    <button
      type="button"
      onClick={context.toggle}
      aria-pressed={context.hidden}
      aria-label={context.hidden ? "Mostrar valores" : "Ocultar valores"}
      className="flex size-11 items-center justify-center rounded-full text-text-secondary transition-colors duration-200 ease-apple hover:text-text-primary"
    >
      <Icon name={context.hidden ? "eye-off" : "eye"} size={22} strokeWidth={1.6} />
    </button>
  );
}
