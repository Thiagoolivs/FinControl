import { EmptyState } from "@/components/ui/empty-state";
import { PAGE_CLASS, PageHeader } from "../page-header";

export default function Page() {
  return (
    <main className={PAGE_CLASS}>
      <PageHeader title="Metas" />
      <EmptyState title="Ainda não." description="Metas com anel de progresso, aporte mensal e data realista chegam na fase 5." />
    </main>
  );
}
