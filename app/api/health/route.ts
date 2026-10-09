import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Healthcheck do Railway: responde 503 se o banco não estiver acessível.
export async function GET() {
  try {
    await db().$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
