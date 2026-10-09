import Link from "next/link";
import { cn } from "./cn";
import { Icon, type IconName } from "./icon";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  badge?: number;
  /** Lido pelo leitor de tela junto do rótulo: "2 alertas não lidos". */
  badgeLabel?: string;
};

function accessibleName(item: NavItem): string {
  return item.badge ? `${item.label}, ${item.badgeLabel ?? item.badge}` : item.label;
}

function Badge({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-badge px-[5px] text-[11px] font-bold text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Tab bar do celular: 4 itens fixos no rodapé, respeitando a safe area. */
export function TabBar({ items, activeHref, fixed = true }: { items: NavItem[]; activeHref: string; fixed?: boolean }) {
  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        "grid grid-cols-4 bg-bg/85 px-2 pt-1.5 backdrop-blur-xl",
        fixed ? "fixed inset-x-0 bottom-0 z-30 pb-[calc(env(safe-area-inset-bottom)+4px)] lg:hidden" : "rounded-card pb-1.5",
      )}
    >
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={accessibleName(item)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-[49px] flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-[0.02em] no-underline transition-colors duration-200 ease-apple",
              active ? "text-text-primary" : "text-text-secondary",
            )}
          >
            <Icon name={item.icon} size={24} strokeWidth={1.6} />
            <span>{item.label}</span>
            {item.badge ? (
              <span className="absolute left-[calc(50%+6px)] top-0">
                <Badge count={item.badge} />
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Navegação lateral do desktop: a mesma lista, ao lado da coluna central de 720px. */
export function SideNav({ items, activeHref }: { items: NavItem[]; activeHref: string }) {
  return (
    <nav aria-label="Navegação principal" className="flex w-56 flex-col gap-1">
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={accessibleName(item)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-3 rounded-button px-3 text-[15px] no-underline transition-colors duration-200 ease-apple",
              active ? "bg-text-primary/8 font-semibold text-text-primary" : "text-text-secondary hover:text-text-primary",
            )}
          >
            <Icon name={item.icon} size={20} strokeWidth={1.6} />
            <span className="flex-1">{item.label}</span>
            {item.badge ? <Badge count={item.badge} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Avatar no topo: leva para Carteira e Config. */
export function AccountButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="Conta, carteira e configurações"
      className="flex size-11 items-center justify-center rounded-full bg-surface text-text-primary"
    >
      <Icon name="user" size={20} strokeWidth={1.6} />
    </Link>
  );
}
