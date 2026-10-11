import { describe, expect, it } from "vitest";
import { firstInstallmentMonth, futureInstallments } from "./installments";

describe("firstInstallmentMonth", () => {
  it("volta os meses das parcelas já pagas", () => {
    expect(firstInstallmentMonth("2026-10-05", 3)).toBe("2026-08");
    expect(firstInstallmentMonth("2026-10-05", 1)).toBe("2026-10");
  });
});

describe("futureInstallments", () => {
  const magalu = { purchaseKey: "magalu", amountCents: -30_000, total: 10 };

  it("projeta as que faltam a partir da última vista", () => {
    const future = futureInstallments(
      [
        { ...magalu, date: "2026-09-05", current: 2 },
        { ...magalu, date: "2026-10-05", current: 3 },
      ],
      "2026-10",
    );
    expect(future).toHaveLength(7);
    expect(future[0]).toEqual({ purchaseKey: "magalu", month: "2026-11", amountCents: -30_000, number: 4, total: 10 });
    expect(future.at(-1)?.month).toBe("2027-05");
  });

  it("parcela atrasada que ainda não apareceu entra no mês corrente", () => {
    const future = futureInstallments([{ ...magalu, date: "2026-09-05", current: 9 }], "2026-10");
    expect(future.map((item) => `${item.month}:${item.number}`)).toEqual(["2026-10:10"]);
  });

  it("última parcela paga não projeta nada; dados inválidos são ignorados", () => {
    expect(futureInstallments([{ ...magalu, date: "2026-10-05", current: 10 }], "2026-10")).toEqual([]);
    expect(futureInstallments([{ ...magalu, date: "2026-10-05", current: 0 }], "2026-10")).toEqual([]);
    expect(futureInstallments([{ ...magalu, total: 1, date: "2026-10-05", current: 1 }], "2026-10")).toEqual([]);
  });

  it("ordena por mês e compra", () => {
    const future = futureInstallments(
      [
        { purchaseKey: "b", amountCents: -100, total: 3, date: "2026-10-01", current: 1 },
        { purchaseKey: "a", amountCents: -200, total: 2, date: "2026-10-01", current: 1 },
      ],
      "2026-10",
    );
    expect(future.map((item) => `${item.month}:${item.purchaseKey}`)).toEqual(["2026-11:a", "2026-11:b", "2026-12:b"]);
  });
});
