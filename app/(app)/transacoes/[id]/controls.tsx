"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Eyebrow } from "@/components/ui/text";
import type { ActionState } from "../../actions";
import { setCategoryAction, setIgnoredAction } from "../actions";

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <p role="alert" className="m-0 text-[13px] text-negative">{state.error}</p>;
  if (state.notice) return <p role="status" className="m-0 text-[13px] text-text-secondary">{state.notice}</p>;
  return null;
}

export function CategorySelect({
  transactionId,
  categoryId,
  options,
}: {
  transactionId: string;
  categoryId: string | null;
  options: { id: string; name: string }[];
}) {
  const [value, setValue] = useState(categoryId ?? "");
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <label className="relative flex">
        <span className="sr-only">Categoria</span>
        <select
          value={value}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.value;
            setValue(next);
            startTransition(async () => setState(await setCategoryAction({ transactionId, categoryId: next || null })));
          }}
          className="h-[50px] w-full appearance-none rounded-button bg-surface px-4 pr-10 text-[16px] text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
        >
          <option value="">Sem categoria (fila de revisão)</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary" />
      </label>
      <Feedback state={state} />
    </div>
  );
}

export function UnpairButton({ transactionId }: { transactionId: string }) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="link"
        className="self-start"
        loading={pending}
        onClick={() => startTransition(async () => setState(await setCategoryAction({ transactionId, categoryId: null })))}
      >
        Não é transferência
      </Button>
      <Feedback state={state} />
    </div>
  );
}

export function IgnoreSwitch({ transactionId, ignored }: { transactionId: string; ignored: boolean }) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
        <span className="flex flex-col gap-0.5">
          <Eyebrow as="span">Ignorar</Eyebrow>
          <span className="text-[13px] text-text-secondary">Fica fora dos totais e da fila (ex.: lançamento duplicado do banco).</span>
        </span>
        <span className="relative shrink-0">
          <input
            type="checkbox"
            role="switch"
            checked={ignored}
            disabled={pending}
            onChange={(event) => {
              const next = event.target.checked;
              startTransition(async () => setState(await setIgnoredAction({ transactionId, ignored: next })));
            }}
            className="peer sr-only"
          />
          <span aria-hidden="true" className="block h-[31px] w-[51px] rounded-full bg-text-primary/20 transition-colors duration-200 ease-apple peer-checked:bg-positive peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
          <span aria-hidden="true" className="absolute left-0.5 top-0.5 size-[27px] rounded-full bg-white shadow transition-transform duration-200 ease-apple peer-checked:translate-x-5" />
        </span>
      </label>
      <Feedback state={state} />
    </div>
  );
}
