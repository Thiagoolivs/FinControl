import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./icon";

/** Linha de lista: vira link com chevron quando tem destino; senão é só uma linha. */
export function RowLink({ href, className, children }: { href?: string; className?: string; children: ReactNode }) {
  const base = cn("flex min-h-11 items-center gap-3 text-text-primary no-underline", className);
  if (!href) return <div className={base}>{children}</div>;
  return (
    <Link href={href} className={cn(base, "transition-opacity duration-200 ease-apple active:opacity-60")}>
      {children}
      <Icon name="chevron-right" size={14} strokeWidth={2} className="shrink-0 text-text-tertiary" />
    </Link>
  );
}
