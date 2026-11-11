import { describe, expect, it } from "vitest";
import { flowsByMonth, type MonthFlowSummary, projectByAverage, prorate } from "./projection";

const month = (key: string, inCents: number, outCents: number): MonthFlowSummary => ({ month: key, inCents, outCents, netCents: inCents - outCents });

describe("flowsByMonth", () => {
  it("separa entrada e saída por mês, sem as transferências internas", () => {
    const flows = flowsByMonth(
      [
        { date: "2026-09-05", amountCents: 980_000, internal: false },
        { date: "2026-09-10", amountCents: -240_000, internal: false },
        { date: "2026-09-07", amountCents: -320_045, internal: true }, // fatura paga com a conta
        { date: "2026-09-07", amountCents: 320_045, internal: true },
        { date: "2026-10-08", amountCents: 400_000, internal: false }, // Pix da PJ, olhando só a PF
        { date: "2026-08-31", amountCents: -1_000, internal: false }, // fora dos meses pedidos
      ],
      ["2026-09", "2026-10"],
    );
    expect(flows).toEqual([month("2026-09", 980_000, 240_000), month("2026-10", 400_000, 0)]);
  });

  it("mês sem movimento aparece zerado", () => {
    expect(flowsByMonth([], ["2026-09"])).toEqual([month("2026-09", 0, 0)]);
  });
});

describe("prorate", () => {
  it("arredonda para o lado pior", () => {
    expect(prorate(-31_000, 20, 31)).toBe(-20_000);
    expect(prorate(-10_000, 1, 3)).toBe(-3334);
    expect(prorate(10_000, 1, 3)).toBe(3333);
    expect(prorate(10_000, 1, 0)).toBe(0);
  });
});

describe("projectByAverage", () => {
  const history = [month("2026-08", 1_580_000, 1_200_000), month("2026-09", 1_580_000, 1_700_000), month("2026-10", 1_580_000, 1_000_000)];

  it("parte do livre de hoje e soma a média; a faixa vai do pior ao melhor mês", () => {
    const result = projectByAverage({ today: "2026-11-30", horizonMonths: 3, openingCents: 3_000_000, history });
    expect(result.averageNetCents).toBe(280_000);
    expect(result.averageInCents).toBe(1_580_000);
    expect(result.averageOutCents).toBe(1_300_000);
    expect(result.worst?.month).toBe("2026-09");
    expect(result.best?.month).toBe("2026-10");
    // Último dia do mês: o mês corrente não soma nada (faltam 0 dias).
    expect(result.months).toEqual([
      { month: "2026-11", expectedCents: 3_000_000, lowCents: 3_000_000, highCents: 3_000_000 },
      { month: "2026-12", expectedCents: 3_280_000, lowCents: 2_880_000, highCents: 3_580_000 },
      { month: "2027-01", expectedCents: 3_560_000, lowCents: 2_760_000, highCents: 4_160_000 },
    ]);
  });

  it("o mês corrente conta só os dias que faltam", () => {
    const result = projectByAverage({ today: "2026-11-15", horizonMonths: 1, openingCents: 0, history: [month("2026-10", 0, 300_000)] });
    expect(result.months[0]?.expectedCents).toBe(-150_000);
  });

  it("gastando mais do que entra, a projeção desce", () => {
    const result = projectByAverage({ today: "2026-11-30", horizonMonths: 4, openingCents: 500_000, history: [month("2026-10", 1_000_000, 1_400_000)] });
    expect(result.months.map((item) => item.expectedCents)).toEqual([500_000, 100_000, -300_000, -700_000]);
  });

  it("sem histórico, fica parada no ponto de partida e diz que não há média", () => {
    const result = projectByAverage({ today: "2026-11-11", horizonMonths: 2, openingCents: 123_456, history: [] });
    expect(result.averageNetCents).toBeNull();
    expect(result.months).toEqual([
      { month: "2026-11", expectedCents: 123_456, lowCents: 123_456, highCents: 123_456 },
      { month: "2026-12", expectedCents: 123_456, lowCents: 123_456, highCents: 123_456 },
    ]);
  });

  it("média arredonda para o lado pior", () => {
    expect(projectByAverage({ today: "2026-11-11", horizonMonths: 1, openingCents: 0, history: [month("a", 0, 1), month("b", 0, 0)] }).averageNetCents).toBe(-1);
  });
});
