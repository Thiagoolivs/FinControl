import { compilePattern, type MatchType } from "./match";

export type RuleDirection = "AMBAS" | "ENTRADA" | "SAIDA";

export type RuleDraft = {
  pattern: string;
  matchType: MatchType;
  direction: RuleDirection;
  /** "AMBOS" vira scope null no banco. */
  scope: "AMBOS" | "PF" | "PJ";
  categoryId: string;
  revenueStreamId: string;
  priority: number;
  applyRetroactively: boolean;
};

export type RuleDraftErrors = Partial<Record<"pattern" | "destination" | "priority", string>>;

export const EMPTY_RULE_DRAFT: RuleDraft = {
  pattern: "",
  matchType: "CONTAINS",
  direction: "AMBAS",
  scope: "AMBOS",
  categoryId: "",
  revenueStreamId: "",
  priority: 100,
  applyRetroactively: false,
};

/** Fonte de renda só vale para entradas: em regra só de saída, é descartada. */
export function normalizeRuleDraft(draft: RuleDraft): RuleDraft {
  return {
    ...draft,
    pattern: draft.pattern.trim(),
    revenueStreamId: draft.direction === "SAIDA" ? "" : draft.revenueStreamId,
  };
}

export function validateRuleDraft(input: RuleDraft): RuleDraftErrors {
  const draft = normalizeRuleDraft(input);
  const errors: RuleDraftErrors = {};
  const compiled = compilePattern(draft.pattern, draft.matchType);
  if (!compiled.ok) errors.pattern = compiled.error;
  const message = ruleDestinationError(draft);
  if (message) errors.destination = message;
  if (!Number.isInteger(draft.priority) || draft.priority < 1 || draft.priority > 9999) {
    errors.priority = "Use um número inteiro entre 1 e 9999.";
  }
  return errors;
}

/**
 * Saída só é classificada por regra com categoria; entrada aceita fonte de renda ou categoria.
 */
export function ruleDestinationError(draft: Pick<RuleDraft, "direction" | "categoryId" | "revenueStreamId">): string | null {
  if (draft.categoryId) return null;
  if (draft.direction === "SAIDA") return "Regra de saída precisa de uma categoria.";
  if (!draft.revenueStreamId) return "Escolha uma categoria ou uma fonte de renda.";
  return null;
}
