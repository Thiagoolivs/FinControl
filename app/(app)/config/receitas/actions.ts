"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { parseCents, parsePercentBps } from "@/lib/finance/money";
import { describeRuleError } from "@/lib/rules/action-error";
import { createStream, setBucketBalance, updateObligation, updateStream } from "@/lib/streams/mutations";
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
  name: z.string().trim().min(1, "Dê um nome à stream.").max(60),
  type: z.enum(["SALARIO_FIXO", "PROJETO", "VENTURE", "OUTRO"]),
  scope: z.enum(["PF", "PJ"]),
});

export async function createStreamAction(input: z.input<typeof streamInput>): Promise<ActionState> {
  const user = await requireUser();
  const parsed = streamInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  return run(() => createStream(user.id, parsed.data), "Stream criada.");
}

export async function updateStreamAction(input: { id: string; name: string; tax: string; cost: string; active: boolean }): Promise<ActionState> {
  const user = await requireUser();
  const taxReserveBps = parsePercentBps(input.tax || "0");
  const costReserveBps = parsePercentBps(input.cost || "0");
  if (taxReserveBps === null || costReserveBps === null) return { error: "Use um percentual como 12 ou 12,5." };
  return run(
    () => updateStream(user.id, input.id, { name: input.name, taxReserveBps, costReserveBps, active: input.active }),
    "Stream salva. As reservas das entradas dela foram refeitas.",
  );
}

export async function setBucketBalanceAction(input: { bucketId: string; value: string }): Promise<ActionState> {
  const user = await requireUser();
  const cents = parseCents(input.value);
  if (cents === null) return { error: "Valor inválido. Ex.: 1.234,56" };
  return run(() => setBucketBalance(user.id, input.bucketId, cents, "Saldo acertado à mão"), "Saldo acertado.");
}

export async function updateObligationAction(input: { id: string; value: string; dueDay: string; active: boolean }): Promise<ActionState> {
  const user = await requireUser();
  const cents = parseCents(input.value);
  const dueDay = Number(input.dueDay);
  if (cents === null || cents <= 0) return { error: "Valor inválido. Ex.: 86,50" };
  return run(() => updateObligation(user.id, input.id, { amountCents: cents, dueDay, active: input.active }), "Obrigação salva.");
}
