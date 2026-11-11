import "server-only";
import { todayLocal } from "@/lib/dates";
import { db } from "@/lib/db";
import { nextDueDate } from "@/lib/finance/obligations";
import { ensureStreamsSetup } from "./setup";

/** Garante a configuração inicial antes de mostrar qualquer tela de fontes de renda. */
export async function prepareStreams(userId: string): Promise<void> {
  await ensureStreamsSetup(userId);
}

export async function getStreams(userId: string) {
  const streams = await db().revenueStream.findMany({
    where: { userId },
    select: { id: true, name: true, type: true, scope: true, active: true, _count: { select: { transactions: true } } },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });
  return streams.map(({ _count, ...stream }) => ({ ...stream, transactions: _count.transactions }));
}

/** Fontes de renda ativas, para selects de regra e de transação. */
export async function destinationOptions(userId: string) {
  const streams = await getStreams(userId);
  return { streams: streams.filter((stream) => stream.active).map((stream) => ({ id: stream.id, name: stream.name })) };
}

/** Contas fixas com lembrete (ex.: DAS) e o próximo vencimento de cada uma. */
export async function getObligations(userId: string) {
  const today = todayLocal();
  const obligations = await db().fixedObligation.findMany({
    where: { userId },
    select: { id: true, name: true, scope: true, amountCents: true, dueDay: true, active: true },
    orderBy: { createdAt: "asc" },
  });
  return obligations.map((obligation) => ({ ...obligation, nextDueDate: nextDueDate(today, obligation.dueDay) }));
}
