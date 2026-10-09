"use client";

import { type KeyboardEvent, type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";
import { niceTicks } from "@/lib/charts/ticks";
import { formatCents, formatCentsCompact } from "@/lib/finance/money";
import { Button } from "./button";
import { cn } from "./cn";
import { EmptyState, ErrorState } from "./empty-state";
import { Icon } from "./icon";
import { LoadingRegion, Skeleton } from "./skeleton";
import type { ViewStatus } from "./status";
import { Eyebrow } from "./text";

export type ProjectionMonth = {
  key: string;
  /** Rótulo do eixo: "nov", "jan/27". */
  label: string;
  /** Rótulo completo para tooltip e tabela: "novembro de 2026". */
  fullLabel: string;
  /** Saldo pessoal projetado sem projetos avulsos. */
  realisticCents: number;
  /** Mesmo saldo contando a média de projetos avulsos; vira a faixa otimista. */
  optimisticCents: number | null;
  /** Caixa do negócio, em linha separada. */
  businessCents: number | null;
};

type ProjectionChartProps = {
  months: ProjectionMonth[];
  title?: string;
  status?: ViewStatus;
  errorAction?: ReactNode;
};

const PLOT_HEIGHT = 196;
const AXIS_HEIGHT = 24;
const PAD_TOP = 10;
const PAD_LEFT = 64;
const PAD_RIGHT = 10;

export function ProjectionChart({ months, title = "Próximos 12 meses", status = "ready", errorAction }: ProjectionChartProps) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const ready = status === "ready" && months.length > 1;

  return (
    <figure className="m-0 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow as="h2">{title}</Eyebrow>
        {ready ? (
          <Button variant="link" className="text-[15px]" onClick={() => setView(view === "chart" ? "table" : "chart")}>
            {view === "chart" ? "Ver tabela" : "Ver gráfico"}
          </Button>
        ) : null}
      </div>

      {status === "loading" ? (
        <LoadingRegion label="Carregando projeção">
          <Skeleton className="h-[220px] w-full rounded-card" />
        </LoadingRegion>
      ) : status === "error" ? (
        <ErrorState title="Não foi possível calcular a projeção." action={errorAction} />
      ) : !ready ? (
        <EmptyState compact title="Ainda não há histórico para projetar." description="A projeção precisa de pelo menos três meses de transações." />
      ) : (
        <>
          <Legend months={months} />
          {view === "chart" ? <Chart months={months} /> : <ProjectionTable months={months} />}
          <NegativeSummary months={months} />
        </>
      )}
    </figure>
  );
}

function Legend({ months }: { months: ProjectionMonth[] }) {
  const hasOptimistic = months.some((month) => month.optimisticCents !== null);
  const hasBusiness = months.some((month) => month.businessCents !== null);
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[13px] text-text-secondary">
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="h-0.5 w-3.5 rounded-full bg-text-primary" />
        Pessoal
      </li>
      {hasOptimistic ? (
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-3.5 rounded-sm bg-text-primary/15" />
          Com projetos avulsos
        </li>
      ) : null}
      {hasBusiness ? (
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-0.5 w-3.5 rounded-full bg-scope-pj" />
          Negócio
        </li>
      ) : null}
    </ul>
  );
}

