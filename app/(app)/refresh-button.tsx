"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { refreshAction, type ActionState } from "./actions";

export function RefreshButton({ blockedUntilLabel }: { blockedUntilLabel: string | null }) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="link"
        loading={pending}
        disabled={Boolean(blockedUntilLabel)}
        onClick={() => startTransition(async () => setState(await refreshAction()))}
      >
        {pending ? "Atualizando…" : "Atualizar"}
      </Button>
      <p role="status" className="m-0 text-right text-[13px] text-text-secondary">
        {state.error ? <span className="text-negative">{state.error}</span> : (state.notice ?? (blockedUntilLabel ? `Liberado ${blockedUntilLabel}` : null))}
      </p>
    </div>
  );
}
