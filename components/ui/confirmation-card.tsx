"use client";

import { useState, useTransition } from "react";
import { Button } from "./button";
import { cn } from "./cn";
import { Icon, type IconName } from "./icon";
import { Eyebrow } from "./text";

export type ProposalStatus = "pending" | "confirmed" | "cancelled" | "expired";

type ConfirmationCardProps = {
  title: string;
  rows: { label: string; value: string; mono?: boolean }[];
  status?: ProposalStatus;
  error?: string;
  onConfirm?: () => Promise<void> | void;
  onCancel?: () => Promise<void> | void;
  /** elevated quando aparece dentro do chat, que já é superfície. */
  tone?: "surface" | "elevated";
};

const RESOLVED: Record<Exclude<ProposalStatus, "pending">, { icon: IconName; ink: string; text: string }> = {
  confirmed: { icon: "check", ink: "text-positive", text: "Confirmado. Registrado no histórico de alterações." },
  cancelled: { icon: "x", ink: "text-text-secondary", text: "Cancelado. Nada foi alterado." },
  expired: { icon: "info", ink: "text-text-secondary", text: "Esta proposta expirou. Peça de novo no chat." },
};

/** Proposta de escrita da IA: nada é gravado sem o clique em Confirmar. */
export function ConfirmationCard({ title, rows, status = "pending", error, onConfirm, onCancel, tone = "surface" }: ConfirmationCardProps) {
  const [isPending, startTransition] = useTransition();
  const [running, setRunning] = useState<"confirm" | "cancel" | null>(null);

  function run(kind: "confirm" | "cancel", action?: () => Promise<void> | void) {
    setRunning(kind);
    startTransition(async () => {
      await action?.();
      setRunning(null);
    });
  }

  return (
    <article
      aria-label={`Proposta: ${title}`}
      className={cn("flex flex-col gap-5 rounded-card px-5 pb-5 pt-6", tone === "surface" ? "bg-surface" : "bg-surface-elevated")}
    >
      <Eyebrow className="text-accent">Precisa da sua confirmação</Eyebrow>
      <h3 className="m-0 -mt-2 text-[26px] font-light leading-8 tracking-[-0.02em]">{title}</h3>
      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-[18px]">
        {rows.map((row) => (
          <div key={row.label} className="flex min-w-0 flex-col gap-1">
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">{row.label}</dt>
            <dd className={cn("m-0 break-words text-[15px]", row.mono && "font-mono text-[14px]")}>{row.value}</dd>
          </div>
        ))}
      </dl>
      {error ? (
        <p role="alert" className="m-0 flex items-start gap-2 text-[13px] text-negative">
          <Icon name="alert" size={16} strokeWidth={2} className="mt-px shrink-0" />
          {error}
        </p>
      ) : null}
      {status === "pending" ? (
        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="secondary" loading={isPending && running === "cancel"} disabled={isPending} onClick={() => run("cancel", onCancel)}>
            Cancelar
          </Button>
          <Button loading={isPending && running === "confirm"} disabled={isPending} onClick={() => run("confirm", onConfirm)}>
            Confirmar
          </Button>
        </div>
      ) : (
        <p className={cn("m-0 flex items-center gap-2 text-[15px]", RESOLVED[status].ink)}>
          <Icon name={RESOLVED[status].icon} size={16} strokeWidth={2.2} />
          {RESOLVED[status].text}
        </p>
      )}
    </article>
  );
}
