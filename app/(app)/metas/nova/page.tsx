import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { requireUser } from "@/lib/auth/dal";
import { todayLocal } from "@/lib/dates";
import { PAGE_CLASS } from "../../page-header";
import { NewGoalForm } from "../goal-controls";

export default async function NewGoalPage() {
  await requireUser();
  const year = Number(todayLocal().slice(0, 4)) + 1;
  return (
    <main className={PAGE_CLASS}>
      <Link href="/metas" className="-ml-1 flex min-h-11 items-center gap-1 self-start text-[15px] text-accent no-underline">
        <Icon name="chevron-right" size={16} className="rotate-180" />
        Metas
      </Link>
      <h1 className="m-0 text-[34px] font-light leading-10 tracking-[-0.03em]">Nova meta</h1>
      <NewGoalForm defaultMonth={`${year}-12`} />
    </main>
  );
}
