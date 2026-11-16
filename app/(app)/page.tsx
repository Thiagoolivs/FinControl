import Link from "next/link";
import { AlertBanner } from "@/components/ui/alert-banner";
import { BalanceComposition, BalanceHero } from "@/components/ui/balance-hero";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon, isIconName } from "@/components/ui/icon";
import { InsightList } from "@/components/ui/insight-list";
import { Money } from "@/components/ui/money";
import { MonthSummary } from "@/components/ui/month-summary";
import { Section } from "@/components/ui/section";
import type { ScopeFilter as ScopeValue } from "@/components/ui/status";
import { getAlerts } from "@/lib/alerts/queries";
import { requireUser } from "@/lib/auth/dal";
import { formatElapsed, formatMoment, formatMonthLabel, todayLocal } from "@/lib/dates";
import { summarizeBalances } from "@/lib/finance/balance";
import { monthInsights, pickHighlight } from "@/lib/finance/insights";
import { shareBps } from "@/lib/finance/share";
import { isPluggyConfigured } from "@/lib/pluggy/client";
import { getHighlightCandidates } from "@/lib/queries/area-spend";
import { getMonthOverview } from "@/lib/queries/month-flow";
import { getAccounts, getConnections } from "@/lib/queries/overview";
import { parseScopeParam } from "@/lib/queries/scope";
import { getMonthCategoryBreakdown } from "@/lib/queries/transactions";
import { countReviewQueue } from "@/lib/rules/queue";
import { categoryOverThresholdBps, connectionAlertRules } from "@/lib/sync/alerts";
import { getDuplicateConnections } from "@/lib/sync/connections";
import { manualRefreshAvailableAt } from "@/lib/sync/sync";
import { AlertList } from "./alertas/alert-list";
import { connectionIssues } from "./connection-health";
import { PAGE_CLASS, PageHeader } from "./page-header";
import { RefreshButton } from "./refresh-button";
import { ScopeFilter } from "./scope-filter";

const HOME_ALERTS = 3;
const TOP_AREAS = 5;

