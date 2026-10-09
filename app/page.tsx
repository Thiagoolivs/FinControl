import { logoutAction } from "@/app/login/actions";
import { requireUser } from "@/lib/auth/dal";

export default async function HojePage() {
  await requireUser();

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-9 px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
      <header className="flex items-center justify-between">
        <h1 className="text-xs font-semibold uppercase tracking-[0.1em] text-text-secondary">Hoje</h1>
        <form action={logoutAction}>
          <button type="submit" className="flex min-h-11 items-center px-1 text-[15px] text-accent">
            Sair
          </button>
        </form>
      </header>
      <section aria-label="Disponível" className="flex flex-col gap-2.5">
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-text-secondary">Disponível</span>
        <p aria-hidden="true" className="text-[72px] font-light leading-[76px] tracking-[-0.045em] text-text-tertiary">
          —
        </p>
        <p className="text-[15px] text-text-secondary">Nenhuma conta conectada ainda.</p>
      </section>
    </main>
  );
}
