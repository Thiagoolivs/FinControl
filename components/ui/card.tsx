import type { ReactNode } from "react";
import { cn } from "./cn";

type CardProps = {
  children: ReactNode;
  tone?: "surface" | "elevated";
  as?: "div" | "section" | "article";
  className?: string;
  "aria-label"?: string;
};

/** Superfície com raio 16 e padding 20. Na direção B é exceção, não regra. */
export function Card({ children, tone = "surface", as: Tag = "div", className, ...rest }: CardProps) {
  return (
    <Tag
      className={cn("rounded-card p-5", tone === "surface" ? "bg-surface" : "bg-surface-elevated", className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}
