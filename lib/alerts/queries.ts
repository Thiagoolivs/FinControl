import "server-only";
import type { AlertType, Severity } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { alertHref } from "./catalog";

export type AlertView = { id: string; type: AlertType; severity: Severity; title: string; body: string; createdAt: Date; read: boolean; href: string };

export async function countUnreadAlerts(userId: string): Promise<number> {
  return db().alert.count({ where: { userId, readAt: null } });
}

/** Central de alertas: mais recentes primeiro. */
export async function getAlerts(userId: string, options: { unreadOnly?: boolean; limit?: number } = {}): Promise<AlertView[]> {
  const rows = await db().alert.findMany({
    where: { userId, ...(options.unreadOnly ? { readAt: null } : {}) },
    select: { id: true, type: true, severity: true, title: true, body: true, payload: true, createdAt: true, readAt: true },
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 100,
  });
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt,
    read: row.readAt !== null,
    href: alertHref(row.type, row.payload),
  }));
}

export async function markAlertsRead(userId: string, ids: readonly string[] | "all"): Promise<number> {
  const updated = await db().alert.updateMany({
    where: { userId, readAt: null, ...(ids === "all" ? {} : { id: { in: [...ids] } }) },
    data: { readAt: new Date() },
  });
  return updated.count;
}
