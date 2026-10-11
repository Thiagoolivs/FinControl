import "server-only";
import { z } from "zod";
import { serverEnv } from "@/lib/env";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
const REQUEST_TIMEOUT_MS = 60_000;

export class GeminiError extends Error {}

/** O modelo não é fixo no código: vem de GEMINI_MODEL. Sem chave ou sem modelo, a IA fica desligada. */
export function isGeminiConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.GEMINI_API_KEY && env.GEMINI_MODEL);
}

const responseBody = z.object({
  candidates: z
    .array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }).optional(), finishReason: z.string().optional() }))
    .optional(),
});

/** Esquema de resposta no formato da API (subconjunto do OpenAPI). */
export type ResponseSchema = {
  type: "OBJECT" | "ARRAY" | "STRING" | "INTEGER" | "NUMBER" | "BOOLEAN";
  properties?: Record<string, ResponseSchema>;
  items?: ResponseSchema;
  required?: string[];
  enum?: string[];
  nullable?: boolean;
  description?: string;
};

const errorBody = z.object({ error: z.object({ message: z.string().optional() }).optional() });
const modelList = z.object({
  models: z.array(z.object({ name: z.string(), supportedGenerationMethods: z.array(z.string()).optional() })).optional(),
});

/** "models/gemini-x-flash" ou "gemini-x-flash" → "gemini-x-flash". */
function modelName(raw: string): string {
  return raw.trim().replace(/^models\//, "");
}

/** Modelos que esta chave pode usar para gerar texto, flash primeiro. Vazio se a listagem falhar. */
export async function listGeminiModels(): Promise<string[]> {
  const env = serverEnv();
  if (!env.GEMINI_API_KEY) return [];
  try {
    const response = await fetch(`${env.GEMINI_API_URL ?? DEFAULT_BASE_URL}/v1beta/models?pageSize=1000`, {
      headers: { "x-goog-api-key": env.GEMINI_API_KEY },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const body = modelList.parse(await response.json());
    return (body.models ?? [])
      .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
      .map((model) => modelName(model.name))
      .sort((a, b) => Number(b.includes("flash")) - Number(a.includes("flash")) || b.localeCompare(a));
  } catch {
    return [];
  }
}

const MODELS_IN_ERROR = 8;

/** Erro legível: a mensagem do Google, e no 404 de modelo, a lista de nomes que funcionam. */
async function toGeminiError(response: Response, model: string): Promise<GeminiError> {
  const parsed = errorBody.safeParse(await response.json().catch(() => null));
  const message = parsed.success ? parsed.data.error?.message : undefined;
  if (response.status === 404) {
    const available = await listGeminiModels();
    return new GeminiError(
      available.length > 0
        ? `O modelo "${model}" não existe na API do Gemini. Troque GEMINI_MODEL no Railway por um destes: ${available.slice(0, MODELS_IN_ERROR).join(", ")}.`
        : `O modelo "${model}" não existe na API do Gemini. Confira o nome em GEMINI_MODEL no Railway.`,
    );
  }
  if (response.status === 400 && message?.toLowerCase().includes("api key")) {
    return new GeminiError("O Google recusou a GEMINI_API_KEY. Confira a chave no Railway.");
  }
  return new GeminiError(`Gemini respondeu ${response.status}${message ? `: ${message}` : ""}`);
}

/**
 * Pede uma resposta JSON ao Gemini e valida com zod. A IA só classifica e explica: nenhum número
 * que o app mostra sai daqui.
 */
export async function generateJson<T>(options: { system: string; prompt: string; schema: ResponseSchema; parse: z.ZodType<T> }): Promise<T> {
  const env = serverEnv();
  if (!env.GEMINI_API_KEY || !env.GEMINI_MODEL) throw new GeminiError("Defina GEMINI_API_KEY e GEMINI_MODEL.");
  const model = modelName(env.GEMINI_MODEL);
  const response = await fetch(`${env.GEMINI_API_URL ?? DEFAULT_BASE_URL}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: options.system }] },
      contents: [{ role: "user", parts: [{ text: options.prompt }] }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: options.schema },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw await toGeminiError(response, model);
  const body = responseBody.parse(await response.json());
  const text = body.candidates?.[0]?.content?.parts.map((part) => part.text ?? "").join("") ?? "";
  if (!text) throw new GeminiError(`Gemini não devolveu conteúdo (${body.candidates?.[0]?.finishReason ?? "sem candidato"}).`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new GeminiError("Gemini devolveu JSON inválido.");
  }
  const parsed = options.parse.safeParse(json);
  if (!parsed.success) throw new GeminiError(`Resposta do Gemini fora do formato: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

// ─── Function calling (chat) ────────────────────────────────────────────

export type FunctionDeclaration = { name: string; description: string; parameters?: ResponseSchema };

/** Parte de conteúdo no formato da API. Campos desconhecidos (ex.: thoughtSignature) são preservados. */
export type GeminiPart = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  [key: string]: unknown;
};

export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

const partSchema = z
  .object({
    text: z.string().optional(),
    thought: z.boolean().optional(),
    thoughtSignature: z.string().optional(),
    functionCall: z.object({ name: z.string(), args: z.record(z.string(), z.unknown()).optional() }).optional(),
  })
  .passthrough();

const toolResponseBody = z.object({
  candidates: z
    .array(z.object({ content: z.object({ role: z.string().optional(), parts: z.array(partSchema).optional() }).optional(), finishReason: z.string().optional() }))
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
});

/**
 * Uma rodada do chat com tools. Devolve as partes do modelo como vieram (o próximo pedido precisa
 * delas intactas, assinatura de pensamento inclusive).
 */
export async function generateWithTools(options: { system: string; contents: GeminiContent[]; tools: FunctionDeclaration[] }): Promise<GeminiPart[]> {
  const env = serverEnv();
  if (!env.GEMINI_API_KEY || !env.GEMINI_MODEL) throw new GeminiError("Defina GEMINI_API_KEY e GEMINI_MODEL.");
  const model = modelName(env.GEMINI_MODEL);
  const response = await fetch(`${env.GEMINI_API_URL ?? DEFAULT_BASE_URL}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: options.system }] },
      contents: options.contents,
      tools: [{ functionDeclarations: options.tools }],
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
      generationConfig: { temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw await toGeminiError(response, model);
  const body = toolResponseBody.parse(await response.json());
  if (body.promptFeedback?.blockReason) throw new GeminiError(`O Gemini bloqueou a pergunta (${body.promptFeedback.blockReason}).`);
  const candidate = body.candidates?.[0];
  const parts = (candidate?.content?.parts ?? []) as GeminiPart[];
  if (parts.length === 0) throw new GeminiError(`Gemini não devolveu conteúdo (${candidate?.finishReason ?? "sem candidato"}).`);
  return parts;
}
