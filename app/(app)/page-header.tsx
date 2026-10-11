import type { ReactNode } from "react";
import { AccountButton } from "@/components/ui/navigation";
import { Eyebrow } from "@/components/ui/text";
import { HideValuesButton } from "./privacy";

/** Cabeçalho das telas: rótulo da tela à esquerda, avatar (Carteira e Config) à direita. */
export function PageHeader({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return (
    <header className="flex min-h-11 items-center justify-between gap-3">
      <Eyebrow as="h1">{title}</Eyebrow>
      <div className="flex items-center gap-2">
        {trailing}
        <HideValuesButton />
        <AccountButton href="/config" />
      </div>
    </header>
  );
}

export const PAGE_CLASS = "flex flex-col gap-9 px-5 pt-[calc(env(safe-area-inset-top)+16px)] lg:pt-[calc(env(safe-area-inset-top)+56px)]";
