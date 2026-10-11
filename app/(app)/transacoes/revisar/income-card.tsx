"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Money } from "@/components/ui/money";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { compilePattern, type MatchType } from "@/lib/categorization/match";
import type { IncomeGroup } from "@/lib/rules/queue";
import type { ActionState } from "../../actions";
import { NEW_TYPES } from "../../config/receitas/controls";
import { assignStreamGroupAction, categorizeGroupAction } from "../actions";
import { GroupTransactions, PatternFields } from "./group-card";

type Option = { id: string; name: string };

const NEW_STREAM = "novo:";

/**
 * Grupo de entradas sem fonte: renda (stream: as reservas saem na hora; dá para criar a fonte ali mesmo),
 * outra entrada (reembolso, rendimento, presente, venda…) ou estorno de um gasto (abate da categoria).
 */
export function IncomeGroupCard({
  group,
  streams,
  incomeCategories,
  expenseCategories,
}: {
  group: IncomeGroup;
  streams: Option[];
  incomeCategories: Option[];
  expenseCategories: Option[];
}) {
  const pjCount = group.transactions.filter((transaction) => transaction.scope === "PJ").length;
  const [target, setTarget] = useState("");
  const [streamName, setStreamName] = useState("");
  const [streamType, setStreamType] = useState<(typeof NEW_TYPES)[number]["value"]>("PROJETO");
  const [streamScope, setStreamScope] = useState<"PF" | "PJ">(pjCount * 2 > group.transactions.length ? "PJ" : "PF");
  const [createRule, setCreateRule] = useState(true);
  const [pattern, setPattern] = useState(group.pattern);
  const [matchType, setMatchType] = useState<MatchType>(group.matchType);
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  const compiled = compilePattern(pattern, matchType);
  const matched = compiled.ok ? group.transactions.filter((transaction) => compiled.test(transaction.description)).length : 0;
  const title = group.transactions[0]?.description ?? group.key;
  const count = group.transactions.length;
  const [kind, id] = target.split(":") as ["s" | "c" | "novo" | "", string | undefined];
  const creating = target === NEW_STREAM;

  function confirm() {
    const base = { transactionIds: group.transactions.map((transaction) => transaction.id), createRule, pattern, matchType };
    startTransition(async () => {
      if (creating) {
        setState(await assignStreamGroupAction({ ...base, revenueStreamId: null, newStream: { name: streamName, type: streamType, scope: streamScope } }));
      } else if (id) {
        setState(
          kind === "s"
            ? await assignStreamGroupAction({ ...base, revenueStreamId: id })
            : await categorizeGroupAction({ ...base, categoryId: id, suggestionId: null }),
        );
      }
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
          <optgroup label="Renda (separa imposto e custo)">
            {streams.map((stream) => (
              <option key={stream.id} value={`s:${stream.id}`}>
                {stream.name}
              </option>
            ))}
            <option value={NEW_STREAM}>+ Nova fonte de renda…</option>
          </optgroup>
          {incomeCategories.length > 0 ? (
            <optgroup label="Outra entrada">
              {incomeCategories.map((category) => (
                <option key={category.id} value={`c:${category.id}`}>
                  {category.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          <optgroup label="Estorno de um gasto (abate da área)">
            {expenseCategories.map((category) => (
              <option key={category.id} value={`c:${category.id}`}>
                {category.name}
              </option>
            ))}
          </optgroup>
        </select>
        <Icon name="chevron-down" size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary" />
      </label>

      {creating ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">Nome da fonte</span>
            <input
              value={streamName}
              onChange={(event) => setStreamName(event.target.value)}
              placeholder="Ex.: Salário, Freela, Loja"
              autoComplete="off"
              className="h-11 w-full rounded-button bg-surface-elevated px-3 text-[16px] text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </label>
          <SegmentedControl variant="boxed" label="Tipo" options={NEW_TYPES} value={streamType} onChange={setStreamType} onSurface />
          <SegmentedControl
            variant="boxed"
            label="Escopo"
            options={[
              { value: "PF", label: "PF" },
              { value: "PJ", label: "PJ", tone: "pj" },
            ]}
            value={streamScope}
            onChange={setStreamScope}
            onSurface
          />
          <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
            Os % de imposto e custo começam em zero; ajuste em Config → Receitas.
            {streamType === "VENTURE" ? " Um negócio ganha o próprio caixa: o que entra fica lá até você retirar." : ""}
          </p>
        </div>
      ) : null}

      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
        <span className="text-[15px]">Virar regra para as próximas</span>
        <input type="checkbox" checked={createRule} onChange={(event) => setCreateRule(event.target.checked)} className="size-5 accent-[var(--accent)]" />
      </label>
      {createRule ? (
        <PatternFields pattern={pattern} onPattern={setPattern} matchType={matchType} onMatchType={setMatchType} compiled={compiled} matched={matched} count={count} />
      ) : null}

      <GroupTransactions transactions={group.transactions} kind="in" />

      <Button onClick={confirm} loading={pending} disabled={(creating ? !streamName.trim() : !id) || (createRule && !compiled.ok)}>
        {creating ? "Criar fonte e atribuir" : kind === "c" ? (createRule ? "Criar regra" : "Categorizar") : "Atribuir à stream"}
      </Button>
      {state.error ? (
        <p role="alert" className="m-0 text-[13px] text-negative">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}
