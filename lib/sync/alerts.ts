import "server-only";
import type { AlertType, ConnectionStatus, Scope, Severity } from "@/generated/prisma/enums";
import { daysBetween, localDateOf, todayLocal } from "@/lib/dates";
import { activeAlertRules } from "@/lib/alerts/rules";
import { db } from "@/lib/db";
import { needsReconnect } from "@/lib/pluggy/normalize";

/** A partir de quantos % da média de 3 meses uma categoria fica laranja (e vira alerta). Null = regra desligada. */
export async function categoryOverThresholdBps(userId: string): Promise<number | null> {
  const rule = (await activeAlertRules(userId)).CATEGORIA_ACIMA_MEDIA;
  return rule ? (rule.params.limiteBps ?? null) : null;
}

type ConnectionRules = {
  error: { id: string; severity: Severity } | null;
  consent: { id: string; severity: Severity; daysBefore: number } | null;
};

/** Regras de alerta de conexão do usuário; cria as que ainda não existem com os valores iniciais. */
export async function connectionAlertRules(userId: string): Promise<ConnectionRules> {
  const rules = await activeAlertRules(userId);
  const error = rules.CONEXAO_ERRO;
  const consent = rules.CONSENTIMENTO_EXPIRANDO;
  return {
    error: error ? { id: error.id, severity: error.severity } : null,
    consent: consent ? { id: consent.id, severity: consent.severity, daysBefore: consent.params.diasAntes ?? 30 } : null,
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
