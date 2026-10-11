import Link from "next/link";
import { HeroAmount } from "@/components/ui/money";
import { StatRow } from "@/components/ui/stat-row";
import { Eyebrow, ScopeTag } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/dal";
import { formatMonthLabel, todayLocal } from "@/lib/dates";
import { getBusinessSummaries, prepareStreams } from "@/lib/streams/queries";
import { BucketStatement } from "../bucket-statement";
import { PAGE_CLASS, PageHeader } from "../page-header";
import { WithdrawForm } from "./withdraw-form";

export default async function BusinessPage() {
  const user = await requireUser();
  await prepareStreams(user.id);
  const today = todayLocal();
  const businesses = await getBusinessSummaries(user.id, today.slice(0, 7));
  const month = formatMonthLabel(today.slice(0, 7)).toLowerCase();

  return (
    <main className={PAGE_CLASS}>
      <PageHeader title="Caixa do negócio" />
      {businesses.length === 0 ? (
        <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
          Nenhum negócio cadastrado. Crie uma stream do tipo Negócio em{" "}
          <Link href="/config/receitas" className="text-accent no-underline">
            Config → Receitas e reservas
          </Link>
          .
        </p>
      ) : null}
      {businesses.map((business) => (
        <section key={business.streamId} aria-labelledby={`negocio-${business.streamId}`} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 id={`negocio-${business.streamId}`} className="m-0 flex items-center gap-2">
              <Eyebrow>{business.name}</Eyebrow>
              <ScopeTag scope="PJ" />
            </h2>
            <HeroAmount cents={business.balanceCents} />
            <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
              O que o negócio ganhou, depois das reservas, e ainda não saiu para você. Não conta como disponível até a retirada.
            </p>
          </div>
          <WithdrawForm bucketId={business.bucketId} today={today} />
          <div className="flex flex-col">
            <Eyebrow as="h3">Em {month}</Eyebrow>
            <StatRow label="Entrou" valueCents={business.month.inCents} hint="Receita do negócio, já sem as reservas" />
            <StatRow label="Pago pelo caixa" valueCents={business.month.outCents} hint="Saídas lançadas neste bucket" />
            <StatRow label="Retirado" valueCents={business.month.withdrawnCents} />
            <StatRow label="Retirado desde o início" valueCents={business.withdrawnTotalCents} />
          </div>
          <BucketStatement entries={business.entries} today={today} />
        </section>
      ))}
    </main>
  );
}
