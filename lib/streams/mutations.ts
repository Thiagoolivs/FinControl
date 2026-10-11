import "server-only";
import type { MatchType, RevenueStreamType, Scope } from "@/generated/prisma/enums";
import { todayLocal, toDbDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { assertCents } from "@/lib/finance/money";
import { refreshHitCounts } from "@/lib/rules/apply";
import { createRule, RuleInputError } from "@/lib/rules/mutations";
import { reallocateIncome, refreshBucketBalances } from "./ledger";

async function assertStream(userId: string, streamId: string) {
  const stream = await db().revenueStream.findFirst({ where: { id: streamId, userId } });
  if (!stream) throw new RuleInputError("Stream de receita não encontrada.");
  return stream;
}

/**
 * Atribui um grupo de entradas a uma stream (com regra para as próximas, se pedir). As reservas
 * automáticas da stream são lançadas na hora.
 */
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
  await reallocateIncome(userId, input.transactionIds);
}

/** Stream escolhida à mão para uma entrada (null = volta para a fila). Receita não leva categoria. */
export async function setTransactionStream(userId: string, transactionId: string, revenueStreamId: string | null): Promise<void> {
  const transaction = await db().transaction.findFirst({ where: { id: transactionId, userId }, select: { amountCents: true } });
  if (!transaction) throw new RuleInputError("Transação não encontrada.");
  if (transaction.amountCents <= 0) throw new RuleInputError("Só entradas têm stream de receita.");
  if (revenueStreamId) await assertStream(userId, revenueStreamId);
  await db().transaction.update({ where: { id: transactionId, userId }, data: { revenueStreamId, categoryId: null, ruleId: null } });
  await reallocateIncome(userId, [transactionId]);
  await refreshHitCounts(userId);
}

/** "Pago com": a saída consome um bucket (ex.: DAS pago com a reserva de imposto). null = não sai de bucket. */
export async function setTransactionBucket(userId: string, transactionId: string, bucketId: string | null): Promise<void> {
  const transaction = await db().transaction.findFirst({ where: { id: transactionId, userId }, select: { amountCents: true, date: true, ruleId: true } });
  if (!transaction) throw new RuleInputError("Transação não encontrada.");
  if (transaction.amountCents >= 0) throw new RuleInputError("Só saídas são pagas com um bucket.");
  if (bucketId && !(await db().bucket.findFirst({ where: { id: bucketId, userId }, select: { id: true } }))) throw new RuleInputError("Bucket não encontrado.");
  await db().$transaction([
    db().bucketEntry.deleteMany({ where: { userId, transactionId, kind: "PAGAMENTO" } }),
    ...(bucketId
      ? [db().bucketEntry.create({ data: { userId, bucketId, kind: "PAGAMENTO", date: transaction.date, amountCents: transaction.amountCents, transactionId } })]
      : []),
    // Escolha manual: a regra deixa de mandar nesta transação (a categoria fica).
    ...(transaction.ruleId ? [db().transaction.update({ where: { id: transactionId, userId }, data: { ruleId: null } })] : []),
  ]);
  await refreshBucketBalances(userId);
}

// ─── Streams ────────────────────────────────────────────────────────────

const STREAM_TYPES: RevenueStreamType[] = ["SALARIO_FIXO", "PROJETO", "VENTURE", "OUTRO"];

export async function createStream(userId: string, input: { name: string; type: RevenueStreamType; scope: Scope }): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new RuleInputError("Dê um nome à stream.");
  if (!STREAM_TYPES.includes(input.type)) throw new RuleInputError("Tipo inválido.");
  if (await db().revenueStream.findFirst({ where: { userId, name: { equals: name, mode: "insensitive" } } })) {
    throw new RuleInputError("Já existe uma stream com esse nome.");
  }
  const stream = await db().revenueStream.create({ data: { userId, name, type: input.type, scope: input.scope, color: "neutral" }, select: { id: true } });
  if (input.type === "VENTURE") {
    await db().bucket.create({ data: { userId, scope: input.scope, revenueStreamId: stream.id, name: `Caixa de ${name}`, type: "CAIXA_PROJETO", color: "neutral" } });
  }
  return stream.id;
}

