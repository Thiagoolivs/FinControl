"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatCents } from "@/lib/finance/money";
import type { ActionState } from "../../actions";
import { createStreamAction, updateObligationAction, updateStreamAction } from "./actions";

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

export type StreamRowData = { id: string; name: string; scope: "PF" | "PJ"; active: boolean; transactions: number };

/** Fonte de renda: nome e se está ativa (pausada some dos selects; o histórico fica). */
export function StreamRow({ stream }: { stream: StreamRowData }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(stream.name);
  const [active, setActive] = useState(stream.active);
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const summary = [
    stream.scope === "PJ" ? "Empresa (PJ)" : "Pessoal (PF)",
    `${stream.transactions} ${stream.transactions === 1 ? "entrada" : "entradas"}`,
    stream.active ? null : "pausada",
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
            startTransition(async () => setState(await updateStreamAction({ id: stream.id, name, active })));
          }}
        >
          <LabeledInput label="Nome" value={name} onChange={setName} />
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

export function NewStreamForm() {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"PF" | "PJ">("PF");
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await createStreamAction({ name, scope });
          setState(result);
          if (!result.error) setName("");
        });
      }}
    >
      <LabeledInput label="Nome" value={name} onChange={setName} />
      <SegmentedControl
        variant="boxed"
        label="De quem"
        options={[
          { value: "PF", label: "Pessoal (PF)" },
          { value: "PJ", label: "Empresa (PJ)", tone: "pj" },
        ]}
        value={scope}
        onChange={setScope}
      />
      <Button type="submit" variant="secondary" loading={pending}>
        Criar fonte de renda
      </Button>
      <Feedback state={state} />
    </form>
  );
}

/** Conta fixa com lembrete (DAS): valor, dia de vencimento e se avisa. */
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
        <LabeledInput label="Valor" value={value} onChange={setValue} inputMode="decimal" />
        <LabeledInput label="Vence no dia" value={day} onChange={setDay} inputMode="numeric" />
      </div>
      <ActiveToggle active={on} onChange={setOn} label="Lembrar antes do vencimento" />
      <Button type="submit" variant="secondary" loading={pending}>
        Salvar
      </Button>
      <Feedback state={state} />
    </form>
  );
}
