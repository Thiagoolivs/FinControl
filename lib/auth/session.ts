import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { randomToken, sha256Hex } from "@/lib/auth/crypto";
import { db } from "@/lib/db";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Senha certa, TOTP pendente: janela curta.
const PENDING_MFA_TTL_MS = 10 * 60 * 1000;

export type SessionState =
  | { status: "none" }
  | { status: "pending-mfa"; sessionId: string; userId: string }
  | { status: "authenticated"; sessionId: string; userId: string };

async function writeCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function startPendingSession(
  userId: string,
  client: { userAgent: string | null; ip: string | null },
): Promise<void> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + PENDING_MFA_TTL_MS);
  await db().$transaction([
    db().session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } }),
    db().session.create({
      data: { userId, tokenHash: sha256Hex(token), expiresAt, userAgent: client.userAgent, ip: client.ip },
    }),
  ]);
  await writeCookie(token, expiresAt);
}

export async function readSession(): Promise<SessionState> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { status: "none" };
  const session = await db().session.findUnique({
    where: { tokenHash: sha256Hex(token) },
    select: { id: true, userId: true, expiresAt: true, mfaVerifiedAt: true },
  });
  if (!session || session.expiresAt <= new Date()) return { status: "none" };
  const base = { sessionId: session.id, userId: session.userId };
  return session.mfaVerifiedAt ? { status: "authenticated", ...base } : { status: "pending-mfa", ...base };
}

/** Troca o token ao elevar o privilégio da sessão (evita fixação de sessão). */
export async function completeMfa(sessionId: string): Promise<void> {
  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db().session.update({
    where: { id: sessionId },
    data: { tokenHash: sha256Hex(token), mfaVerifiedAt: now, lastSeenAt: now, expiresAt },
  });
  await writeCookie(token, expiresAt);
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db().session.deleteMany({ where: { tokenHash: sha256Hex(token) } });
  store.delete(SESSION_COOKIE);
}
