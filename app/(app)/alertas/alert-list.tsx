"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { useValuesHidden } from "@/components/ui/hide-values";
import { Icon } from "@/components/ui/icon";
import type { ActionState } from "../actions";
import { markAlertReadAction, markAllAlertsReadAction } from "./actions";

export type AlertItem = { id: string; severity: "BAIXA" | "MEDIA" | "ALTA"; title: string; body: string; when: string; read: boolean; href: string };

const MONEY = /[−-]?R\$\s?\d[\d.]*(?:,\d{2})?/g;

/** Texto do alerta guardado pronto; com "ocultar valores" ligado, os valores em reais viram máscara. */
export function AlertText({ text }: { text: string }) {
  const hidden = useValuesHidden();
  return <>{hidden ? text.replace(MONEY, "R$ ••••") : text}</>;
}

const SEVERITY_DOT = { ALTA: "bg-negative", MEDIA: "bg-warning", BAIXA: "bg-text-secondary" } as const;
const SEVERITY_LABEL = { ALTA: "alta", MEDIA: "média", BAIXA: "baixa" } as const;

/** Lista de alertas: tocar abre a tela do alerta e marca como lido. */
export function AlertList({ alerts }: { alerts: AlertItem[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {alerts.map((alert) => (
        <li key={alert.id}>
          <a
            href={alert.href}
            onClick={(event) => {
              event.preventDefault();
              startTransition(async () => {
                if (!alert.read) await markAlertReadAction(alert.id);
                router.push(alert.href);
              });
            }}
            className="flex min-h-11 items-start gap-3 py-3 text-text-primary no-underline"
          >
            <span
              aria-label={alert.read ? undefined : `Não lido, severidade ${SEVERITY_LABEL[alert.severity]}`}
              className={cn("mt-[7px] size-2 shrink-0 rounded-full", alert.read ? "bg-transparent" : SEVERITY_DOT[alert.severity])}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className={cn("text-[15px] leading-5", alert.read ? "font-normal text-text-secondary" : "font-medium")}>
                <AlertText text={alert.title} />
              </span>
              <span className="text-[13px] leading-[18px] text-text-secondary">
                <AlertText text={alert.body} />
              </span>
              <span className="text-[12px] text-text-secondary">{alert.when}</span>
            </span>
            <Icon name="chevron-right" size={14} strokeWidth={2} className="mt-1 shrink-0 text-text-tertiary" />
          </a>
        </li>
      ))}
    </ul>
  );
}

export function MarkAllRead() {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Button variant="link" className="self-start" loading={pending} onClick={() => startTransition(async () => setState(await markAllAlertsReadAction()))}>
        Marcar todos como lidos
      </Button>
      {state.notice ? <p role="status" className="m-0 text-[13px] text-text-secondary">{state.notice}</p> : null}
    </div>
  );
}
