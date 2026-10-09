"use client";

import { type ReactNode, useEffect, useState } from "react";
import { AlertBanner } from "@/components/ui/alert-banner";
import { BalanceComposition, BalanceHero } from "@/components/ui/balance-hero";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CategoryBar } from "@/components/ui/category-bar";
import { ChatBubble, ChatButton, ChatComposer, ChatSheet } from "@/components/ui/chat-sheet";
import { ConfirmationCard, type ProposalStatus } from "@/components/ui/confirmation-card";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { GoalCard } from "@/components/ui/goal-card";
import { Money } from "@/components/ui/money";
import { AccountButton, SideNav, TabBar } from "@/components/ui/navigation";
import { ProjectionChart } from "@/components/ui/projection-chart";
import { RuleEditor } from "@/components/ui/rule-editor";
import { ScopeToggle } from "@/components/ui/scope-toggle";
import { type SegmentOption, SegmentedControl } from "@/components/ui/segmented-control";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { StatRow } from "@/components/ui/stat-row";
import type { ScopeFilter, ViewStatus } from "@/components/ui/status";
import { Eyebrow } from "@/components/ui/text";
import { TransactionList } from "@/components/ui/transaction-item";
import { GOALS, NAV_ITEMS, PROJECTION, PROPOSAL_ROWS, RULE_OPTIONS, SCOPES } from "./fixtures";

const ALL_STATES: readonly SegmentOption<ViewStatus>[] = [
  { value: "ready", label: "Padrão" },
  { value: "loading", label: "Carregando" },
  { value: "empty", label: "Vazio" },
  { value: "error", label: "Erro" },
];
const READY_LOADING = ALL_STATES.slice(0, 2);

const PROPOSAL_STATES: readonly SegmentOption<ProposalStatus | "error">[] = [
  { value: "pending", label: "Pendente" },
  { value: "confirmed", label: "Feita" },
  { value: "cancelled", label: "Cancelada" },
  { value: "error", label: "Erro" },
];

const THEMES: readonly SegmentOption<"dark" | "light">[] = [
  { value: "dark", label: "Escuro" },
  { value: "light", label: "Claro" },
];

const OVER_AVERAGE_BPS = 12_000;
const retry = <Button variant="link">Tentar de novo</Button>;

