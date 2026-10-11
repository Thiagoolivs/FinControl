"use client";

import { useOptimistic, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { moveRuleAction, toggleRuleAction } from "./actions";

/** Subir/descer prioridade e ligar/desligar sem sair da lista. */
export function RuleRowControls({ id, active, first, last }: { id: string; active: boolean; first: boolean; last: boolean }) {
  const [pending, startTransition] = useTransition();
  // O switch muda na hora; o servidor reaplica as regras e a lista volta revalidada.
  const [on, setOn] = useOptimistic(active);
  const button = "flex size-11 items-center justify-center rounded-full text-text-secondary disabled:opacity-30";
  return (
    <div className={`flex shrink-0 items-center ${pending ? "opacity-60" : ""}`}>
      <button type="button" aria-label="Subir prioridade" disabled={first || pending} className={button} onClick={() => startTransition(async () => void (await moveRuleAction({ id, direction: "up" })))}>
        <Icon name="chevron-down" size={16} className="rotate-180" />
      </button>
      <button type="button" aria-label="Descer prioridade" disabled={last || pending} className={button} onClick={() => startTransition(async () => void (await moveRuleAction({ id, direction: "down" })))}>
        <Icon name="chevron-down" size={16} />
      </button>
      <label className="flex size-11 cursor-pointer items-center justify-center">
        <span className="sr-only">{on ? "Desativar regra" : "Ativar regra"}</span>
        <input
          type="checkbox"
          role="switch"
          checked={on}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.checked;
            startTransition(async () => {
              setOn(next);
              await toggleRuleAction({ id, active: next });
            });
          }}
          className="size-5 accent-[var(--positive)]"
        />
      </label>
    </div>
  );
}
