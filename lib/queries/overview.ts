import "server-only";
import { addDays, toDbDate, todayLocal } from "@/lib/dates";
import { db } from "@/lib/db";
import { type ScopeQuery, scopeWhere } from "./scope";

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
      currency: true,
      includeInTotals: true,
      creditLimitCents: true,
      connection: { select: { institutionName: true } },
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
