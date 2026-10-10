import { logoutAction } from "@/app/login/actions";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Button } from "@/components/ui/button";
import { Eyebrow, ScopeTag } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/dal";
import { formatElapsed, localDateOf } from "@/lib/dates";
import { isPluggyConfigured } from "@/lib/pluggy/client";
import { getConnections } from "@/lib/queries/overview";
import { connectionAlertRules } from "@/lib/sync/alerts";
import { connectionIssues, STATUS_LABEL } from "../connection-health";
import { PAGE_CLASS, PageHeader } from "../page-header";
import { ConnectPanel, ReconnectButton } from "./connect-panel";

const longDate = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function formatLocalDate(instant: Date): string {
  return longDate.format(new Date(`${localDateOf(instant)}T00:00:00Z`));
}

export default async function ConfigPage() {
  const user = await requireUser();
  const [connections, rules] = await Promise.all([getConnections(user.id), connectionAlertRules(user.id)]);
  const configured = isPluggyConfigured();

  return (
    <main className={PAGE_CLASS}>
      <PageHeader title="Config" />

      <section aria-labelledby="conexoes" className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h2 id="conexoes" className="m-0 text-[28px] font-light leading-8 tracking-[-0.02em]">
            Conexões
          </h2>
          <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
            No plano gratuito a Pluggy só libera o MeuPluggy: conecte seus bancos em meu.pluggy.ai e depois traga cada um
            para cá. A leitura automática roda uma vez por dia.
          </p>
        </div>

        {!configured ? (
          <AlertBanner
            severity="warning"
            title="Pluggy sem credenciais"
            body="Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET nas variáveis do serviço no Railway e reinicie."
          />
        ) : null}

        {connections.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {connections.map((connection) => {
              const issues = connectionIssues(connection, rules.consent?.daysBefore ?? null);
              const lastRun = connection.syncRuns[0];
              const details = [
                STATUS_LABEL[connection.status],
                `${connection._count.accounts} ${connection._count.accounts === 1 ? "conta" : "contas"}`,
                connection.lastSyncAt ? `banco lido ${formatElapsed(connection.lastSyncAt)}` : null,
              ].filter(Boolean);
              return (
                <li key={connection.id} className="flex flex-col gap-2 rounded-card bg-surface px-5 py-4">
                  <div className="flex items-center gap-2 text-[16px] font-medium">
                    {connection.institutionName}
                    <ScopeTag scope={connection.scope} />
                  </div>
                  <p className="m-0 text-[13px] leading-[18px] text-text-secondary">{details.join(" · ")}</p>
                  {connection.consentExpiresAt ? (
                    <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
                      Consentimento até {formatLocalDate(connection.consentExpiresAt)}
                    </p>
                  ) : null}
                  {lastRun ? (
                    <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
                      Última leitura {formatElapsed(lastRun.startedAt)}: {lastRun.status === "SUCESSO" ? "ok" : lastRun.status === "ERRO" ? "falhou" : "em andamento"}
                    </p>
                  ) : null}
                  {issues.map((issue) => (
                    <p key={issue.title} className={issue.severity === "critical" ? "m-0 text-[13px] text-negative" : "m-0 text-[13px] text-warning"}>
                      {issue.title}. {issue.body}
                    </p>
                  ))}
                  {configured && issues.some((issue) => issue.reconnect) ? (
                    <ReconnectButton connectionId={connection.id} scope={connection.scope} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {configured ? (
          <div className="flex flex-col gap-3">
            <Eyebrow as="h3">{connections.length > 0 ? "Outro banco" : "Primeiro banco"}</Eyebrow>
            {connections.length > 0 ? (
              <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
                Para um banco que já está acima, use Reconectar nele. Conectar de novo cria um item duplicado e gasta a cota da Pluggy.
              </p>
            ) : null}
            <ConnectPanel />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="conta" className="flex flex-col gap-3">
        <h2 id="conta" className="m-0 text-[28px] font-light leading-8 tracking-[-0.02em]">
          Conta
        </h2>
        <p className="m-0 text-[15px] text-text-secondary">
          Entrou como <span className="text-text-primary">{user.username ?? user.email}</span> · 2FA ativo
        </p>
        <form action={logoutAction}>
          <Button type="submit" variant="secondary">
            Sair
          </Button>
        </form>
      </section>
    </main>
  );
}
