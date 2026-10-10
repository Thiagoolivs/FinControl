import { assertCents } from "./money";

export type FlowItem = { amountCents: number; isTransfer: boolean };

export type FlowSummary = {
  inCents: number; // positivo
  outCents: number; // positivo (soma das saídas, em módulo)
  netCents: number;
  transferCount: number;
};

/** Entradas e saídas de um período. Transferência entre contas próprias e pagamento de fatura ficam fora. */
export function summarizeFlows(items: readonly FlowItem[]): FlowSummary {
  const summary: FlowSummary = { inCents: 0, outCents: 0, netCents: 0, transferCount: 0 };
  for (const item of items) {
    assertCents(item.amountCents);
    if (item.isTransfer) {
      summary.transferCount += 1;
      continue;
    }
    if (item.amountCents > 0) summary.inCents += item.amountCents;
    else summary.outCents -= item.amountCents;
  }
  summary.netCents = summary.inCents - summary.outCents;
  return summary;
}
