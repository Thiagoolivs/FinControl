"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { parsePercentBps } from "@/lib/finance/money";
import type { ActionState } from "../actions";

/** Meta de sobra do mês (placar da Hoje), de 1% a 90% do que entra. */
export async function updateSavingsTargetAction(value: string): Promise<ActionState> {
  const user = await requireUser();
  const bps = typeof value === "string" ? parsePercentBps(value) : null;
  if (bps === null || bps < 100 || bps > 9_000) return { error: "Use um percentual entre 1% e 90%." };
  await db().user.update({ where: { id: user.id }, data: { savingsTargetBps: bps } });
  revalidatePath("/", "layout");
  return { notice: "Meta salva. O placar da tela Hoje já usa." };
}
