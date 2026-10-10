// Railway Cron: serviço separado que roda `npm run cron -- sync` no horário agendado e encerra.
// Chama a rota protegida do app; código de saída ≠ 0 marca a execução como falha no Railway.
const JOBS = ["sync"] as const;

const job = process.argv[2];
const appUrl = process.env.APP_URL?.replace(/\/$/, "");
const secret = process.env.CRON_SECRET;

if (!JOBS.includes(job as (typeof JOBS)[number])) {
  console.error(`Uso: npm run cron -- <${JOBS.join("|")}>`);
  process.exit(1);
}
if (!appUrl || !secret) {
  console.error("Defina APP_URL (endereço público do app) e CRON_SECRET (o mesmo do app) neste serviço.");
  process.exit(1);
}

async function main(url: string, token: string): Promise<boolean> {
  const response = await fetch(`${url}/api/cron/${job}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  const body = await response.text();
  console.log(`${response.status} ${body}`);
  return response.ok && (JSON.parse(body) as { ok?: boolean }).ok === true;
}

main(appUrl, secret).then(
  (ok) => process.exit(ok ? 0 : 1),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
