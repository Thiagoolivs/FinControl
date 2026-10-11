import { z } from "zod";

// Lido sob demanda: o build não pode falhar por falta de variável que só o runtime usa.
const schema = z.object({
  DATABASE_URL: z.string({ error: "não definida" }).min(1, "não definida"),
  AUTH_SECRET: z.string({ error: "não definida" }).min(32, "precisa de pelo menos 32 caracteres"),
  // Usuário de acesso, criado/atualizado no boot. O 2FA é configurado no primeiro login.
  LOGIN_USERNAME: z.string().trim().toLowerCase().min(3, "precisa de pelo menos 3 caracteres").optional(),
  LOGIN_PASSWORD: z.string().min(8, "precisa de pelo menos 8 caracteres").optional(),
  CRON_SECRET: z.string().min(32).optional(),
  PLUGGY_CLIENT_ID: z.string().optional(),
  PLUGGY_CLIENT_SECRET: z.string().optional(),
  // Só para testes locais contra um servidor falso; em produção fica vazia.
  PLUGGY_API_URL: z.url().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().trim().min(1).optional(), // nome do modelo, ex.: o flash mais recente
  // Só para testes locais contra um servidor falso; em produção fica vazia.
  GEMINI_API_URL: z.url().optional(),
  BRAPI_TOKEN: z.string().optional(),
  // Só para testes locais contra servidores falsos; em produção ficam vazias.
  BRAPI_API_URL: z.url().optional(),
  SGS_API_URL: z.url().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
}).refine((env) => Boolean(env.LOGIN_USERNAME) === Boolean(env.LOGIN_PASSWORD), {
  message: "defina LOGIN_USERNAME e LOGIN_PASSWORD juntas",
  path: ["LOGIN_PASSWORD"],
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (!cached) {
    const result = schema.safeParse(process.env);
    if (!result.success) {
      const problems = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      throw new Error(`Variáveis de ambiente inválidas — ${problems}`);
    }
    cached = result.data;
  }
  return cached;
}

/** Usado no boot do servidor: encerra o processo para o Railway marcar o deploy como falho. */
export function exitOnInvalidEnv(): void {
  try {
    serverEnv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
