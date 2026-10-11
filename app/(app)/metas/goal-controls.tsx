"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatMonthLabel, isMonth } from "@/lib/dates";
import { completionMonth, contributionMonths, monthlyRequiredCents } from "@/lib/finance/goals";
import { formatCents, parseCents } from "@/lib/finance/money";
import type { ActionState } from "../actions";
import { addContributionAction, createGoalAction, deleteContributionAction, updateGoalAction } from "./actions";

const inputClass =
  "h-11 min-w-0 w-full rounded-button bg-surface-elevated px-3 text-[16px] text-text-primary tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-accent";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">{label}</span>
      {children}
      {hint ? <span className="text-[13px] text-text-secondary">{hint}</span> : null}
    </label>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <p role="alert" className="m-0 text-[13px] text-negative">{state.error}</p>;
  if (state.notice) return <p role="status" className="m-0 text-[13px] text-text-secondary">{state.notice}</p>;
  return null;
}

const toFieldValue = (cents: number) => (cents > 0 ? formatCents(cents, { symbol: false, hideZeroCents: true }) : "");

export function NewGoalForm({ defaultMonth }: { defaultMonth: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [targetMonth, setTargetMonth] = useState(defaultMonth);
  const [initial, setInitial] = useState("");
  const [scope, setScope] = useState<"PF" | "PJ">("PF");
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await createGoalAction({ name, target, targetMonth, initial, scope });
          setState(result);
          if (result.id) router.push(`/metas/${result.id}`);
        });
      }}
    >
      <Field label="Nome">
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} className={inputClass} />
      </Field>
      <div className="flex gap-3">
        <Field label="Valor-alvo">
          <input value={target} onChange={(event) => setTarget(event.target.value)} inputMode="decimal" placeholder="50.000" className={inputClass} />
        </Field>
        <Field label="Até">
          <input type="month" value={targetMonth} onChange={(event) => setTargetMonth(event.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="Já tenho" hint="Entra como saldo inicial; fica fora do cálculo do ritmo.">
        <input value={initial} onChange={(event) => setInitial(event.target.value)} inputMode="decimal" placeholder="0,00" className={inputClass} />
      </Field>
      <SegmentedControl
        variant="boxed"
        label="Escopo"
        options={[
          { value: "PF", label: "Pessoal" },
          { value: "PJ", label: "Empresa", tone: "pj" },
        ]}
        value={scope}
        onChange={setScope}
      />
      <Button type="submit" loading={pending}>
        Criar meta
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function GoalEditForm({
  goal,
}: {
  goal: { id: string; name: string; targetCents: number; targetMonth: string; status: "ATIVA" | "PAUSADA" | "CONCLUIDA" | "ARQUIVADA" };
}) {
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState(toFieldValue(goal.targetCents));
  const [targetMonth, setTargetMonth] = useState(goal.targetMonth);
  const [status, setStatus] = useState<"ATIVA" | "PAUSADA" | "ARQUIVADA">(goal.status === "CONCLUIDA" ? "ATIVA" : goal.status);
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => setState(await updateGoalAction({ id: goal.id, name, target, targetMonth, status })));
      }}
    >
      <Field label="Nome">
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} className={inputClass} />
      </Field>
      <div className="flex gap-3">
        <Field label="Valor-alvo">
          <input value={target} onChange={(event) => setTarget(event.target.value)} inputMode="decimal" placeholder="50.000" className={inputClass} />
        </Field>
        <Field label="Até">
          <input type="month" value={targetMonth} onChange={(event) => setTargetMonth(event.target.value)} className={inputClass} />
        </Field>
      </div>
      <SegmentedControl
        variant="boxed"
        label="Situação"
        options={[
          { value: "ATIVA", label: "Ativa" },
          { value: "PAUSADA", label: "Pausada" },
          { value: "ARQUIVADA", label: "Arquivada" },
        ]}
        value={status}
        onChange={setStatus}
      />
      <Button type="submit" variant="secondary" loading={pending}>
        Salvar meta
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function ContributionForm({ goalId, today }: { goalId: string; today: string }) {
  const [kind, setKind] = useState<"aporte" | "resgate">("aporte");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await addContributionAction({ goalId, kind, value, date, note });
          setState(result);
          if (!result.error) {
            setValue("");
            setNote("");
          }
        });
      }}
    >
      <SegmentedControl
        variant="boxed"
        label="Tipo de lançamento"
        options={[
          { value: "aporte", label: "Aporte" },
          { value: "resgate", label: "Resgate" },
        ]}
        value={kind}
        onChange={setKind}
      />
      <div className="flex gap-3">
        <Field label="Valor">
          <input value={value} onChange={(event) => setValue(event.target.value)} inputMode="decimal" placeholder="0,00" className={inputClass} />
        </Field>
        <Field label="Data">
          <input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="Observação">
        <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={120} className={inputClass} />
      </Field>
      <Button type="submit" loading={pending}>
        {kind === "resgate" ? "Registrar resgate" : "Registrar aporte"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function DeleteContributionButton({ id }: { id: string }) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setState(await deleteContributionAction(id)))}
        className="min-h-11 shrink-0 px-1 text-[15px] text-negative disabled:opacity-60"
      >
        Apagar
      </button>
      {state.error ? <span role="alert" className="text-[13px] text-negative">{state.error}</span> : null}
    </>
  );
}

/** Simulador: quanto por mês até uma data, ou até quando com um valor por mês. Só calcula; não grava nada. */
export function GoalSimulator({ targetCents, currentCents, currentMonth, targetMonth }: { targetCents: number; currentCents: number; currentMonth: string; targetMonth: string }) {
  const [monthly, setMonthly] = useState("");
  const [month, setMonth] = useState(targetMonth);
  const remaining = targetCents - currentCents;
  const monthlyCents = parseCents(monthly);
  const reach = monthlyCents !== null && monthlyCents > 0 ? completionMonth(remaining, monthlyCents, currentMonth) : null;
  const needed = isMonth(month) && month >= currentMonth ? monthlyRequiredCents(targetCents, currentCents, contributionMonths(currentMonth, month)) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Field label="Se eu aportar por mês">
          <input value={monthly} onChange={(event) => setMonthly(event.target.value)} inputMode="decimal" placeholder="1.000" className={inputClass} />
        </Field>
        <p aria-live="polite" className="m-0 text-[15px] text-text-secondary">
          {monthlyCents === null || monthlyCents <= 0 ? (
            "Digite um valor para ver quando a meta fecha."
          ) : reach ? (
            <>
              Fecha em <span className="text-text-primary">{formatMonthLabel(reach)}</span>.
            </>
          ) : (
            "Não fecha."
          )}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Field label="Para chegar até">
          <input type="month" value={month} min={currentMonth} onChange={(event) => setMonth(event.target.value)} className={inputClass} />
        </Field>
        <p aria-live="polite" className="m-0 text-[15px] text-text-secondary">
          {needed === null ? (
            "Escolha um mês a partir deste."
          ) : (
            <>
              Precisa de{" "}
              <span className="text-text-primary">
                <Money cents={needed} hideZeroCents />
              </span>{" "}
              por mês, contando este.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
