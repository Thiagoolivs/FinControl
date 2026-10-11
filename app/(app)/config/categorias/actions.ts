"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { isIconName } from "@/components/ui/icon";
import { describeRuleError } from "@/lib/rules/action-error";
import { createCategory, deleteCategory, renameCategory } from "@/lib/rules/mutations";
import type { ActionState } from "../../actions";

const createInput = z.object({
  name: z.string().trim().min(1, "Dê um nome à categoria.").max(60),
  parentId: z.string().nullable(),
  kind: z.enum(["ESSENCIAL", "VARIAVEL", "INVESTIMENTO", "RECEITA"]),
  icon: z.string().refine(isIconName, "Ícone inválido."),
});

export async function createCategoryAction(input: z.input<typeof createInput>): Promise<ActionState> {
  const user = await requireUser();
  const parsed = createInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  try {
    await createCategory(user.id, parsed.data);
    revalidatePath("/", "layout");
    return { notice: "Categoria criada." };
  } catch (error) {
    return { error: describeRuleError(error) };
  }
}

export async function renameCategoryAction(input: { id: string; name: string }): Promise<ActionState> {
  const user = await requireUser();
  try {
    await renameCategory(user.id, input.id, input.name.slice(0, 60));
    revalidatePath("/", "layout");
    return { notice: "Renomeada." };
  } catch (error) {
    return { error: describeRuleError(error) };
  }
}

export async function deleteCategoryAction(id: string): Promise<ActionState> {
  const user = await requireUser();
  try {
    await deleteCategory(user.id, id);
    revalidatePath("/", "layout");
    return { notice: "Categoria apagada." };
  } catch (error) {
    return { error: describeRuleError(error) };
  }
}
