"use server";

import { revalidatePath } from "next/cache";
import { askChat, type ChatTurn, clearChat, getChatHistory, MAX_MESSAGE_LENGTH, type ProposalView } from "@/lib/ai/chat";
import { GeminiError, isGeminiConfigured } from "@/lib/ai/gemini";
import { cancelProposal, confirmProposal, ProposalError } from "@/lib/ai/proposals";
import { RuleInputError } from "@/lib/rules/mutations";
import { requireUser } from "@/lib/auth/dal";
import { parseScopeParam } from "@/lib/queries/scope";
import { createRateLimiter } from "@/lib/security/rate-limit";

const chatLimiter = createRateLimiter({ limit: 40, windowMs: 60 * 60 * 1000 });

export type ChatMessageView = { id: string; role: "user" | "model"; text: string; tools: string[]; proposals: ProposalView[] };

const toView = (turn: ChatTurn): ChatMessageView => ({ id: turn.id, role: turn.role, text: turn.text, tools: turn.tools, proposals: turn.proposals });

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

/** Confirmar executa o que está gravado na proposta; o cliente só manda o id. */
export async function confirmProposalAction(proposalId: string): Promise<{ status?: ProposalView["status"]; error?: string }> {
  const user = await requireUser();
  if (typeof proposalId !== "string" || !proposalId) return { error: "Proposta inválida." };
  try {
    await confirmProposal(user.id, proposalId);
    revalidatePath("/", "layout");
    return { status: "confirmed" };
  } catch (error) {
    if (error instanceof ProposalError || error instanceof RuleInputError) return { error: error.message };
    console.error("Proposta falhou:", error);
    return { error: "Não deu para aplicar. Nada foi alterado." };
  }
}

export async function cancelProposalAction(proposalId: string): Promise<{ status?: ProposalView["status"]; error?: string }> {
  const user = await requireUser();
  try {
    await cancelProposal(user.id, proposalId);
    return { status: "cancelled" };
  } catch (error) {
    return { error: error instanceof ProposalError ? error.message : "Não deu para cancelar." };
  }
}
