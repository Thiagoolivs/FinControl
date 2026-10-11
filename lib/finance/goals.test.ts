import { describe, expect, it } from "vitest";
import { completionMonth, contributionMonths, isGoalLate, monthlyPaceCents, monthlyRequiredCents, monthsToReach, requiredAtMonthStart } from "./goals";

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

describe("contributionMonths", () => {
  it("conta o mês corrente", () => {
    expect(contributionMonths("2026-10", "2027-12")).toBe(15);
    expect(contributionMonths("2026-10", "2026-10")).toBe(1);
    expect(contributionMonths("2026-10", "2026-08")).toBe(-1);
  });
});

const goal = { targetCents: 1_200_000, targetMonth: "2027-09" };

describe("requiredAtMonthStart", () => {
  it("usa o saldo do dia 1 e os meses até o alvo", () => {
    // out/2026 → set/2027 = 12 meses; nada aportado: 12.000 / 12 = 1.000
    expect(requiredAtMonthStart(goal, [], "2026-10")).toBe(100_000);
    // aportou 1.000 em outubro: em novembro faltam 11.000 em 11 meses
    expect(requiredAtMonthStart(goal, [{ date: "2026-10-05", amountCents: 100_000 }], "2026-11")).toBe(100_000);
  });

  it("aporte do próprio mês não muda o valor daquele mês", () => {
    expect(requiredAtMonthStart(goal, [{ date: "2026-10-05", amountCents: 100_000 }], "2026-10")).toBe(100_000);
  });
});

describe("isGoalLate", () => {
  const base = { ...goal, createdMonth: "2026-09", currentCents: 0 };

  it("no prazo quando aportou o necessário", () => {
    const paid = [
      { date: "2026-09-10", amountCents: 93_000 }, // set: 12.000 / 13 = 923,08 → 924; pagou mais
    ];
    expect(isGoalLate({ ...base, currentCents: 93_000 }, paid, "2026-10")).toBe(false);
  });

  it("atrasada quando o necessário cresceu de um mês para o outro", () => {
    // set: 12.000 / 13 → 924; sem aporte, out: 12.000 / 12 → 1.000
    expect(isGoalLate(base, [], "2026-10")).toBe(true);
  });

  it("meta criada neste mês não está atrasada", () => {
    expect(isGoalLate({ ...base, createdMonth: "2026-10" }, [], "2026-10")).toBe(false);
  });

  it("prazo vencido sem atingir é atraso; atingida nunca é", () => {
    expect(isGoalLate({ ...base, targetMonth: "2026-08" }, [], "2026-10")).toBe(true);
    expect(isGoalLate({ ...base, currentCents: 1_200_000 }, [], "2026-10")).toBe(false);
  });
});

describe("monthlyPaceCents", () => {
  const contributions = [
    { date: "2026-03-01", amountCents: 500_000 }, // saldo inicial, mês de criação
    { date: "2026-07-10", amountCents: 100_000 },
    { date: "2026-08-10", amountCents: 50_000 },
    { date: "2026-09-10", amountCents: 150_000 },
    { date: "2026-10-02", amountCents: 999_900 }, // mês corrente: fora
  ];

  it("média dos últimos 3 meses fechados", () => {
    expect(monthlyPaceCents(contributions, "2026-10", "2026-03")).toBe(100_000);
  });

  it("resgate reduz o ritmo", () => {
    expect(monthlyPaceCents([...contributions, { date: "2026-09-20", amountCents: -300_000 }], "2026-10", "2026-03")).toBe(0);
  });

  it("meta nova mede só os meses desde a criação, sem o mês dela", () => {
    expect(monthlyPaceCents(contributions, "2026-10", "2026-08")).toBe(150_000);
    expect(monthlyPaceCents(contributions, "2026-10", "2026-09")).toBeNull();
  });

  it("arredonda para baixo", () => {
    expect(monthlyPaceCents([{ date: "2026-09-01", amountCents: 100 }], "2026-10", "2026-06")).toBe(33);
  });
});

describe("monthsToReach e completionMonth", () => {
  it("meses e mês de conclusão", () => {
    expect(monthsToReach(1_000_000, 300_000)).toBe(4);
    expect(completionMonth(1_000_000, 300_000, "2026-10")).toBe("2027-01");
    expect(completionMonth(100_000, 300_000, "2026-10")).toBe("2026-10");
  });

  it("sem aporte não chega; nada faltando chega agora", () => {
    expect(monthsToReach(100_000, 0)).toBeNull();
    expect(completionMonth(100_000, -5, "2026-10")).toBeNull();
    expect(monthsToReach(0, 0)).toBe(0);
    expect(completionMonth(0, 0, "2026-10")).toBe("2026-10");
  });
});
