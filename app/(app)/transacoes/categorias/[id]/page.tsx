import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Money } from "@/components/ui/money";
import { SpendCard } from "@/components/ui/spend-card";
import type { ScopeFilter as ScopeValue } from "@/components/ui/status";
import { Eyebrow } from "@/components/ui/text";
import { TransactionList } from "@/components/ui/transaction-item";
import { requireUser } from "@/lib/auth/dal";
import { addMonths, formatMonthLabel, isMonth, todayLocal } from "@/lib/dates";
import { formatBps, variationBps } from "@/lib/finance/share";
import { getAreaSpend } from "@/lib/queries/area-spend";
import { parseScopeParam } from "@/lib/queries/scope";
import { listTransactions } from "@/lib/queries/transactions";
import { PAGE_CLASS } from "../../../page-header";
import { ScopeFilter } from "../../../scope-filter";
import { groupByDay, isTransferRow, toTransactionItem } from "../../../transaction-groups";
import { MonthNav } from "../../month-nav";

const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));
const monthWord = (month: string) => formatMonthLabel(month).split(" ")[0] ?? "";

/** Uma área de gasto no mês: manchete, curva contra o mês passado, subcategorias e as transações. */
export default async function AreaPage({ params, searchParams }: PageProps<"/transacoes/categorias/[id]">) {
  const user = await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const today = todayLocal();
  const currentMonth = today.slice(0, 7);
  const month = isMonth(first(query.mes)) && first(query.mes) <= currentMonth ? first(query.mes) : currentMonth;
  const scope = parseScopeParam(query.escopo);
  const scopeParam = first(query.escopo) || null;
  const scopeValue: ScopeValue = scope.consolidated ? "TUDO" : scope.scope;

  const area = await getAreaSpend(user.id, scope, id, month, today);
  if (!area) notFound();
  const list = id === "total" ? null : await listTransactions(user.id, { month, scope, categoryId: id, kind: id === "sem" ? "saidas" : undefined });

  const isCurrent = month === currentMonth;
  const when = isCurrent ? "neste mês" : `em ${monthWord(month)}`;
  const variation = area.previousToDateCents === null ? null : variationBps(area.previousToDateCents, area.totalCents);
  const compared = isCurrent ? "no mesmo ponto do mês passado" : `em ${monthWord(addMonths(month, -1))}`;
  const headline = id === "total" ? `gastos ${when}` : id === "sem" ? `sem categoria ${when}` : `em ${area.name} ${when}`;
  const cardTitle = id === "total" ? `Gastos ${when}` : id === "sem" ? `Saídas sem categoria ${when}` : `Gastos com ${area.name} ${when}`;
  const withParams = (path: string, target = month) => {
    const search = new URLSearchParams();
    if (target !== currentMonth) search.set("mes", target);
    if (scopeParam) search.set("escopo", scopeParam);
    const text = search.toString();
    return text ? `${path}?${text}` : path;
  };
  const groups = list
    ? groupByDay(list.rows, today, (row) =>
        toTransactionItem(
          row,
          [row.account.name, row.category?.parent ? row.category.name : null, row.amountCents > 0 && !isTransferRow(row) ? "estorno" : null, row.isIgnored ? "ignorada" : null]
            .filter(Boolean)
            .join(" · "),
          `/transacoes/${row.id}`,
        ),
      )
    : [];

  return (
    <main className={PAGE_CLASS}>
      <Link href={withParams("/transacoes/categorias")} className="-ml-1 flex min-h-11 items-center gap-1 self-start text-[15px] text-accent no-underline">
        <Icon name="chevron-right" size={16} className="rotate-180" />
        {area.parent ? area.parent.name : "Por área"}
      </Link>
      <MonthNav month={month} currentMonth={currentMonth} hrefFor={(target) => withParams(`/transacoes/categorias/${id}`, target)} />
      <ScopeFilter value={scopeValue} />

      <header className="flex flex-col gap-3">
        <Eyebrow as="p">{area.parent ? `${area.parent.name} ›` : "Área"}</Eyebrow>
        <h1 className="m-0 text-[34px] font-light leading-10 tracking-[-0.03em]">
          <Money cents={area.totalCents} hideZeroCents className="font-normal" /> {headline}.
        </h1>
        {variation !== null && variation !== 0 ? (
          <p className={`m-0 text-[15px] leading-[21px] ${variation > 0 ? "text-warning" : "text-positive"}`}>
            {formatBps(Math.abs(variation))} {variation > 0 ? "a mais" : "a menos"} que {compared}.
          </p>
        ) : null}
      </header>

      <SpendCard
        icon={area.icon}
        title={cardTitle}
        cents={area.totalCents}
        variationBps={variation}
        current={area.current}
        previous={area.previous}
        daysInMonth={area.daysInMonth}
      />

      {area.children.length > 0 ? (
        <section aria-labelledby="sub" className="flex flex-col gap-2">
          <Eyebrow as="h2" id="sub">
            Dentro de {area.name}
          </Eyebrow>
          <ul className="m-0 flex list-none flex-col p-0">
            {area.children.map((child) =>
              child.id === area.id ? (
                <li key={child.id} className="flex min-h-11 items-center gap-3">
                  <span className="flex-1 text-[15px] text-text-secondary">{child.name}</span>
                  <Money cents={child.cents} className="text-[15px] text-text-secondary" />
                </li>
              ) : (
                <li key={child.id}>
                  <Link href={withParams(`/transacoes/categorias/${child.id}`)} className="flex min-h-11 items-center gap-3 text-text-primary no-underline">
                    <span className="flex-1 text-[15px]">{child.name}</span>
                    <Money cents={child.cents} className="text-[15px]" />
                    <Icon name="chevron-right" size={14} strokeWidth={2} className="shrink-0 text-text-tertiary" />
                  </Link>
                </li>
              ),
            )}
          </ul>
        </section>
      ) : null}

      {list ? (
        <section aria-labelledby="lancamentos" className="flex flex-col gap-3 pb-6">
          <Eyebrow as="h2" id="lancamentos">
            {list.total === 1 ? "1 lançamento" : `${list.total} lançamentos`}
          </Eyebrow>
          {list.rows.length === 0 ? <EmptyState compact title={`Nada em ${area.name} ${when}.`} /> : <TransactionList groups={groups} />}
          {id === "sem" && list.rows.length > 0 ? (
            <Link href="/transacoes/revisar" className="flex min-h-11 items-center self-start text-[15px] text-accent no-underline">
              Dizer o que foi cada uma
            </Link>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
