import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { addMonths, fromDbDate, monthRange, toDbDate } from "@/lib/dates";
import { db } from "@/lib/db";
import type { HighlightCandidate } from "@/lib/finance/insights";
import { cumulativeSpend, type DailySpendRow, spendUntil } from "@/lib/finance/spend-curve";
import { dataStart } from "./month-flow";
import { type ScopeQuery, scopeWhere } from "./scope";

/** Gasto: essenciais, variáveis (com estornos) e saídas sem categoria. Sem transferência nem ignorada. */
const SPEND: Prisma.TransactionWhereInput = {
  isIgnored: false,
  transferPeerId: null,
  OR: [{ categoryId: null, amountCents: { lt: 0 } }, { category: { kind: { in: ["ESSENCIAL", "VARIAVEL"] } } }],
};

const daysIn = (month: string) => Number(monthRange(month).to.slice(8, 10));

export type AreaSpend = {
  id: string;
  name: string;
  icon: string;
  parent: { id: string; name: string } | null;
  month: string;
  daysInMonth: number;
  /** Gasto acumulado do mês até `throughDay` (hoje, no mês corrente). */
  current: number[];
  /** Mês anterior inteiro, acumulado; vazio sem dados daquele mês. */
  previous: number[];
  totalCents: number;
  /** Mês anterior até o mesmo dia (inteiro, se o mês já fechou); null sem dados daquele mês inteiro. */
  previousToDateCents: number | null;
  children: { id: string; name: string; cents: number }[];
};

/**
 * Curva de gasto de uma área (categoria e subcategorias), de "sem" (saídas sem categoria) ou de "total"
 * no mês, contra o mês anterior. Área que não é de gasto ou não é do usuário → null.
 */
export async function getAreaSpend(userId: string, scope: ScopeQuery, areaId: string, month: string, today: string): Promise<AreaSpend | null> {
  let area: Pick<AreaSpend, "id" | "name" | "icon" | "parent"> & { filter: Prisma.TransactionWhereInput; children: { id: string; name: string }[] };
  if (areaId === "total") area = { id: "total", name: "Gastos", icon: "list", parent: null, filter: {}, children: [] };
  else if (areaId === "sem") area = { id: "sem", name: "Sem categoria", icon: "dots", parent: null, filter: { categoryId: null }, children: [] };
  else {
    const category = await db().category.findFirst({
      where: { id: areaId, userId, kind: { in: ["ESSENCIAL", "VARIAVEL"] } },
      select: { id: true, name: true, icon: true, parent: { select: { id: true, name: true } }, children: { select: { id: true, name: true } } },
    });
    if (!category) return null;
    area = { ...category, filter: { categoryId: { in: [category.id, ...category.children.map((child) => child.id)] } } };
  }

  const previousMonth = addMonths(month, -1);
  const [rows, start] = await Promise.all([
    db().transaction.findMany({
      where: {
        userId,
        ...scopeWhere(scope),
        AND: [SPEND, area.filter],
        date: { gte: toDbDate(monthRange(previousMonth).from), lte: toDbDate(month === today.slice(0, 7) ? today : monthRange(month).to) },
      },
      select: { date: true, amountCents: true, categoryId: true },
    }),
    dataStart(userId, scope),
  ]);
  const inMonth = (key: string): (DailySpendRow & { categoryId: string | null })[] =>
    rows
      .map((row) => ({ date: fromDbDate(row.date), amountCents: row.amountCents, categoryId: row.categoryId }))
      .filter((row) => row.date.slice(0, 7) === key)
      .map((row) => ({ day: Number(row.date.slice(8, 10)), amountCents: row.amountCents, categoryId: row.categoryId }));

  const days = daysIn(month);
  const throughDay = month === today.slice(0, 7) ? Number(today.slice(8, 10)) : days;
  const currentRows = inMonth(month);
  const previousRows = inMonth(previousMonth);
  const covered = start !== null && start <= `${previousMonth}-01`;
  const current = cumulativeSpend(currentRows, days).slice(0, throughDay);
  const children = area.children
    .map((child) => ({ id: child.id, name: child.name, cents: spendUntil(currentRows.filter((row) => row.categoryId === child.id), days) }))
    .filter((child) => child.cents > 0);
  const direct = area.children.length > 0 ? spendUntil(currentRows.filter((row) => row.categoryId === area.id), days) : 0;
  if (direct > 0) children.push({ id: area.id, name: "Sem subcategoria", cents: direct });

  return {
    id: area.id,
    name: area.name,
    icon: area.icon,
    parent: area.parent,
    month,
    daysInMonth: days,
    current,
    previous: covered ? cumulativeSpend(previousRows, daysIn(previousMonth)) : [],
    totalCents: current.at(-1) ?? 0,
    // Mês corrente: até o mesmo dia. Mês fechado: o anterior inteiro.
    previousToDateCents: covered ? spendUntil(previousRows, month === today.slice(0, 7) ? throughDay : 31) : null,
    children: children.sort((a, b) => b.cents - a.cents),
  };
}

/**
 * Candidatos à manchete do mês: cada categoria de estilo de vida (variável) no nível em que foi usada
 * (subcategoria quando houver), com o gasto até hoje e o do mês passado até o mesmo dia.
 */
export async function getHighlightCandidates(userId: string, scope: ScopeQuery, today: string): Promise<HighlightCandidate[]> {
  const month = today.slice(0, 7);
  const previousMonth = addMonths(month, -1);
  const day = Number(today.slice(8, 10));
  const [rows, start] = await Promise.all([
    db().transaction.findMany({
      where: {
        userId,
        ...scopeWhere(scope),
        isIgnored: false,
        transferPeerId: null,
        category: { kind: "VARIAVEL" },
        date: { gte: toDbDate(monthRange(previousMonth).from), lte: toDbDate(today) },
      },
      select: { date: true, amountCents: true, category: { select: { id: true, name: true, icon: true } } },
    }),
    dataStart(userId, scope),
  ]);
  const covered = start !== null && start <= `${previousMonth}-01`;
  const byCategory = new Map<string, { name: string; icon: string; current: DailySpendRow[]; previous: DailySpendRow[] }>();
  for (const row of rows) {
    if (!row.category) continue;
    const date = fromDbDate(row.date);
    const entry = byCategory.get(row.category.id) ?? { name: row.category.name, icon: row.category.icon, current: [], previous: [] };
    (date.slice(0, 7) === month ? entry.current : entry.previous).push({ day: Number(date.slice(8, 10)), amountCents: row.amountCents });
    byCategory.set(row.category.id, entry);
  }
  return [...byCategory].map(([id, entry]) => ({
    id,
    name: entry.name,
    icon: entry.icon,
    cents: spendUntil(entry.current, day),
    lastMonthToDateCents: covered ? spendUntil(entry.previous, day) : null,
  }));
}
