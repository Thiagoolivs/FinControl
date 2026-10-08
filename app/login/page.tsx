import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await readSession();
  if (session.status === "authenticated") redirect("/");

  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center gap-10 px-5 py-16">
      <header className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-text-secondary">FinControl</span>
        <h1 className="text-[34px] font-light leading-10 tracking-[-0.03em]">Entrar</h1>
      </header>
      <LoginForm />
    </main>
  );
}
