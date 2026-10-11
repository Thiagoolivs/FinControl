"use client";

import { usePathname } from "next/navigation";
import { type NavItem, SideNav, TabBar } from "@/components/ui/navigation";

const ITEMS: NavItem[] = [
  { href: "/", label: "Hoje", icon: "home" },
  { href: "/transacoes", label: "Transações", icon: "list" },
  { href: "/metas", label: "Metas", icon: "target" },
  { href: "/projecao", label: "Projeção", icon: "chart" },
];

function activeHref(pathname: string): string {
  return ITEMS.find((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)))?.href ?? "";
}

type Counts = { reviewCount: number; alertCount: number };

/** Badge da Hoje = alertas não lidos; da Transações = tamanho da fila de revisão. */
function withBadges({ reviewCount, alertCount }: Counts): NavItem[] {
  return ITEMS.map((item) =>
    item.href === "/transacoes" && reviewCount > 0
      ? { ...item, badge: reviewCount, badgeLabel: `${reviewCount} para revisar` }
      : item.href === "/" && alertCount > 0
        ? { ...item, badge: alertCount, badgeLabel: `${alertCount} ${alertCount === 1 ? "alerta novo" : "alertas novos"}` }
        : item,
  );
}

export function AppTabBar(counts: Counts) {
  return <TabBar items={withBadges(counts)} activeHref={activeHref(usePathname())} />;
}

export function AppSideNav(counts: Counts) {
  return <SideNav items={withBadges(counts)} activeHref={activeHref(usePathname())} />;
}
