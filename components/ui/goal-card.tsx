import { formatCents } from "@/lib/finance/money";
import { formatBps, progressBps } from "@/lib/finance/share";
import { cn } from "./cn";
import { Icon } from "./icon";
import { RowLink } from "./row-link";
import { LoadingRegion, Skeleton } from "./skeleton";
import type { Scope } from "./status";
import { ScopeTag } from "./text";

export type GoalStatus = "on-track" | "late" | "done";

type GoalCardProps = {
  name: string;
  scope: Scope;
  currentCents: number;
  targetCents: number;
  monthlyRequiredCents: number;
  targetDateLabel: string;
  status: GoalStatus;
  /** Data em que a meta fecha no ritmo atual — só faz sentido quando atrasada. */
  realisticDateLabel?: string;
  href?: string;
  loading?: boolean;
};

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function GoalCard(props: GoalCardProps) {
  if (props.loading) {
    return (
      <LoadingRegion label="Carregando meta" className="flex items-center gap-5 py-1">
        <Skeleton className="size-[88px] rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3 w-48" />
        </div>
      </LoadingRegion>
    );
  }

  const { name, scope, currentCents, targetCents, monthlyRequiredCents, targetDateLabel, status, realisticDateLabel, href } = props;
  const bps = progressBps(currentCents, targetCents);
  const ringColor = status === "late" ? "stroke-negative" : "stroke-positive";

  return (
    <RowLink href={href} className="gap-5 py-1">
      <div className="relative size-[88px] shrink-0">
        <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true">
          <circle cx="44" cy="44" r={RADIUS} fill="none" strokeWidth="3" className="stroke-grid" />
          <circle
            cx="44"
            cy="44"
            r={RADIUS}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${(CIRCUMFERENCE * bps) / 10_000} ${CIRCUMFERENCE}`}
            transform="rotate(-90 44 44)"
            className={cn(ringColor, "transition-[stroke-dasharray] duration-300 ease-apple")}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[24px] font-light tracking-[-0.03em]">
          {formatBps(bps)}
        </span>
      </div>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2 text-[17px] font-medium">
          {name}
          <ScopeTag scope={scope} />
        </span>
        <span className="text-[15px] text-text-secondary">
          {formatCents(currentCents, { hideZeroCents: true })} de {formatCents(targetCents, { hideZeroCents: true })}
        </span>
        <GoalStatusLine
          status={status}
          monthlyRequiredCents={monthlyRequiredCents}
          targetDateLabel={targetDateLabel}
          realisticDateLabel={realisticDateLabel}
        />
      </span>
    </RowLink>
  );
}

function GoalStatusLine({
  status,
  monthlyRequiredCents,
  targetDateLabel,
  realisticDateLabel,
}: Pick<GoalCardProps, "status" | "monthlyRequiredCents" | "targetDateLabel" | "realisticDateLabel">) {
  const monthly = `${formatCents(monthlyRequiredCents, { hideZeroCents: true })}/mês`;
  if (status === "done") {
    return (
      <span className="flex items-start gap-1.5 text-[13px] text-positive">
        <Icon name="check" size={14} strokeWidth={2.4} className="mt-[3px] shrink-0" />
        Concluída
      </span>
    );
  }
  if (status === "late") {
    return (
      <>
        <span className="flex items-start gap-1.5 text-[13px] text-negative">
          <Icon name="alert" size={14} strokeWidth={2.2} className="mt-[3px] shrink-0" />
          Atrasada{realisticDateLabel ? ` · no ritmo atual, ${realisticDateLabel}` : ""}
        </span>
        <span className="text-[13px] text-text-secondary">
          Precisa {monthly} para {targetDateLabel}
        </span>
      </>
    );
  }
  return (
    <span className="flex items-start gap-1.5 text-[13px] text-positive">
      <Icon name="check" size={14} strokeWidth={2.4} className="mt-[3px] shrink-0" />
      No prazo · {monthly} até {targetDateLabel}
    </span>
  );
}
