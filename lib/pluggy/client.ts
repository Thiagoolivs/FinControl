import "server-only";
import { z } from "zod";
import { serverEnv } from "@/lib/env";

const DEFAULT_BASE_URL = "https://api.pluggy.ai";
const REQUEST_TIMEOUT_MS = 30_000;
// A apiKey vale 2h; renova com folga para não estourar no meio de um sync.
const API_KEY_TTL_MS = 100 * 60 * 1000;
const MAX_RATE_LIMIT_RETRIES = 2;

export class PluggyNotConfiguredError extends Error {
  constructor() {
    super("PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET não definidas.");
  }
}

export class PluggyApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
  }
}

// Esquemas tolerantes: campo novo da Pluggy é ignorado; campo que lemos e sumiu quebra o parse.
const authResponse = z.object({ apiKey: z.string().min(1) });
const connectTokenResponse = z.object({ accessToken: z.string().min(1) });
const errorBody = z.object({ code: z.union([z.number(), z.string()]).nullish(), codeDescription: z.string().nullish(), message: z.string().nullish() });

const item = z.object({
  id: z.string().min(1),
  connector: z.object({ id: z.number().int(), name: z.string(), imageUrl: z.string().nullish() }),
  status: z.string(),
  executionStatus: z.string().nullish(),
  lastUpdatedAt: z.string().nullish(),
  consentExpiresAt: z.string().nullish(),
  clientUserId: z.string().nullish(),
  error: z.object({ code: z.string().nullish(), message: z.string().nullish() }).nullish(),
});

const account = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  type: z.string(),
  subtype: z.string().nullish(),
  name: z.string(),
  marketingName: z.string().nullish(),
  number: z.string().nullish(),
  balance: z.number(),
  currencyCode: z.string(),
  creditData: z.object({ availableCreditLimit: z.number().nullish(), creditLimit: z.number().nullish() }).nullish(),
});

const transaction = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  date: z.string(),
  description: z.string(),
  descriptionRaw: z.string().nullish(),
  amount: z.number(),
  amountInAccountCurrency: z.number().nullish(),
  category: z.string().nullish(),
  status: z.string().nullish(),
  creditCardMetadata: z
    .object({ installmentNumber: z.number().int().nullish(), totalInstallments: z.number().int().nullish() })
    .nullish(),
});

const bill = z.object({
  id: z.string().min(1),
  dueDate: z.string(),
  totalAmount: z.number(),
  minimumPaymentAmount: z.number().nullish(),
});

const consent = z.object({ expiresAt: z.string().nullish(), revokedAt: z.string().nullish() });

const page = <T extends z.ZodType>(entry: T) =>
  z.object({ results: z.array(entry), page: z.number().int(), totalPages: z.number().int() });
const cursorPage = <T extends z.ZodType>(entry: T) => z.object({ results: z.array(entry), next: z.string().nullable() });

export type PluggyItem = z.infer<typeof item>;
export type PluggyAccount = z.infer<typeof account>;
export type PluggyTransaction = z.infer<typeof transaction>;
export type PluggyBill = z.infer<typeof bill>;
export type PluggyConsent = z.infer<typeof consent>;

const PLUGGY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** IDs da Pluggy são UUIDs; qualquer outra coisa nem chega à API. */
export function isPluggyId(value: string): boolean {
  return PLUGGY_ID.test(value);
}

function config(): { baseUrl: string; clientId: string; clientSecret: string } {
  const env = serverEnv();
  if (!env.PLUGGY_CLIENT_ID || !env.PLUGGY_CLIENT_SECRET) throw new PluggyNotConfiguredError();
  return { baseUrl: env.PLUGGY_API_URL ?? DEFAULT_BASE_URL, clientId: env.PLUGGY_CLIENT_ID, clientSecret: env.PLUGGY_CLIENT_SECRET };
}

export function isPluggyConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.PLUGGY_CLIENT_ID && env.PLUGGY_CLIENT_SECRET);
}

async function toApiError(response: Response, context: string): Promise<PluggyApiError> {
  const parsed = errorBody.safeParse(await response.json().catch(() => null));
  const code = parsed.success ? (parsed.data.codeDescription ?? (parsed.data.code == null ? null : String(parsed.data.code))) : null;
  const detail = parsed.success ? parsed.data.message : null;
  return new PluggyApiError(response.status, code, `Pluggy respondeu ${response.status} em ${context}${detail ? `: ${detail}` : ""}`);
}

