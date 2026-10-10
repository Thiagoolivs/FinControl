import type { ReactNode } from "react";
import { cn } from "./cn";
import type { Scope } from "./status";

/** Rótulo 12px em caixa alta: a estrutura da direção B. */
export function Eyebrow({
  children,
  as: Tag = "span",
  className,
  id,
}: {
  children: ReactNode;
  as?: "span" | "h2" | "h3" | "p";
  className?: string;
  id?: string;
}) {
  return (
    <Tag id={id} className={cn("m-0 text-xs font-semibold uppercase tracking-[0.1em] text-text-secondary", className)}>
      {children}
    </Tag>
  );
}

/** Marca de escopo. Só a PJ aparece: o PF é o padrão e não precisa de etiqueta. */
export function ScopeTag({ scope, className }: { scope: Scope; className?: string }) {
  if (scope !== "PJ") return null;
  return (
    <span className={cn("text-[11px] font-semibold tracking-[0.06em] text-scope-pj", className)}>
      PJ
    </span>
  );
}

/** Etiqueta discreta: "Pendente", "3/10", "Recorrente". */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("text-[11px] font-medium tracking-[0.02em] text-text-secondary", className)}>{children}</span>;
}
