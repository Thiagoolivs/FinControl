"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { GeminiError, isGeminiConfigured } from "@/lib/ai/gemini";
import { db } from "@/lib/db";
import { describeRuleError } from "@/lib/rules/action-error";
import { acceptAllSuggestions, categorizeGroup, ignoreSuggestion, setTransactionCategory, setTransactionIgnored } from "@/lib/rules/mutations";
import { suggestWithAi } from "@/lib/rules/suggest";
import { assignStreamToGroup, createStream, setTransactionBucket, setTransactionStream } from "@/lib/streams/mutations";
import { createRateLimiter } from "@/lib/security/rate-limit";
import type { ActionState } from "../actions";

const aiLimiter = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });
// Lotes por toque no botão: até 120 grupos por vez sem estourar o tempo da requisição.
const MANUAL_BATCHES = 3;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

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
    const run = await suggestWithAi(user.id, MANUAL_BATCHES);
    revalidatePath("/transacoes/revisar");
    if (run.groups === 0) return { notice: "Nada novo para sugerir." };
    const sent = `A IA analisou ${plural(run.groups, "grupo", "grupos")} (${plural(run.transactions, "transação", "transações")}).`;
    const left =
      run.remainingGroups === 0
        ? " Não falta nenhum."
        : ` Faltam ${plural(run.remainingGroups, "grupo", "grupos")} (${plural(run.remainingTransactions, "transação", "transações")}): toque de novo para continuar.`;
    return { notice: sent + left };
  } catch (error) {
    if (error instanceof GeminiError) return { error: error.message };
    console.error(error);
    return { error: "A IA não respondeu. Tente de novo em instantes." };
  }
}

export async function acceptAllSuggestionsAction(): Promise<ActionState> {
  const user = await requireUser();
  try {
    const result = await acceptAllSuggestions(user.id);
    revalidatePath("/", "layout");
    return { notice: `${plural(result.rules, "regra criada", "regras criadas")}, ${plural(result.transactions, "transação categorizada", "transações categorizadas")}.` };
  } catch (error) {
    return { error: describeRuleError(error) };
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

const streamGroupInput = z
  .object({
    transactionIds: z.array(z.string().min(1)).min(1).max(500),
    revenueStreamId: z.string().min(1).nullable(),
    // Fonte nova criada ali mesmo, na fila, em vez de ir até Config → Receitas.
    newStream: z
      .object({
        name: z.string().trim().min(1, "Dê um nome à fonte de receita.").max(60),
        type: z.enum(["SALARIO_FIXO", "PROJETO", "VENTURE", "OUTRO"]),
        scope: z.enum(["PF", "PJ"]),
      })
      .nullable()
      .default(null),
    createRule: z.boolean(),
    pattern: z.string().max(200),
    matchType: z.enum(["PREFIX", "CONTAINS", "REGEX"]),
  })
  .refine((input) => input.revenueStreamId !== null || input.newStream !== null, "Escolha a stream de receita.");

export async function assignStreamGroupAction(input: z.input<typeof streamGroupInput>): Promise<ActionState> {
  const user = await requireUser();
  const parsed = streamGroupInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const data = parsed.data;
  try {
    const revenueStreamId = data.revenueStreamId ?? (data.newStream ? await createStream(user.id, data.newStream) : "");
    await assignStreamToGroup(user.id, {
      transactionIds: data.transactionIds,
      revenueStreamId,
      rule: data.createRule ? { pattern: data.pattern, matchType: data.matchType } : null,
    });
    revalidatePath("/", "layout");
    return { notice: "Receita atribuída; reservas lançadas." };
  } catch (error) {
    return { error: describeRuleError(error) };
  }
}

export async function setStreamAction(input: { transactionId: string; revenueStreamId: string | null }): Promise<ActionState> {
  const user = await requireUser();
  try {
    await setTransactionStream(user.id, input.transactionId, input.revenueStreamId || null);
    revalidatePath("/", "layout");
    return { notice: input.revenueStreamId ? "Stream salva; reservas lançadas." : "Voltou para a fila de revisão." };
  } catch (error) {
    return { error: describeRuleError(error) };
  }
}

export async function setBucketAction(input: { transactionId: string; bucketId: string | null }): Promise<ActionState> {
  const user = await requireUser();
  try {
    await setTransactionBucket(user.id, input.transactionId, input.bucketId || null);
    revalidatePath("/", "layout");
    return { notice: input.bucketId ? "Saída lançada no bucket." : "Não sai mais de bucket." };
  } catch (error) {
    return { error: describeRuleError(error) };
  }
}

const reviewWindowInput = z.union([z.literal(30), z.literal(60), z.literal(90), z.null()]);

/** Janela da fila de revisão (30, 60 ou 90 dias; null = todo o histórico). */
export async function setReviewWindowAction(days: z.input<typeof reviewWindowInput>): Promise<ActionState> {
  const user = await requireUser();
  const parsed = reviewWindowInput.safeParse(days);
  if (!parsed.success) return { error: "Janela inválida." };
  await db().user.update({ where: { id: user.id }, data: { reviewWindowDays: parsed.data } });
  revalidatePath("/", "layout");
  return { notice: parsed.data === null ? "A fila mostra todo o histórico." : `A fila mostra os últimos ${parsed.data} dias.` };
}
