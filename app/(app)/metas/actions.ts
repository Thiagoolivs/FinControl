"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { parseCents } from "@/lib/finance/money";
import { addContribution, createGoal, deleteContribution, updateGoal } from "@/lib/goals/mutations";
import { describeRuleError } from "@/lib/rules/action-error";
import type { ActionState } from "../actions";

async function run(task: () => Promise<unknown>, notice: string): Promise<ActionState> {
  try {
    await task();
    revalidatePath("/", "layout");
    return { notice };
  } catch (error) {
    return { error: describeRuleError(error) };
  }
}

const goalInput = z.object({
  name: z.string().max(60),
  target: z.string(),
  targetMonth: z.string(),
});

function parseGoal(input: z.input<typeof goalInput>) {
  const parsed = goalInput.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." } as const;
  const targetCents = parseCents(parsed.data.target);
  if (targetCents === null || targetCents <= 0) return { error: "Valor-alvo inválido. Ex.: 50.000" } as const;
  return { data: { name: parsed.data.name, targetCents, targetMonth: parsed.data.targetMonth } } as const;
}

export async function createGoalAction(
  input: z.input<typeof goalInput> & { initial: string; scope: "PF" | "PJ" },
): Promise<ActionState & { id?: string }> {
  const user = await requireUser();
  const goal = parseGoal(input);
  if ("error" in goal) return { error: goal.error };
  const initialCents = input.initial.trim() ? parseCents(input.initial) : 0;
  if (initialCents === null || initialCents < 0) return { error: "Valor que você já tem é inválido." };
  if (input.scope !== "PF" && input.scope !== "PJ") return { error: "Escopo inválido." };
  try {
    const id = await createGoal(user.id, { ...goal.data, scope: input.scope, initialCents });
    revalidatePath("/", "layout");
    return { notice: "Meta criada.", id };
  } catch (error) {
    return { error: describeRuleError(error) };
  }
}

export async function updateGoalAction(
  input: z.input<typeof goalInput> & { id: string; status: "ATIVA" | "PAUSADA" | "ARQUIVADA" },
): Promise<ActionState> {
  const user = await requireUser();
  const goal = parseGoal(input);
  if ("error" in goal) return { error: goal.error };
  if (!["ATIVA", "PAUSADA", "ARQUIVADA"].includes(input.status)) return { error: "Situação inválida." };
  return run(() => updateGoal(user.id, input.id, { ...goal.data, status: input.status }), "Meta salva.");
}

export async function addContributionAction(input: {
  goalId: string;
  kind: "aporte" | "resgate";
  value: string;
  date: string;
  note: string;
}): Promise<ActionState> {
  const user = await requireUser();
  const cents = parseCents(input.value);
  if (cents === null || cents <= 0) return { error: "Valor inválido. Ex.: 1.000,00" };
  const amountCents = input.kind === "resgate" ? -cents : cents;
  return run(
    () => addContribution(user.id, input.goalId, { date: input.date, amountCents, note: input.note }),
    input.kind === "resgate" ? "Resgate registrado." : "Aporte registrado.",
  );
}

export async function deleteContributionAction(contributionId: string): Promise<ActionState> {
  const user = await requireUser();
  return run(() => deleteContribution(user.id, contributionId), "Lançamento apagado.");
}
