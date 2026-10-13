import "server-only";
import { db } from "@/lib/db";
import { refreshBucketBalances } from "@/lib/streams/ledger";
import { duplicateConnections } from "./duplicates";

/** Conexões que repetem contas de outra (o mesmo banco conectado duas vezes), com as outras de cada uma. */
export async function getDuplicateConnections(userId: string): Promise<Map<string, string[]>> {
  const accounts = await db().account.findMany({
    where: { userId, connectionId: { not: null }, type: { not: "INVESTMENT" } },
    select: { connectionId: true, type: true, name: true, number: true, currency: true },
  });
  return duplicateConnections(accounts);
}

/**
 * Remove a conexão daqui, com as contas dela e tudo que veio delas (transações, faturas, posições, lançamentos
 * dos buckets). As outras conexões não mudam. O item continua na Pluggy: para parar de compartilhar o banco,
 * é lá (no Meu Pluggy) que se remove.
 */
export async function removeConnection(userId: string, connectionId: string): Promise<{ accounts: number; transactions: number }> {
  const connection = await db().connection.findFirst({
    where: { id: connectionId, userId },
    select: { id: true, institutionName: true, scope: true, pluggyItemId: true },
  });
  if (!connection) throw new Error("Conexão não encontrada.");
  const transactions = await db().transaction.count({ where: { userId, account: { connectionId } } });
  // Contas em cascata levam transações, faturas, posições e os lançamentos dos buckets dessas transações.
  const [accounts] = await db().$transaction([
    db().account.deleteMany({ where: { userId, connectionId } }),
    db().alert.deleteMany({ where: { userId, payload: { path: ["connectionId"], equals: connectionId } } }),
    db().connection.delete({ where: { id: connectionId, userId } }),
  ]);
  await refreshBucketBalances(userId);
  await db().auditLog.create({
    data: {
      userId,
      action: "connection.remove",
      entity: "Connection",
      entityId: connectionId,
      before: { instituicao: connection.institutionName, escopo: connection.scope, item: connection.pluggyItemId },
      after: { contas: accounts.count, transacoes: transactions },
      origin: "USER",
    },
  });
  return { accounts: accounts.count, transactions };
}
