import "server-only";
import { db } from "@/lib/db";
import { averagePriceCents, MARKET_PRICED } from "@/lib/finance/portfolio";
import { decimalToCents } from "@/lib/finance/money";
import { toDbDate } from "@/lib/dates";
import { fetchInvestments } from "@/lib/pluggy/client";
import { toAssetClass, toLocalDate, toQuantity } from "@/lib/pluggy/normalize";
import type { Scope } from "@/generated/prisma/enums";

/**
 * Posições de investimento do item: a Pluggy é a fonte de quantidade e custo. Ficam numa conta do tipo
 * INVESTMENT por conexão, fora dos totais do disponível. Posição que sumiu (resgate total) é apagada.
 */
export async function syncInvestments(connection: { id: string; userId: string; scope: Scope; pluggyItemId: string; institutionName: string }): Promise<number> {
  const wires = (await fetchInvestments(connection.pluggyItemId)).filter(
    (wire) => wire.status !== "TOTAL_WITHDRAWAL" && (wire.currencyCode ?? "BRL") === "BRL",
  );
  const pluggyAccountId = `investimentos:${connection.pluggyItemId}`;
  const existing = await db().account.findUnique({ where: { pluggyAccountId }, select: { id: true, userId: true } });
  if (existing && existing.userId !== connection.userId) throw new Error(`Investimentos do item ${connection.pluggyItemId} pertencem a outro usuário.`);
  if (!existing && wires.length === 0) return 0;

  const rows = wires.map((wire) => {
    const assetClass = toAssetClass(wire.type, wire.subtype);
    const quantity = toQuantity(wire.quantity ?? 1);
    const costCents = decimalToCents(wire.amountOriginal ?? wire.balance ?? 0);
    return {
      pluggyInvestmentId: wire.id,
      ticker: MARKET_PRICED.includes(assetClass) && wire.code ? wire.code.trim().toUpperCase() : null,
      name: wire.name.trim(),
      assetClass,
      quantity,
      costCents,
      avgPriceCents: averagePriceCents(costCents, quantity),
      currentValueCents: decimalToCents(wire.balance ?? wire.amount ?? 0),
      maturityDate: wire.dueDate ? toDbDate(toLocalDate(wire.dueDate)) : null,
      indexer: wire.rateType ?? null,
    };
  });
  const balanceCents = rows.reduce((sum, row) => sum + row.currentValueCents, 0);
  const account = existing
    ? await db().account.update({ where: { id: existing.id, userId: connection.userId }, data: { connectionId: connection.id, balanceCents }, select: { id: true } })
    : await db().account.create({
        data: {
          userId: connection.userId,
          connectionId: connection.id,
          pluggyAccountId,
          scope: connection.scope,
          type: "INVESTMENT",
          name: `Investimentos ${connection.institutionName}`,
          balanceCents,
          includeInTotals: false,
        },
        select: { id: true },
      });

  const now = new Date();
  for (const row of rows) {
    const owner = await db().holding.findUnique({ where: { pluggyInvestmentId: row.pluggyInvestmentId }, select: { userId: true } });
    if (owner && owner.userId !== connection.userId) continue;
    await db().holding.upsert({
      where: { pluggyInvestmentId: row.pluggyInvestmentId },
      create: { ...row, userId: connection.userId, accountId: account.id, origin: "PLUGGY", valueUpdatedAt: now },
      update: { ...row, accountId: account.id, valueUpdatedAt: now },
    });
  }
  await db().holding.deleteMany({
    where: { userId: connection.userId, accountId: account.id, origin: "PLUGGY", pluggyInvestmentId: { notIn: rows.map((row) => row.pluggyInvestmentId) } },
  });
  return rows.length;
}
