import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Eyebrow } from "@/components/ui/text";
import { isGeminiConfigured } from "@/lib/ai/gemini";
import { requireUser } from "@/lib/auth/dal";
import { categoryOptions, ensureDefaultCategories, getCategoryTree } from "@/lib/rules/categories";
import { getIncomeQueue, getReviewQueue } from "@/lib/rules/queue";
import { destinationOptions, prepareStreams } from "@/lib/streams/queries";
import { PAGE_CLASS } from "../../page-header";
import { AcceptAllButton } from "./accept-all";
import { QueueGroupCard } from "./group-card";
import { IncomeGroupCard } from "./income-card";
import { SuggestButton } from "./suggest-button";

const VISIBLE_GROUPS = 30;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const transactionsIn = (groups: { transactions: unknown[] }[]) => groups.reduce((sum, group) => sum + group.transactions.length, 0);

export default async function ReviewPage({ searchParams }: PageProps<"/transacoes/revisar">) {
  const user = await requireUser();
  await ensureDefaultCategories(user.id);
  await prepareStreams(user.id);
  const [queue, income, tree, destinations, params] = await Promise.all([
    getReviewQueue(user.id),
    getIncomeQueue(user.id),
    getCategoryTree(user.id),
    destinationOptions(user.id),
    searchParams,
  ]);
  const total = transactionsIn(queue);
  const incomeTotal = transactionsIn(income);
  const options = categoryOptions(tree);
  const ai = isGeminiConfigured();
  // Sem saídas para revisar, a fila abre direto nas entradas.
  const kind = incomeTotal > 0 && (params.tipo === "entradas" || total === 0) ? "entradas" : "saidas";
  const kindTabs = incomeTotal > 0 && total > 0 ? <KindTabs current={kind} outflows={total} inflows={incomeTotal} /> : null;

  if (kind === "entradas") {
    return (
      <main className={PAGE_CLASS}>
        <BackLink />
        <header className="flex flex-col gap-2">
          <Eyebrow as="p">Fila de revisão</Eyebrow>
          <h1 className="m-0 text-[34px] font-light leading-10 tracking-[-0.03em]">{plural(incomeTotal, "entrada", "entradas")} sem fonte</h1>
          <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
            Diga de que stream veio cada grupo: as reservas de imposto e custo saem na hora e, se for do negócio, o resto vai
            para o caixa dele. Estorno, reembolso ou resgate não é receita: escolha uma categoria.
          </p>
        </header>
        {kindTabs}
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {income.slice(0, VISIBLE_GROUPS).map((group) => (
            <IncomeGroupCard key={group.key} group={group} streams={destinations.streams} categories={options} />
          ))}
        </ul>
        {income.length > VISIBLE_GROUPS ? (
          <p className="m-0 text-[13px] text-text-secondary">Mais {income.length - VISIBLE_GROUPS} grupos depois destes.</p>
        ) : null}
      </main>
    );
  }

  const suggested = queue.filter((group) => group.suggestion !== null);
  const unsuggested = queue.filter((group) => group.suggestion === null);
  const acceptable = suggested.filter((group) => group.suggestion?.categoryId);
  const view = params.ver === "sem" || suggested.length === 0 ? "sem" : "sugeridas";
  const groups = view === "sugeridas" ? suggested : unsuggested;

  return (
    <main className={PAGE_CLASS}>
      <BackLink />

      <header className="flex flex-col gap-2">
        <Eyebrow as="p">Fila de revisão</Eyebrow>
        <h1 className="m-0 text-[34px] font-light leading-10 tracking-[-0.03em]">
          {total === 0 ? "Tudo categorizado" : `${plural(total, "saída", "saídas")} sem categoria`}
        </h1>
        {total > 0 ? (
          <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
            {ai
              ? `A IA já sugeriu categoria para ${plural(suggested.length, "grupo", "grupos")} (${plural(transactionsIn(suggested), "transação", "transações")}). ${
                  unsuggested.length > 0
                    ? `Faltam ${plural(unsuggested.length, "grupo", "grupos")} (${plural(transactionsIn(unsuggested), "transação", "transações")}) sem sugestão.`
                    : "Não falta nenhum grupo."
                }`
              : "Agrupadas por loja. Ao criar a regra, as próximas com o mesmo padrão já chegam categorizadas."}
          </p>
        ) : null}
      </header>
      {kindTabs}

      {total > 0 && ai ? (
        <div className="flex flex-col gap-3">
          {unsuggested.length > 0 ? <SuggestButton remainingGroups={unsuggested.length} /> : null}
          {acceptable.length > 0 ? <AcceptAllButton groups={acceptable.length} transactions={transactionsIn(acceptable)} /> : null}
          <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
            Só as descrições vão para o Gemini (Google), sem valores nem contas. A IA sugere; quem decide é você.
          </p>
        </div>
      ) : null}
      {total > 0 && !ai ? (
        <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
          Com <code>GEMINI_API_KEY</code> e <code>GEMINI_MODEL</code> nas variáveis do Railway, a IA sugere categoria e padrão para cada grupo.
        </p>
      ) : null}

      {suggested.length > 0 && unsuggested.length > 0 ? (
        <nav aria-label="Grupos" className="flex gap-6">
          {(
            [
              ["sugeridas", `Sugeridas pela IA (${suggested.length})`],
              ["sem", `Sem sugestão (${unsuggested.length})`],
            ] as const
          ).map(([key, label]) => (
            <Link
              key={key}
              href={key === "sugeridas" ? "/transacoes/revisar" : "/transacoes/revisar?ver=sem"}
              aria-current={view === key ? "page" : undefined}
              className={`flex min-h-11 flex-col items-start justify-center gap-1 text-[15px] no-underline ${view === key ? "font-semibold text-text-primary" : "text-text-secondary"}`}
            >
              {label}
              <span aria-hidden="true" className={`size-1 rounded-full ${view === key ? "bg-text-primary" : "bg-transparent"}`} />
            </Link>
          ))}
        </nav>
      ) : null}

      {view === "sugeridas" && groups.length > 0 ? (
        <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
          Confira cada grupo e toque em <strong className="font-semibold text-text-primary">Aceitar</strong>. Se a IA errou, troque a categoria ou o padrão antes:
          vira uma correção. <strong className="font-semibold text-text-primary">Ignorar sugestão</strong> descarta só a sugestão; o grupo continua aqui.
        </p>
      ) : null}

      {queue.length === 0 ? (
        <EmptyState title="Nada para revisar." description="Saídas novas sem regra aparecem aqui depois de cada leitura dos bancos." />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {groups.slice(0, VISIBLE_GROUPS).map((group) => (
            <QueueGroupCard key={group.key} group={group} categories={options} />
          ))}
        </ul>
      )}
      {groups.length > VISIBLE_GROUPS ? (
        <p className="m-0 text-[13px] text-text-secondary">Mais {groups.length - VISIBLE_GROUPS} grupos depois destes; eles aparecem conforme você resolve os de cima.</p>
      ) : null}
    </main>
  );
}

function BackLink() {
  return (
    <Link href="/transacoes" className="-ml-1 flex min-h-11 items-center gap-1 self-start text-[15px] text-accent no-underline">
      <Icon name="chevron-right" size={16} className="rotate-180" />
      Transações
    </Link>
  );
}

/** Saídas sem categoria × entradas sem stream. */
function KindTabs({ current, outflows, inflows }: { current: "saidas" | "entradas"; outflows: number; inflows: number }) {
  return (
    <nav aria-label="Tipo" className="flex gap-6">
      {(
        [
          ["saidas", `Saídas (${outflows})`, "/transacoes/revisar"],
          ["entradas", `Entradas (${inflows})`, "/transacoes/revisar?tipo=entradas"],
        ] as const
      ).map(([key, label, href]) => (
        <Link
          key={key}
          href={href}
          aria-current={current === key ? "page" : undefined}
          className={`flex min-h-11 flex-col items-start justify-center gap-1 text-[15px] no-underline ${current === key ? "font-semibold text-text-primary" : "text-text-secondary"}`}
        >
          {label}
          <span aria-hidden="true" className={`size-1 rounded-full ${current === key ? "bg-text-primary" : "bg-transparent"}`} />
        </Link>
      ))}
    </nav>
  );
}
