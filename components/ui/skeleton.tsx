import type { ReactNode } from "react";
import { cn } from "./cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("rounded-md bg-surface-elevated motion-safe:animate-pulse", className)} />;
}

/** Envolve um bloco carregando: anuncia uma vez para o leitor de tela e esconde as formas. */
export function LoadingRegion({ label = "Carregando", children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-label={label} className={className}>
      {children}
    </div>
  );
}
