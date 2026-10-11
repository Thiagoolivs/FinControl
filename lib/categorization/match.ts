export type MatchType = "PREFIX" | "CONTAINS" | "REGEX";

export type CompiledPattern = { ok: true; test: (description: string) => boolean } | { ok: false; error: string };

/** Maiúsculas, sem acento e com espaços simples: "Padaria  São João" → "PADARIA SAO JOAO". */
export function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").trim().replace(/\s+/g, " ").toUpperCase();
}

const normalize = normalizeText;

/** Compila o padrão de uma regra. Comparação sem diferenciar maiúsculas, acentos e espaços repetidos. */
export function compilePattern(pattern: string, matchType: MatchType): CompiledPattern {
  const trimmed = pattern.trim();
  if (!trimmed) return { ok: false, error: "Informe um padrão." };
  if (matchType === "REGEX") {
    try {
      const regex = new RegExp(trimmed, "i");
      return { ok: true, test: (description) => regex.test(description) };
    } catch {
      return { ok: false, error: "Expressão regular inválida." };
    }
  }
  const needle = normalize(trimmed);
  return matchType === "PREFIX"
    ? { ok: true, test: (description) => normalize(description).startsWith(needle) }
    : { ok: true, test: (description) => normalize(description).includes(needle) };
}
