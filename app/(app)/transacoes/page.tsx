import { EmptyState } from "@/components/ui/empty-state";
import { PAGE_CLASS, PageHeader } from "../page-header";

export default function Page() {
  return (
    <main className={PAGE_CLASS}>
      <PageHeader title="Transações" />
      <EmptyState title="Ainda não." description="Transações reais chegam junto com a categorização, na fase 3: busca, filtros e fila de revisão." />
    </main>
  );
}
