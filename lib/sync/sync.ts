import "server-only";
import type { ConnectionStatus, Scope, SyncTrigger } from "@/generated/prisma/enums";
import { addDays, todayLocal } from "@/lib/dates";
import { db } from "@/lib/db";
import { TRANSFER_WINDOW_DAYS } from "@/lib/finance/transfers";
import { fetchAccounts, fetchBills, fetchConsent, fetchItem, fetchTransactions, type PluggyItem } from "@/lib/pluggy/client";
import { toConnectionStatus } from "@/lib/pluggy/normalize";
import { applyRules } from "@/lib/rules/apply";
import { isGeminiConfigured } from "@/lib/ai/gemini";
import { ensureDefaultCategories } from "@/lib/rules/categories";
import { evaluateAlerts } from "@/lib/alerts/evaluate";
import { refreshRecurringSeries } from "@/lib/projection/recurring";
import { pushNewAlerts } from "@/lib/push/send";
import { ensureObligationReservations, refreshBucketBalances } from "@/lib/streams/ledger";
import { ensureStreamsSetup } from "@/lib/streams/setup";
import { suggestWithAi } from "@/lib/rules/suggest";
import { raiseConnectionAlerts } from "./alerts";
import { ingestTransactions, upsertAccount, upsertBills } from "./ingest";
import { syncInvestments } from "./investments";
import { detectTransfers } from "./transfers";

/** Cooldown do botão "Atualizar": só conta leitura MANUAL que trouxe dado novo do banco. */
export const MANUAL_REFRESH_COOLDOWN_MS = 6 * 60 * 60 * 1000;
// Sync parado há mais que isso é considerado morto (processo reiniciou no meio).
const STALE_RUN_MS = 15 * 60 * 1000;
// Leituras seguintes cobrem esta janela: pendentes que viram lançamento e lançamentos que chegam atrasados.
const INCREMENTAL_WINDOW_DAYS = 60;

export type SyncStats = {
  contas: number;
  novas: number;
  atualizadas: number;
  removidas: number;
  faturas: number;
  investimentos?: number;
  avisos: string[];
  /** A Pluggy leu o banco de novo desde a leitura anterior (item.lastUpdatedAt avançou). */
  bancoNovo?: boolean;
  /** Quando a Pluggy leu o banco pela última vez (ISO). */
  bancoLidoEm?: string | null;
};

export type ConnectionOutcome =
  | { connectionId: string; institutionName: string; ok: true; stats: SyncStats }
  | { connectionId: string; institutionName: string; ok: false; error: string };

export type UserSyncResult =
  | { status: "busy" }
  | { status: "done"; outcomes: ConnectionOutcome[]; transferencias: number; categorizadas: number };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type ConnectionRow = {
  id: string;
  userId: string;
  scope: Scope;
  pluggyItemId: string;
  institutionName: string;
  status: ConnectionStatus;
  lastSyncAt: Date | null;
};

/** Estado do item na Pluggy (status, consentimento) aplicado à conexão. */
async function refreshConnectionState(connection: ConnectionRow, previousStatus: ConnectionStatus | null, item: PluggyItem) {
  let consentExpiresAt = item.consentExpiresAt ? new Date(item.consentExpiresAt) : null;
  let revoked = false;
  try {
    const consent = await fetchConsent(connection.pluggyItemId);
    revoked = Boolean(consent?.revokedAt);
    if (!consentExpiresAt && consent?.expiresAt) consentExpiresAt = new Date(consent.expiresAt);
  } catch {
    // Nem todo conector expõe /consents; o item já traz o vencimento quando existe.
  }
  const status: ConnectionStatus = revoked ? "LOGIN_ERROR" : toConnectionStatus(item.status);
  const statusDetail = revoked
    ? "O consentimento foi revogado no banco."
    : (item.error?.message ?? (status === "UPDATED" ? null : (item.executionStatus ?? null)));

  await db().connection.update({
    where: { id: connection.id, userId: connection.userId },
    data: {
      status,
      statusDetail,
      connectorId: item.connector.id,
      institutionName: item.connector.name,
      institutionLogo: item.connector.imageUrl ?? null,
      consentExpiresAt,
      ...(item.lastUpdatedAt ? { lastSyncAt: new Date(item.lastUpdatedAt) } : {}),
    },
  });
  await raiseConnectionAlerts({
    userId: connection.userId,
    connectionId: connection.id,
    scope: connection.scope,
    institutionName: item.connector.name,
    previousStatus,
    status,
    statusDetail,
    consentExpiresAt,
  });
}

