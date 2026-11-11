import Link from "next/link";
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
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  errorDescription?: string;
  errorAction?: ReactNode;
};

export function BalanceHero({
  amountCents,
  scope,
  label = "Você tem",
  caption,
  status = "ready",
  composition,
  emptyTitle = "Nenhuma conta conectada.",
  emptyDescription = "Conecte um banco pelo Open Finance para ver o saldo aqui.",
  emptyAction,
  errorDescription = "As contas não responderam na última sincronização.",
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
          description={errorDescription}
          action={errorAction}
        />
      ) : status === "empty" ? (
        <>
          <p aria-hidden="true" className="m-0 text-[72px] font-light leading-[76px] tracking-[-0.045em] text-text-tertiary">
            —
          </p>
          <EmptyState
            compact
            title={emptyTitle}
            description={emptyDescription}
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
  key: "pessoal" | "guardado" | "empresa";
  label: string;
  cents: number;
  href?: string;
};

const SEGMENT_FILL: Record<CompositionSegment["key"], string> = {
  pessoal: "bg-text-primary",
  guardado: "bg-positive",
  empresa: "bg-scope-pj",
};

type BalanceCompositionProps = {
  segments: CompositionSegment[];
  /** Atalho para ver conta por conta. */
  link?: { label: string; href: string };
};

function SegmentLink({ href, children }: { href?: string; children: ReactNode }) {
  const className = "flex min-h-11 flex-col justify-center gap-0.5 text-text-primary no-underline";
  return href ? (
    <Link href={href} className={cn(className, "transition-opacity duration-200 ease-apple active:opacity-60")}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

/**
 * De onde é o dinheiro: pessoal (PF), guardado (caixinhas) e empresa (PJ). Barra e legenda só aparecem
 * quando há mais de uma parte; com uma só, o número grande já diz tudo.
 */
export function BalanceComposition({ segments, link }: BalanceCompositionProps) {
  const visible = segments.filter((segment) => segment.cents !== 0);
  const positive = visible.filter((segment) => segment.cents > 0);
  const positiveTotal = positive.reduce((sum, segment) => sum + segment.cents, 0);
  const split = visible.length > 1;

  return (
    <div className="mt-4 flex flex-col">
      {split && positive.length > 1 ? (
        <div aria-hidden="true" className="flex h-2.5 gap-0.5">
          {positive.map((segment) => (
            <div
              key={segment.key}
              className={cn("min-w-1.5 rounded-[4px]", SEGMENT_FILL[segment.key])}
              style={{ flexGrow: shareBps(segment.cents, positiveTotal), flexBasis: 0 }}
            />
          ))}
        </div>
      ) : null}
      {split ? (
        <ul className="m-0 mt-4 grid list-none grid-cols-3 gap-x-4 gap-y-3 p-0">
          {visible.map((segment) => (
            <li key={segment.key} className="min-w-0">
              <SegmentLink href={segment.href}>
                <span className="flex items-center gap-1.5 text-[13px] text-text-secondary">
                  <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", SEGMENT_FILL[segment.key])} />
                  <span className="truncate">{segment.label}</span>
                </span>
                <Money cents={segment.cents} hideZeroCents className={cn("text-[16px]", segment.cents < 0 && "text-negative")} />
              </SegmentLink>
            </li>
          ))}
        </ul>
      ) : null}
      {link ? (
        <RowLink href={link.href} className={split ? "mt-3" : undefined}>
          <span className="flex-1 text-[15px] text-text-secondary">{link.label}</span>
        </RowLink>
      ) : null}
    </div>
  );
}
