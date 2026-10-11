import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { getAlerts } from "@/lib/alerts/queries";
import { requireUser } from "@/lib/auth/dal";
import { formatMoment } from "@/lib/dates";
import { PAGE_CLASS, PageHeader } from "../page-header";
import { AlertList, MarkAllRead } from "./alert-list";

export default async function AlertsPage() {
  const user = await requireUser();
  const alerts = await getAlerts(user.id);
  const unread = alerts.filter((alert) => !alert.read).length;

  return (
    <main className={PAGE_CLASS}>
      <PageHeader title="Alertas" />
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[34px] font-light leading-10 tracking-[-0.03em]">
          {unread === 0 ? "Nada novo" : unread === 1 ? "1 alerta novo" : `${unread} alertas novos`}
        </h1>
        <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
          Avaliados a cada leitura dos bancos. O que dispara e o que vira notificação fica em{" "}
          <Link href="/config/alertas" className="text-accent no-underline">
            Config → Alertas
          </Link>
          .
        </p>
      </div>
      {unread > 0 ? <MarkAllRead /> : null}
      {alerts.length === 0 ? (
        <EmptyState title="Nenhum alerta ainda." description="Gasto alto, meta atrasada, saldo projetado negativo e o resto aparecem aqui." />
      ) : (
        <AlertList
          alerts={alerts.map((alert) => ({
            id: alert.id,
            severity: alert.severity,
            title: alert.title,
            body: alert.body,
            when: formatMoment(alert.createdAt),
            read: alert.read,
            href: alert.href,
          }))}
        />
      )}
    </main>
  );
}