export function Catalog() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [scope, setScope] = useState<ScopeFilter>("TUDO");
  const [chatOpen, setChatOpen] = useState(false);
  const [ruleResult, setRuleResult] = useState<string | null>(null);
  const data = SCOPES[scope];

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    return () => {
      delete root.dataset.theme;
    };
  }, [theme]);

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-16 px-5 pb-32 pt-[calc(env(safe-area-inset-top)+20px)]">
      <header className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Eyebrow>Design system · direção B</Eyebrow>
          <h1 className="m-0 text-[44px] font-light leading-[48px] tracking-[-0.035em]">Componentes</h1>
          <p className="m-0 text-[15px] text-text-secondary">Dados fictícios. Troque tema e escopo para ver cada estado.</p>
        </div>
        <div className="flex flex-col gap-3">
          <SegmentedControl variant="boxed" label="Tema" options={THEMES} value={theme} onChange={setTheme} />
          <ScopeToggle value={scope} onChange={setScope} />
        </div>
      </header>

      <Tokens />

      <Showcase name="BalanceHero + composição" states={ALL_STATES}>
        {(status) => (
          <BalanceHero
            status={status}
            scope={scope}
            amountCents={data.heroCents}
            caption={data.caption}
            composition={<BalanceComposition segments={data.segments} total={data.total} />}
            emptyAction={<Button>Conectar conta</Button>}
            errorAction={retry}
          />
        )}
      </Showcase>

      <Showcase name="StatRow" states={READY_LOADING}>
        {(status) => (
          <div className="flex flex-col">
            {data.stats.map((stat) => (
              <StatRow key={stat.label} {...stat} loading={status === "loading"} />
            ))}
          </div>
        )}
      </Showcase>

      <Showcase name="CategoryBar" states={ALL_STATES}>
        {(status) => (
          <CategoryBar
            title="Gastos de outubro"
            items={data.categories}
            overThresholdBps={OVER_AVERAGE_BPS}
            status={status}
            emptyTitle="Nenhum gasto em outubro ainda."
            errorAction={retry}
          />
        )}
      </Showcase>

      <Showcase name="TransactionItem" states={ALL_STATES}>
        {(status) => (
          <TransactionList groups={data.transactions} status={status} emptyTitle="Nenhuma transação nos últimos 30 dias." errorAction={retry} />
        )}
      </Showcase>

      <Showcase name="GoalCard" states={READY_LOADING}>
        {(status) => (
          <div className="flex flex-col gap-6">
            {GOALS.filter((goal) => scope === "TUDO" || goal.scope === scope).map((goal) => (
              <GoalCard key={goal.name} {...goal} href="#" loading={status === "loading"} />
            ))}
          </div>
        )}
      </Showcase>

      <Showcase name="ProjectionChart" states={ALL_STATES}>
        {(status) => <ProjectionChart months={status === "empty" ? [] : PROJECTION} status={status} errorAction={retry} />}
      </Showcase>

      <Showcase name="AlertBanner">
        {() => (
          <div className="flex flex-col gap-3">
            <AlertBanner
              severity="critical"
              scope="PJ"
              title="Conexão com o Itaú falhou"
              body="Erro de login desde ontem. As transações da PJ não estão sendo atualizadas."
              action={<Button variant="link">Reconectar</Button>}
            />
            <AlertBanner severity="warning" title="Lazer em 128% da média" body="R$ 655,00 em outubro. Média dos últimos 3 meses: R$ 511,72." href="#" />
            <AlertBanner severity="info" title="Consentimento do Nubank expira em 25 dias" body="Renove para não interromper a sincronização." href="#" />
          </div>
        )}
      </Showcase>

      <Showcase name="ScopeToggle e SegmentedControl">
        {() => (
          <div className="flex flex-col gap-4">
            <ScopeToggle value={scope} onChange={setScope} />
            <SegmentedControl variant="boxed" label="Escopo" options={[{ value: "TUDO", label: "Tudo" }, { value: "PF", label: "PF" }, { value: "PJ", label: "PJ", tone: "pj" }]} value={scope} onChange={setScope} />
          </div>
        )}
      </Showcase>

      <Showcase name="Button">
        {() => (
          <div className="flex flex-col gap-2.5">
            <Button>Confirmar</Button>
            <div className="grid grid-cols-2 gap-2.5">
              <Button variant="secondary">Cancelar</Button>
              <Button variant="destructive">Excluir regra</Button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Button loading>Salvando</Button>
              <Button disabled>Indisponível</Button>
            </div>
            <Button variant="link" className="self-start">
              Ver todas as transações
            </Button>
          </div>
        )}
      </Showcase>

      <Showcase name="Card">
        {() => (
          <div className="flex flex-col gap-3">
            <Card className="flex items-center justify-between">
              <span className="text-[15px]">Superfície</span>
              <Money cents={8_650} className="text-[15px]" />
            </Card>
            <Card tone="elevated" className="flex items-center justify-between">
              <span className="text-[15px]">Superfície elevada</span>
              <Money cents={-8_650} className="text-[15px]" />
            </Card>
          </div>
        )}
      </Showcase>

      <Showcase name="ChatSheet">
        {() => (
          <>
            <div className="flex">
              <ChatButton floating={false} onClick={() => setChatOpen(true)} />
            </div>
            <ChatSheet open={chatOpen} onOpenChange={setChatOpen} composer={<ChatComposer />}>
              <ChatBubble role="user">Quanto gastei com delivery esse mês?</ChatBubble>
              <ChatBubble role="model">
                <p className="m-0">
                  R$ 412,30 em 11 pedidos, 23% acima da sua média de 3 meses (R$ 335,10). O maior foi R$ 89,90 no dia 3.
                </p>
                <p className="m-0">Quer que eu crie uma regra para o iFood não cair mais na fila de revisão?</p>
              </ChatBubble>
              <ChatBubble role="user">Pode criar.</ChatBubble>
              <ChatBubble role="model">
                <ConfirmationCard tone="elevated" title="Criar regra de categoria" rows={PROPOSAL_ROWS} />
              </ChatBubble>
            </ChatSheet>
          </>
        )}
      </Showcase>

      <Showcase name="ConfirmationCard" states={PROPOSAL_STATES}>
        {(state) => (
          <ConfirmationCard
            title="Criar regra de categoria"
            rows={PROPOSAL_ROWS}
            status={state === "error" ? "pending" : state}
            error={state === "error" ? "Não foi possível salvar. Nada foi alterado." : undefined}
            onConfirm={() => new Promise((resolve) => setTimeout(resolve, 1200))}
          />
        )}
      </Showcase>

      <Showcase name="RuleEditor">
        {() => (
          <div className="flex flex-col gap-4">
            <RuleEditor
              {...RULE_OPTIONS}
              initialValue={{ pattern: "PAG*IFOOD", categoryId: "delivery" }}
              sampleDescription="PAG*IFOOD 4421"
              onSubmit={(draft) => setRuleResult(`Regra válida: ${draft.matchType} "${draft.pattern}"`)}
              onCancel={() => setRuleResult(null)}
            />
            {ruleResult ? <p className="m-0 text-[13px] text-positive">{ruleResult}</p> : null}
          </div>
        )}
      </Showcase>

      <Showcase name="EmptyState e ErrorState">
        {() => (
          <div className="flex flex-col gap-2">
            <EmptyState title="Nada para revisar." description="Todas as transações estão categorizadas. As novas aparecem aqui depois do sync." />
            <EmptyState compact title="Nenhuma meta ainda." action={<Button variant="secondary">Criar meta</Button>} />
            <ErrorState title="Não foi possível sincronizar." description="O Itaú não respondeu. Tentamos de novo no próximo sync." action={retry} />
          </div>
        )}
      </Showcase>

      <Showcase name="Skeleton">
        {() => (
          <LoadingRegion label="Exemplo carregando" className="flex flex-col gap-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-[76px] w-[240px] rounded-xl" />
            <Skeleton className="h-3.5 w-44" />
          </LoadingRegion>
        )}
      </Showcase>

      <Showcase name="Navegação">
        {() => (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-text-secondary">Avatar (Carteira e Config)</span>
              <AccountButton href="#" />
            </div>
            <TabBar items={NAV_ITEMS} activeHref="/" fixed={false} />
            <div className="flex flex-col gap-2">
              <span className="text-[13px] text-text-secondary">Desktop: navegação lateral</span>
              <SideNav items={NAV_ITEMS} activeHref="/" />
            </div>
          </div>
        )}
      </Showcase>
    </main>
  );
}

