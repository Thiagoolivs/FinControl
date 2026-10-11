import "server-only";
import { z } from "zod";
import { decimalToCents } from "@/lib/finance/money";
import { serverEnv } from "@/lib/env";

const DEFAULT_BASE_URL = "https://brapi.dev";
const TIMEOUT_MS = 15_000;

const quoteResponse = z.object({
  results: z.array(z.object({ symbol: z.string(), regularMarketPrice: z.number(), regularMarketChangePercent: z.number().nullish() })).min(1),
});
const cryptoResponse = z.object({
  coins: z.array(z.object({ coin: z.string(), regularMarketPrice: z.number(), regularMarketChangePercent: z.number().nullish() })).min(1),
});

export type QuoteData = { priceCents: number; changeBps: number };

export function isBrapiConfigured(): boolean {
  return Boolean(serverEnv().BRAPI_TOKEN);
}

/** Variação do dia em % (1.53) → bps (153). */
function changeBps(percent: number | null | undefined): number {
  return percent == null || !Number.isFinite(percent) ? 0 : decimalToCents(percent);
}

async function get(path: string): Promise<unknown> {
  const env = serverEnv();
  if (!env.BRAPI_TOKEN) throw new Error("BRAPI_TOKEN não definida.");
  // Token no header, não na URL: não vaza em log de acesso.
  const response = await fetch(`${env.BRAPI_API_URL ?? DEFAULT_BASE_URL}${path}`, {
    headers: { authorization: `Bearer ${env.BRAPI_TOKEN}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`brapi respondeu ${response.status} em ${path.split("?")[0]}`);
  return response.json();
}

/** Uma ação/FII/ETF por requisição (limite do plano gratuito). */
export async function fetchStockQuote(ticker: string): Promise<QuoteData> {
  const body = quoteResponse.parse(await get(`/api/quote/${encodeURIComponent(ticker)}`));
  const [first] = body.results;
  if (!first) throw new Error(`Sem cotação para ${ticker}.`);
  return { priceCents: decimalToCents(first.regularMarketPrice), changeBps: changeBps(first.regularMarketChangePercent) };
}

export async function fetchCryptoQuote(coin: string): Promise<QuoteData> {
  const body = cryptoResponse.parse(await get(`/api/v2/crypto?coin=${encodeURIComponent(coin)}&currency=BRL`));
  const [first] = body.coins;
  if (!first) throw new Error(`Sem cotação para ${coin}.`);
  return { priceCents: decimalToCents(first.regularMarketPrice), changeBps: changeBps(first.regularMarketChangePercent) };
}
