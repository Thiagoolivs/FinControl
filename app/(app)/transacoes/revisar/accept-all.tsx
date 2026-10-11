"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "../../actions";
import { acceptAllSuggestionsAction } from "../actions";

/** Aceita todas as sugestões com categoria, com um passo de confirmação. */
export function AcceptAllButton({ groups, transactions }: { groups: number; transactions: number }) {
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <div className="flex flex-col gap-3 rounded-card bg-surface px-5 py-4">
          <p className="m-0 text-[15px] leading-[21px]">
            Criar {groups} {groups === 1 ? "regra" : "regras"} e categorizar {transactions} {transactions === 1 ? "transação" : "transações"} como a IA sugeriu?
          </p>
          <p className="m-0 text-[13px] leading-[18px] text-text-secondary">
            Dá para desfazer cada uma em Config → Regras. Grupos em que a IA não reconheceu a categoria ficam na fila.
          </p>
          <div className="flex gap-3">
            <Button
              className="flex-1"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  setState(await acceptAllSuggestionsAction());
                  setConfirming(false);
                })
              }
            >
              Aceitar todas
            </Button>
            <Button variant="link" disabled={pending} onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          Aceitar as {groups} sugestões
        </Button>
      )}
      {state.error ? <p role="alert" className="m-0 text-[13px] text-negative">{state.error}</p> : null}
      {state.notice ? <p role="status" className="m-0 text-[13px] text-text-secondary">{state.notice}</p> : null}
    </div>
  );
}
