"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Eyebrow } from "@/components/ui/text";
import { type ActionState, registerConnectionFormAction } from "../actions";
import { usePluggyConnect } from "./use-pluggy-connect";

const SCOPES = [
  { value: "PF", label: "Pessoa física" },
  { value: "PJ", label: "Empresa (PJ)", tone: "pj" },
] as const;

const PHASE_LABEL = { abrindo: "Abrindo a Pluggy…", aberto: "Conclua a conexão na janela da Pluggy.", lendo: "Lendo contas e transações…" } as const;

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <p role="alert" className="m-0 text-[13px] leading-[18px] text-negative">{state.error}</p>;
  if (state.notice) return <p role="status" className="m-0 text-[13px] leading-[18px] text-positive">{state.notice}</p>;
  return null;
}

export function ConnectPanel() {
  const [scope, setScope] = useState<"PF" | "PJ">("PF");
  const widget = usePluggyConnect({ scope });
  const [manual, manualAction, manualPending] = useActionState(registerConnectionFormAction, {} satisfies ActionState);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Eyebrow as="p">De quem é a conta</Eyebrow>
        <SegmentedControl label="Escopo da nova conexão" options={SCOPES} value={scope} onChange={setScope} variant="boxed" />
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={widget.open} loading={widget.busy}>
          Conectar banco
        </Button>
        {widget.state.phase ? (
          <p role="status" className="m-0 text-[13px] text-text-secondary">
            {PHASE_LABEL[widget.state.phase]}
          </p>
        ) : (
          <Feedback state={widget.state} />
        )}
      </div>

      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-[15px] text-accent">
          Já conectou no painel da Pluggy? Use o ID do item
        </summary>
        <form action={manualAction} className="flex flex-col gap-3 pt-2">
          <input type="hidden" name="scope" value={scope} />
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-text-secondary">ID do item</span>
            <input
              name="itemId"
              required
              autoComplete="off"
              spellCheck={false}
              placeholder="1a2b3c4d-0000-0000-0000-000000000000"
              className="h-[50px] rounded-button bg-surface px-4 font-mono text-[15px] text-text-primary placeholder:text-text-tertiary"
            />
          </label>
          <Button type="submit" variant="secondary" loading={manualPending}>
            Adicionar item
          </Button>
          <Feedback state={manual} />
        </form>
      </details>
    </div>
  );
}

export function ReconnectButton({ connectionId, scope }: { connectionId: string; scope: "PF" | "PJ" }) {
  const widget = usePluggyConnect({ connectionId, scope });
  return (
    <div className="flex flex-col gap-1">
      <Button variant="link" className="self-start" onClick={widget.open} loading={widget.busy}>
        Reconectar
      </Button>
      {widget.state.phase ? (
        <p role="status" className="m-0 text-[13px] text-text-secondary">{PHASE_LABEL[widget.state.phase]}</p>
      ) : (
        <Feedback state={widget.state} />
      )}
    </div>
  );
}
