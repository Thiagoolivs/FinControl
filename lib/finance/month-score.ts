import { assertCents } from "./money";
import { type MonthFlow, savingsRateBps } from "./month-flow";
import { formatBps } from "./share";

export type AchievementKey = "fila" | "ritmo" | "areas" | "investiu" | "meta";

export type Achievement = { key: AchievementKey; title: string; done: boolean; detail: string };

export type ScoreInput = {
  /** Fluxo do mês corrente até hoje. */
  flow: MonthFlow;
  /** Meta de sobra do usuário, em bps do que entrou. */
  targetBps: number;
  /** Transações na fila de revisão (dentro da janela). */
  reviewCount: number;
  /** Gasto do mês passado até o mesmo dia; null = sem dados daquele mês. */
  lastMonthToDateCents: number | null;
  /** Áreas acima da média; null = sem histórico para comparar. */
  overAverageAreas: number | null;
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * Conquistas do mês: o que dá para medir com os dados que existem. Uma conquista sem base (sem mês
 * passado, sem histórico de média, nada entrou) fica de fora em vez de aparecer como falha.
 */
export function monthAchievements(input: ScoreInput): Achievement[] {
  const { flow } = input;
  const list: Achievement[] = [
    {
      key: "fila",
      title: "Tudo categorizado",
      done: input.reviewCount === 0,
      detail: input.reviewCount === 0 ? "Você sabe para onde foi cada real." : `${plural(input.reviewCount, "transação", "transações")} na fila`,
    },
  ];
  if (input.lastMonthToDateCents !== null && input.lastMonthToDateCents > 0) {
    assertCents(input.lastMonthToDateCents);
    const done = flow.spentCents < input.lastMonthToDateCents;
    list.push({
      key: "ritmo",
      title: "Abaixo do mês passado",
      done,
      detail: done ? "Gastou menos que no mesmo ponto do mês passado." : "Gastou mais que no mesmo ponto do mês passado.",
    });
  }
  if (input.overAverageAreas !== null) {
    list.push({
      key: "areas",
      title: "Nenhuma área acima da média",
      done: input.overAverageAreas === 0,
      detail: input.overAverageAreas === 0 ? "Todas as áreas dentro do normal." : `${plural(input.overAverageAreas, "área passou", "áreas passaram")} da média.`,
    });
  }
  list.push({
    key: "investiu",
    title: "Investiu",
    done: flow.investedCents > 0,
    detail: flow.investedCents > 0 ? "Separou dinheiro para o futuro." : "Nada investido neste mês ainda.",
  });
  const rate = savingsRateBps(flow);
  if (rate !== null) {
    list.push({
      key: "meta",
      title: `Guardar ${formatBps(input.targetBps)} do que entrou`,
      done: rate >= input.targetBps,
      detail: rate >= 0 ? `Sobrou ${formatBps(rate)} até agora.` : "Saiu mais do que entrou até agora.",
    });
  }
  return list;
}

/** Meses fechados seguidos (do mais recente para trás) que bateram a meta de sobra. */
export function savingsStreak(closedMonthsNewestFirst: readonly MonthFlow[], targetBps: number): number {
  let streak = 0;
  for (const flow of closedMonthsNewestFirst) {
    const rate = savingsRateBps(flow);
    if (rate === null || rate < targetBps) break;
    streak += 1;
  }
  return streak;
}
