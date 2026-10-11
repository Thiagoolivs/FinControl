import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { StatRow } from "@/components/ui/stat-row";
import type { ScopeFilter } from "@/components/ui/status";
import { TransactionList } from "@/components/ui/transaction-item";
import { requireUser } from "@/lib/auth/dal";
import { isMonth, todayLocal } from "@/lib/dates";
import { summarizeFlows } from "@/lib/finance/flows";
import { parseScopeParam } from "@/lib/queries/scope";
import { listTransactions, TRANSACTION_KINDS, type TransactionKindFilter } from "@/lib/queries/transactions";
import { categoryOptions, ensureDefaultCategories, getCategoryTree } from "@/lib/rules/categories";
import { countReviewQueue } from "@/lib/rules/queue";
import { PAGE_CLASS, PageHeader } from "../page-header";
import { groupByDay, isTransferRow, toTransactionItem } from "../transaction-groups";
import { TransactionFilters } from "./filters";
import { MonthNav, ViewTabs } from "./month-nav";

const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));

export default async function TransactionsPage({ searchParams }: PageProps<"/transacoes">) {
  const user = await requireUser();
  await ensureDefaultCategories(user.id);
  const params = await searchParams;
  const today = todayLocal();
  const currentMonth = today.slice(0, 7);
  const month = isMonth(first(params.mes)) && first(params.mes) <= currentMonth ? first(params.mes) : currentMonth;
  const scope = parseScopeParam(params.escopo);
  const kindParam = first(params.tipo);
  const kind = (TRANSACTION_KINDS as readonly string[]).includes(kindParam) ? (kindParam as TransactionKindFilter) : undefined;
  const search = first(params.q).slice(0, 80);
  const categoryId = first(params.categoria);

  const [tree, queueCount, list] = await Promise.all([
    getCategoryTree(user.id),
    countReviewQueue(user.id),
    listTransactions(user.id, { month, scope, search, categoryId: categoryId || undefined, kind }),
  ]);
  const flows = summarizeFlows(
    list.rows.filter((row) => !row.isIgnored).map((row) => ({ amountCents: row.amountCents, isTransfer: isTransferRow(row) })),
  );
  const groups = groupByDay(list.rows, today, (row) => {
    const category = isTransferRow(row)
      ? "transferência entre contas"
      : row.revenueStream
        ? row.revenueStream.name
        : row.category
          ? row.category.parent
            ? `${row.category.parent.name} › ${row.category.name}`
            : row.category.name
          : "sem categoria";
    const meta = [row.account.name, category, row.isIgnored ? "ignorada" : null].filter(Boolean).join(" · ");
    return toTransactionItem(row, meta, `/transacoes/${row.id}`);
  });

  const monthHref = (target: string) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const text = first(value);
      if (text && key !== "mes") query.set(key, text);
    }
    if (target !== currentMonth) query.set("mes", target);
    const search = query.toString();
    return search ? `/transacoes?${search}` : "/transacoes";
  };
  const scopeValue: ScopeFilter = scope.consolidated ? "TUDO" : scope.scope;

  return (
    <main className={PAGE_CLASS}>
      <PageHeader title="Transações" />
      <ViewTabs active="extrato" month={month} currentMonth={currentMonth} scopeParam={first(params.escopo) || null} />

      {queueCount > 0 ? (
        <Link
          href="/transacoes/revisar"
          className="flex items-center gap-3 rounded-card bg-surface px-5 py-4 text-text-primary no-underline transition-opacity duration-200 ease-apple active:opacity-70"
        >
          <Icon name="sparkle" size={18} className="shrink-0 text-accent" />
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-semibold">
              {queueCount} {queueCount === 1 ? "transação para revisar" : "transações para revisar"}
            </span>
            <span className="text-[13px] text-text-secondary">Categorize uma vez e vire regra para as próximas.</span>
          </span>
          <Icon name="chevron-right" size={14} strokeWidth={2} className="shrink-0 text-text-tertiary" />
        </Link>
      ) : null}

      <MonthNav month={month} currentMonth={currentMonth} hrefFor={monthHref} />

      <TransactionFilters categories={categoryOptions(tree)} search={search} categoryId={categoryId} kind={kind ?? ""} scope={scopeValue} />

      {list.rows.length > 0 && !list.truncated ? (
        <div className="flex flex-col">
          <StatRow label="Entradas" valueCents={flows.inCents} />
          <StatRow label="Saídas" valueCents={flows.outCents} hint={flows.transferCount > 0 ? "Sem transferências entre suas contas nem pagamento de fatura" : undefined} />
        </div>
      ) : null}

      {list.rows.length === 0 ? (
        <EmptyState compact title="Nada por aqui." description="Nenhuma transação com esses filtros neste mês." />
      ) : (
        <>
          <TransactionList groups={groups} />
          {list.truncated ? (
            <p className="m-0 text-[13px] text-text-secondary">
              Mostrando {list.rows.length} de {list.total}. Use a busca ou os filtros para achar o resto.
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}
