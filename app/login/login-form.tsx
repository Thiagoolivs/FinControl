"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/auth/form-state";
import { loginAction } from "./actions";

const initialState: FormState = {};

const labelClass = "text-xs font-semibold uppercase tracking-[0.1em] text-text-secondary";
const inputClass =
  "h-[50px] rounded-button bg-surface px-4 text-[17px] text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <label className="flex flex-col gap-2">
        <span className={labelClass}>E-mail</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className={labelClass}>Senha</span>
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
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
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
