import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { readSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export type CurrentUser = { id: string; email: string; name: string | null };

/** Única porta de entrada para "quem é o usuário". Redireciona se não houver sessão completa. */
export const requireUser = cache(async (): Promise<CurrentUser> => {
  const session = await readSession();
  if (session.status === "pending-mfa") redirect("/login/2fa");
  if (session.status === "none") redirect("/login");
  const user = await db().user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) redirect("/login");
  return user;
});
