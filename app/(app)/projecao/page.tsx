import Link from "next/link";
import type { ReactNode } from "react";
import { HeroAmount, Money } from "@/components/ui/money";
import { type ProjectionMonth, ProjectionChart } from "@/components/ui/projection-chart";
import type { ScopeFilter as ScopeValue } from "@/components/ui/status";
import { Eyebrow } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/dal";
import { formatDayLabel, formatMonthLabel, todayLocal } from "@/lib/dates";
import { getProjection, HORIZON_MONTHS, type RecurringAssumption } from "@/lib/projection/build";
import { parseScopeParam } from "@/lib/queries/scope";
import { PAGE_CLASS, PageHeader } from "../page-header";
import { ScopeFilter } from "../scope-filter";

const shortMonth = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });

/** "nov", e "jan/27" na virada do ano. */
function axisLabel(month: string, index: number): string {
  const name = shortMonth.format(new Date(`${month}-01T00:00:00Z`)).replace(".", "");
  return month.endsWith("-01") && index > 0 ? `${name}/${month.slice(2, 4)}` : name;
}

const INTERVAL = { 7: "toda semana", 30: "todo mês", 365: "todo ano" } as Record<number, string>;

function Row({ label, hint, cents }: { label: ReactNode; hint?: ReactNode; cents: number }) {
  return (
    <li className="flex min-h-[52px] items-center gap-3 py-1.5">
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-[15px] font-[450]">{label}</span>
        {hint ? <span className="text-[13px] text-text-secondary">{hint}</span> : null}
      </span>
      <Money cents={cents} kind={cents > 0 ? "in" : "out"} className="text-[15px]" />
    </li>
  );
}

function Assumption({ title, note, children }: { title: string; note: ReactNode; children?: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <Eyebrow as="h3">{title}</Eyebrow>
      <p className="m-0 text-[13px] leading-[18px] text-text-secondary">{note}</p>
      {children ? <ul className="m-0 flex list-none flex-col p-0">{children}</ul> : null}
    </section>
  );
}

function RecurringRows({ items, today }: { items: RecurringAssumption[]; today: string }) {
  return items.map((item) => (
    <Row
      key={item.id}
      label={item.label}
      hint={`${INTERVAL[item.intervalDays] ?? "recorrente"} · ${item.nextDate < today ? "esperada desde" : "próxima"} ${formatDayLabel(item.nextDate, today).toLowerCase()}${item.stream ? ` · ${item.stream}` : ""}`}
      cents={item.amountCents}
    />
  ));
}

