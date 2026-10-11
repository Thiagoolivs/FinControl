"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "../actions";
import { updateSavingsTargetAction } from "./savings-target-action";

/** Quanto do que entra você quer que sobre no mês: o anel do placar mede contra isso. */
export function SavingsTargetForm({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => setState(await updateSavingsTargetAction(value)));
      }}
    >
      <label htmlFor="savings-target" className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">
        Meta de sobra do mês
      </label>
      <div className="flex items-center gap-3">
        <span className="relative w-32">
          <input
            id="savings-target"
            value={value}
            inputMode="decimal"
            autoComplete="off"
            onChange={(event) => setValue(event.target.value)}
            className="h-11 w-full rounded-button bg-surface-elevated px-3 pr-8 text-[16px] tabular-nums text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[15px] text-text-secondary">%</span>
        </span>
        <Button type="submit" variant="secondary" loading={pending}>
          Salvar
        </Button>
      </div>
      <p className="m-0 text-[13px] leading-[18px] text-text-secondary">Do que entra no mês, quanto você quer que sobre. 20% é um bom começo.</p>
      {state.error ? <p role="alert" className="m-0 text-[13px] text-negative">{state.error}</p> : null}
      {state.notice ? <p role="status" className="m-0 text-[13px] text-text-secondary">{state.notice}</p> : null}
    </form>
  );
}
