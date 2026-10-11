import "server-only";
import type { GoalStatus, Scope } from "@/generated/prisma/enums";
import { isMonth, monthRange, todayLocal, toDbDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { assertCents } from "@/lib/finance/money";
import { RuleInputError } from "@/lib/rules/mutations";

type GoalInput = { name: string; targetCents: number; targetMonth: string };

function assertGoalInput(input: GoalInput): { name: string; targetDate: Date } {
  const name = input.name.trim();
  if (!name) throw new RuleInputError("Dê um nome à meta.");
  if (name.length > 60) throw new RuleInputError("Nome longo demais.");
  assertCents(input.targetCents);
  if (input.targetCents <= 0) throw new RuleInputError("Informe um valor-alvo maior que zero.");
  if (!isMonth(input.targetMonth)) throw new RuleInputError("Escolha o mês do alvo.");
  // A meta vence no último dia do mês escolhido.
  return { name, targetDate: toDbDate(monthRange(input.targetMonth).to) };
}

export async function createGoal(userId: string, input: GoalInput & { scope: Scope; initialCents: number }): Promise<string> {
  const { name, targetDate } = assertGoalInput(input);
  assertCents(input.initialCents);
  if (input.initialCents < 0) throw new RuleInputError("O valor que você já tem não pode ser negativo.");
  return db().$transaction(async (tx) => {
    const goal = await tx.goal.create({
      data: { userId, scope: input.scope, name, targetCents: input.targetCents, targetDate, currentCents: input.initialCents, color: "neutral" },
      select: { id: true },
    });
    if (input.initialCents > 0) {
      await tx.goalContribution.create({
        data: { userId, goalId: goal.id, date: toDbDate(todayLocal()), amountCents: input.initialCents, note: "Saldo inicial" },
      });
    }
    return goal.id;
  });
}

export async function updateGoal(userId: string, goalId: string, input: GoalInput & { status: GoalStatus }): Promise<void> {
  const { name, targetDate } = assertGoalInput(input);
  const updated = await db().goal.updateMany({ where: { id: goalId, userId }, data: { name, targetCents: input.targetCents, targetDate, status: input.status } });
  if (updated.count === 0) throw new RuleInputError("Meta não encontrada.");
}

/** Aporte (positivo) ou resgate (negativo). O saldo da meta é a soma deles. */
export async function addContribution(userId: string, goalId: string, input: { date: string; amountCents: number; note: string }): Promise<void> {
  assertCents(input.amountCents);
  if (input.amountCents === 0) throw new RuleInputError("Informe um valor.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date > todayLocal()) throw new RuleInputError("Data inválida.");
  const goal = await db().goal.findFirst({ where: { id: goalId, userId }, select: { id: true } });
  if (!goal) throw new RuleInputError("Meta não encontrada.");
  await db().goalContribution.create({
    data: { userId, goalId, date: toDbDate(input.date), amountCents: input.amountCents, note: input.note.trim().slice(0, 120) || null },
  });
  await refreshGoalBalance(userId, goalId);
}

export async function deleteContribution(userId: string, contributionId: string): Promise<void> {
  const contribution = await db().goalContribution.findFirst({ where: { id: contributionId, userId }, select: { goalId: true } });
  if (!contribution) throw new RuleInputError("Aporte não encontrado.");
  await db().goalContribution.deleteMany({ where: { id: contributionId, userId } });
  await refreshGoalBalance(userId, contribution.goalId);
}

/** Goal.currentCents é cache de Σ GoalContribution. */
async function refreshGoalBalance(userId: string, goalId: string): Promise<void> {
  const sum = await db().goalContribution.aggregate({ where: { userId, goalId }, _sum: { amountCents: true } });
  await db().goal.updateMany({ where: { id: goalId, userId }, data: { currentCents: sum._sum.amountCents ?? 0 } });
}
