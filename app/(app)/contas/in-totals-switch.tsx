"use client";

import { useOptimistic, useTransition } from "react";
import { setAccountInTotalsAction } from "./actions";

export function InTotalsSwitch({ accountId, include, label }: { accountId: string; include: boolean; label: string }) {
  const [checked, setChecked] = useOptimistic(include);
  const [, startTransition] = useTransition();
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
      <span className="text-[15px] text-text-secondary">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          const next = event.target.checked;
          startTransition(async () => {
            setChecked(next);
            await setAccountInTotalsAction({ accountId, include: next });
          });
        }}
        className="size-5 accent-[var(--accent)]"
      />
    </label>
  );
}
