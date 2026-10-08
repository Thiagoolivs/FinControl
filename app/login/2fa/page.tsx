import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import { TotpForm } from "./totp-form";

export default async function TwoFactorPage() {
  const session = await readSession();
  if (session.status === "authenticated") redirect("/");
  if (session.status === "none") redirect("/login");

  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center gap-10 px-5 py-16">
      <header className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-text-secondary">FinControl</span>
        <h1 className="text-[34px] font-light leading-10 tracking-[-0.03em]">Verificação</h1>
        <p className="text-[15px] text-text-secondary">Digite o código de 6 dígitos do seu app autenticador.</p>
      </header>
      <TotpForm />
      <Link href="/login" className="flex min-h-11 items-center self-start text-[15px] text-accent">
        Voltar
      </Link>
    </main>
  );
}
