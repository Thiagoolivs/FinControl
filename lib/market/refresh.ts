import "server-only";
import type { AssetClass, BenchmarkSeries } from "@/generated/prisma/enums";
import { addDays, fromDbDate, todayLocal, toDbDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { MARKET_PRICED } from "@/lib/finance/portfolio";
import { fetchCryptoQuote, fetchStockQuote, isBrapiConfigured } from "./brapi";
import { fetchSeries } from "./sgs";

export const QUOTE_TTL_MS = 12 * 60 * 60 * 1000;
const HISTORY_DAYS = 400;
const SERIES: BenchmarkSeries[] = ["CDI", "SELIC", "IPCA"];

/** Chave da cotação no cache global: cripto ganha prefixo para não colidir com ticker de ação. */
export function quoteKey(assetClass: AssetClass, ticker: string): string {
  return assetClass === "CRIPTO" ? `CRIPTO:${ticker}` : ticker;
}

/** Busca a cotação de um ativo se o cache estiver vencido. Uma requisição por ativo; nunca no render. */
export async function refreshQuote(assetClass: AssetClass, ticker: string, now: Date = new Date()): Promise<boolean> {
  if (!isBrapiConfigured() || !MARKET_PRICED.includes(assetClass)) return false;
  const key = quoteKey(assetClass, ticker);
  const cached = await db().quote.findUnique({ where: { ticker: key }, select: { fetchedAt: true } });
  if (cached && now.getTime() - cached.fetchedAt.getTime() < QUOTE_TTL_MS) return false;
  const data = assetClass === "CRIPTO" ? await fetchCryptoQuote(ticker) : await fetchStockQuote(ticker);
  await db().quote.upsert({ where: { ticker: key }, create: { ticker: key, ...data, fetchedAt: now }, update: { ...data, fetchedAt: now } });
  return true;
}

/** Cotações vencidas de todos os ativos com ticker (cache global, 12h). Roda no cron, uma vez por dia. */
export async function refreshQuotes(now: Date = new Date()): Promise<{ updated: number; failed: string[] }> {
  if (!isBrapiConfigured()) return { updated: 0, failed: [] };
  const holdings = await db().holding.findMany({
    where: { ticker: { not: null }, assetClass: { in: [...MARKET_PRICED] } },
    select: { ticker: true, assetClass: true },
    distinct: ["ticker", "assetClass"],
  });
  let updated = 0;
  const failed: string[] = [];
  for (const holding of holdings) {
    if (!holding.ticker) continue;
    try {
      if (await refreshQuote(holding.assetClass, holding.ticker, now)) updated += 1;
    } catch (error) {
      failed.push(`${holding.ticker}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { updated, failed };
}

/** CDI, Selic e IPCA do SGS, do último dia guardado até hoje (na primeira vez, ~13 meses). */
export async function refreshBenchmarks(today: string = todayLocal()): Promise<number> {
  let saved = 0;
  for (const series of SERIES) {
    const last = await db().benchmarkRate.findFirst({ where: { series }, orderBy: { date: "desc" }, select: { date: true } });
    const from = last ? addDays(fromDbDate(last.date), 1) : addDays(today, -HISTORY_DAYS);
    if (from > today) continue;
    const rows = await fetchSeries(series, from, today);
    if (rows.length === 0) continue;
    const created = await db().benchmarkRate.createMany({
      data: rows.map((row) => ({ series, date: toDbDate(row.date), value: row.value })),
      skipDuplicates: true,
    });
    saved += created.count;
  }
  return saved;
}
