import { describe, expect, it } from "vitest";
import { type AccountIdentity, duplicateConnections } from "./duplicates";

const account = (connectionId: string | null, number: string | null, extra: Partial<AccountIdentity> = {}): AccountIdentity => ({
  connectionId,
  type: "CHECKING",
  name: "Conta Corrente",
  number,
  currency: "BRL",
  ...extra,
});

describe("duplicateConnections", () => {
  it("a mesma conta em duas conexões marca as duas", () => {
    const result = duplicateConnections([account("a", "1234/56789-0"), account("b", "123456789-0"), account("c", "0001/777-7")]);
    expect([...result]).toEqual([
      ["a", ["b"]],
      ["b", ["a"]],
    ]);
  });

  it("nome com acento e caixa diferentes ainda é a mesma conta", () => {
    expect(duplicateConnections([account("a", "4321", { type: "CREDIT", name: "Nubank Ultravioleta" }), account("b", "4321", { type: "CREDIT", name: "NUBANK  ultravioleta" })]).size).toBe(2);
  });

  it("número, tipo, nome ou moeda diferentes não são a mesma conta", () => {
    expect(duplicateConnections([account("a", "111"), account("b", "222")]).size).toBe(0);
    expect(duplicateConnections([account("a", "111"), account("b", "111", { type: "SAVINGS" })]).size).toBe(0);
    expect(duplicateConnections([account("a", "4321", { name: "Cartão Itaú" }), account("b", "4321", { name: "Nubank" })]).size).toBe(0);
    expect(duplicateConnections([account("a", "111"), account("b", "111", { currency: "USD" })]).size).toBe(0);
  });

  it("sem número ou sem conexão não dá para afirmar", () => {
    expect(duplicateConnections([account("a", null), account("b", null)]).size).toBe(0);
    expect(duplicateConnections([account(null, "111"), account(null, "111")]).size).toBe(0);
  });

  it("duas contas iguais na mesma conexão não são conexão repetida", () => {
    expect(duplicateConnections([account("a", "111"), account("a", "111")]).size).toBe(0);
  });

  it("três conexões do mesmo banco apontam umas para as outras", () => {
    expect(duplicateConnections([account("c", "9"), account("a", "9"), account("b", "9")]).get("a")).toEqual(["b", "c"]);
  });
});
