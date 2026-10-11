"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { isPushConfigured, sendPush } from "@/lib/push/send";
import { createRateLimiter } from "@/lib/security/rate-limit";
import type { ActionState } from "../actions";

const testLimiter = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });

const subscriptionInput = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(1000),
  p256dh: z.string().min(1).max(200),
  auth: z.string().min(1).max(100),
});

/** Guarda a inscrição deste aparelho. O mesmo endpoint nunca vira duas linhas. */
export async function subscribePushAction(input: z.input<typeof subscriptionInput>): Promise<ActionState> {
  const user = await requireUser();
  if (!isPushConfigured()) return { error: "Push não configurado no servidor." };
  const parsed = subscriptionInput.safeParse(input);
  if (!parsed.success) return { error: "Inscrição inválida." };
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await db().pushSubscription.upsert({
    where: { endpoint: parsed.data.endpoint },
    create: { userId: user.id, ...parsed.data, userAgent },
    update: { userId: user.id, p256dh: parsed.data.p256dh, auth: parsed.data.auth, userAgent },
  });
  return { notice: "Notificações ligadas neste aparelho." };
}

export async function unsubscribePushAction(endpoint: string): Promise<ActionState> {
  const user = await requireUser();
  await db().pushSubscription.deleteMany({ where: { userId: user.id, endpoint } });
  return { notice: "Notificações desligadas neste aparelho." };
}

export async function testPushAction(): Promise<ActionState> {
  const user = await requireUser();
  if (!testLimiter.hit(user.id).allowed) return { error: "Muitos testes seguidos. Espere um pouco." };
  const delivered = await sendPush(user.id, {
    title: "Notificações ligadas",
    body: "É assim que os alertas vão chegar. Tocar abre a tela do alerta.",
    tag: "fincontrol:teste",
    href: "/alertas",
  });
  return delivered > 0
    ? { notice: delivered === 1 ? "Teste enviado." : `Teste enviado para ${delivered} aparelhos.` }
    : { error: "Nenhum aparelho recebeu. Ligue as notificações de novo." };
}
