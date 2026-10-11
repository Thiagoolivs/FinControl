"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { ParamSpec } from "@/lib/alerts/catalog";
import { formatCents, formatPercentBps } from "@/lib/finance/money";
import type { ActionState } from "../../actions";
import { updateAlertRuleAction } from "./actions";

type Severity = "BAIXA" | "MEDIA" | "ALTA";

const inputClass =
  "h-11 min-w-0 w-full rounded-button bg-surface-elevated px-3 text-[16px] text-text-primary tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-accent";

const toText = (spec: ParamSpec, value: number) =>
  spec.kind === "cents" ? formatCents(value, { symbol: false, hideZeroCents: true }) : spec.kind === "bps" ? formatPercentBps(value) : String(value);

const SUFFIX = { cents: "", bps: "%", days: "dias", months: "meses" } as const;

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
      <span className="text-[15px]">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-5 accent-[var(--accent)]" />
    </label>
  );
}

export function AlertRuleRow({
  rule,
  label,
  description,
  specs,
}: {
  rule: { id: string; active: boolean; push: boolean; severity: Severity; params: Record<string, number> };
  label: string;
  description: string;
  specs: ParamSpec[];
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(rule.active);
  const [push, setPush] = useState(rule.push);
  const [severity, setSeverity] = useState<Severity>(rule.severity);
  const [params, setParams] = useState(() => Object.fromEntries(specs.map((spec) => [spec.key, toText(spec, rule.params[spec.key] ?? spec.initial)])));
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const summary = [rule.active ? null : "desligado", rule.active && rule.push ? "com notificação" : rule.active ? "só no app" : null].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-3 py-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-11 w-full flex-col items-start gap-[3px] text-left text-text-primary">
        <span className="text-[16px] font-medium">{label}</span>
        <span className="text-[13px] text-text-secondary">
          {description} {summary ? `(${summary})` : ""}
        </span>
      </button>
      {open ? (
        <form
          className="flex flex-col gap-2 rounded-card bg-surface p-5"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => setState(await updateAlertRuleAction({ id: rule.id, active, push, severity, params })));
          }}
        >
          <Toggle label="Ligado" checked={active} onChange={setActive} />
          <Toggle label="Notificação no celular" checked={push} onChange={setPush} />
          <div className="flex flex-col gap-1.5 py-1">
            <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">Severidade</span>
            <SegmentedControl
              variant="boxed"
              label="Severidade"
              options={[
                { value: "BAIXA", label: "Baixa" },
                { value: "MEDIA", label: "Média" },
                { value: "ALTA", label: "Alta" },
              ]}
              value={severity}
              onChange={setSeverity}
            />
          </div>
          {specs.map((spec) => (
            <label key={spec.key} className="flex flex-col gap-1.5 py-1">
              <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">{spec.label}</span>
              <span className="relative">
                <input
                  value={params[spec.key] ?? ""}
                  onChange={(event) => setParams((current) => ({ ...current, [spec.key]: event.target.value }))}
                  inputMode={spec.kind === "cents" || spec.kind === "bps" ? "decimal" : "numeric"}
                  className={inputClass}
                />
                {SUFFIX[spec.kind] ? (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[15px] text-text-secondary">{SUFFIX[spec.kind]}</span>
                ) : null}
              </span>
            </label>
          ))}
          <Button type="submit" loading={pending} className="mt-2">
            Salvar
          </Button>
          {state.error ? <p role="alert" className="m-0 text-[13px] text-negative">{state.error}</p> : null}
          {state.notice ? <p role="status" className="m-0 text-[13px] text-text-secondary">{state.notice}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
