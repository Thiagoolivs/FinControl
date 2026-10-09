"use client";

import { type FormEvent, type ReactNode, useId, useState, useTransition } from "react";
import { compilePattern, type MatchType } from "@/lib/categorization/match";
import {
  EMPTY_RULE_DRAFT,
  normalizeRuleDraft,
  type RuleDirection,
  type RuleDraft,
  type RuleDraftErrors,
  validateRuleDraft,
} from "@/lib/categorization/rule-draft";
import { Button } from "./button";
import { cn } from "./cn";
import { Icon } from "./icon";
import { type SegmentOption, SegmentedControl } from "./segmented-control";
import { Eyebrow } from "./text";

type Option = { id: string; name: string };

type RuleEditorProps = {
  categories: Option[];
  streams: Option[];
  buckets: Option[];
  initialValue?: Partial<RuleDraft>;
  /** Descrição real que originou a regra: preenche o campo de teste. */
  sampleDescription?: string;
  submitError?: string;
  onSubmit?: (draft: RuleDraft) => Promise<void> | void;
  onCancel?: () => void;
};

const MATCH_OPTIONS: readonly SegmentOption<MatchType>[] = [
  { value: "PREFIX", label: "Começa com" },
  { value: "CONTAINS", label: "Contém" },
  { value: "REGEX", label: "Regex" },
];

const DIRECTION_OPTIONS: readonly SegmentOption<RuleDirection>[] = [
  { value: "AMBAS", label: "Ambos" },
  { value: "ENTRADA", label: "Entrada" },
  { value: "SAIDA", label: "Saída" },
];

const SCOPE_OPTIONS: readonly SegmentOption<RuleDraft["scope"]>[] = [
  { value: "AMBOS", label: "PF e PJ" },
  { value: "PF", label: "PF" },
  { value: "PJ", label: "PJ", tone: "pj" },
];

