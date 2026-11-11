import { describe, expect, it } from "vitest";
import { dueDateIn, nextDueDate } from "./obligations";

describe("dueDateIn", () => {
  it("dia do mês, limitado ao último dia", () => {
    expect(dueDateIn("2026-11", 20)).toBe("2026-11-20");
    expect(dueDateIn("2027-02", 31)).toBe("2027-02-28");
    expect(dueDateIn("2028-02", 30)).toBe("2028-02-29");
  });

  it("rejeita mês e dia inválidos", () => {
    expect(() => dueDateIn("2026-13", 1)).toThrow(RangeError);
    expect(() => dueDateIn("2026-11", 0)).toThrow(RangeError);
    expect(() => dueDateIn("2026-11", 32)).toThrow(RangeError);
  });
});

describe("nextDueDate", () => {
  it("ainda neste mês, inclusive no próprio dia", () => {
    expect(nextDueDate("2026-11-11", 20)).toBe("2026-11-20");
    expect(nextDueDate("2026-11-20", 20)).toBe("2026-11-20");
  });

  it("já passou: vai para o mês seguinte, virando o ano", () => {
    expect(nextDueDate("2026-11-21", 20)).toBe("2026-12-20");
    expect(nextDueDate("2026-12-25", 20)).toBe("2027-01-20");
    expect(nextDueDate("2027-01-31", 30)).toBe("2027-02-28");
  });
});
