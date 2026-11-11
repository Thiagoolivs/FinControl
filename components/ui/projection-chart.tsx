"use client";

import { type KeyboardEvent, type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";
import { niceTicks } from "@/lib/charts/ticks";
import { formatCents as formatCentsRaw, formatCentsCompact as formatCompactRaw } from "@/lib/finance/money";
import { Button } from "./button";
import { cn } from "./cn";
import { EmptyState, ErrorState } from "./empty-state";
import { Icon } from "./icon";
import { LoadingRegion, Skeleton } from "./skeleton";
import type { ViewStatus } from "./status";
import { useValuesHidden } from "./hide-values";
import { Eyebrow } from "./text";

const MASK = "R$ ••••";

/** Formatação que respeita "ocultar valores": o gráfico mantém a forma, os números somem. */
function useFormat() {
  const hidden = useValuesHidden();
  return {
    formatCents: (cents: number) => (hidden ? MASK : formatCentsRaw(cents)),
    formatCentsCompact: (cents: number) => (hidden ? "••••" : formatCompactRaw(cents)),
  };
}

export type ProjectionMonth = {
  key: string;
  /** Rótulo do eixo: "nov", "jan/27". */
  label: string;
  /** Rótulo completo para tooltip e tabela: "novembro de 2026". */
  fullLabel: string;
  /** Se continuar como nos últimos meses (média). */
  expectedCents: number;
  /** Faixa: todo mês igual ao pior e ao melhor mês recente. */
  lowCents: number;
  highCents: number;
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
  const hasRange = months.some((month) => month.lowCents !== month.highCents);
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[13px] text-text-secondary">
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="h-0.5 w-3.5 rounded-full bg-text-primary" />
        Se continuar assim
      </li>
      {hasRange ? (
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-3.5 rounded-sm bg-text-primary/15" />
          Entre o pior e o melhor mês
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
  const { formatCents, formatCentsCompact } = useFormat();
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef, 358);
  const [active, setActive] = useState<number | null>(null);
  const clipId = useId();

  const values = months.flatMap((month) => [month.expectedCents, month.lowCents, month.highCents]);
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

  const expected = pathFrom(months.map((month, index) => [x(index), y(month.expectedCents)]));
  const hasRange = months.some((month) => month.lowCents !== month.highCents);
  const band = hasRange
    ? `${pathFrom(months.map((month, index) => [x(index), y(month.highCents)]))}${months
        .map((month, index) => [x(index), y(month.lowCents)] as const)
        .reverse()
        .map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`)
        .join("")}Z`
    : null;
  const belowZero = `M${x(0)},${zeroY}${months.map((month, index) => `L${x(index).toFixed(1)},${y(month.expectedCents).toFixed(1)}`).join("")}L${x(lastIndex)},${zeroY}Z`;
  const hasNegative = months.some((month) => month.expectedCents < 0);

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
      ? `Se continuar assim: ${formatCents(first.expectedCents)} em ${first.fullLabel} e ${formatCents(last.expectedCents)} em ${last.fullLabel}. Use as setas para percorrer os meses.`
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
        <path d={expected} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="stroke-text-primary" />

        {months.map((month, index) =>
          month.expectedCents < 0 ? (
            <circle key={month.key} cx={x(index)} cy={y(month.expectedCents)} r={4} strokeWidth={2} className="fill-negative stroke-bg" />
          ) : null,
        )}

        {activeMonth && active !== null ? (
          <g>
            <line x1={x(active)} x2={x(active)} y1={PAD_TOP} y2={PAD_TOP + PLOT_HEIGHT} strokeWidth={1} className="stroke-text-secondary" />
            <circle cx={x(active)} cy={y(activeMonth.expectedCents)} r={4.5} strokeWidth={2} className="fill-text-primary stroke-bg" />
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
      <TooltipRow keyClass="bg-text-primary" label="Se continuar assim" cents={month.expectedCents} />
      {month.lowCents !== month.highCents ? (
        <>
          <TooltipRow keyClass="bg-text-primary/30" label="Se todo mês for como o pior" cents={month.lowCents} />
          <TooltipRow keyClass="bg-text-primary/30" label="Se todo mês for como o melhor" cents={month.highCents} />
        </>
      ) : null}
    </div>
  );
}

function TooltipRow({ keyClass, label, cents }: { keyClass: string; label: string; cents: number }) {
  const { formatCents } = useFormat();
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className={cn("h-0.5 w-3 shrink-0 rounded-full", keyClass)} />
      <span className={cn("text-[14px] font-semibold tabular-nums", cents < 0 && "text-negative")}>{formatCents(cents)}</span>
      <span className="text-[12px] text-text-secondary">{label}</span>
    </span>
  );
}

function ProjectionTable({ months }: { months: ProjectionMonth[] }) {
  const { formatCents } = useFormat();
  const cell = (cents: number) => <span className={cn(cents < 0 && "text-negative")}>{formatCents(cents)}</span>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[13px] tabular-nums">
        <caption className="sr-only">Projeção mês a mês</caption>
        <thead>
          <tr className="text-text-secondary">
            <th scope="col" className="py-2 pr-4 font-medium">Mês</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">Se continuar assim</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">Pior</th>
            <th scope="col" className="py-2 text-right font-medium">Melhor</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.key}>
              <th scope="row" className="whitespace-nowrap py-1.5 pr-4 font-normal text-text-secondary">{month.label}</th>
              <td className="whitespace-nowrap py-1.5 pr-4 text-right">{cell(month.expectedCents)}</td>
              <td className="whitespace-nowrap py-1.5 pr-4 text-right">{cell(month.lowCents)}</td>
              <td className="whitespace-nowrap py-1.5 text-right">{cell(month.highCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NegativeSummary({ months }: { months: ProjectionMonth[] }) {
  const firstNegative = months.find((month) => month.expectedCents < 0);
  if (!firstNegative) return null;
  return (
    <p className="m-0 flex items-start gap-2 text-[13px] leading-[18px]">
      <Icon name="alert" size={16} strokeWidth={2} className="mt-px shrink-0 text-negative" />
      <span>
        Se continuar assim, o dinheiro acaba em <strong className="font-semibold">{firstNegative.fullLabel}</strong>.
      </span>
    </p>
  );
}
