"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ScopeToggle } from "@/components/ui/scope-toggle";
import type { ScopeFilter as ScopeValue } from "@/components/ui/status";

const TO_PARAM: Record<ScopeValue, string | null> = { TUDO: null, PF: "pf", PJ: "pj" };

/** Tudo / PF / PJ na URL (`?escopo=`): o servidor só soma PF e PJ quando não há filtro. */
export function ScopeFilter({ value }: { value: ScopeValue }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function change(next: ScopeValue) {
    const query = new URLSearchParams(params);
    const param = TO_PARAM[next];
    if (param) query.set("escopo", param);
    else query.delete("escopo");
    const search = query.toString();
    startTransition(() => router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false }));
  }

  return <ScopeToggle value={value} onChange={change} className={pending ? "opacity-60" : undefined} />;
}
