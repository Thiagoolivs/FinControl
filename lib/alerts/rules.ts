import "server-only";
import type { AlertType, Severity } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { ALERT_CATALOG, ALERT_TYPES, readParams } from "./catalog";

/** Cria as regras de alerta que ainda não existem, com os valores iniciais do catálogo. */
export async function ensureAlertRules(userId: string): Promise<void> {
  const existing = await db().alertRule.findMany({ where: { userId }, select: { type: true } });
  const missing = ALERT_TYPES.filter((type) => !existing.some((row) => row.type === type));
  if (missing.length === 0) return;
  await db().alertRule.createMany({
    data: missing.map((type) => {
      const spec = ALERT_CATALOG[type];
      return { userId, type, severity: spec.severity, push: spec.severity === "ALTA", params: readParams(type, {}) };
    }),
  });
}

export type ActiveRule = { id: string; severity: Severity; push: boolean; params: Record<string, number> };

/** Regras ativas por tipo (a mais antiga, se houver duas do mesmo tipo). */
export async function activeAlertRules(userId: string): Promise<Partial<Record<AlertType, ActiveRule>>> {
  await ensureAlertRules(userId);
  const rules = await db().alertRule.findMany({ where: { userId, active: true }, orderBy: { createdAt: "asc" } });
  const byType: Partial<Record<AlertType, ActiveRule>> = {};
  for (const rule of rules) {
    byType[rule.type] ??= { id: rule.id, severity: rule.severity, push: rule.push, params: readParams(rule.type, rule.params) };
  }
  return byType;
}

/** Todas as regras, para a tela de configuração. */
export async function getAlertRules(userId: string) {
  await ensureAlertRules(userId);
  const rules = await db().alertRule.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const seen = new Set<AlertType>();
  return ALERT_TYPES.flatMap((type) => {
    const rule = rules.find((candidate) => candidate.type === type);
    if (!rule || seen.has(type)) return [];
    seen.add(type);
    return [{ id: rule.id, type, severity: rule.severity, push: rule.push, active: rule.active, params: readParams(type, rule.params) }];
  });
}
