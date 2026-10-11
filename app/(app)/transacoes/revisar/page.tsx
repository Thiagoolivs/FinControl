import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Eyebrow } from "@/components/ui/text";
import { isGeminiConfigured } from "@/lib/ai/gemini";
import { requireUser } from "@/lib/auth/dal";
import { categoryOptions, ensureDefaultCategories, getCategoryTree } from "@/lib/rules/categories";
import { getReviewQueue } from "@/lib/rules/queue";
import { PAGE_CLASS } from "../../page-header";
import { QueueGroupCard } from "./group-card";
import { SuggestButton } from "./suggest-button";

const VISIBLE_GROUPS = 30;

export default async function ReviewPage() {
  const user = await requireUser();
  await ensureDefaultCategories(user.id);
  const [queue, tree] = await Promise.all([getReviewQueue(user.id), getCategoryTree(user.id)]);
  const total = queue.reduce((sum, group) => sum + group.transactions.length, 0);
  const options = categoryOptions(tree);
  const ai = isGeminiConfigured();
  const withoutSuggestion = queue.some((group) => group.suggestion === null);

  return (
    <main className={PAGE_CLASS}>
      <Link href="/transacoes" className="-ml-1 flex min-h-11 items-center gap-1 self-start text-[15px] text-accent no-underline">
        <Icon name="chevron-right" size={16} className="rotate-180" />
        Transações
      </Link>

      <header className="flex flex-col gap-2">
        <Eyebrow as="p">Fila de revisão</Eyebrow>
        <h1 className="m-0 text-[34px] font-light leading-10 tracking-[-0.03em]">
          {total === 0 ? "Tudo categorizado" : `${total} ${total === 1 ? "saída" : "saídas"} sem categoria`}
        </h1>
        {total > 0 ? (
          <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
            Agrupadas por loja. Ao criar a regra, as próximas com o mesmo padrão já chegam categorizadas.
          </p>
        ) : null}
      </header>

      {total > 0 && ai && withoutSuggestion ? (
        <div className="flex flex-col gap-2">
          <SuggestButton />
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

      {queue.length === 0 ? (
        <EmptyState title="Nada para revisar." description="Saídas novas sem regra aparecem aqui depois de cada leitura dos bancos." />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {queue.slice(0, VISIBLE_GROUPS).map((group) => (
            <QueueGroupCard key={group.key} group={group} categories={options} />
          ))}
        </ul>
      )}
      {queue.length > VISIBLE_GROUPS ? (
        <p className="m-0 text-[13px] text-text-secondary">Mais {queue.length - VISIBLE_GROUPS} grupos depois destes.</p>
      ) : null}
    </main>
  );
}
