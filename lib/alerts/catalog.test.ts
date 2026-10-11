import { describe, expect, it } from "vitest";
import { ALERT_CATALOG, ALERT_TYPES, alertHref, readParams } from "./catalog";

describe("readParams", () => {
  it("preenche o valor inicial e limita ao intervalo", () => {
    expect(readParams("CATEGORIA_ACIMA_MEDIA", {})).toEqual({ limiteBps: 12_000 });
    expect(readParams("CATEGORIA_ACIMA_MEDIA", { limiteBps: 5 })).toEqual({ limiteBps: 10_000 });
    expect(readParams("CONSENTIMENTO_EXPIRANDO", { diasAntes: 10 })).toEqual({ diasAntes: 10 });
    expect(readParams("CONSENTIMENTO_EXPIRANDO", { diasAntes: 1.5 })).toEqual({ diasAntes: 30 });
    expect(readParams("ASSINATURA_NOVA", null)).toEqual({});
  });
});

describe("alertHref", () => {
  it("abre a tela do alerta, não a home", () => {
    expect(alertHref("GASTO_UNICO_ALTO", { transactionId: "abc" })).toBe("/transacoes/abc");
    expect(alertHref("META_ATRASADA", { goalId: "g1" })).toBe("/metas/g1");
    expect(alertHref("META_ATRASADA", {})).toBe("/metas");
    expect(ALERT_TYPES.every((type) => alertHref(type, {}) !== "/")).toBe(true);
  });
});

describe("ALERT_CATALOG", () => {
  it("iniciais dentro do intervalo", () => {
    for (const spec of Object.values(ALERT_CATALOG)) {
      for (const param of spec.params) expect(param.initial >= param.min && param.initial <= param.max).toBe(true);
    }
  });
});
