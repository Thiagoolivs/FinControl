import "server-only";
import type { GoalStatus, Scope } from "@/generated/prisma/enums";
import { addDays, fromDbDate, localDateOf, todayLocal } from "@/lib/dates";
import { db } from "@/lib/db";
import { type Contribution, completionMonth, isGoalLate, monthlyPaceCents, requiredAtMonthStart } from "@/lib/finance/goals";
import { ensureGoalsSetup } from "./setup";

export type GoalProgress = "sem-alvo" | "concluida" | "pausada" | "atrasada" | "no-prazo";

export type GoalView = {
  id: string;
  name: string;
  scope: Scope;
  status: GoalStatus;
  targetCents: number;
  currentCents: number;
  targetDate: string;
  targetMonth: string;
  createdMonth: string;
  progress: GoalProgress;
  /** Aporte necessário calculado no começo deste mês. */
  monthlyRequiredCents: number;
  contributedThisMonthCents: number;
  /** Média dos últimos meses fechados; null sem mês fechado para medir. */
  paceCents: number | null;
  /** Mês em que fecha no ritmo atual; null quando não fecha. */
  realisticMonth: string | null;
};

type GoalRow = {
  id: string;
  name: string;
  scope: Scope;
  status: GoalStatus;
  targetCents: number;
  targetDate: Date;
  createdAt: Date;
  contributions: { date: Date; amountCents: number }[];
};

function toView(row: GoalRow, currentMonth: string): GoalView {
  // O que entra no dia da criação é saldo inicial: conta como se já estivesse lá antes do mês começar, então
  // não infla o aporte do mês nem o ritmo.
  const createdDate = localDateOf(row.createdAt);
  const beforeCreationMonth = addDays(`${createdDate.slice(0, 7)}-01`, -1);
  const contributions: Contribution[] = row.contributions.map((contribution) => {
    const date = fromDbDate(contribution.date);
    return { date: date === createdDate ? beforeCreationMonth : date, amountCents: contribution.amountCents };
  });
  const currentCents = contributions.reduce((sum, contribution) => sum + contribution.amountCents, 0);
  const targetDate = fromDbDate(row.targetDate);
  const goal = { targetCents: row.targetCents, currentCents, targetMonth: targetDate.slice(0, 7), createdMonth: createdDate.slice(0, 7) };
  const paceCents = monthlyPaceCents(contributions, currentMonth, goal.createdMonth);
  const progress: GoalProgress =
    row.targetCents <= 0
      ? "sem-alvo"
      : currentCents >= row.targetCents
        ? "concluida"
        : row.status !== "ATIVA"
          ? "pausada"
          : isGoalLate(goal, contributions, currentMonth)
            ? "atrasada"
            : "no-prazo";
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    status: row.status,
    targetCents: row.targetCents,
    currentCents,
    targetDate,
    targetMonth: goal.targetMonth,
    createdMonth: goal.createdMonth,
    progress,
    monthlyRequiredCents: row.targetCents > 0 ? requiredAtMonthStart(goal, contributions, currentMonth) : 0,
    contributedThisMonthCents: contributions.filter((contribution) => contribution.date >= `${currentMonth}-01`).reduce((sum, contribution) => sum + contribution.amountCents, 0),
    paceCents,
    realisticMonth: paceCents === null ? null : completionMonth(row.targetCents - currentCents, paceCents, currentMonth),
  };
}

const GOAL_SELECT = {
  id: true,
  name: true,
  scope: true,
  status: true,
  targetCents: true,
  targetDate: true,
  createdAt: true,
  currentCents: true,
  monthlyRequiredCents: true,
} as const;

/**
 * Metas com progresso calculado do histórico de aportes. Atualiza o cache da meta (atual e aporte
 * necessário) e a foto do mês (GoalSnapshot) quando mudam.
 */
export async function getGoals(userId: string, options: { includeArchived?: boolean } = {}): Promise<GoalView[]> {
  await ensureGoalsSetup(userId);
  const [goals, contributions] = await Promise.all([
    db().goal.findMany({
      where: { userId, ...(options.includeArchived ? {} : { status: { not: "ARQUIVADA" } }) },
      select: GOAL_SELECT,
      orderBy: { createdAt: "asc" },
    }),
    db().goalContribution.findMany({ where: { userId }, select: { goalId: true, date: true, amountCents: true } }),
  ]);
  const currentMonth = todayLocal().slice(0, 7);
  const views = goals.map((goal) => toView({ ...goal, contributions: contributions.filter((contribution) => contribution.goalId === goal.id) }, currentMonth));
  await syncCaches(userId, goals, views, currentMonth);
  return views;
}

export async function getGoal(userId: string, goalId: string) {
  const goal = await db().goal.findFirst({ where: { id: goalId, userId }, select: GOAL_SELECT });
  if (!goal) return null;
  const contributions = await db().goalContribution.findMany({
    where: { userId, goalId },
    select: { id: true, date: true, amountCents: true, note: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const currentMonth = todayLocal().slice(0, 7);
  const view = toView({ ...goal, contributions }, currentMonth);
  await syncCaches(userId, [goal], [view], currentMonth);
  return { ...view, contributions: contributions.map((contribution) => ({ ...contribution, date: fromDbDate(contribution.date) })) };
}

async function syncCaches(
  userId: string,
  rows: readonly { id: string; currentCents: number; monthlyRequiredCents: number }[],
  views: readonly GoalView[],
  month: string,
): Promise<void> {
  const writes = views.flatMap((view) => {
    const row = rows.find((candidate) => candidate.id === view.id);
    const stale = row && (row.currentCents !== view.currentCents || row.monthlyRequiredCents !== view.monthlyRequiredCents);
    return [
      ...(stale
        ? [db().goal.update({ where: { id: view.id, userId }, data: { currentCents: view.currentCents, monthlyRequiredCents: view.monthlyRequiredCents } })]
        : []),
      db().goalSnapshot.upsert({
        where: { goalId_month: { goalId: view.id, month } },
        create: { userId, goalId: view.id, month, currentCents: view.currentCents, monthlyRequiredCents: view.monthlyRequiredCents },
        update: { currentCents: view.currentCents, monthlyRequiredCents: view.monthlyRequiredCents },
      }),
    ];
  });
  if (writes.length > 0) await db().$transaction(writes);
}
