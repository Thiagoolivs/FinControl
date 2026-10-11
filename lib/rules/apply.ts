import "server-only";
import { compileRules, pickRule } from "@/lib/categorization/engine";
import { db } from "@/lib/db";

export type ApplyMode =
  /** Só o que está sem categoria (rodado depois de cada sync e ao criar regra). */
  | "sem-categoria"
  /** Também refaz o que foi categorizado por regra (retroativo); o que você categorizou à mão fica. */
  | "automaticas";

/**
 * Passa as regras ativas pelas transações candidatas e grava categoria + regra de origem.
 * Transferência pareada e transação ignorada nunca entram. Devolve quantas mudaram.
 */
export async function applyRules(userId: string, mode: ApplyMode): Promise<number> {
  const rules = await db().rule.findMany({
    where: { userId, active: true, categoryId: { not: null } },
    select: { id: true, pattern: true, matchType: true, direction: true, scope: true, priority: true, categoryId: true },
    orderBy: { createdAt: "asc" },
  });
  const candidates = await db().transaction.findMany({
    where: {
      userId,
      transferPeerId: null,
      isIgnored: false,
      OR: mode === "sem-categoria" ? [{ categoryId: null }] : [{ categoryId: null }, { ruleId: { not: null } }],
    },
    select: { id: true, descriptionClean: true, descriptionRaw: true, amountCents: true, scope: true, categoryId: true, ruleId: true },
  });
  const compiled = compileRules(rules);

  // Agrupa por destino para gravar em lote: uma updateMany por (regra) e uma para "voltou à fila".
  const byRule = new Map<string, string[]>();
  const backToQueue: string[] = [];
  for (const transaction of candidates) {
    const rule = pickRule(compiled, transaction);
    if (rule) {
      if (rule.id === transaction.ruleId && rule.categoryId === transaction.categoryId) continue;
      byRule.set(rule.id, [...(byRule.get(rule.id) ?? []), transaction.id]);
    } else if (transaction.ruleId) {
      backToQueue.push(transaction.id);
    }
  }

  const categoryOf = new Map(rules.map((rule) => [rule.id, rule.categoryId]));
  await db().$transaction([
    ...[...byRule].map(([ruleId, ids]) =>
      db().transaction.updateMany({ where: { userId, id: { in: ids } }, data: { ruleId, categoryId: categoryOf.get(ruleId) } }),
    ),
    ...(backToQueue.length > 0
      ? [db().transaction.updateMany({ where: { userId, id: { in: backToQueue } }, data: { ruleId: null, categoryId: null } })]
      : []),
  ]);
  if (byRule.size > 0 || backToQueue.length > 0) await refreshHitCounts(userId, [...byRule.keys()]);
  return [...byRule.values()].reduce((sum, ids) => sum + ids.length, 0) + backToQueue.length;
}

/** hitCount = quantas transações a regra categoriza hoje. `touched` ganha lastHitAt = agora. */
export async function refreshHitCounts(userId: string, touched: readonly string[] = []): Promise<void> {
  const counts = await db().transaction.groupBy({ by: ["ruleId"], where: { userId, ruleId: { not: null } }, _count: { _all: true } });
  const rules = await db().rule.findMany({ where: { userId }, select: { id: true, hitCount: true } });
  const countOf = new Map(counts.map((row) => [row.ruleId, row._count._all]));
  const now = new Date();
  await db().$transaction(
    rules
      .filter((rule) => (countOf.get(rule.id) ?? 0) !== rule.hitCount || touched.includes(rule.id))
      .map((rule) =>
        db().rule.update({
          where: { id: rule.id, userId },
          data: { hitCount: countOf.get(rule.id) ?? 0, ...(touched.includes(rule.id) ? { lastHitAt: now } : {}) },
        }),
      ),
  );
}
