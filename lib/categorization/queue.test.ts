import { describe, expect, it } from "vitest";
import { compilePattern } from "./match";
import { groupKey, suggestedPattern } from "./queue";

describe("groupKey", () => {
  it("junta variações da mesma loja", () => {
    expect(groupKey("Uber *Trip 8812")).toBe(groupKey("UBER *TRIP"));
    expect(groupKey("Padaria São João")).toBe("PADARIA SAO JOAO");
  });

  it("separa lojas diferentes", () => {
    expect(groupKey("UBER *TRIP")).not.toBe(groupKey("UBER *EATS"));
    expect(groupKey("PIX ENVIADO MARIA")).not.toBe(groupKey("PIX ENVIADO JOAO"));
  });

  it("não fica vazia quando a descrição é só número", () => {
    expect(groupKey("12345")).toBe("12345");
  });

});

describe("suggestedPattern", () => {
  const matchesAll = (descriptions: string[]) => {
    const { pattern, matchType } = suggestedPattern(descriptions);
    const compiled = compilePattern(pattern, matchType);
    return compiled.ok && descriptions.every((description) => compiled.test(description));
  };

  it("usa o começo comum em palavras inteiras", () => {
    expect(suggestedPattern(["UBER *TRIP", "Uber *Trip"])).toEqual({ pattern: "UBER *TRIP", matchType: "PREFIX" });
    expect(suggestedPattern(["MERCADO EXTRA PINHEIROS", "MERCADO EXTRA MOEMA"])).toEqual({ pattern: "MERCADO EXTRA", matchType: "PREFIX" });
    expect(suggestedPattern(["A1 LOJA CENTRO", "A2 LOJA CENTRO"])).toEqual({ pattern: "CENTRO", matchType: "CONTAINS" });
  });

  it("mantém números que fazem parte do nome", () => {
    expect(suggestedPattern(["99 TAXI", "99 TAXI"])).toEqual({ pattern: "99 TAXI", matchType: "PREFIX" });
  });

  it("o padrão sempre casa com todas as transações do grupo", () => {
    expect(matchesAll(["UBER *TRIP", "Uber *Trip"])).toBe(true);
    expect(matchesAll(["MERCADO EXTRA PINHEIROS", "MERCADO EXTRA MOEMA"])).toBe(true);
    expect(matchesAll(["Padaria São João", "PADARIA SAO JOAO"])).toBe(true);
    expect(matchesAll(["A1 LOJA CENTRO", "A2 LOJA CENTRO"])).toBe(true);
  });
});
