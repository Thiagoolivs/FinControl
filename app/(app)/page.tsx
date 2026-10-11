import Link from "next/link";
import { AlertBanner } from "@/components/ui/alert-banner";
import { BalanceComposition, BalanceHero } from "@/components/ui/balance-hero";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { RowLink } from "@/components/ui/row-link";
import { StatRow } from "@/components/ui/stat-row";
import type { ScopeFilter as ScopeValue } from "@/components/ui/status";
import { Eyebrow, ScopeTag } from "@/components/ui/text";
import { TransactionList, type TransactionItemData } from "@/components/ui/transaction-item";
import { requireUser } from "@/lib/auth/dal";
import { formatDayLabel, formatElapsed, formatMoment, fromDbDate, todayLocal } from "@/lib/dates";
import { composeBalance, summarizeBalances } from "@/lib/finance/balance";
import { summarizeFlows } from "@/lib/finance/flows";
import { isPluggyConfigured } from "@/lib/pluggy/client";
import { getAccounts, getBucketTotals, getConnections, getRecentTransactions } from "@/lib/queries/overview";
import { parseScopeParam } from "@/lib/queries/scope";
import { connectionAlertRules } from "@/lib/sync/alerts";
import { manualRefreshAvailableAt } from "@/lib/sync/sync";
import { connectionIssues } from "./connection-health";
import { PAGE_CLASS, PageHeader } from "./page-header";
import { RefreshButton } from "./refresh-button";
import { ScopeFilter } from "./scope-filter";

const RECENT_DAYS = 30;

const ACCOUNT_KIND = { CHECKING: "Conta corrente", SAVINGS: "Poupança", CREDIT: "Cartão", INVESTMENT: "Investimento" } as const;

