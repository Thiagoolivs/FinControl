import { describe, expect, it } from "vitest";
import { addDays, addMonths, daysBetween, formatMonthLabel, isMonth, monthRange, formatDayLabel, formatElapsed, formatMoment, fromDbDate, localDateOf, toDbDate, todayLocal } from "./dates";

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

describe("formatação", () => {
  it("rotula dias de transação", () => {
    expect(formatDayLabel("2026-10-10", "2026-10-10")).toBe("Hoje");
    expect(formatDayLabel("2026-10-09", "2026-10-10")).toBe("Ontem");
    expect(formatDayLabel("2026-10-08", "2026-10-10")).toBe("8 de outubro");
    expect(formatDayLabel("2025-12-30", "2026-01-02")).toBe("30 de dezembro de 2025");
  });

  it("mostra tempo decorrido", () => {
    const now = new Date("2026-10-10T15:00:00Z");
    expect(formatElapsed(new Date("2026-10-10T14:59:30Z"), now)).toBe("agora");
    expect(formatElapsed(new Date("2026-10-10T14:48:00Z"), now)).toBe("há 12 min");
    expect(formatElapsed(new Date("2026-10-10T12:00:00Z"), now)).toBe("há 3 h");
    expect(formatElapsed(new Date("2026-10-09T15:00:00Z"), now)).toBe("há 1 dia");
  });

  it("mostra horário em São Paulo", () => {
    const now = new Date("2026-10-10T15:00:00Z");
    expect(formatMoment(new Date("2026-10-10T20:30:00Z"), now)).toBe("hoje às 17:30");
    expect(formatMoment(new Date("2026-10-11T11:15:00Z"), now)).toBe("amanhã às 08:15");
    expect(formatMoment(new Date("2026-10-12T11:15:00Z"), now)).toBe("12 de outubro às 08:15");
  });
});

describe("meses", () => {
  it("soma meses atravessando o ano", () => {
    expect(addMonths("2026-10", -3)).toBe("2026-07");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
  });

  it("dá o intervalo do mês, inclusive fevereiro bissexto", () => {
    expect(monthRange("2026-10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("valida e formata", () => {
    expect(isMonth("2026-10")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(formatMonthLabel("2026-10")).toBe("outubro de 2026");
    expect(() => addMonths("outubro", 1)).toThrow(RangeError);
  });
});
