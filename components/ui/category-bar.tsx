import type { ReactNode } from "react";
import { type CategorySpend, foldCategories } from "@/lib/finance/categories";
import { formatCents } from "@/lib/finance/money";
import { formatBps } from "@/lib/finance/share";
import { cn } from "./cn";
import { EmptyState, ErrorState } from "./empty-state";
import { Icon, isIconName } from "./icon";
import { Money } from "./money";
import { LoadingRegion, Skeleton } from "./skeleton";
import type { ViewStatus } from "./status";
import { Eyebrow } from "./text";

const RANK_FILL = ["bg-cat-1", "bg-cat-2", "bg-cat-3", "bg-cat-4", "bg-cat-5"] as const;
const RANK_INK = ["text-cat-1", "text-cat-2", "text-cat-3", "text-cat-4", "text-cat-5"] as const;

type CategoryBarProps = {
  title: string;
  items: CategorySpend[];
  /** Acima disso (em bps da média) a categoria fica laranja. Vem da regra de alerta do usuário. */
  overThresholdBps: number;
  maxVisible?: number;
  status?: ViewStatus;
  emptyTitle?: string;
  errorAction?: ReactNode;
};

export function CategoryBar({
  title,
  items,
  overThresholdBps,
  maxVisible = 5,
  status = "ready",
  emptyTitle = "Nenhum gasto no período.",
  errorAction,
}: CategoryBarProps) {
  const slices = foldCategories(items, maxVisible);
  const totalCents = slices.reduce((sum, slice) => sum + slice.cents, 0);

  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Eyebrow as="h2">{title}</Eyebrow>
        {status === "ready" ? (
          <p className="m-0 text-[34px] font-light leading-10 tracking-[-0.03em]">{formatCents(totalCents)}</p>
        ) : null}
      </div>

      {status === "loading" ? (
        <LoadingRegion label="Carregando gastos" className="flex flex-col gap-4">
          <Skeleton className="h-10 w-40 rounded-lg" />
          <Skeleton className="h-2.5 w-full" />
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3.5 w-20" />
            </div>
          ))}
        </LoadingRegion>
      ) : status === "error" ? (
        <ErrorState title="Não foi possível carregar os gastos." action={errorAction} />
      ) : status === "empty" || slices.length === 0 ? (
        <EmptyState compact title={emptyTitle} />
      ) : (
        <>
          <div aria-hidden="true" className="flex h-2.5 gap-0.5">
            {slices.map((slice, index) => (
              <div
                key={slice.id}
                className={cn("min-w-1 rounded-[3px]", isOver(slice.averageRatioBps, overThresholdBps) ? "bg-warning" : RANK_FILL[Math.min(index, 4)])}
                style={{ flexGrow: slice.shareBps, flexBasis: 0 }}
              />
            ))}
          </div>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {slices.map((slice, index) => {
              const over = isOver(slice.averageRatioBps, overThresholdBps);
              return (
                <li key={slice.id} className="flex min-h-9 items-center gap-3">
                  <Icon
                    name={isIconName(slice.icon) ? slice.icon : "dots"}
                    size={16}
                    className={cn("shrink-0", over ? "text-warning" : RANK_INK[Math.min(index, 4)])}
                  />
                  <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                    <span className="text-[15px]">{slice.name}</span>
                    <span className="text-[13px] text-text-secondary">{formatBps(slice.shareBps)}</span>
                    {over && slice.averageRatioBps !== null ? (
                      <span className="text-[13px] text-warning">{formatBps(slice.averageRatioBps)} da média</span>
                    ) : null}
                  </span>
                  <Money cents={slice.cents} className="text-[15px]" />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function isOver(ratioBps: number | null, thresholdBps: number): boolean {
  return ratioBps !== null && ratioBps >= thresholdBps;
}
