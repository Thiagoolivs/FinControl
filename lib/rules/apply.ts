import "server-only";
import { compileRules, pickRule } from "@/lib/categorization/engine";
import { db } from "@/lib/db";

export type ApplyMode =
  /** Só o que ainda não foi classificado (rodado depois de cada sync e ao criar regra). */
  | "sem-categoria"
  /** Também refaz o que foi classificado por regra (retroativo); o que você escolheu à mão fica. */
  | "automaticas";

type Target = { ruleId: string | null; categoryId: string | null; revenueStreamId: string | null };

/**
 * Passa as regras ativas pelas transações candidatas. Saída recebe categoria. Entrada recebe fonte de renda
 * (ou categoria: entrada ou estorno). Transferência pareada e transação ignorada nunca entram. Devolve
 * quantas mudaram.
 */
export async function applyRules(userId: string, mode: ApplyMode): Promise<number> {
  const rules = await db().rule.findMany({
    where: { userId, active: true, OR: [{ categoryId: { not: null } }, { revenueStreamId: { not: null } }] },
    select: { id: true, pattern: true, matchType: true, direction: true, scope: true, priority: true, categoryId: true, revenueStreamId: true },
    orderBy: { createdAt: "asc" },
  });
  const candidates = await db().transaction.findMany({
    where: {
      userId,
      transferPeerId: null,
      isIgnored: false,
      amountCents: { not: 0 },
      OR: mode === "sem-categoria" ? [{ categoryId: null, revenueStreamId: null }] : [{ categoryId: null, revenueStreamId: null }, { ruleId: { not: null } }],
    },
    select: {
      id: true,
      descriptionClean: true,
      descriptionRaw: true,
      amountCents: true,
      scope: true,
      categoryId: true,
      revenueStreamId: true,
      ruleId: true,
    },
  });
  // Saída só é classificada por regra com categoria; entrada, por regra com stream ou categoria.
  const outRules = compileRules(rules.filter((rule) => rule.categoryId));
  const inRules = compileRules(rules);

  const updates = new Map<string, { data: Target; ids: string[] }>();
  const add = (data: Target, id: string) => {
    const key = `${data.ruleId}|${data.categoryId}|${data.revenueStreamId}`;
    const entry = updates.get(key) ?? { data, ids: [] };
    entry.ids.push(id);
    updates.set(key, entry);
  };
  let changed = 0;
  for (const transaction of candidates) {
    const inflow = transaction.amountCents > 0;
    const rule = pickRule(inflow ? inRules : outRules, transaction);
    const target: Target = rule
      ? inflow && rule.revenueStreamId
        ? { ruleId: rule.id, categoryId: null, revenueStreamId: rule.revenueStreamId }
        : { ruleId: rule.id, categoryId: rule.categoryId, revenueStreamId: null }
      : transaction.ruleId
        ? { ruleId: null, categoryId: null, revenueStreamId: null }
        : { ruleId: transaction.ruleId, categoryId: transaction.categoryId, revenueStreamId: transaction.revenueStreamId };
    if (
      target.ruleId === transaction.ruleId &&
      target.categoryId === transaction.categoryId &&
      target.revenueStreamId === transaction.revenueStreamId
    ) {
      continue;
    }
    add(target, transaction.id);
    changed += 1;
  }

  await db().$transaction([...updates.values()].map(({ data, ids }) => db().transaction.updateMany({ where: { userId, id: { in: ids } }, data })));
  if (changed > 0) {
    await refreshHitCounts(userId, [...new Set([...updates.values()].map(({ data }) => data.ruleId).filter((id): id is string => id !== null))]);
  }
  return changed;
}

/** hitCount = quantas transações a regra classifica hoje. `touched` ganha lastHitAt = agora. */
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
