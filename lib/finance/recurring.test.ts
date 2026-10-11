import { describe, expect, it } from "vitest";
import { averageCents, detectRecurring, nextOccurrence, withinTolerance } from "./recurring";

const row = (id: string, key: string, date: string, amountCents: number) => ({ id, key, date, amountCents });

describe("withinTolerance", () => {
  it("±10% e mesmo sinal", () => {
    expect(withinTolerance(1100, 1000)).toBe(true);
    expect(withinTolerance(900, 1000)).toBe(true);
    expect(withinTolerance(1101, 1000)).toBe(false);
    expect(withinTolerance(-1000, 1000)).toBe(false);
    expect(withinTolerance(-950, -1000)).toBe(true);
  });
});

describe("averageCents", () => {
  it("arredonda meio centavo para longe do zero", () => {
    expect(averageCents([100, 101])).toBe(101);
    expect(averageCents([-100, -101])).toBe(-101);
    expect(averageCents([10, 20, 30])).toBe(20);
  });
});

describe("nextOccurrence", () => {
  it("mensal mantém o dia, limitado ao fim do mês", () => {
    expect(nextOccurrence("2026-10-05", 30)).toBe("2026-11-05");
    expect(nextOccurrence("2027-01-31", 30)).toBe("2027-02-28");
  });

  it("semanal e anual", () => {
    expect(nextOccurrence("2026-10-28", 7)).toBe("2026-11-04");
    expect(nextOccurrence("2026-03-10", 365)).toBe("2027-03-10");
  });
});

describe("detectRecurring", () => {
  it("salário mensal com variação pequena vira série", () => {
    const series = detectRecurring(
      [
        row("a", "E:SALARIO", "2026-07-05", 1_000_000),
        row("b", "E:SALARIO", "2026-08-05", 1_050_000),
        row("c", "E:SALARIO", "2026-09-04", 1_000_000),
        row("d", "E:SALARIO", "2026-10-05", 1_000_000),
      ],
      "2026-10-11",
    );
    expect(series).toEqual([
      {
        key: "E:SALARIO",
        avgAmountCents: 1_012_500,
        intervalDays: 30,
        occurrences: 4,
        lastDate: "2026-10-05",
        nextExpectedDate: "2026-11-05",
        active: true,
        transactionIds: ["a", "b", "c", "d"],
      },
    ]);
  });

  it("menos de 3 ocorrências não é recorrente", () => {
    expect(detectRecurring([row("a", "S:NETFLIX", "2026-09-04", -8990), row("b", "S:NETFLIX", "2026-10-04", -8990)], "2026-10-11")).toEqual([]);
  });

  it("valor fora de ±10% fica de fora sem quebrar a série", () => {
    const [series] = detectRecurring(
      [
        row("a", "S:LUZ", "2026-07-10", -20_000),
        row("b", "S:LUZ", "2026-08-10", -35_000),
        row("c", "S:LUZ", "2026-09-10", -21_000),
        row("d", "S:LUZ", "2026-10-10", -20_500),
      ],
      "2026-10-11",
    );
    expect(series?.transactionIds).toEqual(["a", "c", "d"]);
    expect(series?.avgAmountCents).toBe(-20_500);
  });

  it("intervalo irregular não é recorrente", () => {
    expect(
      detectRecurring(
        [row("a", "S:X", "2026-07-01", -1000), row("b", "S:X", "2026-07-20", -1000), row("c", "S:X", "2026-09-15", -1000)],
        "2026-10-11",
      ),
    ).toEqual([]);
  });

  it("vale a sequência mais recente; buraco grande encerra o histórico antigo", () => {
    const [series] = detectRecurring(
      [
        row("a", "S:ACADEMIA", "2025-01-10", -12_000),
        row("b", "S:ACADEMIA", "2026-08-10", -12_000),
        row("c", "S:ACADEMIA", "2026-09-10", -12_000),
        row("d", "S:ACADEMIA", "2026-10-10", -12_000),
      ],
      "2026-10-11",
    );
    expect(series?.occurrences).toBe(3);
  });

  it("semanal", () => {
    const [series] = detectRecurring(
      [row("a", "S:FEIRA", "2026-09-19", -8000), row("b", "S:FEIRA", "2026-09-26", -8200), row("c", "S:FEIRA", "2026-10-03", -7900), row("d", "S:FEIRA", "2026-10-10", -8000)],
      "2026-10-11",
    );
    expect(series?.intervalDays).toBe(7);
    expect(series?.nextExpectedDate).toBe("2026-10-17");
  });

  it("série que parou de chegar fica inativa", () => {
    const [series] = detectRecurring(
      [row("a", "S:STREAMING", "2026-04-02", -3990), row("b", "S:STREAMING", "2026-05-02", -3990), row("c", "S:STREAMING", "2026-06-02", -3990)],
      "2026-10-11",
    );
    expect(series?.active).toBe(false);
  });

  it("cobrança duplicada no mesmo mês não quebra a série", () => {
    const [series] = detectRecurring(
      [
        row("a", "S:NETFLIX", "2026-08-04", -8990),
        row("b", "S:NETFLIX", "2026-09-04", -8990),
        row("x", "S:NETFLIX", "2026-09-06", -8990),
        row("c", "S:NETFLIX", "2026-10-04", -8990),
      ],
      "2026-10-11",
    );
    expect(series?.occurrences).toBe(3);
    expect(series?.avgAmountCents).toBe(-8990);
  });
});
