import "server-only";
import type { CategoryKind, MatchType, RuleDirection, RuleOrigin, Scope } from "@/generated/prisma/enums";
import { compilePattern } from "@/lib/categorization/match";
import { db } from "@/lib/db";
import { unpairTransfers } from "@/lib/sync/transfers";
import { applyRules, refreshHitCounts } from "./apply";

export class RuleInputError extends Error {}

const DEFAULT_PRIORITY = 100;
const PRIORITY_STEP = 10;

export type RuleInput = {
  pattern: string;
  matchType: MatchType;
  direction: RuleDirection;
  scope: Scope | null;
  categoryId: string;
  priority: number;
};

async function assertCategory(userId: string, categoryId: string): Promise<void> {
  const found = await db().category.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
  if (!found) throw new RuleInputError("Categoria não encontrada.");
}

function assertPattern(input: Pick<RuleInput, "pattern" | "matchType">): void {
  const compiled = compilePattern(input.pattern, input.matchType);
  if (!compiled.ok) throw new RuleInputError(compiled.error);
}

/**
 * Cria a regra e aplica. Sem retroativo, ela só pega o que está sem categoria (e o que chegar);
 * com retroativo, refaz tudo que foi categorizado por regra. Categorização manual nunca é tocada.
 */
export async function createRule(
  userId: string,
  input: RuleInput,
  options: { origin: RuleOrigin; applyRetroactively: boolean },
): Promise<{ ruleId: string; changed: number }> {
  assertPattern(input);
  await assertCategory(userId, input.categoryId);
  const rule = await db().rule.create({
    data: { userId, ...input, pattern: input.pattern.trim(), origin: options.origin },
    select: { id: true },
  });
  await db().auditLog.create({
    data: {
      userId,
      action: "rule.create",
      entity: "Rule",
      entityId: rule.id,
      after: { ...input },
      origin: options.origin === "IA_CONFIRMADA" ? "AI" : "USER",
    },
  });
  const changed = await applyRules(userId, options.applyRetroactively ? "automaticas" : "sem-categoria");
  return { ruleId: rule.id, changed };
}

/** Editar refaz tudo que é de regra: o que a regra categoriza passa a ser sempre o que ela diz agora. */
export async function updateRule(userId: string, ruleId: string, input: RuleInput): Promise<number> {
  assertPattern(input);
  await assertCategory(userId, input.categoryId);
  const updated = await db().rule.updateMany({ where: { id: ruleId, userId }, data: { ...input, pattern: input.pattern.trim() } });
  if (updated.count === 0) throw new RuleInputError("Regra não encontrada.");
  return applyRules(userId, "automaticas");
}

/**
 * Apaga a regra. `returnToQueue` devolve as transações que ela categorizou (outras regras podem pegá-las);
 * sem isso elas mantêm a categoria, como se você tivesse escolhido à mão.
 */
export async function deleteRule(userId: string, ruleId: string, returnToQueue: boolean): Promise<void> {
  const rule = await db().rule.findFirst({ where: { id: ruleId, userId }, select: { id: true } });
  if (!rule) throw new RuleInputError("Regra não encontrada.");
  await db().$transaction([
    ...(returnToQueue ? [db().transaction.updateMany({ where: { userId, ruleId }, data: { ruleId: null, categoryId: null } })] : []),
    db().ruleSuggestion.updateMany({ where: { userId, ruleId }, data: { ruleId: null } }),
    db().rule.delete({ where: { id: ruleId } }),
  ]);
  if (returnToQueue) await applyRules(userId, "sem-categoria");
}

export async function setRuleActive(userId: string, ruleId: string, active: boolean): Promise<void> {
  const updated = await db().rule.updateMany({ where: { id: ruleId, userId }, data: { active } });
  if (updated.count === 0) throw new RuleInputError("Regra não encontrada.");
  await applyRules(userId, "automaticas");
}

