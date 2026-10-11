import { describe, expect, it } from "vitest";
import { cumulativeSpend, spendUntil } from "./spend-curve";

describe("cumulativeSpend", () => {
  it("acumula o gasto dia a dia", () => {
    expect(
      cumulativeSpend(
        [
          { day: 1, amountCents: -1_000 },
          { day: 3, amountCents: -2_500 },
          { day: 3, amountCents: -500 },
          { day: 5, amountCents: -4_000 },
        ],
        5,
      ),
    ).toEqual([1_000, 1_000, 4_000, 4_000, 8_000]);
  });

  it("estorno abate, sem descer de zero", () => {
    expect(
      cumulativeSpend(
        [
          { day: 1, amountCents: 3_000 },
          { day: 2, amountCents: -5_000 },
          { day: 4, amountCents: 1_000 },
        ],
        4,
      ),
    ).toEqual([0, 2_000, 2_000, 1_000]);
  });

  it("ignora o que passa do último dia e aceita mês vazio", () => {
    expect(cumulativeSpend([{ day: 31, amountCents: -100 }], 30)).toEqual(new Array(30).fill(0));
    expect(cumulativeSpend([], 0)).toEqual([]);
  });

  it("rejeita centavo quebrado e dia inválido", () => {
    expect(() => cumulativeSpend([{ day: 1, amountCents: 1.5 }], 3)).toThrow(RangeError);
    expect(() => cumulativeSpend([{ day: 0, amountCents: -1 }], 3)).toThrow(RangeError);
    expect(() => cumulativeSpend([], 32)).toThrow(RangeError);
  });
});

describe("spendUntil", () => {
  it("soma até o dia, inclusive, líquido de estornos", () => {
    const rows = [
      { day: 2, amountCents: -10_000 },
      { day: 9, amountCents: 2_000 },
      { day: 12, amountCents: -5_000 },
    ];
    expect(spendUntil(rows, 11)).toBe(8_000);
    expect(spendUntil(rows, 12)).toBe(13_000);
    expect(spendUntil(rows, 1)).toBe(0);
  });

  it("mais estorno que gasto dá zero", () => {
    expect(spendUntil([{ day: 1, amountCents: 500 }], 5)).toBe(0);
  });
});
