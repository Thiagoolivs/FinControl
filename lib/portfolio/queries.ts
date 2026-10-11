import "server-only";
import type { AssetClass } from "@/generated/prisma/enums";
import { addMonths, fromDbDate, monthRange, todayLocal, toDbDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { accumulatedRateBps, type AllocationRow, allocation, holdingValueCents, periodReturnBps } from "@/lib/finance/portfolio";
import { type ScopeQuery, scopeWhere } from "@/lib/queries/scope";
import { quoteKey } from "@/lib/market/refresh";

export type HoldingView = {
  id: string;
  name: string;
  ticker: string | null;
  assetClass: AssetClass;
  origin: "PLUGGY" | "MANUAL";
  quantity: string;
  costCents: number;
  valueCents: number;
  resultCents: number;
  quote: { priceCents: number; changeBps: number; fetchedAt: Date } | null;
  maturityDate: string | null;
  indexer: string | null;
  account: string;
};

/** Posições do escopo com o valor de hoje (cotação da brapi para ação/FII/cripto; Pluggy para o resto). */
export async function getHoldings(userId: string, query: ScopeQuery): Promise<HoldingView[]> {
  const rows = await db().holding.findMany({
    where: { userId, account: scopeWhere(query) },
    select: {
      id: true,
      name: true,
      ticker: true,
      assetClass: true,
      origin: true,
      quantity: true,
      costCents: true,
      currentValueCents: true,
      maturityDate: true,
      indexer: true,
      account: { select: { name: true } },
    },
    orderBy: [{ assetClass: "asc" }, { name: "asc" }],
  });
  const keys = rows.flatMap((row) => (row.ticker ? [quoteKey(row.assetClass, row.ticker)] : []));
  const quotes = new Map((await db().quote.findMany({ where: { ticker: { in: keys } } })).map((quote) => [quote.ticker, quote]));
  return rows.map((row) => {
    const quote = row.ticker ? (quotes.get(quoteKey(row.assetClass, row.ticker)) ?? null) : null;
    const quantity = row.quantity.toFixed();
    const valueCents = holdingValueCents({ ...row, quantity }, quote?.priceCents ?? null);
    return {
      id: row.id,
      name: row.name,
      ticker: row.ticker,
      assetClass: row.assetClass,
      origin: row.origin,
      quantity,
      costCents: row.costCents,
      valueCents,
      resultCents: valueCents - row.costCents,
      quote: quote ? { priceCents: quote.priceCents, changeBps: quote.changeBps, fetchedAt: quote.fetchedAt } : null,
      maturityDate: row.maturityDate ? fromDbDate(row.maturityDate) : null,
      indexer: row.indexer,
      account: row.account.name,
    };
  });
}

export async function getTargets(userId: string): Promise<Partial<Record<AssetClass, number>>> {
  const rows = await db().allocationTarget.findMany({ where: { userId }, select: { assetClass: true, targetBps: true } });
  return Object.fromEntries(rows.map((row) => [row.assetClass, row.targetBps]));
}

/** Grava (ou refaz) a foto de hoje da carteira inteira do usuário. Base da rentabilidade no período. */
export async function recordPortfolioSnapshot(userId: string, today: string = todayLocal()): Promise<void> {
  const holdings = await getHoldings(userId, { consolidated: true });
  if (holdings.length === 0) return;
  const valueCents = holdings.reduce((sum, holding) => sum + holding.valueCents, 0);
  const costCents = holdings.reduce((sum, holding) => sum + holding.costCents, 0);
  await db().portfolioSnapshot.upsert({
    where: { userId_date: { userId, date: toDbDate(today) } },
    create: { userId, date: toDbDate(today), valueCents, costCents },
    update: { valueCents, costCents },
  });
}

export const PERIODS = { "1m": 1, "3m": 3, "12m": 12 } as const;
export type Period = keyof typeof PERIODS;

export type PeriodReturn = { from: string; to: string; portfolioBps: number | null; cdiBps: number; cdiDays: number };

/**
 * Rentabilidade da carteira (consolidada) no período contra o CDI acumulado nos mesmos dias. Começa na
 * foto mais antiga dentro do período; sem duas fotos, ainda não há o que comparar.
 */
export async function getPeriodReturn(userId: string, period: Period, today: string = todayLocal()): Promise<PeriodReturn | null> {
  const month = addMonths(today.slice(0, 7), -PERIODS[period]);
  const sameDay = `${month}${today.slice(7)}`;
  const since = sameDay > monthRange(month).to ? monthRange(month).to : sameDay;
  const [start, end] = await Promise.all([
    db().portfolioSnapshot.findFirst({ where: { userId, date: { gte: toDbDate(since) } }, orderBy: { date: "asc" } }),
    db().portfolioSnapshot.findFirst({ where: { userId, date: { lte: toDbDate(today) } }, orderBy: { date: "desc" } }),
  ]);
  if (!start || !end || start.date.getTime() >= end.date.getTime()) return null;
  const rates = await db().benchmarkRate.findMany({
    where: { series: "CDI", date: { gt: start.date, lte: end.date } },
    select: { value: true },
    orderBy: { date: "asc" },
  });
  return {
    from: fromDbDate(start.date),
    to: fromDbDate(end.date),
    portfolioBps: periodReturnBps(start, end),
    cdiBps: accumulatedRateBps(rates.map((rate) => rate.value.toFixed())),
    cdiDays: rates.length,
  };
}

export type PortfolioView = {
  holdings: HoldingView[];
  totalCents: number;
  costCents: number;
  rows: AllocationRow[];
  targets: Partial<Record<AssetClass, number>>;
  quotesAt: Date | null;
};

export async function getPortfolio(userId: string, query: ScopeQuery): Promise<PortfolioView> {
  const [holdings, targets] = await Promise.all([getHoldings(userId, query), getTargets(userId)]);
  const { totalCents, rows } = allocation(holdings, targets);
  const quoteDates = holdings.flatMap((holding) => (holding.quote ? [holding.quote.fetchedAt.getTime()] : []));
  return {
    holdings,
    totalCents,
    costCents: holdings.reduce((sum, holding) => sum + holding.costCents, 0),
    rows,
    targets,
    quotesAt: quoteDates.length > 0 ? new Date(Math.min(...quoteDates)) : null,
  };
}
