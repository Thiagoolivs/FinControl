import { describe, expect, it } from "vitest";
import { EMPTY_RULE_DRAFT, normalizeRuleDraft, type RuleDraft, validateRuleDraft } from "./rule-draft";

const draft = (overrides: Partial<RuleDraft>): RuleDraft => ({ ...EMPTY_RULE_DRAFT, ...overrides });

describe("validateRuleDraft", () => {
  it("aceita padrão válido com uma categoria", () => {
    expect(validateRuleDraft(draft({ pattern: "PAG*IFOOD", categoryId: "delivery" }))).toEqual({});
  });

  it("exige padrão e pelo menos um destino", () => {
    const errors = validateRuleDraft(draft({ pattern: "  " }));
    expect(errors.pattern).toBe("Informe um padrão.");
    expect(errors.destination).toBeDefined();
  });

  it("aponta regex inválida", () => {
    expect(validateRuleDraft(draft({ pattern: "(", matchType: "REGEX", categoryId: "x" })).pattern).toBe("Expressão regular inválida.");
  });

  it("saída precisa de categoria; bucket sozinho não classifica", () => {
    expect(validateRuleDraft(draft({ pattern: "DAS", direction: "SAIDA", revenueStreamId: "salario" })).destination).toBeDefined();
    expect(validateRuleDraft(draft({ pattern: "DAS", direction: "SAIDA", bucketId: "imposto" })).destination).toBeDefined();
    expect(validateRuleDraft(draft({ pattern: "DAS", direction: "SAIDA", bucketId: "imposto", categoryId: "das" }))).toEqual({});
  });

  it("entrada aceita só a stream", () => {
    expect(validateRuleDraft(draft({ pattern: "TED ACME", direction: "ENTRADA", revenueStreamId: "salario" }))).toEqual({});
    expect(validateRuleDraft(draft({ pattern: "TED ACME", direction: "AMBAS", revenueStreamId: "salario" }))).toEqual({});
  });

  it("valida a prioridade", () => {
    expect(validateRuleDraft(draft({ pattern: "x", categoryId: "c", priority: 0 })).priority).toBeDefined();
    expect(validateRuleDraft(draft({ pattern: "x", categoryId: "c", priority: 1.5 })).priority).toBeDefined();
  });
});

describe("normalizeRuleDraft", () => {
  it("descarta o que não se aplica ao sentido", () => {
    const base = { pattern: " TED ACME ", revenueStreamId: "salario", bucketId: "imposto" };
    expect(normalizeRuleDraft(draft({ ...base, direction: "ENTRADA" }))).toMatchObject({ pattern: "TED ACME", revenueStreamId: "salario", bucketId: "" });
    expect(normalizeRuleDraft(draft({ ...base, direction: "SAIDA" }))).toMatchObject({ revenueStreamId: "", bucketId: "imposto" });
    expect(normalizeRuleDraft(draft({ ...base, direction: "AMBAS" }))).toMatchObject({ revenueStreamId: "salario", bucketId: "imposto" });
  });
});
