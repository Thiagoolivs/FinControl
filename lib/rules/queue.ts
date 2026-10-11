import "server-only";
import { groupKey, suggestedPattern } from "@/lib/categorization/queue";
import { addDays, fromDbDate, todayLocal, toDbDate } from "@/lib/dates";
import { db } from "@/lib/db";

/** Janelas que a fila oferece (dias); null = todo o histórico. */
export const REVIEW_WINDOWS = [30, 60, 90, null] as const;
export type ReviewWindow = (typeof REVIEW_WINDOWS)[number];

const since = (from: string | null) => (from ? { date: { gte: toDbDate(from) } } : {});

/** Fila de revisão: saídas sem categoria, que não são transferência nem foram ignoradas. */
const queueWhere = (userId: string, from: string | null) =>
  ({ userId, categoryId: null, transferPeerId: null, isIgnored: false, amountCents: { lt: 0 }, ...since(from) }) as const;

/** Entradas sem stream e sem categoria: toda receita precisa de stream (estorno vira categoria). */
export const incomeQueueWhere = (userId: string, from: string | null = null) =>
  ({ userId, categoryId: null, revenueStreamId: null, transferPeerId: null, isIgnored: false, amountCents: { gt: 0 }, ...since(from) }) as const;

/** A fila só pede o que é recente: a janela é do usuário (padrão 60 dias), escolhida na própria fila. */
export async function getReviewWindow(userId: string): Promise<{ days: number | null; from: string | null }> {
  const user = await db().user.findUnique({ where: { id: userId }, select: { reviewWindowDays: true } });
  const days = user?.reviewWindowDays ?? null;
  return { days, from: days === null ? null : addDays(todayLocal(), -days) };
}

/** Badge da aba Transações: saídas sem categoria + entradas sem stream, dentro da janela. */
export async function countReviewQueue(userId: string): Promise<number> {
  const { from } = await getReviewWindow(userId);
  const [outflows, inflows] = await Promise.all([
    db().transaction.count({ where: queueWhere(userId, from) }),
    db().transaction.count({ where: incomeQueueWhere(userId, from) }),
  ]);
  return outflows + inflows;
}

/** Quantas ficaram de fora da janela (mais antigas que ela), para a fila dizer que existem. */
export async function countOutsideWindow(userId: string): Promise<{ outflows: number; inflows: number }> {
  const { from } = await getReviewWindow(userId);
  if (!from) return { outflows: 0, inflows: 0 };
  const before = { date: { lt: toDbDate(from) } };
  const [outflows, inflows] = await Promise.all([
    db().transaction.count({ where: { ...queueWhere(userId, null), ...before } }),
    db().transaction.count({ where: { ...incomeQueueWhere(userId), ...before } }),
  ]);
  return { outflows, inflows };
}

export type IncomeGroup = Omit<QueueGroup, "suggestion">;

/** Entradas sem stream (dentro da janela) agrupadas por pagador/descrição, maiores primeiro. */
export async function getIncomeQueue(userId: string): Promise<IncomeGroup[]> {
  const { from } = await getReviewWindow(userId);
  const rows = await db().transaction.findMany({
    where: incomeQueueWhere(userId, from),
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

/** Agrupa a fila (dentro da janela) por loja parecida; grupos maiores (em quantidade, depois em valor) primeiro. */
export async function getReviewQueue(userId: string): Promise<QueueGroup[]> {
  const { from } = await getReviewWindow(userId);
  const rows = await db().transaction.findMany({
    where: queueWhere(userId, from),
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
