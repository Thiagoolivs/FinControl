import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { categoryOptions, getCategoryTree } from "@/lib/rules/categories";
import { destinationOptions, prepareStreams } from "@/lib/streams/queries";
import { PAGE_CLASS } from "../../../page-header";
import { DeleteRule, RuleForm } from "../rule-form";

export default async function EditRulePage({ params }: PageProps<"/config/regras/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const rule = await db().rule.findFirst({ where: { id, userId: user.id } });
  if (!rule) notFound();
  await prepareStreams(user.id);
  const [tree, options, sample] = await Promise.all([
    getCategoryTree(user.id),
    destinationOptions(user.id),
    db().transaction.findFirst({ where: { userId: user.id, ruleId: rule.id }, select: { descriptionRaw: true }, orderBy: { date: "desc" } }),
  ]);

  return (
    <main className={PAGE_CLASS}>
      <Link href="/config/regras" className="-ml-1 flex min-h-11 items-center gap-1 self-start text-[15px] text-accent no-underline">
        <Icon name="chevron-right" size={16} className="rotate-180" />
        Regras
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[34px] font-light leading-10 tracking-[-0.03em]">Editar regra</h1>
        <p className="m-0 text-[13px] text-text-secondary">
          Categoriza {rule.hitCount} {rule.hitCount === 1 ? "transação" : "transações"}. Salvar refaz o que ela categoriza.
        </p>
      </div>
      <RuleForm
        ruleId={rule.id}
        categories={categoryOptions(tree)}
        streams={options.streams}
        buckets={options.buckets}
        sampleDescription={sample?.descriptionRaw}
        initialValue={{
          pattern: rule.pattern,
          matchType: rule.matchType,
          direction: rule.direction,
          scope: rule.scope ?? "AMBOS",
          categoryId: rule.categoryId ?? "",
          revenueStreamId: rule.revenueStreamId ?? "",
          bucketId: rule.bucketId ?? "",
          priority: rule.priority,
        }}
      />
      <DeleteRule ruleId={rule.id} hitCount={rule.hitCount} />
    </main>
  );
}
