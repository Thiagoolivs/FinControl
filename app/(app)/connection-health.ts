import type { AlertSeverity } from "@/components/ui/alert-banner";
import type { ConnectionStatus } from "@/generated/prisma/enums";
import { daysUntilConsentExpires } from "@/lib/sync/alerts";
import type { ConnectionView } from "@/lib/queries/overview";

export const STATUS_LABEL: Record<ConnectionStatus, string> = {
  CREATED: "Conectando",
  UPDATING: "Atualizando no banco",
  UPDATED: "Em dia",
  WAITING_USER_INPUT: "Esperando você",
  LOGIN_ERROR: "Erro de login",
  OUTDATED: "Desatualizada",
};

export type ConnectionIssue = {
  connectionId: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  /** Resolve reconectando pelo widget (modo atualização do mesmo item). */
  reconnect: boolean;
};

/** O que a conexão precisa do usuário agora, do mais grave para o menos. */
export function connectionIssues(connection: ConnectionView, consentWarningDays: number | null): ConnectionIssue[] {
  const issues: ConnectionIssue[] = [];
  const name = connection.institutionName;
  if (connection.status === "LOGIN_ERROR" || connection.status === "OUTDATED") {
    issues.push({
      connectionId: connection.id,
      severity: "critical",
      title: `${name}: conexão com erro`,
      body: `${connection.statusDetail ?? "A Pluggy não consegue ler o banco."} Reconecte para voltar a atualizar.`,
      reconnect: true,
    });
  } else if (connection.status === "WAITING_USER_INPUT") {
    issues.push({
      connectionId: connection.id,
      severity: "warning",
      title: `${name}: esperando confirmação`,
      body: "O banco pediu uma confirmação sua. Reconecte para concluir.",
      reconnect: true,
    });
  }
  const lastRun = connection.syncRuns[0];
  if (lastRun?.status === "ERRO") {
    issues.push({
      connectionId: connection.id,
      severity: "warning",
      title: `${name}: a última leitura falhou`,
      body: lastRun.error ?? "Erro desconhecido.",
      reconnect: false,
    });
  }
  if (consentWarningDays !== null && connection.consentExpiresAt) {
    const days = daysUntilConsentExpires(connection.consentExpiresAt);
    if (days <= consentWarningDays) {
      issues.push({
        connectionId: connection.id,
        severity: days <= 7 ? "critical" : "warning",
        title: days > 0 ? `${name}: consentimento vence em ${days} ${days === 1 ? "dia" : "dias"}` : `${name}: consentimento venceu`,
        body: "O Open Finance pede renovação a cada 12 meses. Reconecte para renovar sem perder o histórico.",
        reconnect: true,
      });
    }
  }
  return issues;
}
