"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { GeminiError, isGeminiConfigured } from "@/lib/ai/gemini";
import { describeRuleError } from "@/lib/rules/action-error";
import { categorizeGroup, ignoreSuggestion, setTransactionCategory, setTransactionIgnored } from "@/lib/rules/mutations";
import { suggestWithAi } from "@/lib/rules/suggest";
import { createRateLimiter } from "@/lib/security/rate-limit";
import type { ActionState } from "../actions";

const aiLimiter = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });

const groupInput = z.object({
  transactionIds: z.array(z.string().min(1)).min(1).max(500),
  categoryId: z.string().min(1, "Escolha uma categoria."),
  createRule: z.boolean(),
  pattern: z.string().max(200),
  matchType: z.enum(["PREFIX", "CONTAINS", "REGEX"]),
  suggestionId: z.string().nullable(),
});

export async function categorizeGroupAction(input: z.input<typeof groupInput>): Promise<ActionState> {
  const user = await requireUser();
  const parsed = groupInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const data = parsed.data;
  try {
    await categorizeGroup(user.id, {
      transactionIds: data.transactionIds,
      categoryId: data.categoryId,
      rule: data.createRule ? { pattern: data.pattern, matchType: data.matchType } : null,
      suggestionId: data.suggestionId,
    });
    revalidatePath("/", "layout");
    return { notice: data.createRule ? "Regra criada e aplicada." : "Categorizadas." };
  } catch (error) {
    return { error: describeRuleError(error) };
  }
}

export async function ignoreSuggestionAction(suggestionId: string): Promise<ActionState> {
  const user = await requireUser();
  await ignoreSuggestion(user.id, suggestionId);
  revalidatePath("/transacoes/revisar");
  return { notice: "Sugestão descartada." };
}

export async function suggestNowAction(): Promise<ActionState> {
  const user = await requireUser();
  if (!isGeminiConfigured()) return { error: "Defina GEMINI_API_KEY e GEMINI_MODEL no Railway para receber sugestões da IA." };
  if (!aiLimiter.hit(user.id).allowed) return { error: "Muitos pedidos seguidos. Espere um pouco." };
  try {
    const created = await suggestWithAi(user.id);
    revalidatePath("/transacoes/revisar");
    return { notice: created === 0 ? "Nada novo para sugerir." : `${created} ${created === 1 ? "sugestão" : "sugestões"}.` };
  } catch (error) {
    if (error instanceof GeminiError) return { error: error.message };
    console.error(error);
    return { error: "A IA não respondeu. Tente de novo em instantes." };
  }
}

export async function setCategoryAction(input: { transactionId: string; categoryId: string | null }): Promise<ActionState> {
  const user = await requireUser();
  try {
    await setTransactionCategory(user.id, input.transactionId, input.categoryId || null);
    revalidatePath("/", "layout");
    return { notice: input.categoryId ? "Categoria salva." : "Voltou para a fila de revisão." };
  } catch (error) {
    return { error: describeRuleError(error) };
  }
}

export async function setIgnoredAction(input: { transactionId: string; ignored: boolean }): Promise<ActionState> {
  const user = await requireUser();
  try {
    await setTransactionIgnored(user.id, input.transactionId, input.ignored);
    revalidatePath("/", "layout");
    return { notice: input.ignored ? "Ignorada: fora dos totais e da fila." : "Voltou a contar." };
  } catch (error) {
    return { error: describeRuleError(error) };
  }
}
