import { describe, expect, it } from "vitest";
import { addDays, daysBetween, fromDbDate, localDateOf, toDbDate, todayLocal } from "./dates";

describe("localDateOf", () => {
  it("usa o dia de São Paulo, não o de UTC", () => {
    expect(localDateOf(new Date("2026-10-09T02:30:00Z"))).toBe("2026-10-08");
    expect(localDateOf(new Date("2026-10-09T03:00:00Z"))).toBe("2026-10-09");
    expect(todayLocal(new Date("2026-01-01T01:00:00Z"))).toBe("2025-12-31");
  });

  it("rejeita instante inválido", () => {
    expect(() => localDateOf(new Date("x"))).toThrow(RangeError);
  });
});

describe("aritmética de datas", () => {
  it("soma dias atravessando mês e ano", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("conta dias entre datas", () => {
    expect(daysBetween("2026-10-01", "2026-10-04")).toBe(3);
    expect(daysBetween("2026-10-04", "2026-10-01")).toBe(-3);
    expect(daysBetween("2026-02-27", "2026-03-02")).toBe(3);
  });

  it("rejeita data malformada", () => {
    expect(() => addDays("2026-13-01", 1)).toThrow(RangeError);
    expect(() => addDays("2026-02-31", 1)).toThrow(RangeError);
    expect(() => daysBetween("01/10/2026", "2026-10-01")).toThrow(RangeError);
  });

  it("ida e volta pelo banco preserva o dia", () => {
    expect(fromDbDate(toDbDate("2026-10-08"))).toBe("2026-10-08");
  });
});
