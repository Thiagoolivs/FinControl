import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { Catalog } from "./catalog";

export const metadata: Metadata = { title: "Componentes · FinControl" };

export default async function ComponentsPage() {
  await requireUser();
  return <Catalog />;
}
