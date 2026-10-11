import Link from "next/link";
import { AlertBanner } from "@/components/ui/alert-banner";
import { BalanceComposition, BalanceHero } from "@/components/ui/balance-hero";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon, isIconName } from "@/components/ui/icon";
import { InsightList } from "@/components/ui/insight-list";
import { Money } from "@/components/ui/money";
import { MoneyWaffle } from "@/components/ui/money-waffle";
import { MonthScore } from "@/components/ui/month-score";
import { Section } from "@/components/ui/section";
import { SpendCard } from "@/components/ui/spend-card";
import type { ScopeFilter as ScopeValue } from "@/components/ui/status";
import { Eyebrow } from "@/components/ui/text";
import { TransactionList } from "@/components/ui/transaction-item";
import { getAlerts } from "@/lib/alerts/queries";
import { requireUser } from "@/lib/auth/dal";
import { formatElapsed, formatMoment, formatMonthLabel, todayLocal } from "@/lib/dates";
import { db } from "@/lib/db";
import { composeBalance, summarizeBalances } from "@/lib/finance/balance";
import { monthInsights, pickHighlight } from "@/lib/finance/insights";
import { perHundred, savingsRateBps } from "@/lib/finance/month-flow";
import { monthAchievements, savingsStreak } from "@/lib/finance/month-score";
import { formatBps, shareBps } from "@/lib/finance/share";
import { isPluggyConfigured } from "@/lib/pluggy/client";
import { getAreaSpend, getHighlightCandidates } from "@/lib/queries/area-spend";
import { getMonthOverview } from "@/lib/queries/month-flow";
import { getAccounts, getBucketTotals, getConnections, getRecentTransactions } from "@/lib/queries/overview";
import { parseScopeParam } from "@/lib/queries/scope";
import { getMonthCategoryBreakdown } from "@/lib/queries/transactions";
import { countReviewQueue } from "@/lib/rules/queue";
import { categoryOverThresholdBps, connectionAlertRules } from "@/lib/sync/alerts";
import { manualRefreshAvailableAt } from "@/lib/sync/sync";
import { AlertList } from "./alertas/alert-list";
import { connectionIssues } from "./connection-health";
import { PAGE_CLASS, PageHeader } from "./page-header";
import { RefreshButton } from "./refresh-button";
import { ScopeFilter } from "./scope-filter";
import { groupByDay, isTransferRow, toTransactionItem } from "./transaction-groups";

const RECENT_DAYS = 30;
const RECENT_ITEMS = 5;
const HOME_ALERTS = 3;
const TOP_AREAS = 5;

