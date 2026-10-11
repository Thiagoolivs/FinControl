"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Money } from "@/components/ui/money";
import { compilePattern, type MatchType } from "@/lib/categorization/match";
import type { IncomeGroup } from "@/lib/rules/queue";
import type { ActionState } from "../../actions";
import { assignStreamGroupAction, categorizeGroupAction } from "../actions";
import { GroupTransactions, PatternFields } from "./group-card";

type Option = { id: string; name: string };

/**
 * Grupo de entradas sem fonte: escolha a stream de receita (as reservas saem na hora) ou, se não for
 * receita (estorno, reembolso, resgate), uma categoria.
 */
export function IncomeGroupCard({ group, streams, categories }: { group: IncomeGroup; streams: Option[]; categories: Option[] }) {
  const [target, setTarget] = useState("");
  const [createRule, setCreateRule] = useState(true);
  const [pattern, setPattern] = useState(group.pattern);
  const [matchType, setMatchType] = useState<MatchType>(group.matchType);
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  const compiled = compilePattern(pattern, matchType);
  const matched = compiled.ok ? group.transactions.filter((transaction) => compiled.test(transaction.description)).length : 0;
  const title = group.transactions[0]?.description ?? group.key;
  const count = group.transactions.length;
  const [kind, id] = target.split(":") as ["s" | "c" | "", string | undefined];

  function confirm() {
    if (!id) return;
    const base = { transactionIds: group.transactions.map((transaction) => transaction.id), createRule, pattern, matchType };
    startTransition(async () => {
      setState(
        kind === "s"
          ? await assignStreamGroupAction({ ...base, revenueStreamId: id })
          : await categorizeGroupAction({ ...base, categoryId: id, suggestionId: null }),
      );
    });
  }

  return (
    <li className="flex flex-col gap-4 rounded-card bg-surface px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[16px] font-[450] break-words">{title}</span>
          <span className="text-[13px] text-text-secondary">
            {count} {count === 1 ? "entrada" : "entradas"} · {group.transactions.map((transaction) => transaction.account).filter((name, index, all) => all.indexOf(name) === index).join(", ")}
          </span>
        </div>
        <Money cents={group.totalCents} kind="in" className="shrink-0 text-[16px] font-[450]" />
      </div>

      <label className="relative flex">
        <span className="sr-only">De onde veio {title}</span>
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className="h-[50px] w-full appearance-none rounded-button bg-surface-elevated px-4 pr-10 text-[16px] text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <option value="">De onde veio?</option>
          <optgroup label="Receita">
            {streams.map((stream) => (
              <option key={stream.id} value={`s:${stream.id}`}>
                {stream.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Não é receita">
            {categories.map((category) => (
              <option key={category.id} value={`c:${category.id}`}>
                {category.name}
              </option>
            ))}
          </optgroup>
        </select>
        <Icon name="chevron-down" size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary" />
      </label>

      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
        <span className="text-[15px]">Virar regra para as próximas</span>
        <input type="checkbox" checked={createRule} onChange={(event) => setCreateRule(event.target.checked)} className="size-5 accent-[var(--accent)]" />
      </label>
      {createRule ? (
        <PatternFields pattern={pattern} onPattern={setPattern} matchType={matchType} onMatchType={setMatchType} compiled={compiled} matched={matched} count={count} />
      ) : null}

      <GroupTransactions transactions={group.transactions} kind="in" />

      <Button onClick={confirm} loading={pending} disabled={!id || (createRule && !compiled.ok)}>
        {kind === "c" ? (createRule ? "Criar regra" : "Categorizar") : "Atribuir à stream"}
      </Button>
      {state.error ? (
        <p role="alert" className="m-0 text-[13px] text-negative">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}
