import "server-only";
import type { RevenueStreamType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { applyRules } from "@/lib/rules/apply";
import { ensureDefaultCategories } from "@/lib/rules/categories";

// Valores iniciais. Tudo editável em Config → Fontes de renda.
const DEFAULT_STREAMS: { name: string; type: RevenueStreamType }[] = [
  { name: "Salário fixo", type: "SALARIO_FIXO" },
  { name: "Projetos avulsos", type: "PROJETO" },
  { name: "Meu negócio", type: "VENTURE" },
];
// MEI: o DAS é fixo e mensal. Vira um lembrete de vencimento, não uma reserva.
const DAS_INITIAL_CENTS = 8_650;
const DAS_INITIAL_DUE_DAY = 20;
// Exige "DAS" junto de Simples/MEI para não pegar "Padaria das Flores".
const DAS_PATTERN = String.raw`\bDAS\b.*\b(SIMPLES|MEI|PGMEI)\b|\bPGMEI\b|\bSIMPLES NACIONAL\b`;

/**
 * Cria as fontes de renda, o lembrete do DAS e a regra que categoriza o pagamento do DAS na primeira vez
 * (só nela). Seguro com chamadas simultâneas (lock por usuário).
 */
export async function ensureStreamsSetup(userId: string): Promise<boolean> {
  if ((await db().revenueStream.count({ where: { userId } })) > 0) return false;
  await ensureDefaultCategories(userId);
  const created = await createInitialSetup(userId);
  if (created) await applyRules(userId, "sem-categoria");
  return created;
}

function createInitialSetup(userId: string): Promise<boolean> {
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`streams:${userId}`}))`;
    if ((await tx.revenueStream.count({ where: { userId } })) > 0) return false;
    for (const stream of DEFAULT_STREAMS) {
      await tx.revenueStream.create({ data: { userId, scope: "PJ", color: "neutral", ...stream } });
    }
    await tx.fixedObligation.create({ data: { userId, scope: "PJ", name: "DAS MEI", amountCents: DAS_INITIAL_CENTS, dueDay: DAS_INITIAL_DUE_DAY } });
    const dasCategory = await tx.category.findFirst({ where: { userId, name: "DAS", parent: { name: "Impostos e tarifas" } }, select: { id: true } });
    if (dasCategory) {
      await tx.rule.create({
        data: { userId, pattern: DAS_PATTERN, matchType: "REGEX", direction: "SAIDA", scope: "PJ", categoryId: dasCategory.id, priority: 50, origin: "MANUAL" },
      });
    }
    return true;
  });
}
