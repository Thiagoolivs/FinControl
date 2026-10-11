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

/** Badge da aba Transações = tamanho da fila de revisão. */
function withBadges(reviewCount: number): NavItem[] {
  return ITEMS.map((item) =>
    item.href === "/transacoes" && reviewCount > 0
      ? { ...item, badge: reviewCount, badgeLabel: `${reviewCount} para revisar` }
      : item,
  );
}

export function AppTabBar({ reviewCount }: { reviewCount: number }) {
  return <TabBar items={withBadges(reviewCount)} activeHref={activeHref(usePathname())} />;
}

export function AppSideNav({ reviewCount }: { reviewCount: number }) {
  return <SideNav items={withBadges(reviewCount)} activeHref={activeHref(usePathname())} />;
}
