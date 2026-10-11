import { normalizeText } from "./match";

/**
 * Chave que agrupa transações parecidas na fila de revisão, a partir da descrição limpa:
 * sem acento, sem dígitos, sem pontuação solta. "Uber *Trip 8812" e "UBER *TRIP" caem juntas.
 */
export function groupKey(descriptionClean: string): string {
  const key = normalizeText(descriptionClean)
    .replace(/\d+/g, " ")
    .replace(/[^\p{L}*.&\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return key || normalizeText(descriptionClean);
}

const MIN_PREFIX = 3;

/**
 * Padrão sugerido para a regra de um grupo: o começo comum das descrições, cortado em palavra inteira,
 * comparado como "Começa com". Sem começo comum que preste, "Contém" a maior palavra presente em todas.
 */
export function suggestedPattern(descriptions: readonly string[]): { pattern: string; matchType: "PREFIX" | "CONTAINS" } {
  const normalized = descriptions.map(normalizeText).filter(Boolean);
  const first = normalized[0];
  if (!first) return { pattern: "", matchType: "PREFIX" };
  let prefix = first;
  for (const text of normalized.slice(1)) {
    let length = 0;
    while (length < prefix.length && length < text.length && prefix[length] === text[length]) length += 1;
    prefix = prefix.slice(0, length);
  }
  const wholeWords = normalized.every((text) => text.length === prefix.length || text[prefix.length] === " ");
  if (!wholeWords) prefix = prefix.slice(0, prefix.lastIndexOf(" ") + 1);
  prefix = prefix.trim();
  if (prefix.length >= MIN_PREFIX) return { pattern: prefix, matchType: "PREFIX" };
  const shared = first
    .split(" ")
    .filter((word) => word.length >= MIN_PREFIX && normalized.every((text) => text.split(" ").includes(word)))
    .sort((a, b) => b.length - a.length)[0];
  return shared ? { pattern: shared, matchType: "CONTAINS" } : { pattern: first, matchType: "PREFIX" };
}
