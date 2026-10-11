"use client";

import { type ReactNode, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatCents, formatPercentBps } from "@/lib/finance/money";
import { ASSET_CLASSES, type AssetClassKey, MARKET_PRICED } from "@/lib/finance/portfolio";
import type { ActionState } from "../actions";
import { addHoldingAction, deleteHoldingAction, setTargetsAction, updateHoldingAction } from "./actions";
import { CLASS_LABEL } from "./labels";

const inputClass =
  "h-11 min-w-0 w-full rounded-button bg-surface-elevated px-3 text-[16px] text-text-primary tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-accent";

function Field({ label, children, suffix }: { label: string; children: ReactNode; suffix?: string }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">{label}</span>
      <span className="relative">
        {children}
        {suffix ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[15px] text-text-secondary">{suffix}</span> : null}
      </span>
    </label>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <p role="alert" className="m-0 text-[13px] text-negative">{state.error}</p>;
  if (state.notice) return <p role="status" className="m-0 text-[13px] text-text-secondary">{state.notice}</p>;
  return null;
}

/** Alocação-alvo em % por classe; a soma aparece enquanto você digita. */
export function TargetsForm({ targets }: { targets: Partial<Record<AssetClassKey, number>> }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(ASSET_CLASSES.map((key) => [key, targets[key] ? formatPercentBps(targets[key] ?? 0) : ""])),
  );
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const sum = ASSET_CLASSES.reduce((total, key) => total + (Number((values[key] || "0").replace(",", ".")) || 0), 0);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => setState(await setTargetsAction(values)));
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        {ASSET_CLASSES.map((key) => (
          <Field key={key} label={CLASS_LABEL[key]} suffix="%">
            <input
              value={values[key] ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
              inputMode="decimal"
              placeholder="0"
              className={inputClass}
            />
          </Field>
        ))}
      </div>
      <p className={`m-0 text-[13px] ${Math.abs(sum - 100) < 0.005 ? "text-text-secondary" : "text-warning"}`}>Soma: {sum.toFixed(2).replace(".", ",").replace(/,00$/, "")}%</p>
      <Button type="submit" variant="secondary" loading={pending}>
        Salvar alvo
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function AddHoldingForm() {
  const [assetClass, setAssetClass] = useState<AssetClassKey>("ACAO");
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [value, setValue] = useState("");
  const [scope, setScope] = useState<"PF" | "PJ">("PF");
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const quoted = MARKET_PRICED.includes(assetClass);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await addHoldingAction({ assetClass, name: name || ticker, ticker, quantity, cost, value, scope });
          setState(result);
          if (!result.error) {
            setName("");
            setTicker("");
            setQuantity("");
            setCost("");
            setValue("");
          }
        });
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">Classe</span>
        <select value={assetClass} onChange={(event) => setAssetClass(event.target.value as AssetClassKey)} className={inputClass}>
          {ASSET_CLASSES.map((key) => (
            <option key={key} value={key}>
              {CLASS_LABEL[key]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-3">
        {quoted ? (
          <Field label="Ticker">
            <input value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} placeholder={assetClass === "CRIPTO" ? "BTC" : "PETR4"} autoCapitalize="characters" className={inputClass} />
          </Field>
        ) : null}
        <Field label="Nome">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={quoted ? "Opcional" : "CDB Banco X 110% CDI"} className={inputClass} />
        </Field>
      </div>
      <div className="flex gap-3">
        <Field label="Quantidade">
          <input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" placeholder={quoted ? "100" : "1"} className={inputClass} />
        </Field>
        <Field label="Custo total">
          <input value={cost} onChange={(event) => setCost(event.target.value)} inputMode="decimal" placeholder="0,00" className={inputClass} />
        </Field>
      </div>
      {quoted ? (
        <p className="m-0 text-[13px] leading-[18px] text-text-secondary">O valor de hoje vem da cotação da brapi, atualizada uma vez por dia.</p>
      ) : (
        <Field label="Valor hoje">
          <input value={value} onChange={(event) => setValue(event.target.value)} inputMode="decimal" placeholder="Igual ao custo" className={inputClass} />
        </Field>
      )}
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
      <Button type="submit" variant="secondary" loading={pending}>
        Adicionar posição
      </Button>
      <Feedback state={state} />
    </form>
  );
}

/** Editar ou remover uma posição manual (a da Pluggy segue o banco). */
export function ManualHoldingControls({ id, quantity, costCents, valueCents, quoted }: { id: string; quantity: string; costCents: number; valueCents: number; quoted: boolean }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(quantity.replace(".", ","));
  const [cost, setCost] = useState(formatCents(costCents, { symbol: false }));
  const [value, setValue] = useState(formatCents(valueCents, { symbol: false }));
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <Button variant="link" className="self-start text-[15px]" onClick={() => setOpen(true)}>
        Editar
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col gap-3 rounded-card bg-surface p-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await updateHoldingAction({ id, quantity: qty, cost, value: quoted ? "" : value });
          setState(result);
          if (!result.error) setOpen(false);
        });
      }}
    >
      <div className="flex gap-3">
        <Field label="Quantidade">
          <input value={qty} onChange={(event) => setQty(event.target.value)} inputMode="decimal" className={inputClass} />
        </Field>
        <Field label="Custo total">
          <input value={cost} onChange={(event) => setCost(event.target.value)} inputMode="decimal" className={inputClass} />
        </Field>
      </div>
      {quoted ? null : (
        <Field label="Valor hoje">
          <input value={value} onChange={(event) => setValue(event.target.value)} inputMode="decimal" className={inputClass} />
        </Field>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={pending}>
          Salvar
        </Button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => setState(await deleteHoldingAction(id)))}
          className="min-h-11 px-1 text-[16px] font-medium text-negative"
        >
          Remover
        </button>
        <Button variant="link" disabled={pending} onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
