import { assertCents } from "./money";

export type AssetClassKey = "ACAO" | "FII" | "RENDA_FIXA" | "CRIPTO" | "FUNDO";

export const ASSET_CLASSES: readonly AssetClassKey[] = ["ACAO", "FII", "RENDA_FIXA", "FUNDO", "CRIPTO"];

/** Classes com preço de mercado (cotação da brapi); as outras usam o valor que a Pluggy informa. */
export const MARKET_PRICED: readonly AssetClassKey[] = ["ACAO", "FII", "CRIPTO"];

const SCALE = 10;
const TEN = BigInt(10);
const ZERO = BigInt(0);
const TWO = BigInt(2);

/** "12.5" / "0.00012" / "3" → inteiro escalado por 10^10 (quantidade da Pluggy tem até 10 casas). */
function scaledQuantity(quantity: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(quantity.trim());
  if (!match) throw new RangeError(`Quantidade inválida: ${quantity}`);
  const fraction = (match[3] ?? "").padEnd(SCALE, "0");
  if (fraction.length > SCALE && /[1-9]/.test(fraction.slice(SCALE))) throw new RangeError(`Quantidade com mais de ${SCALE} casas: ${quantity}`);
  const value = BigInt(`${match[2]}${fraction.slice(0, SCALE)}`);
  return match[1] === "-" ? -value : value;
}

/** a / b arredondado no meio para longe do zero. */
function divideRound(a: bigint, b: bigint): bigint {
  const negative = a < ZERO !== b < ZERO;
  const absA = a < ZERO ? -a : a;
  const absB = b < ZERO ? -b : b;
  const rounded = (absA * TWO + absB) / (absB * TWO);
  return negative ? -rounded : rounded;
}

/** quantidade × preço em centavos, exato (sem float), arredondado no meio centavo para longe do zero. */
export function quantityTimesCents(quantity: string, priceCents: number): number {
  assertCents(priceCents);
  const result = Number(divideRound(scaledQuantity(quantity) * BigInt(priceCents), TEN ** BigInt(SCALE)));
  assertCents(result);
  return result;
}

/** Preço médio = custo / quantidade. Quantidade zero → 0. */
export function averagePriceCents(costCents: number, quantity: string): number {
  assertCents(costCents);
  const scaled = scaledQuantity(quantity);
  if (scaled === ZERO) return 0;
  return Number(divideRound(BigInt(costCents) * TEN ** BigInt(SCALE), scaled));
}

export type HoldingInput = { assetClass: AssetClassKey; quantity: string; costCents: number; currentValueCents: number | null; ticker: string | null };

/**
 * Valor de hoje: ação, FII e cripto com cotação = quantidade × preço; o resto (renda fixa, fundo, ou sem
 * cotação ainda) usa o valor da Pluggy e, sem ele, o custo.
 */
export function holdingValueCents(holding: HoldingInput, quotePriceCents: number | null): number {
  if (MARKET_PRICED.includes(holding.assetClass) && quotePriceCents !== null) return quantityTimesCents(holding.quantity, quotePriceCents);
  return holding.currentValueCents ?? holding.costCents;
}

export type AllocationRow = {
  assetClass: AssetClassKey;
  valueCents: number;
  currentBps: number;
  targetBps: number;
  /** atual − alvo, em pontos-base (positivo = acima do alvo). */
  deviationBps: number;
  /** quanto o valor está acima (+) ou abaixo (−) do que o alvo daria com o total de hoje. */
  deviationCents: number;
};

/** Alocação por classe contra o alvo que você definiu. Só mostra desvio: não sugere ativo nenhum. */
export function allocation(values: readonly { assetClass: AssetClassKey; valueCents: number }[], targets: Partial<Record<AssetClassKey, number>>): { totalCents: number; rows: AllocationRow[] } {
  const totals = new Map<AssetClassKey, number>();
  for (const value of values) {
    assertCents(value.valueCents);
    totals.set(value.assetClass, (totals.get(value.assetClass) ?? 0) + value.valueCents);
  }
  const totalCents = [...totals.values()].reduce((sum, cents) => sum + cents, 0);
  const rows = ASSET_CLASSES.filter((key) => (totals.get(key) ?? 0) !== 0 || (targets[key] ?? 0) > 0).map((assetClass) => {
    const valueCents = totals.get(assetClass) ?? 0;
    const targetBps = targets[assetClass] ?? 0;
    const currentBps = totalCents > 0 ? Math.round((valueCents * 10_000) / totalCents) : 0;
    return {
      assetClass,
      valueCents,
      currentBps,
      targetBps,
      deviationBps: currentBps - targetBps,
      deviationCents: valueCents - Math.round((totalCents * targetBps) / 10_000),
    };
  });
  return { totalCents, rows };
}

/** Alvo válido: cada classe entre 0 e 100% e a soma exatamente 100%. */
export function targetsError(targets: Partial<Record<AssetClassKey, number>>): string | null {
  const values = Object.values(targets);
  if (values.some((bps) => !Number.isInteger(bps) || bps < 0 || bps > 10_000)) return "Cada classe vai de 0 a 100%.";
  const sum = values.reduce((total, bps) => total + bps, 0);
  return sum === 10_000 ? null : `A soma precisa dar 100% (está em ${(sum / 100).toString().replace(".", ",")}%).`;
}

/**
 * Retorno da carteira no período, descontando o que entrou ou saiu (aporte e resgate mudam o custo):
 * ganho = (valor final − custo final) − (valor inicial − custo inicial), sobre o valor inicial. Em bps.
 */
export function periodReturnBps(start: { valueCents: number; costCents: number }, end: { valueCents: number; costCents: number }): number | null {
  if (start.valueCents <= 0) return null;
  const gain = end.valueCents - end.costCents - (start.valueCents - start.costCents);
  return Math.round((gain * 10_000) / start.valueCents);
}

/** Taxa acumulada de uma série diária publicada em % ao dia (CDI/Selic do SGS): Π(1 + r/100) − 1, em bps. */
export function accumulatedRateBps(dailyPercent: readonly string[]): number {
  // Taxa, não dinheiro: o produto em ponto flutuante tem precisão de sobra para virar bps.
  const factor = dailyPercent.reduce((product, rate) => {
    const value = Number(rate);
    if (!Number.isFinite(value)) throw new RangeError(`Taxa inválida: ${rate}`);
    return product * (1 + value / 100);
  }, 1);
  return Math.round((factor - 1) * 10_000);
}

