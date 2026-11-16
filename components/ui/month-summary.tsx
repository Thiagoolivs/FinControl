import { shareBps } from "@/lib/finance/share";
import { cn } from "./cn";
import { Money } from "./money";

function Bar({ cents, maxCents, className }: { cents: number; maxCents: number; className: string }) {
  const width = maxCents > 0 ? Math.max(cents > 0 ? 2 : 0, shareBps(cents, maxCents) / 100) : 0;
  return (
    <span aria-hidden="true" className="block h-2 rounded-full bg-text-primary/8">
      <span className={cn("block h-full rounded-full transition-[width] duration-300 ease-apple", className)} style={{ width: `${width}%` }} />
    </span>
  );
}

/**
 * O mês em três números: quanto entrou, quanto saiu (gastos + investido) e o que sobrou ou faltou. As barras
 * comparam entrada e saída na mesma escala; sem percentual.
 */
export function MonthSummary({
  inCents,
  outCents,
  investedCents,
  leftoverCents,
  overflowCents,
}: {
  inCents: number;
  outCents: number;
  investedCents: number;
  leftoverCents: number;
  overflowCents: number;
}) {
  const max = Math.max(inCents, outCents);
  const short = overflowCents > 0;
  return (
    <div className="flex flex-col gap-4 rounded-card bg-surface p-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] text-text-secondary">Entrou</span>
          <Money cents={inCents} kind={inCents > 0 ? "in" : "neutral"} className="text-[17px]" />
        </div>
        <Bar cents={inCents} maxCents={max} className="bg-positive" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] text-text-secondary">Saiu</span>
          <Money cents={outCents} className="text-[17px]" />
        </div>
        <Bar cents={outCents} maxCents={max} className="bg-text-primary" />
        {investedCents > 0 ? (
          <span className="text-[13px] text-text-secondary">
            Inclui <Money cents={investedCents} /> que você investiu.
          </span>
        ) : null}
      </div>
      <div className="flex items-baseline justify-between gap-3 border-t border-border pt-4">
        <span className="text-[16px] font-medium">{short ? "Saiu a mais que entrou" : "Sobrou até agora"}</span>
        <Money cents={short ? -overflowCents : leftoverCents} className={cn("text-[17px] font-medium", short && "text-negative")} />
      </div>
    </div>
  );
}