/** Sobe ou desce uma posição e renumera tudo de 10 em 10, para a ordem nunca empatar. */
export async function moveRule(userId: string, ruleId: string, direction: "up" | "down"): Promise<void> {
  const rules = await db().rule.findMany({ where: { userId }, select: { id: true }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
  const index = rules.findIndex((rule) => rule.id === ruleId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= rules.length) return;
  const ordered = [...rules];
  [ordered[index], ordered[target]] = [ordered[target] as (typeof rules)[number], ordered[index] as (typeof rules)[number]];
  await db().$transaction(
    ordered.map((rule, position) => db().rule.update({ where: { id: rule.id, userId }, data: { priority: (position + 1) * PRIORITY_STEP } })),
  );
  await applyRules(userId, "automaticas");
}

/**
 * Resolve um grupo da fila: com padrão, cria a regra (e ela pega o grupo e o que mais casar);
 * sem padrão, só categoriza estas transações. Sugestão da IA aceita sem mudança vira regra IA_CONFIRMADA.
 */
export async function categorizeGroup(
  userId: string,
  input: {
    transactionIds: string[];
    categoryId: string;
    rule: { pattern: string; matchType: MatchType } | null;
    suggestionId: string | null;
  },
): Promise<void> {
  await assertCategory(userId, input.categoryId);
  const suggestion = input.suggestionId
    ? await db().ruleSuggestion.findFirst({ where: { id: input.suggestionId, userId, status: "PENDENTE" } })
    : null;
  const accepted =
    suggestion !== null &&
    input.rule !== null &&
    suggestion.categoryId === input.categoryId &&
    suggestion.pattern === input.rule.pattern.trim() &&
    suggestion.matchType === input.rule.matchType;

  let ruleId: string | null = null;
  if (input.rule) {
    assertPattern(input.rule);
    ruleId = (
      await createRule(
        userId,
        { ...input.rule, direction: "AMBAS", scope: null, categoryId: input.categoryId, priority: DEFAULT_PRIORITY },
        { origin: accepted ? "IA_CONFIRMADA" : "MANUAL", applyRetroactively: false },
      )
    ).ruleId;
  }
  // Você escolheu estas transações: mesmo as que o padrão não pegar ficam nesta categoria.
  await db().transaction.updateMany({
    where: { userId, id: { in: input.transactionIds }, categoryId: null, transferPeerId: null },
    data: { categoryId: input.categoryId, ruleId },
  });
  if (ruleId) await refreshHitCounts(userId, [ruleId]);
  if (suggestion) {
    await db().ruleSuggestion.update({
      where: { id: suggestion.id },
      data: { status: accepted ? "ACEITA" : "CORRIGIDA", resolvedAt: new Date(), ruleId },
    });
  }
}

export async function ignoreSuggestion(userId: string, suggestionId: string): Promise<void> {
  await db().ruleSuggestion.updateMany({
    where: { id: suggestionId, userId, status: "PENDENTE" },
    data: { status: "IGNORADA", resolvedAt: new Date() },
  });
}

/** Categoria escolhida à mão (null = volta para a fila). Se era perna de transferência, desfaz o par. */
export async function setTransactionCategory(userId: string, transactionId: string, categoryId: string | null): Promise<void> {
  const transaction = await db().transaction.findFirst({ where: { id: transactionId, userId }, select: { transferPeerId: true } });
  if (!transaction) throw new RuleInputError("Transação não encontrada.");
  if (categoryId) await assertCategory(userId, categoryId);
  if (transaction.transferPeerId) await unpairTransfers(userId, [transactionId]);
  await db().transaction.update({ where: { id: transactionId, userId }, data: { categoryId, ruleId: null } });
  await refreshHitCounts(userId);
}

/** Ignorada sai dos totais e da fila (ex.: lançamento duplicado do banco). */
export async function setTransactionIgnored(userId: string, transactionId: string, isIgnored: boolean): Promise<void> {
  const updated = await db().transaction.updateMany({ where: { id: transactionId, userId }, data: { isIgnored } });
  if (updated.count === 0) throw new RuleInputError("Transação não encontrada.");
}

// ─── Categorias ─────────────────────────────────────────────────────────

export async function createCategory(
  userId: string,
  input: { name: string; parentId: string | null; kind: CategoryKind; icon: string },
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new RuleInputError("Dê um nome à categoria.");
  let kind = input.kind;
  let icon = input.icon;
  if (input.parentId) {
    const parent = await db().category.findFirst({ where: { id: input.parentId, userId }, select: { parentId: true, kind: true, icon: true } });
    if (!parent) throw new RuleInputError("Categoria mãe não encontrada.");
    if (parent.parentId) throw new RuleInputError("No máximo duas camadas: escolha uma categoria de primeiro nível como mãe.");
    kind = parent.kind;
    icon = parent.icon;
  }
  const duplicate = await db().category.findFirst({ where: { userId, parentId: input.parentId, name: { equals: name, mode: "insensitive" } } });
  if (duplicate) throw new RuleInputError("Já existe uma categoria com esse nome aqui.");
  const created = await db().category.create({ data: { userId, parentId: input.parentId, name, kind, icon, color: "neutral" }, select: { id: true } });
  return created.id;
}

export async function renameCategory(userId: string, categoryId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new RuleInputError("Dê um nome à categoria.");
  const category = await db().category.findFirst({ where: { id: categoryId, userId }, select: { parentId: true } });
  if (!category) throw new RuleInputError("Categoria não encontrada.");
  const duplicate = await db().category.findFirst({
    where: { userId, parentId: category.parentId, name: { equals: trimmed, mode: "insensitive" }, id: { not: categoryId } },
  });
  if (duplicate) throw new RuleInputError("Já existe uma categoria com esse nome aqui.");
  await db().category.update({ where: { id: categoryId, userId }, data: { name: trimmed } });
}

/** Apaga a categoria (e as subcategorias). Transações voltam para a fila; regras que apontavam para ela somem. */
export async function deleteCategory(userId: string, categoryId: string): Promise<void> {
  const category = await db().category.findFirst({ where: { id: categoryId, userId }, select: { kind: true, children: { select: { id: true } } } });
  if (!category) throw new RuleInputError("Categoria não encontrada.");
  if (category.kind === "TRANSFERENCIA") throw new RuleInputError("Transferências é a categoria do sistema para pares entre suas contas.");
  const ids = [categoryId, ...category.children.map((child) => child.id)];
  await db().$transaction([
    db().transaction.updateMany({ where: { userId, categoryId: { in: ids } }, data: { categoryId: null, ruleId: null } }),
    db().category.deleteMany({ where: { userId, id: { in: category.children.map((child) => child.id) } } }),
    db().category.delete({ where: { id: categoryId, userId } }),
  ]);
  await applyRules(userId, "sem-categoria");
}

export async function categoryUsage(userId: string, categoryId: string) {
  const ids = [categoryId, ...(await db().category.findMany({ where: { userId, parentId: categoryId }, select: { id: true } })).map((child) => child.id)];
  const [transactions, rules] = await Promise.all([
    db().transaction.count({ where: { userId, categoryId: { in: ids } } }),
    db().rule.count({ where: { userId, categoryId: { in: ids } } }),
  ]);
  return { transactions, rules };
}
