import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { HeroAmount, Money } from "@/components/ui/money";
import { Eyebrow, ScopeTag } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/dal";
import { formatDayLabel, todayLocal } from "@/lib/dates";
import { formatBps, progressBps } from "@/lib/finance/share";
import { getGoal } from "@/lib/goals/queries";
import { PAGE_CLASS } from "../../page-header";
import { ContributionForm, DeleteContributionButton, GoalEditForm, GoalSimulator } from "../goal-controls";
import { monthLabel } from "../goal-labels";

export default async function GoalPage({ params }: PageProps<"/metas/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const goal = await getGoal(user.id, id);
  if (!goal) notFound();
  const today = todayLocal();
  const currentMonth = today.slice(0, 7);
  const running = goal.progress === "no-prazo" || goal.progress === "atrasada";

  return (
    <main className={PAGE_CLASS}>
      <Link href="/metas" className="-ml-1 flex min-h-11 items-center gap-1 self-start text-[15px] text-accent no-underline">
        <Icon name="chevron-right" size={16} className="rotate-180" />
        Metas
      </Link>

      <section className="flex flex-col gap-2">
        <h1 className="m-0 flex items-center gap-2">
          <Eyebrow>{goal.name}</Eyebrow>
          <ScopeTag scope={goal.scope} />
        </h1>
        <HeroAmount cents={goal.currentCents} />
        {goal.targetCents > 0 ? (
          <p className="m-0 text-[15px] text-text-secondary">
            de <Money cents={goal.targetCents} hideZeroCents /> até {monthLabel(goal.targetMonth)} · {formatBps(progressBps(goal.currentCents, goal.targetCents))}
          </p>
        ) : (
          <p className="m-0 text-[15px] text-accent">Defina o valor e a data abaixo para a meta entrar na projeção.</p>
        )}
      </section>

      {goal.progress === "concluida" ? <p className="m-0 text-[15px] text-positive">Meta atingida.</p> : null}
      {goal.progress === "pausada" ? <p className="m-0 text-[15px] text-text-secondary">Pausada: não pede aporte nem entra na projeção.</p> : null}
      {running ? (
        <section className="flex flex-col gap-2">
          {goal.progress === "atrasada" ? (
            <p className="m-0 flex items-start gap-1.5 text-[15px] text-negative">
              <Icon name="alert" size={16} strokeWidth={2.2} className="mt-[3px] shrink-0" />
              {goal.targetMonth < currentMonth ? "O prazo passou sem a meta fechar." : "Atrasada: o aporte necessário subiu desde o mês passado."}
            </p>
          ) : null}
          <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
            Aporte necessário: <span className="text-text-primary"><Money cents={goal.monthlyRequiredCents} hideZeroCents />/mês</span> (calculado no começo do mês). Neste mês
            você aportou <Money cents={goal.contributedThisMonthCents} />.
          </p>
          <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
            {goal.paceCents === null ? (
              "Ainda não há um mês fechado para medir o ritmo."
            ) : (
              <>
                Ritmo dos últimos meses: <Money cents={goal.paceCents} />
                /mês. {goal.realisticMonth ? `Nesse ritmo, fecha em ${monthLabel(goal.realisticMonth)}.` : "Nesse ritmo, não fecha."}
              </>
            )}
          </p>
        </section>
      ) : null}

      <section aria-labelledby="lancar" className="flex flex-col gap-3">
        <Eyebrow as="h2" id="lancar">
          Lançar
        </Eyebrow>
        <ContributionForm goalId={goal.id} today={today} />
      </section>

      {goal.targetCents > goal.currentCents ? (
        <section aria-labelledby="simulador" className="flex flex-col gap-3">
          <Eyebrow as="h2" id="simulador">
            Simulador
          </Eyebrow>
          <GoalSimulator targetCents={goal.targetCents} currentCents={goal.currentCents} currentMonth={currentMonth} targetMonth={goal.targetMonth} />
        </section>
      ) : null}

      <section aria-labelledby="historico" className="flex flex-col gap-1">
        <Eyebrow as="h2" id="historico">
          Histórico
        </Eyebrow>
        {goal.contributions.length === 0 ? (
          <p className="m-0 text-[13px] text-text-secondary">Nenhum aporte ainda.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {goal.contributions.map((contribution) => (
              <li key={contribution.id} className="flex min-h-[56px] items-center gap-3 py-1">
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="truncate text-[15px] font-[450]">{contribution.note ?? (contribution.amountCents > 0 ? "Aporte" : "Resgate")}</span>
                  <span className="text-[13px] text-text-secondary">{formatDayLabel(contribution.date, today)}</span>
                </span>
                <Money cents={contribution.amountCents} kind={contribution.amountCents > 0 ? "in" : "out"} className="text-[15px]" />
                <DeleteContributionButton id={contribution.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="editar" className="flex flex-col gap-3">
        <Eyebrow as="h2" id="editar">
          Editar meta
        </Eyebrow>
        <GoalEditForm goal={{ id: goal.id, name: goal.name, targetCents: goal.targetCents, targetMonth: goal.targetMonth, status: goal.status }} />
      </section>
    </main>
  );
}
