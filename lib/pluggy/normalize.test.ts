import { describe, expect, it } from "vitest";
import { needsReconnect, toAccountType, toConnectionStatus, toLocalDate, toTransactionCents } from "./normalize";

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