function useElementWidth(ref: RefObject<HTMLElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function pathFrom(points: Array<[number, number] | null>): string {
  let path = "";
  let drawing = false;
  for (const point of points) {
    if (!point) {
      drawing = false;
      continue;
    }
    path += `${drawing ? "L" : "M"}${point[0].toFixed(1)},${point[1].toFixed(1)}`;
    drawing = true;
  }
  return path;
}

function Chart({ months }: { months: ProjectionMonth[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef, 358);
  const [active, setActive] = useState<number | null>(null);
  const clipId = useId();

  const values = months.flatMap((month) => [
    month.realisticCents,
    month.optimisticCents ?? month.realisticCents,
    month.businessCents ?? month.realisticCents,
  ]);
  const ticks = niceTicks(Math.min(...values), Math.max(...values), 4);
  const yMin = ticks[0] ?? 0;
  const yMax = ticks.at(-1) ?? 0;
  const span = yMax - yMin || 1;
  const step = (width - PAD_LEFT - PAD_RIGHT) / (months.length - 1);
  const x = (index: number) => PAD_LEFT + index * step;
  const y = (cents: number) => PAD_TOP + ((yMax - cents) / span) * PLOT_HEIGHT;
  const zeroY = y(0);
  const lastIndex = months.length - 1;
  const labelEvery = step < 30 ? 2 : 1;

  const realistic = pathFrom(months.map((month, index) => [x(index), y(month.realisticCents)]));
  const business = pathFrom(months.map((month, index) => (month.businessCents === null ? null : [x(index), y(month.businessCents)])));
  const hasOptimistic = months.some((month) => month.optimisticCents !== null);
  const band = hasOptimistic
    ? `${pathFrom(months.map((month, index) => [x(index), y(month.optimisticCents ?? month.realisticCents)]))}${months
        .map((month, index) => [x(index), y(month.realisticCents)] as const)
        .reverse()
        .map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`)
        .join("")}Z`
    : null;
  const belowZero = `M${x(0)},${zeroY}${months.map((month, index) => `L${x(index).toFixed(1)},${y(month.realisticCents).toFixed(1)}`).join("")}L${x(lastIndex)},${zeroY}Z`;
  const hasNegative = months.some((month) => month.realisticCents < 0);

  function indexAt(clientX: number, target: Element): number {
    const left = target.getBoundingClientRect().left;
    const index = Math.round((clientX - left - PAD_LEFT) / step);
    return Math.min(lastIndex, Math.max(0, index));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    if (event.key in moves) {
      event.preventDefault();
      const current = active ?? (moves[event.key] === 1 ? -1 : months.length);
      setActive(Math.min(lastIndex, Math.max(0, current + (moves[event.key] ?? 0))));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(lastIndex);
    } else if (event.key === "Escape") {
      setActive(null);
    }
  }

  const first = months[0];
  const last = months[lastIndex];
  const summary =
    first && last
      ? `Saldo pessoal projetado de ${formatCents(first.realisticCents)} em ${first.fullLabel} para ${formatCents(last.realisticCents)} em ${last.fullLabel}. Use as setas para percorrer os meses.`
      : "";
  const activeMonth = active === null ? undefined : months[active];

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="group"
      aria-label={summary}
      onKeyDown={handleKeyDown}
      onBlur={() => setActive(null)}
      className="relative rounded-md"
    >
      <svg
        width={width}
        height={PLOT_HEIGHT + PAD_TOP + AXIS_HEIGHT}
        className="block touch-pan-y select-none"
        aria-hidden="true"
        onPointerMove={(event) => setActive(indexAt(event.clientX, event.currentTarget))}
        onPointerDown={(event) => setActive(indexAt(event.clientX, event.currentTarget))}
        onPointerLeave={() => setActive(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD_LEFT} y={zeroY} width={width} height={Math.max(0, PAD_TOP + PLOT_HEIGHT - zeroY)} />
          </clipPath>
        </defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD_LEFT}
              x2={width - PAD_RIGHT}
              y1={y(tick)}
              y2={y(tick)}
              strokeWidth={1}
              className={tick === 0 ? "stroke-text-tertiary" : "stroke-grid"}
            />
            <text x={PAD_LEFT - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-text-secondary text-[11px]">
              {formatCentsCompact(tick)}
            </text>
          </g>
        ))}

        {months.map((month, index) =>
          index % labelEvery === 0 ? (
            <text
              key={month.key}
              x={x(index)}
              y={PAD_TOP + PLOT_HEIGHT + 17}
              textAnchor={index === 0 ? "start" : index === lastIndex ? "end" : "middle"}
              className="fill-text-secondary text-[11px]"
            >
              {month.label}
            </text>
          ) : null,
        )}

        {band ? <path d={band} className="fill-text-primary/10" /> : null}
        {hasNegative ? <path d={belowZero} clipPath={`url(#${clipId})`} className="fill-negative/15" /> : null}
        {business ? <path d={business} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="stroke-scope-pj" /> : null}
        <path d={realistic} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="stroke-text-primary" />

        {months.map((month, index) =>
          month.realisticCents < 0 ? (
            <circle key={month.key} cx={x(index)} cy={y(month.realisticCents)} r={4} strokeWidth={2} className="fill-negative stroke-bg" />
          ) : null,
        )}

        {activeMonth && active !== null ? (
          <g>
            <line x1={x(active)} x2={x(active)} y1={PAD_TOP} y2={PAD_TOP + PLOT_HEIGHT} strokeWidth={1} className="stroke-text-secondary" />
            <circle cx={x(active)} cy={y(activeMonth.realisticCents)} r={4.5} strokeWidth={2} className="fill-text-primary stroke-bg" />
            {activeMonth.businessCents !== null ? (
              <circle cx={x(active)} cy={y(activeMonth.businessCents)} r={4.5} strokeWidth={2} className="fill-scope-pj stroke-bg" />
            ) : null}
          </g>
        ) : null}
      </svg>

      {activeMonth && active !== null ? (
        <Tooltip month={activeMonth} side={x(active) > width / 2 ? "left" : "right"} />
      ) : null}
    </div>
  );
}

