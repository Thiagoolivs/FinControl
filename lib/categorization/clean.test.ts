import { describe, expect, it } from "vitest";
import { cleanDescription } from "./clean";

describe("cleanDescription", () => {
  it("tira intermediador de pagamento e número de autorização", () => {
    expect(cleanDescription("PAG*IFOOD 4421")).toBe("IFOOD");
    expect(cleanDescription("PAYPAL *SPOTIFY 3512345")).toBe("SPOTIFY");
    expect(cleanDescription("MP *MERCADOLIVRE")).toBe("MERCADOLIVRE");
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
});
