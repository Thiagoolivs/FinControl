import "server-only";
import { z } from "zod";
import type { Scope } from "@/generated/prisma/enums";
import { getAlerts } from "@/lib/alerts/queries";
import { formatMonthLabel, fromDbDate, isMonth, monthRange, toDbDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { composeBalance, summarizeBalances } from "@/lib/finance/balance";
import { summarizeFlows } from "@/lib/finance/flows";
import { completionMonth, contributionMonths, monthlyRequiredCents } from "@/lib/finance/goals";
import { decimalToCents, formatCents } from "@/lib/finance/money";
import { formatBps, variationBps } from "@/lib/finance/share";
import { getGoals } from "@/lib/goals/queries";
import { getPortfolio } from "@/lib/portfolio/queries";
import { getProjection } from "@/lib/projection/build";
import { getAccounts, getBucketTotals } from "@/lib/queries/overview";
import type { ScopeQuery } from "@/lib/queries/scope";
import { getMonthCategoryBreakdown, listTransactions } from "@/lib/queries/transactions";
import { getBusinessSummaries } from "@/lib/streams/queries";
import type { FunctionDeclaration, ResponseSchema } from "./gemini";

/** Contexto de cada chamada: quem pergunta e de qual escopo de tela. */
export type ToolContext = { userId: string; screen: ScopeQuery; today: string };

type Json = Record<string, unknown>;
type ToolSpec = { declaration: FunctionDeclaration; run: (args: unknown, context: ToolContext) => Promise<Json> };

// Valores vão já formatados: o modelo cita, não calcula.
const brl = (cents: number) => formatCents(cents);
const pct = (bps: number | null) => (bps === null ? null : `${bps > 0 ? "+" : ""}${formatBps(bps, 1)}`);

const str = (description: string, extra: Partial<ResponseSchema> = {}): ResponseSchema => ({ type: "STRING", ...extra, description });
const num = (description: string): ResponseSchema => ({ type: "NUMBER", description });
const bool = (description: string): ResponseSchema => ({ type: "BOOLEAN", description });
const object = (properties: Record<string, ResponseSchema>, required: string[] = []): ResponseSchema => ({ type: "OBJECT", properties, required });

const PERIODO = str('Mês no formato "AAAA-MM". Sem ele, o mês corrente.');
const SCOPE = str("PF (pessoa física) ou PJ (empresa). Sem ele, o escopo da tela.", { enum: ["PF", "PJ"] });
const CONSOLIDATED = bool("true só quando o usuário pedir PF e PJ somados.");

const periodo = z.string().optional();
const scopeArgs = { scope: z.enum(["PF", "PJ"]).optional(), consolidated: z.boolean().optional() };

/** "AAAA-MM" válido e não futuro; sem valor, o mês corrente. */
function monthOf(value: string | undefined, today: string): string {
  const current = today.slice(0, 7);
  if (!value) return current;
  if (!isMonth(value)) throw new ToolInputError(`Período inválido: ${value}. Use AAAA-MM.`);
  return value > current ? current : value;
}

/** PF e PJ só somam com pedido explícito; sem nada, vale o escopo da tela. */
function scopeOf(args: { scope?: Scope; consolidated?: boolean }, context: ToolContext): ScopeQuery {
  if (args.consolidated) return { consolidated: true };
  if (args.scope) return { scope: args.scope };
  return context.screen;
}

const scopeLabel = (query: ScopeQuery) => (query.consolidated ? "consolidado (PF + PJ)" : query.scope);

export class ToolInputError extends Error {}

function parse<T extends z.ZodType>(schema: T, args: unknown): z.infer<T> {
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) throw new ToolInputError(`Argumentos inválidos: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

/** Entradas e saídas do mês (sem transferência entre contas nem pagamento de fatura). */
async function monthFlows(userId: string, query: ScopeQuery, month: string) {
  const { from, to } = monthRange(month);
  const rows = await db().transaction.findMany({
    where: { userId, ...(query.consolidated ? {} : { scope: query.scope }), isIgnored: false, date: { gte: toDbDate(from), lte: toDbDate(to) } },
    select: { amountCents: true, transferPeerId: true, category: { select: { kind: true } } },
  });
  return summarizeFlows(rows.map((row) => ({ amountCents: row.amountCents, isTransfer: row.transferPeerId !== null || row.category?.kind === "TRANSFERENCIA" })));
}

export const READ_TOOLS: Record<string, ToolSpec> = {
  getSaldoConsolidado: {
    declaration: {
      name: "getSaldoConsolidado",
      description:
        "Saldo de hoje: disponível (o que dá para gastar), guardado em caixinhas, reservado (imposto + custo), caixa do negócio e saldo bruto das contas (com aplicação automática e caixinhas), separados. Também o limite usado dos cartões.",
      parameters: object({ scope: SCOPE, consolidated: CONSOLIDATED }),
    },
    run: async (raw, context) => {
      const args = parse(z.object(scopeArgs), raw);
      const query = scopeOf(args, context);
      const [accounts, buckets] = await Promise.all([getAccounts(context.userId, query), getBucketTotals(context.userId, query)]);
      const balance = summarizeBalances(accounts);
      const composition = composeBalance({ grossCents: balance.grossCents, savedCents: balance.savedCents, ...buckets });
      return {
        escopo: scopeLabel(query),
        disponivel: brl(composition.availableCents),
        reservado: brl(composition.reservedCents),
        caixaNegocio: brl(composition.businessCashCents),
        guardadoEmCaixinhas: brl(composition.savedCents),
        aplicacaoAutomatica: brl(balance.autoInvestedCents),
        saldoBrutoContas: brl(composition.grossCents),
        cartoesLimiteUsado: brl(balance.creditUsedCents),
        contas: accounts
          .filter((account) => account.type !== "INVESTMENT")
          .map((account) => ({
            nome: account.name,
            tipo: account.type,
            escopo: account.scope,
            saldo: brl(account.balanceCents),
            ...(account.autoInvestedCents ? { aplicacaoAutomatica: brl(account.autoInvestedCents) } : {}),
            ...(account.savedCents ? { caixinhas: brl(account.savedCents) } : {}),
          })),
      };
    },
  },

  getReceitaPorStream: {
    declaration: {
      name: "getReceitaPorStream",
      description: "Receita recebida no mês por stream (salário, projetos, negócio), com o que foi reservado para imposto e custo.",
      parameters: object({ periodo: PERIODO, streamId: str("Id de uma stream específica.") }),
    },
    run: async (raw, context) => {
      const args = parse(z.object({ periodo, streamId: z.string().optional() }), raw);
      const month = monthOf(args.periodo, context.today);
      const { from, to } = monthRange(month);
      const streams = await db().revenueStream.findMany({
        where: { userId: context.userId, ...(args.streamId ? { id: args.streamId } : {}) },
        select: { id: true, name: true, type: true, scope: true, taxReserveBps: true, costReserveBps: true },
      });
      const rows = await db().transaction.findMany({
        where: { userId: context.userId, isIgnored: false, amountCents: { gt: 0 }, revenueStreamId: { in: streams.map((stream) => stream.id) }, date: { gte: toDbDate(from), lte: toDbDate(to) } },
        select: { amountCents: true, revenueStreamId: true, bucketEntries: { where: { kind: "ALOCACAO" }, select: { amountCents: true, bucket: { select: { type: true } } } } },
      });
      return {
        periodo: formatMonthLabel(month),
        streams: streams.map((stream) => {
          const own = rows.filter((row) => row.revenueStreamId === stream.id);
          const entries = own.flatMap((row) => row.bucketEntries);
          const sum = (type: string) => entries.filter((entry) => entry.bucket.type === type).reduce((total, entry) => total + entry.amountCents, 0);
          return {
            id: stream.id,
            nome: stream.name,
            tipo: stream.type,
            escopo: stream.scope,
            entradas: own.length,
            recebido: brl(own.reduce((total, row) => total + row.amountCents, 0)),
            reservadoImposto: brl(sum("RESERVA_IMPOSTO")),
            reservadoCusto: brl(sum("RESERVA_CUSTO")),
            paraCaixaDoNegocio: brl(sum("CAIXA_PROJETO")),
            percentualImposto: formatBps(stream.taxReserveBps, 1),
            percentualCusto: formatBps(stream.costReserveBps, 1),
          };
        }),
      };
    },
  },

  getCaixaNegocio: {
    declaration: {
      name: "getCaixaNegocio",
      description: "Caixa do negócio (stream de negócio): saldo, quanto entrou, quanto pagou e quanto foi retirado no mês, retirado desde o início e os últimos lançamentos.",
      parameters: object({ periodo: PERIODO }),
    },
    run: async (raw, context) => {
      const args = parse(z.object({ periodo }), raw);
      const month = monthOf(args.periodo, context.today);
      const businesses = await getBusinessSummaries(context.userId, month);
      return {
        periodo: formatMonthLabel(month),
        negocios: businesses.map((business) => ({
          nome: business.name,
          saldoHoje: brl(business.balanceCents),
          entrouNoMes: brl(business.month.inCents),
          pagoNoMes: brl(business.month.outCents),
          retiradoNoMes: brl(business.month.withdrawnCents),
          retiradoDesdeOInicio: brl(business.withdrawnTotalCents),
          ultimosLancamentos: business.entries.slice(0, 10).map((entry) => ({ data: entry.date, tipo: entry.kind, descricao: entry.description, valor: brl(entry.amountCents) })),
        })),
      };
    },
  },

  getGastosPorCategoria: {
    declaration: {
      name: "getGastosPorCategoria",
      description: "Gastos do mês por área (categoria de primeiro nível, com subcategorias) e quanto cada uma está em relação à média dos 3 meses anteriores.",
      parameters: object({ periodo: PERIODO, scope: SCOPE, consolidated: CONSOLIDATED, categoriaId: str("Id de uma categoria para detalhar só ela.") }),
    },
    run: async (raw, context) => {
      const args = parse(z.object({ periodo, categoriaId: z.string().optional(), ...scopeArgs }), raw);
      const month = monthOf(args.periodo, context.today);
      const query = scopeOf(args, context);
      const rows = await getMonthCategoryBreakdown(context.userId, query, month);
      const filtered = args.categoriaId ? rows.filter((row) => row.id === args.categoriaId || row.children.some((child) => child.id === args.categoriaId)) : rows;
      return {
        periodo: formatMonthLabel(month),
        escopo: scopeLabel(query),
        total: brl(rows.reduce((sum, row) => sum + row.cents, 0)),
        areas: filtered.map((row) => ({
          id: row.id,
          nome: row.name,
          total: brl(row.cents),
          emRelacaoAMedia3Meses: row.averageRatioBps === null ? "sem histórico" : formatBps(row.averageRatioBps),
          subcategorias: row.children.map((child) => ({ id: child.id, nome: child.name, total: brl(child.cents) })),
        })),
      };
    },
  },

  getTransacoes: {
    declaration: {
      name: "getTransacoes",
      description: "Transações do mês com filtros (até 40, mais recentes primeiro). Valores negativos são saídas.",
      parameters: object({
        periodo: PERIODO,
        scope: SCOPE,
        consolidated: CONSOLIDATED,
        categoriaId: str("Id da categoria."),
        min: num("Valor mínimo em reais (absoluto)."),
        max: num("Valor máximo em reais (absoluto)."),
        busca: str("Texto na descrição."),
      }),
    },
    run: async (raw, context) => {
      const args = parse(
        z.object({ periodo, categoriaId: z.string().optional(), min: z.number().nonnegative().optional(), max: z.number().nonnegative().optional(), busca: z.string().max(80).optional(), ...scopeArgs }),
        raw,
      );
      const month = monthOf(args.periodo, context.today);
      const query = scopeOf(args, context);
      const list = await listTransactions(context.userId, { month, scope: query, search: args.busca, categoryId: args.categoriaId });
      const min = args.min === undefined ? null : decimalToCents(args.min);
      const max = args.max === undefined ? null : decimalToCents(args.max);
      const rows = list.rows.filter((row) => !row.isIgnored && (min === null || Math.abs(row.amountCents) >= min) && (max === null || Math.abs(row.amountCents) <= max));
      return {
        periodo: formatMonthLabel(month),
        escopo: scopeLabel(query),
        encontradas: rows.length,
        transacoes: rows.slice(0, 40).map((row) => ({
          id: row.id,
          data: fromDbDate(row.date),
          descricao: row.descriptionClean,
          valor: brl(row.amountCents),
          conta: row.account.name,
          categoria: row.transferPeerId ? "transferência entre contas" : (row.revenueStream?.name ?? row.category?.name ?? "sem categoria"),
          escopo: row.scope,
        })),
      };
    },
  },

  getMetas: {
    declaration: {
      name: "getMetas",
      description: "Metas com valor, quanto já tem, progresso, aporte mensal necessário, prazo, situação (no prazo, atrasada, pausada) e a data realista no ritmo atual.",
      parameters: object({ status: str("Filtro de situação.", { enum: ["ATIVA", "PAUSADA", "ARQUIVADA", "ATRASADA"] }) }),
    },
    run: async (raw, context) => {
      const args = parse(z.object({ status: z.enum(["ATIVA", "PAUSADA", "ARQUIVADA", "ATRASADA"]).optional() }), raw);
      const goals = await getGoals(context.userId, { includeArchived: args.status === "ARQUIVADA" });
      const filtered = goals.filter((goal) => (args.status === "ATRASADA" ? goal.progress === "atrasada" : args.status ? goal.status === args.status : true));
      return {
        metas: filtered.map((goal) => ({
          id: goal.id,
          nome: goal.name,
          escopo: goal.scope,
          situacao: goal.progress,
          alvo: goal.targetCents > 0 ? brl(goal.targetCents) : "não definido",
          atual: brl(goal.currentCents),
          progresso: goal.targetCents > 0 ? formatBps(Math.min(10_000, Math.round((goal.currentCents * 10_000) / goal.targetCents))) : null,
          prazo: formatMonthLabel(goal.targetMonth),
          aporteNecessarioPorMes: brl(goal.monthlyRequiredCents),
          aportadoNesteMes: brl(goal.contributedThisMonthCents),
          ritmoMedioPorMes: goal.paceCents === null ? "sem mês fechado ainda" : brl(goal.paceCents),
          dataRealistaNoRitmo: goal.realisticMonth ? formatMonthLabel(goal.realisticMonth) : goal.paceCents === null ? null : "não fecha no ritmo atual",
        })),
      };
    },
  },

  simularMeta: {
    declaration: {
      name: "simularMeta",
      description: "Simula uma meta: quanto aportar por mês para chegar ao valor na data, e, com um aporte mensal, em que mês fecha. Não grava nada.",
      parameters: object(
        {
          metaId: str("Id de uma meta existente (usa o que ela já tem)."),
          valorAlvo: num("Valor-alvo em reais."),
          dataAlvo: str('Mês do alvo, "AAAA-MM".'),
          aporteMensal: num("Aporte mensal em reais para simular a data."),
        },
        ["valorAlvo", "dataAlvo"],
      ),
    },
    run: async (raw, context) => {
      const args = parse(
        z.object({ metaId: z.string().optional(), valorAlvo: z.number().positive(), dataAlvo: z.string().refine(isMonth, "use AAAA-MM"), aporteMensal: z.number().positive().optional() }),
        raw,
      );
      const month = context.today.slice(0, 7);
      const goal = args.metaId ? (await getGoals(context.userId, { includeArchived: true })).find((item) => item.id === args.metaId) : undefined;
      if (args.metaId && !goal) throw new ToolInputError("Meta não encontrada.");
      const currentCents = goal?.currentCents ?? 0;
      const targetCents = decimalToCents(args.valorAlvo);
      const monthlyCents = args.aporteMensal === undefined ? null : decimalToCents(args.aporteMensal);
      const reach = monthlyCents === null ? null : completionMonth(targetCents - currentCents, monthlyCents, month);
      return {
        meta: goal?.name ?? null,
        jaTem: brl(currentCents),
        alvo: brl(targetCents),
        ate: formatMonthLabel(args.dataAlvo),
        mesesDeAporteContandoEste: Math.max(0, contributionMonths(month, args.dataAlvo)),
        aporteNecessarioPorMes: brl(monthlyRequiredCents(targetCents, currentCents, contributionMonths(month, args.dataAlvo))),
        comAporteMensal: monthlyCents === null ? null : brl(monthlyCents),
        fechaEm: monthlyCents === null ? null : reach ? formatMonthLabel(reach) : "não fecha",
      };
    },
  },

  getProjecaoCaixa: {
    declaration: {
      name: "getProjecaoCaixa",
      description: "Projeção do saldo pessoal mês a mês (realista e com projetos avulsos) e do caixa do negócio, com as premissas usadas e os meses negativos.",
      parameters: object({ meses: num("Quantos meses (1 a 12)."), scope: SCOPE, consolidated: CONSOLIDATED }),
    },
    run: async (raw, context) => {
      const args = parse(z.object({ meses: z.number().int().min(1).max(12).optional(), ...scopeArgs }), raw);
      const query = scopeOf(args, context);
      const projection = await getProjection(context.userId, query, { refreshRecurring: false });
      const months = projection.months.slice(0, args.meses ?? 12);
      const a = projection.assumptions;
      return {
        escopo: scopeLabel(query),
        meses: months.map((month) => ({
          mes: formatMonthLabel(month.month),
          saldoRealista: brl(month.realisticCents),
          saldoComProjetos: month.optimisticCents === null ? null : brl(month.optimisticCents),
          caixaNegocio: month.businessCents === null ? null : brl(month.businessCents),
        })),
        mesesNegativos: months.filter((month) => month.realisticCents < 0).map((month) => formatMonthLabel(month.month)),
        premissas: {
          comecaCom: brl(a.opening.openingCents),
          receitasRecorrentes: a.incomes.map((item) => ({ descricao: item.label, valor: brl(item.amountCents) })),
          despesasRecorrentes: a.expenses.map((item) => ({ descricao: item.label, valor: brl(item.amountCents) })),
          parcelasDeCartaoQueFaltam: brl(a.installments.totalCents),
          gastosVariaveisPorMes: a.variable.months > 0 ? brl(a.variable.monthlyCents) : "sem mês fechado ainda",
          metasPorMes: a.goals.map((goal) => ({ meta: goal.name, valor: brl(goal.monthlyCents) })),
          obrigacoesPorMes: a.obligations.map((item) => ({ nome: item.name, valor: brl(item.monthlyCents) })),
          projetosAvulsosPorMes: a.projects ? brl(a.projects.monthlyCents) : null,
        },
      };
    },
  },

  getCarteira: {
    declaration: {
      name: "getCarteira",
      description: "Carteira de investimentos: total, custo, resultado, alocação atual × alvo definido pelo usuário (com desvio), por classe ou por ativo. Só fatos: nunca serve de base para recomendar compra ou venda.",
      parameters: object({ agrupadoPor: str("classe ou ativo.", { enum: ["classe", "ativo"] }) }),
    },
    run: async (raw, context) => {
      const args = parse(z.object({ agrupadoPor: z.enum(["classe", "ativo"]).optional() }), raw);
      const portfolio = await getPortfolio(context.userId, { consolidated: true });
      return {
        total: brl(portfolio.totalCents),
        custo: brl(portfolio.costCents),
        resultado: brl(portfolio.totalCents - portfolio.costCents),
        ...(args.agrupadoPor === "ativo"
          ? {
              posicoes: portfolio.holdings.map((holding) => ({
                nome: holding.name,
                ticker: holding.ticker,
                classe: holding.assetClass,
                valor: brl(holding.valueCents),
                custo: brl(holding.costCents),
                resultado: brl(holding.resultCents),
              })),
            }
          : {
              classes: portfolio.rows.map((row) => ({
                classe: row.assetClass,
                valor: brl(row.valueCents),
                atual: formatBps(row.currentBps, 1),
                alvo: formatBps(row.targetBps, 1),
                desvioPontos: pct(row.deviationBps),
                desvioEmReais: brl(row.deviationCents),
              })),
            }),
        regra: "Não recomende compra, venda nem alocação. Mostre só os números e o desvio do alvo que o usuário definiu.",
      };
    },
  },

  getAlertas: {
    declaration: {
      name: "getAlertas",
      description: "Alertas do app (gasto alto, meta atrasada, saldo projetado negativo, reserva baixa…), mais recentes primeiro.",
      parameters: object({ naoLidos: bool("Só os não lidos.") }),
    },
    run: async (raw, context) => {
      const args = parse(z.object({ naoLidos: z.boolean().optional() }), raw);
      const alerts = await getAlerts(context.userId, { unreadOnly: args.naoLidos, limit: 20 });
      return { alertas: alerts.map((alert) => ({ titulo: alert.title, detalhe: alert.body, severidade: alert.severity, lido: alert.read, quando: alert.createdAt.toISOString() })) };
    },
  },

  compararPeriodos: {
    declaration: {
      name: "compararPeriodos",
      description: "Compara dois meses: entradas, saídas e gasto por área, com as diferenças já calculadas.",
      parameters: object({ periodoA: str('Primeiro mês, "AAAA-MM".'), periodoB: str('Segundo mês, "AAAA-MM".'), scope: SCOPE, consolidated: CONSOLIDATED }, ["periodoA", "periodoB"]),
    },
    run: async (raw, context) => {
      const args = parse(z.object({ periodoA: z.string(), periodoB: z.string(), ...scopeArgs }), raw);
      const monthA = monthOf(args.periodoA, context.today);
      const monthB = monthOf(args.periodoB, context.today);
      const query = scopeOf(args, context);
      const [flowsA, flowsB, areasA, areasB] = await Promise.all([
        monthFlows(context.userId, query, monthA),
        monthFlows(context.userId, query, monthB),
        getMonthCategoryBreakdown(context.userId, query, monthA),
        getMonthCategoryBreakdown(context.userId, query, monthB),
      ]);
      const names = [...new Set([...areasA, ...areasB].map((row) => row.name))];
      const areas = names
        .map((name) => {
          const a = areasA.find((row) => row.name === name)?.cents ?? 0;
          const b = areasB.find((row) => row.name === name)?.cents ?? 0;
          return { name, a, b, diff: b - a };
        })
        .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))
        .slice(0, 10);
      return {
        escopo: scopeLabel(query),
        periodoA: formatMonthLabel(monthA),
        periodoB: formatMonthLabel(monthB),
        entradas: { a: brl(flowsA.inCents), b: brl(flowsB.inCents), diferenca: brl(flowsB.inCents - flowsA.inCents), variacao: pct(variationBps(flowsA.inCents, flowsB.inCents)) },
        saidas: { a: brl(flowsA.outCents), b: brl(flowsB.outCents), diferenca: brl(flowsB.outCents - flowsA.outCents), variacao: pct(variationBps(flowsA.outCents, flowsB.outCents)) },
        areasQueMaisMudaram: areas.map((area) => ({ area: area.name, a: brl(area.a), b: brl(area.b), diferenca: brl(area.diff), variacao: pct(variationBps(area.a, area.b)) })),
      };
    },
  },
};

export const READ_DECLARATIONS = Object.values(READ_TOOLS).map((tool) => tool.declaration);

/** Executa uma tool de leitura. Erro de argumento volta para o modelo como texto, não derruba o chat. */
export async function runReadTool(name: string, args: unknown, context: ToolContext): Promise<Json> {
  const tool = READ_TOOLS[name];
  if (!tool) return { erro: `Tool desconhecida: ${name}. Use só as tools da lista.` };
  try {
    return await tool.run(args, context);
  } catch (error) {
    if (error instanceof ToolInputError) return { erro: error.message };
    throw error;
  }
}

