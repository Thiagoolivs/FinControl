import { headers } from "next/headers";
import { db } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { isPluggyConfigured } from "@/lib/pluggy/client";
import { createRateLimiter } from "@/lib/security/rate-limit";
import { bearerToken, secretsMatch } from "@/lib/security/secret";
import { syncUser } from "@/lib/sync/sync";

export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });

async function clientIp(): Promise<string> {
  const list = await headers();
  return list.get("x-real-ip") ?? list.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "desconhecido";
}

// Railway Cron → POST com `Authorization: Bearer $CRON_SECRET`. Lê todas as conexões, uma vez por dia.
export async function POST(request: Request) {
  const { CRON_SECRET } = serverEnv();
  if (!CRON_SECRET) return Response.json({ ok: false, error: "CRON_SECRET não definida" }, { status: 503 });
  if (!limiter.hit(await clientIp()).allowed) return Response.json({ ok: false, error: "rate limit" }, { status: 429 });
  const token = bearerToken(request.headers.get("authorization"));
  if (!token || !secretsMatch(token, CRON_SECRET)) return Response.json({ ok: false }, { status: 401 });
  if (!isPluggyConfigured()) return Response.json({ ok: false, error: "Pluggy não configurada" }, { status: 503 });

  const users = await db().connection.findMany({ distinct: ["userId"], select: { userId: true } });
  const report = [];
  let ok = true;
  for (const { userId } of users) {
    const result = await syncUser(userId, "CRON");
    if (result.status === "done" && result.outcomes.some((outcome) => !outcome.ok)) ok = false;
    report.push(
      result.status === "busy"
        ? { userId, busy: true }
        : {
            userId,
            transferencias: result.transferencias,
            conexoes: result.outcomes.map((outcome) =>
              outcome.ok ? { id: outcome.connectionId, ok: true, ...outcome.stats } : { id: outcome.connectionId, ok: false, erro: outcome.error },
            ),
          },
    );
  }
  return Response.json({ ok, usuarios: report }, { status: ok ? 200 : 207 });
}
