"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./icon";

export type AccountMenuLink = { href: string; label: string; icon: IconName };

/** Avatar no topo: abre Carteira e Config (e o que mais vier). Fecha com Esc ou toque fora. */
export function AccountMenu({ links }: { links: readonly AccountMenuLink[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Conta, carteira e configurações"
        onClick={() => setOpen(!open)}
        className="flex size-11 items-center justify-center rounded-full bg-surface text-text-primary"
      >
        <Icon name="user" size={20} strokeWidth={1.6} />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-[52px] z-40 flex min-w-52 flex-col rounded-card bg-surface-elevated p-2 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
          {links.map((link) => (
            <Link
              key={link.href}
              role="menuitem"
              href={link.href}
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-button px-3 text-[16px] text-text-primary no-underline transition-colors duration-200 ease-apple hover:bg-surface"
            >
              <Icon name={link.icon} size={18} strokeWidth={1.8} className="text-text-secondary" />
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
