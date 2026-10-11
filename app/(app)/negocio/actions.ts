"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { parseCents } from "@/lib/finance/money";
import { describeRuleError } from "@/lib/rules/action-error";
import { registerWithdrawal } from "@/lib/streams/mutations";
import type { ActionState } from "../actions";

/** Retirada: dinheiro que sai do caixa do negócio para você (vira disponível). */
export async function withdrawAction(input: { bucketId: string; value: string; date: string; note: string }): Promise<ActionState> {
  const user = await requireUser();
  const cents = parseCents(input.value);
  if (cents === null || cents <= 0) return { error: "Valor inválido. Ex.: 2.500,00" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Data inválida." };
  try {
    await registerWithdrawal(user.id, { bucketId: input.bucketId, amountCents: cents, date: input.date, note: input.note.trim().slice(0, 120) });
    revalidatePath("/", "layout");
    return { notice: "Retirada registrada. O valor saiu do caixa do negócio e entrou no disponível." };
  } catch (error) {
    return { error: describeRuleError(error) };
  }
}
