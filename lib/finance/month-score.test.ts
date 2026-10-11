import { describe, expect, it } from "vitest";
import type { MonthFlow } from "./month-flow";
import { monthAchievements, savingsStreak } from "./month-score";

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

const good = flow({ incomeCents: 1_000_000, essentialCents: 500_000, spentCents: 500_000, investedCents: 100_000, leftoverCents: 400_000 });

describe("monthAchievements", () => {
  it("mês bom: todas as conquistas feitas", () => {
    const list = monthAchievements({ flow: good, targetBps: 2_000, reviewCount: 0, lastMonthToDateCents: 600_000, overAverageAreas: 0 });
    expect(list.map((item) => [item.key, item.done])).toEqual([
      ["fila", true],
      ["ritmo", true],
      ["areas", true],
      ["investiu", true],
      ["meta", true],
    ]);
    expect(list.find((item) => item.key === "meta")).toMatchObject({ title: "Guardar 20% do que entrou", detail: "Sobrou 40% até agora." });
  });

  it("mostra o que falta, com contagem", () => {
    const list = monthAchievements({
      flow: flow({ incomeCents: 300_000, lifestyleCents: 400_000, spentCents: 400_000, overflowCents: 100_000 }),
      targetBps: 2_000,
      reviewCount: 3,
      lastMonthToDateCents: 200_000,
      overAverageAreas: 2,
    });
    expect(list.every((item) => !item.done)).toBe(true);
    expect(list.find((item) => item.key === "fila")?.detail).toBe("3 transações na fila");
    expect(list.find((item) => item.key === "areas")?.detail).toBe("2 áreas passaram da média.");
    expect(list.find((item) => item.key === "meta")?.detail).toBe("Saiu mais do que entrou até agora.");
  });

  it("sem base não vira falha: some do placar", () => {
    const list = monthAchievements({ flow: flow({ lifestyleCents: 5_000, spentCents: 5_000, overflowCents: 5_000 }), targetBps: 2_000, reviewCount: 1, lastMonthToDateCents: null, overAverageAreas: null });
    expect(list.map((item) => item.key)).toEqual(["fila", "investiu"]);
    expect(monthAchievements({ flow: good, targetBps: 2_000, reviewCount: 0, lastMonthToDateCents: 0, overAverageAreas: null }).map((item) => item.key)).not.toContain("ritmo");
  });

  it("meta exata conta como batida", () => {
    const exact = flow({ incomeCents: 1_000_000, spentCents: 800_000, essentialCents: 800_000, leftoverCents: 200_000 });
    expect(monthAchievements({ flow: exact, targetBps: 2_000, reviewCount: 0, lastMonthToDateCents: null, overAverageAreas: null }).find((item) => item.key === "meta")?.done).toBe(true);
  });
});

describe("savingsStreak", () => {
  const miss = flow({ incomeCents: 1_000_000, spentCents: 900_000, essentialCents: 900_000, leftoverCents: 100_000 });

  it("conta meses seguidos na meta, do mais recente para trás", () => {
    expect(savingsStreak([good, good, miss, good], 2_000)).toBe(2);
  });

  it("mês sem entrada quebra a sequência", () => {
    expect(savingsStreak([good, flow({}), good], 2_000)).toBe(1);
  });

  it("nenhum mês na meta: zero", () => {
    expect(savingsStreak([miss], 2_000)).toBe(0);
    expect(savingsStreak([], 2_000)).toBe(0);
  });
});
