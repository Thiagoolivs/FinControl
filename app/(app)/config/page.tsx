import { logoutAction } from "@/app/login/actions";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Button } from "@/components/ui/button";
import { RowLink } from "@/components/ui/row-link";
import { Eyebrow, ScopeTag } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/dal";
import { formatElapsed, localDateOf } from "@/lib/dates";
import { formatPercentBps } from "@/lib/finance/money";
import { isGeminiConfigured } from "@/lib/ai/gemini";
import { db } from "@/lib/db";
import { isPluggyConfigured } from "@/lib/pluggy/client";
import { vapidPublicKey } from "@/lib/push/send";
import { getConnections, getCronHealth } from "@/lib/queries/overview";
import { getDuplicateConnections } from "@/lib/sync/connections";
import { connectionAlertRules } from "@/lib/sync/alerts";
import { connectionIssues, STATUS_LABEL } from "../connection-health";
import { PAGE_CLASS, PageHeader } from "../page-header";
import { ConnectPanel, ReconnectButton, RemoveConnection, ScopeSwitch } from "./connect-panel";
import { CronReminder } from "./cron-reminder";
import { AboutMeForm } from "./about-me";
import { SavingsTargetForm } from "./savings-target";
import { InstallApp } from "./install-app";
import { NotificationSettings } from "./notifications";

