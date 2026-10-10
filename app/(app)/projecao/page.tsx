import { EmptyState } from "@/components/ui/empty-state";
import { PAGE_CLASS, PageHeader } from "../page-header";

export default function Page() {
  return (
    <main className={PAGE_CLASS}>
      <PageHeader title="Projeção" />
      <EmptyState title="Ainda não." description="A projeção de 12 meses, com premissas e a linha do negócio, chega na fase 5." />
    </main>
  );
}
