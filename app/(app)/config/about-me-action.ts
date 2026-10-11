"use server";

import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import type { ActionState } from "../actions";

export async function updateAboutMeAction(text: string): Promise<ActionState> {
  const user = await requireUser();
  if (typeof text !== "string" || text.length > 600) return { error: "Texto longo demais (até 600 caracteres)." };
  await db().user.update({ where: { id: user.id }, data: { aboutMe: text.trim() || null } });
  return { notice: "Salvo. O chat usa isso como contexto." };
}
