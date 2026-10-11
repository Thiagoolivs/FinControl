import "server-only";
import { z } from "zod";
import type { BenchmarkSeries } from "@/generated/prisma/enums";
import { serverEnv } from "@/lib/env";

const DEFAULT_BASE_URL = "https://api.bcb.gov.br";
const TIMEOUT_MS = 20_000;

/** Séries do SGS (Banco Central, público, sem token). */
export const SGS_CODES: Record<BenchmarkSeries, number> = { CDI: 12, SELIC: 11, IPCA: 433 };

const rows = z.array(z.object({ data: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/), valor: z.string().regex(/^-?\d+(\.\d+)?$/) }));

const toBr = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const fromBr = (date: string) => `${date.slice(6, 10)}-${date.slice(3, 5)}-${date.slice(0, 2)}`;

/** Valores publicados entre `from` e `to` (YYYY-MM-DD), como texto decimal (% do período). */
export async function fetchSeries(series: BenchmarkSeries, from: string, to: string): Promise<{ date: string; value: string }[]> {
  const base = serverEnv().SGS_API_URL ?? DEFAULT_BASE_URL;
  const query = new URLSearchParams({ formato: "json", dataInicial: toBr(from), dataFinal: toBr(to) });
  const response = await fetch(`${base}/dados/serie/bcdata.sgs.${SGS_CODES[series]}/dados?${query}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  // Sem dado no intervalo (fim de semana, feriado), o SGS responde 404: não é erro.
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`SGS respondeu ${response.status} na série ${series}`);
  return rows.parse(await response.json()).map((row) => ({ date: fromBr(row.data), value: row.valor }));
}
