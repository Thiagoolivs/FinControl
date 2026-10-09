import type { ReactNode } from "react";
import { EmptyState, ErrorState } from "./empty-state";
import { type AmountKind, Money } from "./money";
import { RowLink } from "./row-link";
import { LoadingRegion, Skeleton } from "./skeleton";
import type { Scope, ViewStatus } from "./status";
import { Eyebrow, ScopeTag, Tag } from "./text";

export type TransactionItemData = {
  id: string;
  description: string;
  meta?: string;
  amountCents: number;
  kind: Exclude<AmountKind, "neutral">;
  scope: Scope;
  pending?: boolean;
  installment?: string;
  href?: string;
};

export function TransactionItem({ item }: { item: TransactionItemData }) {
  return (
    <RowLink href={item.href} className="min-h-14 py-1.5">
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[16px]">{item.description}</span>
          <ScopeTag scope={item.scope} />
          {item.installment ? <Tag>{item.installment}</Tag> : null}
          {item.pending ? <Tag>Pendente</Tag> : null}
        </span>
        {item.meta ? <span className="truncate text-[13px] text-text-secondary">{item.meta}</span> : null}
      </span>
      <Money cents={item.amountCents} kind={item.kind} className="shrink-0 text-[16px]" />
    </RowLink>
  );
}

type TransactionListProps = {
  groups: { label: string; items: TransactionItemData[] }[];
  status?: ViewStatus;
  emptyTitle?: string;
  errorAction?: ReactNode;
};

export function TransactionList({ groups, status = "ready", emptyTitle = "Nenhuma transação no período.", errorAction }: TransactionListProps) {
  if (status === "loading") {
    return (
      <LoadingRegion label="Carregando transações" className="flex flex-col gap-4">
        <Skeleton className="h-3 w-16" />
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex items-center gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </LoadingRegion>
    );
  }
  if (status === "error") return <ErrorState title="Não foi possível carregar as transações." action={errorAction} />;
  if (status === "empty" || groups.every((group) => group.items.length === 0)) return <EmptyState compact title={emptyTitle} />;

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label} className="flex flex-col gap-1">
          <Eyebrow as="h3" className="pb-1 tracking-[0.08em]">
            {group.label}
          </Eyebrow>
          <ul className="m-0 flex list-none flex-col p-0">
            {group.items.map((item) => (
              <li key={item.id}>
                <TransactionItem item={item} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
