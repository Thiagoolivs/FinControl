import type { ReactNode } from "react";
import { cn } from "./cn";
import { Eyebrow } from "./text";

/**
 * Bloco de uma tela: rótulo em caixa alta + título leve de 28px. A divisão vem do espaço e da tipografia,
 * não de borda nem de card.
 */
export function Section({
  id,
  eyebrow,
  title,
  children,
  className,
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("flex flex-col gap-6", className)}>
      <header className="flex flex-col gap-2">
        <Eyebrow as="p">{eyebrow}</Eyebrow>
        <h2 id={id} className="m-0 text-[28px] font-light leading-[34px] tracking-[-0.02em]">
          {title}
        </h2>
      </header>
      {children}
    </section>
  );
}
