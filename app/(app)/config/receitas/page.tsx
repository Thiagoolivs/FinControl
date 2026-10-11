import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import type { BucketType } from "@/generated/prisma/enums";
import { Money } from "@/components/ui/money";
import { Eyebrow, ScopeTag } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/dal";
import { formatDayLabel, todayLocal } from "@/lib/dates";
import { db } from "@/lib/db";
import { getBuckets, getObligations, getStreams, prepareStreams } from "@/lib/streams/queries";
import { PAGE_CLASS } from "../../page-header";
import { BucketRow, NewStreamForm, ObligationForm, StreamRow } from "./controls";

const BUCKET_HINT: Record<BucketType, string> = {
  DISPONIVEL: "Livre para gastar",
  RESERVA_IMPOSTO: "Imposto das entradas e obrigações fixas",
  RESERVA_CUSTO: "Custo do trabalho reservado das entradas",
  CAIXA_PROJETO: "O que o negócio ganhou e ainda não saiu para você",
};

export default async function RevenueSettingsPage() {
  const user = await requireUser();
  await prepareStreams(user.id);
  const [streams, buckets, obligations, incomeCounts] = await Promise.all([
    getStreams(user.id),
    getBuckets(user.id),
    getObligations(user.id),
    db().transaction.groupBy({ by: ["revenueStreamId"], where: { userId: user.id, revenueStreamId: { not: null } }, _count: { _all: true } }),
  ]);
  const countOf = new Map(incomeCounts.map((row) => [row.revenueStreamId, row._count._all]));
  const today = todayLocal();

  return (
    <main className={PAGE_CLASS}>
      <Link href="/config" className="-ml-1 flex min-h-11 items-center gap-1 self-start text-[15px] text-accent no-underline">
        <Icon name="chevron-right" size={16} className="rotate-180" />
        Config
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[34px] font-light leading-10 tracking-[-0.03em]">Receitas e reservas</h1>
        <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
          Cada entrada vai para uma stream. A stream diz quanto reservar para imposto e custo; num negócio, o resto fica no
          caixa dele até você retirar.
        </p>
      </div>

      <section aria-labelledby="streams" className="flex flex-col gap-2">
        <Eyebrow as="h2" id="streams">
          Streams de receita
        </Eyebrow>
        <ul className="m-0 flex list-none flex-col p-0">
          {streams.map((stream) => (
            <li key={stream.id}>
              <StreamRow stream={{ ...stream, incomeCount: countOf.get(stream.id) ?? 0 }} />
            </li>
          ))}
        </ul>
        <details className="group mt-2 flex flex-col gap-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-[16px] font-medium text-accent">Nova stream</summary>
          <NewStreamForm />
        </details>
      </section>

      <section aria-labelledby="buckets" className="flex flex-col gap-2">
        <Eyebrow as="h2" id="buckets">
          Buckets
        </Eyebrow>
        <ul className="m-0 flex list-none flex-col p-0">
          {buckets.map((bucket) => (
            <li key={bucket.id} className="flex flex-col">
              <BucketRow id={bucket.id} name={bucket.name} hint={BUCKET_HINT[bucket.type]} balanceCents={bucket.balanceCents} />
            </li>
          ))}
        </ul>
        <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
          Ajustar saldo lança a diferença no extrato do bucket; nada some do histórico.
        </p>
      </section>

      <section aria-labelledby="obrigacoes" className="flex flex-col gap-4">
        <Eyebrow as="h2" id="obrigacoes">
          Obrigações fixas
        </Eyebrow>
        {obligations.map((obligation) => (
          <div key={obligation.id} className="flex flex-col gap-3">
            <div className="flex flex-col gap-[3px]">
              <span className="flex items-center gap-2 text-[16px] font-medium">
                {obligation.name}
                <ScopeTag scope={obligation.scope} />
              </span>
              <span className="text-[13px] leading-[18px] text-text-secondary">
                {obligation.active ? (
                  <>
                    <Money cents={obligation.amountCents} /> por mês, reservado em {obligation.bucket.name}.{" "}
                    {obligation.reserved ? "Este mês já está reservado" : "Este mês ainda não foi reservado"}; vence{" "}
                    {formatDayLabel(obligation.dueDate, today).toLowerCase()}.
                  </>
                ) : (
                  "Desligada: não reserva nada."
                )}
              </span>
            </div>
            <ObligationForm id={obligation.id} amountCents={obligation.amountCents} dueDay={obligation.dueDay} active={obligation.active} />
          </div>
        ))}
      </section>
    </main>
  );
}
