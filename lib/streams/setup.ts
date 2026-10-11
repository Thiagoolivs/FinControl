import "server-only";
import type { RevenueStreamType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { applyRules } from "@/lib/rules/apply";
import { ensureDefaultCategories } from "@/lib/rules/categories";

// Valores iniciais. Tudo editável em Config → Receitas e reservas.
const DEFAULT_STREAMS: { name: string; type: RevenueStreamType }[] = [
  { name: "Salário fixo", type: "SALARIO_FIXO" },
  { name: "Projetos avulsos", type: "PROJETO" },
  { name: "Meu negócio", type: "VENTURE" },
];
// MEI: o DAS é fixo e mensal, reservado por obrigação, não por % da receita.
const DAS_INITIAL_CENTS = 8_650;
const DAS_INITIAL_DUE_DAY = 20;
// Pagamento do DAS sai da reserva de imposto. Exige "DAS" junto de Simples/MEI para não pegar "Padaria das Flores".
const DAS_PATTERN = String.raw`\bDAS\b.*\b(SIMPLES|MEI|PGMEI)\b|\bPGMEI\b|\bSIMPLES NACIONAL\b`;

/**
 * Cria streams, buckets, a obrigação do DAS e a regra de pagamento do DAS na primeira vez (só nela).
 * Seguro com chamadas simultâneas (lock por usuário).
 */
export async function ensureStreamsSetup(userId: string): Promise<boolean> {
  if ((await db().revenueStream.count({ where: { userId } })) > 0) return false;
  await ensureDefaultCategories(userId);
  const created = await createInitialSetup(userId);
  // DAS já categorizado por outra regra (ex.: sugestão da IA) passa para a regra nova, que paga com a reserva.
  if (created) await applyRules(userId, "automaticas");
  return created;
}

function createInitialSetup(userId: string): Promise<boolean> {
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`streams:${userId}`}))`;
    if ((await tx.revenueStream.count({ where: { userId } })) > 0) return false;

    const streams = [];
    for (const stream of DEFAULT_STREAMS) {
      streams.push(await tx.revenueStream.create({ data: { userId, scope: "PJ", color: "neutral", ...stream }, select: { id: true, type: true } }));
    }
    const venture = streams.find((stream) => stream.type === "VENTURE");
    const tax = await tx.bucket.create({
      data: { userId, scope: "PJ", name: "Reserva de imposto", type: "RESERVA_IMPOSTO", color: "neutral" },
      select: { id: true },
    });
    await tx.bucket.create({ data: { userId, scope: "PJ", name: "Reserva de custo", type: "RESERVA_CUSTO", color: "neutral" } });
    if (venture) {
      await tx.bucket.create({
        data: { userId, scope: "PJ", revenueStreamId: venture.id, name: "Caixa do negócio", type: "CAIXA_PROJETO", color: "neutral" },
      });
    }
    await tx.fixedObligation.create({
      data: { userId, scope: "PJ", bucketId: tax.id, name: "DAS MEI", amountCents: DAS_INITIAL_CENTS, dueDay: DAS_INITIAL_DUE_DAY },
    });
    const dasCategory = await tx.category.findFirst({ where: { userId, name: "DAS", parent: { name: "Impostos e tarifas" } }, select: { id: true } });
    await tx.rule.create({
      data: {
        userId,
        pattern: DAS_PATTERN,
        matchType: "REGEX",
        direction: "SAIDA",
        scope: "PJ",
        categoryId: dasCategory?.id ?? null,
        bucketId: tax.id,
        priority: 50,
        origin: "MANUAL",
      },
    });
    return true;
  });
}
