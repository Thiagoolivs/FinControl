import type { Scope } from "@/generated/prisma/enums";

/** Filtro de escopo das queries: PF e PJ só somam quando o chamador pede `consolidated: true`. */
export type ScopeQuery = { scope: Scope; consolidated?: false } | { scope?: undefined; consolidated: true };

export function scopeWhere(query: ScopeQuery): { scope?: Scope } {
  return query.consolidated === true ? {} : { scope: query.scope };
}

/** `?escopo=pf|pj` da URL; ausente ou outro valor = consolidado. */
export function parseScopeParam(value: string | string[] | undefined): ScopeQuery {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "pf") return { scope: "PF" };
  if (raw === "pj") return { scope: "PJ" };
  return { consolidated: true };
}
