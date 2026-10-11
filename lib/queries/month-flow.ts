import "server-only";
import { addMonths, fromDbDate, monthRange, toDbDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { type MonthFlow, type MonthFlowRow, summarizeMonthFlow } from "@/lib/finance/month-flow";
import { type ScopeQuery, scopeWhere } from "./scope";

/** Meses fechados olhados para a sequência de meses na meta. */
const STREAK_MONTHS = 6;

type DatedRow = MonthFlowRow & { date: string };

/** Transações do período que contam no fluxo: sem transferência (par ou categoria de sistema) e sem ignoradas. */
async function flowRows(userId: string, scope: ScopeQuery, from: string, to: string): Promise<DatedRow[]> {
  const rows = await db().transaction.findMany({
    where: {
      userId,
      ...scopeWhere(scope),
      isIgnored: false,
      transferPeerId: null,
      date: { gte: toDbDate(from), lte: toDbDate(to) },
      OR: [{ categoryId: null }, { category: { kind: { not: "TRANSFERENCIA" } } }],
    },
    select: { date: true, amountCents: true, revenueStreamId: true, category: { select: { kind: true } } },
  });
  return rows.map((row) => ({
    date: fromDbDate(row.date),
    amountCents: row.amountCents,
    hasStream: row.revenueStreamId !== null,
    categoryKind: row.category && row.category.kind !== "TRANSFERENCIA" ? row.category.kind : null,
  }));
}

/** Primeiro dia com transação no escopo: mês antes disso é "sem dados", não "gasto zero". */
export async function dataStart(userId: string, scope: ScopeQuery): Promise<string | null> {
  const first = await db().transaction.aggregate({ where: { userId, ...scopeWhere(scope) }, _min: { date: true } });
  return first._min.date ? fromDbDate(first._min.date) : null;
}

/** Fluxo de um mês inteiro (ou até hoje, no mês corrente). */
export async function getMonthFlow(userId: string, scope: ScopeQuery, month: string): Promise<MonthFlow> {
  const { from, to } = monthRange(month);
  return summarizeMonthFlow(await flowRows(userId, scope, from, to));
}

export type MonthOverview = {
  flow: MonthFlow;
  /** Gasto do mês passado do dia 1 até o mesmo dia de hoje; null = sem dados do mês passado inteiro. */
  lastMonthToDateCents: number | null;
  /** Meses fechados, do mais recente para trás, só os que os dados cobrem por inteiro. */
  closedMonths: MonthFlow[];
};

/** O mês corrente até hoje, o mesmo ponto do mês passado e os meses fechados (para a sequência). */
export async function getMonthOverview(userId: string, scope: ScopeQuery, today: string): Promise<MonthOverview> {
  const month = today.slice(0, 7);
  const [rows, start] = await Promise.all([flowRows(userId, scope, monthRange(addMonths(month, -STREAK_MONTHS)).from, today), dataStart(userId, scope)]);
  const covers = (key: string) => start !== null && start <= `${key}-01`;
  const inMonth = (key: string) => rows.filter((row) => row.date.slice(0, 7) === key);

  const lastMonth = addMonths(month, -1);
  const day = Number(today.slice(8, 10));
  const lastMonthToDate = inMonth(lastMonth).filter((row) => Number(row.date.slice(8, 10)) <= day);

  const closedMonths: MonthFlow[] = [];
  for (let back = 1; back <= STREAK_MONTHS; back += 1) {
    const key = addMonths(month, -back);
    if (!covers(key)) break;
    closedMonths.push(summarizeMonthFlow(inMonth(key)));
  }
  return {
    flow: summarizeMonthFlow(inMonth(month)),
    lastMonthToDateCents: covers(lastMonth) ? summarizeMonthFlow(lastMonthToDate).spentCents : null,
    closedMonths,
  };
}
