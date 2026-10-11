import "server-only";
import { z } from "zod";
import type { AlertType, ConnectionStatus, Scope, Severity } from "@/generated/prisma/enums";
import { daysBetween, localDateOf, todayLocal } from "@/lib/dates";
import { db } from "@/lib/db";
import { needsReconnect } from "@/lib/pluggy/normalize";

type DefaultRule = { type: AlertType; severity: Severity; push: boolean; params: Record<string, number> };

// Valores iniciais: o usuário ajusta pela tela de regras de alerta (fase 7).
const DEFAULT_RULES: DefaultRule[] = [
  { type: "CONEXAO_ERRO", severity: "ALTA", push: true, params: {} },
  { type: "CONSENTIMENTO_EXPIRANDO", severity: "MEDIA", push: false, params: { diasAntes: 30 } },
  { type: "CATEGORIA_ACIMA_MEDIA", severity: "MEDIA", push: false, params: { limiteBps: 12_000 } },
];

/** Cria as regras de alerta que ainda não existem, com os valores iniciais. */
async function ensureAlertRules(userId: string): Promise<void> {
  const existing = await db().alertRule.findMany({ where: { userId }, select: { type: true } });
  const missing = DEFAULT_RULES.filter((rule) => !existing.some((row) => row.type === rule.type));
  if (missing.length > 0) await db().alertRule.createMany({ data: missing.map((rule) => ({ ...rule, userId })) });
}

const categoryParams = z.object({ limiteBps: z.number().int().min(10_000).max(100_000) });

/** A partir de quantos % da média de 3 meses uma categoria fica laranja (e vira alerta na fase 7). Null = regra desligada. */
export async function categoryOverThresholdBps(userId: string): Promise<number | null> {
  await ensureAlertRules(userId);
  const rule = await db().alertRule.findFirst({ where: { userId, type: "CATEGORIA_ACIMA_MEDIA", active: true }, orderBy: { createdAt: "asc" } });
  const params = rule ? categoryParams.safeParse(rule.params) : null;
  return params?.success ? params.data.limiteBps : null;
}

const consentParams = z.object({ diasAntes: z.number().int().min(1).max(365) });

type ConnectionRules = {
  error: { id: string; severity: Severity } | null;
  consent: { id: string; severity: Severity; daysBefore: number } | null;
};

/** Regras de alerta de conexão do usuário; cria as que ainda não existem com os valores iniciais. */
export async function connectionAlertRules(userId: string): Promise<ConnectionRules> {
  await ensureAlertRules(userId);
  const rules = await db().alertRule.findMany({
    where: { userId, type: { in: ["CONEXAO_ERRO", "CONSENTIMENTO_EXPIRANDO"] } },
    orderBy: { createdAt: "asc" },
  });
  const error = rules.find((rule) => rule.type === "CONEXAO_ERRO" && rule.active);
  const consent = rules.find((rule) => rule.type === "CONSENTIMENTO_EXPIRANDO" && rule.active);
  const params = consent ? consentParams.safeParse(consent.params) : null;
  return {
    error: error ? { id: error.id, severity: error.severity } : null,
    consent: consent && params?.success ? { id: consent.id, severity: consent.severity, daysBefore: params.data.diasAntes } : null,
  };
}

/** Dias até o consentimento vencer (negativo = já venceu). */
export function daysUntilConsentExpires(consentExpiresAt: Date, now: Date = new Date()): number {
  return daysBetween(todayLocal(now), localDateOf(consentExpiresAt));
}

type ConnectionFacts = {
  userId: string;
  connectionId: string;
  scope: Scope;
  institutionName: string;
  previousStatus: ConnectionStatus | null;
  status: ConnectionStatus;
  statusDetail: string | null;
  consentExpiresAt: Date | null;
};

/**
 * Erro de conexão vira alerta na transição para o erro (não a cada sync enquanto continuar quebrada).
 * Consentimento perto de vencer vira um alerta por data de vencimento.
 */
export async function raiseConnectionAlerts(facts: ConnectionFacts): Promise<void> {
  const rules = await connectionAlertRules(facts.userId);
  const alerts: {
    userId: string;
    alertRuleId: string;
    scope: Scope;
    type: AlertType;
    severity: Severity;
    title: string;
    body: string;
    payload: Record<string, string | number | null>;
    dedupeKey: string;
  }[] = [];

  const brokeNow = needsReconnect(facts.status) && (facts.previousStatus === null || !needsReconnect(facts.previousStatus));
  if (rules.error && brokeNow) {
    alerts.push({
      userId: facts.userId,
      alertRuleId: rules.error.id,
      scope: facts.scope,
      type: "CONEXAO_ERRO",
      severity: rules.error.severity,
      title: `${facts.institutionName}: conexão parou de atualizar`,
      body: `${facts.statusDetail ?? "A Pluggy não conseguiu ler o banco."} Reconecte em Config → Conexões para voltar a receber saldo e transações.`,
      payload: { connectionId: facts.connectionId, status: facts.status, detail: facts.statusDetail },
      dedupeKey: `CONEXAO_ERRO:${facts.connectionId}:${todayLocal()}`,
    });
  }

  if (rules.consent && facts.consentExpiresAt) {
    const days = daysUntilConsentExpires(facts.consentExpiresAt);
    if (days <= rules.consent.daysBefore) {
      const expiresOn = localDateOf(facts.consentExpiresAt);
      alerts.push({
        userId: facts.userId,
        alertRuleId: rules.consent.id,
        scope: facts.scope,
        type: "CONSENTIMENTO_EXPIRANDO",
        severity: rules.consent.severity,
        title:
          days > 0
            ? `${facts.institutionName}: consentimento vence em ${days} ${days === 1 ? "dia" : "dias"}`
            : `${facts.institutionName}: consentimento venceu`,
        body: "O Open Finance exige renovar a autorização a cada 12 meses. Renove em Config → Conexões para a sincronização não parar.",
        payload: { connectionId: facts.connectionId, consentExpiresOn: expiresOn, daysLeft: days },
        dedupeKey: `CONSENTIMENTO_EXPIRANDO:${facts.connectionId}:${expiresOn}`,
      });
    }
  }

  if (alerts.length > 0) await db().alert.createMany({ data: alerts, skipDuplicates: true });
}
