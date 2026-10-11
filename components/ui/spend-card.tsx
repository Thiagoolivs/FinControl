"use client";

import Link from "next/link";
import { useId } from "react";
import { formatCentsCompact } from "@/lib/finance/money";
import { formatBps } from "@/lib/finance/share";
import { cn } from "./cn";
import { useValuesHidden } from "./hide-values";
import { Icon, isIconName } from "./icon";
import { Money } from "./money";

const W = 300;
const H = 96;

type SpendCardProps = {
  icon: string;
  /** "Gastos com Delivery neste mês". */
  title: string;
  cents: number;
  /** Variação sobre o mês passado (mesmo ponto, no mês corrente), em bps; null = sem base. */
  variationBps: number | null;
  /** Acumulado deste mês até hoje (índice 0 = dia 1). */
  current: number[];
  /** Mês passado inteiro, acumulado; vazio = sem dados. */
  previous: number[];
  daysInMonth: number;
  href?: string;
  className?: string;
};

/**
 * Card de gasto: ícone, valor do mês, variação contra o mês passado e o gasto acumulado dia a dia
 * (linha cheia = este mês, tracejada = mês passado). Mais gasto que antes = laranja; menos = verde.
 */
export function SpendCard({ icon, title, cents, variationBps, current, previous, daysInMonth, href, className }: SpendCardProps) {
  const body = (
    <>
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-text-primary">
          <Icon name={isIconName(icon) ? icon : "dots"} size={20} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[13px] text-text-secondary">{title}</span>
          <span className="flex flex-wrap items-baseline gap-x-2">
            <Money cents={cents} className="text-[28px] font-light leading-[34px] tracking-[-0.02em]" />
            <Variation bps={variationBps} />
          </span>
        </div>
        {href ? <Icon name="chevron-right" size={16} strokeWidth={2} className="mt-1 shrink-0 text-text-tertiary" /> : null}
      </div>
      <SpendCurve current={current} previous={previous} daysInMonth={daysInMonth} />
    </>
  );
  const base = cn("flex flex-col gap-5 rounded-card bg-surface p-5 text-text-primary no-underline", className);
  return href ? (
    <Link href={href} className={cn(base, "transition-opacity duration-200 ease-apple active:opacity-60")}>
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}

function Variation({ bps }: { bps: number | null }) {
  if (bps === null || bps === 0) return null;
  const up = bps > 0;
  return (
    <span className={cn("flex items-center gap-0.5 text-[15px] font-medium tabular-nums", up ? "text-warning" : "text-positive")}>
      <Icon name="chevron-down" size={14} strokeWidth={2.4} className={up ? "rotate-180" : undefined} />
      {formatBps(Math.abs(bps))}
      <span className="sr-only">{up ? " a mais que no mês passado" : " a menos que no mês passado"}</span>
    </span>
  );
}

/** Gasto acumulado do mês contra o mês passado. Com "ocultar valores", a forma fica e os números somem. */
export function SpendCurve({ current, previous, daysInMonth }: { current: number[]; previous: number[]; daysInMonth: number }) {
  const hidden = useValuesHidden();
  const gradient = useId();
  const span = Math.max(daysInMonth, previous.length, 2);
  const top = Math.max(1, ...current, ...previous);
  const x = (index: number) => (index / (span - 1)) * W;
  const y = (cents: number) => H - (cents / top) * (H - 6);
  const line = (values: number[]) => values.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(" ");
  const last = current.length - 1;
  const ticks = [1, 8, 15, 22, daysInMonth].filter((day, index, all) => all.indexOf(day) === index && day <= daysInMonth);
  const lastValue = current[last] ?? 0;
  const label = hidden
    ? "Gasto acumulado do mês contra o mês passado."
    : `Gasto acumulado: ${formatCentsCompact(lastValue)} até o dia ${last + 1}${previous.length > 0 ? `; mês passado, ${formatCentsCompact(previous[Math.min(last, previous.length - 1)] ?? 0)} no mesmo dia` : ""}.`;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-24 w-full overflow-visible text-text-primary">
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" x2={W} y1={H} y2={H} className="stroke-text-primary/10" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {previous.length > 1 ? (
            <path d={line(previous)} fill="none" className="stroke-text-secondary" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          ) : null}
          {current.length > 1 ? (
            <>
              <path d={`${line(current)} L${x(last).toFixed(2)},${H} L0,${H} Z`} fill={`url(#${gradient})`} />
              <path d={line(current)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </>
          ) : null}
        </svg>
        {current.length > 0 ? (
          <span
            aria-hidden="true"
            className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-primary ring-4 ring-surface"
            style={{ left: `${(x(last) / W) * 100}%`, top: `${(y(lastValue) / H) * 100}%` }}
          />
        ) : null}
        <span aria-hidden="true" className="absolute -top-1 right-0 text-[11px] tabular-nums text-text-secondary">
          {hidden ? "••••" : formatCentsCompact(top)}
        </span>
      </div>
      <div aria-hidden="true" className="relative h-4 text-[11px] tabular-nums text-text-secondary">
        {ticks.map((day) => (
          <span key={day} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: `${(x(day - 1) / W) * 100}%` }}>
            {String(day).padStart(2, "0")}
          </span>
        ))}
      </div>
      <div aria-hidden="true" className="flex gap-4 text-[12px] text-text-secondary">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-text-primary" />
          Este mês
        </span>
        {previous.length > 0 ? (
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-4 border-t-[1.5px] border-dashed border-text-secondary" />
            Mês passado
          </span>
        ) : null}
      </div>
    </div>
  );
}
