import type { AlertType, Severity } from "@/generated/prisma/enums";

export type ParamKind = "cents" | "bps" | "days" | "months";

export type ParamSpec = { key: string; label: string; kind: ParamKind; initial: number; min: number; max: number };

export type AlertSpec = {
  label: string;
  description: string;
  severity: Severity;
  params: ParamSpec[];
  /** Tela que o alerta abre (na central e no clique da notificação). */
  href: (payload: Record<string, unknown>) => string;
};

const id = (payload: Record<string, unknown>, key: string) => (typeof payload[key] === "string" ? (payload[key] as string) : null);

// Valores iniciais: tudo editável em Config → Alertas. Push liga sozinho só para severidade alta.
export const ALERT_CATALOG: Record<AlertType, AlertSpec> = {
  GASTO_UNICO_ALTO: {
    label: "Gasto único alto",
    description: "Uma saída acima do valor que você definir.",
    severity: "MEDIA",
    params: [{ key: "limiteCents", label: "Acima de", kind: "cents", initial: 100_000, min: 100, max: 100_000_000 }],
    href: (payload) => (id(payload, "transactionId") ? `/transacoes/${id(payload, "transactionId")}` : "/transacoes"),
  },
  CATEGORIA_ACIMA_MEDIA: {
    label: "Categoria acima da média",
    description: "O gasto do mês numa área passa da média dos últimos 3 meses.",
    severity: "MEDIA",
    params: [{ key: "limiteBps", label: "Acima de (% da média)", kind: "bps", initial: 12_000, min: 10_000, max: 100_000 }],
    href: () => "/transacoes/categorias",
  },
  ASSINATURA_NOVA: {
    label: "Assinatura nova",
    description: "Uma despesa recorrente que não aparecia antes.",
    severity: "BAIXA",
    params: [],
    href: () => "/projecao",
  },
  FATURA_ACIMA_PREVISTO: {
    label: "Fatura acima do previsto",
    description: "As compras do mês no cartão passam da média dos últimos 3 meses.",
    severity: "MEDIA",
    params: [{ key: "limiteBps", label: "Acima de (% da média)", kind: "bps", initial: 12_000, min: 10_000, max: 100_000 }],
    href: () => "/transacoes",
  },
  META_ATRASADA: {
    label: "Meta atrasada",
    description: "O aporte necessário subiu dois meses seguidos, ou o prazo passou.",
    severity: "MEDIA",
    params: [],
    href: (payload) => (id(payload, "goalId") ? `/metas/${id(payload, "goalId")}` : "/metas"),
  },
  CONEXAO_ERRO: {
    label: "Conexão com erro",
    description: "Um banco parou de atualizar.",
    severity: "ALTA",
    params: [],
    href: () => "/config",
  },
  CONSENTIMENTO_EXPIRANDO: {
    label: "Consentimento expirando",
    description: "A autorização do Open Finance vai vencer.",
    severity: "MEDIA",
    params: [{ key: "diasAntes", label: "Avisar com (dias)", kind: "days", initial: 30, min: 1, max: 365 }],
    href: () => "/config",
  },
  SALDO_PROJETADO_NEGATIVO: {
    label: "Saldo projetado negativo",
    description: "A projeção fica negativa nos próximos meses.",
    severity: "ALTA",
    params: [{ key: "meses", label: "Olhar os próximos (meses)", kind: "months", initial: 3, min: 1, max: 11 }],
    href: () => "/projecao",
  },
  RESERVA_IMPOSTO_BAIXA: {
    label: "Reserva de imposto baixa",
    description: "A reserva de imposto não cobre as obrigações do mês (o DAS).",
    severity: "ALTA",
    params: [],
    href: () => "/reservas",
  },
  ENTRADA_SEM_STREAM: {
    label: "Entrada sem stream",
    description: "Dinheiro entrou e ainda não tem fonte de receita: as reservas não foram lançadas.",
    severity: "MEDIA",
    params: [],
    href: () => "/transacoes/revisar?tipo=entradas",
  },
  LIMITE_FATURAMENTO_MEI: {
    label: "Teto do MEI",
    description: "O faturamento da PJ no ano chega perto do teto do MEI.",
    severity: "ALTA",
    params: [
      { key: "limiteCents", label: "Teto anual", kind: "cents", initial: 8_100_000, min: 100, max: 1_000_000_000 },
      { key: "avisoBps", label: "Avisar a partir de (% do teto)", kind: "bps", initial: 8_000, min: 1_000, max: 10_000 },
    ],
    href: () => "/config/receitas",
  },
};

export const ALERT_TYPES = Object.keys(ALERT_CATALOG) as AlertType[];

/** Parâmetros da regra com os valores iniciais preenchidos e tudo dentro do intervalo permitido. */
export function readParams(type: AlertType, raw: unknown): Record<string, number> {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    ALERT_CATALOG[type].params.map((spec) => {
      const value = source[spec.key];
      const number = typeof value === "number" && Number.isInteger(value) ? value : spec.initial;
      return [spec.key, Math.min(spec.max, Math.max(spec.min, number))];
    }),
  );
}

export function alertHref(type: AlertType, payload: unknown): string {
  return ALERT_CATALOG[type].href(payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {});
}
