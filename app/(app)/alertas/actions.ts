"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { markAlertsRead } from "@/lib/alerts/queries";
import { requireUser } from "@/lib/auth/dal";
import type { ActionState } from "../actions";

export async function markAlertReadAction(id: string): Promise<ActionState> {
  const user = await requireUser();
  if (!z.string().min(1).max(64).safeParse(id).success) return { error: "Alerta inválido." };
  await markAlertsRead(user.id, [id]);
  revalidatePath("/", "layout");
  return {};
}

export async function markAllAlertsReadAction(): Promise<ActionState> {
  const user = await requireUser();
  const count = await markAlertsRead(user.id, "all");
  revalidatePath("/", "layout");
  return { notice: count === 1 ? "1 alerta marcado como lido." : `${count} alertas marcados como lidos.` };
}
