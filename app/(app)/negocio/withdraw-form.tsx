"use client";

import { type ReactNode, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "../actions";
import { withdrawAction } from "./actions";

const inputClass =
  "h-11 min-w-0 w-full rounded-button bg-surface-elevated px-3 text-[16px] text-text-primary tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-accent";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

export function WithdrawForm({ bucketId, today }: { bucketId: string; today: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Registrar retirada
        </Button>
        {state.notice ? <p role="status" className="m-0 text-[13px] text-text-secondary">{state.notice}</p> : null}
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-3 rounded-card bg-surface p-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await withdrawAction({ bucketId, value, date, note });
          setState(result);
          if (!result.error) {
            setValue("");
            setNote("");
            setOpen(false);
          }
        });
      }}
    >
      <div className="flex gap-3">
        <Field label="Valor">
          <input value={value} onChange={(event) => setValue(event.target.value)} inputMode="decimal" placeholder="0,00" autoFocus className={inputClass} />
        </Field>
        <Field label="Data">
          <input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="Observação">
        <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={120} placeholder="Pró-labore de outubro" className={inputClass} />
      </Field>
      <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
        Só registra: o dinheiro já está nas suas contas. Ele sai do caixa do negócio e passa a contar como disponível.
      </p>
      <div className="flex gap-3">
        <Button type="submit" loading={pending}>
          Registrar
        </Button>
        <Button variant="link" onClick={() => setOpen(false)} disabled={pending}>
          Cancelar
        </Button>
      </div>
      {state.error ? <p role="alert" className="m-0 text-[13px] text-negative">{state.error}</p> : null}
    </form>
  );
}
