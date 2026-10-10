import { describe, expect, it } from "vitest";
import { summarizeFlows } from "./flows";

describe("summarizeFlows", () => {
  it("separa entradas e saídas", () => {
    expect(
      summarizeFlows([
        { amountCents: 1_000_000, isTransfer: false },
        { amountCents: -4_590, isTransfer: false },
        { amountCents: -120_000, isTransfer: false },
      ]),
    ).toEqual({ inCents: 1_000_000, outCents: 124_590, netCents: 875_410, transferCount: 0 });
  });

  it("transferência e pagamento de fatura não contam como gasto nem como receita", () => {
    expect(
      summarizeFlows([
        { amountCents: -320_045, isTransfer: true },
        { amountCents: 320_045, isTransfer: true },
        { amountCents: -8_990, isTransfer: false },
      ]),
    ).toEqual({ inCents: 0, outCents: 8_990, netCents: -8_990, transferCount: 2 });
  });

  it("período vazio", () => {
    expect(summarizeFlows([])).toEqual({ inCents: 0, outCents: 0, netCents: 0, transferCount: 0 });
  });
});
