import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { requireUser } from "@/lib/auth/dal";
import { suggestedPattern } from "@/lib/categorization/queue";
import { db } from "@/lib/db";
import { categoryOptions, ensureDefaultCategories, getCategoryTree } from "@/lib/rules/categories";
import { destinationOptions, prepareStreams } from "@/lib/streams/queries";
import { PAGE_CLASS } from "../../../page-header";
import { RuleForm } from "../rule-form";

export default async function NewRulePage({ searchParams }: PageProps<"/config/regras/nova">) {
  const user = await requireUser();
  await ensureDefaultCategories(user.id);
  await prepareStreams(user.id);
  const from = (await searchParams).de;
  const source =
    typeof from === "string"
      ? await db().transaction.findFirst({
          where: { id: from, userId: user.id },
          select: { descriptionClean: true, descriptionRaw: true, categoryId: true, revenueStreamId: true, amountCents: true },
        })
      : null;
  const [tree, options] = await Promise.all([getCategoryTree(user.id), destinationOptions(user.id)]);
  const suggested = source ? suggestedPattern([source.descriptionClean]) : null;

  return (
    <main className={PAGE_CLASS}>
      <Link href="/config/regras" className="-ml-1 flex min-h-11 items-center gap-1 self-start text-[15px] text-accent no-underline">
        <Icon name="chevron-right" size={16} className="rotate-180" />
        Regras
      </Link>
      <h1 className="m-0 text-[34px] font-light leading-10 tracking-[-0.03em]">Nova regra</h1>
      <RuleForm
        ruleId={null}
        categories={categoryOptions(tree)}
        streams={options.streams}
        buckets={options.buckets}
        sampleDescription={source?.descriptionRaw}
        initialValue={
          suggested
            ? {
                pattern: suggested.pattern,
                matchType: suggested.matchType,
                direction: source && source.amountCents > 0 ? "ENTRADA" : "SAIDA",
                categoryId: source?.categoryId ?? "",
                revenueStreamId: source?.revenueStreamId ?? "",
              }
            : undefined
        }
      />
    </main>
  );
}
