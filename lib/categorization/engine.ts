import { compilePattern, type MatchType, normalizeText } from "./match";
import type { RuleDirection } from "./rule-draft";

export type EngineRule = {
  id: string;
  pattern: string;
  matchType: MatchType;
  direction: RuleDirection;
  scope: "PF" | "PJ" | null; // null = vale para os dois
  priority: number;
};

export type EngineTransaction = {
  descriptionClean: string;
  descriptionRaw: string;
  amountCents: number;
  scope: "PF" | "PJ";
};

type Compiled<R extends EngineRule> = R & { test: (description: string) => boolean; order: number };

/**
 * Prepara as regras ativas na ordem de avaliação: menor prioridade primeiro; empate fica na ordem recebida
 * (a query entrega por data de criação). Regra com padrão inválido é descartada, nunca derruba o lote.
 */
export function compileRules<R extends EngineRule>(rules: readonly R[]): Compiled<R>[] {
  const compiled: Compiled<R>[] = [];
  rules.forEach((rule, order) => {
    const pattern = compilePattern(rule.pattern, rule.matchType);
    if (pattern.ok) compiled.push({ ...rule, test: pattern.test, order });
  });
  return compiled.sort((a, b) => a.priority - b.priority || a.order - b.order);
}

/**
 * Primeira regra que casa com a transação. O padrão é testado na descrição limpa e na original:
 * "IFOOD" e "PAG*IFOOD" funcionam para "PAG*IFOOD 4421".
 */
export function pickRule<R extends EngineRule>(rules: readonly (R & { test: (description: string) => boolean })[], transaction: EngineTransaction): R | null {
  const clean = normalizeText(transaction.descriptionClean);
  const raw = normalizeText(transaction.descriptionRaw);
  for (const rule of rules) {
    if (rule.scope && rule.scope !== transaction.scope) continue;
    if (rule.direction === "ENTRADA" && transaction.amountCents <= 0) continue;
    if (rule.direction === "SAIDA" && transaction.amountCents >= 0) continue;
    if (rule.test(clean) || rule.test(raw)) return rule;
  }
  return null;
}
