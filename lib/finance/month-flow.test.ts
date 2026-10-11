import { describe, expect, it } from "vitest";
import { apportion, type MonthFlow, type MonthFlowRow, perHundred, savingsRateBps, summarizeMonthFlow } from "./month-flow";

const row = (amountCents: number, categoryKind: MonthFlowRow["categoryKind"] = null, hasStream = false): MonthFlowRow => ({ amountCents, categoryKind, hasStream });

const flow = (partial: Partial<MonthFlow>): MonthFlow => ({
  incomeCents: 0,
  essentialCents: 0,
  lifestyleCents: 0,
  uncategorizedCents: 0,
  investedCents: 0,
  spentCents: 0,
  leftoverCents: 0,
  overflowCents: 0,
  ...partial,
});

describe("summarizeMonthFlow", () => {
  it("separa o que entrou e para onde foi", () => {
    expect(
      summarizeMonthFlow([
        row(1_000_000, null, true), // salário (stream)
        row(20_000, "RECEITA"), // reembolso
        row(5_000), // entrada sem classificação
        row(-300_000, "ESSENCIAL"),
        row(-150_000, "VARIAVEL"),
        row(-40_000), // sem categoria
        row(-100_000, "INVESTIMENTO"),
      ]),
    ).toEqual(
      flow({
        incomeCents: 1_025_000,
        essentialCents: 300_000,
        lifestyleCents: 150_000,
        uncategorizedCents: 40_000,
        investedCents: 100_000,
        spentCents: 490_000,
        leftoverCents: 435_000,
      }),
    );
  });

  it("estorno abate o gasto do tipo, não vira entrada", () => {
    const result = summarizeMonthFlow([row(500_000, null, true), row(-30_000, "VARIAVEL"), row(10_000, "VARIAVEL")]);
    expect(result.lifestyleCents).toBe(20_000);
    expect(result.incomeCents).toBe(500_000);
  });

  it("estorno maior que o gasto do mês: o excesso entrou", () => {
    const result = summarizeMonthFlow([row(-5_000, "ESSENCIAL"), row(12_000, "ESSENCIAL")]);
    expect(result.essentialCents).toBe(0);
    expect(result.incomeCents).toBe(7_000);
    expect(result.leftoverCents).toBe(7_000);
  });

  it("resgate abate o investido; resgate líquido conta como entrada", () => {
    expect(summarizeMonthFlow([row(-100_000, "INVESTIMENTO"), row(30_000, "INVESTIMENTO")]).investedCents).toBe(70_000);
    const redeemed = summarizeMonthFlow([row(200_000, "INVESTIMENTO"), row(-150_000, "ESSENCIAL")]);
    expect(redeemed).toEqual(flow({ incomeCents: 200_000, essentialCents: 150_000, spentCents: 150_000, leftoverCents: 50_000 }));
  });

  it("gastou mais do que entrou: o excesso aparece, sobra zero", () => {
    const result = summarizeMonthFlow([row(300_000, null, true), row(-250_000, "ESSENCIAL"), row(-120_000, "VARIAVEL")]);
    expect(result.leftoverCents).toBe(0);
    expect(result.overflowCents).toBe(70_000);
  });

  it("saída com categoria de entrada fica como sem categoria", () => {
    expect(summarizeMonthFlow([row(-1_000, "RECEITA")]).uncategorizedCents).toBe(1_000);
  });

  it("sem transações, tudo zero", () => {
    expect(summarizeMonthFlow([])).toEqual(flow({}));
  });

  it("rejeita valor que não é centavo inteiro", () => {
    expect(() => summarizeMonthFlow([row(10.5)])).toThrow(RangeError);
  });
});

describe("apportion", () => {
  it("fecha sempre no total pelo maior resto", () => {
    expect(apportion([1, 1, 1], 100)).toEqual([34, 33, 33]);
    expect(apportion([300_000, 150_000, 40_000, 100_000, 435_000], 100)).toEqual([29, 15, 4, 10, 42]);
  });

  it("empate no resto vai para o maior valor, depois a ordem", () => {
    expect(apportion([1, 3], 2)).toEqual([0, 2]);
    expect(apportion([2, 2, 1], 1)).toEqual([1, 0, 0]);
  });

  it("valor pequeno pode ficar com zero, mas a soma não muda", () => {
    const result = apportion([1, 999_999], 100);
    expect(result).toEqual([0, 100]);
  });

  it("tudo zero dá tudo zero; negativo é erro", () => {
    expect(apportion([0, 0], 100)).toEqual([0, 0]);
    expect(() => apportion([-1, 2], 100)).toThrow(RangeError);
  });
});

describe("perHundred", () => {
  it("de cada R$ 100 que entraram, incluindo o que sobrou", () => {
    const result = perHundred(
      flow({ incomeCents: 1_000_000, essentialCents: 480_000, lifestyleCents: 220_000, uncategorizedCents: 50_000, investedCents: 50_000, spentCents: 750_000, leftoverCents: 200_000 }),
    );
    expect(result).toEqual({
      base: "entrou",
      baseCents: 1_000_000,
      parts: [
        { key: "essencial", cents: 480_000, per100: 48 },
        { key: "estilo", cents: 220_000, per100: 22 },
        { key: "sem", cents: 50_000, per100: 5 },
        { key: "investido", cents: 50_000, per100: 5 },
        { key: "sobrou", cents: 200_000, per100: 20 },
      ],
      overflowPer100: 0,
    });
  });

  it("gastou mais do que entrou: a base é o que saiu e marca o que passou", () => {
    const result = perHundred(flow({ incomeCents: 300_000, essentialCents: 250_000, lifestyleCents: 150_000, spentCents: 400_000, overflowCents: 100_000 }));
    expect(result?.base).toBe("saiu");
    expect(result?.baseCents).toBe(400_000);
    expect(result?.parts.map((part) => part.per100)).toEqual([63, 37, 0, 0]);
    expect(result?.parts.some((part) => part.key === "sobrou")).toBe(false);
    expect(result?.overflowPer100).toBe(25);
  });

  it("sem entrada, só gasto: tudo passou do que entrou", () => {
    expect(perHundred(flow({ lifestyleCents: 10_000, spentCents: 10_000, overflowCents: 10_000 }))?.overflowPer100).toBe(100);
  });

  it("nada entrou nem saiu: null", () => {
    expect(perHundred(flow({}))).toBeNull();
  });

  it("partes somam sempre 100", () => {
    const result = perHundred(flow({ incomeCents: 333_333, essentialCents: 111_111, lifestyleCents: 111_111, spentCents: 222_222, leftoverCents: 111_111 }));
    expect(result?.parts.reduce((sum, part) => sum + part.per100, 0)).toBe(100);
  });
});

describe("savingsRateBps", () => {
  it("sobra sobre o que entrou", () => {
    expect(savingsRateBps(flow({ incomeCents: 1_000_000, leftoverCents: 200_000 }))).toBe(2_000);
  });

  it("negativo quando saiu mais do que entrou", () => {
    expect(savingsRateBps(flow({ incomeCents: 300_000, overflowCents: 100_000 }))).toBe(-3_333);
  });

  it("sem entrada não há taxa", () => {
    expect(savingsRateBps(flow({ overflowCents: 5_000 }))).toBeNull();
  });
});
