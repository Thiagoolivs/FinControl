"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/auth/form-state";
import { verifyTotpAction } from "../actions";

const initialState: FormState = {};

export function TotpForm() {
  const [state, formAction, pending] = useActionState(verifyTotpAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <label className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-text-secondary">Código</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          className="h-[56px] rounded-button bg-surface px-4 text-center text-[28px] font-light tracking-[0.3em] text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </label>
      {state.error ? (
        <p role="alert" className="text-[15px] text-negative">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="h-[50px] rounded-button bg-accent-fill text-[17px] font-medium text-white transition-opacity duration-200 ease-apple disabled:opacity-60"
      >
        {pending ? "Verificando…" : "Verificar"}
      </button>
    </form>
  );
}
