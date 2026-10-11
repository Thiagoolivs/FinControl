import type { TransactionItemData } from "@/components/ui/transaction-item";
import type { Scope } from "@/generated/prisma/enums";
import { formatDayLabel, fromDbDate } from "@/lib/dates";

type Row = {
  id: string;
  date: Date;
  amountCents: number;
  descriptionClean: string;
  status: "PENDING" | "POSTED";
  scope: Scope;
  transferPeerId: string | null;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  account: { name: string };
  category: { kind: string } | null;
};

/** Transferência entre contas próprias: par detectado ou categoria do tipo transferência. */
export function isTransferRow(row: Pick<Row, "transferPeerId" | "category">): boolean {
  return row.transferPeerId !== null || row.category?.kind === "TRANSFERENCIA";
}

export function toTransactionItem(row: Row, meta: string, href?: string): TransactionItemData {
  const transfer = isTransferRow(row);
  return {
    id: row.id,
    description: row.descriptionClean,
    meta,
    amountCents: row.amountCents,
    kind: transfer ? "transfer" : row.amountCents > 0 ? "in" : "out",
    scope: row.scope,
    pending: row.status === "PENDING",
    installment: row.installmentTotal && row.installmentCurrent ? `${row.installmentCurrent}/${row.installmentTotal}` : undefined,
    href,
  };
}

/** Agrupa por dia ("Hoje", "Ontem", "8 de outubro"), na ordem em que as linhas vieram. */
export function groupByDay<T extends Row>(rows: readonly T[], today: string, toItem: (row: T) => TransactionItemData) {
  const groups = new Map<string, TransactionItemData[]>();
  for (const row of rows) {
    const label = formatDayLabel(fromDbDate(row.date), today);
    groups.set(label, [...(groups.get(label) ?? []), toItem(row)]);
  }
  return [...groups].map(([label, items]) => ({ label, items }));
}
