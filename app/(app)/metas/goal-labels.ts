import type { GoalStatus } from "@/components/ui/goal-card";
import { formatMonthLabel } from "@/lib/dates";
import type { GoalProgress } from "@/lib/goals/queries";

export const CARD_STATUS: Record<GoalProgress, GoalStatus> = {
  "sem-alvo": "unset",
  concluida: "done",
  pausada: "paused",
  atrasada: "late",
  "no-prazo": "on-track",
};

/** "dezembro de 2027". */
export const monthLabel = (month: string) => formatMonthLabel(month);

/** Data realista para o cartão: mês no ritmo atual, "não fecha" sem aporte, nada sem mês fechado. */
export function realisticLabel(goal: { paceCents: number | null; realisticMonth: string | null }): string | undefined {
  if (goal.paceCents === null) return undefined;
  return goal.realisticMonth ? monthLabel(goal.realisticMonth) : "não fecha";
}
