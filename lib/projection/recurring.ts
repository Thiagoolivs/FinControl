import "server-only";
import { addDays, fromDbDate, todayLocal, toDbDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { groupKey } from "@/lib/categorization/queue";
import { detectRecurring } from "@/lib/finance/recurring";

const HISTORY_DAYS = 760;

/**
 * Detecta as séries recorrentes (receitas e despesas) e grava em RecurringSeries, ligando as transações.
 * Fica de fora: transferência, ignorada, parcela de cartão, saída paga com bucket (o DAS sai da reserva),
 * entrada com categoria (estorno não é receita) e entrada de projeto ou do negócio (não são fixas).
 * Detecta por escopo: PF e PJ nunca viram a mesma série.
 */
export async function refreshRecurringSeries(userId: string, today: string = todayLocal()): Promise<number> {
  const rows = await db().transaction.findMany({
    where: {
      userId,
      isIgnored: false,
      transferPeerId: null,
      amountCents: { not: 0 },
      date: { gte: toDbDate(addDays(today, -HISTORY_DAYS)) },
      OR: [{ categoryId: null }, { category: { kind: { not: "TRANSFERENCIA" } } }],
    },
    select: {
      id: true,
      date: true,
      amountCents: true,
      descriptionClean: true,
      scope: true,
      categoryId: true,
      revenueStreamId: true,
      installmentTotal: true,
      revenueStream: { select: { type: true } },
      bucketEntries: { where: { kind: "PAGAMENTO" }, select: { id: true } },
    },
  });
  const eligible = rows.filter((row) => {
    if ((row.installmentTotal ?? 0) > 1 || row.bucketEntries.length > 0) return false;
    if (row.amountCents < 0) return true;
    return row.categoryId === null && row.revenueStream?.type !== "PROJETO" && row.revenueStream?.type !== "VENTURE";
  });
  const keyOf = (row: (typeof eligible)[number]) => `${row.scope}|${row.amountCents > 0 ? "E" : "S"}:${groupKey(row.descriptionClean)}`;
  const byId = new Map(eligible.map((row) => [row.id, row]));
  const detected = detectRecurring(
    eligible.map((row) => ({ id: row.id, key: keyOf(row), date: fromDbDate(row.date), amountCents: row.amountCents })),
    today,
  );

  const existing = await db().recurringSeries.findMany({ where: { userId }, select: { id: true, scope: true, key: true } });
  const seen = new Set<string>();
  await db().transaction.updateMany({ where: { userId, recurringSeriesId: { not: null } }, data: { recurringSeriesId: null, isRecurring: false } });
  for (const series of detected) {
    const [scope, key] = series.key.split("|") as ["PF" | "PJ", string];
    const latest = byId.get(series.transactionIds[series.transactionIds.length - 1] ?? "");
    const data = {
      avgAmountCents: series.avgAmountCents,
      intervalDays: series.intervalDays,
      occurrences: series.occurrences,
      lastDate: toDbDate(series.lastDate),
      nextExpectedDate: toDbDate(series.nextExpectedDate),
      status: series.active ? ("ATIVA" as const) : ("ENCERRADA" as const),
      categoryId: latest?.categoryId ?? null,
      revenueStreamId: latest?.revenueStreamId ?? null,
    };
    const saved = await db().recurringSeries.upsert({
      where: { userId_scope_key: { userId, scope, key } },
      create: { userId, scope, key, ...data },
      update: data,
      select: { id: true },
    });
    seen.add(saved.id);
    await db().transaction.updateMany({ where: { userId, id: { in: series.transactionIds } }, data: { recurringSeriesId: saved.id, isRecurring: true } });
  }
  // Série que deixou de ser detectada (mudou de valor, sumiu): encerrada, sem apagar o histórico.
  const gone = existing.filter((series) => !seen.has(series.id)).map((series) => series.id);
  if (gone.length > 0) await db().recurringSeries.updateMany({ where: { userId, id: { in: gone } }, data: { status: "ENCERRADA" } });
  return detected.filter((series) => series.active).length;
}
