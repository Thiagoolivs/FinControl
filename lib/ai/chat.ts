import "server-only";
import type { ChatRole } from "@/generated/prisma/enums";
import { todayLocal } from "@/lib/dates";
import { db } from "@/lib/db";
import type { ScopeQuery } from "@/lib/queries/scope";
import { type GeminiContent, GeminiError, type GeminiPart, generateWithTools } from "./gemini";
import { buildSystemPrompt } from "./system-prompt";
import { isWriteTool, type ProposalPreview, proposeWrite, WRITE_DECLARATIONS } from "./proposals";
import { READ_DECLARATIONS, runReadTool, type ToolContext } from "./tools";

const DECLARATIONS = [...READ_DECLARATIONS, ...WRITE_DECLARATIONS];

const HISTORY_MESSAGES = 20;
const MAX_TOOL_ROUNDS = 6;
export const MAX_MESSAGE_LENGTH = 1_000;

export type ProposalView = { id: string; preview: ProposalPreview; status: "pending" | "confirmed" | "cancelled" | "expired" };

export type ChatTurn = { id: string; role: "user" | "model"; text: string; createdAt: Date; tools: string[]; proposals: ProposalView[] };

const STATUS: Record<string, ProposalView["status"]> = { PENDENTE: "pending", CONFIRMADA: "confirmed", CANCELADA: "cancelled", EXPIRADA: "expired" };

function toProposalView(row: { id: string; preview: unknown; status: string; expiresAt: Date }): ProposalView {
  const preview = row.preview as ProposalPreview;
  const status = row.status === "PENDENTE" && row.expiresAt <= new Date() ? "expired" : (STATUS[row.status] ?? "expired");
  return { id: row.id, preview: { title: preview.title, rows: preview.rows ?? [] }, status };
}

const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" });

async function promptContext(userId: string, screen: ScopeQuery) {
  const [user, categories, goals, streams] = await Promise.all([
    db().user.findUnique({ where: { id: userId }, select: { name: true, username: true, aboutMe: true } }),
    db().category.findMany({ where: { userId }, select: { id: true, name: true, parent: { select: { name: true } } }, orderBy: { name: "asc" } }),
    db().goal.findMany({ where: { userId, status: "ATIVA" }, select: { id: true, name: true } }),
    db().revenueStream.findMany({ where: { userId, active: true }, select: { id: true, name: true, type: true } }),
  ]);
  const today = todayLocal();
  return buildSystemPrompt({
    name: user?.name ?? user?.username ?? null,
    aboutMe: user?.aboutMe ?? null,
    today,
    weekday: weekday.format(new Date(`${today}T12:00:00Z`)),
    screenScope: screen.consolidated ? "consolidado" : screen.scope,
    categories: categories.map((category) => ({ id: category.id, name: category.parent ? `${category.parent.name} › ${category.name}` : category.name })),
    goals,
    streams,
  });
}

/** Últimas mensagens para mostrar no chat. */
export async function getChatHistory(userId: string, limit = 40): Promise<ChatTurn[]> {
  const rows = await db().chatMessage.findMany({
    where: { userId, role: { in: ["USER", "MODEL"] } },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
      toolCalls: true,
      proposals: { select: { id: true, preview: true, status: true, expiresAt: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.reverse().map((row) => ({
    proposals: row.proposals.map(toProposalView),
    id: row.id,
    role: row.role === "USER" ? "user" : "model",
    text: row.content,
    createdAt: row.createdAt,
    tools: Array.isArray(row.toolCalls) ? row.toolCalls.flatMap((call) => (call && typeof call === "object" && "name" in call && typeof call.name === "string" ? [call.name] : [])) : [],
  }));
}

const toContent = (role: ChatRole, text: string): GeminiContent => ({ role: role === "USER" ? "user" : "model", parts: [{ text }] });

/**
 * Uma pergunta do usuário: o modelo chama tools de leitura (até 6 rodadas), recebe JSON e explica.
 * Todo número da resposta vem de uma tool. Grava a pergunta e a resposta (com as tools usadas).
 */
export async function askChat(userId: string, text: string, screen: ScopeQuery): Promise<ChatTurn> {
  const question = text.trim().slice(0, MAX_MESSAGE_LENGTH);
  const askedAt = new Date();
  const [system, previous] = await Promise.all([
    promptContext(userId, screen),
    db().chatMessage.findMany({
      where: { userId, role: { in: ["USER", "MODEL"] } },
      select: { role: true, content: true },
      orderBy: { createdAt: "desc" },
      take: HISTORY_MESSAGES,
    }),
  ]);
  const contents: GeminiContent[] = [...previous.reverse().map((row) => toContent(row.role, row.content)), { role: "user", parts: [{ text: question }] }];
  const context: ToolContext = { userId, screen, today: todayLocal() };
  const calls: { name: string; args: unknown }[] = [];
  const proposalIds: string[] = [];

  let answer = "";
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const parts = await generateWithTools({ system, contents, tools: DECLARATIONS });
    const functionCalls = parts.flatMap((part) => (part.functionCall ? [part.functionCall] : []));
    if (functionCalls.length === 0) {
      answer = parts.filter((part) => !part.thought).map((part) => part.text ?? "").join("").trim();
      break;
    }
    if (round === MAX_TOOL_ROUNDS) throw new GeminiError("O Gemini pediu dados demais para uma pergunta só. Tente perguntar de forma mais específica.");
    // As partes do modelo voltam intactas (assinatura de pensamento inclusive); depois, as respostas na mesma ordem.
    contents.push({ role: "model", parts });
    const responses: GeminiPart[] = [];
    for (const call of functionCalls) {
      calls.push({ name: call.name, args: call.args ?? {} });
      if (isWriteTool(call.name)) {
        // Escrita vira proposta pendente; o modelo fica sabendo que depende do clique do usuário.
        const proposed = await proposeWrite(call.name, call.args ?? {}, context);
        if (proposed.proposalId) proposalIds.push(proposed.proposalId);
        responses.push({ functionResponse: { name: call.name, response: proposed.result } });
      } else {
        responses.push({ functionResponse: { name: call.name, response: await runReadTool(call.name, call.args ?? {}, context) } });
      }
    }
    contents.push({ role: "user", parts: responses });
  }
  if (!answer) throw new GeminiError("O Gemini não respondeu com texto.");

  const [, saved] = await db().$transaction([
    db().chatMessage.create({ data: { userId, role: "USER", content: question, createdAt: askedAt } }),
    db().chatMessage.create({ data: { userId, role: "MODEL", content: answer, toolCalls: calls.length > 0 ? calls.map((call) => ({ name: call.name, args: call.args as object })) : undefined } }),
  ]);
  if (proposalIds.length > 0) await db().aiProposal.updateMany({ where: { userId, id: { in: proposalIds } }, data: { chatMessageId: saved.id } });
  const proposals = await db().aiProposal.findMany({
    where: { userId, id: { in: proposalIds } },
    select: { id: true, preview: true, status: true, expiresAt: true },
    orderBy: { createdAt: "asc" },
  });
  return { id: saved.id, role: "model", text: answer, createdAt: saved.createdAt, tools: calls.map((call) => call.name), proposals: proposals.map(toProposalView) };
}

export async function clearChat(userId: string): Promise<void> {
  await db().chatMessage.deleteMany({ where: { userId } });
}
