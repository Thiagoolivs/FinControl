import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./icon";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
};

export function EmptyState({ title, description, action, compact = false, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col gap-2", compact ? "py-2" : "py-6", className)}>
      <p className={cn("m-0 font-light tracking-[-0.02em]", compact ? "text-[20px] leading-7" : "text-[26px] leading-8")}>{title}</p>
      {description ? <p className="m-0 text-[15px] leading-[21px] text-text-secondary">{description}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

type ErrorStateProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function ErrorState({ title = "Não foi possível carregar.", description, action, className }: ErrorStateProps) {
  return (
    <div role="alert" className={cn("flex items-start gap-3 py-4", className)}>
      <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-negative" />
      <div className="flex flex-1 flex-col gap-1">
        <p className="m-0 text-[15px] font-medium">{title}</p>
        {description ? <p className="m-0 text-[13px] leading-[18px] text-text-secondary">{description}</p> : null}
        {action ? <div className="-ml-1">{action}</div> : null}
      </div>
    </div>
  );
}
