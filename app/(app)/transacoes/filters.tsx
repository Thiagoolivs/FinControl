"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { ScopeToggle } from "@/components/ui/scope-toggle";
import type { ScopeFilter } from "@/components/ui/status";

type Option = { id: string; name: string };

const KINDS = [
  { value: "", label: "Tudo" },
  { value: "saidas", label: "Saídas" },
  { value: "entradas", label: "Entradas" },
  { value: "transferencias", label: "Transferências" },
] as const;

const SCOPE_PARAM: Record<ScopeFilter, string | null> = { TUDO: null, PF: "pf", PJ: "pj" };

const selectClass =
  "h-11 min-w-0 flex-1 appearance-none rounded-button bg-surface px-3 pr-8 text-[15px] text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** Busca e filtros na URL: o servidor filtra; a página continua funcionando com link compartilhado. */
export function TransactionFilters({
  categories,
  search,
  categoryId,
  kind,
  scope,
}: {
  categories: Option[];
  search: string;
  categoryId: string;
  kind: string;
  scope: ScopeFilter;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(search);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function update(changes: Record<string, string | null>) {
    const query = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    const next = query.toString();
    startTransition(() => router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false }));
  }
  function searchFor(value: string) {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => update({ q: value.trim() || null }), 350);
  }

  return (
    <div className={`flex flex-col gap-3 transition-opacity duration-200 ease-apple ${pending ? "opacity-60" : ""}`}>
      <ScopeToggle value={scope} onChange={(value) => update({ escopo: SCOPE_PARAM[value] })} />
      <label className="relative flex items-center">
        <span className="sr-only">Buscar na descrição</span>
        <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 text-text-secondary" />
        <input
          type="search"
          value={text}
          onChange={(event) => searchFor(event.target.value)}
          placeholder="Buscar"
          autoComplete="off"
          className="h-11 w-full rounded-button bg-surface pl-10 pr-3 text-[16px] text-text-primary outline-none placeholder:text-text-secondary focus-visible:ring-2 focus-visible:ring-accent"
        />
      </label>
      <div className="flex gap-2">
        <label className="relative flex min-w-0 flex-1">
          <span className="sr-only">Categoria</span>
          <select value={categoryId} onChange={(event) => update({ categoria: event.target.value || null })} className={selectClass}>
            <option value="">Categorias</option>
            <option value="sem">Sem categoria</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <Icon name="chevron-down" size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary" />
        </label>
        <label className="relative flex min-w-0 flex-1">
          <span className="sr-only">Tipo</span>
          <select value={kind} onChange={(event) => update({ tipo: event.target.value || null })} className={selectClass}>
            {KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Icon name="chevron-down" size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary" />
        </label>
      </div>
    </div>
  );
}
