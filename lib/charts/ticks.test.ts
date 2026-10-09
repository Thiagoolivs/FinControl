import { describe, expect, it } from "vitest";
import { niceTicks } from "./ticks";

describe("niceTicks", () => {
  it("gera passos redondos que cobrem o intervalo e incluem zero", () => {
    expect(niceTicks(0, 2_000_000)).toEqual([0, 500_000, 1_000_000, 1_500_000, 2_000_000]);
    const ticks = niceTicks(-350_000, 1_820_000);
    expect(ticks).toContain(0);
    expect(ticks[0]).toBeLessThanOrEqual(-350_000);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(1_820_000);
  });

  it("intervalo degenerado devolve só zero", () => {
    expect(niceTicks(0, 0)).toEqual([0]);
  });

  it("nunca usa passo menor que R$ 1", () => {
    const ticks = niceTicks(0, 150);
    expect(ticks[1]! - ticks[0]!).toBeGreaterThanOrEqual(100);
  });
});
