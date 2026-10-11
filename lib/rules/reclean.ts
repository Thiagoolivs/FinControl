// Sem "server-only": roda também no boot (instrumentation.ts).
import { cleanDescription } from "@/lib/categorization/clean";
import { db } from "@/lib/db";

const BATCH = 200;

/**
 * Passa a limpeza de descrição de novo no histórico do usuário e grava só o que mudou.
 * A limpeza é idempotente: rodar sem mudança nas regras de limpeza não altera nada.
 */
export async function recleanDescriptions(userId: string): Promise<number> {
  const rows = await db().transaction.findMany({ where: { userId }, select: { id: true, descriptionClean: true } });
  const changed = rows.flatMap((row) => {
    const clean = cleanDescription(row.descriptionClean);
    return clean === row.descriptionClean ? [] : [{ id: row.id, clean }];
  });
  for (let start = 0; start < changed.length; start += BATCH) {
    await db().$transaction(
      changed
        .slice(start, start + BATCH)
        .map((row) => db().transaction.update({ where: { id: row.id, userId }, data: { descriptionClean: row.clean } })),
    );
  }
  return changed.length;
}

/** No boot: aplica ao histórico de todo mundo a limpeza que acabou de subir no deploy. */
export async function recleanAllUsers(): Promise<number> {
  const users = await db().transaction.findMany({ distinct: ["userId"], select: { userId: true } });
  let total = 0;
  for (const { userId } of users) total += await recleanDescriptions(userId);
  return total;
}