export function RuleEditor({ categories, streams, buckets, initialValue, sampleDescription = "", submitError, onSubmit, onCancel }: RuleEditorProps) {
  const [draft, setDraft] = useState<RuleDraft>({ ...EMPTY_RULE_DRAFT, ...initialValue });
  const [errors, setErrors] = useState<RuleDraftErrors>({});
  const [sample, setSample] = useState(sampleDescription);
  const [isPending, startTransition] = useTransition();
  const ids = { pattern: useId(), sample: useId(), category: useId(), stream: useId(), bucket: useId(), priority: useId(), retro: useId() };

  const update = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const compiled = compilePattern(draft.pattern, draft.matchType);
  const patternError = errors.pattern ?? (draft.matchType === "REGEX" && draft.pattern.trim() && !compiled.ok ? compiled.error : undefined);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateRuleDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    startTransition(async () => {
      await onSubmit?.(normalizeRuleDraft(draft));
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <Field label="Padrão" htmlFor={ids.pattern} error={patternError}>
        <input
          id={ids.pattern}
          value={draft.pattern}
          onChange={(event) => update("pattern", event.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={patternError ? true : undefined}
          className={cn(inputClass, "w-full font-mono text-[15px]")}
        />
        <SegmentedControl variant="boxed" label="Tipo de comparação" options={MATCH_OPTIONS} value={draft.matchType} onChange={(value) => update("matchType", value)} />
      </Field>

      <Field label="Testar com uma descrição" htmlFor={ids.sample}>
        <input id={ids.sample} value={sample} onChange={(event) => setSample(event.target.value)} autoComplete="off" spellCheck={false} className={cn(inputClass, "w-full font-mono text-[15px]")} />
        <MatchPreview compiled={compiled} sample={sample} />
      </Field>

      <div className="flex flex-col gap-2">
        <Eyebrow>Sentido</Eyebrow>
        <SegmentedControl variant="boxed" label="Sentido" options={DIRECTION_OPTIONS} value={draft.direction} onChange={(value) => update("direction", value)} />
      </div>

      <div className="flex flex-col gap-2">
        <Eyebrow>Escopo</Eyebrow>
        <SegmentedControl variant="boxed" label="Escopo" options={SCOPE_OPTIONS} value={draft.scope} onChange={(value) => update("scope", value)} />
      </div>

      <div className="flex flex-col gap-4">
        <SelectField id={ids.category} label="Categoria" value={draft.categoryId} options={categories} onChange={(value) => update("categoryId", value)} />
        {draft.direction !== "SAIDA" ? (
          <SelectField id={ids.stream} label="Stream de receita" value={draft.revenueStreamId} options={streams} onChange={(value) => update("revenueStreamId", value)} />
        ) : null}
        {draft.direction !== "ENTRADA" ? (
          <SelectField id={ids.bucket} label="Sai do bucket" value={draft.bucketId} options={buckets} onChange={(value) => update("bucketId", value)} />
        ) : null}
        {errors.destination ? <FieldError>{errors.destination}</FieldError> : null}
      </div>

      <Field label="Prioridade" htmlFor={ids.priority} error={errors.priority} hint="Menor número é avaliado primeiro.">
        <input
          id={ids.priority}
          inputMode="numeric"
          value={Number.isNaN(draft.priority) ? "" : String(draft.priority)}
          onChange={(event) => update("priority", event.target.value === "" ? Number.NaN : Number(event.target.value))}
          aria-invalid={errors.priority ? true : undefined}
          className={cn(inputClass, "w-32")}
        />
      </Field>

      <label htmlFor={ids.retro} className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
        <span className="flex flex-col gap-0.5">
          <span className="text-[15px]">Aplicar às transações que já existem</span>
          <span className="text-[13px] text-text-secondary">Recategoriza o histórico que bate com o padrão.</span>
        </span>
        <span className="relative shrink-0">
          <input
            id={ids.retro}
            type="checkbox"
            role="switch"
            checked={draft.applyRetroactively}
            onChange={(event) => update("applyRetroactively", event.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="block h-[31px] w-[51px] rounded-full bg-text-primary/20 transition-colors duration-200 ease-apple peer-checked:bg-positive peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
          />
          <span
            aria-hidden="true"
            className="absolute left-0.5 top-0.5 size-[27px] rounded-full bg-white shadow transition-transform duration-200 ease-apple peer-checked:translate-x-5"
          />
        </span>
      </label>

      {submitError ? <FieldError>{submitError}</FieldError> : null}

      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="secondary" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" loading={isPending}>
          Salvar regra
        </Button>
      </div>
    </form>
  );
}

const inputClass =
  "h-[50px] rounded-button bg-surface px-4 text-[16px] text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-negative";

function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor}>
        <Eyebrow>{label}</Eyebrow>
      </label>
      {children}
      {error ? <FieldError>{error}</FieldError> : hint ? <p className="m-0 text-[13px] text-text-secondary">{hint}</p> : null}
    </div>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="m-0 flex items-start gap-1.5 text-[13px] text-negative">
      <Icon name="alert" size={14} strokeWidth={2.2} className="mt-px shrink-0" />
      {children}
    </p>
  );
}

function SelectField({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id}>
        <Eyebrow>{label}</Eyebrow>
      </label>
      <div className="relative">
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={cn(inputClass, "w-full appearance-none pr-10")}>
          <option value="">Nenhum</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary" />
      </div>
    </div>
  );
}

function MatchPreview({ compiled, sample }: { compiled: ReturnType<typeof compilePattern>; sample: string }) {
  if (!sample.trim() || !compiled.ok) return null;
  const matches = compiled.test(sample);
  return (
    <p aria-live="polite" className={cn("m-0 flex items-center gap-1.5 text-[13px]", matches ? "text-positive" : "text-text-secondary")}>
      <Icon name={matches ? "check" : "x"} size={14} strokeWidth={2.4} />
      {matches ? "Corresponde ao padrão." : "Não corresponde ao padrão."}
    </p>
  );
}
