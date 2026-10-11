import Link from "next/link";
import type { Achievement } from "@/lib/finance/month-score";
import { formatBps } from "@/lib/finance/share";
import { cn } from "./cn";
import { Icon } from "./icon";

const RING = 128;
const STROKE = 10;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Placar do mês, levemente gamificado: anel da sobra contra a meta, sequência de meses na meta e as
 * conquistas que dá para medir. Verde só quando a meta foi batida.
 */
export function MonthScore({
  savingsBps,
  targetBps,
  streak,
  achievements,
  settingsHref,
}: {
  savingsBps: number | null;
  targetBps: number;
  streak: number;
  achievements: Achievement[];
  settingsHref?: string;
}) {
  const progress = savingsBps === null || targetBps <= 0 ? 0 : Math.min(1, Math.max(0, savingsBps / targetBps));
  const hit = savingsBps !== null && savingsBps >= targetBps;
  const done = achievements.filter((item) => item.done).length;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-6">
        <div className="relative shrink-0" style={{ width: RING, height: RING }}>
          <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} aria-hidden="true" className="-rotate-90">
            <circle cx={RING / 2} cy={RING / 2} r={RADIUS} fill="none" strokeWidth={STROKE} className="stroke-text-primary/10" />
            <circle
              cx={RING / 2}
              cy={RING / 2}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
              className={cn("transition-[stroke-dashoffset] duration-300 ease-apple", hit ? "stroke-positive" : "stroke-text-primary")}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("text-[28px] font-light tabular-nums tracking-[-0.02em]", savingsBps !== null && savingsBps < 0 && "text-negative")}>
              {savingsBps === null ? "—" : formatBps(savingsBps)}
            </span>
            <span className="text-[12px] text-text-secondary">guardado</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="m-0 text-[15px] leading-[21px]">
            {savingsBps === null ? "Nada entrou neste mês ainda." : hit ? "Meta batida até agora." : `Faltam ${formatBps(Math.max(0, targetBps - savingsBps))} para a meta.`}
          </p>
          <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
            Meta: guardar {formatBps(targetBps)} do que entra.{" "}
            {settingsHref ? (
              <Link href={settingsHref} className="text-accent">
                Mudar
              </Link>
            ) : null}
          </p>
          {streak > 0 ? (
            <p className="m-0 flex items-center gap-1.5 text-[13px] font-medium">
              <Icon name="bolt" size={14} className="text-positive" />
              {streak === 1 ? "Mês passado na meta" : `${streak} meses seguidos na meta`}
            </p>
          ) : null}
        </div>
      </div>

      {achievements.length > 0 ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[15px] font-medium">
              {done} de {achievements.length} conquistas
            </span>
            <span aria-hidden="true" className="flex gap-1">
              {achievements.map((item) => (
                <span key={item.key} className={cn("h-1.5 w-5 rounded-full transition-colors duration-300 ease-apple", item.done ? "bg-positive" : "bg-text-primary/12")} />
              ))}
            </span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {achievements.map((item) => (
              <li key={item.key} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-px flex size-6 shrink-0 items-center justify-center rounded-full",
                    item.done ? "bg-positive text-bg" : "border-[1.5px] border-text-secondary/50",
                  )}
                >
                  {item.done ? <Icon name="check" size={14} strokeWidth={2.4} /> : null}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={cn("text-[15px]", item.done ? "font-medium" : "text-text-secondary")}>
                    {item.title}
                    <span className="sr-only">{item.done ? " (feito)" : " (ainda não)"}</span>
                  </span>
                  <span className="text-[13px] leading-[18px] text-text-secondary">{item.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
