import "server-only";
import type { CategoryKind } from "@/generated/prisma/enums";
import { DEFAULT_CATEGORIES } from "@/lib/categorization/defaults";
import { db } from "@/lib/db";
import { ensureTransferCategory } from "@/lib/sync/transfers";
import { recleanDescriptions } from "./reclean";

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
  if (created) await recleanDescriptions(userId);
  return created;
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

/**
 * Lista plana para selects: "Alimentação fora", "Alimentação fora › Delivery", …
 * `gasto` deixa de fora as categorias de entrada; `entrada`, só elas.
 */
export function categoryOptions(tree: CategoryTree, only?: "gasto" | "entrada"): { id: string; name: string }[] {
  const keep = (kind: CategoryKind) => (only === "gasto" ? kind !== "RECEITA" : only === "entrada" ? kind === "RECEITA" : true);
  return tree.filter((parent) => keep(parent.kind)).flatMap((parent) => [
    { id: parent.id, name: parent.name },
    ...parent.children.map((child) => ({ id: child.id, name: `${parent.name} › ${child.name}` })),
  ]);
}
