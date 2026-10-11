import "server-only";
import { addDays, fromDbDate, todayLocal, toDbDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { groupKey } from "@/lib/categorization/queue";
import { detectRecurring, nextOccurrence } from "@/lib/finance/recurring";

const HISTORY_DAYS = 760;

/** Chave da série (sem o escopo): sentido + descrição agrupada. A mesma da detecção e da marcação manual. */
export function recurringKey(amountCents: number, descriptionClean: string): string {
  return `${amountCents > 0 ? "E" : "S"}:${groupKey(descriptionClean)}`;
}

/**
 * Detecta as séries recorrentes (receitas e despesas) e grava em RecurringSeries, ligando as transações.
 * Fica de fora: transferência, ignorada, parcela de cartão, saída paga com bucket (o DAS sai da reserva),
 * entrada com categoria de gasto (estorno não é receita) e entrada de projeto ou do negócio (não são fixas).
 * Entrada com categoria de entrada (rendimento, reembolso fixo…) entra.
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
      category: { select: { kind: true } },
      revenueStreamId: true,
      installmentTotal: true,
      revenueStream: { select: { type: true } },
      bucketEntries: { where: { kind: "PAGAMENTO" }, select: { id: true } },
    },
  });
  const eligible = rows.filter((row) => {
    if ((row.installmentTotal ?? 0) > 1 || row.bucketEntries.length > 0) return false;
    if (row.amountCents < 0) return true;
    if (row.category) return row.category.kind === "RECEITA";
    return row.revenueStream?.type !== "PROJETO" && row.revenueStream?.type !== "VENTURE";
  });
  const keyOf = (row: (typeof eligible)[number]) => `${row.scope}|${recurringKey(row.amountCents, row.descriptionClean)}`;
  const byId = new Map(eligible.map((row) => [row.id, row]));
  const detected = detectRecurring(
    eligible.map((row) => ({ id: row.id, key: keyOf(row), date: fromDbDate(row.date), amountCents: row.amountCents })),
    today,
  );

  const existing = await db().recurringSeries.findMany({
    where: { userId },
    select: { id: true, scope: true, key: true, userStatus: true, intervalDays: true, nextExpectedDate: true },
  });
  const decisionOf = new Map(existing.map((series) => [`${series.scope}|${series.key}`, series.userStatus]));
  const seen = new Set<string>();
  // Ligações refeitas a cada leitura, menos as das séries que o usuário marcou como recorrentes.
  await db().transaction.updateMany({
    where: { userId, recurringSeriesId: { not: null }, recurringSeries: { OR: [{ userStatus: null }, { userStatus: "ENCERRADA" }] } },
    data: { recurringSeriesId: null, isRecurring: false },
  });
  for (const series of detected) {
    const [scope, key] = series.key.split("|") as ["PF" | "PJ", string];
    const decision = decisionOf.get(series.key) ?? null;
    const latest = byId.get(series.transactionIds[series.transactionIds.length - 1] ?? "");
    const data = {
      avgAmountCents: series.avgAmountCents,
      intervalDays: series.intervalDays,
      occurrences: series.occurrences,
      lastDate: toDbDate(series.lastDate),
      nextExpectedDate: toDbDate(series.nextExpectedDate),
      // A decisão do usuário vale mais que a detecção.
      status: decision ?? (series.active ? ("ATIVA" as const) : ("ENCERRADA" as const)),
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
    if (decision !== "ENCERRADA") {
      await db().transaction.updateMany({ where: { userId, id: { in: series.transactionIds } }, data: { recurringSeriesId: saved.id, isRecurring: true } });
    }
  }
  // Série que deixou de ser detectada (mudou de valor, sumiu): encerrada, sem apagar o histórico.
  // A que o usuário marcou como recorrente continua, com a próxima data rolando para a frente.
  const gone = existing.filter((series) => !seen.has(series.id));
  const auto = gone.filter((series) => series.userStatus === null).map((series) => series.id);
  if (auto.length > 0) await db().recurringSeries.updateMany({ where: { userId, id: { in: auto } }, data: { status: "ENCERRADA" } });
  for (const series of gone.filter((item) => item.userStatus === "ATIVA")) {
    const cadence = series.intervalDays === 7 ? 7 : series.intervalDays === 365 ? 365 : 30;
    let next = fromDbDate(series.nextExpectedDate);
    while (next < today) next = nextOccurrence(next, cadence);
    await db().recurringSeries.updateMany({ where: { id: series.id, userId }, data: { status: "ATIVA", nextExpectedDate: toDbDate(next) } });
  }
  return detected.filter((series) => series.active).length;
}
