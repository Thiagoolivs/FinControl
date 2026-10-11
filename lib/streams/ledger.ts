import "server-only";
import { addMonths, localDateOf, todayLocal, toDbDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { splitIncome } from "@/lib/finance/allocation";

/** Bucket.balanceCents é cache de Σ BucketEntry: recalcula tudo do usuário. */
export async function refreshBucketBalances(userId: string): Promise<void> {
  const [sums, buckets] = await Promise.all([
    db().bucketEntry.groupBy({ by: ["bucketId"], where: { userId }, _sum: { amountCents: true } }),
    db().bucket.findMany({ where: { userId }, select: { id: true, balanceCents: true } }),
  ]);
  const sumOf = new Map(sums.map((row) => [row.bucketId, row._sum.amountCents ?? 0]));
  const stale = buckets.filter((bucket) => (sumOf.get(bucket.id) ?? 0) !== bucket.balanceCents);
  if (stale.length === 0) return;
  await db().$transaction(stale.map((bucket) => db().bucket.update({ where: { id: bucket.id, userId }, data: { balanceCents: sumOf.get(bucket.id) ?? 0 } })));
}

/**
 * Refaz a divisão automática (ALOCACAO) das entradas: imposto e custo para as reservas, e, se a stream for
 * de negócio, o resto para o caixa do negócio. `transactionIds` undefined = todas as entradas do usuário.
 */
export async function reallocateIncome(userId: string, transactionIds?: readonly string[]): Promise<void> {
  if (transactionIds && transactionIds.length === 0) return;
  const idFilter = transactionIds ? { id: { in: [...transactionIds] } } : {};
  const [transactions, streams, buckets] = await Promise.all([
    db().transaction.findMany({
      where: { userId, ...idFilter, revenueStreamId: { not: null }, amountCents: { gt: 0 }, isIgnored: false, transferPeerId: null },
      select: { id: true, date: true, amountCents: true, revenueStreamId: true },
    }),
    db().revenueStream.findMany({ where: { userId }, select: { id: true, scope: true, type: true, taxReserveBps: true, costReserveBps: true } }),
    db().bucket.findMany({ where: { userId }, select: { id: true, scope: true, type: true, revenueStreamId: true } }),
  ]);
  const bucketFor = (type: "RESERVA_IMPOSTO" | "RESERVA_CUSTO" | "CAIXA_PROJETO", stream: (typeof streams)[number]) =>
    buckets.find((bucket) => bucket.type === type && bucket.revenueStreamId === stream.id) ??
    (type === "CAIXA_PROJETO" ? undefined : buckets.find((bucket) => bucket.type === type && bucket.scope === stream.scope && bucket.revenueStreamId === null));

  const entries: { userId: string; bucketId: string; kind: "ALOCACAO"; date: Date; amountCents: number; transactionId: string }[] = [];
  for (const transaction of transactions) {
    const stream = streams.find((candidate) => candidate.id === transaction.revenueStreamId);
    if (!stream) continue;
    const split = splitIncome(transaction.amountCents, stream.taxReserveBps, stream.costReserveBps);
    const push = (bucketId: string | undefined, amountCents: number) => {
      if (bucketId && amountCents > 0) entries.push({ userId, bucketId, kind: "ALOCACAO", date: transaction.date, amountCents, transactionId: transaction.id });
    };
    push(bucketFor("RESERVA_IMPOSTO", stream)?.id, split.taxCents);
    push(bucketFor("RESERVA_CUSTO", stream)?.id, split.costCents);
    if (stream.type === "VENTURE") push(bucketFor("CAIXA_PROJETO", stream)?.id, split.restCents);
  }
  await db().$transaction([
    db().bucketEntry.deleteMany({ where: { userId, kind: "ALOCACAO", ...(transactionIds ? { transactionId: { in: [...transactionIds] } } : {}) } }),
    db().bucketEntry.createMany({ data: entries }),
  ]);
  await refreshBucketBalances(userId);
}

/**
 * Refaz os pagamentos (PAGAMENTO) feitos com dinheiro de um bucket, para saídas categorizadas por regra
 * que apontam um bucket (ex.: DAS sai da reserva de imposto). Saída com bucket escolhido à mão não é tocada.
 */
export async function reapplyRulePayments(userId: string, transactionIds: readonly string[]): Promise<void> {
  if (transactionIds.length === 0) return;
  const transactions = await db().transaction.findMany({
    where: { userId, id: { in: [...transactionIds] }, ruleId: { not: null } },
    select: { id: true, date: true, amountCents: true, isIgnored: true, rule: { select: { bucketId: true } } },
  });
  const ids = transactions.map((transaction) => transaction.id);
  await db().$transaction([
    db().bucketEntry.deleteMany({ where: { userId, kind: "PAGAMENTO", transactionId: { in: ids } } }),
    db().bucketEntry.createMany({
      data: transactions.flatMap((transaction) =>
        transaction.rule?.bucketId && transaction.amountCents < 0 && !transaction.isIgnored
          ? [{ userId, bucketId: transaction.rule.bucketId, kind: "PAGAMENTO" as const, date: transaction.date, amountCents: transaction.amountCents, transactionId: transaction.id }]
          : [],
      ),
    }),
  ]);
  await refreshBucketBalances(userId);
}

/**
 * Reserva as obrigações fixas (DAS) de cada mês, da criação da obrigação até o mês atual.
 * Uma vez por competência: a unique (obligationId, competence) garante.
 */
export async function ensureObligationReservations(userId: string, today: string = todayLocal()): Promise<number> {
  const obligations = await db().fixedObligation.findMany({
    where: { userId, active: true },
    select: { id: true, bucketId: true, amountCents: true, createdAt: true, name: true },
  });
  const current = today.slice(0, 7);
  const data = obligations.flatMap((obligation) => {
    const rows = [];
    for (let month = localDateOf(obligation.createdAt).slice(0, 7); month <= current; month = addMonths(month, 1)) {
      rows.push({
        userId,
        bucketId: obligation.bucketId,
        kind: "OBRIGACAO_FIXA" as const,
        date: toDbDate(`${month}-01`),
        amountCents: obligation.amountCents,
        obligationId: obligation.id,
        competence: month,
        note: `${obligation.name} ${month}`,
      });
    }
    return rows;
  });
  if (data.length === 0) return 0;
  const created = await db().bucketEntry.createMany({ data, skipDuplicates: true });
  if (created.count > 0) await refreshBucketBalances(userId);
  return created.count;
}
