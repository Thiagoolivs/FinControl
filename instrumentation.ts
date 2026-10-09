// Valida as variáveis de ambiente quando o servidor sobe: deploy mal configurado
// falha no boot com a lista do que falta, em vez de quebrar no primeiro login.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { exitOnInvalidEnv } = await import("@/lib/env");
  exitOnInvalidEnv();
}
