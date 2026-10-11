import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { addMonths, fromDbDate, monthRange, toDbDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { averageRatioBps, type CategorySpend, spendByTopCategory } from "@/lib/finance/categories";
import { type ScopeQuery, scopeWhere } from "./scope";

export const TRANSACTION_KINDS = ["saidas", "entradas", "transferencias"] as const;
export type TransactionKindFilter = (typeof TRANSACTION_KINDS)[number];

export type TransactionFilters = {
  month: string; // YYYY-MM
  scope: ScopeQuery;
  search?: string;
  categoryId?: string; // "sem" = sem categoria
  kind?: TransactionKindFilter;
};

const LIST_LIMIT = 400;

const isTransfer: Prisma.TransactionWhereInput = { OR: [{ transferPeerId: { not: null } }, { category: { kind: "TRANSFERENCIA" } }] };
const notTransfer: Prisma.TransactionWhereInput = { transferPeerId: null, OR: [{ categoryId: null }, { category: { kind: { not: "TRANSFERENCIA" } } }] };

async function categoryFilter(userId: string, categoryId: string | undefined): Promise<Prisma.TransactionWhereInput> {
  if (!categoryId) return {};
  if (categoryId === "sem") return { categoryId: null };
  const children = await db().category.findMany({ where: { userId, parentId: categoryId }, select: { id: true } });
  return { categoryId: { in: [categoryId, ...children.map((child) => child.id)] } };
}

/** Transações do mês com busca e filtros. Ignoradas aparecem (marcadas), para poder desfazer. */
export async function listTransactions(userId: string, filters: TransactionFilters) {
  const { from, to } = monthRange(filters.month);
  const search = filters.search?.trim();
  const where: Prisma.TransactionWhereInput = {
    userId,
    ...scopeWhere(filters.scope),
    date: { gte: toDbDate(from), lte: toDbDate(to) },
    AND: [
      await categoryFilter(userId, filters.categoryId),
      search
        ? { OR: [{ descriptionClean: { contains: search, mode: "insensitive" } }, { descriptionRaw: { contains: search, mode: "insensitive" } }] }
        : {},
      filters.kind === "transferencias" ? isTransfer : {},
      filters.kind === "saidas" ? { amountCents: { lt: 0 }, ...notTransfer } : {},
      filters.kind === "entradas" ? { amountCents: { gt: 0 }, ...notTransfer } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    db().transaction.findMany({
      where,
      select: {
        id: true,
        date: true,
        amountCents: true,
        descriptionClean: true,
        status: true,
        scope: true,
        isIgnored: true,
        transferPeerId: true,
        installmentCurrent: true,
        installmentTotal: true,
        account: { select: { name: true } },
        category: { select: { name: true, kind: true, parent: { select: { name: true } } } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: LIST_LIMIT,
    }),
    db().transaction.count({ where }),
  ]);
  return { rows, total, truncated: total > rows.length };
}

export type ListedTransaction = Awaited<ReturnType<typeof listTransactions>>["rows"][number];

export type CategoryBreakdownRow = {
  id: string; // "sem" = sem categoria
  name: string;
  icon: string;
  kind: "ESSENCIAL" | "VARIAVEL" | null;
  cents: number;
  averageRatioBps: number | null;
  children: { id: string; name: string; cents: number }[];
};

/**
 * Gastos do mês por área: categoria de primeiro nível (com a razão sobre a média dos 3 meses anteriores)
 * e, dentro dela, cada subcategoria. Só essenciais, variáveis e sem categoria: investimento e transferência
 * não são gasto.
 */
export async function getMonthCategoryBreakdown(userId: string, scope: ScopeQuery, month: string): Promise<CategoryBreakdownRow[]> {
  const from = monthRange(addMonths(month, -3)).from;
  const { to } = monthRange(month);
  const [rows, categories, first] = await Promise.all([
    db().transaction.findMany({
      where: {
        userId,
        ...scopeWhere(scope),
        isIgnored: false,
        transferPeerId: null,
        date: { gte: toDbDate(from), lte: toDbDate(to) },
        OR: [{ categoryId: null, amountCents: { lt: 0 } }, { category: { kind: { in: ["ESSENCIAL", "VARIAVEL"] } } }],
      },
      select: { date: true, amountCents: true, categoryId: true },
    }),
    db().category.findMany({ where: { userId }, select: { id: true, parentId: true, name: true, icon: true, kind: true } }),
    db().transaction.aggregate({ where: { userId, ...scopeWhere(scope) }, _min: { date: true } }),
  ]);
  // Mês antes do começo dos dados é "sem histórico", não "gasto zero": fica fora da média.
  const dataStart = first._min.date ? fromDbDate(first._min.date) : null;
  const coveredMonths = [1, 2, 3].map((back) => addMonths(month, -back)).filter((key) => dataStart !== null && `${key}-01` >= dataStart);
  const parentOf = new Map(categories.map((category) => [category.id, category.parentId]));
  const byMonth = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = fromDbDate(row.date).slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), row]);
  }
  const totals = (key: string) => spendByTopCategory(byMonth.get(key) ?? [], parentOf);
  const current = totals(month);
  const leaves = spendByTopCategory(byMonth.get(month) ?? [], new Map());
  const history = coveredMonths.map(totals);
  const byId = new Map(categories.map((category) => [category.id, category]));

  return [...current]
    .filter(([, cents]) => cents > 0)
    .map(([id, cents]) => {
      const category = id ? byId.get(id) : null;
      const children = id
        ? [...leaves]
            .filter(([leaf, leafCents]) => leaf !== null && leafCents > 0 && (leaf === id ? false : parentOf.get(leaf) === id))
            .map(([leaf, leafCents]) => ({ id: leaf ?? "", name: byId.get(leaf ?? "")?.name ?? "", cents: leafCents }))
            .sort((a, b) => b.cents - a.cents)
        : [];
      const direct = id ? (leaves.get(id) ?? 0) : 0;
      if (id && children.length > 0 && direct > 0) children.push({ id, name: "Sem subcategoria", cents: direct });
      return {
        id: id ?? "sem",
        name: category?.name ?? "Sem categoria",
        icon: category?.icon ?? "dots",
        kind: category?.kind === "ESSENCIAL" || category?.kind === "VARIAVEL" ? category.kind : null,
        cents,
        averageRatioBps: averageRatioBps(
          cents,
          history.map((months) => months.get(id) ?? 0),
        ),
        children,
      };
    })
    .sort((a, b) => b.cents - a.cents);
}

/** Para o gráfico da Hoje: só o primeiro nível. */
export async function getMonthSpendByCategory(userId: string, scope: ScopeQuery, month: string): Promise<CategorySpend[]> {
  const breakdown = await getMonthCategoryBreakdown(userId, scope, month);
  return breakdown.map(({ id, name, icon, cents, averageRatioBps: ratio }) => ({ id, name, icon, cents, averageRatioBps: ratio }));
}
