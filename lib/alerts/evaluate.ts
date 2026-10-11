import "server-only";
import type { AlertType, Scope, Severity } from "@/generated/prisma/enums";
import { addDays, addMonths, formatDayLabel, formatMonthLabel, fromDbDate, monthsBetween, todayLocal, toDbDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { exceedsAverage, meiLimitStage } from "@/lib/finance/alerts";
import { formatCents } from "@/lib/finance/money";
import { formatBps } from "@/lib/finance/share";
import { getGoals } from "@/lib/goals/queries";
import { getProjection } from "@/lib/projection/build";
import { getMonthCategoryBreakdown } from "@/lib/queries/transactions";
import { incomeQueueWhere } from "@/lib/rules/queue";
import { type ActiveRule, activeAlertRules } from "./rules";

const RECENT_DAYS = 7;
const SCOPES: Scope[] = ["PF", "PJ"];

type NewAlert = {
  userId: string;
  alertRuleId: string;
  scope: Scope;
  type: AlertType;
  severity: Severity;
  title: string;
  body: string;
  payload: Record<string, string | number | null>;
  dedupeKey: string;
};

type Context = { userId: string; today: string; month: string; since: Date };

/**
 * Avalia os gatilhos no fim do sync e grava os alertas novos. O mesmo fato nunca vira dois alertas
 * (dedupeKey único por usuário). Erro de conexão e consentimento são levantados durante a leitura.
 */
export async function evaluateAlerts(userId: string, since: Date): Promise<number> {
  const rules = await activeAlertRules(userId);
  const today = todayLocal();
  const context: Context = { userId, today, month: today.slice(0, 7), since };
  const make = (type: AlertType, rule: ActiveRule, alert: Omit<NewAlert, "userId" | "alertRuleId" | "type" | "severity">): NewAlert => ({
    userId,
    alertRuleId: rule.id,
    type,
    severity: rule.severity,
    ...alert,
  });

  const checks: Promise<NewAlert[]>[] = [];
  const add = (type: AlertType, check: (rule: ActiveRule, context: Context, make: Maker) => Promise<NewAlert[]>) => {
    const rule = rules[type];
    if (rule) checks.push(check(rule, context, (alert) => make(type, rule, alert)));
  };
  add("GASTO_UNICO_ALTO", bigSpend);
  add("CATEGORIA_ACIMA_MEDIA", categoryAboveAverage);
  add("ASSINATURA_NOVA", newSubscription);
  add("FATURA_ACIMA_PREVISTO", cardAboveForecast);
  add("META_ATRASADA", lateGoals);
  add("SALDO_PROJETADO_NEGATIVO", negativeProjection);
  add("RESERVA_IMPOSTO_BAIXA", lowTaxReserve);
  add("ENTRADA_SEM_STREAM", incomeWithoutStream);
  add("LIMITE_FATURAMENTO_MEI", meiLimit);

  const alerts = (await Promise.all(checks)).flat();
  if (alerts.length === 0) return 0;
  const created = await db().alert.createMany({ data: alerts, skipDuplicates: true });
  return created.count;
}

type Maker = (alert: Omit<NewAlert, "userId" | "alertRuleId" | "type" | "severity">) => NewAlert;

/** Saída recente acima do limite. Transferência e pagamento de fatura não são gasto. */
async function bigSpend(rule: ActiveRule, { userId, today }: Context, make: Maker): Promise<NewAlert[]> {
  const limit = rule.params.limiteCents ?? 0;
  const rows = await db().transaction.findMany({
    where: {
      userId,
      isIgnored: false,
      transferPeerId: null,
      amountCents: { lte: -limit },
      date: { gte: toDbDate(addDays(today, -RECENT_DAYS)) },
      OR: [{ categoryId: null }, { category: { kind: { not: "TRANSFERENCIA" } } }],
    },
    select: { id: true, date: true, amountCents: true, descriptionClean: true, scope: true, account: { select: { name: true } } },
  });
  return rows.map((row) =>
    make({
      scope: row.scope,
      title: `Gasto alto: ${row.descriptionClean}`,
      body: `${formatCents(-row.amountCents)} em ${row.account.name}, ${formatDayLabel(fromDbDate(row.date), today).toLowerCase()}. Acima do seu limite de ${formatCents(limit)}.`,
      payload: { transactionId: row.id, amountCents: row.amountCents, limitCents: limit },
      dedupeKey: `GASTO_UNICO_ALTO:${row.id}`,
    }),
  );
}

/** Área do mês acima de X% da média dos 3 meses anteriores, por escopo (PF e PJ não se somam). */
async function categoryAboveAverage(rule: ActiveRule, { userId, month }: Context, make: Maker): Promise<NewAlert[]> {
  const limit = rule.params.limiteBps ?? 12_000;
  const alerts: NewAlert[] = [];
  for (const scope of SCOPES) {
    const rows = await getMonthCategoryBreakdown(userId, { scope }, month);
    for (const row of rows) {
      if (row.id === "sem" || row.averageRatioBps === null || row.averageRatioBps <= limit) continue;
      alerts.push(
        make({
          scope,
          title: `${row.name} acima da média`,
          body: `${formatCents(row.cents)} em ${formatMonthLabel(month)}, ${formatBps(row.averageRatioBps)} da média dos últimos 3 meses.`,
          payload: { categoryId: row.id, month, cents: row.cents, ratioBps: row.averageRatioBps },
          dedupeKey: `CATEGORIA_ACIMA_MEDIA:${scope}:${row.id}:${month}`,
        }),
      );
    }
  }
  return alerts;
}

/** Despesa recorrente detectada neste sync. Na primeira detecção de todas (histórico inteiro), não avisa. */
async function newSubscription(_rule: ActiveRule, { userId, since }: Context, make: Maker): Promise<NewAlert[]> {
  const known = await db().recurringSeries.count({ where: { userId, firstDetectedAt: { lt: since } } });
  if (known === 0) return [];
  const series = await db().recurringSeries.findMany({
    where: { userId, status: "ATIVA", avgAmountCents: { lt: 0 }, firstDetectedAt: { gte: since } },
    select: { id: true, scope: true, avgAmountCents: true, intervalDays: true, transactions: { select: { descriptionClean: true }, orderBy: { date: "desc" }, take: 1 } },
  });
  return series.map((item) =>
    make({
      scope: item.scope,
      title: `Assinatura nova: ${item.transactions[0]?.descriptionClean ?? "recorrente"}`,
      body: `${formatCents(-item.avgAmountCents)} ${item.intervalDays === 7 ? "por semana" : item.intervalDays === 365 ? "por ano" : "por mês"}. Já entra na projeção.`,
      payload: { seriesId: item.id, amountCents: item.avgAmountCents },
      dedupeKey: `ASSINATURA_NOVA:${item.id}`,
    }),
  );
}

/** Compras do mês no cartão acima de X% da média dos meses fechados anteriores (até 3). */
async function cardAboveForecast(rule: ActiveRule, { userId, month }: Context, make: Maker): Promise<NewAlert[]> {
  const limit = rule.params.limiteBps ?? 12_000;
  const cards = await db().account.findMany({ where: { userId, type: "CREDIT" }, select: { id: true, name: true, scope: true } });
  const alerts: NewAlert[] = [];
  for (const card of cards) {
    const rows = await db().transaction.findMany({
      where: {
        userId,
        accountId: card.id,
        isIgnored: false,
        transferPeerId: null,
        amountCents: { lt: 0 },
        date: { gte: toDbDate(`${addMonths(month, -3)}-01`) },
        OR: [{ categoryId: null }, { category: { kind: { not: "TRANSFERENCIA" } } }],
      },
      select: { date: true, amountCents: true },
    });
    const first = rows.map((row) => fromDbDate(row.date).slice(0, 7)).sort()[0];
    const history = first ? Math.min(3, monthsBetween(first, month)) : 0;
    if (history <= 0) continue;
    const spent = (from: string, to: string) =>
      -rows.filter((row) => {
        const key = fromDbDate(row.date).slice(0, 7);
        return key >= from && key <= to;
      }).reduce((sum, row) => sum + row.amountCents, 0);
    const current = spent(month, month);
    const average = Math.floor(spent(addMonths(month, -history), addMonths(month, -1)) / history);
    if (!exceedsAverage(current, average, limit)) continue;
    alerts.push(
      make({
        scope: card.scope,
        title: `${card.name}: fatura acima do previsto`,
        body: `${formatCents(current)} em compras neste mês, contra uma média de ${formatCents(average)}.`,
        payload: { accountId: card.id, month, cents: current, averageCents: average },
        dedupeKey: `FATURA_ACIMA_PREVISTO:${card.id}:${month}`,
      }),
    );
  }
  return alerts;
}

async function lateGoals(_rule: ActiveRule, { userId, month }: Context, make: Maker): Promise<NewAlert[]> {
  const goals = await getGoals(userId);
  return goals
    .filter((goal) => goal.progress === "atrasada")
    .map((goal) =>
      make({
        scope: goal.scope,
        title: `Meta atrasada: ${goal.name}`,
        body:
          goal.targetMonth < month
            ? `O prazo (${formatMonthLabel(goal.targetMonth)}) passou e faltam ${formatCents(goal.targetCents - goal.currentCents)}.`
            : `O aporte necessário subiu dois meses seguidos: agora ${formatCents(goal.monthlyRequiredCents)} por mês até ${formatMonthLabel(goal.targetMonth)}.`,
        payload: { goalId: goal.id, month, monthlyRequiredCents: goal.monthlyRequiredCents },
        dedupeKey: `META_ATRASADA:${goal.id}:${month}`,
      }),
    );
}

/** Projeção consolidada negativa no mês corrente ou nos próximos N. Um alerta por mês negativo encontrado. */
async function negativeProjection(rule: ActiveRule, { userId, month }: Context, make: Maker): Promise<NewAlert[]> {
  const projection = await getProjection(userId, { consolidated: true }, { refreshRecurring: false });
  const negative = projection.months.slice(0, (rule.params.meses ?? 3) + 1).find((item) => item.realisticCents < 0);
  if (!negative) return [];
  return [
    make({
      scope: "PF",
      title: `Saldo projetado negativo em ${formatMonthLabel(negative.month)}`,
      body: `Com as premissas de hoje, o saldo pessoal chega a ${formatCents(negative.realisticCents)} no fim do mês.`,
      payload: { month: negative.month, realisticCents: negative.realisticCents },
      dedupeKey: `SALDO_PROJETADO_NEGATIVO:${month}:${negative.month}`,
    }),
  ];
}

/** Reserva de imposto menor que as obrigações fixas que saem dela (o DAS do mês). */
async function lowTaxReserve(_rule: ActiveRule, { userId, month }: Context, make: Maker): Promise<NewAlert[]> {
  const buckets = await db().bucket.findMany({
    where: { userId, type: "RESERVA_IMPOSTO" },
    select: { id: true, name: true, scope: true, balanceCents: true, obligations: { where: { active: true }, select: { amountCents: true } } },
  });
  return buckets.flatMap((bucket) => {
    const needed = bucket.obligations.reduce((sum, obligation) => sum + obligation.amountCents, 0);
    if (needed <= 0 || bucket.balanceCents >= needed) return [];
    return [
      make({
        scope: bucket.scope,
        title: `${bucket.name} abaixo do esperado`,
        body: `Tem ${formatCents(bucket.balanceCents)}, e as obrigações do mês pedem ${formatCents(needed)}. Ajuste o saldo ou reveja o que foi pago com ela.`,
        payload: { bucketId: bucket.id, balanceCents: bucket.balanceCents, neededCents: needed },
        dedupeKey: `RESERVA_IMPOSTO_BAIXA:${bucket.id}:${month}`,
      }),
    ];
  });
}

/** Entradas recentes sem stream: um alerta por escopo cada vez que chega uma nova. */
async function incomeWithoutStream(_rule: ActiveRule, { userId, today }: Context, make: Maker): Promise<NewAlert[]> {
  const rows = await db().transaction.findMany({
    where: { ...incomeQueueWhere(userId), date: { gte: toDbDate(addDays(today, -RECENT_DAYS)) } },
    select: { id: true, amountCents: true, scope: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return SCOPES.flatMap((scope) => {
    const inScope = rows.filter((row) => row.scope === scope);
    const [newest] = inScope;
    if (!newest) return [];
    const total = inScope.reduce((sum, row) => sum + row.amountCents, 0);
    return [
      make({
        scope,
        title: inScope.length === 1 ? "Entrada sem stream" : `${inScope.length} entradas sem stream`,
        body: `${formatCents(total)} recebidos sem fonte de receita. Atribua na fila de revisão para lançar as reservas.`,
        payload: { transactionId: newest.id, count: inScope.length, cents: total },
        dedupeKey: `ENTRADA_SEM_STREAM:${newest.id}`,
      }),
    ];
  });
}

/** Faturamento da PJ no ano (entradas com stream) contra o teto do MEI. */
async function meiLimit(rule: ActiveRule, { userId, today }: Context, make: Maker): Promise<NewAlert[]> {
  const year = today.slice(0, 4);
  const limit = rule.params.limiteCents ?? 0;
  const revenue = await db().transaction.aggregate({
    where: {
      userId,
      scope: "PJ",
      isIgnored: false,
      transferPeerId: null,
      amountCents: { gt: 0 },
      revenueStreamId: { not: null },
      date: { gte: toDbDate(`${year}-01-01`), lte: toDbDate(`${year}-12-31`) },
    },
    _sum: { amountCents: true },
  });
  const cents = revenue._sum.amountCents ?? 0;
  const stage = meiLimitStage(cents, limit, rule.params.avisoBps ?? 8_000);
  if (!stage) return [];
  return [
    make({
      scope: "PJ",
      title: stage === "estourou" ? "Faturamento do MEI passou do teto" : `Faturamento do MEI em ${formatBps(Math.floor((cents * 10_000) / limit))} do teto`,
      body: `${formatCents(cents)} faturados em ${year}, para um teto de ${formatCents(limit)}.`,
      payload: { year, cents, limitCents: limit },
      dedupeKey: `LIMITE_FATURAMENTO_MEI:${year}:${stage}`,
    }),
  ];
}
