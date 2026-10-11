import { describe, expect, it } from "vitest";
import { buildPushMessage } from "./push-message";

const alert = (n: number) => ({ id: `a${n}`, type: "GASTO_UNICO_ALTO", title: `Alerta ${n}`, body: `Corpo ${n}`, href: `/transacoes/t${n}` });

describe("buildPushMessage", () => {
  it("nada para mandar", () => {
    expect(buildPushMessage([])).toBeNull();
  });

  it("um alerta vai inteiro, com a tela dele", () => {
    expect(buildPushMessage([alert(1)])).toEqual({ title: "Alerta 1", body: "Corpo 1", tag: "fincontrol:GASTO_UNICO_ALTO", href: "/transacoes/t1", alertIds: ["a1"] });
  });

  it("vários viram um resumo com tag única que abre a central", () => {
    const message = buildPushMessage([1, 2, 3, 4, 5, 6].map(alert));
    expect(message?.title).toBe("6 alertas novos");
    expect(message?.body).toBe("Alerta 1\nAlerta 2\nAlerta 3\nAlerta 4\ne mais 2");
    expect(message?.tag).toBe("fincontrol:alertas");
    expect(message?.href).toBe("/alertas");
    expect(message?.alertIds).toHaveLength(6);
  });
});
