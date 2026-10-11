import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { compilePattern, normalizeText } from "@/lib/categorization/match";
import { formatMonthLabel, fromDbDate, isMonth, todayLocal, toDbDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { splitIncome } from "@/lib/finance/allocation";
import { contributionMonths, monthlyRequiredCents } from "@/lib/finance/goals";
import { decimalToCents, formatCents } from "@/lib/finance/money";
import { formatBps } from "@/lib/finance/share";
import { nextOccurrence } from "@/lib/finance/recurring";
import { recurringKey } from "@/lib/projection/recurring";
import { createGoal, updateGoal } from "@/lib/goals/mutations";
import { createRule, setTransactionCategory } from "@/lib/rules/mutations";
import { registerWithdrawal, setTransactionStream } from "@/lib/streams/mutations";
import type { FunctionDeclaration, ResponseSchema } from "./gemini";
import { ToolInputError, type ToolContext } from "./tools";

export const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TRANSACTIONS = 100;

export type ProposalPreview = { title: string; rows: { label: string; value: string; mono?: boolean }[] };

type WriteSpec<T> = {
  declaration: FunctionDeclaration;
  schema: z.ZodType<T>;
  /** Confere no banco, normaliza e monta o que o card mostra. Não grava nada. */
  prepare: (args: T, context: ToolContext) => Promise<{ args: Json; preview: ProposalPreview }>;
  /** Roda só no clique em Confirmar, com os argumentos guardados na proposta. */
  execute: (userId: string, args: Json, proposalId: string) => Promise<{ entity: string; entityId: string | null; before?: Json; after: Json }>;
};

type Json = { [key: string]: Prisma.InputJsonValue | null };

const str = (description: string, extra: Partial<ResponseSchema> = {}): ResponseSchema => ({ type: "STRING", ...extra, description });
const num = (description: string): ResponseSchema => ({ type: "NUMBER", description });
const bool = (description: string): ResponseSchema => ({ type: "BOOLEAN", description });
const ids = (description: string): ResponseSchema => ({ type: "ARRAY", items: { type: "STRING" }, description });
const object = (properties: Record<string, ResponseSchema>, required: string[]): ResponseSchema => ({ type: "OBJECT", properties, required });

const MATCH_LABEL = { PREFIX: "Começa com", CONTAINS: "Contém", REGEX: "Expressão regular" } as const;
const brl = (cents: number) => formatCents(cents);
const month = z.string().refine(isMonth, 'use "AAAA-MM"');

async function categoryName(userId: string, categoryId: string): Promise<string> {
  const category = await db().category.findFirst({ where: { id: categoryId, userId }, select: { name: true, kind: true, parent: { select: { name: true } } } });
  if (!category) throw new ToolInputError("Categoria não encontrada. Use um id da lista de categorias.");
  if (category.kind === "TRANSFERENCIA") throw new ToolInputError("Transferência é categoria do sistema; não dá para usar aqui.");
  return category.parent ? `${category.parent.name} › ${category.name}` : category.name;
}

async function ownTransactions(userId: string, transactionIds: string[]) {
  const rows = await db().transaction.findMany({
    where: { userId, id: { in: transactionIds } },
    select: { id: true, date: true, amountCents: true, descriptionClean: true, categoryId: true, revenueStreamId: true, transferPeerId: true, recurringSeriesId: true, scope: true },
  });
  if (rows.length !== new Set(transactionIds).size) throw new ToolInputError("Alguma transação não foi encontrada. Use ids que vieram de getTransacoes.");
  return rows;
}

const describe = (rows: { descriptionClean: string; amountCents: number }[]) =>
  rows.length === 1 ? `${rows[0]?.descriptionClean} (${brl(rows[0]?.amountCents ?? 0)})` : `${rows.length} transações, ${brl(rows.reduce((sum, row) => sum + row.amountCents, 0))}`;

/** Spec com o tipo dos argumentos apagado: a validação acontece dentro do `prepare`. */
type RegisteredTool = {
  declaration: FunctionDeclaration;
  prepare: (raw: unknown, context: ToolContext) => Promise<{ args: Json; preview: ProposalPreview }>;
  execute: WriteSpec<unknown>["execute"];
};

const WRITE_TOOLS: Record<string, RegisteredTool> = {};

function register<T>(spec: WriteSpec<T>) {
  WRITE_TOOLS[spec.declaration.name] = {
    declaration: spec.declaration,
    prepare: async (raw, context) => {
      const parsed = spec.schema.safeParse(raw ?? {});
      if (!parsed.success) throw new ToolInputError(`Argumentos inválidos: ${z.prettifyError(parsed.error)}`);
      return spec.prepare(parsed.data, context);
    },
    execute: spec.execute,
  };
}

register({
  declaration: {
    name: "proporRegraCategoria",
    description: "Propõe uma regra de categorização (padrão na descrição → categoria). Não grava: o usuário confirma no card.",
    parameters: object(
      {
        padrao: str("Texto ou expressão que casa com a descrição."),
        tipoMatch: str("Como comparar.", { enum: ["PREFIX", "CONTAINS", "REGEX"] }),
        categoriaId: str("Id da categoria."),
        aplicarRetroativo: bool("true para refazer também o que já foi categorizado por regra."),
      },
      ["padrao", "tipoMatch", "categoriaId"],
    ),
  },
  schema: z.object({ padrao: z.string().trim().min(1).max(200), tipoMatch: z.enum(["PREFIX", "CONTAINS", "REGEX"]), categoriaId: z.string().min(1), aplicarRetroativo: z.boolean().optional() }),
  prepare: async (args, { userId }) => {
    const compiled = compilePattern(args.padrao, args.tipoMatch);
    if (!compiled.ok) throw new ToolInputError(compiled.error);
    const name = await categoryName(userId, args.categoriaId);
    const recent = await db().transaction.findMany({ where: { userId, amountCents: { lt: 0 } }, select: { descriptionClean: true, descriptionRaw: true }, orderBy: { date: "desc" }, take: 2_000 });
    const matches = recent.filter((row) => compiled.test(normalizeText(row.descriptionClean)) || compiled.test(normalizeText(row.descriptionRaw))).length;
    return {
      args: { pattern: args.padrao, matchType: args.tipoMatch, categoryId: args.categoriaId, applyRetroactively: args.aplicarRetroativo ?? false },
      preview: {
        title: "Criar regra",
        rows: [
          { label: "Padrão", value: args.padrao, mono: true },
          { label: "Comparação", value: MATCH_LABEL[args.tipoMatch] },
          { label: "Categoria", value: name },
          { label: "Casa hoje com", value: `${matches} ${matches === 1 ? "saída" : "saídas"}` },
          { label: "Retroativo", value: args.aplicarRetroativo ? "Sim, refaz o que é de regra" : "Não, só o que está sem categoria" },
        ],
      },
    };
  },
  execute: async (userId, args, proposalId) => {
    const input = z.object({ pattern: z.string(), matchType: z.enum(["PREFIX", "CONTAINS", "REGEX"]), categoryId: z.string(), applyRetroactively: z.boolean() }).parse(args);
    const { ruleId, changed } = await createRule(
      userId,
      { pattern: input.pattern, matchType: input.matchType, direction: "AMBAS", scope: null, categoryId: input.categoryId, priority: 100 },
      { origin: "IA_CONFIRMADA", applyRetroactively: input.applyRetroactively, proposalId },
    );
    return { entity: "Rule", entityId: ruleId, after: { ...input, categorizadas: changed } };
  },
});

register({
  declaration: {
    name: "proporCriacaoMeta",
    description: "Propõe uma meta nova. Não grava: o usuário confirma no card.",
    parameters: object(
      { nome: str("Nome da meta."), valorAlvo: num("Valor-alvo em reais."), dataAlvo: str('Mês do alvo, "AAAA-MM".'), scope: str("PF ou PJ.", { enum: ["PF", "PJ"] }) },
      ["nome", "valorAlvo", "dataAlvo"],
    ),
  },
  schema: z.object({ nome: z.string().trim().min(1).max(60), valorAlvo: z.number().positive(), dataAlvo: month, scope: z.enum(["PF", "PJ"]).optional() }),
  prepare: async (args, { today }) => {
    if (args.dataAlvo < today.slice(0, 7)) throw new ToolInputError("O mês do alvo já passou.");
    const targetCents = decimalToCents(args.valorAlvo);
    const scope = args.scope ?? "PF";
    return {
      args: { name: args.nome, targetCents, targetMonth: args.dataAlvo, scope },
      preview: {
        title: `Criar meta ${args.nome}`,
        rows: [
          { label: "Valor-alvo", value: brl(targetCents) },
          { label: "Até", value: formatMonthLabel(args.dataAlvo) },
          { label: "Escopo", value: scope === "PJ" ? "Empresa (PJ)" : "Pessoal" },
          { label: "Aporte por mês", value: brl(monthlyRequiredCents(targetCents, 0, contributionMonths(today.slice(0, 7), args.dataAlvo))) },
        ],
      },
    };
  },
  execute: async (userId, args) => {
    const input = z.object({ name: z.string(), targetCents: z.number().int(), targetMonth: z.string(), scope: z.enum(["PF", "PJ"]) }).parse(args);
    const id = await createGoal(userId, { ...input, initialCents: 0 });
    return { entity: "Goal", entityId: id, after: input };
  },
});

register({
  declaration: {
    name: "proporAjusteMeta",
    description: "Propõe mudar uma meta (nome, valor-alvo, mês do alvo ou situação). Não grava: o usuário confirma no card.",
    parameters: object(
      {
        metaId: str("Id da meta."),
        campos: object(
          { nome: str("Novo nome."), valorAlvo: num("Novo valor-alvo em reais."), dataAlvo: str('Novo mês, "AAAA-MM".'), status: str("Nova situação.", { enum: ["ATIVA", "PAUSADA", "ARQUIVADA"] }) },
          [],
        ),
      },
      ["metaId", "campos"],
    ),
  },
  schema: z.object({
    metaId: z.string().min(1),
    campos: z
      .object({ nome: z.string().trim().min(1).max(60).optional(), valorAlvo: z.number().positive().optional(), dataAlvo: month.optional(), status: z.enum(["ATIVA", "PAUSADA", "ARQUIVADA"]).optional() })
      .refine((fields) => Object.values(fields).some((value) => value !== undefined), "Diga o que mudar."),
  }),
  prepare: async (args, { userId }) => {
    const goal = await db().goal.findFirst({ where: { id: args.metaId, userId }, select: { id: true, name: true, targetCents: true, targetDate: true, status: true } });
    if (!goal) throw new ToolInputError("Meta não encontrada. Use um id da lista de metas.");
    const current = { name: goal.name, targetCents: goal.targetCents, targetMonth: fromDbDate(goal.targetDate).slice(0, 7), status: goal.status === "CONCLUIDA" ? "ATIVA" : goal.status };
    const next = {
      name: args.campos.nome ?? current.name,
      targetCents: args.campos.valorAlvo === undefined ? current.targetCents : decimalToCents(args.campos.valorAlvo),
      targetMonth: args.campos.dataAlvo ?? current.targetMonth,
      status: args.campos.status ?? current.status,
    };
    const rows: ProposalPreview["rows"] = [];
    if (next.name !== current.name) rows.push({ label: "Nome", value: `${current.name} → ${next.name}` });
    if (next.targetCents !== current.targetCents) rows.push({ label: "Valor-alvo", value: `${brl(current.targetCents)} → ${brl(next.targetCents)}` });
    if (next.targetMonth !== current.targetMonth) rows.push({ label: "Até", value: `${formatMonthLabel(current.targetMonth)} → ${formatMonthLabel(next.targetMonth)}` });
    if (next.status !== current.status) rows.push({ label: "Situação", value: `${current.status.toLowerCase()} → ${next.status.toLowerCase()}` });
    if (rows.length === 0) throw new ToolInputError("Nada muda: os valores pedidos já são os da meta.");
    return { args: { goalId: goal.id, before: current, ...next }, preview: { title: `Ajustar meta ${current.name}`, rows } };
  },
  execute: async (userId, args) => {
    const input = z
      .object({ goalId: z.string(), name: z.string(), targetCents: z.number().int(), targetMonth: z.string(), status: z.enum(["ATIVA", "PAUSADA", "ARQUIVADA"]), before: z.record(z.string(), z.unknown()) })
      .parse(args);
    await updateGoal(userId, input.goalId, { name: input.name, targetCents: input.targetCents, targetMonth: input.targetMonth, status: input.status });
    const { before, goalId, ...after } = input;
    return { entity: "Goal", entityId: goalId, before: before as Json, after };
  },
});

register({
  declaration: {
    name: "proporRecategorizacao",
    description: "Propõe trocar a categoria de transações (ids de getTransacoes). Não grava: o usuário confirma no card.",
    parameters: object({ transacaoIds: ids("Ids das transações."), categoriaId: str("Id da nova categoria.") }, ["transacaoIds", "categoriaId"]),
  },
  schema: z.object({ transacaoIds: z.array(z.string().min(1)).min(1).max(MAX_TRANSACTIONS), categoriaId: z.string().min(1) }),
  prepare: async (args, { userId }) => {
    const name = await categoryName(userId, args.categoriaId);
    const rows = await ownTransactions(userId, args.transacaoIds);
    return {
      args: { transactionIds: rows.map((row) => row.id), categoryId: args.categoriaId },
      preview: {
        title: "Trocar categoria",
        rows: [
          { label: "Transações", value: describe(rows) },
          { label: "Nova categoria", value: name },
          { label: "Vale para", value: "Só estas; as próximas seguem as regras" },
        ],
      },
    };
  },
  execute: async (userId, args) => {
    const input = z.object({ transactionIds: z.array(z.string()), categoryId: z.string() }).parse(args);
    const before = await db().transaction.findMany({ where: { userId, id: { in: input.transactionIds } }, select: { id: true, categoryId: true } });
    for (const id of input.transactionIds) await setTransactionCategory(userId, id, input.categoryId);
    return { entity: "Transaction", entityId: input.transactionIds.length === 1 ? (input.transactionIds[0] ?? null) : null, before: { categorias: before }, after: input };
  },
});

register({
  declaration: {
    name: "proporMarcarRecorrente",
    description: "Propõe marcar uma transação como recorrente (entra na projeção todo mês) ou como não recorrente (sai da projeção). Não grava: o usuário confirma no card.",
    parameters: object({ transacaoId: str("Id da transação."), isRecurring: bool("true = recorrente; false = não é recorrente.") }, ["transacaoId", "isRecurring"]),
  },
  schema: z.object({ transacaoId: z.string().min(1), isRecurring: z.boolean() }),
  prepare: async (args, { userId }) => {
    const [row] = await ownTransactions(userId, [args.transacaoId]);
    if (!row) throw new ToolInputError("Transação não encontrada.");
    if (row.transferPeerId) throw new ToolInputError("Transferência entre contas não entra na projeção.");
    return {
      args: { transactionId: row.id, isRecurring: args.isRecurring },
      preview: {
        title: args.isRecurring ? "Marcar como recorrente" : "Marcar como não recorrente",
        rows: [
          { label: "Transação", value: describe([row]) },
          { label: "Na projeção", value: args.isRecurring ? "Entra todo mês, com este valor" : "Sai das recorrentes" },
        ],
      },
    };
  },
  execute: async (userId, args) => {
    const input = z.object({ transactionId: z.string(), isRecurring: z.boolean() }).parse(args);
    const row = await db().transaction.findFirst({
      where: { id: input.transactionId, userId },
      select: { id: true, date: true, amountCents: true, scope: true, descriptionClean: true, categoryId: true, revenueStreamId: true },
    });
    if (!row) throw new ToolInputError("Transação não encontrada.");
    // Mesma chave da detecção automática: a decisão vale para a série, antes e depois de ela ser detectada.
    const key = recurringKey(row.amountCents, row.descriptionClean);
    const decision = input.isRecurring ? ("ATIVA" as const) : ("ENCERRADA" as const);
    let next = nextOccurrence(fromDbDate(row.date), 30);
    while (next < todayLocal()) next = nextOccurrence(next, 30);
    const series = await db().recurringSeries.upsert({
      where: { userId_scope_key: { userId, scope: row.scope, key } },
      create: {
        userId,
        scope: row.scope,
        key,
        avgAmountCents: row.amountCents,
        intervalDays: 30,
        occurrences: 1,
        lastDate: row.date,
        nextExpectedDate: toDbDate(next),
        status: decision,
        userStatus: decision,
        categoryId: row.categoryId,
        revenueStreamId: row.revenueStreamId,
      },
      update: { userStatus: decision, status: decision },
      select: { id: true },
    });
    if (input.isRecurring) {
      await db().transaction.updateMany({ where: { id: row.id, userId }, data: { recurringSeriesId: series.id, isRecurring: true } });
    } else {
      await db().transaction.updateMany({ where: { userId, recurringSeriesId: series.id }, data: { recurringSeriesId: null, isRecurring: false } });
    }
    return { entity: "RecurringSeries", entityId: series.id, after: input };
  },
});

register({
  declaration: {
    name: "proporAtribuicaoStream",
    description: "Propõe atribuir entradas (ids de getTransacoes) a uma stream de receita; as reservas da stream são lançadas. Não grava: o usuário confirma no card.",
    parameters: object({ transacaoIds: ids("Ids das entradas."), streamId: str("Id da stream.") }, ["transacaoIds", "streamId"]),
  },
  schema: z.object({ transacaoIds: z.array(z.string().min(1)).min(1).max(MAX_TRANSACTIONS), streamId: z.string().min(1) }),
  prepare: async (args, { userId }) => {
    const stream = await db().revenueStream.findFirst({ where: { id: args.streamId, userId }, select: { id: true, name: true, type: true, taxReserveBps: true, costReserveBps: true } });
    if (!stream) throw new ToolInputError("Stream não encontrada. Use um id da lista de streams.");
    const rows = await ownTransactions(userId, args.transacaoIds);
    if (rows.some((row) => row.amountCents <= 0)) throw new ToolInputError("Só entradas recebem stream.");
    const splits = rows.map((row) => splitIncome(row.amountCents, stream.taxReserveBps, stream.costReserveBps));
    const tax = splits.reduce((sum, split) => sum + split.taxCents, 0);
    const cost = splits.reduce((sum, split) => sum + split.costCents, 0);
    const rest = splits.reduce((sum, split) => sum + split.restCents, 0);
    return {
      args: { transactionIds: rows.map((row) => row.id), streamId: stream.id },
      preview: {
        title: `Atribuir a ${stream.name}`,
        rows: [
          { label: "Entradas", value: describe(rows) },
          { label: `Imposto (${formatBps(stream.taxReserveBps, 1)})`, value: brl(tax) },
          { label: `Custo (${formatBps(stream.costReserveBps, 1)})`, value: brl(cost) },
          { label: stream.type === "VENTURE" ? "Caixa do negócio" : "Disponível", value: brl(rest) },
        ],
      },
    };
  },
  execute: async (userId, args) => {
    const input = z.object({ transactionIds: z.array(z.string()), streamId: z.string() }).parse(args);
    const before = await db().transaction.findMany({ where: { userId, id: { in: input.transactionIds } }, select: { id: true, revenueStreamId: true, categoryId: true } });
    for (const id of input.transactionIds) await setTransactionStream(userId, id, input.streamId);
    return { entity: "Transaction", entityId: input.transactionIds.length === 1 ? (input.transactionIds[0] ?? null) : null, before: { transacoes: before }, after: input };
  },
});

register({
  declaration: {
    name: "proporRetiradaNegocio",
    description: "Propõe registrar uma retirada do caixa do negócio para o disponível. Não grava: o usuário confirma no card.",
    parameters: object({ valor: num("Valor em reais."), data: str('Data, "AAAA-MM-DD". Sem ela, hoje.') }, ["valor"]),
  },
  schema: z.object({ valor: z.number().positive(), data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  prepare: async (args, { userId, today }) => {
    const date = args.data ?? today;
    if (date > today) throw new ToolInputError("A data da retirada não pode ser no futuro.");
    const bucket = await db().bucket.findFirst({ where: { userId, type: "CAIXA_PROJETO" }, select: { id: true, name: true, balanceCents: true }, orderBy: { createdAt: "asc" } });
    if (!bucket) throw new ToolInputError("Não há caixa de negócio cadastrado.");
    const amountCents = decimalToCents(args.valor);
    return {
      args: { bucketId: bucket.id, amountCents, date },
      preview: {
        title: "Registrar retirada",
        rows: [
          { label: "Valor", value: brl(amountCents) },
          { label: "Data", value: date.split("-").reverse().join("/") },
          { label: "Sai de", value: bucket.name },
          { label: "Caixa depois", value: brl(bucket.balanceCents - amountCents) },
        ],
      },
    };
  },
  execute: async (userId, args) => {
    const input = z.object({ bucketId: z.string(), amountCents: z.number().int().positive(), date: z.string() }).parse(args);
    await registerWithdrawal(userId, { ...input, note: "Retirada (pelo chat)" });
    return { entity: "Bucket", entityId: input.bucketId, after: input };
  },
});

export const WRITE_DECLARATIONS = Object.values(WRITE_TOOLS).map((tool) => tool.declaration);
export const isWriteTool = (name: string) => name in WRITE_TOOLS;

/** Tool de escrita chamada pelo modelo: vira proposta pendente. Nada muda até o clique em Confirmar. */
export async function proposeWrite(name: string, raw: unknown, context: ToolContext): Promise<{ result: Json; proposalId: string | null }> {
  const spec = WRITE_TOOLS[name];
  if (!spec) return { result: { erro: `Tool desconhecida: ${name}.` }, proposalId: null };
  try {
    const { args, preview } = await spec.prepare(raw, context);
    const proposal = await db().aiProposal.create({
      data: { userId: context.userId, tool: name, args, preview, expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS) },
      select: { id: true },
    });
    return {
      result: { propostaId: proposal.id, situacao: "aguardando confirmação do usuário no card", resumo: preview.title, detalhes: preview.rows.map((row) => `${row.label}: ${row.value}`) },
      proposalId: proposal.id,
    };
  } catch (error) {
    if (error instanceof ToolInputError) return { result: { erro: error.message }, proposalId: null };
    throw error;
  }
}

export class ProposalError extends Error {}

/**
 * Confirma: reivindica a proposta (só uma vez, só pendente e no prazo), executa os argumentos guardados
 * nela e registra no AuditLog com origem AI. Se a execução falhar, a proposta volta a pendente.
 */
export async function confirmProposal(userId: string, proposalId: string): Promise<void> {
  const proposal = await db().aiProposal.findFirst({ where: { id: proposalId, userId }, select: { id: true, tool: true, args: true, status: true, expiresAt: true } });
  if (!proposal) throw new ProposalError("Proposta não encontrada.");
  if (proposal.status === "PENDENTE" && proposal.expiresAt <= new Date()) {
    await db().aiProposal.updateMany({ where: { id: proposalId, userId, status: "PENDENTE" }, data: { status: "EXPIRADA", resolvedAt: new Date() } });
    throw new ProposalError("Esta proposta expirou. Peça de novo no chat.");
  }
  const claimed = await db().aiProposal.updateMany({
    where: { id: proposalId, userId, status: "PENDENTE", expiresAt: { gt: new Date() } },
    data: { status: "CONFIRMADA", resolvedAt: new Date() },
  });
  if (claimed.count === 0) throw new ProposalError("Esta proposta já foi resolvida.");
  const spec = WRITE_TOOLS[proposal.tool];
  try {
    if (!spec) throw new ProposalError(`Tool desconhecida: ${proposal.tool}.`);
    const done = await spec.execute(userId, proposal.args as Json, proposal.id);
    await db().auditLog.create({
      data: {
        userId,
        action: `ai.${proposal.tool}`,
        entity: done.entity,
        entityId: done.entityId,
        before: done.before ?? undefined,
        after: done.after,
        origin: "AI",
        proposalId: proposal.id,
      },
    });
  } catch (error) {
    await db().aiProposal.updateMany({ where: { id: proposalId, userId }, data: { status: "PENDENTE", resolvedAt: null } });
    throw error instanceof ToolInputError ? new ProposalError(error.message) : error;
  }
}

export async function cancelProposal(userId: string, proposalId: string): Promise<void> {
  const updated = await db().aiProposal.updateMany({ where: { id: proposalId, userId, status: "PENDENTE" }, data: { status: "CANCELADA", resolvedAt: new Date() } });
  if (updated.count === 0) throw new ProposalError("Esta proposta já foi resolvida.");
}
