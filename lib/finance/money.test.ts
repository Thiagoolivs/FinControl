import { describe, expect, it } from "vitest";
import { assertCents, centsParts, formatCents, formatCentsCompact, parseCents } from "./money";

describe("assertCents", () => {
  it("aceita inteiros seguros", () => {
    expect(() => assertCents(0)).not.toThrow();
    expect(() => assertCents(-1430580)).not.toThrow();
  });

  it("rejeita float, NaN e inteiros fora do intervalo seguro", () => {
    expect(() => assertCents(10.5)).toThrow(RangeError);
    expect(() => assertCents(Number.NaN)).toThrow(RangeError);
    expect(() => assertCents(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });
});

describe("formatCents", () => {
  it.each([
    [0, "R$ 0,00"],
    [5, "R$ 0,05"],
    [99, "R$ 0,99"],
    [100, "R$ 1,00"],
    [8650, "R$ 86,50"],
    [100000, "R$ 1.000,00"],
    [1430580, "R$ 14.305,80"],
    [123456789, "R$ 1.234.567,89"],
  ])("%i → %s", (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });

  it("usa o sinal de menos tipográfico em valores negativos", () => {
    expect(formatCents(-5890)).toBe("−R$ 58,90");
  });

  it("mostra + só quando pedido", () => {
    expect(formatCents(980000, { signed: true })).toBe("+R$ 9.800,00");
    expect(formatCents(0, { signed: true })).toBe("R$ 0,00");
  });

  it("omite o símbolo quando pedido", () => {
    expect(formatCents(1430580, { symbol: false })).toBe("14.305,80");
  });

  it("omite centavos zerados só quando pedido", () => {
    expect(formatCents(1900000, { hideZeroCents: true })).toBe("R$ 19.000");
    expect(formatCents(1900050, { hideZeroCents: true })).toBe("R$ 19.000,50");
    expect(formatCents(1900000)).toBe("R$ 19.000,00");
  });
});

describe("centsParts", () => {
  it("separa unidades e centavos para o número protagonista", () => {
    expect(centsParts(1430580)).toEqual({ sign: "", units: "14.305", cents: "80" });
    expect(centsParts(-7)).toEqual({ sign: "−", units: "0", cents: "07" });
  });
});

describe("parseCents", () => {
  it.each([
    ["86,50", 8650],
    ["86,5", 8650],
    ["86", 8600],
    ["R$ 1.234,56", 123456],
    ["R$ 1.234,56", 123456],
    ["1234,56", 123456],
    ["1.000.000", 100000000],
    ["0,01", 1],
    ["-58,90", -5890],
    ["−R$ 58,90", -5890],
  ])("%s → %i", (input, expected) => {
    expect(parseCents(input)).toBe(expected);
  });

  it.each(["", "abc", "1,234", "12.34", "1.23,45", "1,2,3", "R$", "--5"])("rejeita %s", (input) => {
    expect(parseCents(input)).toBeNull();
  });

  it("faz ida e volta com formatCents", () => {
    for (const cents of [0, 1, 99, 8650, 1430580, -5890, 123456789]) {
      expect(parseCents(formatCents(cents))).toBe(cents);
    }
  });
});

describe("formatCentsCompact", () => {
  it.each([
    [0, "R$ 0"],
    [85000, "R$ 850"],
    [99999, "R$ 999"],
    [100000, "R$ 1 mil"],
    [150000, "R$ 1,5 mil"],
    [965000, "R$ 9,7 mil"],
    [1286550, "R$ 13 mil"],
    [2000000, "R$ 20 mil"],
    [99940000, "R$ 999 mil"],
    [99995000, "R$ 1 mi"],
    [120000000, "R$ 1,2 mi"],
    [1500000000, "R$ 15 mi"],
    [-500000, "−R$ 5 mil"],
  ])("%i → %s", (cents, expected) => {
    expect(formatCentsCompact(cents)).toBe(expected);
  });
});
