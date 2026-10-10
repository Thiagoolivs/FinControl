import { Money } from "./money";
import { RowLink } from "./row-link";
import { LoadingRegion, Skeleton } from "./skeleton";
import type { Scope } from "./status";
import { ScopeTag } from "./text";

type StatRowProps = {
  label: string;
  valueCents: number;
  hint?: string;
  scope?: Scope;
  href?: string;
  loading?: boolean;
};

export function StatRow({ label, valueCents, hint, scope, href, loading = false }: StatRowProps) {
  if (loading) {
    return (
      <LoadingRegion label={`Carregando ${label}`} className="flex min-h-[60px] items-center gap-3 py-2">
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-44" />
        </div>
        <Skeleton className="h-4 w-24" />
      </LoadingRegion>
    );
  }
  return (
    <RowLink href={href} className="min-h-[60px] py-2">
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex items-center gap-2 text-[15px] font-medium">
          {label}
          {scope ? <ScopeTag scope={scope} /> : null}
        </span>
        {hint ? <span className="text-[13px] text-text-secondary">{hint}</span> : null}
      </span>
      <Money cents={valueCents} className="text-[17px]" />
    </RowLink>
  );
}
