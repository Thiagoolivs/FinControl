import { defineConfig } from "prisma/config";

// Prisma 7 não carrega .env sozinho. Em produção as variáveis vêm do Railway.
try {
  process.loadEnvFile();
} catch {
  // sem .env local
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // `env()` lançaria erro no `prisma generate` do build quando não há banco; só migrate precisa da URL.
  datasource: { url: process.env.DATABASE_URL },
});
