import { describe, expect, it } from "vitest";
import { cleanDescription } from "./clean";

describe("cleanDescription", () => {
  it("tira intermediador de pagamento e número de autorização", () => {
    expect(cleanDescription("PAG*IFOOD 4421")).toBe("IFOOD");
    expect(cleanDescription("PAYPAL *SPOTIFY 3512345")).toBe("SPOTIFY");
    expect(cleanDescription("MP *MERCADOLIVRE")).toBe("MERCADOLIVRE");
  });

  it("tira a operação de cartão que o banco põe antes da loja", () => {
    expect(cleanDescription("Compra no débito - Minimercado Pdkm Ltda Sao Paulo")).toBe("Minimercado Pdkm Ltda Sao Paulo");
    expect(cleanDescription("COMPRA NO DEBITO - PADARIA REAL")).toBe("PADARIA REAL");
    expect(cleanDescription("Compra no crédito - Netflix.com")).toBe("Netflix.com");
    expect(cleanDescription("Compra no débito via NuPay - iFood")).toBe("iFood");
    expect(cleanDescription("Compra no débito - PAG*Lojinha 4421")).toBe("Lojinha");
  });

  it("mantém Pix e boleto, que dizem o que é a saída", () => {
    expect(cleanDescription("Pix enviado - Maria Silva")).toBe("Pix enviado - Maria Silva");
    expect(cleanDescription("Pagamento de boleto efetuado - Condominio")).toBe("Pagamento de boleto efetuado - Condominio");
  });

  it("mantém prefixos que dizem o que é o gasto", () => {
    expect(cleanDescription("UBER *TRIP 8812")).toBe("UBER *TRIP");
    expect(cleanDescription("IFD*BURGER KING")).toBe("IFD*BURGER KING");
  });

  it("tira sufixo de parcela", () => {
    expect(cleanDescription("MAGALU PARC 03/10")).toBe("MAGALU");
    expect(cleanDescription("CASAS BAHIA PARCELA 2 DE 12")).toBe("CASAS BAHIA");
    expect(cleanDescription("APPLE.COM/BILL (1/3)")).toBe("APPLE.COM/BILL");
  });

  it("tira horário, data e código de país", () => {
    expect(cleanDescription("PIX ENVIADO 10/10 14:32 MARIA SILVA")).toBe("PIX ENVIADO MARIA SILVA");
    expect(cleanDescription("NETFLIX.COM SAO PAULO BR")).toBe("NETFLIX.COM SAO PAULO");
  });

  it("não mexe em números curtos que fazem parte do nome", () => {
    expect(cleanDescription("99 TAXI")).toBe("99 TAXI");
    expect(cleanDescription("7 ELEVEN")).toBe("7 ELEVEN");
  });

  it("colapsa espaços e nunca devolve vazio", () => {
    expect(cleanDescription("  DAS   SIMPLES  NACIONAL ")).toBe("DAS SIMPLES NACIONAL");
    expect(cleanDescription("12345678")).toBe("12345678");
  });

  it("limpar de novo não muda nada (seguro rodar no histórico a cada deploy)", () => {
    const samples = ["PAG*IFOOD 4421", "Compra no débito - PAG*Lojinha 4421", "MAGALU PARC 03/10", "PIX ENVIADO 10/10 14:32 MARIA", "NETFLIX.COM SAO PAULO BR", "12345678"];
    for (const sample of samples) expect(cleanDescription(cleanDescription(sample))).toBe(cleanDescription(sample));
  });
});
