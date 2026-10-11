import { describe, expect, it } from "vitest";
import { accumulatedRateBps, allocation, averagePriceCents, holdingValueCents, periodReturnBps, quantityTimesCents, targetsError } from "./portfolio";

describe("quantityTimesCents", () => {
  it("multiplica sem float", () => {
    expect(quantityTimesCents("100", 3_512)).toBe(351_200);
    expect(quantityTimesCents("0.1", 3)).toBe(0); // 0,3 centavo
    expect(quantityTimesCents("0.5", 3)).toBe(2); // 1,5 → 2
    expect(quantityTimesCents("0.00012345", 35_000_000)).toBe(4_321); // 4320,75 → 4321
    expect(quantityTimesCents("1234.5678901234", 100)).toBe(123_457);
  });

  it("rejeita quantidade inválida ou com casas demais", () => {
    expect(() => quantityTimesCents("1,5", 100)).toThrow(RangeError);
    expect(() => quantityTimesCents("0.00000000001", 100)).toThrow(RangeError);
  });
});

describe("averagePriceCents", () => {
  it("custo / quantidade arredondado", () => {
    expect(averagePriceCents(351_200, "100")).toBe(3_512);
    expect(averagePriceCents(100, "3")).toBe(33);
    expect(averagePriceCents(200, "3")).toBe(67);
    expect(averagePriceCents(100, "0")).toBe(0);
  });
});

describe("holdingValueCents", () => {
  const stock = { assetClass: "ACAO" as const, quantity: "10", costCents: 30_000, currentValueCents: 31_000, ticker: "PETR4" };

  it("ação com cotação usa o preço de mercado", () => {
    expect(holdingValueCents(stock, 3_500)).toBe(35_000);
  });

  it("sem cotação, valor da Pluggy; sem ele, o custo", () => {
    expect(holdingValueCents(stock, null)).toBe(31_000);
    expect(holdingValueCents({ ...stock, currentValueCents: null }, null)).toBe(30_000);
  });

  it("renda fixa ignora cotação", () => {
    expect(holdingValueCents({ ...stock, assetClass: "RENDA_FIXA", ticker: null }, 9_999)).toBe(31_000);
  });
});

describe("allocation", () => {
  it("percentual atual, alvo e desvio por classe", () => {
    const { totalCents, rows } = allocation(
      [
        { assetClass: "RENDA_FIXA", valueCents: 600_000 },
        { assetClass: "ACAO", valueCents: 300_000 },
        { assetClass: "ACAO", valueCents: 100_000 },
      ],
      { RENDA_FIXA: 5_000, ACAO: 3_000, FII: 2_000 },
    );
    expect(totalCents).toBe(1_000_000);
    expect(rows).toEqual([
      { assetClass: "ACAO", valueCents: 400_000, currentBps: 4_000, targetBps: 3_000, deviationBps: 1_000, deviationCents: 100_000 },
      { assetClass: "FII", valueCents: 0, currentBps: 0, targetBps: 2_000, deviationBps: -2_000, deviationCents: -200_000 },
      { assetClass: "RENDA_FIXA", valueCents: 600_000, currentBps: 6_000, targetBps: 5_000, deviationBps: 1_000, deviationCents: 100_000 },
    ]);
  });

  it("carteira vazia não divide por zero", () => {
    expect(allocation([], { ACAO: 10_000 }).rows[0]).toMatchObject({ currentBps: 0, deviationCents: 0 });
  });
});

describe("targetsError", () => {
  it("soma tem que dar 100%", () => {
    expect(targetsError({ ACAO: 5_000, RENDA_FIXA: 5_000 })).toBeNull();
    expect(targetsError({ ACAO: 5_000, RENDA_FIXA: 4_000 })).toBe("A soma precisa dar 100% (está em 90%).");
    expect(targetsError({ ACAO: 10_001 })).toBe("Cada classe vai de 0 a 100%.");
  });
});

describe("periodReturnBps", () => {
  it("desconta aporte do período", () => {
    // começou com 10.000 (custo 9.000); aportou 1.000; terminou com 11.500 (custo 10.000) → ganhou 500 sobre 10.000
    expect(periodReturnBps({ valueCents: 1_000_000, costCents: 900_000 }, { valueCents: 1_150_000, costCents: 1_000_000 })).toBe(500);
  });

  it("sem valor inicial não há retorno", () => {
    expect(periodReturnBps({ valueCents: 0, costCents: 0 }, { valueCents: 100, costCents: 100 })).toBeNull();
  });
});

describe("accumulatedRateBps", () => {
  it("compõe as taxas diárias", () => {
    expect(accumulatedRateBps(Array.from({ length: 21 }, () => "0.040168"))).toBe(85); // ~0,85% no mês
    expect(accumulatedRateBps(Array.from({ length: 252 }, () => "0.040168"))).toBe(1_065); // ~10,65% no ano
    expect(accumulatedRateBps([])).toBe(0);
  });
});
