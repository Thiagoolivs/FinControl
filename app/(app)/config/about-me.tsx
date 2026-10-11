"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "../actions";
import { updateAboutMeAction } from "./about-me-action";

const MAX = 600;

/** "Quem sou eu" do system prompt do chat. */
export function AboutMeForm({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => setState(await updateAboutMeAction(text)));
      }}
    >
      <label htmlFor="about-me" className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">
        Sobre você (para o chat)
      </label>
      <textarea
        id="about-me"
        value={text}
        maxLength={MAX}
        rows={3}
        onChange={(event) => setText(event.target.value)}
        placeholder="Ex.: PJ com salário fixo, abrindo um negócio; quero juntar para casar em 2027."
        className="w-full resize-none rounded-button bg-surface-elevated px-3 py-2.5 text-[16px] leading-[22px] text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <Button type="submit" variant="secondary" className="self-start" loading={pending}>
        Salvar
      </Button>
      {state.error ? <p role="alert" className="m-0 text-[13px] text-negative">{state.error}</p> : null}
      {state.notice ? <p role="status" className="m-0 text-[13px] text-text-secondary">{state.notice}</p> : null}
    </form>
  );
}
