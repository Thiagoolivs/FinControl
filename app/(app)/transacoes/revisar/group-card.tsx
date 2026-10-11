"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Money } from "@/components/ui/money";
import { type SegmentOption, SegmentedControl } from "@/components/ui/segmented-control";
import { ScopeTag } from "@/components/ui/text";
import { compilePattern, type MatchType } from "@/lib/categorization/match";
import type { QueueGroup } from "@/lib/rules/queue";
import type { ActionState } from "../../actions";
import { categorizeGroupAction, ignoreSuggestionAction } from "../actions";

// Rótulos curtos: o cartão é estreito no celular.
const MATCH_OPTIONS: readonly SegmentOption<MatchType>[] = [
  { value: "PREFIX", label: "Começa" },
  { value: "CONTAINS", label: "Contém" },
  { value: "REGEX", label: "Regex" },
];

const dayMonth = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });

export function QueueGroupCard({ group, categories }: { group: QueueGroup; categories: { id: string; name: string }[] }) {
  const suggestion = group.suggestion;
  const [categoryId, setCategoryId] = useState(suggestion?.categoryId ?? "");
  const [createRule, setCreateRule] = useState(true);
  const [pattern, setPattern] = useState(suggestion?.pattern ?? group.pattern);
  const [matchType, setMatchType] = useState<MatchType>(suggestion?.matchType ?? group.matchType);
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  const compiled = compilePattern(pattern, matchType);
  const matched = compiled.ok ? group.transactions.filter((transaction) => compiled.test(transaction.description)).length : 0;
  const suggestedName = suggestion?.categoryId ? categories.find((category) => category.id === suggestion.categoryId)?.name : null;
  const title = group.transactions[0]?.description ?? group.key;
  const count = group.transactions.length;

  function confirm() {
    startTransition(async () => {
      setState(
        await categorizeGroupAction({
          transactionIds: group.transactions.map((transaction) => transaction.id),
          categoryId,
          createRule,
          pattern,
          matchType,
          suggestionId: suggestion?.id ?? null,
        }),
      );
    });
  }

  return (
    <li className="flex flex-col gap-4 rounded-card bg-surface px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[16px] font-[450] break-words">{title}</span>
          <span className="text-[13px] text-text-secondary">
            {count} {count === 1 ? "transação" : "transações"} · {group.transactions.map((transaction) => transaction.account).filter((name, index, all) => all.indexOf(name) === index).join(", ")}
          </span>
        </div>
        <Money cents={group.totalCents} className="shrink-0 text-[16px] font-[450]" />
      </div>

      {suggestedName ? (
        <p className="m-0 flex items-center gap-1.5 text-[13px] text-accent">
          <Icon name="sparkle" size={14} />
          Sugestão da IA: {suggestedName}
        </p>
      ) : null}

      <label className="relative flex">
        <span className="sr-only">Categoria para {title}</span>
        <select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className="h-[50px] w-full appearance-none rounded-button bg-surface-elevated px-4 pr-10 text-[16px] text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <option value="">Escolha a categoria</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary" />
      </label>

      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
        <span className="text-[15px]">Virar regra para as próximas</span>
        <input type="checkbox" checked={createRule} onChange={(event) => setCreateRule(event.target.checked)} className="size-5 accent-[var(--accent)]" />
      </label>

      {createRule ? (
        <div className="flex flex-col gap-2">
          <input
            aria-label="Padrão da regra"
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="h-[50px] w-full rounded-button bg-surface-elevated px-4 font-mono text-[15px] text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <SegmentedControl variant="boxed" label="Tipo de comparação" options={MATCH_OPTIONS} value={matchType} onChange={setMatchType} />
          <p className={`m-0 text-[13px] ${compiled.ok && matched === count ? "text-text-secondary" : "text-warning"}`}>
            {!compiled.ok
              ? compiled.error
              : matched === count
                ? `O padrão pega ${count === 1 ? "esta" : `as ${count}`} e as próximas iguais.`
                : `O padrão pega ${matched} de ${count} destas. As outras entram nesta categoria só desta vez.`}
          </p>
        </div>
      ) : null}

      <button type="button" onClick={() => setExpanded((open) => !open)} className="flex min-h-11 items-center gap-1 self-start text-[15px] text-accent">
        {expanded ? "Esconder" : "Ver"} transações
        <Icon name="chevron-down" size={14} className={expanded ? "rotate-180" : undefined} />
      </button>
      {expanded ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {group.transactions.map((transaction) => (
            <li key={transaction.id} className="flex items-center gap-3 text-[14px]">
              <span className="w-14 shrink-0 text-text-secondary">{dayMonth.format(new Date(`${transaction.date}T00:00:00Z`))}</span>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate">{transaction.description}</span>
                <ScopeTag scope={transaction.scope} />
              </span>
              <Money cents={transaction.amountCents} kind="out" className="shrink-0" />
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={confirm} loading={pending} disabled={!categoryId || (createRule && !compiled.ok)} className="flex-1">
          {createRule ? "Criar regra" : "Categorizar"}
        </Button>
        {suggestion ? (
          <Button
            variant="link"
            disabled={pending}
            onClick={() => startTransition(async () => setState(await ignoreSuggestionAction(suggestion.id)))}
          >
            Ignorar sugestão
          </Button>
        ) : null}
      </div>
      {state.error ? (
        <p role="alert" className="m-0 text-[13px] text-negative">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}