/** Lê item, contas, transações e faturas de uma conexão. Ler não dispara atualização no banco: não gasta cota. */
async function syncConnection(
  connection: ConnectionRow,
  trigger: SyncTrigger,
  previousStatus: ConnectionStatus | null,
): Promise<{ outcome: ConnectionOutcome; fullHistory: boolean }> {
  const run = await db().syncRun.create({
    data: { userId: connection.userId, connectionId: connection.id, trigger, status: "EM_ANDAMENTO" },
    select: { id: true },
  });
  const hadSuccess = await db().syncRun.findFirst({
    where: { connectionId: connection.id, status: "SUCESSO" },
    select: { id: true },
  });
  const dateFrom = hadSuccess ? addDays(todayLocal(), -INCREMENTAL_WINDOW_DAYS) : null;
  try {
    const item = await fetchItem(connection.pluggyItemId);
    await refreshConnectionState(connection, previousStatus, item);

    const bankReadAt = item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : null;
    const stats: SyncStats = {
      contas: 0,
      novas: 0,
      atualizadas: 0,
      removidas: 0,
      faturas: 0,
      avisos: [],
      bancoNovo: bankReadAt !== null && (connection.lastSyncAt === null || bankReadAt > connection.lastSyncAt),
      bancoLidoEm: bankReadAt?.toISOString() ?? null,
    };
    for (const wire of await fetchAccounts(connection.pluggyItemId)) {
      const account = await upsertAccount(connection, wire);
      if (!account) continue;
      stats.contas += 1;
      const transactions = await fetchTransactions(wire.id, dateFrom ?? undefined);
      const ingested = await ingestTransactions({ ...account, pluggyAccountId: wire.id }, transactions, dateFrom);
      stats.novas += ingested.novas;
      stats.atualizadas += ingested.atualizadas;
      stats.removidas += ingested.removidas;
      if (account.type === "CREDIT") {
        try {
          stats.faturas += await upsertBills(account, await fetchBills(wire.id));
        } catch (error) {
          stats.avisos.push(`Faturas de ${wire.name}: ${message(error)}`);
        }
      }
    }
    try {
      stats.investimentos = await syncInvestments(connection);
    } catch (error) {
      // Investimento é extra: o MeuPluggy pode não ter, e isso não derruba a leitura das contas.
      stats.avisos.push(`Investimentos: ${message(error)}`);
    }
    await db().syncRun.update({
      where: { id: run.id },
      data: { status: "SUCESSO", finishedAt: new Date(), stats },
    });
    return {
      outcome: { connectionId: connection.id, institutionName: item.connector.name, ok: true, stats },
      fullHistory: dateFrom === null,
    };
  } catch (error) {
    const text = message(error);
    await db().syncRun.update({ where: { id: run.id }, data: { status: "ERRO", finishedAt: new Date(), error: text } });
    return {
      outcome: { connectionId: connection.id, institutionName: connection.institutionName, ok: false, error: text },
      fullHistory: false,
    };
  }
}

/**
 * Sincroniza as conexões do usuário (ou só uma) e depois pareia transferências entre todas as contas dele,
 * porque uma transferência costuma atravessar duas conexões.
 */
