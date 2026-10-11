import "server-only";
import { fromDbDate, toDbDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { matchTransfers } from "@/lib/finance/transfers";

/** Categoria de sistema para transferências entre contas próprias e pagamento de fatura. */
export async function ensureTransferCategory(userId: string): Promise<string> {
  const existing = await db().category.findFirst({
    where: { userId, parentId: null, kind: "TRANSFERENCIA" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await db().category.create({
    data: { userId, name: "Transferências", icon: "transfer", color: "neutral", kind: "TRANSFERENCIA" },
    select: { id: true },
  });
  return created.id;
}

/** Desfaz pares (as duas pernas) e devolve para "sem categoria" o que só era transferência por causa do par. */
export async function unpairTransfers(userId: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const legs = await db().transaction.findMany({
    where: { userId, id: { in: [...ids] } },
    select: { id: true, transferPeerId: true },
  });
  const all = [...new Set(legs.flatMap((leg) => (leg.transferPeerId ? [leg.id, leg.transferPeerId] : [leg.id])))];
  const categoryId = await ensureTransferCategory(userId);
  await db().$transaction([
    db().transaction.updateMany({ where: { userId, id: { in: all } }, data: { transferPeerId: null } }),
    db().transaction.updateMany({ where: { userId, id: { in: all }, categoryId, ruleId: null }, data: { categoryId: null } }),
  ]);
}

/**
 * Pareia transferências entre contas próprias a partir de `fromDate` (null = todo o histórico).
 * Só considera transações ainda sem par, não ignoradas e sem categoria escolhida.
 */
export async function detectTransfers(userId: string, fromDate: string | null): Promise<number> {
  const categoryId = await ensureTransferCategory(userId);
  const rows = await db().transaction.findMany({
    where: {
      userId,
      transferPeerId: null,
      isIgnored: false,
      revenueStreamId: null, // entrada já atribuída a uma stream é receita, não perna de transferência
      OR: [{ categoryId: null }, { categoryId }],
      ...(fromDate ? { date: { gte: toDbDate(fromDate) } } : {}),
    },
    select: { id: true, accountId: true, date: true, amountCents: true, account: { select: { type: true } } },
  });
  const pairs = matchTransfers(
    rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      accountType: row.account.type,
      date: fromDbDate(row.date),
      amountCents: row.amountCents,
    })),
  );
  if (pairs.length === 0) return 0;
  await db().$transaction(
    pairs.flatMap(({ outId, inId }) => [
      db().transaction.update({ where: { id: outId, userId }, data: { transferPeerId: inId, categoryId } }),
      db().transaction.update({ where: { id: inId, userId }, data: { transferPeerId: outId, categoryId } }),
    ]),
  );
  return pairs.length;
}
