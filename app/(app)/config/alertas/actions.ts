"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ALERT_CATALOG, readParams } from "@/lib/alerts/catalog";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { parseCents, parsePercentBps } from "@/lib/finance/money";
import type { ActionState } from "../../actions";

const input = z.object({
  id: z.string().min(1).max(64),
  active: z.boolean(),
  push: z.boolean(),
  severity: z.enum(["BAIXA", "MEDIA", "ALTA"]),
  params: z.record(z.string(), z.string().max(30)),
});

export async function updateAlertRuleAction(raw: z.input<typeof input>): Promise<ActionState> {
  const user = await requireUser();
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { error: "Dados inválidos." };
  const rule = await db().alertRule.findFirst({ where: { id: parsed.data.id, userId: user.id }, select: { type: true } });
  if (!rule) return { error: "Regra não encontrada." };
  const values: Record<string, number> = {};
  for (const spec of ALERT_CATALOG[rule.type].params) {
    const text = parsed.data.params[spec.key] ?? "";
    const value = spec.kind === "cents" ? parseCents(text) : spec.kind === "bps" ? parsePercentBps(text) : /^\d{1,4}$/.test(text.trim()) ? Number(text) : null;
    if (value === null || value < spec.min || value > spec.max) return { error: `${spec.label}: valor fora do permitido.` };
    values[spec.key] = value;
  }
  await db().alertRule.updateMany({
    where: { id: parsed.data.id, userId: user.id },
    data: { active: parsed.data.active, push: parsed.data.push, severity: parsed.data.severity, params: readParams(rule.type, values) },
  });
  revalidatePath("/", "layout");
  return { notice: "Regra salva." };
}
