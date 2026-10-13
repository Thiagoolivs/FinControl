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
  label = "Disponível",
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
  key: "disponivel" | "guardado" | "reservado" | "negocio";
  label: string;
  cents: number;
  href?: string;
};

const SEGMENT_FILL: Record<CompositionSegment["key"], string> = {
  disponivel: "bg-text-primary",
  guardado: "bg-positive",
  reservado: "bg-scope-pj",
  negocio: "texture-business",
};

type BalanceCompositionProps = {
  segments: CompositionSegment[];
  total: { label: string; cents: number; href?: string };
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
 * Saldo bruto dividido em Disponível / Guardado / Reservado / Caixa do negócio. O disponível já é o número
 * grande: a legenda (duas colunas) mostra só o que sai dele, e o que é zero some. Sem nada separado, sobra
 * só o atalho para as contas, sem repetir o mesmo valor.
 */
export function BalanceComposition({ segments, total }: BalanceCompositionProps) {
  const visible = segments.filter((segment) => segment.cents > 0);
  const visibleTotal = visible.reduce((sum, segment) => sum + segment.cents, 0);
  const others = segments.filter((segment) => segment.key !== "disponivel" && segment.cents !== 0);
  const available = segments.find((segment) => segment.key === "disponivel")?.cents ?? total.cents;
  const sameAsAvailable = total.cents === available;

  return (
    <div className="mt-4 flex flex-col">
      {others.length > 0 && visible.length > 1 ? (
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
      {others.length > 0 ? (
        <ul className="m-0 mt-4 grid list-none grid-cols-2 gap-x-6 gap-y-3 p-0">
          {others.map((segment) => (
            <li key={segment.key} className="min-w-0">
              <SegmentLink href={segment.href}>
                <span className="flex items-center gap-2 text-[13px] text-text-secondary">
                  <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", SEGMENT_FILL[segment.key])} />
                  <span className="truncate">{segment.label}</span>
                  {segment.key === "reservado" || segment.key === "negocio" ? <ScopeTag scope="PJ" /> : null}
                </span>
                <Money cents={segment.cents} className={cn("pl-4 text-[16px]", segment.cents < 0 && "text-negative")} />
              </SegmentLink>
            </li>
          ))}
        </ul>
      ) : null}
      <RowLink href={total.href} className={others.length > 0 ? "mt-3" : undefined}>
        <span className="flex-1 text-[15px] text-text-secondary">{sameAsAvailable ? "Ver conta por conta" : total.label}</span>
        {sameAsAvailable ? null : <Money cents={total.cents} className="text-[15px]" />}
      </RowLink>
    </div>
  );
}
