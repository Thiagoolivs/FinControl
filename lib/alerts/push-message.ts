export type PushAlert = { id: string; type: string; title: string; body: string; href: string };

export type PushMessage = { title: string; body: string; tag: string; href: string; alertIds: string[] };

const MAX_LINES = 4;

/**
 * Uma notificação por sync: um alerta vai como está (tag do tipo, então a próxima do mesmo tipo
 * substitui); vários viram um resumo com uma tag só, que abre a central.
 */
export function buildPushMessage(alerts: readonly PushAlert[]): PushMessage | null {
  const [first] = alerts;
  if (!first) return null;
  if (alerts.length === 1) return { title: first.title, body: first.body, tag: `fincontrol:${first.type}`, href: first.href, alertIds: [first.id] };
  const lines = alerts.slice(0, MAX_LINES).map((alert) => alert.title);
  if (alerts.length > MAX_LINES) lines.push(`e mais ${alerts.length - MAX_LINES}`);
  return { title: `${alerts.length} alertas novos`, body: lines.join("\n"), tag: "fincontrol:alertas", href: "/alertas", alertIds: alerts.map((alert) => alert.id) };
}
