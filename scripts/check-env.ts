// Roda antes do `prisma migrate deploy` no `npm start`: se faltar variável, o log do deploy
// diz exatamente o que configurar, em vez do erro genérico do Prisma.
import { serverEnv } from "@/lib/env";

try {
  process.loadEnvFile();
} catch {
  // variáveis já no ambiente
}

try {
  serverEnv();
} catch (error) {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
  console.error("  No Railway: serviço do app → Variables.");
  console.error("    DATABASE_URL = ${{Postgres.DATABASE_URL}}   (o Postgres precisa estar no mesmo projeto)");
  console.error("    AUTH_SECRET  = saída de: openssl rand -base64 48\n");
  process.exit(1);
}
