import "server-only";
import { addMonths, fromDbDate, monthsBetween, todayLocal, toDbDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { groupKey } from "@/lib/categorization/queue";
import { splitIncome } from "@/lib/finance/allocation";
import { composeBalance, summarizeBalances } from "@/lib/finance/balance";
import { firstInstallmentMonth, futureInstallments } from "@/lib/finance/installments";
import { type ProjectedMonth, projectCashFlow } from "@/lib/finance/projection";
import { getGoals } from "@/lib/goals/queries";
import { getAccounts, getBucketTotals } from "@/lib/queries/overview";
import { type ScopeQuery, scopeWhere } from "@/lib/queries/scope";
import { refreshRecurringSeries } from "./recurring";

export const HORIZON_MONTHS = 12;
const VARIABLE_WINDOW = 3;
const PROJECTS_WINDOW = 6;
const BUSINESS_WINDOW = 3;

export type RecurringAssumption = { id: string; label: string; amountCents: number; grossCents: number; intervalDays: number; nextDate: string; stream: string | null };

export type Projection = {
  months: ProjectedMonth[];
  assumptions: {
    opening: { availableCents: number; cardBillCents: number; openingCents: number };
    incomes: RecurringAssumption[];
    expenses: RecurringAssumption[];
    installments: { totalCents: number; purchases: number };
    variable: { monthlyCents: number; months: number; categories: { name: string; monthlyCents: number }[] };
    goals: { id: string; name: string; monthlyCents: number; untilMonth: string }[];
    obligations: { name: string; monthlyCents: number }[];
    projects: { monthlyCents: number; months: number } | null;
    business: { openingCents: number; monthlyNetCents: number; months: number } | null;
  };
};

/** Meses fechados da janela que já têm dado: de max(início da janela, 1º mês com transação) até o mês passado. */
function windowStart(currentMonth: string, window: number, firstMonth: string | null): { from: string; months: number } {
  const from = [addMonths(currentMonth, -window), firstMonth ?? currentMonth].sort().at(-1) ?? currentMonth;
  return { from, months: Math.max(0, monthsBetween(from, currentMonth)) };
}

const perMonth = (totalCents: number, months: number) => (months > 0 ? Math.floor(totalCents / months) : 0);

/**
 * Projeção de 12 meses do saldo pessoal (realista e com projetos) e do caixa do negócio, com as premissas
 * que entraram nela. PF e PJ só somam quando o chamador pede `consolidated: true`.
 */
export async function getProjection(userId: string, query: ScopeQuery, options: { refreshRecurring?: boolean } = {}): Promise<Projection> {
  const today = todayLocal();
  const currentMonth = today.slice(0, 7);
  if (options.refreshRecurring !== false) await refreshRecurringSeries(userId, today);
  const scope = scopeWhere(query);
  const includesPj = query.consolidated === true || query.scope === "PJ";

  const [accounts, buckets, series, installmentRows, firstTransaction, goals, obligations, streams] = await Promise.all([
    getAccounts(userId, query),
    getBucketTotals(userId, query),
    db().recurringSeries.findMany({
      where: { userId, ...scope, status: "ATIVA" },
      select: {
        id: true,
        avgAmountCents: true,
        intervalDays: true,
        nextExpectedDate: true,
        revenueStream: { select: { name: true, taxReserveBps: true, costReserveBps: true } },
        transactions: { select: { descriptionClean: true }, orderBy: { date: "desc" }, take: 1 },
      },
    }),
    db().transaction.findMany({
      where: { userId, ...scope, isIgnored: false, installmentTotal: { gt: 1 }, installmentCurrent: { not: null }, date: { gte: toDbDate(`${addMonths(currentMonth, -13)}-01`) } },
      select: { accountId: true, date: true, amountCents: true, descriptionClean: true, installmentCurrent: true, installmentTotal: true, account: { select: { type: true } } },
    }),
    db().transaction.findFirst({ where: { userId, ...scope, isIgnored: false }, select: { date: true }, orderBy: { date: "asc" } }),
    getGoals(userId),
    db().fixedObligation.findMany({ where: { userId, ...scope, active: true }, select: { name: true, amountCents: true } }),
    db().revenueStream.findMany({ where: { userId }, select: { id: true, type: true, taxReserveBps: true, costReserveBps: true } }),
  ]);
  const firstMonth = firstTransaction ? fromDbDate(firstTransaction.date).slice(0, 7) : null;

  // Recorrentes: receita entra sem as reservas da stream.
  const recurring = series.map((item) => {
    const stream = item.revenueStream;
    const net = item.avgAmountCents > 0 && stream ? splitIncome(item.avgAmountCents, stream.taxReserveBps, stream.costReserveBps).restCents : item.avgAmountCents;
    return {
      id: item.id,
      label: item.transactions[0]?.descriptionClean ?? "Recorrente",
      amountCents: net,
      grossCents: item.avgAmountCents,
      intervalDays: item.intervalDays,
      nextDate: fromDbDate(item.nextExpectedDate),
      stream: stream?.name ?? null,
    };
  });

  // Parcelas de cartão que ainda vão cair.
  const installments = futureInstallments(
    installmentRows
      .filter((row) => row.account.type === "CREDIT" && row.amountCents < 0)
      .map((row) => {
        const date = fromDbDate(row.date);
        const current = row.installmentCurrent ?? 1;
        const total = row.installmentTotal ?? 1;
        return {
          purchaseKey: `${row.accountId}|${groupKey(row.descriptionClean)}|${total}|${row.amountCents}|${firstInstallmentMonth(date, current)}`,
          date,
          amountCents: row.amountCents,
          current,
          total,
        };
      }),
    currentMonth,
  );
  const installmentsCents = installments.reduce((sum, item) => sum + item.amountCents, 0);

  // Ponto de partida: disponível de hoje menos a fatura em aberto (o limite usado tem as parcelas futuras).
  const balance = summarizeBalances(accounts);
  const available = composeBalance({ grossCents: balance.cashCents, ...buckets }).availableCents;
  const cardBillCents = Math.max(0, balance.creditUsedCents + installmentsCents);

  // Gastos variáveis: o que não é recorrente, parcela, transferência, investimento nem pago com bucket.
  const variableWindow = windowStart(currentMonth, VARIABLE_WINDOW, firstMonth);
  const variableRows = await db().transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      ...scope,
      isIgnored: false,
      transferPeerId: null,
      recurringSeriesId: null,
      amountCents: { lt: 0 },
      date: { gte: toDbDate(`${variableWindow.from}-01`), lt: toDbDate(`${currentMonth}-01`) },
      AND: [
        { OR: [{ installmentTotal: null }, { installmentTotal: { lte: 1 } }] },
        { OR: [{ categoryId: null }, { category: { kind: { in: ["ESSENCIAL", "VARIAVEL"] } } }] },
      ],
      bucketEntries: { none: { kind: "PAGAMENTO" } },
    },
    _sum: { amountCents: true },
  });
  const categoryNames = new Map(
    (await db().category.findMany({ where: { userId, id: { in: variableRows.map((row) => row.categoryId).filter((id): id is string => id !== null) } }, select: { id: true, name: true } })).map(
      (category) => [category.id, category.name],
    ),
  );
  const variableCategories = variableRows
    .map((row) => ({ name: row.categoryId ? (categoryNames.get(row.categoryId) ?? "Outra") : "Sem categoria", monthlyCents: perMonth(row._sum.amountCents ?? 0, variableWindow.months) }))
    .sort((a, b) => a.monthlyCents - b.monthlyCents);
  const variableMonthlyCents = perMonth(
    variableRows.reduce((sum, row) => sum + (row._sum.amountCents ?? 0), 0),
    variableWindow.months,
  );

  // Metas em andamento no escopo.
  const runningGoals = goals.filter(
    (goal) => (goal.progress === "no-prazo" || goal.progress === "atrasada") && (query.consolidated === true || goal.scope === query.scope),
  );

  // Projetos avulsos: só na linha otimista.
  const projectStreams = streams.filter((stream) => stream.type === "PROJETO");
  const projectsWindow = windowStart(currentMonth, PROJECTS_WINDOW, firstMonth);
  const projectRows = projectStreams.length
    ? await db().transaction.findMany({
        where: {
          userId,
          ...scope,
          isIgnored: false,
          amountCents: { gt: 0 },
          revenueStreamId: { in: projectStreams.map((stream) => stream.id) },
          date: { gte: toDbDate(`${projectsWindow.from}-01`), lt: toDbDate(`${currentMonth}-01`) },
        },
        select: { amountCents: true, revenueStreamId: true },
      })
    : [];
  const projectsNet = projectRows.reduce((sum, row) => {
    const stream = projectStreams.find((candidate) => candidate.id === row.revenueStreamId);
    return sum + (stream ? splitIncome(row.amountCents, stream.taxReserveBps, stream.costReserveBps).restCents : 0);
  }, 0);
  const projects = projectRows.length > 0 ? { monthlyCents: perMonth(projectsNet, projectsWindow.months), months: projectsWindow.months } : null;

  // Negócio: caixa de hoje e a média líquida (entrou − pagou) dos últimos meses. Retirada não entra.
  let business: Projection["assumptions"]["business"] = null;
  if (includesPj) {
    const ventureBuckets = await db().bucket.findMany({ where: { userId, ...scope, type: "CAIXA_PROJETO" }, select: { id: true, balanceCents: true } });
    if (ventureBuckets.length > 0) {
      const businessWindow = windowStart(currentMonth, BUSINESS_WINDOW, firstMonth);
      const flow = await db().bucketEntry.aggregate({
        where: {
          userId,
          bucketId: { in: ventureBuckets.map((bucket) => bucket.id) },
          kind: { in: ["ALOCACAO", "PAGAMENTO"] },
          date: { gte: toDbDate(`${businessWindow.from}-01`), lt: toDbDate(`${currentMonth}-01`) },
        },
        _sum: { amountCents: true },
      });
      business = {
        openingCents: ventureBuckets.reduce((sum, bucket) => sum + bucket.balanceCents, 0),
        monthlyNetCents: perMonth(flow._sum.amountCents ?? 0, businessWindow.months),
        months: businessWindow.months,
      };
    }
  }

  const openingCents = available - cardBillCents;
  const months = projectCashFlow({
    today,
    horizonMonths: HORIZON_MONTHS,
    openingCents,
    recurring: recurring.map((item) => ({ amountCents: item.amountCents, intervalDays: item.intervalDays === 7 ? 7 : item.intervalDays === 365 ? 365 : 30, nextExpectedDate: item.nextDate })),
    installments,
    variableMonthlyCents,
    goals: runningGoals.map((goal) => ({
      monthlyCents: goal.monthlyRequiredCents,
      untilMonth: goal.targetMonth,
      currentMonthCents: Math.max(0, goal.monthlyRequiredCents - goal.contributedThisMonthCents),
    })),
    obligationsMonthlyCents: obligations.reduce((sum, obligation) => sum + obligation.amountCents, 0),
    projectsMonthlyCents: projects?.monthlyCents ?? null,
    business: business ? { openingCents: business.openingCents, monthlyNetCents: business.monthlyNetCents } : null,
  });

  return {
    months,
    assumptions: {
      opening: { availableCents: available, cardBillCents, openingCents },
      incomes: recurring.filter((item) => item.amountCents > 0).sort((a, b) => b.amountCents - a.amountCents),
      expenses: recurring.filter((item) => item.amountCents < 0).sort((a, b) => a.amountCents - b.amountCents),
      installments: { totalCents: installmentsCents, purchases: new Set(installments.map((item) => item.purchaseKey)).size },
      variable: { monthlyCents: variableMonthlyCents, months: variableWindow.months, categories: variableCategories },
      goals: runningGoals.map((goal) => ({ id: goal.id, name: goal.name, monthlyCents: goal.monthlyRequiredCents, untilMonth: goal.targetMonth })),
      obligations: obligations.map((obligation) => ({ name: obligation.name, monthlyCents: obligation.amountCents })),
      projects,
      business,
    },
  };
}
