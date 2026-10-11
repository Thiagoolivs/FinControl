import { assertCents } from "./money";
import type { MonthFlow } from "./month-flow";
import { formatBps, shareBps } from "./share";

/** Texto com valores: o valor vai como número para a tela formatar (e esconder, com "ocultar valores"). */
export type InsightPart = string | { cents: number };

export type Insight = { key: "maior" | "acima" | "ritmo" | "sem"; tone: "neutral" | "good" | "warning"; parts: InsightPart[] };

export type InsightInput = {
  flow: MonthFlow;
  /** Áreas do mês por valor, maiores primeiro; `ratioBps` = gasto sobre a média (null = sem histórico). */
  areas: readonly { name: string; cents: number; ratioBps: number | null }[];
  /** A partir daqui (bps da média) a área está acima do normal. Vem da regra de alerta do usuário. */
  overThresholdBps: number | null;
  lastMonthToDateCents: number | null;
  dayOfMonth: number;
};

/** Frases curtas em português simples sobre o mês. Toda conta é feita aqui, nunca pela IA. */
export function monthInsights(input: InsightInput): Insight[] {
  const { flow } = input;
  const insights: Insight[] = [];
  const top = input.areas[0];
  if (top && top.cents > 0 && flow.spentCents > 0) {
    assertCents(top.cents);
    insights.push({
      key: "maior",
      tone: "neutral",
      parts: [`A maior parte foi para ${top.name}: `, { cents: top.cents }, `, ${formatBps(shareBps(top.cents, flow.spentCents))} do que você gastou.`],
    });
  }
  const threshold = input.overThresholdBps;
  const over = threshold === null ? undefined : input.areas.filter((area) => area.ratioBps !== null && area.ratioBps >= threshold).sort((a, b) => (b.ratioBps ?? 0) - (a.ratioBps ?? 0))[0];
  if (over && over.ratioBps !== null) {
    insights.push({ key: "acima", tone: "warning", parts: [`${over.name} está ${formatBps(over.ratioBps - 10_000)} acima da sua média dos últimos meses.`] });
  }
  if (input.lastMonthToDateCents !== null && input.lastMonthToDateCents > 0) {
    assertCents(input.lastMonthToDateCents);
    const diff = flow.spentCents - input.lastMonthToDateCents;
    if (diff !== 0) {
      insights.push({
        key: "ritmo",
        tone: diff < 0 ? "good" : "warning",
        parts: [`Até o dia ${input.dayOfMonth}, você gastou `, { cents: Math.abs(diff) }, ` ${diff < 0 ? "a menos" : "a mais"} que no mesmo ponto do mês passado.`],
      });
    }
  }
  if (flow.uncategorizedCents > 0 && shareBps(flow.uncategorizedCents, flow.spentCents) >= 1_000) {
    insights.push({ key: "sem", tone: "neutral", parts: [{ cents: flow.uncategorizedCents }, " ainda sem categoria. Categorize para o quadro ficar completo."] });
  }
  return insights;
}
