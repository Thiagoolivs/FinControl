import "server-only";
import { z } from "zod";
import { generateJson, isGeminiConfigured, type ResponseSchema } from "@/lib/ai/gemini";
import { compilePattern } from "@/lib/categorization/match";
import { db } from "@/lib/db";
import { categoryOptions, getCategoryTree } from "./categories";
import { getReviewQueue } from "./queue";

// Grupos por chamada ao Gemini. O botão faz alguns lotes seguidos; o sync faz um.
const BATCH_GROUPS = 40;
const MAX_EXAMPLES = 3;

const SYSTEM = `Você categoriza gastos de uma pessoa no Brasil a partir da descrição que aparece no extrato.
Para cada grupo de transações parecidas:
- escolha a categoria mais provável entre as fornecidas, pelo id; se não der para saber, use null;
- proponha o padrão que generaliza aquele gasto para virar regra (ex.: descrição "PAG*IFOOD 4421" → padrão "IFOOD"), sem números de autorização, datas ou parcelas;
- tipo "PREFIX" quando a descrição começa sempre igual, "CONTAINS" quando o nome da loja aparece no meio.
O padrão precisa casar com todas as descrições do grupo. Não invente categorias. Não calcule nada.`;

const schema: ResponseSchema = {
  type: "OBJECT",
  properties: {
    sugestoes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          grupo: { type: "INTEGER" },
          categoriaId: { type: "STRING", nullable: true },
          padrao: { type: "STRING" },
          tipo: { type: "STRING", enum: ["PREFIX", "CONTAINS"] },
        },
        required: ["grupo", "categoriaId", "padrao", "tipo"],
      },
    },
  },
  required: ["sugestoes"],
};

const answer = z.object({
  sugestoes: z.array(
    z.object({
      grupo: z.number().int(),
      categoriaId: z.string().nullable(),
      padrao: z.string(),
      tipo: z.enum(["PREFIX", "CONTAINS"]),
    }),
  ),
});

export type SuggestionRun = {
  /** Grupos e transações que foram para a IA nesta rodada. */
  groups: number;
  transactions: number;
  /** O que ainda está na fila sem sugestão (toque de novo para continuar). */
  remainingGroups: number;
  remainingTransactions: number;
};

/**
 * Pede ao Gemini categoria + padrão para os grupos da fila que ainda não têm sugestão, em até `maxBatches`
 * lotes. Só descrições vão para a API (sem valores, sem contas). Nada vira categoria aqui: vira
 * RuleSuggestion pendente, que você aceita, corrige ou ignora na fila.
 */
export async function suggestWithAi(userId: string, maxBatches = 1): Promise<SuggestionRun> {
  const run: SuggestionRun = { groups: 0, transactions: 0, remainingGroups: 0, remainingTransactions: 0 };
  if (isGeminiConfigured()) {
    for (let batch = 0; batch < maxBatches; batch += 1) {
      const sent = await suggestBatch(userId);
      run.groups += sent.groups;
      run.transactions += sent.transactions;
      if (sent.groups === 0) break;
    }
  }
  const left = await groupsWithoutSuggestion(userId);
  run.remainingGroups = left.length;
  run.remainingTransactions = left.reduce((sum, group) => sum + group.transactions.length, 0);
  return run;
}

/** Grupos da fila sem sugestão pendente e sem sugestão ignorada antes. */
async function groupsWithoutSuggestion(userId: string) {
  const queue = await getReviewQueue(userId);
  return withoutIgnored(
    userId,
    queue.filter((group) => group.suggestion === null),
  );
}

async function suggestBatch(userId: string): Promise<{ groups: number; transactions: number }> {
  const pending = (await groupsWithoutSuggestion(userId)).slice(0, BATCH_GROUPS);
  if (pending.length === 0) return { groups: 0, transactions: 0 };
  const groups = pending;

  const options = categoryOptions(await getCategoryTree(userId));
  const validIds = new Set(options.map((option) => option.id));
  const prompt = JSON.stringify({
    categorias: options.map((option) => ({ id: option.id, nome: option.name })),
    grupos: groups.map((group, index) => ({
      grupo: index,
      descricoes: [...new Set(group.transactions.map((transaction) => transaction.description))].slice(0, MAX_EXAMPLES),
    })),
  });
  const result = await generateJson({ system: SYSTEM, prompt, schema, parse: answer });

  const sent = { groups: 0, transactions: 0 };
  for (const suggestion of result.sugestoes) {
    const group = groups[suggestion.grupo];
    if (!group) continue;
    const categoryId = suggestion.categoriaId && validIds.has(suggestion.categoriaId) ? suggestion.categoriaId : null;
    const compiled = compilePattern(suggestion.padrao, suggestion.tipo);
    const fits = compiled.ok && group.transactions.every((transaction) => compiled.test(transaction.description));
    const pattern = fits ? { pattern: suggestion.padrao.trim(), matchType: suggestion.tipo } : { pattern: group.pattern, matchType: group.matchType };
    const row = await db().ruleSuggestion.create({ data: { userId, ...pattern, categoryId }, select: { id: true } });
    await db().transaction.updateMany({
      where: { userId, id: { in: group.transactions.map((transaction) => transaction.id) } },
      data: { suggestionId: row.id },
    });
    sent.groups += 1;
    sent.transactions += group.transactions.length;
  }
  return sent;
}

/** Grupo com sugestão ignorada antes não volta para a IA. */
async function withoutIgnored<G extends { transactions: { id: string }[] }>(userId: string, groups: G[]): Promise<G[]> {
  const ignored = await db().transaction.findMany({
    where: { userId, id: { in: groups.flatMap((group) => group.transactions.map((transaction) => transaction.id)) }, suggestion: { status: "IGNORADA" } },
    select: { id: true },
  });
  const ignoredIds = new Set(ignored.map((row) => row.id));
  return groups.filter((group) => !group.transactions.some((transaction) => ignoredIds.has(transaction.id)));
}
