import Link from "next/link";
import { Icon, isIconName } from "@/components/ui/icon";
import { Eyebrow } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/dal";
import { CATEGORY_KIND_LABEL } from "@/lib/categorization/defaults";
import { db } from "@/lib/db";
import { ensureDefaultCategories, getCategoryTree } from "@/lib/rules/categories";
import { PAGE_CLASS } from "../../page-header";
import { CategoryRow, NewCategoryForm } from "./category-controls";

export default async function CategoriesPage() {
  const user = await requireUser();
  await ensureDefaultCategories(user.id);
  const [tree, transactionCounts, ruleCounts] = await Promise.all([
    getCategoryTree(user.id),
    db().transaction.groupBy({ by: ["categoryId"], where: { userId: user.id, categoryId: { not: null } }, _count: { _all: true } }),
    db().rule.groupBy({ by: ["categoryId"], where: { userId: user.id, categoryId: { not: null } }, _count: { _all: true } }),
  ]);
  const txOf = new Map(transactionCounts.map((row) => [row.categoryId, row._count._all]));
  const rulesOf = new Map(ruleCounts.map((row) => [row.categoryId, row._count._all]));
  const usage = (ids: string[]) => ({
    transactions: ids.reduce((sum, id) => sum + (txOf.get(id) ?? 0), 0),
    rules: ids.reduce((sum, id) => sum + (rulesOf.get(id) ?? 0), 0),
  });

  return (
    <main className={PAGE_CLASS}>
      <Link href="/config" className="-ml-1 flex min-h-11 items-center gap-1 self-start text-[15px] text-accent no-underline">
        <Icon name="chevron-right" size={16} className="rotate-180" />
        Config
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[34px] font-light leading-10 tracking-[-0.03em]">Categorias</h1>
        <p className="m-0 text-[13px] text-text-secondary">Duas camadas no máximo. O número é quantas transações usam cada uma.</p>
      </div>

      <ul className="m-0 flex list-none flex-col gap-5 p-0">
        {tree.map((parent) => (
          <li key={parent.id} className="flex flex-col">
            <div className="flex items-center gap-3">
              <Icon name={isIconName(parent.icon) ? parent.icon : "dots"} size={18} className="shrink-0 text-text-secondary" />
              <div className="min-w-0 flex-1">
                <CategoryRow
                  id={parent.id}
                  name={parent.name}
                  usage={usage([parent.id, ...parent.children.map((child) => child.id)])}
                  locked={parent.kind === "TRANSFERENCIA"}
                  nested={false}
                />
              </div>
            </div>
            <span className="pl-[30px] text-[12px] text-text-secondary">{CATEGORY_KIND_LABEL[parent.kind]}</span>
            {parent.children.length > 0 ? (
              <ul className="m-0 mt-1 flex list-none flex-col p-0 pl-[30px]">
                {parent.children.map((child) => (
                  <li key={child.id}>
                    <CategoryRow id={child.id} name={child.name} usage={usage([child.id])} locked={false} nested />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      <section aria-labelledby="nova-categoria" className="flex flex-col gap-3">
        <Eyebrow as="h2" id="nova-categoria">
          Nova categoria
        </Eyebrow>
        <NewCategoryForm parents={tree.filter((parent) => parent.kind !== "TRANSFERENCIA").map((parent) => ({ id: parent.id, name: parent.name }))} />
      </section>
    </main>
  );
}
