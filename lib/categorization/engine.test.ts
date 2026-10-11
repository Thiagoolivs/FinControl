import { describe, expect, it } from "vitest";
import { compileRules, type EngineRule, type EngineTransaction, pickRule } from "./engine";

const rule = (id: string, pattern: string, extra: Partial<EngineRule> = {}): EngineRule => ({
  id,
  pattern,
  matchType: "CONTAINS",
  direction: "AMBAS",
  scope: null,
  priority: 100,
  ...extra,
});

const tx = (descriptionRaw: string, amountCents = -1000, extra: Partial<EngineTransaction> = {}): EngineTransaction => ({
  descriptionRaw,
  descriptionClean: descriptionRaw,
  amountCents,
  scope: "PF",
  ...extra,
});

const pick = (rules: EngineRule[], transaction: EngineTransaction) => pickRule(compileRules(rules), transaction)?.id ?? null;

describe("pickRule", () => {
  it("menor prioridade ganha; empate fica com a mais antiga", () => {
    const rules = [rule("geral", "UBER", { priority: 100 }), rule("eats", "UBER *EATS", { priority: 10 }), rule("outra", "UBER", { priority: 100 })];
    expect(pick(rules, tx("UBER *EATS 123"))).toBe("eats");
    expect(pick(rules, tx("UBER *TRIP"))).toBe("geral");
  });

  it("testa a descrição limpa e a original", () => {
    const transaction = tx("PAG*IFOOD 4421", -4590, { descriptionClean: "IFOOD" });
    expect(pick([rule("limpa", "IFOOD", { matchType: "PREFIX" })], transaction)).toBe("limpa");
    expect(pick([rule("original", "PAG*IFOOD", { matchType: "PREFIX" })], transaction)).toBe("original");
  });

  it("respeita o sentido", () => {
    const rules = [rule("entrada", "PIX", { direction: "ENTRADA" }), rule("saida", "PIX", { direction: "SAIDA" })];
    expect(pick(rules, tx("PIX RECEBIDO", 5000))).toBe("entrada");
    expect(pick(rules, tx("PIX ENVIADO", -5000))).toBe("saida");
  });

  it("respeita o escopo; sem escopo vale para os dois", () => {
    const rules = [rule("pj", "DAS", { scope: "PJ", priority: 1 }), rule("ambos", "DAS")];
    expect(pick(rules, tx("DAS SIMPLES", -8650, { scope: "PJ" }))).toBe("pj");
    expect(pick(rules, tx("DAS SIMPLES", -8650, { scope: "PF" }))).toBe("ambos");
  });

  it("regex inválida é descartada sem derrubar as outras", () => {
    const rules = [rule("quebrada", "(", { matchType: "REGEX", priority: 1 }), rule("boa", "NETFLIX")];
    expect(pick(rules, tx("NETFLIX.COM"))).toBe("boa");
  });

  it("sem regra que case, devolve null", () => {
    expect(pick([rule("x", "SPOTIFY")], tx("NETFLIX.COM"))).toBeNull();
  });
});
