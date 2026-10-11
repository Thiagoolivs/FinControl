import "server-only";
import { groupKey, suggestedPattern } from "@/lib/categorization/queue";
import { fromDbDate } from "@/lib/dates";
import { db } from "@/lib/db";

/** Fila de revisão: saídas sem categoria, que não são transferência nem foram ignoradas. */
const queueWhere = (userId: string) =>
  ({ userId, categoryId: null, transferPeerId: null, isIgnored: false, amountCents: { lt: 0 } }) as const;

/** Entradas sem stream e sem categoria: toda receita precisa de stream (estorno vira categoria). */
export const incomeQueueWhere = (userId: string) =>
  ({ userId, categoryId: null, revenueStreamId: null, transferPeerId: null, isIgnored: false, amountCents: { gt: 0 } }) as const;

/** Badge da aba Transações: saídas sem categoria + entradas sem stream. */
export async function countReviewQueue(userId: string): Promise<number> {
  const [outflows, inflows] = await Promise.all([
    db().transaction.count({ where: queueWhere(userId) }),
    db().transaction.count({ where: incomeQueueWhere(userId) }),
  ]);
  return outflows + inflows;
}

export type IncomeGroup = Omit<QueueGroup, "suggestion">;

/** Entradas sem stream agrupadas por pagador/descrição, maiores primeiro. */
export async function getIncomeQueue(userId: string): Promise<IncomeGroup[]> {
  const rows = await db().transaction.findMany({
    where: incomeQueueWhere(userId),
    select: { id: true, date: true, amountCents: true, descriptionClean: true, scope: true, account: { select: { name: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = groupKey(row.descriptionClean);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups]
    .map(([key, members]) => {
      const suggested = suggestedPattern(members.map((member) => member.descriptionClean));
      return {
        key,
        pattern: suggested.pattern,
        matchType: suggested.matchType,
        totalCents: members.reduce((sum, member) => sum + member.amountCents, 0),
        transactions: members.map((member) => ({
          id: member.id,
          date: fromDbDate(member.date),
          amountCents: member.amountCents,
          description: member.descriptionClean,
          account: member.account.name,
          scope: member.scope,
        })),
      };
    })
    .sort((a, b) => b.totalCents - a.totalCents);
}

export type QueueGroup = {
  key: string;
  pattern: string;
  matchType: "PREFIX" | "CONTAINS" | "REGEX";
  totalCents: number;
  transactions: { id: string; date: string; amountCents: number; description: string; account: string; scope: "PF" | "PJ" }[];
  suggestion: { id: string; categoryId: string | null; pattern: string; matchType: "PREFIX" | "CONTAINS" | "REGEX" } | null;
};

/** Agrupa a fila por loja parecida; grupos maiores (em quantidade, depois em valor) primeiro. */
export async function getReviewQueue(userId: string): Promise<QueueGroup[]> {
  const rows = await db().transaction.findMany({
    where: queueWhere(userId),
    select: {
      id: true,
      date: true,
      amountCents: true,
      descriptionClean: true,
      scope: true,
      account: { select: { name: true } },
      suggestion: { select: { id: true, status: true, categoryId: true, pattern: true, matchType: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = groupKey(row.descriptionClean);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups]
    .map(([key, members]) => {
      const suggested = suggestedPattern(members.map((member) => member.descriptionClean));
      const pending = members.find((member) => member.suggestion?.status === "PENDENTE")?.suggestion ?? null;
      return {
        key,
        pattern: suggested.pattern,
        matchType: suggested.matchType,
        totalCents: members.reduce((sum, member) => sum - member.amountCents, 0),
        transactions: members.map((member) => ({
          id: member.id,
          date: fromDbDate(member.date),
          amountCents: member.amountCents,
          description: member.descriptionClean,
          account: member.account.name,
          scope: member.scope,
        })),
        suggestion: pending
          ? { id: pending.id, categoryId: pending.categoryId, pattern: pending.pattern, matchType: pending.matchType }
          : null,
      };
    })
    .sort((a, b) => b.transactions.length - a.transactions.length || b.totalCents - a.totalCents);
}
