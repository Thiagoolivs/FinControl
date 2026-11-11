import "server-only";
import type { MatchType, RevenueStreamType, Scope } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { assertCents } from "@/lib/finance/money";
import { refreshHitCounts } from "@/lib/rules/apply";
import { createRule, RuleInputError } from "@/lib/rules/mutations";

async function assertStream(userId: string, streamId: string) {
  const stream = await db().revenueStream.findFirst({ where: { id: streamId, userId } });
  if (!stream) throw new RuleInputError("Fonte de renda não encontrada.");
  return stream;
}

/** Atribui um grupo de entradas a uma fonte de renda (com regra para as próximas, se pedir). */
export async function assignStreamToGroup(
  userId: string,
  input: { transactionIds: string[]; revenueStreamId: string; rule: { pattern: string; matchType: MatchType } | null },
): Promise<void> {
  await assertStream(userId, input.revenueStreamId);
  let ruleId: string | null = null;
  if (input.rule) {
    ruleId = (
      await createRule(
        userId,
        { ...input.rule, direction: "ENTRADA", scope: null, categoryId: null, revenueStreamId: input.revenueStreamId, priority: 100 },
        { origin: "MANUAL", applyRetroactively: false },
      )
    ).ruleId;
  }
  await db().transaction.updateMany({
    where: { userId, id: { in: input.transactionIds }, amountCents: { gt: 0 }, revenueStreamId: null, categoryId: null, transferPeerId: null },
    data: { revenueStreamId: input.revenueStreamId, ruleId },
  });
  if (ruleId) await refreshHitCounts(userId, [ruleId]);
}

/** Fonte de renda escolhida à mão para uma entrada (null = volta para a fila). Renda não leva categoria. */
export async function setTransactionStream(userId: string, transactionId: string, revenueStreamId: string | null): Promise<void> {
  const transaction = await db().transaction.findFirst({ where: { id: transactionId, userId }, select: { amountCents: true } });
  if (!transaction) throw new RuleInputError("Transação não encontrada.");
  if (transaction.amountCents <= 0) throw new RuleInputError("Só entradas têm fonte de renda.");
  if (revenueStreamId) await assertStream(userId, revenueStreamId);
  await db().transaction.update({ where: { id: transactionId, userId }, data: { revenueStreamId, categoryId: null, ruleId: null } });
  await refreshHitCounts(userId);
}

// ─── Fontes de renda ────────────────────────────────────────────────────

const STREAM_TYPES: RevenueStreamType[] = ["SALARIO_FIXO", "PROJETO", "VENTURE", "OUTRO"];

export async function createStream(userId: string, input: { name: string; type: RevenueStreamType; scope: Scope }): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new RuleInputError("Dê um nome à fonte de renda.");
  if (!STREAM_TYPES.includes(input.type)) throw new RuleInputError("Tipo inválido.");
  if (await db().revenueStream.findFirst({ where: { userId, name: { equals: name, mode: "insensitive" } } })) {
    throw new RuleInputError("Já existe uma fonte de renda com esse nome.");
  }
  const stream = await db().revenueStream.create({ data: { userId, name, type: input.type, scope: input.scope, color: "neutral" }, select: { id: true } });
  return stream.id;
}

/** Renomear ou pausar uma fonte de renda (pausada some dos selects; o histórico fica). */
export async function updateStream(userId: string, streamId: string, input: { name: string; active: boolean }): Promise<void> {
  await assertStream(userId, streamId);
  const name = input.name.trim();
  if (!name) throw new RuleInputError("Dê um nome à fonte de renda.");
  const duplicate = await db().revenueStream.findFirst({ where: { userId, name: { equals: name, mode: "insensitive" }, id: { not: streamId } } });
  if (duplicate) throw new RuleInputError("Já existe uma fonte de renda com esse nome.");
  await db().revenueStream.update({ where: { id: streamId, userId }, data: { name, active: input.active } });
}

// ─── Contas fixas com lembrete ──────────────────────────────────────────

/** Valor e dia de vencimento do DAS (ou outra conta fixa com lembrete). */
export async function updateObligation(userId: string, obligationId: string, input: { amountCents: number; dueDay: number; active: boolean }): Promise<void> {
  assertCents(input.amountCents);
  if (input.amountCents <= 0) throw new RuleInputError("Informe um valor maior que zero.");
  if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 31) throw new RuleInputError("Dia de vencimento entre 1 e 31.");
  const updated = await db().fixedObligation.updateMany({ where: { id: obligationId, userId }, data: input });
  if (updated.count === 0) throw new RuleInputError("Lembrete não encontrado.");
}