export default async function TodayPage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const query = parseScopeParam((await searchParams).escopo);
  const scopeValue: ScopeValue = query.consolidated ? "TUDO" : query.scope;

  const [connections, accounts, buckets, transactions, refreshAt, rules] = await Promise.all([
    getConnections(user.id),
    getAccounts(user.id, query),
    getBucketTotals(user.id, query),
    getRecentTransactions(user.id, query, RECENT_DAYS),
    manualRefreshAvailableAt(user.id),
    connectionAlertRules(user.id),
  ]);

  const balance = summarizeBalances(accounts);
  const composition = composeBalance({ grossCents: balance.cashCents, ...buckets });
  const cashAccounts = accounts.filter((account) => account.type === "CHECKING" || account.type === "SAVINGS");
  const cards = accounts.filter((account) => account.type === "CREDIT");
  const issues = connections.flatMap((connection) => connectionIssues(connection, rules.consent?.daysBefore ?? null));
  const freshest = connections.reduce<Date | null>(
    (latest, connection) => (connection.lastSyncAt && (!latest || connection.lastSyncAt > latest) ? connection.lastSyncAt : latest),
    null,
  );

  const isTransfer = (row: (typeof transactions)[number]) => row.transferPeerId !== null || row.category?.kind === "TRANSFERENCIA";
  const flows = summarizeFlows(transactions.map((row) => ({ amountCents: row.amountCents, isTransfer: isTransfer(row) })));
  const today = todayLocal();
  const groups = new Map<string, TransactionItemData[]>();
  for (const row of transactions) {
    const label = formatDayLabel(fromDbDate(row.date), today);
    const items = groups.get(label) ?? [];
    items.push({
      id: row.id,
      description: row.descriptionClean,
      meta: isTransfer(row) ? `${row.account.name} · transferência entre contas` : row.account.name,
      amountCents: row.amountCents,
      kind: isTransfer(row) ? "transfer" : row.amountCents > 0 ? "in" : "out",
      scope: row.scope,
      pending: row.status === "PENDING",
      installment: row.installmentTotal && row.installmentCurrent ? `${row.installmentCurrent}/${row.installmentTotal}` : undefined,
    });
    groups.set(label, items);
  }

  const connectLink = (
    <Link href="/config" className="inline-flex min-h-11 items-center text-[15px] text-accent">
      Conectar banco
    </Link>
  );
  const scopeName = query.consolidated ? null : query.scope;
  const heroStatus = connections.length === 0 || cashAccounts.length === 0 ? "empty" : "ready";

  return (
    <main className={PAGE_CLASS}>
      <PageHeader
        title="Hoje"
        trailing={connections.length > 0 ? <RefreshButton blockedUntilLabel={refreshAt ? formatMoment(refreshAt) : null} /> : null}
      />

      {connections.length > 0 ? <ScopeFilter value={scopeValue} /> : null}

      {!isPluggyConfigured() && connections.length > 0 ? (
        <AlertBanner severity="warning" title="Pluggy sem credenciais" body="Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no Railway para voltar a sincronizar." />
      ) : null}
      {issues.length > 0 ? (
        <div className="flex flex-col gap-3">
          {issues.map((issue) => (
            <AlertBanner key={`${issue.connectionId}:${issue.title}`} severity={issue.severity} title={issue.title} body={issue.body} href="/config" />
          ))}
        </div>
      ) : null}

      <BalanceHero
        amountCents={composition.availableCents}
        scope={scopeValue}
        status={heroStatus}
        caption={freshest ? `Dados do banco ${formatElapsed(freshest)}` : undefined}
        emptyTitle={connections.length === 0 ? "Nenhuma conta conectada." : `Nenhuma conta${scopeName ? ` ${scopeName}` : ""} com saldo.`}
        emptyDescription={
          connections.length === 0
            ? "Conecte um banco pelo Open Finance para ver o saldo aqui."
            : "As contas aparecem depois da primeira leitura da Pluggy."
        }
        emptyAction={connections.length === 0 ? connectLink : undefined}
        composition={
          <BalanceComposition
            segments={[
              { key: "disponivel", label: "Disponível", cents: composition.availableCents },
              { key: "reservado", label: "Reservado", cents: composition.reservedCents },
              { key: "negocio", label: "Caixa do negócio", cents: composition.businessCashCents },
            ]}
            total={{ label: "Saldo nas contas", cents: composition.grossCents }}
          />
        }
      />

      {cashAccounts.length > 0 || cards.length > 0 ? (
        <section aria-labelledby="contas" className="flex flex-col gap-1">
          <Eyebrow as="h2" id="contas" className="pb-1">
            Contas
          </Eyebrow>
          <ul className="m-0 flex list-none flex-col p-0">
            {cashAccounts.map((account) => (
              <li key={account.id}>
                <RowLink className="min-h-[60px] py-2">
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="flex items-center gap-2 text-[15px] font-medium">
                      <span className="truncate">{account.name}</span>
                      <ScopeTag scope={account.scope} />
                    </span>
                    <span className="truncate text-[13px] text-text-secondary">
                      {[account.connection?.institutionName, ACCOUNT_KIND[account.type]].filter(Boolean).join(" · ")}
                      {account.currency !== "BRL" ? ` · ${account.currency}, fora do total` : ""}
                    </span>
                  </span>
                  <Money cents={account.balanceCents} className={account.balanceCents < 0 ? "text-[17px] text-negative" : "text-[17px]"} />
                </RowLink>
              </li>
            ))}
          </ul>
          {cards.length > 0 ? (
            <StatRow
              label={cards.length === 1 ? "Cartão de crédito" : `Cartões de crédito (${cards.length})`}
              valueCents={balance.creditUsedCents}
              hint="Limite usado, inclui parcelas futuras. Não sai do disponível."
            />
          ) : null}
        </section>
      ) : null}

      {connections.length > 0 ? (
        <section aria-labelledby="recentes" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Eyebrow as="h2" id="recentes" className="pb-1">
              Últimos {RECENT_DAYS} dias
            </Eyebrow>
            <StatRow label="Entradas" valueCents={flows.inCents} />
            <StatRow
              label="Saídas"
              valueCents={flows.outCents}
              hint={
                flows.transferCount > 0
                  ? `Sem transferências entre suas contas nem pagamento de fatura (${flows.transferCount} ${flows.transferCount === 1 ? "lançamento" : "lançamentos"})`
                  : undefined
              }
            />
          </div>
          {transactions.length === 0 ? (
            <EmptyState compact title="Nenhuma transação no período." />
          ) : (
            <TransactionList groups={[...groups].map(([label, items]) => ({ label, items }))} />
          )}
        </section>
      ) : null}
    </main>
  );
}
