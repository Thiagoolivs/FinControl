import Link from "next/link";
import { GoalCard } from "@/components/ui/goal-card";
import { HeroAmount } from "@/components/ui/money";
import { RowLink } from "@/components/ui/row-link";
import { Eyebrow } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/dal";
import { getGoals } from "@/lib/goals/queries";
import { PAGE_CLASS, PageHeader } from "../page-header";
import { CARD_STATUS, monthLabel, realisticLabel } from "./goal-labels";

export default async function GoalsPage() {
  const user = await requireUser();
  const goals = await getGoals(user.id, { includeArchived: true });
  const visible = goals.filter((goal) => goal.status !== "ARQUIVADA");
  const archived = goals.filter((goal) => goal.status === "ARQUIVADA");
  const running = visible.filter((goal) => goal.progress === "no-prazo" || goal.progress === "atrasada");
  const monthlyCents = running.reduce((sum, goal) => sum + goal.monthlyRequiredCents, 0);
  const late = running.filter((goal) => goal.progress === "atrasada").length;
  const unset = visible.filter((goal) => goal.progress === "sem-alvo").length;

  return (
    <main className={PAGE_CLASS}>
      <PageHeader title="Metas" />
      <section className="flex flex-col gap-2">
        <Eyebrow as="h2">Aporte necessário por mês</Eyebrow>
        <HeroAmount cents={monthlyCents} />
        <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
          {running.length === 0
            ? "Nenhuma meta em andamento."
            : `Soma de ${running.length} ${running.length === 1 ? "meta" : "metas"} em andamento${late > 0 ? `; ${late} ${late === 1 ? "atrasada" : "atrasadas"}` : ""}. Entra na projeção como saída.`}
          {unset > 0 ? ` ${unset} ${unset === 1 ? "meta ainda precisa" : "metas ainda precisam"} de valor e data.` : ""}
        </p>
      </section>

      <ul className="m-0 flex list-none flex-col gap-6 p-0">
        {visible.map((goal) => (
          <li key={goal.id}>
            <GoalCard
              name={goal.name}
              scope={goal.scope}
              currentCents={goal.currentCents}
              targetCents={goal.targetCents}
              monthlyRequiredCents={goal.monthlyRequiredCents}
              targetDateLabel={monthLabel(goal.targetMonth)}
              status={CARD_STATUS[goal.progress]}
              realisticDateLabel={realisticLabel(goal)}
              href={`/metas/${goal.id}`}
            />
          </li>
        ))}
      </ul>
      <Link href="/metas/nova" className="flex min-h-11 items-center self-start text-[16px] font-medium text-accent no-underline">
        Nova meta
      </Link>

      {archived.length > 0 ? (
        <section className="flex flex-col gap-1">
          <Eyebrow as="h2">Arquivadas</Eyebrow>
          <ul className="m-0 flex list-none flex-col p-0">
            {archived.map((goal) => (
              <li key={goal.id}>
                <RowLink href={`/metas/${goal.id}`}>
                  <span className="flex-1 text-[15px] text-text-secondary">{goal.name}</span>
                </RowLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
