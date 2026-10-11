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
};

/**
 * Pede uma resposta JSON ao Gemini e valida com zod. A IA só classifica e explica: nenhum número
 * que o app mostra sai daqui.
 */
export async function generateJson<T>(options: { system: string; prompt: string; schema: ResponseSchema; parse: z.ZodType<T> }): Promise<T> {
  const env = serverEnv();
  if (!env.GEMINI_API_KEY || !env.GEMINI_MODEL) throw new GeminiError("Defina GEMINI_API_KEY e GEMINI_MODEL.");
  const model = env.GEMINI_MODEL;
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
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new GeminiError(`Gemini respondeu ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
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
