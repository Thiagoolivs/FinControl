"use client";

import { useOptimistic, useTransition } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { setReviewWindowAction } from "../actions";

const OPTIONS = [
  { value: "30", label: "30 dias" },
  { value: "60", label: "60 dias" },
  { value: "90", label: "90 dias" },
  { value: "tudo", label: "Tudo" },
] as const;

type Value = (typeof OPTIONS)[number]["value"];

/** Até onde a fila volta no tempo. Fica salvo: o badge da aba e as sugestões da IA seguem a mesma janela. */
export function ReviewWindowControl({ days }: { days: number | null }) {
  const [value, setValue] = useOptimistic<Value>(days === null ? "tudo" : (String(days) as Value));
  const [, startTransition] = useTransition();
  return (
    <SegmentedControl
      label="Mostrar transações dos últimos"
      options={OPTIONS}
      value={value}
      onChange={(next) => {
        startTransition(async () => {
          setValue(next);
          await setReviewWindowAction(next === "tudo" ? null : (Number(next) as 30 | 60 | 90));
        });
      }}
    />
  );
}
