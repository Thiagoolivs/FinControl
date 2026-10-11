import "server-only";
import type { Scope } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

/**
 * Move uma conexão para PF ou PJ, levando junto as contas dela, as transações dessas contas e os alertas da conexão.
 * Tudo numa transação: nunca fica metade em cada escopo.
 */
export async function changeConnectionScope(userId: string, connectionId: string, scope: Scope): Promise<{ changed: boolean }> {
  const connection = await db().connection.findFirst({
    where: { id: connectionId, userId },
    select: { id: true, scope: true, institutionName: true },
  });
  if (!connection) throw new Error("Conexão não encontrada.");
  if (connection.scope === scope) return { changed: false };

  const [, accounts, transactions] = await db().$transaction([
    db().connection.update({ where: { id: connectionId, userId }, data: { scope } }),
    db().account.updateMany({ where: { userId, connectionId }, data: { scope } }),
    db().transaction.updateMany({ where: { userId, account: { connectionId } }, data: { scope } }),
    db().alert.updateMany({ where: { userId, payload: { path: ["connectionId"], equals: connectionId } }, data: { scope } }),
  ]);
  await db().auditLog.create({
    data: {
      userId,
      action: "connection.scope",
      entity: "Connection",
      entityId: connectionId,
      before: { scope: connection.scope },
      after: { scope, contas: accounts.count, transacoes: transactions.count },
      origin: "USER",
    },
  });
  return { changed: true };
}