function Showcase<T extends string = "ready">({
  name,
  states,
  children,
}: {
  name: string;
  states?: readonly SegmentOption<T>[];
  children: (state: T) => ReactNode;
}) {
  const first = states?.[0]?.value;
  const [state, setState] = useState<T | undefined>(first);
  return (
    <section aria-label={name} className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <h2 className="m-0 font-mono text-[13px] font-normal text-text-secondary">{name}</h2>
        {states && states.length > 1 && state !== undefined ? (
          <SegmentedControl label={`Estado de ${name}`} options={states} value={state} onChange={setState} />
        ) : null}
      </div>
      <div>{children((state ?? "ready") as T)}</div>
    </section>
  );
}

const SWATCHES: Array<[string, string]> = [
  ["bg", "bg-bg"],
  ["surface", "bg-surface"],
  ["surface-elevated", "bg-surface-elevated"],
  ["text-primary", "bg-text-primary"],
  ["text-secondary", "bg-text-secondary"],
  ["text-tertiary", "bg-text-tertiary"],
  ["accent", "bg-accent"],
  ["accent-fill", "bg-accent-fill"],
  ["positive", "bg-positive"],
  ["negative", "bg-negative"],
  ["warning", "bg-warning"],
  ["scope-pj", "bg-scope-pj"],
  ["badge", "bg-badge"],
];

function Tokens() {
  return (
    <section aria-label="Tokens" className="flex flex-col gap-6">
      <h2 className="m-0 font-mono text-[13px] font-normal text-text-secondary">Tokens</h2>
      <ul className="m-0 grid list-none grid-cols-4 gap-x-3 gap-y-4 p-0 sm:grid-cols-5">
        {SWATCHES.map(([name, swatch]) => (
          <li key={name} className="flex flex-col gap-1.5">
            <span aria-hidden="true" className={`h-10 rounded-button ring-1 ring-inset ring-text-primary/10 ${swatch}`} />
            <span className="break-words text-[11px] text-text-secondary">{name}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3">
        <span className="text-[72px] font-light leading-[76px] tracking-[-0.045em]">14.305</span>
        <span className="text-[34px] font-light leading-10 tracking-[-0.03em]">R$ 5.064,90</span>
        <span className="text-[17px]">Corpo · 17</span>
        <span className="text-[15px]">Lista · 15</span>
        <span className="text-[13px] text-text-secondary">Nota · 13</span>
        <Eyebrow>Rótulo · 12 caixa alta</Eyebrow>
      </div>
    </section>
  );
}
