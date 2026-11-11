"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { parseCents } from "@/lib/finance/money";
import { describeRuleError } from "@/lib/rules/action-error";
import { createStream, updateObligation, updateStream } from "@/lib/streams/mutations";
import type { ActionState } from "../../actions";

async function run(task: () => Promise<unknown>, notice: string): Promise<ActionState> {
  try {
    await task();
    revalidatePath("/", "layout");
    return { notice };
  } catch (error) {
    return { error: describeRuleError(error) };
  }
}

const streamInput = z.object({
  name: z.string().trim().min(1, "Dê um nome à fonte de renda.").max(60),
  scope: z.enum(["PF", "PJ"]),
});

export async function createStreamAction(input: z.input<typeof streamInput>): Promise<ActionState> {
  const user = await requireUser();
  const parsed = streamInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  return run(() => createStream(user.id, { ...parsed.data, type: "OUTRO" }), "Fonte de renda criada.");
}

export async function updateStreamAction(input: { id: string; name: string; active: boolean }): Promise<ActionState> {
  const user = await requireUser();
  return run(() => updateStream(user.id, input.id, { name: input.name, active: input.active }), "Fonte de renda salva.");
}

export async function updateObligationAction(input: { id: string; value: string; dueDay: string; active: boolean }): Promise<ActionState> {
  const user = await requireUser();
  const cents = parseCents(input.value);
  const dueDay = Number(input.dueDay);
  if (cents === null || cents <= 0) return { error: "Valor inválido. Ex.: 86,50" };
  return run(() => updateObligation(user.id, input.id, { amountCents: cents, dueDay, active: input.active }), "Lembrete salvo.");
}
