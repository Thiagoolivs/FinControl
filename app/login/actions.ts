"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TOTP_KEY_PURPOSE } from "@/lib/auth/constants";
import { decryptSecret } from "@/lib/auth/crypto";
import type { FormState } from "@/lib/auth/form-state";
import { burnPasswordCheck, verifyPassword } from "@/lib/auth/password";
import { completeMfa, endSession, readSession, startPendingSession } from "@/lib/auth/session";
import { isReplayedStep, matchTotpStep } from "@/lib/auth/totp";
import { db } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { createRateLimiter } from "@/lib/security/rate-limit";

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const loginByIpAndAccount = createRateLimiter({ limit: 5, windowMs: FIFTEEN_MINUTES });
const loginByAccount = createRateLimiter({ limit: 20, windowMs: FIFTEEN_MINUTES });
const loginByIp = createRateLimiter({ limit: 20, windowMs: FIFTEEN_MINUTES });
const totpBySession = createRateLimiter({ limit: 5, windowMs: FIFTEEN_MINUTES });

const INVALID_LOGIN = "Usuário ou senha incorretos.";
const TOO_MANY_ATTEMPTS = "Muitas tentativas. Tente de novo em alguns minutos.";
const CODE_ALREADY_USED = "Esse código já foi usado. Espere o próximo.";

const credentialsSchema = z.object({
  // Usuário (LOGIN_USERNAME) ou e-mail de quem foi criado pelo npm run user:create.
  login: z.string().trim().toLowerCase().min(1).max(320),
  password: z.string().min(1).max(1024),
});

const codeSchema = z.string().trim().regex(/^\d{6}$/);

async function clientInfo(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  // O Railway acrescenta o IP real no fim do X-Forwarded-For; o começo pode vir do cliente.
  const forwarded = h.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return {
    ip: h.get("x-real-ip") ?? forwarded ?? null,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  };
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const rawLogin = String(formData.get("login") ?? "");
  const parsed = credentialsSchema.safeParse({ login: rawLogin, password: formData.get("password") });
  if (!parsed.success) return { error: INVALID_LOGIN, login: rawLogin };
  const { login, password } = parsed.data;

  const client = await clientInfo();
  const ip = client.ip ?? "desconhecido";
  const allowed = [loginByIp.hit(ip), loginByAccount.hit(login), loginByIpAndAccount.hit(`${ip}|${login}`)].every((r) => r.allowed);
  if (!allowed) return { error: TOO_MANY_ATTEMPTS, login };

  const user = await db().user.findFirst({
    where: { OR: [{ username: login }, { email: login }] },
    select: { id: true, passwordHash: true, totpEnabledAt: true },
  });
  if (!user) {
    await burnPasswordCheck(password);
    return { error: INVALID_LOGIN, login };
  }
  if (!(await verifyPassword(user.passwordHash, password))) return { error: INVALID_LOGIN, login };

  loginByIpAndAccount.reset(`${ip}|${login}`);
  await startPendingSession(user.id, client);
  // Sem 2FA ainda: a sessão pendente só dá acesso à tela que mostra o QR.
  redirect(user.totpEnabledAt ? "/login/2fa" : "/login/2fa/configurar");
}

export async function verifyTotpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await readSession();
  if (session.status === "authenticated") redirect("/");
  if (session.status === "none") redirect("/login");

  if (!totpBySession.hit(session.sessionId).allowed) {
    await endSession();
    redirect("/login");
  }

  const code = codeSchema.safeParse(formData.get("code"));
  if (!code.success) return { error: "Digite os 6 dígitos do app autenticador." };

  const user = await db().user.findUnique({
    where: { id: session.userId },
    select: { totpSecretEnc: true, totpLastStep: true, totpEnabledAt: true },
  });
  if (!user?.totpSecretEnc) {
    await endSession();
    redirect("/login");
  }

  const secret = decryptSecret(user.totpSecretEnc, serverEnv().AUTH_SECRET, TOTP_KEY_PURPOSE);
  const step = matchTotpStep(secret, code.data);
  if (step === null) return { error: "Código inválido." };
  if (isReplayedStep(step, user.totpLastStep)) return { error: CODE_ALREADY_USED };

  // Grava o passo só se ainda for maior que o último: duas requisições com o mesmo código não passam.
  const claimed = await db().user.updateMany({
    where: { id: session.userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    // O primeiro código válido também conclui a configuração do 2FA.
    data: { totpLastStep: step, totpEnabledAt: user.totpEnabledAt ?? new Date() },
  });
  if (claimed.count !== 1) return { error: CODE_ALREADY_USED };

  totpBySession.reset(session.sessionId);
  await completeMfa(session.sessionId);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
