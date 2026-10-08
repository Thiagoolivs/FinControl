// Compartilhado com o proxy.ts, que não pode importar módulos server-only com banco.
export const SESSION_COOKIE = "fc_session";

// Finalidade da chave derivada de AUTH_SECRET que cifra o segredo TOTP.
export const TOTP_KEY_PURPOSE = "totp-secret";
