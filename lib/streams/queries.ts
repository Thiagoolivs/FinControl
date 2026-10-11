import "server-only";
import type { BucketEntryKind } from "@/generated/prisma/enums";
import { obligationDueDate } from "@/lib/finance/allocation";
import { fromDbDate, todayLocal } from "@/lib/dates";
import { db } from "@/lib/db";
import { ensureObligationReservations } from "./ledger";
import { ensureStreamsSetup } from "./setup";

/** Garante a configuração inicial e as reservas do mês antes de mostrar qualquer tela de receitas. */
export async function prepareStreams(userId: string): Promise<void> {
  await ensureStreamsSetup(userId);
  await ensureObligationReservations(userId);
}

export async function getStreams(userId: string) {
  return db().revenueStream.findMany({
    where: { userId },
    select: { id: true, name: true, type: true, scope: true, taxReserveBps: true, costReserveBps: true, active: true },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });
}

export async function getBuckets(userId: string) {
  return db().bucket.findMany({
    where: { userId },
    select: { id: true, name: true, type: true, scope: true, balanceCents: true, revenueStreamId: true },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
  });
}

/** Opções de stream (ativas) e bucket para selects de regra e de transação. */
export async function destinationOptions(userId: string) {
  const [streams, buckets] = await Promise.all([getStreams(userId), getBuckets(userId)]);
  return {
    streams: streams.filter((stream) => stream.active).map((stream) => ({ id: stream.id, name: stream.name })),
    buckets: buckets.map((bucket) => ({ id: bucket.id, name: bucket.name })),
  };
}

/** Obrigações fixas com a competência atual: reservada? qual o vencimento? */
export async function getObligations(userId: string) {
  const competence = todayLocal().slice(0, 7);
  const obligations = await db().fixedObligation.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      scope: true,
      amountCents: true,
      dueDay: true,
      active: true,
      bucket: { select: { name: true } },
      entries: { where: { competence }, select: { amountCents: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return obligations.map((obligation) => ({
    ...obligation,
    competence,
    reserved: obligation.entries.length > 0,
    dueDate: obligationDueDate(competence, obligation.dueDay),
  }));
}

export type BucketStatementEntry = { id: string; date: string; kind: BucketEntryKind; amountCents: number; description: string };

const ENTRY_SELECT = {
  id: true,
  date: true,
  kind: true,
  amountCents: true,
  note: true,
  competence: true,
  obligation: { select: { name: true } },
  transaction: { select: { descriptionClean: true } },
} as const;

type EntryRow = {
  id: string;
  date: Date;
  kind: BucketEntryKind;
  amountCents: number;
  note: string | null;
  competence: string | null;
  obligation: { name: string } | null;
  transaction: { descriptionClean: string } | null;
};

function describeEntry(entry: EntryRow): BucketStatementEntry {
  const competence = entry.competence ? `${entry.competence.slice(5)}/${entry.competence.slice(0, 4)}` : "";
  const description =
    entry.kind === "OBRIGACAO_FIXA"
      ? `${entry.obligation?.name ?? "Obrigação"} · competência ${competence}`
      : entry.kind === "ALOCACAO"
        ? `Reserva de ${entry.transaction?.descriptionClean ?? "entrada"}`
        : entry.kind === "AJUSTE"
          ? (entry.note ?? "Ajuste de saldo")
          : entry.kind === "RETIRADA"
            ? (entry.note || "Retirada")
            : (entry.transaction?.descriptionClean ?? entry.note ?? "Pagamento");
  return { id: entry.id, date: fromDbDate(entry.date), kind: entry.kind, amountCents: entry.amountCents, description };
}

/** Reservas (imposto e custo) com saldo e o extrato recente de cada uma. */
export async function getReserveStatements(userId: string, limit = 40) {
  const buckets = await db().bucket.findMany({
    where: { userId, type: { in: ["RESERVA_IMPOSTO", "RESERVA_CUSTO"] } },
    select: {
      id: true,
      name: true,
      type: true,
      scope: true,
      balanceCents: true,
      entries: { select: ENTRY_SELECT, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: limit },
    },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
  });
  return buckets.map(({ entries, ...bucket }) => ({ ...bucket, entries: entries.map(describeEntry) }));
}

export type BusinessSummary = {
  streamId: string;
  name: string;
  bucketId: string;
  balanceCents: number;
  month: { inCents: number; outCents: number; withdrawnCents: number };
  withdrawnTotalCents: number;
  entries: BucketStatementEntry[];
};

/**
 * Caixa de cada negócio (stream VENTURE): saldo, entradas, saídas e retiradas do mês, quanto já saiu para
 * você no total e o extrato do bucket.
 */
export async function getBusinessSummaries(userId: string, month: string = todayLocal().slice(0, 7)): Promise<BusinessSummary[]> {
  const ventures = await db().revenueStream.findMany({
    where: { userId, type: "VENTURE" },
    select: { id: true, name: true, buckets: { where: { type: "CAIXA_PROJETO" }, select: { id: true, balanceCents: true } } },
    orderBy: { createdAt: "asc" },
  });
  const summaries: BusinessSummary[] = [];
  for (const venture of ventures) {
    const bucket = venture.buckets[0];
    if (!bucket) continue;
    const entries = await db().bucketEntry.findMany({
      where: { userId, bucketId: bucket.id },
      select: ENTRY_SELECT,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    const inMonth = entries.filter((entry) => fromDbDate(entry.date).startsWith(month));
    const sum = (rows: typeof entries, predicate: (entry: (typeof entries)[number]) => boolean) =>
      rows.filter(predicate).reduce((total, entry) => total + entry.amountCents, 0);
    summaries.push({
      streamId: venture.id,
      name: venture.name,
      bucketId: bucket.id,
      balanceCents: bucket.balanceCents,
      month: {
        inCents: sum(inMonth, (entry) => entry.kind === "ALOCACAO"),
        outCents: -sum(inMonth, (entry) => entry.kind === "PAGAMENTO"),
        withdrawnCents: -sum(inMonth, (entry) => entry.kind === "RETIRADA"),
      },
      withdrawnTotalCents: -sum(entries, (entry) => entry.kind === "RETIRADA"),
      entries: entries.slice(0, 50).map(describeEntry),
    });
  }
  return summaries;
}
