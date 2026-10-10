import "server-only";
import type { AccountType, Scope, TransactionStatus } from "@/generated/prisma/enums";
import { fromDbDate, toDbDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { decimalToCents } from "@/lib/finance/money";
import type { PluggyAccount, PluggyBill, PluggyTransaction } from "@/lib/pluggy/client";
import { toAccountType, toLocalDate, toTransactionCents } from "@/lib/pluggy/normalize";
import { unpairTransfers } from "./transfers";

const CHUNK = 500;

function chunks<T>(items: readonly T[], size = CHUNK): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export type LocalAccount = { id: string; userId: string; scope: Scope; type: AccountType };

const nullableCents = (value: number | null | undefined): number | null => (value == null ? null : decimalToCents(value));

/** Upsert pelo pluggyAccountId. O escopo é decidido na criação (o da conexão) e não muda em sync. */
export async function upsertAccount(
  connection: { id: string; userId: string; scope: Scope },
  wire: PluggyAccount,
): Promise<LocalAccount | null> {
  const type = toAccountType(wire.type, wire.subtype);
  if (!type) return null;
  const data = {
    connectionId: connection.id,
    type,
    name: wire.marketingName?.trim() || wire.name,
    number: wire.number ?? null,
    balanceCents: decimalToCents(wire.balance),
    currency: wire.currencyCode,
    creditLimitCents: nullableCents(wire.creditData?.creditLimit),
    availableCreditCents: nullableCents(wire.creditData?.availableCreditLimit),
  };
  const existing = await db().account.findUnique({ where: { pluggyAccountId: wire.id }, select: { id: true, userId: true } });
  if (existing && existing.userId !== connection.userId) throw new Error(`Conta ${wire.id} pertence a outro usuário.`);
  const select = { id: true, userId: true, scope: true, type: true } as const;
  return existing
    ? db().account.update({ where: { id: existing.id, userId: connection.userId }, data, select })
    : db().account.create({ data: { ...data, userId: connection.userId, scope: connection.scope, pluggyAccountId: wire.id }, select });
}

type Row = {
  pluggyTransactionId: string;
  status: TransactionStatus;
  date: string;
  amountCents: number;
  descriptionRaw: string;
  descriptionClean: string;
  providerCategory: string | null;
  installmentCurrent: number | null;
  installmentTotal: number | null;
};

function toRow(account: LocalAccount, wire: PluggyTransaction): Row {
  return {
    pluggyTransactionId: wire.id,
    status: wire.status === "PENDING" ? "PENDING" : "POSTED",
    date: toLocalDate(wire.date),
    amountCents: toTransactionCents(account.type, wire.amount, wire.amountInAccountCurrency),
    descriptionRaw: wire.descriptionRaw?.trim() || wire.description,
    descriptionClean: wire.description.trim(),
    providerCategory: wire.category ?? null,
    installmentCurrent: wire.creditCardMetadata?.installmentNumber ?? null,
    installmentTotal: wire.creditCardMetadata?.totalInstallments ?? null,
  };
}

export type IngestStats = { novas: number; atualizadas: number; removidas: number };

/**
 * Dedup por pluggyTransactionId: cria o que é novo, atualiza só o que mudou, nunca duplica.
 * PENDING que sumiu da Pluggy dentro da janela lida (virou lançamento com outro id, ou foi cancelada) é removida.
 * `dateFrom` null = a leitura cobriu todo o histórico da conta.
 */
export async function ingestTransactions(
  account: LocalAccount & { pluggyAccountId: string },
  wires: readonly PluggyTransaction[],
  dateFrom: string | null,
): Promise<IngestStats> {
  const rows = new Map<string, Row>();
  for (const wire of wires) {
    if (wire.accountId === account.pluggyAccountId) rows.set(wire.id, toRow(account, wire));
  }
  return applyRows(account, [...rows.values()], dateFrom);
}

async function applyRows(account: LocalAccount, rows: readonly Row[], dateFrom: string | null): Promise<IngestStats> {
  const stats: IngestStats = { novas: 0, atualizadas: 0, removidas: 0 };
  const existing = new Map<
    string,
    { id: string; userId: string; accountId: string; transferPeerId: string | null } & Omit<Row, "date"> & { date: Date }
  >();
  for (const ids of chunks(rows.map((row) => row.pluggyTransactionId))) {
    const found = await db().transaction.findMany({
      where: { pluggyTransactionId: { in: ids } },
      select: {
        id: true,
        userId: true,
        accountId: true,
        transferPeerId: true,
        pluggyTransactionId: true,
        status: true,
        date: true,
        amountCents: true,
        descriptionRaw: true,
        descriptionClean: true,
        providerCategory: true,
        installmentCurrent: true,
        installmentTotal: true,
      },
    });
    for (const row of found) existing.set(row.pluggyTransactionId, row);
  }

  const toCreate: Row[] = [];
  const toUpdate: { id: string; row: Row }[] = [];
  const toUnpair: string[] = [];
  for (const row of rows) {
    const current = existing.get(row.pluggyTransactionId);
    if (!current) {
      toCreate.push(row);
      continue;
    }
    if (current.userId !== account.userId || current.accountId !== account.id) continue;
    const moved = current.amountCents !== row.amountCents || fromDbDate(current.date) !== row.date;
    const changed =
      moved ||
      current.status !== row.status ||
      current.descriptionRaw !== row.descriptionRaw ||
      current.descriptionClean !== row.descriptionClean ||
      current.providerCategory !== row.providerCategory ||
      current.installmentCurrent !== row.installmentCurrent ||
      current.installmentTotal !== row.installmentTotal;
    if (changed) toUpdate.push({ id: current.id, row });
    // Valor ou data mudou: o par de transferência pode não valer mais; a detecção refaz.
    if (moved && current.transferPeerId) toUnpair.push(current.id);
  }

  for (const batch of chunks(toCreate)) {
    const result = await db().transaction.createMany({
      data: batch.map((row) => ({
        ...row,
        date: toDbDate(row.date),
        userId: account.userId,
        accountId: account.id,
        scope: account.scope,
      })),
      skipDuplicates: true,
    });
    stats.novas += result.count;
  }

  await unpairTransfers(account.userId, toUnpair);
  for (const batch of chunks(toUpdate, 100)) {
    await db().$transaction(
      batch.map(({ id, row }) =>
        db().transaction.update({ where: { id, userId: account.userId }, data: { ...row, date: toDbDate(row.date) } }),
      ),
    );
    stats.atualizadas += batch.length;
  }

  const seen = new Set(rows.map((row) => row.pluggyTransactionId));
  const pending = await db().transaction.findMany({
    where: {
      userId: account.userId,
      accountId: account.id,
      status: "PENDING",
      ...(dateFrom ? { date: { gte: toDbDate(dateFrom) } } : {}),
    },
    select: { id: true, pluggyTransactionId: true },
  });
  const gone = pending.filter((row) => !seen.has(row.pluggyTransactionId)).map((row) => row.id);
  if (gone.length > 0) {
    await unpairTransfers(account.userId, gone);
    const result = await db().transaction.deleteMany({ where: { userId: account.userId, id: { in: gone } } });
    stats.removidas = result.count;
  }
  return stats;
}

/** Faturas do cartão: upsert pelo pluggyBillId. */
export async function upsertBills(account: LocalAccount, bills: readonly PluggyBill[]): Promise<number> {
  for (const bill of bills) {
    const data = {
      dueDate: toDbDate(toLocalDate(bill.dueDate)),
      totalAmountCents: decimalToCents(bill.totalAmount),
      minimumPaymentCents: nullableCents(bill.minimumPaymentAmount),
    };
    const existing = await db().creditCardBill.findUnique({ where: { pluggyBillId: bill.id }, select: { id: true, userId: true } });
    if (existing && existing.userId !== account.userId) continue;
    if (existing) await db().creditCardBill.update({ where: { id: existing.id }, data });
    else await db().creditCardBill.create({ data: { ...data, userId: account.userId, accountId: account.id, pluggyBillId: bill.id } });
  }
  return bills.length;
}
