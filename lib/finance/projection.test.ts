import { describe, expect, it } from "vitest";
import { type ProjectionInput, projectCashFlow, prorate } from "./projection";

const base: ProjectionInput = {
  today: "2026-10-11",
  horizonMonths: 3,
  openingCents: 500_000,
  recurring: [],
  installments: [],
  variableMonthlyCents: 0,
  goals: [],
  obligationsMonthlyCents: 0,
  projectsMonthlyCents: null,
  business: null,
};

describe("prorate", () => {
  it("arredonda para o lado pior", () => {
    expect(prorate(-31_000, 20, 31)).toBe(-20_000);
    expect(prorate(-10_000, 1, 3)).toBe(-3334);
    expect(prorate(10_000, 1, 3)).toBe(3333);
    expect(prorate(10_000, 1, 0)).toBe(0);
  });
});

describe("projectCashFlow", () => {
  it("sem premissas, o saldo fica parado", () => {
    expect(projectCashFlow(base).map((month) => `${month.month}:${month.realisticCents}`)).toEqual(["2026-10:500000", "2026-11:500000", "2026-12:500000"]);
  });

  it("recorrentes caem nos meses certos; atrasada ainda esperada cai no mês corrente", () => {
    const months = projectCashFlow({
      ...base,
      recurring: [
        { amountCents: 800_000, intervalDays: 30, nextExpectedDate: "2026-11-05" },
        { amountCents: -8_990, intervalDays: 30, nextExpectedDate: "2026-10-04" },
      ],
    });
    expect(months.map((month) => [month.incomeCents, month.expenseCents])).toEqual([
      [0, -8_990],
      [800_000, -8_990],
      [800_000, -8_990],
    ]);
    expect(months.at(-1)?.realisticCents).toBe(500_000 + 1_600_000 - 26_970);
  });

  it("semanal soma as semanas do mês", () => {
    const months = projectCashFlow({ ...base, horizonMonths: 2, recurring: [{ amountCents: -1000, intervalDays: 7, nextExpectedDate: "2026-10-17" }] });
    // out: 17, 24, 31; nov: 7, 14, 21, 28
    expect(months.map((month) => month.expenseCents)).toEqual([-3000, -4000]);
  });

  it("variáveis: mês corrente proporcional aos dias que faltam", () => {
    const months = projectCashFlow({ ...base, variableMonthlyCents: -310_000 });
    // 11/out: faltam 20 de 31 dias
    expect(months.map((month) => month.expenseCents)).toEqual([-200_000, -310_000, -310_000]);
  });

  it("parcelas, metas e obrigações", () => {
    const months = projectCashFlow({
      ...base,
      installments: [
        { month: "2026-11", amountCents: -30_000 },
        { month: "2027-05", amountCents: -30_000 },
      ],
      goals: [{ monthlyCents: 100_000, untilMonth: "2026-11", currentMonthCents: 40_000 }],
      obligationsMonthlyCents: 8_650,
    });
    expect(months.map((month) => [month.expenseCents, month.goalsCents, month.obligationsCents])).toEqual([
      [0, -40_000, 0],
      [-30_000, -100_000, -8_650],
      [0, 0, -8_650],
    ]);
    expect(months.map((month) => month.realisticCents)).toEqual([460_000, 321_350, 312_700]);
  });

  it("projetos só na linha otimista; negócio em linha separada", () => {
    const months = projectCashFlow({ ...base, projectsMonthlyCents: 200_000, business: { openingCents: 1_000_000, monthlyNetCents: -310_000 } });
    expect(months.map((month) => month.optimisticCents)).toEqual([500_000, 700_000, 900_000]);
    expect(months.map((month) => month.realisticCents)).toEqual([500_000, 500_000, 500_000]);
    expect(months.map((month) => month.businessCents)).toEqual([800_000, 490_000, 180_000]);
  });

  it("sem projetos nem negócio, as linhas extras são null", () => {
    const [month] = projectCashFlow(base);
    expect(month?.optimisticCents).toBeNull();
    expect(month?.businessCents).toBeNull();
  });
});
