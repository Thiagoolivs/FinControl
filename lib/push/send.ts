import "server-only";
import webpush, { WebPushError } from "web-push";
import { alertHref } from "@/lib/alerts/catalog";
import { buildPushMessage, type PushMessage } from "@/lib/alerts/push-message";
import { db } from "@/lib/db";
import { serverEnv } from "@/lib/env";

/** As três variáveis VAPID juntas ligam o push. A pública vai ao navegador; a privada nunca sai daqui. */
export function vapidPublicKey(): string | null {
  const env = serverEnv();
  return env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT ? env.VAPID_PUBLIC_KEY : null;
}

export function isPushConfigured(): boolean {
  return vapidPublicKey() !== null;
}

let configured = false;

function configure(): boolean {
  const env = serverEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return false;
  if (!configured) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    configured = true;
  }
  return true;
}

/**
 * Manda para todos os aparelhos do usuário. Inscrição que o serviço de push diz que acabou (404/410)
 * é apagada na hora. Devolve quantos receberam.
 */
export async function sendPush(userId: string, message: Omit<PushMessage, "alertIds">, urgency: "normal" | "high" = "normal"): Promise<number> {
  if (!configure()) return 0;
  const subscriptions = await db().pushSubscription.findMany({ where: { userId }, select: { id: true, endpoint: true, p256dh: true, auth: true } });
  const payload = JSON.stringify({ title: message.title, body: message.body, tag: message.tag, href: message.href });
  let delivered = 0;
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, {
        TTL: 24 * 60 * 60,
        urgency,
        topic: message.tag.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 32),
      });
      delivered += 1;
      await db().pushSubscription.updateMany({ where: { id: subscription.id, userId }, data: { lastUsedAt: new Date() } });
    } catch (error) {
      if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
        await db().pushSubscription.deleteMany({ where: { id: subscription.id, userId } });
      } else {
        console.error("Push falhou:", error instanceof Error ? error.message : error);
      }
    }
  }
  return delivered;
}

/** Alertas novos deste sync cuja regra tem push ligado: uma notificação só, agrupada. */
export async function pushNewAlerts(userId: string, since: Date): Promise<number> {
  const alerts = await db().alert.findMany({
    where: { userId, pushedAt: null, readAt: null, createdAt: { gte: since }, alertRule: { push: true } },
    select: { id: true, type: true, title: true, body: true, payload: true, severity: true },
    orderBy: { createdAt: "asc" },
  });
  const message = buildPushMessage(alerts.map((alert) => ({ id: alert.id, type: alert.type, title: alert.title, body: alert.body, href: alertHref(alert.type, alert.payload) })));
  if (!message) return 0;
  const delivered = await sendPush(userId, message, alerts.some((alert) => alert.severity === "ALTA") ? "high" : "normal");
  if (delivered > 0) await db().alert.updateMany({ where: { userId, id: { in: message.alertIds } }, data: { pushedAt: new Date() } });
  return delivered;
}
