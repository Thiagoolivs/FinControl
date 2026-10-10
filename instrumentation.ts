// No boot do servidor: valida as variáveis (deploy mal configurado falha com a lista do que falta)
// e sincroniza o usuário de LOGIN_USERNAME/LOGIN_PASSWORD.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { exitOnInvalidEnv } = await import("@/lib/env");
  exitOnInvalidEnv();

  const { syncEnvUser } = await import("@/lib/auth/env-user");
  const messages = {
    created: "Usuário de LOGIN_USERNAME criado. O 2FA é configurado no primeiro login.",
    "password-updated": "Senha de LOGIN_USERNAME atualizada; sessões abertas foram encerradas.",
    unchanged: null,
    "not-configured": "LOGIN_USERNAME e LOGIN_PASSWORD não definidas: só usuários criados pelo npm run user:create conseguem entrar.",
  } as const;
  try {
    const message = messages[await syncEnvUser()];
    if (message) console.log(message);
  } catch (error) {
    console.error("Não foi possível sincronizar o usuário de LOGIN_USERNAME:", error);
  }
}