export async function syncUser(
  userId: string,
  trigger: SyncTrigger,
  options: { connectionId?: string; isNewConnection?: boolean } = {},
): Promise<UserSyncResult> {
  const staleBefore = new Date(Date.now() - STALE_RUN_MS);
  await db().syncRun.updateMany({
    where: { userId, status: "EM_ANDAMENTO", startedAt: { lte: staleBefore } },
    data: { status: "ERRO", finishedAt: new Date(), error: "Interrompido antes de terminar." },
  });
  const running = await db().syncRun.findFirst({
    where: { userId, status: "EM_ANDAMENTO", startedAt: { gt: staleBefore } },
    select: { id: true },
  });
  if (running) return { status: "busy" };
  const startedAt = new Date();

  const connections = await db().connection.findMany({
    where: { userId, ...(options.connectionId ? { id: options.connectionId } : {}) },
    select: { id: true, userId: true, scope: true, pluggyItemId: true, institutionName: true, status: true, lastSyncAt: true },
    orderBy: { createdAt: "asc" },
  });
  const outcomes: ConnectionOutcome[] = [];
  let fullHistory = false;
  for (const connection of connections) {
    const previous = options.isNewConnection ? null : connection.status;
    const result = await syncConnection(connection, trigger, previous);
    outcomes.push(result.outcome);
    fullHistory ||= result.fullHistory;
  }
  const from = fullHistory ? null : addDays(todayLocal(), -(INCREMENTAL_WINDOW_DAYS + TRANSFER_WINDOW_DAYS));
  const anyOk = outcomes.some((outcome) => outcome.ok);
  const transferencias = anyOk ? await detectTransfers(userId, from) : 0;
  // Ordem importa: transferência primeiro (pareamento), depois as regras no que sobrou sem categoria.
  let categorizadas = 0;
  if (anyOk) {
    await ensureDefaultCategories(userId);
    await ensureStreamsSetup(userId);
    categorizadas = await applyRules(userId, "sem-categoria");
    await ensureObligationReservations(userId);
    // PENDING que sumiu da Pluggy leva os lançamentos de bucket junto (cascade): o saldo em cache é refeito.
    await refreshBucketBalances(userId);
    await refreshRecurringSeries(userId);
    if (isGeminiConfigured()) {
      try {
        await suggestWithAi(userId);
      } catch (error) {
        // Sugestão é conveniência: a fila continua funcionando sem ela.
        console.error("Sugestões da IA falharam:", error);
      }
    }
  }
  // Alertas no fim, com tudo já classificado. Os novos deste sync (inclusive erro de conexão) vão num push só.
  try {
    if (anyOk) await evaluateAlerts(userId, startedAt);
    await pushNewAlerts(userId, startedAt);
  } catch (error) {
    console.error("Alertas falharam:", error);
  }
  return { status: "done", outcomes, transferencias, categorizadas };
}

/**
 * Quando o botão "Atualizar" volta a ficar disponível (null = já está). Só trava depois de uma leitura que
 * trouxe dado novo do banco: ler de novo o que a Pluggy já tinha não gasta nada e não deve bloquear.
 */
export async function manualRefreshAvailableAt(userId: string, now: Date = new Date()): Promise<Date | null> {
  const last = await db().syncRun.findFirst({
    where: { userId, trigger: "MANUAL", status: "SUCESSO", stats: { path: ["bancoNovo"], equals: true } },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });
  if (!last) return null;
  const availableAt = new Date(last.startedAt.getTime() + MANUAL_REFRESH_COOLDOWN_MS);
  return availableAt > now ? availableAt : null;
}

export class ConnectionOwnershipError extends Error {}

/**
 * Registra um item da Pluggy como conexão do usuário. Item já registrado é reaproveitado (reconexão),
 * nunca duplicado: o pluggyItemId é único.
 */
export async function registerConnection(
  userId: string,
  itemId: string,
  scope: Scope,
): Promise<{ connectionId: string; created: boolean }> {
  const item = await fetchItem(itemId);
  const existing = await db().connection.findUnique({ where: { pluggyItemId: item.id }, select: { id: true, userId: true } });
  if (existing && existing.userId !== userId) throw new ConnectionOwnershipError("Este item já está ligado a outro usuário.");
  if (existing) return { connectionId: existing.id, created: false };
  const created = await db().connection.create({
    data: {
      userId,
      scope,
      pluggyItemId: item.id,
      connectorId: item.connector.id,
      institutionName: item.connector.name,
      institutionLogo: item.connector.imageUrl ?? null,
      status: "CREATED",
    },
    select: { id: true },
  });
  return { connectionId: created.id, created: true };
}
