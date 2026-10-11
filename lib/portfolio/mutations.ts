import "server-only";
import type { AssetClass, Scope } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { assertCents } from "@/lib/finance/money";
import { ASSET_CLASSES, averagePriceCents, MARKET_PRICED, targetsError } from "@/lib/finance/portfolio";
import { refreshQuote } from "@/lib/market/refresh";
import { RuleInputError } from "@/lib/rules/mutations";

/** Alocação-alvo: uma linha por classe, soma 100%. É sua; o app só mede o desvio dela. */
export async function setTargets(userId: string, targets: Partial<Record<AssetClass, number>>): Promise<void> {
  const error = targetsError(targets);
  if (error) throw new RuleInputError(error);
  await db().$transaction(
    ASSET_CLASSES.map((assetClass) =>
      db().allocationTarget.upsert({
        where: { userId_assetClass: { userId, assetClass } },
        create: { userId, assetClass, targetBps: targets[assetClass] ?? 0 },
        update: { targetBps: targets[assetClass] ?? 0 },
      }),
    ),
  );
}

/** Conta "Carteira manual" do escopo, criada na primeira posição manual. Fica fora dos totais. */
async function manualAccount(userId: string, scope: Scope): Promise<string> {
  const existing = await db().account.findFirst({ where: { userId, scope, type: "INVESTMENT", connectionId: null, pluggyAccountId: null }, select: { id: true } });
  if (existing) return existing.id;
  const created = await db().account.create({
    data: { userId, scope, type: "INVESTMENT", name: scope === "PJ" ? "Carteira manual PJ" : "Carteira manual", balanceCents: 0, includeInTotals: false },
    select: { id: true },
  });
  return created.id;
}

export type ManualHoldingInput = {
  assetClass: AssetClass;
  name: string;
  ticker: string | null;
  quantity: string;
  costCents: number;
  /** Renda fixa e fundo: valor de hoje informado por você. Ação/FII/cripto usam cotação. */
  currentValueCents: number | null;
  scope: Scope;
};

function validate(input: ManualHoldingInput) {
  const name = input.name.trim();
  if (!name) throw new RuleInputError("Dê um nome à posição.");
  if (!/^\d+(\.\d{1,10})?$/.test(input.quantity) || Number(input.quantity) <= 0) throw new RuleInputError("Quantidade inválida. Ex.: 100 ou 0,5");
  assertCents(input.costCents);
  if (input.costCents < 0) throw new RuleInputError("Custo inválido.");
  const ticker = MARKET_PRICED.includes(input.assetClass) ? (input.ticker?.trim().toUpperCase() ?? "") : "";
  if (MARKET_PRICED.includes(input.assetClass) && !/^[A-Z0-9]{2,12}$/.test(ticker)) throw new RuleInputError("Informe o ticker. Ex.: PETR4, HGLG11, BTC");
  return { name: name.slice(0, 80), ticker: ticker || null };
}

export async function addManualHolding(userId: string, input: ManualHoldingInput): Promise<{ quoteError: string | null }> {
  const { name, ticker } = validate(input);
  await db().holding.create({
    data: {
      userId,
      accountId: await manualAccount(userId, input.scope),
      name,
      ticker,
      assetClass: input.assetClass,
      origin: "MANUAL",
      quantity: input.quantity,
      costCents: input.costCents,
      avgPriceCents: averagePriceCents(input.costCents, input.quantity),
      currentValueCents: ticker ? null : input.currentValueCents,
      valueUpdatedAt: new Date(),
    },
  });
  if (!ticker) return { quoteError: null };
  // Ação: a cotação vem agora (numa ação do servidor, não no render), para a tela já mostrar o valor.
  try {
    await refreshQuote(input.assetClass, ticker);
    return { quoteError: null };
  } catch (error) {
    return { quoteError: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateManualHolding(userId: string, id: string, input: { quantity: string; costCents: number; currentValueCents: number | null }): Promise<void> {
  const holding = await db().holding.findFirst({ where: { id, userId, origin: "MANUAL" }, select: { assetClass: true, name: true, ticker: true, account: { select: { scope: true } } } });
  if (!holding) throw new RuleInputError("Posição manual não encontrada.");
  validate({ ...holding, ...input, scope: holding.account.scope });
  await db().holding.updateMany({
    where: { id, userId, origin: "MANUAL" },
    data: {
      quantity: input.quantity,
      costCents: input.costCents,
      avgPriceCents: averagePriceCents(input.costCents, input.quantity),
      currentValueCents: holding.ticker ? null : input.currentValueCents,
      valueUpdatedAt: new Date(),
    },
  });
}

/** Só posição manual sai por aqui; a da Pluggy segue o banco. */
export async function deleteManualHolding(userId: string, id: string): Promise<void> {
  const deleted = await db().holding.deleteMany({ where: { id, userId, origin: "MANUAL" } });
  if (deleted.count === 0) throw new RuleInputError("Posição manual não encontrada.");
}
