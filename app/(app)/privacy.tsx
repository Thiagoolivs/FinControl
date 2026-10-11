"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { HIDE_VALUES_COOKIE, HIDE_VALUES_MAX_AGE } from "@/lib/preferences";

const HiddenContext = createContext<{ hidden: boolean; toggle: () => void } | null>(null);

/** Envolve as telas; com `data-hide-values`, o CSS troca cada valor pela máscara (globals.css). */
export function PrivacyProvider({ initialHidden, children }: { initialHidden: boolean; children: ReactNode }) {
  const [hidden, setHidden] = useState(initialHidden);
  function toggle() {
    const next = !hidden;
    setHidden(next);
    document.cookie = `${HIDE_VALUES_COOKIE}=${next ? "1" : "0"}; Path=/; Max-Age=${HIDE_VALUES_MAX_AGE}; SameSite=Lax`;
  }
  return (
    <HiddenContext value={{ hidden, toggle }}>
      <div data-hide-values={hidden ? "" : undefined} className="contents">
        {children}
      </div>
    </HiddenContext>
  );
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
