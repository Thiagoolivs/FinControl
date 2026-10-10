// Sem "server-only": roda no instrumentation.ts, fora da árvore de Server Components.
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { serverEnv } from "@/lib/env";

export type EnvUserSync = "created" | "password-updated" | "unchanged" | "not-configured";

/**
 * Garante que o usuário de LOGIN_USERNAME existe e tem a senha de LOGIN_PASSWORD.
 * Trocar a senha nas variáveis e reiniciar atualiza o hash e derruba as sessões abertas.
 */
export async function syncEnvUser(): Promise<EnvUserSync> {
  const { LOGIN_USERNAME: username, LOGIN_PASSWORD: password } = serverEnv();
  if (!username || !password) return "not-configured";

  const existing = await db().user.findUnique({ where: { username }, select: { id: true, passwordHash: true } });
  if (!existing) {
    await db().user.create({ data: { username, passwordHash: await hashPassword(password) } });
    return "created";
  }
  if (await verifyPassword(existing.passwordHash, password)) return "unchanged";

  const passwordHash = await hashPassword(password);
  await db().$transaction([
    db().user.update({ where: { id: existing.id }, data: { passwordHash } }),
    db().session.deleteMany({ where: { userId: existing.id } }),
  ]);
  return "password-updated";
}
