// Dinheiro sempre em centavos inteiros. Nenhuma função aqui usa float.

const MINUS = "−";

export function assertCents(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Valor monetário inválido: ${value} (esperado inteiro em centavos)`);
  }
}

function groupThousands(units: number): string {
  return String(units).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export type CentsParts = {
  sign: "" | "+" | typeof MINUS;
  units: string; // "14.305"
  cents: string; // "80"
};

export function centsParts(cents: number, options: { signed?: boolean } = {}): CentsParts {
  assertCents(cents);
  const abs = Math.abs(cents);
  const rest = abs % 100;
  const units = (abs - rest) / 100;
  const sign = cents < 0 ? MINUS : options.signed && cents > 0 ? "+" : "";
  return { sign, units: groupThousands(units), cents: String(rest).padStart(2, "0") };
}

/** 1430580 → "R$ 14.305,80"; -5890 → "−R$ 58,90". */
export function formatCents(cents: number, options: { signed?: boolean; symbol?: boolean } = {}): string {
  const { sign, units, cents: rest } = centsParts(cents, options);
  const symbol = options.symbol === false ? "" : "R$ ";
  return `${sign}${symbol}${units},${rest}`;
}

/** Para eixos e rótulos curtos: 2000000 → "R$ 20 mil"; 150000 → "R$ 1,5 mil"; 120000000 → "R$ 1,2 mi". */
export function formatCentsCompact(cents: number): string {
  assertCents(cents);
  const sign = cents < 0 ? MINUS : "";
  const abs = Math.abs(cents);
  const units = (abs - (abs % 100)) / 100;
  const scaled = (divisor: number, suffix: string): string => {
    const tenths = Math.round((units * 10) / divisor);
    const whole = Math.floor(tenths / 10);
    const decimal = tenths % 10;
    const body = whole >= 10 || decimal === 0 ? groupThousands(Math.round(tenths / 10)) : `${whole},${decimal}`;
    return `${sign}R$ ${body} ${suffix}`;
  };
  if (units >= 999_950) return scaled(1_000_000, "mi");
  if (units >= 1000) return scaled(1000, "mil");
  return `${sign}R$ ${units}`;
}

const BRL_PATTERN =/^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

/** "R$ 1.234,56" → 123456. Retorna null para entrada que não é valor em reais. */
export function parseCents(input: string): number | null {
  let text = input.replace(/[\s ]/g, "").replace(/^R\$/, "");
  let negative = false;
  if (text.startsWith("-") || text.startsWith(MINUS)) {
    negative = true;
    text = text.slice(1).replace(/^R\$/, "");
  }
  const match = BRL_PATTERN.exec(text);
  if (!match) return null;
  const units = Number(match[1]?.replaceAll(".", ""));
  const rest = Number((match[2] ?? "").padEnd(2, "0"));
  const cents = units * 100 + rest;
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}
