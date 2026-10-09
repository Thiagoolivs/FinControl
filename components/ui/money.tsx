import { centsParts, formatCents } from "@/lib/finance/money";
import { cn } from "./cn";

/** in = entrada (verde, com +); out = saída (texto primário, com −); transfer = entre contas próprias (cinza, sem sinal). */
export type AmountKind = "in" | "out" | "transfer" | "neutral";

type MoneyProps = {
  cents: number;
  kind?: AmountKind;
  hideZeroCents?: boolean;
  className?: string;
};

export function Money({ cents, kind = "neutral", hideZeroCents, className }: MoneyProps) {
  const text =
    kind === "transfer"
      ? formatCents(Math.abs(cents), { hideZeroCents })
      : formatCents(cents, { signed: kind === "in", hideZeroCents });
  return (
    <span
      className={cn(
        "tabular-nums whitespace-nowrap",
        kind === "in" && "text-positive",
        kind === "transfer" && "text-text-secondary",
        className,
      )}
    >
      {text}
    </span>
  );
}

/** O número protagonista da direção B: unidades grandes em peso 300, centavos menores em cinza. */
export function HeroAmount({ cents, className }: { cents: number; className?: string }) {
  const { sign, units, cents: rest } = centsParts(cents);
  const unitsSize =
    units.length <= 6
      ? "text-[72px] leading-[76px]"
      : units.length <= 9
        ? "text-[56px] leading-[60px]"
        : "text-[44px] leading-[48px]";
  return (
    <span className={cn("flex items-baseline gap-1.5 tabular-nums", className)}>
      <span className="sr-only">{formatCents(cents)}</span>
      <span aria-hidden="true" className="text-[22px] text-text-secondary">
        {sign}R$
      </span>
      <span
        aria-hidden="true"
        className={cn(unitsSize, "font-light tracking-[-0.045em]", cents < 0 && "text-negative")}
      >
        {units}
      </span>
      <span aria-hidden="true" className="text-[34px] font-light tracking-[-0.02em] text-text-secondary">
        ,{rest}
      </span>
    </span>
  );
}
