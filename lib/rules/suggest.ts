import "server-only";
import { z } from "zod";
import { generateJson, isGeminiConfigured, type ResponseSchema } from "@/lib/ai/gemini";
import { compilePattern } from "@/lib/categorization/match";
import { db } from "@/lib/db";
import { categoryOptions, getCategoryTree } from "./categories";
import { getReviewQueue } from "./queue";

// Um lote por chamada: suficiente para a fila do dia e barato.
const MAX_GROUPS = 40;
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

/**
 * Pede ao Gemini categoria + padrão para os grupos da fila que ainda não têm sugestão.
 * Só descrições vão para a API (sem valores, sem contas). Nada é gravado como categoria aqui:
 * vira RuleSuggestion pendente, que você aceita, corrige ou ignora na fila.
 */
export async function suggestWithAi(userId: string): Promise<number> {
  if (!isGeminiConfigured()) return 0;
  const queue = await getReviewQueue(userId);
  const pending = queue.filter((group) => group.suggestion === null).slice(0, MAX_GROUPS);
  if (pending.length === 0) return 0;
  const alreadySuggested = await db().transaction.count({
    where: { userId, id: { in: pending.flatMap((group) => group.transactions.map((transaction) => transaction.id)) }, suggestionId: { not: null } },
  });
  // Grupo com sugestão ignorada antes não volta para a IA.
  const groups = alreadySuggested === 0 ? pending : await withoutIgnored(userId, pending);
  if (groups.length === 0) return 0;

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

  let created = 0;
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
    created += 1;
  }
  return created;
}

async function withoutIgnored<G extends { transactions: { id: string }[] }>(userId: string, groups: G[]): Promise<G[]> {
  const ignored = await db().transaction.findMany({
    where: { userId, id: { in: groups.flatMap((group) => group.transactions.map((transaction) => transaction.id)) }, suggestion: { status: "IGNORADA" } },
    select: { id: true },
  });
  const ignoredIds = new Set(ignored.map((row) => row.id));
  return groups.filter((group) => !group.transactions.some((transaction) => ignoredIds.has(transaction.id)));
}
