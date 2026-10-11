"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { describeRuleError } from "@/lib/rules/action-error";
import { createRule, deleteRule, moveRule, setRuleActive, updateRule } from "@/lib/rules/mutations";
import type { ActionState } from "../../actions";

const ruleInput = z.object({
  id: z.string().nullable(),
  pattern: z.string().trim().min(1, "Informe um padrão.").max(200),
  matchType: z.enum(["PREFIX", "CONTAINS", "REGEX"]),
  direction: z.enum(["AMBAS", "ENTRADA", "SAIDA"]),
  scope: z.enum(["AMBOS", "PF", "PJ"]),
  categoryId: z.string().min(1, "Escolha a categoria."),
  priority: z.number().int().min(1).max(9999),
  applyRetroactively: z.boolean(),
});

export async function saveRuleAction(input: z.input<typeof ruleInput>): Promise<ActionState> {
  const user = await requireUser();
  const parsed = ruleInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { id, applyRetroactively, scope, ...rest } = parsed.data;
  const data = { ...rest, scope: scope === "AMBOS" ? null : scope };
  try {
    const changed = id
      ? await updateRule(user.id, id, data)
      : (await createRule(user.id, data, { origin: "MANUAL", applyRetroactively })).changed;
    revalidatePath("/", "layout");
    return { notice: `Regra salva. ${changed} ${changed === 1 ? "transação mudou" : "transações mudaram"}.` };
  } catch (error) {
    return { error: describeRuleError(error) };
  }
}

export async function deleteRuleAction(input: { id: string; returnToQueue: boolean }): Promise<ActionState> {
  const user = await requireUser();
  try {
    await deleteRule(user.id, input.id, input.returnToQueue);
    revalidatePath("/", "layout");
    return { notice: "Regra apagada." };
  } catch (error) {
    return { error: describeRuleError(error) };
  }
}

export async function moveRuleAction(input: { id: string; direction: "up" | "down" }): Promise<ActionState> {
  const user = await requireUser();
  await moveRule(user.id, input.id, input.direction === "up" ? "up" : "down");
  revalidatePath("/", "layout");
  return {};
}

export async function toggleRuleAction(input: { id: string; active: boolean }): Promise<ActionState> {
  const user = await requireUser();
  try {
    await setRuleActive(user.id, input.id, input.active);
    revalidatePath("/", "layout");
    return {};
  } catch (error) {
    return { error: describeRuleError(error) };
  }
}
