import { describe, expect, it } from "vitest";
import { matchTransfers, type TransferCandidate } from "./transfers";

const tx = (
  id: string,
  accountId: string,
  date: string,
  amountCents: number,
  accountType: TransferCandidate["accountType"] = "CHECKING",
): TransferCandidate => ({ id, accountId, accountType, date, amountCents });

describe("matchTransfers", () => {
  it("pareia saída e entrada de mesmo valor em contas diferentes", () => {
    const pairs = matchTransfers([tx("a", "itau", "2026-10-01", -150000), tx("b", "nubank", "2026-10-01", 150000)]);
    expect(pairs).toEqual([{ outId: "a", inId: "b" }]);
  });

  it("não pareia dentro da mesma conta", () => {
    expect(matchTransfers([tx("a", "itau", "2026-10-01", -5000), tx("b", "itau", "2026-10-01", 5000)])).toEqual([]);
  });

  it("aceita até 3 dias, em qualquer ordem, e recusa 4", () => {
    expect(matchTransfers([tx("a", "x", "2026-10-01", -100), tx("b", "y", "2026-10-04", 100)])).toHaveLength(1);
    expect(matchTransfers([tx("a", "x", "2026-10-04", -100), tx("b", "y", "2026-10-01", 100)])).toHaveLength(1);
    expect(matchTransfers([tx("a", "x", "2026-10-01", -100), tx("b", "y", "2026-10-05", 100)])).toEqual([]);
  });

  it("valores diferentes não formam par", () => {
    expect(matchTransfers([tx("a", "x", "2026-10-01", -10000), tx("b", "y", "2026-10-01", 10001)])).toEqual([]);
  });

  it("pagamento de fatura: débito na conta e entrada no cartão", () => {
    const pairs = matchTransfers([
      tx("debito", "itau", "2026-10-10", -320045),
      tx("pagamento", "cartao", "2026-10-09", 320045, "CREDIT"),
    ]);
    expect(pairs).toEqual([{ outId: "debito", inId: "pagamento" }]);
  });

  it("compra no cartão nunca é perna de transferência", () => {
    const pairs = matchTransfers([tx("compra", "cartao", "2026-10-01", -5000, "CREDIT"), tx("pix", "itau", "2026-10-01", 5000)]);
    expect(pairs).toEqual([]);
  });

  it("com candidatos repetidos, fica com o par mais próximo", () => {
    const pairs = matchTransfers([
      tx("saida", "x", "2026-10-05", -20000),
      tx("longe", "y", "2026-10-02", 20000),
      tx("perto", "z", "2026-10-05", 20000),
    ]);
    expect(pairs).toEqual([{ outId: "saida", inId: "perto" }]);
  });

  it("cada transação entra em um par só", () => {
    const pairs = matchTransfers([
      tx("s1", "x", "2026-10-01", -1000),
      tx("s2", "x", "2026-10-03", -1000),
      tx("e1", "y", "2026-10-01", 1000),
      tx("e2", "y", "2026-10-03", 1000),
    ]);
    expect(pairs).toEqual([
      { outId: "s1", inId: "e1" },
      { outId: "s2", inId: "e2" },
    ]);
  });

  it("o resultado não depende da ordem de entrada", () => {
    const input = [
      tx("s1", "x", "2026-10-02", -1000),
      tx("s2", "w", "2026-10-02", -1000),
      tx("e1", "y", "2026-10-03", 1000),
      tx("e2", "z", "2026-10-01", 1000),
    ];
    expect(matchTransfers([...input].reverse())).toEqual(matchTransfers(input));
  });
});
