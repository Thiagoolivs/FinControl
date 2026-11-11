import "server-only";
import { addMonths, fromDbDate, monthRange, todayLocal, toDbDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { groupKey } from "@/lib/categorization/queue";
import { summarizeBalances } from "@/lib/finance/balance";
import { firstInstallmentMonth, futureInstallments } from "@/lib/finance/installments";
import { flowsByMonth, type MonthFlowSummary, type Projection, projectByAverage } from "@/lib/finance/projection";
import { dataStart } from "@/lib/queries/month-flow";
import { getAccounts } from "@/lib/queries/overview";
import { type ScopeQuery, scopeWhere } from "@/lib/queries/scope";

export const HORIZON_MONTHS = 12;
/** Meses fechados que a média olha. */
const HISTORY_MONTHS = 3;

export type ProjectionView = Projection & {
  opening: { freeCents: number; cardBillCents: number; openingCents: number };
  history: MonthFlowSummary[];
};

/**
 * "Se continuar assim": parte do dinheiro livre de hoje (contas sem caixinhas, menos a fatura do cartão em
 * aberto) e soma a média do que sobrou nos últimos meses fechados. Transferência entre contas do próprio
 * escopo se anula; PF e PJ só somam quando o chamador pede `consolidated: true`.
 */
export async function getProjection(userId: string, query: ScopeQuery): Promise<ProjectionView> {
  const today = todayLocal();
  const currentMonth = today.slice(0, 7);
  const scope = scopeWhere(query);
  const historyFrom = addMonths(currentMonth, -HISTORY_MONTHS);

  const [accounts, installmentRows, rows, start] = await Promise.all([
    getAccounts(userId, query),
    db().transaction.findMany({
      where: { userId, ...scope, isIgnored: false, installmentTotal: { gt: 1 }, installmentCurrent: { not: null }, date: { gte: toDbDate(`${addMonths(currentMonth, -13)}-01`) } },
      select: { accountId: true, date: true, amountCents: true, descriptionClean: true, installmentCurrent: true, installmentTotal: true, account: { select: { type: true } } },
    }),
    db().transaction.findMany({
      where: { userId, ...scope, isIgnored: false, date: { gte: toDbDate(`${historyFrom}-01`), lt: toDbDate(`${currentMonth}-01`) } },
      select: { date: true, amountCents: true, transferPeer: { select: { scope: true } }, category: { select: { kind: true } } },
    }),
    dataStart(userId, query),
  ]);

  // Fatura em aberto: o limite usado menos as parcelas que ainda vão cair (essas entram mês a mês na média).
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
  const balance = summarizeBalances(accounts);
  const freeCents = balance.personalCents + balance.businessCents;
  const cardBillCents = Math.max(0, balance.creditUsedCents + installments.reduce((sum, item) => sum + item.amountCents, 0));

  // Só meses que os dados cobrem por inteiro: antes da primeira transação não é "não gastou", é "sem dado".
  const months = Array.from({ length: HISTORY_MONTHS }, (_, index) => addMonths(historyFrom, index)).filter(
    (month) => start !== null && start <= monthRange(month).from,
  );
  const history = flowsByMonth(
    rows.map((row) => ({
      date: fromDbDate(row.date),
      amountCents: row.amountCents,
      internal: row.transferPeer
        ? query.consolidated === true || row.transferPeer.scope === query.scope
        : row.category?.kind === "TRANSFERENCIA",
    })),
    months,
  );
  const openingCents = freeCents - cardBillCents;
  return {
    ...projectByAverage({ today, horizonMonths: HORIZON_MONTHS, openingCents, history }),
    opening: { freeCents, cardBillCents, openingCents },
    history,
  };
}