/** Mudar % refaz as reservas de todas as entradas da stream: o reservado sempre bate com a regra atual. */
export async function updateStream(
  userId: string,
  streamId: string,
  input: { name: string; taxReserveBps: number; costReserveBps: number; active: boolean },
): Promise<void> {
  const stream = await assertStream(userId, streamId);
  const name = input.name.trim();
  if (!name) throw new RuleInputError("Dê um nome à stream.");
  for (const bps of [input.taxReserveBps, input.costReserveBps]) {
    if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new RuleInputError("Percentual entre 0% e 100%.");
  }
  if (input.taxReserveBps + input.costReserveBps > 10_000) throw new RuleInputError("Imposto + custo passam de 100%.");
  const duplicate = await db().revenueStream.findFirst({ where: { userId, name: { equals: name, mode: "insensitive" }, id: { not: streamId } } });
  if (duplicate) throw new RuleInputError("Já existe uma stream com esse nome.");
  await db().revenueStream.update({
    where: { id: streamId, userId },
    data: { name, taxReserveBps: input.taxReserveBps, costReserveBps: input.costReserveBps, active: input.active },
  });
  if (stream.taxReserveBps !== input.taxReserveBps || stream.costReserveBps !== input.costReserveBps) {
    const ids = (await db().transaction.findMany({ where: { userId, revenueStreamId: streamId }, select: { id: true } })).map((row) => row.id);
    await reallocateIncome(userId, ids);
  }
}

// ─── Buckets e obrigações ───────────────────────────────────────────────

/** Acerta o saldo de um bucket (ex.: o que você já tinha guardado antes do app). Lança a diferença como AJUSTE. */
export async function setBucketBalance(userId: string, bucketId: string, targetCents: number, note: string): Promise<void> {
  assertCents(targetCents);
  const bucket = await db().bucket.findFirst({ where: { id: bucketId, userId }, select: { balanceCents: true } });
  if (!bucket) throw new RuleInputError("Bucket não encontrado.");
  const delta = targetCents - bucket.balanceCents;
  if (delta === 0) return;
  await db().bucketEntry.create({
    data: { userId, bucketId, kind: "AJUSTE", date: toDbDate(todayLocal()), amountCents: delta, note: note.trim() || "Ajuste de saldo" },
  });
  await refreshBucketBalances(userId);
}

/** Retirada do caixa do negócio para você: sai do bucket e passa a contar como disponível. Não é receita nova. */
export async function registerWithdrawal(userId: string, input: { bucketId: string; amountCents: number; date: string; note: string }): Promise<void> {
  assertCents(input.amountCents);
  if (input.amountCents <= 0) throw new RuleInputError("Informe um valor maior que zero.");
  const bucket = await db().bucket.findFirst({ where: { id: input.bucketId, userId, type: "CAIXA_PROJETO" }, select: { id: true } });
  if (!bucket) throw new RuleInputError("Caixa do negócio não encontrado.");
  await db().bucketEntry.create({
    data: { userId, bucketId: bucket.id, kind: "RETIRADA", date: toDbDate(input.date), amountCents: -input.amountCents, note: input.note.trim() || "Retirada" },
  });
  await refreshBucketBalances(userId);
}

/** Valor e vencimento do DAS (ou outra obrigação). A reserva do mês corrente acompanha o valor novo. */
export async function updateObligation(userId: string, obligationId: string, input: { amountCents: number; dueDay: number; active: boolean }): Promise<void> {
  assertCents(input.amountCents);
  if (input.amountCents <= 0) throw new RuleInputError("Informe um valor maior que zero.");
  if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 31) throw new RuleInputError("Dia de vencimento entre 1 e 31.");
  const updated = await db().fixedObligation.updateMany({ where: { id: obligationId, userId }, data: input });
  if (updated.count === 0) throw new RuleInputError("Obrigação não encontrada.");
  await db().bucketEntry.updateMany({
    where: { userId, obligationId, kind: "OBRIGACAO_FIXA", competence: todayLocal().slice(0, 7) },
    data: { amountCents: input.amountCents },
  });
  await refreshBucketBalances(userId);
}
