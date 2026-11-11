import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Money } from "@/components/ui/money";
import { Eyebrow, ScopeTag } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/dal";
import { formatDayLabel, todayLocal } from "@/lib/dates";
import { getObligations, getStreams, prepareStreams } from "@/lib/streams/queries";
import { PAGE_CLASS } from "../../page-header";
import { NewStreamForm, ObligationForm, StreamRow } from "./controls";

export default async function RevenueSettingsPage() {
  const user = await requireUser();
  await prepareStreams(user.id);
  const [streams, obligations] = await Promise.all([getStreams(user.id), getObligations(user.id)]);
  const today = todayLocal();

  return (
    <main className={PAGE_CLASS}>
      <Link href="/config" className="-ml-1 flex min-h-11 items-center gap-1 self-start text-[15px] text-accent no-underline">
        <Icon name="chevron-right" size={16} className="rotate-180" />
        Config
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[34px] font-light leading-10 tracking-[-0.03em]">Renda e contas fixas</h1>
        <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
          De onde vem o seu dinheiro (salário, clientes, freelas) e as contas fixas que o app lembra antes de vencer.
        </p>
      </div>

      <section aria-labelledby="fontes" className="flex flex-col gap-2">
        <Eyebrow as="h2" id="fontes">
          Fontes de renda
        </Eyebrow>
        <ul className="m-0 flex list-none flex-col p-0">
          {streams.map((stream) => (
            <li key={stream.id}>
              <StreamRow stream={stream} />
            </li>
          ))}
        </ul>
        <details className="group mt-2 flex flex-col gap-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-[16px] font-medium text-accent">Nova fonte de renda</summary>
          <NewStreamForm />
        </details>
      </section>

      <section aria-labelledby="lembretes" className="flex flex-col gap-4">
        <Eyebrow as="h2" id="lembretes">
          Contas fixas com lembrete
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
                    <Money cents={obligation.amountCents} /> por mês. Próximo vencimento: {formatDayLabel(obligation.nextDueDate, today).toLowerCase()}.
                  </>
                ) : (
                  "Sem lembrete."
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
