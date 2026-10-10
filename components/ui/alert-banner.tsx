import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./icon";
import type { Scope } from "./status";
import { ScopeTag } from "./text";

export type AlertSeverity = "info" | "warning" | "critical";

const SEVERITY: Record<AlertSeverity, { icon: "info" | "alert"; ink: string; label: string }> = {
  info: { icon: "info", ink: "text-accent", label: "Informação" },
  warning: { icon: "alert", ink: "text-warning", label: "Atenção" },
  critical: { icon: "alert", ink: "text-negative", label: "Urgente" },
};

type AlertBannerProps = {
  severity: AlertSeverity;
  title: string;
  body?: string;
  scope?: Scope;
  href?: string;
  action?: ReactNode;
};

export function AlertBanner({ severity, title, body, scope, href, action }: AlertBannerProps) {
  const { icon, ink, label } = SEVERITY[severity];
  const content = (
    <>
      <Icon name={icon} size={18} strokeWidth={2} className={cn("mt-0.5 shrink-0", ink)} label={label} />
      <span className="flex flex-1 flex-col gap-1">
        <span className="flex items-center gap-2 text-[15px] font-semibold">
          {title}
          {scope ? <ScopeTag scope={scope} /> : null}
        </span>
        {body ? <span className="text-[13px] leading-[18px] text-text-secondary">{body}</span> : null}
        {action ? <span className="-ml-1 pt-1">{action}</span> : null}
      </span>
    </>
  );
  const frame = "flex items-start gap-3 rounded-card bg-surface px-5 py-4 text-text-primary no-underline";

  if (!href) return <div className={frame}>{content}</div>;
  return (
    <Link href={href} className={cn(frame, "transition-opacity duration-200 ease-apple active:opacity-70")}>
      {content}
      <Icon name="chevron-right" size={14} strokeWidth={2} className="mt-1 shrink-0 text-text-tertiary" />
    </Link>
  );
}
