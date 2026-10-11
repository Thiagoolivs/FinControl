"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { parseCents, parsePercentBps } from "@/lib/finance/money";
import { ASSET_CLASSES, type AssetClassKey } from "@/lib/finance/portfolio";
import { addManualHolding, deleteManualHolding, setTargets, updateManualHolding } from "@/lib/portfolio/mutations";
import { describeRuleError } from "@/lib/rules/action-error";
import type { ActionState } from "../actions";

/** "0,5" / "1.234,5" / "0.5" / "100" → texto decimal com ponto (até 10 casas). Com vírgula, ponto é milhar. */
function parseQuantity(text: string): string | null {
  const trimmed = text.trim();
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  return /^\d+(\.\d{1,10})?$/.test(normalized) && Number(normalized) > 0 ? normalized : null;
}

export async function setTargetsAction(input: Record<string, string>): Promise<ActionState> {
  const user = await requireUser();
  const targets: Partial<Record<AssetClassKey, number>> = {};
  for (const assetClass of ASSET_CLASSES) {
    const bps = parsePercentBps(input[assetClass] || "0");
    if (bps === null) return { error: "Use percentuais como 30 ou 12,5." };
    targets[assetClass] = bps;
  }
  try {
    await setTargets(user.id, targets);
    revalidatePath("/carteira");
    return { notice: "Alocação-alvo salva." };
  } catch (error) {
    return { error: describeRuleError(error) };
  }
}

const holdingInput = z.object({
  assetClass: z.enum(["ACAO", "FII", "RENDA_FIXA", "CRIPTO", "FUNDO"]),
  name: z.string().max(80),
  ticker: z.string().max(12),
  quantity: z.string().max(30),
  cost: z.string().max(30),
  value: z.string().max(30),
  scope: z.enum(["PF", "PJ"]),
});

export async function addHoldingAction(raw: z.input<typeof holdingInput>): Promise<ActionState> {
  const user = await requireUser();
  const parsed = holdingInput.safeParse(raw);
  if (!parsed.success) return { error: "Dados inválidos." };
  const input = parsed.data;
  const quantity = parseQuantity(input.quantity);
  const costCents = parseCents(input.cost);
  const valueCents = input.value.trim() ? parseCents(input.value) : null;
  if (!quantity) return { error: "Quantidade inválida. Ex.: 100 ou 0,5" };
  if (costCents === null || costCents < 0) return { error: "Custo inválido. Ex.: 3.000,00" };
  if (input.value.trim() && (valueCents === null || valueCents < 0)) return { error: "Valor de hoje inválido." };
  try {
    const result = await addManualHolding(user.id, {
      assetClass: input.assetClass,
      name: input.name,
      ticker: input.ticker || null,
      quantity,
      costCents,
      currentValueCents: valueCents,
      scope: input.scope,
    });
    revalidatePath("/carteira");
    return result.quoteError
      ? { notice: `Posição adicionada. A cotação não veio agora (${result.quoteError}); tenta de novo na próxima leitura.` }
      : { notice: "Posição adicionada." };
  } catch (error) {
    return { error: describeRuleError(error) };
  }
}

export async function updateHoldingAction(input: { id: string; quantity: string; cost: string; value: string }): Promise<ActionState> {
  const user = await requireUser();
  const quantity = parseQuantity(input.quantity);
  const costCents = parseCents(input.cost);
  const valueCents = input.value.trim() ? parseCents(input.value) : null;
  if (!quantity || costCents === null || costCents < 0) return { error: "Quantidade ou custo inválido." };
  try {
    await updateManualHolding(user.id, input.id, { quantity, costCents, currentValueCents: valueCents });
    revalidatePath("/carteira");
    return { notice: "Posição salva." };
  } catch (error) {
    return { error: describeRuleError(error) };
  }
}

export async function deleteHoldingAction(id: string): Promise<ActionState> {
  const user = await requireUser();
  try {
    await deleteManualHolding(user.id, id);
    revalidatePath("/carteira");
    return { notice: "Posição removida." };
  } catch (error) {
    return { error: describeRuleError(error) };
  }
}
