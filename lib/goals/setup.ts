import "server-only";
import { todayLocal, toDbDate } from "@/lib/dates";
import { db } from "@/lib/db";

// Metas iniciais do spec. Valor e data ficam para você definir: o seed não inventa número.
const DEFAULT_GOALS = ["Investimentos", "Casamento", "Carro", "Eu mesmo"];

/** Cria as metas iniciais na primeira vez (só nela). Seguro com chamadas simultâneas. */
export async function ensureGoalsSetup(userId: string): Promise<boolean> {
  if ((await db().goal.count({ where: { userId } })) > 0) return false;
  const targetDate = toDbDate(`${Number(todayLocal().slice(0, 4)) + 1}-12-31`);
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`goals:${userId}`}))`;
    if ((await tx.goal.count({ where: { userId } })) > 0) return false;
    await tx.goal.createMany({ data: DEFAULT_GOALS.map((name) => ({ userId, scope: "PF" as const, name, targetCents: 0, targetDate, color: "neutral" })) });
    return true;
  });
}
