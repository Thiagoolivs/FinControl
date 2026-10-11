"use server";

import { askChat, type ChatTurn, clearChat, getChatHistory, MAX_MESSAGE_LENGTH } from "@/lib/ai/chat";
import { GeminiError, isGeminiConfigured } from "@/lib/ai/gemini";
import { requireUser } from "@/lib/auth/dal";
import { parseScopeParam } from "@/lib/queries/scope";
import { createRateLimiter } from "@/lib/security/rate-limit";

const chatLimiter = createRateLimiter({ limit: 40, windowMs: 60 * 60 * 1000 });

export type ChatMessageView = { id: string; role: "user" | "model"; text: string; tools: string[] };

const toView = (turn: ChatTurn): ChatMessageView => ({ id: turn.id, role: turn.role, text: turn.text, tools: turn.tools });

export async function loadChatAction(): Promise<{ configured: boolean; messages: ChatMessageView[] }> {
  const user = await requireUser();
  if (!isGeminiConfigured()) return { configured: false, messages: [] };
  return { configured: true, messages: (await getChatHistory(user.id)).map(toView) };
}

/** `escopo` é o da tela de onde a pergunta saiu (o mesmo `?escopo=` da URL). */
export async function sendChatAction(input: { text: string; escopo: string | null }): Promise<{ message?: ChatMessageView; error?: string }> {
  const user = await requireUser();
  if (!isGeminiConfigured()) return { error: "Defina GEMINI_API_KEY e GEMINI_MODEL no Railway para usar o chat." };
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text) return { error: "Escreva uma pergunta." };
  if (text.length > MAX_MESSAGE_LENGTH) return { error: `Pergunta longa demais (até ${MAX_MESSAGE_LENGTH} caracteres).` };
  if (!chatLimiter.hit(user.id).allowed) return { error: "Muitas perguntas seguidas. Espere um pouco." };
  try {
    return { message: toView(await askChat(user.id, text, parseScopeParam(input.escopo ?? undefined))) };
  } catch (error) {
    if (error instanceof GeminiError) return { error: error.message };
    console.error("Chat falhou:", error);
    return { error: "Não deu para responder agora. Tente de novo." };
  }
}

export async function clearChatAction(): Promise<void> {
  const user = await requireUser();
  await clearChat(user.id);
}
