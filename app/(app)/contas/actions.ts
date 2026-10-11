"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import type { ActionState } from "../actions";

const input = z.object({ accountId: z.string().min(1), include: z.boolean() });

/** Conta dentro ou fora do saldo (ex.: conta conjunta que não é sua, conta antiga sem uso). */
export async function setAccountInTotalsAction(raw: z.input<typeof input>): Promise<ActionState> {
  const user = await requireUser();
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { error: "Dados inválidos." };
  const updated = await db().account.updateMany({
    where: { id: parsed.data.accountId, userId: user.id, type: { not: "INVESTMENT" } },
    data: { includeInTotals: parsed.data.include },
  });
  if (updated.count === 0) return { error: "Conta não encontrada." };
  revalidatePath("/", "layout");
  return { notice: parsed.data.include ? "Conta somada no saldo." : "Conta fora do saldo." };
}
