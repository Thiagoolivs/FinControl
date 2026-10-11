import { describe, expect, it } from "vitest";
import { monthInsights } from "./insights";
import type { MonthFlow } from "./month-flow";

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

const month = flow({ incomeCents: 1_000_000, essentialCents: 300_000, lifestyleCents: 150_000, uncategorizedCents: 50_000, spentCents: 500_000, leftoverCents: 500_000 });

describe("monthInsights", () => {
  it("maior área, área acima da média, ritmo e o que falta categorizar", () => {
    const insights = monthInsights({
      flow: month,
      areas: [
        { name: "Moradia", cents: 250_000, ratioBps: 10_000 },
        { name: "Delivery", cents: 82_000, ratioBps: 13_800 },
        { name: "Lazer", cents: 40_000, ratioBps: 12_100 },
      ],
      overThresholdBps: 12_000,
      lastMonthToDateCents: 620_000,
      dayOfMonth: 11,
    });
    expect(insights).toEqual([
      { key: "maior", tone: "neutral", parts: ["A maior parte foi para Moradia: ", { cents: 250_000 }, ", 50% do que você gastou."] },
      { key: "acima", tone: "warning", parts: ["Delivery está 38% acima da sua média dos últimos meses."] },
      { key: "ritmo", tone: "good", parts: ["Até o dia 11, você gastou ", { cents: 120_000 }, " a menos que no mesmo ponto do mês passado."] },
      { key: "sem", tone: "neutral", parts: [{ cents: 50_000 }, " ainda sem categoria. Categorize para o quadro ficar completo."] },
    ]);
  });

  it("gastando mais que no mês passado vira atenção", () => {
    const insights = monthInsights({ flow: { ...month, uncategorizedCents: 0 }, areas: [], overThresholdBps: null, lastMonthToDateCents: 400_000, dayOfMonth: 5 });
    expect(insights).toEqual([{ key: "ritmo", tone: "warning", parts: ["Até o dia 5, você gastou ", { cents: 100_000 }, " a mais que no mesmo ponto do mês passado."] }]);
  });

  it("sem gasto, sem histórico e quase tudo categorizado: nada a dizer", () => {
    expect(monthInsights({ flow: flow({ incomeCents: 10_000, leftoverCents: 10_000 }), areas: [], overThresholdBps: 12_000, lastMonthToDateCents: null, dayOfMonth: 2 })).toEqual([]);
    const tidy = flow({ essentialCents: 95_000, uncategorizedCents: 5_000, spentCents: 100_000 });
    expect(monthInsights({ flow: tidy, areas: [], overThresholdBps: null, lastMonthToDateCents: 100_000, dayOfMonth: 9 })).toEqual([]);
  });
});
