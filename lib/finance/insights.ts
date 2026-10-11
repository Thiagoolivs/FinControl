import { assertCents } from "./money";
import type { MonthFlow } from "./month-flow";
import { formatBps, shareBps, variationBps } from "./share";

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

export type HighlightCandidate = { id: string; name: string; icon: string; cents: number; lastMonthToDateCents: number | null };

export type Highlight = HighlightCandidate & {
  /** Variação sobre o mesmo ponto do mês passado, em bps; null sem base. */
  variationBps: number | null;
  /** "cresceu": passou do limite do usuário; "maior": só o maior gasto. */
  reason: "cresceu" | "maior";
};

/**
 * A manchete do mês: entre os gastos de estilo de vida, o maior que cresceu além do limite do usuário
 * (`growthThresholdBps`, vindo da regra "acima da média") sobre o mesmo ponto do mês passado; sem nenhum
 * assim, o maior. Só disputa o que pesa: pelo menos um quarto do maior candidato.
 */
export function pickHighlight(candidates: readonly HighlightCandidate[], growthThresholdBps: number | null): Highlight | null {
  const positive = candidates.filter((candidate) => {
    assertCents(candidate.cents);
    return candidate.cents > 0;
  });
  if (positive.length === 0) return null;
  const bySize = [...positive].sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name, "pt-BR"));
  const largest = bySize[0] as HighlightCandidate;
  const withVariation = bySize.map((candidate) => ({
    ...candidate,
    variationBps: candidate.lastMonthToDateCents === null ? null : variationBps(candidate.lastMonthToDateCents, candidate.cents),
  }));
  const grown =
    growthThresholdBps === null
      ? undefined
      : withVariation.find((candidate) => candidate.variationBps !== null && candidate.variationBps >= growthThresholdBps && candidate.cents * 4 >= largest.cents);
  if (grown) return { ...grown, reason: "cresceu" };
  return { ...(withVariation[0] as HighlightCandidate & { variationBps: number | null }), reason: "maior" };
}
