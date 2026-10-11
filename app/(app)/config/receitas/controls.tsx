"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatCents, formatPercentBps } from "@/lib/finance/money";
import type { ActionState } from "../../actions";
import { createStreamAction, setBucketBalanceAction, updateObligationAction, updateStreamAction } from "./actions";

const inputClass =
  "h-11 min-w-0 w-full rounded-button bg-surface-elevated px-3 text-[16px] text-text-primary tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <p role="alert" className="m-0 text-[13px] text-negative">{state.error}</p>;
  if (state.notice) return <p role="status" className="m-0 text-[13px] text-text-secondary">{state.notice}</p>;
  return null;
}

function LabeledInput({ label, value, onChange, suffix, inputMode }: { label: string; value: string; onChange: (value: string) => void; suffix?: string; inputMode?: "decimal" | "numeric" | "text" }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">{label}</span>
      <span className="relative">
        <input value={value} onChange={(event) => onChange(event.target.value)} inputMode={inputMode} autoComplete="off" className={inputClass} />
        {suffix ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[15px] text-text-secondary">{suffix}</span> : null}
      </span>
    </label>
  );
}

function ActiveToggle({ active, onChange, label }: { active: boolean; onChange: (active: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-[15px]">
      <input type="checkbox" checked={active} onChange={(event) => onChange(event.target.checked)} className="size-5 accent-[var(--accent)]" />
      {label}
    </label>
  );
}

const TYPE_LABEL = { SALARIO_FIXO: "Salário fixo", PROJETO: "Projeto", VENTURE: "Negócio", OUTRO: "Outro" } as const;

export type StreamRowData = {
  id: string;
  name: string;
  type: keyof typeof TYPE_LABEL;
  taxReserveBps: number;
  costReserveBps: number;
  active: boolean;
  incomeCount: number;
};

/** Stream: nome, % de imposto e de custo reservados de cada entrada, ativa. Salvar refaz as reservas. */
export function StreamRow({ stream }: { stream: StreamRowData }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(stream.name);
  const [tax, setTax] = useState(formatPercentBps(stream.taxReserveBps));
  const [cost, setCost] = useState(formatPercentBps(stream.costReserveBps));
  const [active, setActive] = useState(stream.active);
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const summary = [
    TYPE_LABEL[stream.type],
    `imposto ${formatPercentBps(stream.taxReserveBps)}%`,
    `custo ${formatPercentBps(stream.costReserveBps)}%`,
    `${stream.incomeCount} ${stream.incomeCount === 1 ? "entrada" : "entradas"}`,
    stream.active ? null : "desativada",
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-3 py-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-11 w-full flex-col items-start gap-[3px] text-left text-text-primary">
        <span className="text-[16px] font-medium">{stream.name}</span>
        <span className="text-[13px] text-text-secondary">{summary.join(" · ")}</span>
      </button>
      {open ? (
        <form
          className="flex flex-col gap-3 rounded-card bg-surface p-5"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => setState(await updateStreamAction({ id: stream.id, name, tax, cost, active })));
          }}
        >
          <LabeledInput label="Nome" value={name} onChange={setName} />
          <div className="flex gap-3">
            <LabeledInput label="Reserva de imposto" value={tax} onChange={setTax} suffix="%" inputMode="decimal" />
            <LabeledInput label="Reserva de custo" value={cost} onChange={setCost} suffix="%" inputMode="decimal" />
          </div>
          <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
            {stream.type === "VENTURE"
              ? "De cada entrada, os percentuais vão para as reservas e o resto fica no caixa do negócio até você registrar uma retirada."
              : "De cada entrada, os percentuais vão para as reservas; o resto fica disponível."}
          </p>
          <ActiveToggle active={active} onChange={setActive} label="Ativa" />
          <Button type="submit" loading={pending}>
            Salvar
          </Button>
          <Feedback state={state} />
        </form>
      ) : null}
    </div>
  );
}

export const NEW_TYPES = [
  { value: "PROJETO", label: "Projeto" },
  { value: "VENTURE", label: "Negócio" },
  { value: "SALARIO_FIXO", label: "Salário" },
  { value: "OUTRO", label: "Outro" },
] as const;

export function NewStreamForm() {
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof NEW_TYPES)[number]["value"]>("PROJETO");
  const [scope, setScope] = useState<"PF" | "PJ">("PJ");
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await createStreamAction({ name, type, scope });
          setState(result);
          if (!result.error) setName("");
        });
      }}
    >
      <LabeledInput label="Nome" value={name} onChange={setName} />
      <SegmentedControl variant="boxed" label="Tipo" options={NEW_TYPES} value={type} onChange={setType} />
      <SegmentedControl
        variant="boxed"
        label="Escopo"
        options={[
          { value: "PJ", label: "PJ", tone: "pj" },
          { value: "PF", label: "PF" },
        ]}
        value={scope}
        onChange={setScope}
      />
      {type === "VENTURE" ? (
        <p className="m-0 text-[13px] leading-[18px] text-text-secondary">Um negócio ganha o próprio caixa: o que entra fica lá até você retirar.</p>
      ) : null}
      <Button type="submit" variant="secondary" loading={pending}>
        Criar stream
      </Button>
      <Feedback state={state} />
    </form>
  );
}

/** Bucket com saldo e "Ajustar saldo" (lança um AJUSTE com a diferença). */
export function BucketRow({ id, name, hint, balanceCents }: { id: string; name: string; hint: string; balanceCents: number }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(formatCents(balanceCents, { symbol: false }));
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex min-h-11 items-center gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="text-[16px] font-medium">{name}</span>
          <span className="text-[13px] text-text-secondary">{hint}</span>
        </span>
        <Money cents={balanceCents} className="text-[17px]" />
      </div>
      {open ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await setBucketBalanceAction({ bucketId: id, value });
              setState(result);
              if (!result.error) setOpen(false);
            });
          }}
        >
          <div className="flex items-end gap-2">
            <LabeledInput label="Saldo correto" value={value} onChange={setValue} inputMode="decimal" />
            <Button type="submit" variant="secondary" className="h-11" loading={pending}>
              Salvar
            </Button>
          </div>
          <Button variant="link" className="self-start" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </form>
      ) : (
        <Button variant="link" className="self-start" onClick={() => setOpen(true)}>
          Ajustar saldo
        </Button>
      )}
      <Feedback state={state} />
    </div>
  );
}

/** Obrigação fixa (DAS): valor, dia de vencimento, ativa. */
export function ObligationForm({ id, amountCents, dueDay, active }: { id: string; amountCents: number; dueDay: number; active: boolean }) {
  const [value, setValue] = useState(formatCents(amountCents, { symbol: false }));
  const [day, setDay] = useState(String(dueDay));
  const [on, setOn] = useState(active);
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => setState(await updateObligationAction({ id, value, dueDay: day, active: on })));
      }}
    >
      <div className="flex gap-3">
        <LabeledInput label="Valor mensal" value={value} onChange={setValue} inputMode="decimal" />
        <LabeledInput label="Vence no dia" value={day} onChange={setDay} inputMode="numeric" />
      </div>
      <ActiveToggle active={on} onChange={setOn} label="Reservar todo mês" />
      <Button type="submit" variant="secondary" loading={pending}>
        Salvar
      </Button>
      <Feedback state={state} />
    </form>
  );
}
