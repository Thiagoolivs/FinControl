import type { ReactNode } from "react";
import type { HundredKey, PerHundred } from "@/lib/finance/month-flow";
import { cn } from "./cn";
import { Money } from "./money";
import { RowLink } from "./row-link";

/** Cor só com significado: essencial em primário, estilo de vida em cinza, sem categoria tracejado, investido em verde, sobra vazia. */
const FILL: Record<HundredKey, string> = {
  essencial: "bg-text-primary",
  estilo: "bg-cat-4",
  sem: "border border-dashed border-text-secondary",
  investido: "bg-positive",
  sobrou: "bg-text-primary/8",
};

export const HUNDRED_LABEL: Record<HundredKey, string> = {
  essencial: "Essenciais",
  estilo: "Estilo de vida",
  sem: "Sem categoria",
  investido: "Investido",
  sobrou: "Sobrou",
};

type Legend = Partial<Record<HundredKey, { hint?: string; href?: string }>>;

/**
 * "De cada R$ 100": 100 quadrados, um por real de cada cem. Quando saiu mais do que entrou, a base é o que
 * saiu e os últimos quadrados ganham contorno vermelho (o que passou do que entrou).
 */
export function MoneyWaffle({ data, legend = {}, footer }: { data: PerHundred; legend?: Legend; footer?: ReactNode }) {
  const cells = data.parts.flatMap((part) => Array.from({ length: part.per100 }, () => part.key));
  const overFrom = 100 - data.overflowPer100;
  const visible = data.parts.filter((part) => part.cents > 0);
  return (
    <div className="flex flex-col gap-6">
      <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
        De cada <span className="text-text-primary">R$ 100</span> que {data.base === "entrou" ? "entraram" : "saíram"}:
      </p>
      <div
        role="img"
        aria-label={visible.map((part) => `${HUNDRED_LABEL[part.key]}: ${part.per100 === 0 ? "menos de R$ 1" : `R$ ${part.per100}`} de cada R$ 100`).join("; ")}
        className="grid w-full max-w-[320px] grid-cols-10 gap-1"
      >
        {cells.map((key, index) => (
          <span
            key={index}
            className={cn(
              "aspect-square rounded-[4px] transition-colors duration-300 ease-apple",
              FILL[key],
              index >= overFrom && "outline-2 -outline-offset-2 outline-negative outline",
            )}
          />
        ))}
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {visible.map((part) => (
          <li key={part.key}>
            <RowLink href={legend[part.key]?.href} className="min-h-[56px] py-1.5">
              <span aria-hidden="true" className={cn("size-3.5 shrink-0 rounded-[3px]", FILL[part.key])} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[16px] font-medium">{HUNDRED_LABEL[part.key]}</span>
                <span className="truncate text-[13px] text-text-secondary">
                  <Money cents={part.cents} />
                  {legend[part.key]?.hint ? ` · ${legend[part.key]?.hint}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-[22px] font-light tabular-nums tracking-[-0.01em]">
                <span className="text-[14px] text-text-secondary">R$ </span>
                {part.per100 === 0 ? "<1" : part.per100}
              </span>
            </RowLink>
          </li>
        ))}
      </ul>
      {data.overflowPer100 > 0 ? (
        <p className="m-0 flex items-start gap-3 text-[15px] leading-[21px]">
          <span aria-hidden="true" className="mt-1 size-3.5 shrink-0 rounded-[3px] outline-2 -outline-offset-2 outline-negative outline" />
          <span>
            <span className="text-negative">R$ {data.overflowPer100} de cada R$ 100</span> saíram além do que entrou: vieram do saldo que você já tinha, do
            cartão ou de resgate.
          </span>
        </p>
      ) : null}
      {footer}
    </div>
  );
}
