import { describe, expect, it } from "vitest";
import { needsReconnect, toAccountType, toAssetClass, toBankExtras, toConnectionStatus, toLocalDate, toQuantity, toTransactionCents } from "./normalize";

describe("toConnectionStatus", () => {
  it("mapeia os status da Pluggy", () => {
    expect(toConnectionStatus("UPDATED")).toBe("UPDATED");
    expect(toConnectionStatus("MERGING")).toBe("UPDATING");
    expect(toConnectionStatus("WAITING_USER_ACTION")).toBe("WAITING_USER_INPUT");
    expect(toConnectionStatus("LOGIN_ERROR")).toBe("LOGIN_ERROR");
  });

  it("status desconhecido pede atenção", () => {
    expect(toConnectionStatus("SOMETHING_NEW")).toBe("OUTDATED");
    expect(toConnectionStatus("toString")).toBe("OUTDATED");
  });

  it("só erro de login e desatualizada pedem reconexão", () => {
    expect(needsReconnect("LOGIN_ERROR")).toBe(true);
    expect(needsReconnect("OUTDATED")).toBe(true);
    expect(needsReconnect("UPDATING")).toBe(false);
  });
});

describe("toAccountType", () => {
  it("separa corrente, poupança e cartão", () => {
    expect(toAccountType("BANK", "CHECKING_ACCOUNT")).toBe("CHECKING");
    expect(toAccountType("BANK", "SAVINGS_ACCOUNT")).toBe("SAVINGS");
    expect(toAccountType("BANK", null)).toBe("CHECKING");
    expect(toAccountType("CREDIT", "CREDIT_CARD")).toBe("CREDIT");
    expect(toAccountType("LOAN", null)).toBeNull();
  });
});

describe("toTransactionCents", () => {
  it("conta bancária mantém o sinal da Pluggy", () => {
    expect(toTransactionCents("CHECKING", -45.9)).toBe(-4590);
    expect(toTransactionCents("SAVINGS", 1200)).toBe(120000);
  });

  it("cartão inverte: compra vira saída, pagamento vira entrada", () => {
    expect(toTransactionCents("CREDIT", 89.9)).toBe(-8990);
    expect(toTransactionCents("CREDIT", -1500)).toBe(150000);
    expect(Object.is(toTransactionCents("CREDIT", 0), 0)).toBe(true);
  });

  it("compra em moeda estrangeira usa o valor na moeda da conta", () => {
    expect(toTransactionCents("CREDIT", 20, 112.34)).toBe(-11234);
    expect(toTransactionCents("CHECKING", -20, null)).toBe(-2000);
  });
});

describe("toLocalDate", () => {
  it("mantém data sem hora", () => {
    expect(toLocalDate("2026-10-08")).toBe("2026-10-08");
  });

  it("meia-noite UTC é a própria data, não o dia anterior em São Paulo", () => {
    expect(toLocalDate("2026-10-08T00:00:00.000Z")).toBe("2026-10-08");
    expect(toLocalDate("2026-10-08T00:00:00Z")).toBe("2026-10-08");
  });

  it("meia-noite de São Paulo e instantes reais viram o dia local", () => {
    expect(toLocalDate("2026-10-08T03:00:00.000Z")).toBe("2026-10-08");
    expect(toLocalDate("2026-10-09T01:15:00.000Z")).toBe("2026-10-08");
    expect(toLocalDate("2026-10-08T14:32:10-03:00")).toBe("2026-10-08");
  });

  it("rejeita data inválida", () => {
    expect(() => toLocalDate("ontem")).toThrow(RangeError);
  });
});

describe("toAssetClass", () => {
  it.each([
    ["EQUITY", "STOCK", "ACAO"],
    ["EQUITY", "REAL_ESTATE_FUND", "FII"],
    ["ETF", null, "ACAO"],
    ["FIXED_INCOME", "CDB", "RENDA_FIXA"],
    ["SECURITY", "TREASURY", "RENDA_FIXA"],
    ["COE", null, "RENDA_FIXA"],
    ["MUTUAL_FUND", "MULTIMARKET_FUND", "FUNDO"],
    ["OTHER", "CRYPTOCURRENCY", "CRIPTO"],
    ["OTHER", null, "FUNDO"],
  ])("%s/%s → %s", (type, subtype, expected) => {
    expect(toAssetClass(type, subtype)).toBe(expected);
  });
});

describe("toQuantity", () => {
  it("texto decimal sem notação científica", () => {
    expect(toQuantity(100)).toBe("100");
    expect(toQuantity(12.5)).toBe("12.5");
    expect(toQuantity(0.00000012)).toBe("0.00000012");
    expect(toQuantity(null)).toBe("0");
    expect(toQuantity(-1)).toBe("0");
  });
});

describe("toBankExtras", () => {
  it("lê aplicação automática, caixinhas, cheque especial e saldo disponível", () => {
    expect(
      toBankExtras(
        {
          closingBalance: 1200.5,
          // Open Finance: saldo disponível já somado ao aplicado (1.200,50 + 3.800,00).
          automaticallyInvestedBalance: 5000.5,
          overdraftContractedLimit: 2000,
          overdraftUsedLimit: 0,
          reservedBalances: [
            { name: "Caixinha Para Férias", availableAmounts: [{ amount: 1500.25, currencyCode: "BRL" }, { amount: 99.75, currencyCode: "BRL" }] },
            { name: null, availableAmounts: [{ amount: 300, currencyCode: null }] },
          ],
        },
        "BRL",
        120_050,
      ),
    ).toEqual({
      autoInvestedCents: 380_000,
      savedCents: 190_000,
      savedBoxes: [
        { name: "Caixinha Para Férias", cents: 160_000 },
        { name: "Saldo reservado", cents: 30_000 },
      ],
      closingBalanceCents: 120_050,
      overdraftLimitCents: 200_000,
      overdraftUsedCents: 0,
    });
  });

  it("sem bankData (cartão, banco que não informa), tudo zero ou nulo", () => {
    expect(toBankExtras(null, "BRL", 10_000)).toEqual({
      autoInvestedCents: 0,
      savedCents: 0,
      savedBoxes: [],
      closingBalanceCents: null,
      overdraftLimitCents: null,
      overdraftUsedCents: null,
    });
  });

  it("caixinha em outra moeda e caixinha vazia ficam de fora", () => {
    const extras = toBankExtras(
      { reservedBalances: [{ name: "Dólar", availableAmounts: [{ amount: 100, currencyCode: "USD" }] }, { name: "Vazia", availableAmounts: [] }] },
      "BRL",
      0,
    );
    expect(extras.savedBoxes).toEqual([]);
    expect(extras.savedCents).toBe(0);
  });

  it("banco sem aplicação manda o próprio saldo como 'com aplicação automática': não dobra", () => {
    expect(toBankExtras({ automaticallyInvestedBalance: 2790.36 }, "BRL", 279_036).autoInvestedCents).toBe(0);
  });

  it("valor menor que o saldo não é 'saldo + aplicado': nada a somar", () => {
    expect(toBankExtras({ automaticallyInvestedBalance: 1 }, "BRL", 120_950).autoInvestedCents).toBe(0);
  });

  it("saldo negativo (cheque especial) com aplicação: soma só o aplicado", () => {
    expect(toBankExtras({ automaticallyInvestedBalance: 900 }, "BRL", -10_000).autoInvestedCents).toBe(100_000);
  });
});
