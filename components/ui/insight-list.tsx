import Link from "next/link";
import type { Insight } from "@/lib/finance/insights";
import { cn } from "./cn";
import { Icon } from "./icon";
import { Money } from "./money";

const TONE = {
  good: { icon: "check", className: "text-positive" },
  warning: { icon: "alert", className: "text-warning" },
  neutral: { icon: "info", className: "text-text-secondary" },
} as const;

/** Frases do mês. Os valores vêm como número e passam por Money (respeita "ocultar valores"). */
export function InsightList({ insights, links = {} }: { insights: Insight[]; links?: Partial<Record<Insight["key"], { href: string; label: string }>> }) {
  if (insights.length === 0) return null;
  return (
    <ul className="m-0 flex list-none flex-col gap-4 p-0">
      {insights.map((insight) => {
        const tone = TONE[insight.tone];
        const link = links[insight.key];
        return (
          <li key={insight.key} className="flex items-start gap-3">
            <Icon name={tone.icon} size={18} className={cn("mt-0.5 shrink-0", tone.className)} />
            <p className="m-0 text-[15px] leading-[22px]">
              {insight.parts.map((part, index) => (typeof part === "string" ? <span key={index}>{part}</span> : <Money key={index} cents={part.cents} />))}
              {link ? (
                <>
                  {" "}
                  <Link href={link.href} className="text-accent">
                    {link.label}
                  </Link>
                </>
              ) : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
