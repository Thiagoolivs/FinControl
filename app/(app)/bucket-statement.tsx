import { Money } from "@/components/ui/money";
import { Eyebrow } from "@/components/ui/text";
import { formatDayLabel } from "@/lib/dates";
import type { BucketStatementEntry } from "@/lib/streams/queries";

const KIND_LABEL: Record<BucketStatementEntry["kind"], string> = {
  ALOCACAO: "Reserva automática",
  OBRIGACAO_FIXA: "Reserva mensal",
  PAGAMENTO: "Pagamento",
  RETIRADA: "Retirada",
  AJUSTE: "Ajuste",
};

/** Extrato de um bucket: entrou (verde, +) e saiu, em ordem do mais recente. */
export function BucketStatement({ entries, today, title = "Extrato" }: { entries: BucketStatementEntry[]; today: string; title?: string }) {
  if (entries.length === 0) {
    return <p className="m-0 text-[13px] leading-[18px] text-text-secondary">Nada lançado ainda.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <Eyebrow as="h3">{title}</Eyebrow>
      <ul className="m-0 flex list-none flex-col p-0">
        {entries.map((entry) => (
          <li key={entry.id} className="flex min-h-[56px] items-center gap-3 py-2">
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="truncate text-[15px] font-[450]">{entry.description}</span>
              <span className="text-[13px] text-text-secondary">
                {KIND_LABEL[entry.kind]} · {formatDayLabel(entry.date, today)}
              </span>
            </span>
            <Money cents={entry.amountCents} kind={entry.amountCents > 0 ? "in" : "out"} className="text-[15px]" />
          </li>
        ))}
      </ul>
    </div>
  );
}
