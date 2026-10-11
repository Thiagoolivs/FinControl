import { describe, expect, it } from "vitest";
import { exceedsAverage, meiLimitStage } from "./alerts";

describe("exceedsAverage", () => {
  it("compara com o limite em bps, estritamente acima", () => {
    expect(exceedsAverage(120_00, 100_00, 12_000)).toBe(false);
    expect(exceedsAverage(120_01, 100_00, 12_000)).toBe(true);
  });

  it("sem média não dispara", () => {
    expect(exceedsAverage(50_000, 0, 12_000)).toBe(false);
  });
});

describe("meiLimitStage", () => {
  const limit = 8_100_000;

  it("avisa a partir de 80% e estoura acima do teto", () => {
    expect(meiLimitStage(6_479_999, limit, 8000)).toBeNull();
    expect(meiLimitStage(6_480_000, limit, 8000)).toBe("aviso");
    expect(meiLimitStage(8_100_000, limit, 8000)).toBe("aviso");
    expect(meiLimitStage(8_100_001, limit, 8000)).toBe("estourou");
  });

  it("teto zerado desliga", () => {
    expect(meiLimitStage(100, 0, 8000)).toBeNull();
  });
});