export default async function ProjectionPage({ searchParams }: PageProps<"/projecao">) {
  const user = await requireUser();
  const query = parseScopeParam((await searchParams).escopo);
  const scopeValue: ScopeValue = query.consolidated ? "TUDO" : query.scope;
  const projection = await getProjection(user.id, query);
  const { assumptions: a } = projection;
  const today = todayLocal();

  const months: ProjectionMonth[] = projection.months.map((month, index) => ({
    key: month.month,
    label: axisLabel(month.month, index),
    fullLabel: formatMonthLabel(month.month),
    realisticCents: month.realisticCents,
    optimisticCents: month.optimisticCents,
    businessCents: month.businessCents,
  }));
  const last = projection.months.at(-1);

  return (
    <main className={PAGE_CLASS}>
      <PageHeader title="Projeção" />
      <ScopeFilter value={scopeValue} />

      <section className="flex flex-col gap-2">
        <Eyebrow as="h2">Saldo pessoal em {last ? formatMonthLabel(last.month) : "12 meses"}</Eyebrow>
        <HeroAmount cents={last?.realisticCents ?? 0} />
        <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
          Só com o que está nas premissas abaixo. Projetos avulsos entram na faixa otimista, nunca na linha realista.
        </p>
      </section>

      <ProjectionChart months={months} title={`Próximos ${HORIZON_MONTHS} meses`} />

      <section aria-labelledby="premissas" className="flex flex-col gap-7">
        <h2 id="premissas" className="m-0 text-[28px] font-light leading-8 tracking-[-0.02em]">
          Premissas
        </h2>

        <Assumption title="Ponto de partida" note="O disponível de hoje menos a fatura em aberto dos cartões (as parcelas futuras entram mês a mês).">
          <Row label="Disponível hoje" cents={a.opening.availableCents} />
          <Row label="Fatura em aberto" cents={-a.opening.cardBillCents} />
          <Row label="Começa com" cents={a.opening.openingCents} />
        </Assumption>

        <Assumption
          title="Receitas recorrentes"
          note={
            a.incomes.length > 0
              ? "Mesmo valor (±10%) e mesmo intervalo, 3 ou mais vezes. Já sem as reservas de imposto e custo da stream."
              : "Nenhuma receita recorrente detectada ainda (precisa de 3 ocorrências com o mesmo valor e intervalo)."
          }
        >
          <RecurringRows items={a.incomes} today={today} />
        </Assumption>

        <Assumption
          title="Despesas recorrentes"
          note={a.expenses.length > 0 ? "Pelo mesmo critério. O que é pago com bucket (como o DAS) sai da reserva, não daqui." : "Nenhuma despesa recorrente detectada ainda."}
        >
          <RecurringRows items={a.expenses} today={today} />
        </Assumption>

        <Assumption
          title="Parcelas de cartão"
          note={
            a.installments.purchases > 0
              ? `${a.installments.purchases} ${a.installments.purchases === 1 ? "compra parcelada" : "compras parceladas"}: cada parcela que falta entra no mês dela.`
              : "Nenhuma parcela futura conhecida."
          }
        >
          {a.installments.purchases > 0 ? <Row label="Total que falta" cents={a.installments.totalCents} /> : null}
        </Assumption>

        <Assumption
          title="Gastos variáveis"
          note={
            a.variable.months > 0
              ? `Média ${a.variable.months === 1 ? "do último mês fechado" : `dos últimos ${a.variable.months} meses fechados`} do que não é recorrente nem parcela. No mês corrente, só a parte dos dias que faltam.`
              : "Ainda não há mês fechado para tirar a média: os gastos variáveis ficam de fora até lá."
          }
        >
          {a.variable.months > 0 ? <Row label="Por mês" cents={a.variable.monthlyCents} /> : null}
          {a.variable.categories.slice(0, 5).map((category) => (
            <Row key={category.name} label={<span className="text-text-secondary">{category.name}</span>} cents={category.monthlyCents} />
          ))}
        </Assumption>

        <Assumption
          title="Metas"
          note={
            a.goals.length > 0 ? (
              "O aporte necessário de cada meta, até o mês do alvo. No mês corrente, só o que falta aportar."
            ) : (
              <>
                Nenhuma meta em andamento. <Link href="/metas" className="text-accent no-underline">Definir metas</Link>
              </>
            )
          }
        >
          {a.goals.map((goal) => (
            <Row key={goal.id} label={goal.name} hint={`até ${formatMonthLabel(goal.untilMonth)}`} cents={-goal.monthlyCents} />
          ))}
        </Assumption>

        {a.obligations.length > 0 ? (
          <Assumption title="Obrigações fixas" note="Reservadas do disponível todo mês, a partir do próximo (a deste mês já está reservada).">
            {a.obligations.map((obligation) => (
              <Row key={obligation.name} label={obligation.name} cents={-obligation.monthlyCents} />
            ))}
          </Assumption>
        ) : null}

        <Assumption
          title="Projetos avulsos"
          note={
            a.projects
              ? `Média dos últimos ${a.projects.months} meses, já sem as reservas. Só na faixa otimista.`
              : "Nenhuma entrada de projeto no período: sem faixa otimista."
          }
        >
          {a.projects ? <Row label="Por mês" cents={a.projects.monthlyCents} /> : null}
        </Assumption>

        {a.business ? (
          <Assumption
            title="Negócio"
            note={`Linha separada: o caixa de hoje mais a média líquida (entrou − pagou) dos últimos ${a.business.months} meses. Retiradas não são projetadas.`}
          >
            <Row label="Caixa hoje" cents={a.business.openingCents} />
            <Row label="Por mês" cents={a.business.monthlyNetCents} />
          </Assumption>
        ) : null}

        <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
          Entradas que não são recorrentes nem de projeto não entram: a projeção prefere errar para menos.
        </p>
      </section>
    </main>
  );
}
