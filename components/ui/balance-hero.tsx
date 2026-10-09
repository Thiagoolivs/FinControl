import type { ReactNode } from "react";
import { shareBps } from "@/lib/finance/share";
import { cn } from "./cn";
import { EmptyState, ErrorState } from "./empty-state";
import { HeroAmount, Money } from "./money";
import { RowLink } from "./row-link";
import { LoadingRegion, Skeleton } from "./skeleton";
import type { ScopeFilter, ViewStatus } from "./status";
import { Eyebrow, ScopeTag } from "./text";

type BalanceHeroProps = {
  amountCents: number;
  scope: ScopeFilter;
  label?: string;
  caption?: string;
  status?: ViewStatus;
  /** Barra de composição (direção C) logo abaixo do número. */
  composition?: ReactNode;
  emptyAction?: ReactNode;
  errorAction?: ReactNode;
};

export function BalanceHero({
  amountCents,
  scope,
  label = "Disponível",
  caption,
  status = "ready",
  composition,
  emptyAction,
  errorAction,
}: BalanceHeroProps) {
  return (
    <section aria-label={label} className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <Eyebrow>{label}</Eyebrow>
        {scope === "PJ" ? <ScopeTag scope="PJ" /> : null}
      </div>

      {status === "loading" ? (
        <LoadingRegion label="Carregando saldo" className="flex flex-col gap-3">
          <Skeleton className="h-[76px] w-[240px] rounded-xl" />
          <Skeleton className="h-3.5 w-[180px]" />
        </LoadingRegion>
      ) : status === "error" ? (
        <ErrorState
          title="Não foi possível calcular o saldo."
          description="As contas não responderam na última sincronização."
          action={errorAction}
        />
      ) : status === "empty" ? (
        <>
          <p aria-hidden="true" className="m-0 text-[72px] font-light leading-[76px] tracking-[-0.045em] text-text-tertiary">
            —
          </p>
          <EmptyState
            compact
            title="Nenhuma conta conectada."
            description="Conecte um banco pelo Open Finance para ver o saldo aqui."
            action={emptyAction}
          />
        </>
      ) : (
        <>
          <HeroAmount cents={amountCents} />
          {caption ? <p className="m-0 text-[15px] text-text-secondary">{caption}</p> : null}
          {composition}
        </>
      )}
    </section>
  );
}

export type CompositionSegment = {
  key: "disponivel" | "reservado" | "negocio";
  label: string;
  cents: number;
  href?: string;
};

const SEGMENT_FILL: Record<CompositionSegment["key"], string> = {
  disponivel: "bg-text-primary",
  reservado: "bg-scope-pj",
  negocio: "texture-business",
};

type BalanceCompositionProps = {
  segments: CompositionSegment[];
  total: { label: string; cents: number; href?: string };
};

/** Saldo bruto dividido em Disponível / Reservado / Caixa do negócio. A legenda carrega os valores. */
export function BalanceComposition({ segments, total }: BalanceCompositionProps) {
  const visible = segments.filter((segment) => segment.cents > 0);
  const visibleTotal = visible.reduce((sum, segment) => sum + segment.cents, 0);

  return (
    <div className="mt-4 flex flex-col">
      {visible.length > 1 ? (
        <div aria-hidden="true" className="flex h-3 gap-0.5">
          {visible.map((segment) => (
            <div
              key={segment.key}
              className={cn("min-w-1.5 rounded-[4px]", SEGMENT_FILL[segment.key])}
              style={{ flexGrow: shareBps(segment.cents, visibleTotal), flexBasis: 0 }}
            />
          ))}
        </div>
      ) : null}
      <ul className="m-0 mt-2 flex list-none flex-col p-0">
        {segments.map((segment) => (
          <li key={segment.key}>
            <RowLink href={segment.href}>
              <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", SEGMENT_FILL[segment.key])} />
              <span className="flex flex-1 items-center gap-2 text-[15px] font-medium">
                {segment.label}
                {segment.key !== "disponivel" ? <ScopeTag scope="PJ" /> : null}
              </span>
              <Money cents={segment.cents} className={cn("text-[15px]", segment.cents < 0 && "text-negative")} />
            </RowLink>
          </li>
        ))}
        <li className="mt-1">
          <RowLink href={total.href}>
            <span className="flex-1 text-[15px] text-text-secondary">{total.label}</span>
            <Money cents={total.cents} className="text-[15px]" />
          </RowLink>
        </li>
      </ul>
    </div>
  );
}
