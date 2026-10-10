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

export function AppTabBar() {
  return <TabBar items={ITEMS} activeHref={activeHref(usePathname())} />;
}

export function AppSideNav() {
  return <SideNav items={ITEMS} activeHref={activeHref(usePathname())} />;
}
