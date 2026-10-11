import "server-only";
import type { ChatRole } from "@/generated/prisma/enums";
import { todayLocal } from "@/lib/dates";
import { db } from "@/lib/db";
import type { ScopeQuery } from "@/lib/queries/scope";
import { type GeminiContent, GeminiError, type GeminiPart, generateWithTools } from "./gemini";
import { buildSystemPrompt } from "./system-prompt";
import { READ_DECLARATIONS, runReadTool, type ToolContext } from "./tools";

const HISTORY_MESSAGES = 20;
const MAX_TOOL_ROUNDS = 6;
export const MAX_MESSAGE_LENGTH = 1_000;

export type ChatTurn = { id: string; role: "user" | "model"; text: string; createdAt: Date; tools: string[] };

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
    select: { id: true, role: true, content: true, createdAt: true, toolCalls: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.reverse().map((row) => ({
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

  let answer = "";
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const parts = await generateWithTools({ system, contents, tools: READ_DECLARATIONS });
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
      responses.push({ functionResponse: { name: call.name, response: await runReadTool(call.name, call.args ?? {}, context) } });
    }
    contents.push({ role: "user", parts: responses });
  }
  if (!answer) throw new GeminiError("O Gemini não respondeu com texto.");

  const [, saved] = await db().$transaction([
    db().chatMessage.create({ data: { userId, role: "USER", content: question, createdAt: askedAt } }),
    db().chatMessage.create({ data: { userId, role: "MODEL", content: answer, toolCalls: calls.length > 0 ? calls.map((call) => ({ name: call.name, args: call.args as object })) : undefined } }),
  ]);
  return { id: saved.id, role: "model", text: answer, createdAt: saved.createdAt, tools: calls.map((call) => call.name) };
}

export async function clearChat(userId: string): Promise<void> {
  await db().chatMessage.deleteMany({ where: { userId } });
}
