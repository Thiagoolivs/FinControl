import Link from "next/link";
import { GoalCard } from "@/components/ui/goal-card";
import { Money } from "@/components/ui/money";
import { MonthScore } from "@/components/ui/month-score";
import { RowLink } from "@/components/ui/row-link";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/dal";
import { formatMonthLabel, todayLocal } from "@/lib/dates";
import { db } from "@/lib/db";
import { savingsRateBps } from "@/lib/finance/month-flow";
import { monthAchievements, savingsStreak } from "@/lib/finance/month-score";
import { getGoals } from "@/lib/goals/queries";
import { getMonthOverview } from "@/lib/queries/month-flow";
import type { ScopeQuery } from "@/lib/queries/scope";
import { getMonthCategoryBreakdown } from "@/lib/queries/transactions";
import { countReviewQueue } from "@/lib/rules/queue";
import { categoryOverThresholdBps } from "@/lib/sync/alerts";
import { PAGE_CLASS, PageHeader } from "../page-header";
import { CARD_STATUS, monthLabel, realisticLabel } from "./goal-labels";

/** O placar olha o dinheiro todo: PF e PJ juntos, com as transferências entre elas se anulando. */
const ALL: ScopeQuery = { consolidated: true };

export default async function GoalsPage() {
  const user = await requireUser();
  const today = todayLocal();
  const month = today.slice(0, 7);
  const [goals, overview, breakdown, overBps, reviewCount, settings] = await Promise.all([
    getGoals(user.id, { includeArchived: true }),
    getMonthOverview(user.id, ALL, today),
    getMonthCategoryBreakdown(user.id, ALL, month),
    categoryOverThresholdBps(user.id),
    countReviewQueue(user.id),
    db().user.findUniqueOrThrow({ where: { id: user.id }, select: { savingsTargetBps: true } }),
  ]);
  const { flow } = overview;
  const areas = breakdown.filter((row) => row.id !== "sem");
  const hasHistory = areas.some((row) => row.averageRatioBps !== null);
  const achievements = monthAchievements({
    flow,
    targetBps: settings.savingsTargetBps,
    reviewCount,
    lastMonthToDateCents: overview.lastMonthToDateCents,
    overAverageAreas:
      overBps !== null && hasHistory ? areas.filter((row) => row.averageRatioBps !== null && row.averageRatioBps >= overBps).length : null,
  });

  const visible = goals.filter((goal) => goal.status !== "ARQUIVADA");
  const withTarget = visible.filter((goal) => goal.progress !== "sem-alvo");
  const unsetGoals = visible.filter((goal) => goal.progress === "sem-alvo");
  const archived = goals.filter((goal) => goal.status === "ARQUIVADA");
  const running = visible.filter((goal) => goal.progress === "no-prazo" || goal.progress === "atrasada");
  const monthlyCents = running.reduce((sum, goal) => sum + goal.monthlyRequiredCents, 0);
  const late = running.filter((goal) => goal.progress === "atrasada").length;

  return (
    <main className={PAGE_CLASS}>
      <PageHeader title="Metas" />

      <Section id="placar" eyebrow={`${formatMonthLabel(month).split(" ")[0] ?? ""} até hoje`} title="Seu mês">
        <MonthScore
          savingsBps={savingsRateBps(flow)}
          targetBps={settings.savingsTargetBps}
          streak={savingsStreak(overview.closedMonths, settings.savingsTargetBps)}
          achievements={achievements}
          settingsHref="/config#placar"
        />
      </Section>

      <Section id="metas" eyebrow="Metas" title="Para o que você guarda">
        {running.length > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="m-0 flex items-baseline justify-between gap-3 text-[16px]">
              <span>Guardar por mês</span>
              <Money cents={monthlyCents} hideZeroCents className="text-[17px] font-medium" />
            </p>
            <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
              {`Soma de ${running.length} ${running.length === 1 ? "meta" : "metas"} em andamento${late > 0 ? `; ${late} ${late === 1 ? "atrasada" : "atrasadas"}` : ""}.`}
            </p>
          </div>
        ) : null}

        {withTarget.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-6 p-0">
            {withTarget.map((goal) => (
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
        ) : null}

        {unsetGoals.length > 0 ? (
          <div className="flex flex-col gap-1">
            <Eyebrow as="h3">{withTarget.length > 0 ? "Ainda sem valor" : "Escolha quanto e até quando"}</Eyebrow>
            <ul className="m-0 flex list-none flex-col p-0">
              {unsetGoals.map((goal) => (
                <li key={goal.id}>
                  <RowLink href={`/metas/${goal.id}`}>
                    <span className="flex-1 text-[16px]">{goal.name}</span>
                    <span className="text-[15px] text-accent">Definir</span>
                  </RowLink>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Link href="/metas/nova" className="flex min-h-11 items-center self-start text-[16px] font-medium text-accent no-underline">
          Nova meta
        </Link>
      </Section>

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
