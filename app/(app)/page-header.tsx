import type { ReactNode } from "react";
import { HideValuesButton } from "@/components/ui/hide-values";
import { AccountMenu } from "@/components/ui/account-menu";
import { Eyebrow } from "@/components/ui/text";

const ACCOUNT_LINKS = [
  { href: "/contas", label: "Contas", icon: "bank" },
  { href: "/carteira", label: "Carteira", icon: "wallet" },
  { href: "/alertas", label: "Alertas", icon: "bell" },
  { href: "/config", label: "Config", icon: "sliders" },
] as const;

/** Cabeçalho das telas: rótulo da tela à esquerda, avatar (Carteira e Config) à direita. */
export function PageHeader({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return (
    <header className="flex min-h-11 items-center justify-between gap-3">
      <Eyebrow as="h1">{title}</Eyebrow>
      <div className="flex items-center gap-2">
        {trailing}
        <HideValuesButton />
        <AccountMenu links={ACCOUNT_LINKS} />
      </div>
    </header>
  );
}

export const PAGE_CLASS = "flex flex-col gap-9 px-5 pt-[calc(env(safe-area-inset-top)+16px)] lg:pt-[calc(env(safe-area-inset-top)+56px)]";
