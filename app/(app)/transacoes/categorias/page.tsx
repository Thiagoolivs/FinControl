import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon, isIconName } from "@/components/ui/icon";
import { Money } from "@/components/ui/money";
import { StatRow } from "@/components/ui/stat-row";
import type { ScopeFilter as ScopeValue } from "@/components/ui/status";
import { Eyebrow } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/dal";
import { formatMonthLabel, isMonth, todayLocal } from "@/lib/dates";
import { formatBps, shareBps } from "@/lib/finance/share";
import { parseScopeParam } from "@/lib/queries/scope";
import { getMonthCategoryBreakdown } from "@/lib/queries/transactions";
import { ensureDefaultCategories } from "@/lib/rules/categories";
import { categoryOverThresholdBps } from "@/lib/sync/alerts";
import { PAGE_CLASS, PageHeader } from "../../page-header";
import { ScopeFilter } from "../../scope-filter";
import { MonthNav, ViewTabs } from "../month-nav";

const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));

export default async function SpendByCategoryPage({ searchParams }: PageProps<"/transacoes/categorias">) {
  const user = await requireUser();
  await ensureDefaultCategories(user.id);
  const params = await searchParams;
  const currentMonth = todayLocal().slice(0, 7);
  const month = isMonth(first(params.mes)) && first(params.mes) <= currentMonth ? first(params.mes) : currentMonth;
  const scope = parseScopeParam(params.escopo);
  const scopeParam = first(params.escopo) || null;
  const [breakdown, overBps] = await Promise.all([getMonthCategoryBreakdown(user.id, scope, month), categoryOverThresholdBps(user.id)]);

  const total = breakdown.reduce((sum, row) => sum + row.cents, 0);
  const byKind = (kind: "ESSENCIAL" | "VARIAVEL" | null) => breakdown.filter((row) => row.kind === kind).reduce((sum, row) => sum + row.cents, 0);
  const listHref = (categoryId: string) => {
    const query = new URLSearchParams({ categoria: categoryId, tipo: "saidas" });
    if (month !== currentMonth) query.set("mes", month);
    if (scopeParam) query.set("escopo", scopeParam);
    return `/transacoes?${query}`;
  };
  const monthHref = (target: string) => {
    const query = new URLSearchParams();
    if (target !== currentMonth) query.set("mes", target);
    if (scopeParam) query.set("escopo", scopeParam);
    const search = query.toString();
    return search ? `/transacoes/categorias?${search}` : "/transacoes/categorias";
  };
  const scopeValue: ScopeValue = scope.consolidated ? "TUDO" : scope.scope;
  const over = (ratio: number | null) => overBps !== null && ratio !== null && ratio >= overBps;

  return (
    <main className={PAGE_CLASS}>
      <PageHeader title="Transações" />
      <ViewTabs active="categorias" month={month} currentMonth={currentMonth} scopeParam={scopeParam} />
      <MonthNav month={month} currentMonth={currentMonth} hrefFor={monthHref} />
      <ScopeFilter value={scopeValue} />

      {breakdown.length === 0 ? (
        <EmptyState compact title="Nenhum gasto neste mês." description="Transferências entre suas contas, pagamento de fatura e investimentos não entram como gasto." />
      ) : (
        <>
          <section aria-labelledby="total" className="flex flex-col gap-1">
            <Eyebrow as="h2" id="total">
              Gastos de {formatMonthLabel(month)}
            </Eyebrow>
            <p className="m-0 text-[34px] font-light leading-10 tracking-[-0.03em]">
              <Money cents={total} />
            </p>
            <div className="mt-2 flex flex-col">
              <StatRow label="Essenciais" valueCents={byKind("ESSENCIAL")} hint={`${formatBps(shareBps(byKind("ESSENCIAL"), total))} dos gastos`} />
              <StatRow label="Variáveis" valueCents={byKind("VARIAVEL")} hint={`${formatBps(shareBps(byKind("VARIAVEL"), total))} dos gastos`} />
              {byKind(null) > 0 ? (
                <StatRow label="Sem categoria" valueCents={byKind(null)} hint="Ainda na fila de revisão" href="/transacoes/revisar" />
              ) : null}
            </div>
          </section>

          <section aria-labelledby="areas" className="flex flex-col gap-1">
            <Eyebrow as="h2" id="areas" className="pb-2">
              Por área
            </Eyebrow>
            <ul className="m-0 flex list-none flex-col gap-4 p-0">
              {breakdown.map((row) => {
                const share = shareBps(row.cents, total);
                const isOver = over(row.averageRatioBps);
                return (
                  <li key={row.id} className="flex flex-col gap-1.5">
                    <Link href={row.id === "sem" ? "/transacoes/revisar" : listHref(row.id)} className="flex min-h-11 flex-col gap-1.5 text-text-primary no-underline">
                      <span className="flex items-center gap-3">
                        <Icon name={isIconName(row.icon) ? row.icon : "dots"} size={18} className={isOver ? "shrink-0 text-warning" : "shrink-0 text-text-secondary"} />
                        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                          <span className="text-[16px] font-medium">{row.name}</span>
                          <span className="text-[13px] text-text-secondary">{formatBps(share)}</span>
                          {isOver && row.averageRatioBps !== null ? (
                            <span className="text-[13px] text-warning">{formatBps(row.averageRatioBps)} da média</span>
                          ) : null}
                        </span>
                        <Money cents={row.cents} className="shrink-0 text-[16px] font-[450]" />
                      </span>
                      <span aria-hidden="true" className="ml-[30px] h-1.5 rounded-full bg-text-primary/8">
                        <span className={`block h-full rounded-full ${isOver ? "bg-warning" : "bg-text-primary/40"}`} style={{ width: `${Math.max(1, share / 100)}%` }} />
                      </span>
                    </Link>
                    {row.children.length > 0 ? (
                      <ul className="m-0 flex list-none flex-col p-0 pl-[30px]">
                        {row.children.map((child) => (
                          <li key={`${row.id}:${child.id}:${child.name}`}>
                            <Link href={listHref(child.id)} className="flex min-h-11 items-center gap-3 text-text-primary no-underline">
                              <span className="flex-1 text-[15px] text-text-secondary">{child.name}</span>
                              <Money cents={child.cents} className="text-[15px] text-text-secondary" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