type CachedKey = { value: string; expiresAt: number };
const globalForPluggy = globalThis as unknown as { pluggyKey?: CachedKey; pluggyKeyPending?: Promise<string> };

async function apiKey(forceRefresh = false): Promise<string> {
  const cached = globalForPluggy.pluggyKey;
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;
  // Uma autenticação por vez, mesmo com várias contas sincronizando em paralelo.
  globalForPluggy.pluggyKeyPending ??= (async () => {
    const { baseUrl, clientId, clientSecret } = config();
    const response = await fetch(`${baseUrl}/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw await toApiError(response, "autenticação");
    const { apiKey: value } = authResponse.parse(await response.json());
    globalForPluggy.pluggyKey = { value, expiresAt: Date.now() + API_KEY_TTL_MS };
    return value;
  })().finally(() => {
    globalForPluggy.pluggyKeyPending = undefined;
  });
  return globalForPluggy.pluggyKeyPending;
}

function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 60) * 1000 : 5000;
}

async function request<T extends z.ZodType>(
  method: "GET" | "POST",
  path: string,
  schema: T,
  context: string,
  body?: unknown,
): Promise<z.infer<T>> {
  const { baseUrl } = config();
  const send = async (key: string) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json", "x-api-key": key },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

  let response = await send(await apiKey());
  if (response.status === 401) response = await send(await apiKey(true));
  for (let attempt = 0; attempt < MAX_RATE_LIMIT_RETRIES && response.status === 429; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, retryAfterMs(response)));
    response = await send(await apiKey());
  }
  if (!response.ok) throw await toApiError(response, context);
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new PluggyApiError(response.status, "RESPOSTA_INESPERADA", `Resposta inesperada da Pluggy em ${context}: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

async function allPages<T extends z.ZodType>(path: string, entry: T, context: string): Promise<z.infer<T>[]> {
  const results: z.infer<T>[] = [];
  const separator = path.includes("?") ? "&" : "?";
  for (let current = 1; ; current += 1) {
    const body = await request("GET", `${path}${separator}page=${current}`, page(entry), context);
    results.push(...body.results);
    if (current >= body.totalPages) return results;
  }
}

export function fetchItem(itemId: string): Promise<PluggyItem> {
  return request("GET", `/items/${encodeURIComponent(itemId)}`, item, `item ${itemId}`);
}

export function fetchAccounts(itemId: string): Promise<PluggyAccount[]> {
  return allPages(`/accounts?itemId=${encodeURIComponent(itemId)}`, account, `contas do item ${itemId}`);
}

/** Paginação por cursor (`/v2/transactions`); `dateFrom` em YYYY-MM-DD. Sem `dateFrom`, todo o histórico. */
export async function fetchTransactions(accountId: string, dateFrom?: string): Promise<PluggyTransaction[]> {
  const results: PluggyTransaction[] = [];
  const query = new URLSearchParams({ accountId });
  if (dateFrom) query.set("dateFrom", dateFrom);
  for (;;) {
    const body = await request("GET", `/v2/transactions?${query}`, cursorPage(transaction), `transações da conta ${accountId}`);
    results.push(...body.results);
    const after = body.next ? new URL(body.next, DEFAULT_BASE_URL).searchParams.get("after") : null;
    if (!after) return results;
    query.set("after", after);
  }
}

export function fetchBills(accountId: string): Promise<PluggyBill[]> {
  return allPages(`/bills?accountId=${encodeURIComponent(accountId)}`, bill, `faturas da conta ${accountId}`);
}

/** Consentimento do Open Finance por trás do item (no MeuPluggy, o do banco). */
export async function fetchConsent(itemId: string): Promise<PluggyConsent | null> {
  const body = await request("GET", `/consents?itemId=${encodeURIComponent(itemId)}`, page(consent), `consentimento do item ${itemId}`);
  return body.results[0] ?? null;
}

/**
 * Token de curta duração para o widget Pluggy Connect no navegador (não é a apiKey).
 * Com `itemId`, o widget atualiza o item existente em vez de criar outro.
 */
export async function createConnectToken(options: { clientUserId: string; itemId?: string }): Promise<string> {
  const body = await request("POST", "/connect_token", connectTokenResponse, "connect token", {
    itemId: options.itemId,
    options: { clientUserId: options.clientUserId, avoidDuplicates: true },
  });
  return body.accessToken;
}
