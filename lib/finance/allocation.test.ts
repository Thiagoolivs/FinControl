import { describe, expect, it } from "vitest";
import { competenceOf, obligationDueDate, splitIncome } from "./allocation";

describe("splitIncome", () => {
  it("divide pelo exemplo do spec", () => {
    expect(splitIncome(1_000_000, 1_200, 500)).toEqual({ taxCents: 120_000, costCents: 50_000, restCents: 830_000 });
  });

  it("as partes sempre somam a entrada, mesmo com arredondamento", () => {
    for (const amount of [1, 3, 99, 12_345, 1_000_001, 333_333]) {
      const split = splitIncome(amount, 1_234, 567);
      expect(split.taxCents + split.costCents + split.restCents).toBe(amount);
    }
  });

  it("arredonda meio centavo para cima nas reservas", () => {
    // 1.005 centavos × 50% = 502,5 → 503
    expect(splitIncome(1_005, 5_000, 0)).toEqual({ taxCents: 503, costCents: 0, restCents: 502 });
  });

  it("MEI sem percentual: tudo fica no resto (o DAS é reservado à parte)", () => {
    expect(splitIncome(800_000, 0, 0)).toEqual({ taxCents: 0, costCents: 0, restCents: 800_000 });
  });

  it("valor não positivo não reserva nada", () => {
    expect(splitIncome(0, 1_200, 500)).toEqual({ taxCents: 0, costCents: 0, restCents: 0 });
  });

  it("rejeita percentuais inválidos", () => {
    expect(() => splitIncome(1_000, 6_000, 5_000)).toThrow(RangeError);
    expect(() => splitIncome(1_000, -1, 0)).toThrow(RangeError);
    expect(() => splitIncome(1_000, 12.5, 0)).toThrow(RangeError);
    expect(() => splitIncome(10.5, 0, 0)).toThrow(RangeError);
  });
});

describe("obrigações mensais", () => {
  it("competência é o mês da data", () => {
    expect(competenceOf("2026-10-08")).toBe("2026-10");
  });

  it("vence no dia do mês seguinte", () => {
    expect(obligationDueDate("2026-10", 20)).toBe("2026-11-20");
    expect(obligationDueDate("2026-12", 20)).toBe("2027-01-20");
  });

  it("dia que não existe vira o último dia do mês", () => {
    expect(obligationDueDate("2027-01", 31)).toBe("2027-02-28");
    expect(obligationDueDate("2028-01", 30)).toBe("2028-02-29");
  });

  it("rejeita entrada inválida", () => {
    expect(() => obligationDueDate("2026-13", 20)).toThrow(RangeError);
    expect(() => obligationDueDate("2026-10", 0)).toThrow(RangeError);
  });
});