export default async function TodayPage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const query = parseScopeParam((await searchParams).escopo);
  const scopeValue: ScopeValue = query.consolidated ? "TUDO" : query.scope;
  const today = todayLocal();
  const month = today.slice(0, 7);

  const [connections, accounts, refreshAt, rules, alerts, overview, breakdown, overBps, reviewCount, candidates, duplicates] = await Promise.all([
    getConnections(user.id),
    getAccounts(user.id, query),
    manualRefreshAvailableAt(user.id),
    connectionAlertRules(user.id),
    getAlerts(user.id, { unreadOnly: true, limit: 50 }),
    getMonthOverview(user.id, query, today),
    getMonthCategoryBreakdown(user.id, query, month),
    categoryOverThresholdBps(user.id),
    countReviewQueue(user.id),
    getHighlightCandidates(user.id, query, today),
    getDuplicateConnections(user.id),
  ]);
  // O gasto de estilo de vida que mais cresceu além do limite "acima da média" do usuário vira uma frase em R$.
  const highlight = pickHighlight(candidates, overBps === null ? null : overBps - 10_000);
  const grown = highlight?.reason === "cresceu" && highlight.growthCents !== null && highlight.growthCents > 0 ? highlight : null;
  // Erro de conexão e consentimento já aparecem como aviso no topo, com o estado de agora.
  const unreadAlerts = alerts.filter((alert) => alert.type !== "CONEXAO_ERRO" && alert.type !== "CONSENTIMENTO_EXPIRANDO");

  const balance = summarizeBalances(accounts);
  const hasCash = accounts.some((account) => account.type === "CHECKING" || account.type === "SAVINGS");
  const issues = connections.flatMap((connection) => connectionIssues(connection, rules.consent?.daysBefore ?? null));
  // A legenda mostra a conexão mais desatualizada: uma conexão em dia não esconde outra parada há dias.
  const oldestRead = connections.reduce<Date | null>(
    (oldest, connection) => (connection.lastSyncAt && (!oldest || connection.lastSyncAt < oldest) ? connection.lastSyncAt : oldest),
    null,
  );

  const { flow } = overview;
  const outCents = flow.spentCents + flow.investedCents;
  const areas = breakdown.filter((row) => row.id !== "sem");
  const overAverage = (ratio: number | null) => overBps !== null && ratio !== null && ratio >= overBps;
  // Só a frase do ritmo (gastou a mais ou a menos que no mesmo ponto do mês passado): o resto já está na lista.
  const pace = monthInsights({
    flow,
    areas: areas.map((row) => ({ name: row.name, cents: row.cents, ratioBps: row.averageRatioBps })),
    overThresholdBps: overBps,
    lastMonthToDateCents: overview.lastMonthToDateCents,
    dayOfMonth: Number(today.slice(8, 10)),
  }).filter((insight) => insight.key === "ritmo");
  const topAreas = breakdown.slice(0, TOP_AREAS);
  const largestArea = topAreas[0]?.cents ?? 0;
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
      {duplicates.size > 0 ? (
        <AlertBanner
          severity="warning"
          title="Banco conectado duas vezes"
          body="As mesmas contas vêm de duas conexões: o saldo e os gastos estão contando em dobro. Remova a repetida em Config."
          href="/config"
        />
      ) : null}
      {issues.length > 0 ? (
        <div className="flex flex-col gap-3">
          {issues.map((issue) => (
            <AlertBanner key={`${issue.connectionId}:${issue.title}`} severity={issue.severity} title={issue.title} body={issue.body} href="/config" />
          ))}
        </div>
      ) : null}

      <BalanceHero
        amountCents={balance.grossCents}
        scope={scopeValue}
        status={connections.length === 0 || !hasCash ? "empty" : "ready"}
        caption={oldestRead ? `Dados do banco ${formatElapsed(oldestRead)}` : undefined}
        emptyTitle={connections.length === 0 ? "Nenhuma conta conectada." : `Nenhuma conta${scopeName ? ` ${scopeName}` : ""} com saldo.`}
        emptyDescription={
          connections.length === 0 ? "Conecte um banco pelo Open Finance para ver o saldo aqui." : "As contas aparecem depois da primeira leitura da Pluggy."
        }
        emptyAction={connections.length === 0 ? connectLink : undefined}
        composition={
          <BalanceComposition
            segments={[
              { key: "pessoal", label: "Pessoal", cents: balance.personalCents, href: "/contas" },
              { key: "guardado", label: "Guardado", cents: balance.savedCents, href: "/contas" },
              { key: "empresa", label: "Empresa", cents: balance.businessCents, href: "/contas" },
            ]}
            link={{ label: "Ver conta por conta", href: "/contas" }}
          />
        }
      />

      {connections.length > 0 ? (
        <div className="flex flex-col gap-16 pt-4 pb-4">
          <Section id="mes" eyebrow={`${monthName} até hoje`} title="Este mês">
            {flow.incomeCents > 0 || outCents > 0 ? (
              <>
                <MonthSummary
                  inCents={flow.incomeCents}
                  outCents={outCents}
                  investedCents={flow.investedCents}
                  leftoverCents={flow.leftoverCents}
                  overflowCents={flow.overflowCents}
                />
                <InsightList insights={pace} />
              </>
            ) : (
              <EmptyState compact title="Nada entrou nem saiu neste mês ainda." description="Transferências entre suas contas e pagamento de fatura não contam." />
            )}
          </Section>

          {topAreas.length > 0 ? (
            <Section id="areas" eyebrow="Gastos do mês" title="Para onde foi">
              {grown ? (
                <Link href={`/transacoes/categorias/${grown.id}`} className="flex min-h-11 items-start gap-3 text-text-primary no-underline">
                  <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-warning" />
                  <span className="text-[15px] leading-[22px]">
                    {grown.name}: <Money cents={grown.growthCents ?? 0} /> a mais que no mesmo ponto do mês passado.
                  </span>
                </Link>
              ) : null}
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
                            <span className={`text-[16px] ${row.id === "sem" ? "text-text-secondary" : "font-medium"}`}>{row.name}</span>
                            {over ? <span className="text-[13px] text-warning">acima da média</span> : null}
                          </span>
                          <Money cents={row.cents} hideZeroCents className="shrink-0 text-[16px]" />
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
                Ver todos os gastos
              </Link>
            </Section>
          ) : null}

          <Section id="fazer" eyebrow="Pendências" title="Para fazer">
            {reviewCount > 0 ? (
              <div className="flex items-center gap-4 rounded-card bg-surface p-5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[17px] font-semibold tabular-nums text-accent">
                  {reviewCount > 99 ? "99+" : reviewCount}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="text-[16px]">Sem categoria</span>
                  <span className="text-[13px] text-text-secondary">{reviewCount === 1 ? "Diga o que foi esta transação." : "Diga o que foi cada transação."}</span>
                </span>
                <Link
                  href="/transacoes/revisar"
                  className="flex h-11 shrink-0 items-center rounded-button bg-accent-fill px-4 text-[15px] font-medium text-white no-underline"
                >
                  Classificar
                </Link>
              </div>
            ) : null}
            {unreadAlerts.length > 0 ? (
              <>
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
                  {unreadAlerts.length > HOME_ALERTS ? `Ver todos os alertas (${unreadAlerts.length})` : "Central de alertas"}
                </Link>
              </>
            ) : null}
            {reviewCount === 0 && unreadAlerts.length === 0 ? (
              <p className="m-0 flex items-center gap-3 text-[15px] text-text-secondary">
                <Icon name="check" size={18} className="shrink-0 text-positive" />
                Tudo em dia.
              </p>
            ) : null}
          </Section>
        </div>
      ) : null}
    </main>
  );
}