export default async function TodayPage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const query = parseScopeParam((await searchParams).escopo);
  const scopeValue: ScopeValue = query.consolidated ? "TUDO" : query.scope;
  const today = todayLocal();
  const month = today.slice(0, 7);

  const [connections, accounts, buckets, recent, refreshAt, rules, alerts, overview, breakdown, overBps, reviewCount, settings, candidates] = await Promise.all([
    getConnections(user.id),
    getAccounts(user.id, query),
    getBucketTotals(user.id, query),
    getRecentTransactions(user.id, query, RECENT_DAYS, RECENT_ITEMS),
    manualRefreshAvailableAt(user.id),
    connectionAlertRules(user.id),
    getAlerts(user.id, { unreadOnly: true, limit: 50 }),
    getMonthOverview(user.id, query, today),
    getMonthCategoryBreakdown(user.id, query, month),
    categoryOverThresholdBps(user.id),
    countReviewQueue(user.id),
    db().user.findUniqueOrThrow({ where: { id: user.id }, select: { savingsTargetBps: true } }),
    getHighlightCandidates(user.id, query, today),
  ]);
  // Manchete do mês: o gasto de estilo de vida que mais cresceu além do limite "acima da média" do usuário.
  const highlight = pickHighlight(candidates, overBps === null ? null : overBps - 10_000);
  const highlightSpend = highlight ? await getAreaSpend(user.id, query, highlight.id, month, today) : null;
  // Erro de conexão e consentimento já aparecem como aviso no topo, com o estado de agora.
  const unreadAlerts = alerts.filter((alert) => alert.type !== "CONEXAO_ERRO" && alert.type !== "CONSENTIMENTO_EXPIRANDO");

  const balance = summarizeBalances(accounts);
  const composition = composeBalance({ grossCents: balance.grossCents, savedCents: balance.savedCents, ...buckets });
  const hasCash = accounts.some((account) => account.type === "CHECKING" || account.type === "SAVINGS");
  const issues = connections.flatMap((connection) => connectionIssues(connection, rules.consent?.daysBefore ?? null));
  const freshest = connections.reduce<Date | null>(
    (latest, connection) => (connection.lastSyncAt && (!latest || connection.lastSyncAt > latest) ? connection.lastSyncAt : latest),
    null,
  );

  const { flow } = overview;
  const hundred = perHundred(flow);
  const areas = breakdown.filter((row) => row.id !== "sem");
  const overAverage = (ratio: number | null) => overBps !== null && ratio !== null && ratio >= overBps;
  const namesOf = (kind: "ESSENCIAL" | "VARIAVEL") =>
    areas
      .filter((row) => row.kind === kind)
      .slice(0, 3)
      .map((row) => row.name)
      .join(", ");
  const insights = monthInsights({
    flow,
    areas: areas.map((row) => ({ name: row.name, cents: row.cents, ratioBps: row.averageRatioBps })),
    overThresholdBps: overBps,
    lastMonthToDateCents: overview.lastMonthToDateCents,
    dayOfMonth: Number(today.slice(8, 10)),
  });
  const hasHistory = areas.some((row) => row.averageRatioBps !== null);
  const achievements = monthAchievements({
    flow,
    targetBps: settings.savingsTargetBps,
    reviewCount,
    lastMonthToDateCents: overview.lastMonthToDateCents,
    overAverageAreas: overBps !== null && hasHistory ? areas.filter((row) => overAverage(row.averageRatioBps)).length : null,
  });
  const topAreas = breakdown.slice(0, TOP_AREAS);
  const largestArea = topAreas[0]?.cents ?? 0;

  const groups = groupByDay(recent, today, (row) =>
    toTransactionItem(row, isTransferRow(row) ? `${row.account.name} · transferência entre contas` : row.account.name, `/transacoes/${row.id}`),
  );
  const connectLink = (
    <Link href="/config" className="inline-flex min-h-11 items-center text-[15px] text-accent">
      Conectar banco
    </Link>
  );
  const scopeName = query.consolidated ? null : query.scope;
  const monthName = formatMonthLabel(month).split(" ")[0] ?? "";

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
        status={connections.length === 0 || !hasCash ? "empty" : "ready"}
        caption={freshest ? `Dados do banco ${formatElapsed(freshest)}` : undefined}
        emptyTitle={connections.length === 0 ? "Nenhuma conta conectada." : `Nenhuma conta${scopeName ? ` ${scopeName}` : ""} com saldo.`}
        emptyDescription={
          connections.length === 0 ? "Conecte um banco pelo Open Finance para ver o saldo aqui." : "As contas aparecem depois da primeira leitura da Pluggy."
        }
        emptyAction={connections.length === 0 ? connectLink : undefined}
        composition={
          <BalanceComposition
            segments={[
              { key: "disponivel", label: "Disponível", cents: composition.availableCents },
              ...(composition.savedCents > 0 ? [{ key: "guardado" as const, label: "Caixinhas", cents: composition.savedCents, href: "/contas" }] : []),
              { key: "reservado", label: "Reservado", cents: composition.reservedCents, href: "/reservas" },
              { key: "negocio", label: "Caixa do negócio", cents: composition.businessCashCents, href: "/negocio" },
            ]}
            total={{ label: "Saldo nas contas", cents: composition.grossCents, href: "/contas" }}
          />
        }
      />

      {connections.length > 0 ? (
        <div className="flex flex-col gap-16 pt-4 pb-4">
          {highlight && highlightSpend ? (
            <section aria-labelledby="destaque" className="flex flex-col gap-6">
              <header className="flex flex-col gap-3">
                <Eyebrow as="p">Destaque do mês</Eyebrow>
                <h2 id="destaque" className="m-0 text-[34px] font-light leading-10 tracking-[-0.03em]">
                  <Money cents={highlight.cents} hideZeroCents className="font-normal" /> em {highlight.name} neste mês.
                </h2>
                <p className={`m-0 text-[15px] leading-[21px] ${highlight.reason === "cresceu" ? "text-warning" : "text-text-secondary"}`}>
                  {highlight.reason === "cresceu" && highlight.variationBps !== null
                    ? `${formatBps(highlight.variationBps)} a mais que no mesmo ponto do mês passado.`
                    : "Seu maior gasto de estilo de vida até agora."}
                </p>
              </header>
              <SpendCard
                icon={highlightSpend.icon}
                title={`Gastos com ${highlight.name} neste mês`}
                cents={highlightSpend.totalCents}
                variationBps={highlight.variationBps}
                current={highlightSpend.current}
                previous={highlightSpend.previous}
                daysInMonth={highlightSpend.daysInMonth}
                href={`/transacoes/categorias/${highlight.id}`}
              />
            </section>
          ) : null}

          <Section id="para-onde" eyebrow={`${monthName} até hoje`} title="Para onde foi seu dinheiro">
            {hundred ? (
              <>
                <dl className="m-0 grid grid-cols-2 gap-6">
                  <div className="flex flex-col gap-1">
                    <dt className="text-[13px] text-text-secondary">Entrou</dt>
                    <dd className="m-0">
                      <Money cents={flow.incomeCents} kind={flow.incomeCents > 0 ? "in" : "neutral"} className="text-[22px] font-light tracking-[-0.01em]" />
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-[13px] text-text-secondary">Saiu</dt>
                    <dd className="m-0">
                      <Money cents={flow.spentCents + flow.investedCents} className="text-[22px] font-light tracking-[-0.01em]" />
                    </dd>
                  </div>
                </dl>
                <MoneyWaffle
                  data={hundred}
                  legend={{
                    essencial: { hint: namesOf("ESSENCIAL") || undefined, href: "/transacoes/categorias" },
                    estilo: { hint: namesOf("VARIAVEL") || undefined, href: "/transacoes/categorias" },
                    sem: { hint: "toque para dizer o que foi", href: "/transacoes/revisar" },
                  }}
                />
                <InsightList insights={insights} links={{ sem: { href: "/transacoes/revisar", label: "Revisar" } }} />
              </>
            ) : (
              <EmptyState compact title="Nada entrou nem saiu neste mês ainda." description="Transferências entre suas contas e pagamento de fatura não contam." />
            )}
          </Section>

          {topAreas.length > 0 ? (
            <Section id="areas" eyebrow="Gastos por área" title="Onde mais saiu">
              <ul className="m-0 flex list-none flex-col gap-5 p-0">
                {topAreas.map((row) => {
                  const over = overAverage(row.averageRatioBps);
                  return (
                    <li key={row.id}>
                      <Link
                        href={row.id === "sem" ? "/transacoes/revisar" : `/transacoes/categorias/${row.id}`}
                        className="flex min-h-11 flex-col gap-2 text-text-primary no-underline transition-opacity duration-200 ease-apple active:opacity-60"
                      >
                        <span className="flex items-center gap-3">
                          <Icon name={isIconName(row.icon) ? row.icon : "dots"} size={20} className={over ? "shrink-0 text-warning" : "shrink-0 text-text-secondary"} />
                          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                            <span className="text-[16px] font-medium">{row.name}</span>
                            <span className="text-[13px] text-text-secondary">{formatBps(shareBps(row.cents, flow.spentCents))}</span>
                            {over && row.averageRatioBps !== null ? (
                              <span className="text-[13px] text-warning">{formatBps(row.averageRatioBps - 10_000)} acima da média</span>
                            ) : null}
                          </span>
                          <Money cents={row.cents} className="shrink-0 text-[16px]" />
                        </span>
                        <span aria-hidden="true" className="ml-8 h-1.5 rounded-full bg-text-primary/8">
                          <span
                            className={`block h-full rounded-full ${over ? "bg-warning" : "bg-text-primary/40"}`}
                            style={{ width: `${Math.max(2, shareBps(row.cents, largestArea) / 100)}%` }}
                          />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <Link href="/transacoes/categorias" className="flex min-h-11 items-center self-start text-[15px] text-accent">
                Ver todas as áreas
              </Link>
            </Section>
          ) : null}

          <Section id="placar" eyebrow="Placar" title="Seu mês">
            <MonthScore
              savingsBps={savingsRateBps(flow)}
              targetBps={settings.savingsTargetBps}
              streak={savingsStreak(overview.closedMonths, settings.savingsTargetBps)}
              achievements={achievements}
              settingsHref="/config#placar"
            />
          </Section>

          {unreadAlerts.length > 0 ? (
            <Section id="alertas" eyebrow="Alertas" title={unreadAlerts.length === 1 ? "1 coisa para olhar" : `${unreadAlerts.length} coisas para olhar`}>
              <AlertList
                alerts={unreadAlerts.slice(0, HOME_ALERTS).map((alert) => ({
                  id: alert.id,
                  severity: alert.severity,
                  title: alert.title,
                  body: alert.body,
                  when: formatMoment(alert.createdAt),
                  read: false,
                  href: alert.href,
                }))}
              />
              <Link href="/alertas" className="flex min-h-11 items-center self-start text-[15px] text-accent no-underline">
                {unreadAlerts.length > HOME_ALERTS ? `Ver todos (${unreadAlerts.length})` : "Central de alertas"}
              </Link>
            </Section>
          ) : null}

          <Section id="recentes" eyebrow="Movimento" title="Últimas transações">
            {recent.length === 0 ? <EmptyState compact title={`Nenhuma transação nos últimos ${RECENT_DAYS} dias.`} /> : <TransactionList groups={groups} />}
            <Link href="/transacoes" className="flex min-h-11 items-center self-start text-[15px] text-accent no-underline">
              Ver todas as transações
            </Link>
          </Section>
        </div>
      ) : null}
    </main>
  );
}
