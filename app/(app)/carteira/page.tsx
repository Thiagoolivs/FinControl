import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { HeroAmount, Money } from "@/components/ui/money";
import type { ScopeFilter as ScopeValue } from "@/components/ui/status";
import { Eyebrow } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/dal";
import { formatDayLabel, formatMoment, todayLocal } from "@/lib/dates";
import { MARKET_PRICED } from "@/lib/finance/portfolio";
import { formatBps } from "@/lib/finance/share";
import { isBrapiConfigured } from "@/lib/market/brapi";
import { getPeriodReturn, getPortfolio, type Period, PERIODS, recordPortfolioSnapshot } from "@/lib/portfolio/queries";
import { parseScopeParam } from "@/lib/queries/scope";
import { PAGE_CLASS, PageHeader } from "../page-header";
import { ScopeFilter } from "../scope-filter";
import { AddHoldingForm, ManualHoldingControls, TargetsForm } from "./controls";
import { CLASS_LABEL } from "./labels";

const PERIOD_LABEL: Record<Period, string> = { "1m": "1 mês", "3m": "3 meses", "12m": "12 meses" };
// A partir de 5 p.p. de desvio, o número ganha a cor de atenção.
const DEVIATION_ATTENTION_BPS = 500;

const signedBps = (bps: number) => `${bps > 0 ? "+" : bps < 0 ? "−" : ""}${formatBps(Math.abs(bps), 2)}`;
// Uma casa decimal arredondada em inteiros (bps / 10): atual − alvo bate com o desvio mostrado.
const tenths = (bps: number) => {
  const value = Math.round(bps / 10);
  return `${Math.trunc(Math.abs(value) / 10)},${Math.abs(value) % 10}`;
};
const percent1 = (bps: number) => `${tenths(bps)}%`;
const points = (bps: number) => {
  const value = Math.round(bps / 10);
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${tenths(bps)} p.p.`;
};

export default async function WalletPage({ searchParams }: PageProps<"/carteira">) {
  const user = await requireUser();
  const params = await searchParams;
  const query = parseScopeParam(params.escopo);
  const scopeValue: ScopeValue = query.consolidated ? "TUDO" : query.scope;
  const period: Period = typeof params.periodo === "string" && params.periodo in PERIODS ? (params.periodo as Period) : "12m";
  await recordPortfolioSnapshot(user.id);
  const [portfolio, periodReturn] = await Promise.all([
    getPortfolio(user.id, query),
    query.consolidated ? getPeriodReturn(user.id, period) : Promise.resolve(null),
  ]);
  const today = todayLocal();
  const result = portfolio.totalCents - portfolio.costCents;
  const hasTargets = Object.values(portfolio.targets).some((bps) => (bps ?? 0) > 0);
  const periodHref = (key: Period) => `/carteira?${new URLSearchParams({ ...(params.escopo ? { escopo: String(params.escopo) } : {}), periodo: key })}`;

  return (
    <main className={PAGE_CLASS}>
      <PageHeader title="Carteira" />
      <ScopeFilter value={scopeValue} />

      <section className="flex flex-col gap-2">
        <Eyebrow as="h2">Investido</Eyebrow>
        <HeroAmount cents={portfolio.totalCents} />
        {portfolio.holdings.length > 0 ? (
          <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
            Custo <Money cents={portfolio.costCents} /> · resultado <Money cents={result} kind={result > 0 ? "in" : "out"} />
            {portfolio.costCents > 0 ? ` (${signedBps(Math.round((result * 10_000) / portfolio.costCents))})` : ""}
          </p>
        ) : null}
      </section>

      {query.consolidated && portfolio.holdings.length > 0 ? (
        <section aria-labelledby="rentabilidade" className="flex flex-col gap-3">
          <Eyebrow as="h2" id="rentabilidade">
            Rentabilidade × CDI
          </Eyebrow>
          <nav aria-label="Período" className="flex gap-6">
            {(Object.keys(PERIODS) as Period[]).map((key) => (
              <Link
                key={key}
                href={periodHref(key)}
                aria-current={period === key ? "page" : undefined}
                className={cn("flex min-h-11 flex-col items-start justify-center gap-1 text-[15px] no-underline", period === key ? "font-semibold text-text-primary" : "text-text-secondary")}
              >
                {PERIOD_LABEL[key]}
                <span aria-hidden="true" className={cn("size-1 rounded-full", period === key ? "bg-text-primary" : "bg-transparent")} />
              </Link>
            ))}
          </nav>
          {periodReturn && periodReturn.portfolioBps !== null ? (
            <>
              <div className="flex gap-8">
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] text-text-secondary">Carteira</span>
                  <span className={cn("text-[28px] font-light tabular-nums", periodReturn.portfolioBps < 0 && "text-negative")}>{signedBps(periodReturn.portfolioBps)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] text-text-secondary">CDI</span>
                  <span className="text-[28px] font-light tabular-nums text-text-secondary">{signedBps(periodReturn.cdiBps)}</span>
                </div>
              </div>
              <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
                De {formatDayLabel(periodReturn.from, today).toLowerCase()} até {formatDayLabel(periodReturn.to, today).toLowerCase()}, descontando aportes e
                resgates. {periodReturn.cdiDays === 0 ? "Sem CDI publicado no período ainda." : `CDI acumulado em ${periodReturn.cdiDays} dias úteis.`}
              </p>
            </>
          ) : (
            <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
              O app guarda uma foto da carteira por dia; a comparação com o CDI aparece a partir da segunda foto.
            </p>
          )}
        </section>
      ) : null}

      {portfolio.holdings.length > 0 || hasTargets ? (
        <section aria-labelledby="alocacao" className="flex flex-col gap-4">
          <Eyebrow as="h2" id="alocacao">
            Alocação {hasTargets ? "× alvo" : ""}
          </Eyebrow>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {portfolio.rows.map((row) => (
              <li key={row.assetClass} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-3">
                  <span className="flex-1 text-[15px] font-medium">{CLASS_LABEL[row.assetClass]}</span>
                  <Money cents={row.valueCents} className="text-[15px]" />
                </div>
                <div className="relative h-2 rounded-full bg-surface-elevated" aria-hidden="true">
                  <div className="h-2 rounded-full bg-text-secondary" style={{ width: `${row.currentBps / 100}%` }} />
                  {hasTargets ? <div className="absolute -top-1 h-4 w-0.5 rounded-full bg-text-primary" style={{ left: `calc(${row.targetBps / 100}% - 1px)` }} /> : null}
                </div>
                <p className="m-0 text-[13px] text-text-secondary">
                  {percent1(row.currentBps)}
                  {hasTargets ? (
                    <>
                      {" "}
                      · alvo {percent1(row.targetBps)} ·{" "}
                      <span className={cn(Math.abs(row.deviationBps) >= DEVIATION_ATTENTION_BPS && "text-warning")}>
                        {points(row.deviationBps)} (<Money cents={Math.abs(row.deviationCents)} /> {row.deviationCents >= 0 ? "acima" : "abaixo"})
                      </span>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
            {hasTargets
              ? "Quer rebalancear? A decisão é sua: o FinControl mostra só o desvio da sua própria alocação-alvo e nunca recomenda compra ou venda de ativo."
              : "Defina uma alocação-alvo para ver o desvio de cada classe. O FinControl nunca recomenda compra ou venda de ativo."}
          </p>
          <details className="flex flex-col gap-3">
            <summary className="flex min-h-11 cursor-pointer list-none items-center text-[16px] font-medium text-accent">
              {hasTargets ? "Mudar alocação-alvo" : "Definir alocação-alvo"}
            </summary>
            <TargetsForm targets={portfolio.targets} />
          </details>
        </section>
      ) : null}

      <section aria-labelledby="posicoes" className="flex flex-col gap-2">
        <Eyebrow as="h2" id="posicoes">
          Posições
        </Eyebrow>
        {portfolio.holdings.length === 0 ? (
          <EmptyState compact title="Nenhum investimento ainda." description="Os da Pluggy aparecem depois da próxima leitura do banco. Ou adicione à mão abaixo." />
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {portfolio.holdings.map((holding) => {
              const quoted = MARKET_PRICED.includes(holding.assetClass);
              const resultBps = holding.costCents > 0 ? Math.round((holding.resultCents * 10_000) / holding.costCents) : null;
              const details = [
                CLASS_LABEL[holding.assetClass],
                quoted ? `${holding.quantity.replace(".", ",")} ${holding.assetClass === "CRIPTO" ? "un." : "cotas"}` : holding.indexer,
                holding.maturityDate ? `vence ${formatDayLabel(holding.maturityDate, today).toLowerCase()}` : null,
                holding.origin === "MANUAL" ? "manual" : holding.account,
              ].filter(Boolean);
              return (
                <li key={holding.id} className="flex flex-col gap-1 py-3">
                  <div className="flex items-start gap-3">
                    <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                      <span className="truncate text-[15px] font-[450]">
                        {holding.ticker && holding.ticker !== holding.name ? `${holding.ticker} · ${holding.name}` : holding.name}
                      </span>
                      <span className="text-[13px] text-text-secondary">{details.join(" · ")}</span>
                      {quoted ? (
                        <span className="text-[13px] text-text-secondary">
                          {holding.quote ? (
                            <>
                              <Money cents={holding.quote.priceCents} /> ({signedBps(holding.quote.changeBps)} no dia)
                            </>
                          ) : (
                            "Sem cotação ainda: usando o valor do banco ou o custo."
                          )}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex flex-col items-end gap-[3px]">
                      <Money cents={holding.valueCents} className="text-[15px]" />
                      <span className="text-[13px]">
                        <Money cents={holding.resultCents} kind={holding.resultCents > 0 ? "in" : "out"} />
                        {resultBps !== null ? <span className="text-text-secondary"> {signedBps(resultBps)}</span> : null}
                      </span>
                    </span>
                  </div>
                  {holding.origin === "MANUAL" ? (
                    <ManualHoldingControls id={holding.id} quantity={holding.quantity} costCents={holding.costCents} valueCents={holding.valueCents} quoted={quoted} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <details className="mt-2 flex flex-col gap-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-[16px] font-medium text-accent">Adicionar posição manual</summary>
          <AddHoldingForm />
        </details>
      </section>

      <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
        Quantidade e custo vêm da Pluggy (ou do que você lançou). Cotações da brapi.dev, uma vez por dia
        {portfolio.quotesAt ? `; as mais antigas são de ${formatMoment(portfolio.quotesAt)}` : ""}. CDI do Banco Central (SGS).
        {isBrapiConfigured() ? "" : " Sem BRAPI_TOKEN no Railway, ação, FII e cripto ficam com o valor do banco ou o custo."}
      </p>
    </main>
  );
}
