"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { ActionState } from "../../actions";
import { suggestNowAction } from "../actions";

export function SuggestButton({ remainingGroups }: { remainingGroups: number }) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Button variant="secondary" loading={pending} onClick={() => startTransition(async () => setState(await suggestNowAction()))}>
        {pending ? null : <Icon name="sparkle" size={18} />}
        {pending ? "A IA está analisando…" : `Sugerir com IA (${remainingGroups} ${remainingGroups === 1 ? "grupo" : "grupos"} sem sugestão)`}
      </Button>
      {state.error ? <p role="alert" className="m-0 text-[13px] text-negative">{state.error}</p> : null}
      {state.notice ? <p role="status" className="m-0 text-[13px] text-text-secondary">{state.notice}</p> : null}
    </div>
  );
}
