import "server-only";
import { cleanDescription } from "@/lib/categorization/clean";
import { DEFAULT_CATEGORIES } from "@/lib/categorization/defaults";
import { db } from "@/lib/db";
import { ensureTransferCategory } from "@/lib/sync/transfers";

const BACKFILL_BATCH = 200;

/**
 * Cria a árvore inicial de categorias na primeira vez (e só nela) e, junto, limpa as descrições
 * das transações que vieram antes da limpeza existir. Seguro com chamadas simultâneas (lock por usuário).
 */
export async function ensureDefaultCategories(userId: string): Promise<boolean> {
  const existing = await db().category.count({ where: { userId, kind: { not: "TRANSFERENCIA" } } });
  if (existing > 0) return false;

  const created = await db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`categorias:${userId}`}))`;
    if ((await tx.category.count({ where: { userId, kind: { not: "TRANSFERENCIA" } } })) > 0) return false;
    for (const category of DEFAULT_CATEGORIES) {
      const parent = await tx.category.create({
        data: { userId, name: category.name, icon: category.icon, color: "neutral", kind: category.kind },
        select: { id: true },
      });
      if (category.children?.length) {
        await tx.category.createMany({
          data: category.children.map((name) => ({ userId, parentId: parent.id, name, icon: category.icon, color: "neutral", kind: category.kind })),
        });
      }
    }
    return true;
  });
  await ensureTransferCategory(userId);
  if (created) await backfillCleanDescriptions(userId);
  return created;
}

async function backfillCleanDescriptions(userId: string): Promise<void> {
  const rows = await db().transaction.findMany({ where: { userId }, select: { id: true, descriptionClean: true } });
  const changed = rows
    .map((row) => ({ id: row.id, clean: cleanDescription(row.descriptionClean) }))
    .filter((row, index) => row.clean !== rows[index]?.descriptionClean);
  for (let start = 0; start < changed.length; start += BACKFILL_BATCH) {
    await db().$transaction(
      changed
        .slice(start, start + BACKFILL_BATCH)
        .map((row) => db().transaction.update({ where: { id: row.id, userId }, data: { descriptionClean: row.clean } })),
    );
  }
}

/** Categorias do usuário em árvore, para selects e telas. Transferências por último. */
export async function getCategoryTree(userId: string) {
  const categories = await db().category.findMany({
    where: { userId },
    select: { id: true, name: true, icon: true, kind: true, parentId: true },
    orderBy: [{ name: "asc" }],
  });
  const parents = categories.filter((category) => category.parentId === null);
  const tree = parents
    .map((parent) => ({ ...parent, children: categories.filter((child) => child.parentId === parent.id) }))
    .sort((a, b) => Number(a.kind === "TRANSFERENCIA") - Number(b.kind === "TRANSFERENCIA") || a.name.localeCompare(b.name, "pt-BR"));
  return tree;
}

export type CategoryTree = Awaited<ReturnType<typeof getCategoryTree>>;

/** Lista plana para selects: "Alimentação fora", "Alimentação fora › Delivery", … */
export function categoryOptions(tree: CategoryTree): { id: string; name: string }[] {
  return tree.flatMap((parent) => [
    { id: parent.id, name: parent.name },
    ...parent.children.map((child) => ({ id: child.id, name: `${parent.name} › ${child.name}` })),
  ]);
}
