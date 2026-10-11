import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { ScopeTag, Tag } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { PAGE_CLASS } from "../../page-header";
import { RuleRowControls } from "./rule-row-controls";

const MATCH_LABEL = { PREFIX: "começa com", CONTAINS: "contém", REGEX: "regex" } as const;
const DIRECTION_LABEL = { AMBAS: null, ENTRADA: "só entradas", SAIDA: "só saídas" } as const;

export default async function RulesPage() {
  const user = await requireUser();
  const rules = await db().rule.findMany({
    where: { userId: user.id },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      pattern: true,
      matchType: true,
      direction: true,
      scope: true,
      active: true,
      hitCount: true,
      origin: true,
      category: { select: { name: true, parent: { select: { name: true } } } },
    },
  });

  return (
    <main className={PAGE_CLASS}>
      <Link href="/config" className="-ml-1 flex min-h-11 items-center gap-1 self-start text-[15px] text-accent no-underline">
        <Icon name="chevron-right" size={16} className="rotate-180" />
        Config
      </Link>
      <header className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[34px] font-light leading-10 tracking-[-0.03em]">Regras</h1>
          <p className="m-0 text-[13px] text-text-secondary">Avaliadas de cima para baixo; a primeira que casa decide.</p>
        </div>
        <Link href="/config/regras/nova" className="flex h-11 shrink-0 items-center rounded-button bg-accent-fill px-4 text-[15px] font-medium text-white no-underline">
          Nova
        </Link>
      </header>

      {rules.length === 0 ? (
        <EmptyState compact title="Nenhuma regra ainda." description="Elas nascem na fila de revisão, ou aqui em Nova." />
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {rules.map((rule, index) => (
            <li key={rule.id} className={`flex items-center gap-2 py-2 ${rule.active ? "" : "opacity-50"}`}>
              <Link href={`/config/regras/${rule.id}`} className="flex min-h-11 min-w-0 flex-1 flex-col gap-[3px] text-text-primary no-underline">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-mono text-[15px]">{rule.pattern}</span>
                  {rule.scope ? <ScopeTag scope={rule.scope} /> : null}
                  {rule.origin === "IA_CONFIRMADA" ? <Tag>IA</Tag> : null}
                </span>
                <span className="truncate text-[13px] text-text-secondary">
                  {[
                    MATCH_LABEL[rule.matchType],
                    DIRECTION_LABEL[rule.direction],
                    rule.category ? (rule.category.parent ? `${rule.category.parent.name} › ${rule.category.name}` : rule.category.name) : "sem categoria",
                    `${rule.hitCount} ${rule.hitCount === 1 ? "transação" : "transações"}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
              <RuleRowControls id={rule.id} active={rule.active} first={index === 0} last={index === rules.length - 1} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
