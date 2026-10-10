import { describe, expect, it } from "vitest";
import { monthlyRequiredCents } from "./goals";

describe("monthlyRequiredCents", () => {
  it("arredonda para cima em reais inteiros", () => {
    // 31.000,00 em 14 meses = 2.214,2857… → 2.215
    expect(monthlyRequiredCents(5_000_000, 1_900_000, 14)).toBe(221_500);
  });

  it("mantém valor exato que já é inteiro em reais", () => {
    expect(monthlyRequiredCents(1_200_000, 0, 12)).toBe(100_000);
  });

  it("um centavo acima do inteiro sobe um real", () => {
    expect(monthlyRequiredCents(100_001, 0, 1)).toBe(100_100);
  });

  it("meta atingida ou ultrapassada não pede aporte", () => {
    expect(monthlyRequiredCents(500_000, 500_000, 6)).toBe(0);
    expect(monthlyRequiredCents(500_000, 600_000, 6)).toBe(0);
  });

  it("prazo vencido pede tudo que falta", () => {
    expect(monthlyRequiredCents(500_000, 100_000, 0)).toBe(400_000);
    expect(monthlyRequiredCents(500_050, 100_000, -3)).toBe(400_100);
  });

  it("rejeita entradas inválidas", () => {
    expect(() => monthlyRequiredCents(1.5, 0, 3)).toThrow(RangeError);
    expect(() => monthlyRequiredCents(100, 0, 1.5)).toThrow(RangeError);
  });
});
