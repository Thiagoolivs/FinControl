import type { AccountType } from "@/generated/prisma/enums";
import { daysBetween } from "@/lib/dates";
import { assertCents } from "./money";

/** Diferença máxima, em dias, entre a saída numa conta e a entrada na outra. */
export const TRANSFER_WINDOW_DAYS = 3;

export type TransferCandidate = {
  id: string;
  accountId: string;
  accountType: AccountType;
  date: string; // YYYY-MM-DD
  amountCents: number; // negativo = saída
};

export type TransferPair = { outId: string; inId: string };

/**
 * Pares saída/entrada entre contas próprias: mesmo valor, contas diferentes, até `windowDays` de distância
 * (em qualquer ordem — o cartão costuma lançar o pagamento antes do débito na conta).
 * Saída de cartão é compra, nunca perna de transferência; entrada no cartão é pagamento de fatura.
 * Ambiguidade (mesmo valor várias vezes) resolve pela menor distância em dias, de forma determinística.
 */
export function matchTransfers(
  candidates: readonly TransferCandidate[],
  windowDays: number = TRANSFER_WINDOW_DAYS,
): TransferPair[] {
  const byAmount = new Map<number, { outs: TransferCandidate[]; ins: TransferCandidate[] }>();
  for (const candidate of candidates) {
    assertCents(candidate.amountCents);
    if (candidate.amountCents === 0) continue;
    if (candidate.amountCents < 0 && candidate.accountType === "CREDIT") continue;
    const key = Math.abs(candidate.amountCents);
    const group = byAmount.get(key) ?? { outs: [], ins: [] };
    (candidate.amountCents < 0 ? group.outs : group.ins).push(candidate);
    byAmount.set(key, group);
  }

  const edges: { gap: number; out: TransferCandidate; in: TransferCandidate }[] = [];
  for (const { outs, ins } of byAmount.values()) {
    for (const out of outs) {
      for (const inflow of ins) {
        if (out.accountId === inflow.accountId) continue;
        const gap = Math.abs(daysBetween(out.date, inflow.date));
        if (gap <= windowDays) edges.push({ gap, out, in: inflow });
      }
    }
  }
  edges.sort(
    (a, b) =>
      a.gap - b.gap ||
      a.out.date.localeCompare(b.out.date) ||
      a.out.id.localeCompare(b.out.id) ||
      a.in.id.localeCompare(b.in.id),
  );

  const used = new Set<string>();
  const pairs: TransferPair[] = [];
  for (const edge of edges) {
    if (used.has(edge.out.id) || used.has(edge.in.id)) continue;
    used.add(edge.out.id);
    used.add(edge.in.id);
    pairs.push({ outId: edge.out.id, inId: edge.in.id });
  }
  return pairs;
}
