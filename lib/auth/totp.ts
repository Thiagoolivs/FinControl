import { Secret, TOTP } from "otpauth";

const PERIOD_SECONDS = 30;

function buildTotp(secretBase32: string, label = "conta"): TOTP {
  return new TOTP({
    issuer: "FinControl",
    label,
    algorithm: "SHA1",
    digits: 6,
    period: PERIOD_SECONDS,
    secret: Secret.fromBase32(secretBase32),
  });
}

export function createTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function totpUri(secretBase32: string, account: string): string {
  return buildTotp(secretBase32, account).toString();
}

/**
 * Passo de tempo do código aceito (tolerância de ±1 passo), ou null se inválido.
 * O chamador rejeita passo <= último usado: o mesmo código nunca vale duas vezes.
 */
export function matchTotpStep(secretBase32: string, token: string, nowMs: number = Date.now()): number | null {
  if (!/^\d{6}$/.test(token)) return null;
  const delta = buildTotp(secretBase32).validate({ token, timestamp: nowMs, window: 1 });
  if (delta === null) return null;
  return Math.floor(nowMs / 1000 / PERIOD_SECONDS) + delta;
}

export function isReplayedStep(step: number, lastUsedStep: number | null): boolean {
  return lastUsedStep !== null && step <= lastUsedStep;
}
