"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { formatElapsed, formatMoment } from "@/lib/dates";
import { db } from "@/lib/db";
import { createConnectToken, isPluggyConfigured, isPluggyId, PluggyApiError, PluggyNotConfiguredError } from "@/lib/pluggy/client";
import { createRateLimiter } from "@/lib/security/rate-limit";
import { removeConnection } from "@/lib/sync/connections";
import { changeConnectionScope } from "@/lib/sync/scope";
import { ConnectionOwnershipError, manualRefreshAvailableAt, registerConnection, syncUser, type UserSyncResult } from "@/lib/sync/sync";

export type ActionState = { error?: string; notice?: string };

const tokenLimiter = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });
const registerLimiter = createRateLimiter({ limit: 20, windowMs: 60 * 60 * 1000 });
const refreshLimiter = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });

const NOT_CONFIGURED = "A Pluggy não está configurada: defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET nas variáveis do Railway.";

function describeError(error: unknown): string {
  if (error instanceof PluggyNotConfiguredError) return NOT_CONFIGURED;
  if (error instanceof ConnectionOwnershipError) return error.message;
  if (error instanceof PluggyApiError) {
    if (error.status === 404) return "A Pluggy não encontrou esse item. Confira o ID.";
    if (error.status === 401 || error.status === 403) return "A Pluggy recusou as credenciais (PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET).";
    return error.message;
  }
  console.error(error);
  return "Algo deu errado ao falar com a Pluggy. Tente de novo em instantes.";
}

function summarize(result: UserSyncResult): ActionState {
  if (result.status === "busy") return { error: "Já existe uma sincronização em andamento. Espere alguns minutos." };
  const failed = result.outcomes.filter((outcome) => !outcome.ok);
  if (failed.length > 0) {
    return { error: failed.map((outcome) => `${outcome.institutionName}: ${outcome.ok ? "" : outcome.error}`).join(" · ") };
  }
  const created = result.outcomes.reduce((sum, outcome) => sum + (outcome.ok ? outcome.stats.novas : 0), 0);
  if (created > 0) return { notice: `${created} ${created === 1 ? "transação nova" : "transações novas"}.` };
  // Banco que a Pluggy não leu de novo não está "em dia": é o Meu Pluggy que ainda não atualizou. Diz qual e quando.
  const stale = result.outcomes.flatMap((outcome) =>
    outcome.ok && !outcome.stats.bancoNovo && outcome.stats.bancoLidoEm
      ? [`${outcome.institutionName}, lido ${formatElapsed(new Date(outcome.stats.bancoLidoEm))}`]
      : [],
  );
  if (stale.length > 0) {
    return {
      notice: `Nada novo. Sem leitura nova do banco: ${stale.join("; ")}. O Meu Pluggy atualiza sozinho; para puxar agora, atualize em meu.pluggy.ai e toque em Atualizar de novo.`,
    };
  }
  return { notice: "Tudo em dia: nenhuma transação nova." };
}

/** Token para o widget Pluggy Connect. Com `connectionId`, abre o widget no modo de atualizar aquele item. */
export async function connectTokenAction(connectionId?: string): Promise<{ token: string; updateItem?: string } | { error: string }> {
  const user = await requireUser();
  if (!tokenLimiter.hit(user.id).allowed) return { error: "Muitas tentativas. Espere um pouco antes de abrir de novo." };
  let updateItem: string | undefined;
  if (connectionId) {
    const connection = await db().connection.findFirst({ where: { id: connectionId, userId: user.id }, select: { pluggyItemId: true } });
    if (!connection) return { error: "Conexão não encontrada." };
    updateItem = connection.pluggyItemId;
  }
  try {
    return { token: await createConnectToken({ clientUserId: user.id, itemId: updateItem }), updateItem };
  } catch (error) {
    return { error: describeError(error) };
  }
}

const registerInput = z.object({
  itemId: z.string().trim().refine(isPluggyId, "O ID do item tem o formato 1a2b3c4d-…, como aparece no painel da Pluggy."),
  scope: z.enum(["PF", "PJ"]),
});

/** Liga um item da Pluggy ao usuário (ou reaproveita, se já existe) e faz a primeira leitura. */
export async function registerConnectionAction(input: { itemId: string; scope: string }): Promise<ActionState> {
  const user = await requireUser();
  const parsed = registerInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  if (!registerLimiter.hit(user.id).allowed) return { error: "Muitas tentativas. Espere um pouco." };
  try {
    const { connectionId, created } = await registerConnection(user.id, parsed.data.itemId, parsed.data.scope);
    const result = await syncUser(user.id, "CONEXAO", { connectionId, isNewConnection: created });
    revalidatePath("/", "layout");
    const state = summarize(result);
    return state.error ? state : { notice: created ? "Banco conectado. Saldo e transações já estão na tela Hoje." : "Conexão atualizada." };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function registerConnectionFormAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return registerConnectionAction({ itemId: String(formData.get("itemId") ?? ""), scope: String(formData.get("scope") ?? "") });
}

/**
 * Remove a conexão daqui com as contas e transações dela (ex.: o mesmo banco conectado duas vezes). O cartão
 * da conexão some da tela, então o resultado volta pela URL de Config.
 */
export async function removeConnectionAction(connectionId: string): Promise<ActionState> {
  const user = await requireUser();
  if (typeof connectionId !== "string" || !connectionId) return { error: "Conexão inválida." };
  let removed: Awaited<ReturnType<typeof removeConnection>>;
  try {
    removed = await removeConnection(user.id, connectionId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível remover a conexão." };
  }
  revalidatePath("/", "layout");
  redirect(`/config?${new URLSearchParams({ removida: removed.institutionName, contas: String(removed.accounts), lancamentos: String(removed.transactions) })}`);
}

const scopeInput = z.object({ connectionId: z.string().min(1), scope: z.enum(["PF", "PJ"]) });

/** Corrige o escopo de uma conexão (ex.: conta PF conectada como PJ), com contas e transações. */
export async function changeConnectionScopeAction(input: { connectionId: string; scope: string }): Promise<ActionState> {
  const user = await requireUser();
  const parsed = scopeInput.safeParse(input);
  if (!parsed.success) return { error: "Escopo inválido." };
  try {
    const { changed } = await changeConnectionScope(user.id, parsed.data.connectionId, parsed.data.scope);
    revalidatePath("/", "layout");
    return { notice: changed ? `Movida para ${parsed.data.scope}, com contas e transações.` : "Nada mudou." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível mudar o escopo." };
  }
}

/** Botão "Atualizar": lê de novo tudo que a Pluggy tem. Cooldown de 6h só depois de uma leitura com dado novo do banco. */
export async function refreshAction(): Promise<ActionState> {
  const user = await requireUser();
  if (!isPluggyConfigured()) return { error: NOT_CONFIGURED };
  const availableAt = await manualRefreshAvailableAt(user.id);
  if (availableAt) return { error: `Próxima atualização liberada ${formatMoment(availableAt)}.` };
  if (!refreshLimiter.hit(user.id).allowed) return { error: "Muitas tentativas seguidas. Espere um pouco." };
  try {
    const result = await syncUser(user.id, "MANUAL");
    revalidatePath("/", "layout");
    return summarize(result);
  } catch (error) {
    return { error: describeError(error) };
  }
}
