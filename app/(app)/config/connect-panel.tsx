"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Eyebrow } from "@/components/ui/text";
import { type ActionState, changeConnectionScopeAction, registerConnectionFormAction, removeConnectionAction } from "../actions";
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

/** Corrige PF ↔ PJ de uma conexão. Pede confirmação: muda contas e transações juntas. */
export function ScopeSwitch({ connectionId, scope }: { connectionId: string; scope: "PF" | "PJ" }) {
  const target = scope === "PF" ? "PJ" : "PF";
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <div className="flex flex-col gap-1">
        <Button variant="link" className="self-start" onClick={() => setConfirming(true)}>
          Mudar para {target === "PJ" ? "PJ (empresa)" : "PF (pessoa física)"}
        </Button>
        <Feedback state={state} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 pt-1">
      <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
        As contas e todas as transações desta conexão passam para {target}. Dá para voltar depois.
      </p>
      <div className="flex gap-3">
        <Button
          variant="secondary"
          className="h-11"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              setState(await changeConnectionScopeAction({ connectionId, scope: target }));
              setConfirming(false);
            })
          }
        >
          Mudar para {target}
        </Button>
        <Button variant="link" onClick={() => setConfirming(false)} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/** Remover a conexão daqui (com contas e transações). Pede confirmação: não dá para desfazer. */
export function RemoveConnection({ connectionId, institutionName, accounts }: { connectionId: string; institutionName: string; accounts: number }) {
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <div className="flex flex-col gap-1">
        <Button variant="link" className="self-start text-negative" onClick={() => setConfirming(true)}>
          Remover conexão
        </Button>
        <Feedback state={state} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 pt-1">
      <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
        Sai daqui {institutionName}, com {accounts === 1 ? "a conta" : `as ${accounts} contas`} e todas as transações desta conexão. Não dá para
        desfazer; para trazer de volta, conecte de novo. No Meu Pluggy o banco continua conectado.
      </p>
      <div className="flex gap-3">
        <Button
          variant="secondary"
          className="h-11 text-negative"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              setState(await removeConnectionAction(connectionId));
              setConfirming(false);
            })
          }
        >
          Remover de vez
        </Button>
        <Button variant="link" onClick={() => setConfirming(false)} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