/** Fica no canto oposto ao cursor: nunca cobre o mês apontado nem sai do gráfico. */
function Tooltip({ month, side }: { month: ProjectionMonth; side: "left" | "right" }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute top-0 z-10 flex w-max flex-col gap-1.5 whitespace-nowrap rounded-xl bg-surface-elevated px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
      style={side === "left" ? { left: PAD_LEFT } : { right: 0 }}
    >
      <span className="text-[12px] text-text-secondary">{month.fullLabel}</span>
      <TooltipRow keyClass="bg-text-primary" label="Pessoal" cents={month.realisticCents} />
      {month.optimisticCents !== null ? (
        <TooltipRow keyClass="bg-text-primary/30" label="Com projetos" cents={month.optimisticCents} />
      ) : null}
      {month.businessCents !== null ? <TooltipRow keyClass="bg-scope-pj" label="Negócio" cents={month.businessCents} /> : null}
    </div>
  );
}

function TooltipRow({ keyClass, label, cents }: { keyClass: string; label: string; cents: number }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className={cn("h-0.5 w-3 shrink-0 rounded-full", keyClass)} />
      <span className={cn("text-[14px] font-semibold tabular-nums", cents < 0 && "text-negative")}>{formatCents(cents)}</span>
      <span className="text-[12px] text-text-secondary">{label}</span>
    </span>
  );
}

function ProjectionTable({ months }: { months: ProjectionMonth[] }) {
  const hasOptimistic = months.some((month) => month.optimisticCents !== null);
  const hasBusiness = months.some((month) => month.businessCents !== null);
  const cell = (cents: number | null) =>
    cents === null ? "—" : <span className={cn(cents < 0 && "text-negative")}>{formatCents(cents)}</span>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[13px] tabular-nums">
        <caption className="sr-only">Projeção de saldo mês a mês</caption>
        <thead>
          <tr className="text-text-secondary">
            <th scope="col" className="py-2 pr-4 font-medium">Mês</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">Pessoal</th>
            {hasOptimistic ? <th scope="col" className="py-2 pr-4 text-right font-medium">Com projetos</th> : null}
            {hasBusiness ? <th scope="col" className="py-2 text-right font-medium">Negócio</th> : null}
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.key}>
              <th scope="row" className="whitespace-nowrap py-1.5 pr-4 font-normal text-text-secondary">{month.label}</th>
              <td className="whitespace-nowrap py-1.5 pr-4 text-right">{cell(month.realisticCents)}</td>
              {hasOptimistic ? <td className="whitespace-nowrap py-1.5 pr-4 text-right">{cell(month.optimisticCents)}</td> : null}
              {hasBusiness ? <td className="whitespace-nowrap py-1.5 text-right">{cell(month.businessCents)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NegativeSummary({ months }: { months: ProjectionMonth[] }) {
  const negative = months.filter((month) => month.realisticCents < 0);
  if (negative.length === 0) return null;
  const names = negative.map((month) => month.fullLabel);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
  return (
    <p className="m-0 flex items-start gap-2 text-[13px] leading-[18px]">
      <Icon name="alert" size={16} strokeWidth={2} className="mt-px shrink-0 text-negative" />
      <span>
        Saldo pessoal negativo em <strong className="font-semibold">{list}</strong>, sem contar projetos avulsos.
      </span>
    </p>
  );
}
