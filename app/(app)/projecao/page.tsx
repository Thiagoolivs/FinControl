import type { ReactNode } from "react";
import { HeroAmount, Money } from "@/components/ui/money";
import { type ProjectionMonth, ProjectionChart } from "@/components/ui/projection-chart";
import type { ScopeFilter as ScopeValue } from "@/components/ui/status";
import { Eyebrow } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/dal";
import { addMonths, formatMonthLabel, todayLocal } from "@/lib/dates";
import { getProjection, HORIZON_MONTHS } from "@/lib/projection/build";
import { parseScopeParam } from "@/lib/queries/scope";
import { PAGE_CLASS, PageHeader } from "../page-header";
import { ScopeFilter } from "../scope-filter";

const shortMonth = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
/** Mês do número grande: daqui a seis meses (perto o bastante para valer a pena olhar). */
const HEADLINE_MONTHS_AHEAD = 6;

/** "nov", e "jan/27" na virada do ano. */
function axisLabel(month: string, index: number): string {
  const name = shortMonth.format(new Date(`${month}-01T00:00:00Z`)).replace(".", "");
  return month.endsWith("-01") && index > 0 ? `${name}/${month.slice(2, 4)}` : name;
}

const monthWord = (month: string) => formatMonthLabel(month).split(" ")[0] ?? "";

function Line({ label, cents, kind = "neutral", strong = false }: { label: ReactNode; cents: number; kind?: "in" | "neutral"; strong?: boolean }) {
  return (
    <li className="flex min-h-11 items-center gap-3">
      <span className={`flex-1 text-[15px] ${strong ? "font-medium" : "text-text-secondary"}`}>{label}</span>
      <Money cents={cents} kind={kind} className={`text-[15px] ${strong ? "font-medium" : ""} ${cents < 0 ? "text-negative" : ""}`} />
    </li>
  );
}

export default async function ProjectionPage({ searchParams }: PageProps<"/projecao">) {
  const user = await requireUser();
  const query = parseScopeParam((await searchParams).escopo);
  const scopeValue: ScopeValue = query.consolidated ? "TUDO" : query.scope;
  const projection = await getProjection(user.id, query);
  const today = todayLocal();

  const months: ProjectionMonth[] = projection.months.map((month, index) => ({
    key: month.month,
    label: axisLabel(month.month, index),
    fullLabel: formatMonthLabel(month.month),
    expectedCents: month.expectedCents,
    lowCents: month.lowCents,
    highCents: month.highCents,
  }));
  const headline = projection.months.find((month) => month.month === addMonths(today.slice(0, 7), HEADLINE_MONTHS_AHEAD)) ?? projection.months.at(-1);
  const endOfMonth = projection.months[0];
  const average = projection.averageNetCents;

  return (
    <main className={PAGE_CLASS}>
      <PageHeader title="Projeção" />
      <ScopeFilter value={scopeValue} />

      <section className="flex flex-col gap-2">
        <Eyebrow as="h2">Se continuar assim, em {headline ? formatMonthLabel(headline.month) : "6 meses"}</Eyebrow>
        <HeroAmount cents={headline?.expectedCents ?? projection.opening.openingCents} />
        <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
          {average === null
            ? "Ainda não há um mês fechado para comparar: a projeção fica parada no que você tem hoje."
            : average >= 0
              ? "Nos últimos meses sobrou dinheiro; se continuar assim, ele cresce."
              : "Nos últimos meses saiu mais do que entrou; se continuar assim, ele diminui."}
          {headline && headline.lowCents !== headline.highCents ? (
            <>
              {" "}
              Entre <Money cents={headline.lowCents} hideZeroCents /> e <Money cents={headline.highCents} hideZeroCents />, conforme os meses forem como o pior ou
              o melhor recente.
            </>
          ) : null}
        </p>
        {endOfMonth ? (
          <p className="m-0 text-[15px] leading-[21px]">
            No fim de {monthWord(endOfMonth.month)}: <Money cents={endOfMonth.expectedCents} className={endOfMonth.expectedCents < 0 ? "text-negative" : undefined} />
          </p>
        ) : null}
      </section>

      <ProjectionChart months={months} title={`Próximos ${HORIZON_MONTHS} meses`} />

      <section aria-labelledby="como" className="flex flex-col gap-6">
        <h2 id="como" className="m-0 text-[28px] font-light leading-8 tracking-[-0.02em]">
          Como a conta é feita
        </h2>

        <div className="flex flex-col gap-1">
          <Eyebrow as="h3">De onde parte</Eyebrow>
          <ul className="m-0 flex list-none flex-col p-0">
            <Line label="Dinheiro livre nas contas (sem caixinhas)" cents={projection.opening.freeCents} />
            {projection.opening.cardBillCents > 0 ? <Line label="Fatura do cartão em aberto" cents={-projection.opening.cardBillCents} /> : null}
            <Line label="Hoje" cents={projection.opening.openingCents} strong />
          </ul>
        </div>

        <div className="flex flex-col gap-1">
          <Eyebrow as="h3">Quanto sobrou por mês</Eyebrow>
          {projection.history.length === 0 ? (
            <p className="m-0 text-[15px] leading-[21px] text-text-secondary">Assim que um mês inteiro fechar com dados, ele entra aqui.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {projection.history.map((month) => (
                <li key={month.month} className="flex min-h-[52px] items-center gap-3 py-1">
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="text-[15px] capitalize">{monthWord(month.month)}</span>
                    <span className="text-[13px] text-text-secondary">
                      Entrou <Money cents={month.inCents} hideZeroCents /> · saiu <Money cents={month.outCents} hideZeroCents />
                    </span>
                  </span>
                  <Money cents={month.netCents} kind={month.netCents > 0 ? "in" : "neutral"} className={`text-[15px] ${month.netCents < 0 ? "text-negative" : ""}`} />
                </li>
              ))}
              {average !== null ? <Line label="Média por mês" cents={average} kind={average > 0 ? "in" : "neutral"} strong /> : null}
            </ul>
          )}
        </div>

        <p className="m-0 pb-6 text-[13px] leading-[18px] text-text-secondary">
          Transferências entre as suas contas se anulam e não contam. Dinheiro que vai para investimentos sai da conta, então conta como saída. Caixinhas ficam de fora: são
          dinheiro guardado.
        </p>
      </section>
    </main>
  );
}
