import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Eyebrow } from "@/components/ui/text";
import { addMonths, formatMonthLabel } from "@/lib/dates";

/** ‹ outubro de 2026 › — não avança além do mês atual. */
export function MonthNav({ month, currentMonth, hrefFor }: { month: string; currentMonth: string; hrefFor: (month: string) => string }) {
  return (
    <nav aria-label="Mês" className="flex items-center justify-between">
      <Link href={hrefFor(addMonths(month, -1))} aria-label="Mês anterior" className="flex size-11 items-center justify-center rounded-full text-text-secondary">
        <Icon name="chevron-right" size={18} className="rotate-180" />
      </Link>
      <Eyebrow as="h2">{formatMonthLabel(month)}</Eyebrow>
      {month < currentMonth ? (
        <Link href={hrefFor(addMonths(month, 1))} aria-label="Próximo mês" className="flex size-11 items-center justify-center rounded-full text-text-secondary">
          <Icon name="chevron-right" size={18} />
        </Link>
      ) : (
        <span className="size-11" />
      )}
    </nav>
  );
}

/** Extrato | Por categoria, mantendo mês e escopo. */
export function ViewTabs({ active, month, currentMonth, scopeParam }: { active: "extrato" | "categorias"; month: string; currentMonth: string; scopeParam: string | null }) {
  const query = (base: string) => {
    const params = new URLSearchParams();
    if (month !== currentMonth) params.set("mes", month);
    if (scopeParam) params.set("escopo", scopeParam);
    const search = params.toString();
    return search ? `${base}?${search}` : base;
  };
  const tabs = [
    { key: "extrato", label: "Extrato", href: query("/transacoes") },
    { key: "categorias", label: "Por categoria", href: query("/transacoes/categorias") },
  ] as const;
  return (
    <nav aria-label="Visão" className="flex gap-6">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={active === tab.key ? "page" : undefined}
          className={`flex min-h-11 flex-col items-start justify-center gap-1 text-[17px] no-underline ${active === tab.key ? "font-semibold text-text-primary" : "text-text-secondary"}`}
        >
          {tab.label}
          <span aria-hidden="true" className={`size-1 rounded-full ${active === tab.key ? "bg-text-primary" : "bg-transparent"}`} />
        </Link>
      ))}
    </nav>
  );
}
