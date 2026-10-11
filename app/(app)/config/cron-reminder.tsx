import { formatElapsed } from "@/lib/dates";

/** Lembrete do serviço de cron no Railway: aparece até a primeira leitura automática e volta se ele parar. */
export function CronReminder({ lastRunAt, running }: { lastRunAt: Date | null; running: boolean }) {
  if (running) return null;
  return (
    <details className="group rounded-card bg-surface px-5 py-4">
      <summary className="flex min-h-11 cursor-pointer list-none flex-col justify-center gap-1">
        <span className="text-[15px] font-semibold text-warning">
          {lastRunAt ? `A leitura diária parou (última ${formatElapsed(lastRunAt)})` : "Falta configurar a leitura diária"}
        </span>
        <span className="text-[13px] leading-[18px] text-text-secondary">
          Sem o serviço de cron no Railway, os dados só atualizam pelo botão Atualizar. Toque para ver o passo a passo.
        </span>
      </summary>
      <ol className="m-0 mt-3 flex list-decimal flex-col gap-2 pl-5 text-[13px] leading-[19px] text-text-secondary">
        <li>
          No serviço do app, em Variables, crie <code className="text-text-primary">CRON_SECRET</code> (64 caracteres aleatórios).
        </li>
        <li>No mesmo projeto: New → GitHub Repo → este repositório de novo.</li>
        <li>
          No serviço novo, em Variables: <code className="break-all text-text-primary">APP_URL = https://${"{{"}app.RAILWAY_PUBLIC_DOMAIN{"}}"}</code>{" "}
          e <code className="break-all text-text-primary">CRON_SECRET = ${"{{"}app.CRON_SECRET{"}}"}</code>, trocando{" "}
          <code className="text-text-primary">app</code> pelo nome do serviço do app.
        </li>
        <li>
          Settings → Custom Start Command: <code className="text-text-primary">npm run cron -- sync</code>
        </li>
        <li>
          Settings → Cron Schedule: <code className="text-text-primary">0 9 * * *</code> (06:00 em Brasília). Sem domínio público.
        </li>
      </ol>
    </details>
  );
}
