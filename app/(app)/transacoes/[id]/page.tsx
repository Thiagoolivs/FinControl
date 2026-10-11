import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Money } from "@/components/ui/money";
import { Eyebrow, ScopeTag, Tag } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/dal";
import { formatDayLabel, fromDbDate, todayLocal } from "@/lib/dates";
import { db } from "@/lib/db";
import { categoryOptions, getCategoryTree } from "@/lib/rules/categories";
import { PAGE_CLASS } from "../../page-header";
import { isTransferRow } from "../../transaction-groups";
import { CategorySelect, IgnoreSwitch, UnpairButton } from "./controls";

export default async function TransactionPage({ params }: PageProps<"/transacoes/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const transaction = await db().transaction.findFirst({
    where: { id, userId: user.id },
    include: {
      account: { select: { name: true, connection: { select: { institutionName: true } } } },
      category: { select: { kind: true } },
      rule: { select: { id: true, pattern: true } },
      transferPeer: { select: { date: true, amountCents: true, account: { select: { name: true } } } },
    },
  });
  if (!transaction) notFound();
  const tree = await getCategoryTree(user.id);
  const today = todayLocal();
  const transfer = isTransferRow(transaction);

  return (
    <main className={PAGE_CLASS}>
      <Link href="/transacoes" className="-ml-1 flex min-h-11 items-center gap-1 self-start text-[15px] text-accent no-underline">
        <Icon name="chevron-right" size={16} className="rotate-180" />
        Transações
      </Link>

      <section aria-label="Transação" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Eyebrow>{formatDayLabel(fromDbDate(transaction.date), today)}</Eyebrow>
          <ScopeTag scope={transaction.scope} />
          {transaction.status === "PENDING" ? <Tag>Pendente</Tag> : null}
          {transaction.installmentCurrent && transaction.installmentTotal ? (
            <Tag>
              Parcela {transaction.installmentCurrent}/{transaction.installmentTotal}
            </Tag>
          ) : null}
        </div>
        <h1 className="m-0 text-[28px] font-light leading-8 tracking-[-0.02em]">{transaction.descriptionClean}</h1>
        <Money
          cents={transaction.amountCents}
          kind={transfer ? "transfer" : transaction.amountCents > 0 ? "in" : "out"}
          className="text-[34px] font-light tracking-[-0.03em]"
        />
        <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
          {[transaction.account.connection?.institutionName, transaction.account.name].filter(Boolean).join(" · ")}
        </p>
        {transaction.descriptionRaw !== transaction.descriptionClean ? (
          <p className="m-0 break-words font-mono text-[13px] text-text-secondary">No extrato: {transaction.descriptionRaw}</p>
        ) : null}
      </section>

      {transaction.transferPeer ? (
        <section aria-label="Transferência" className="flex flex-col gap-2">
          <Eyebrow as="h2">Transferência entre suas contas</Eyebrow>
          <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
            A outra perna está em {transaction.transferPeer.account.name}, {formatDayLabel(fromDbDate(transaction.transferPeer.date), today).toLowerCase()}. Por
            isso não conta como gasto nem como receita.
          </p>
          <UnpairButton transactionId={transaction.id} />
        </section>
      ) : (
        <section aria-label="Categoria" className="flex flex-col gap-2">
          <Eyebrow as="h2">Categoria</Eyebrow>
          <CategorySelect transactionId={transaction.id} categoryId={transaction.categoryId} options={categoryOptions(tree)} />
          <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
            {transaction.rule ? (
              <>
                Pela regra{" "}
                <Link href={`/config/regras/${transaction.rule.id}`} className="font-mono text-accent">
                  {transaction.rule.pattern}
                </Link>
                . Mudar aqui vale só para esta transação.
              </>
            ) : transaction.categoryId ? (
              "Escolhida por você."
            ) : (
              "Sem categoria: está na fila de revisão."
            )}
          </p>
          <Link href={`/config/regras/nova?de=${transaction.id}`} className="flex min-h-11 items-center self-start text-[15px] text-accent">
            Criar regra a partir desta
          </Link>
        </section>
      )}

      <IgnoreSwitch transactionId={transaction.id} ignored={transaction.isIgnored} />
    </main>
  );
}