const longDate = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function formatLocalDate(instant: Date): string {
  return longDate.format(new Date(`${localDateOf(instant)}T00:00:00Z`));
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export default async function ConfigPage({ searchParams }: PageProps<"/config">) {
  const user = await requireUser();
  const [connections, rules, cron, ruleCount, profile, duplicates] = await Promise.all([
    getConnections(user.id),
    connectionAlertRules(user.id),
    getCronHealth(user.id),
    db().rule.count({ where: { userId: user.id } }),
    db().user.findUnique({ where: { id: user.id }, select: { aboutMe: true, savingsTargetBps: true } }),
    getDuplicateConnections(user.id),
  ]);
  const aboutMe = profile?.aboutMe ?? null;
  const params = await searchParams;
  const removed = typeof params.removida === "string" ? params.removida.slice(0, 80) : null;
  const count = (value: string | string[] | undefined) => Math.max(0, Number.parseInt(typeof value === "string" ? value : "", 10) || 0);
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
            para cá. O app lê o que o Meu Pluggy já trouxe do banco: no cron e no botão Atualizar.
          </p>
        </div>

        {!configured ? (
          <AlertBanner
            severity="warning"
            title="Pluggy sem credenciais"
            body="Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET nas variáveis do serviço no Railway e reinicie."
          />
        ) : null}

        {removed ? (
          <p role="status" className="m-0 text-[15px] leading-[21px] text-text-secondary">
            {removed} removido daqui, com {plural(count(params.contas), "conta", "contas")} e {plural(count(params.lancamentos), "lançamento", "lançamentos")}.
          </p>
        ) : null}

        {configured && connections.length > 0 ? <CronReminder lastRunAt={cron.lastRunAt} running={cron.running} /> : null}

        {connections.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {connections.map((connection) => {
              const issues = connectionIssues(connection, rules.consent?.daysBefore ?? null);
              const lastRun = connection.syncRuns[0];
              const repeats = (duplicates.get(connection.id) ?? []).map((id) => connections.find((other) => other.id === id)).filter((other) => other !== undefined);
              const details = [
                connection.scope === "PJ" ? "Empresa (PJ)" : "Pessoa física",
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
                  {repeats.length > 0 ? (
                    <p className="m-0 text-[13px] leading-[18px] text-warning">
                      Mesmas contas de {repeats.map((other) => `${other.institutionName}${other.lastSyncAt ? ` (banco lido ${formatElapsed(other.lastSyncAt)})` : ""}`).join(", ")}: o saldo e
                      os gastos estão contando duas vezes. Remova a conexão repetida, de preferência a mais desatualizada.
                    </p>
                  ) : null}
                  {configured && issues.some((issue) => issue.reconnect) ? (
                    <ReconnectButton connectionId={connection.id} scope={connection.scope} />
                  ) : null}
                  <ScopeSwitch connectionId={connection.id} scope={connection.scope} />
                  <RemoveConnection connectionId={connection.id} institutionName={connection.institutionName} accounts={connection._count.accounts} />
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

      <section aria-labelledby="categorizacao" className="flex flex-col gap-2">
        <h2 id="categorizacao" className="m-0 text-[28px] font-light leading-8 tracking-[-0.02em]">
          Categorização
        </h2>
        <ul className="m-0 flex list-none flex-col p-0">
          <li>
            <RowLink href="/config/regras">
              <span className="flex flex-1 flex-col gap-[3px]">
                <span className="text-[16px]">Regras</span>
                <span className="text-[13px] text-text-secondary">
                  {ruleCount} {ruleCount === 1 ? "regra" : "regras"} · a primeira que casa decide a categoria
                </span>
              </span>
            </RowLink>
          </li>
          <li>
            <RowLink href="/config/categorias">
              <span className="flex flex-1 flex-col gap-[3px]">
                <span className="text-[16px]">Categorias</span>
                <span className="text-[13px] text-text-secondary">Renomear, criar e apagar</span>
              </span>
            </RowLink>
          </li>
          <li>
            <RowLink href="/config/receitas">
              <span className="flex flex-1 flex-col gap-[3px]">
                <span className="text-[16px]">Receitas e reservas</span>
                <span className="text-[13px] text-text-secondary">Streams, % de imposto e custo, DAS e saldos dos buckets</span>
              </span>
            </RowLink>
          </li>
        </ul>
        <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
          {isGeminiConfigured()
            ? "Sugestões da IA ligadas: as descrições das saídas sem categoria vão para o Gemini (Google), sem valores nem contas."
            : "Sugestões da IA desligadas. Para ligar, defina GEMINI_API_KEY e GEMINI_MODEL nas variáveis do Railway."}
        </p>
      </section>

      <section aria-labelledby="placar-titulo" id="placar" className="flex scroll-mt-6 flex-col gap-3">
        <h2 id="placar-titulo" className="m-0 text-[28px] font-light leading-8 tracking-[-0.02em]">
          Placar do mês
        </h2>
        <SavingsTargetForm initial={profile ? formatPercentBps(profile.savingsTargetBps) : ""} />
      </section>

      <section aria-labelledby="chat" className="flex flex-col gap-3">
        <h2 id="chat" className="m-0 text-[28px] font-light leading-8 tracking-[-0.02em]">
          Chat
        </h2>
        <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
          <strong className="font-semibold text-text-primary">O conteúdo do chat passa pela API do Gemini (Google)</strong>: o que você
          escreve, o texto abaixo, os nomes das suas categorias, metas e streams, e os números que a IA consulta para responder
          (saldos, gastos, metas, carteira). A IA só lê; não grava nada e não recomenda compra ou venda de investimento.
        </p>
        <AboutMeForm initial={aboutMe ?? ""} />
      </section>

      <section aria-labelledby="app" className="flex flex-col gap-3">
        <h2 id="app" className="m-0 text-[28px] font-light leading-8 tracking-[-0.02em]">
          App
        </h2>
        <InstallApp />
      </section>

      <section aria-labelledby="notificacoes" className="flex flex-col gap-3">
        <h2 id="notificacoes" className="m-0 text-[28px] font-light leading-8 tracking-[-0.02em]">
          Notificações
        </h2>
        <NotificationSettings publicKey={vapidPublicKey()} />
        <RowLink href="/config/alertas">
          <span className="flex flex-1 flex-col gap-[3px]">
            <span className="text-[16px]">Alertas</span>
            <span className="text-[13px] text-text-secondary">O que dispara, limites e o que vira notificação</span>
          </span>
        </RowLink>
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
