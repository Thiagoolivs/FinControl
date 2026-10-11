import "server-only";
import { z } from "zod";
import { addDays, toDbDate, todayLocal } from "@/lib/dates";
import { db } from "@/lib/db";
import { type ScopeQuery, scopeWhere } from "./scope";

const savedBoxes = z.array(z.object({ name: z.string(), cents: z.number().int() }));

/** Caixinhas gravadas no sync (Account.savedBoxes). Formato inesperado = nenhuma, sem quebrar a tela. */
export function savedBoxesOf(value: unknown): { name: string; cents: number }[] {
  const parsed = savedBoxes.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export async function getAccounts(userId: string, query: ScopeQuery) {
  return db().account.findMany({
    where: { userId, ...scopeWhere(query) },
    select: {
      id: true,
      name: true,
      number: true,
      type: true,
      scope: true,
      balanceCents: true,
      autoInvestedCents: true,
      savedCents: true,
      savedBoxes: true,
      closingBalanceCents: true,
      overdraftLimitCents: true,
      overdraftUsedCents: true,
      currency: true,
      includeInTotals: true,
      creditLimitCents: true,
      availableCreditCents: true,
      connection: { select: { id: true, institutionName: true, lastSyncAt: true } },
    },
    orderBy: [{ type: "asc" }, { balanceCents: "desc" }],
  });
}

/** Transações dos últimos `days` dias, incluindo hoje. */
export async function getRecentTransactions(userId: string, query: ScopeQuery, days: number) {
  const from = addDays(todayLocal(), -(days - 1));
  return db().transaction.findMany({
    where: { userId, ...scopeWhere(query), isIgnored: false, date: { gte: toDbDate(from) } },
    select: {
      id: true,
      date: true,
      amountCents: true,
      descriptionClean: true,
      status: true,
      scope: true,
      transferPeerId: true,
      installmentCurrent: true,
      installmentTotal: true,
      account: { select: { name: true } },
      category: { select: { kind: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}

/** Conexões com a última leitura de cada uma (para status e erros na UI). */
export async function getConnections(userId: string) {
  return db().connection.findMany({
    where: { userId },
    select: {
      id: true,
      scope: true,
      pluggyItemId: true,
      institutionName: true,
      status: true,
      statusDetail: true,
      lastSyncAt: true,
      consentExpiresAt: true,
      createdAt: true,
      _count: { select: { accounts: true } },
      syncRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { status: true, startedAt: true, finishedAt: true, error: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export type ConnectionView = Awaited<ReturnType<typeof getConnections>>[number];

/** Saldo dos buckets que tiram dinheiro do disponível: reservas (imposto + custo) e caixa do negócio. */
export async function getBucketTotals(userId: string, query: ScopeQuery) {
  const rows = await db().bucket.groupBy({
    by: ["type"],
    where: { userId, ...scopeWhere(query), type: { in: ["RESERVA_IMPOSTO", "RESERVA_CUSTO", "CAIXA_PROJETO"] } },
    _sum: { balanceCents: true },
  });
  const total = (types: readonly string[]) =>
    rows.filter((row) => types.includes(row.type)).reduce((sum, row) => sum + (row._sum.balanceCents ?? 0), 0);
  return { reservedCents: total(["RESERVA_IMPOSTO", "RESERVA_CUSTO"]), businessCashCents: total(["CAIXA_PROJETO"]) };
}

// O cron roda uma vez por dia; mais que isso sem leitura = o serviço não está rodando.
const CRON_STALE_AFTER_MS = 48 * 60 * 60 * 1000;

/** Saúde do serviço de cron do Railway: quando leu pela última vez e se está rodando. */
export async function getCronHealth(userId: string, now: Date = new Date()) {
  const last = await db().syncRun.findFirst({
    where: { userId, trigger: "CRON" },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });
  const lastRunAt = last?.startedAt ?? null;
  return { lastRunAt, running: lastRunAt !== null && now.getTime() - lastRunAt.getTime() < CRON_STALE_AFTER_MS };
}
