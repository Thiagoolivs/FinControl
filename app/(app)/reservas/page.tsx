import Link from "next/link";
import { HeroAmount, Money } from "@/components/ui/money";
import { ScopeTag } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/dal";
import { formatDayLabel, todayLocal } from "@/lib/dates";
import { getObligations, getReserveStatements, prepareStreams } from "@/lib/streams/queries";
import { BucketStatement } from "../bucket-statement";
import { PAGE_CLASS, PageHeader } from "../page-header";

export default async function ReservesPage() {
  const user = await requireUser();
  await prepareStreams(user.id);
  const [reserves, obligations] = await Promise.all([getReserveStatements(user.id), getObligations(user.id)]);
  const today = todayLocal();
  const totalCents = reserves.reduce((sum, bucket) => sum + bucket.balanceCents, 0);

  return (
    <main className={PAGE_CLASS}>
      <PageHeader title="Reservado" />
      <section className="flex flex-col gap-2">
        <HeroAmount cents={totalCents} />
        <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
          Dinheiro que está nas contas mas já tem destino: imposto e custo das entradas e as obrigações do mês. Não entra
          no disponível.
        </p>
      </section>

      {obligations.filter((obligation) => obligation.active).map((obligation) => (
        <section key={obligation.id} className="flex flex-col gap-[3px]">
          <span className="flex items-center gap-2 text-[16px] font-medium">
            {obligation.name}
            <ScopeTag scope={obligation.scope} />
          </span>
          <span className="text-[13px] leading-[18px] text-text-secondary">
            <Money cents={obligation.amountCents} /> {obligation.reserved ? "reservado este mês" : "ainda não reservado este mês"} · vence{" "}
            {formatDayLabel(obligation.dueDate, today).toLowerCase()}
          </span>
        </section>
      ))}

      {reserves.map((bucket) => (
        <section key={bucket.id} aria-labelledby={`bucket-${bucket.id}`} className="flex flex-col gap-4">
          <div className="flex items-baseline gap-3">
            <h2 id={`bucket-${bucket.id}`} className="m-0 flex flex-1 items-center gap-2 text-[22px] font-light tracking-[-0.01em]">
              {bucket.name}
              <ScopeTag scope={bucket.scope} />
            </h2>
            <Money cents={bucket.balanceCents} className="text-[20px] font-light" />
          </div>
          <BucketStatement entries={bucket.entries} today={today} />
        </section>
      ))}

      <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
        Os percentuais de cada stream e o valor do DAS ficam em{" "}
        <Link href="/config/receitas" className="text-accent no-underline">
          Config → Receitas e reservas
        </Link>
        .
      </p>
    </main>
  );
}
