import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "destructive" | "link";

const VARIANTS: Record<Variant, string> = {
  primary: "h-[50px] px-5 rounded-button bg-accent-fill text-white",
  secondary: "h-[50px] px-5 rounded-button bg-text-primary/10 text-text-primary",
  destructive: "h-[50px] px-5 rounded-button bg-text-primary/10 text-negative",
  link: "min-h-11 px-1 text-accent",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
};

export function Button({ variant = "primary", loading = false, className, children, disabled, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 text-[16px] font-medium transition-opacity duration-200 ease-apple disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}
