import { Secret, TOTP } from "otpauth";
import { describe, expect, it } from "vitest";
import { createTotpSecret, isReplayedStep, matchTotpStep, totpUri } from "./totp";

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const NOW = 1_791_500_000_000;

function codeAt(timestamp: number): string {
  return TOTP.generate({ secret: Secret.fromBase32(SECRET), timestamp });
}

describe("matchTotpStep", () => {
  const step = Math.floor(NOW / 30_000);

  it("aceita o código do passo atual", () => {
    expect(matchTotpStep(SECRET, codeAt(NOW), NOW)).toBe(step);
  });

  it("tolera um passo de diferença no relógio", () => {
    expect(matchTotpStep(SECRET, codeAt(NOW - 30_000), NOW)).toBe(step - 1);
    expect(matchTotpStep(SECRET, codeAt(NOW + 30_000), NOW)).toBe(step + 1);
  });

  it("rejeita código de dois passos atrás", () => {
    expect(matchTotpStep(SECRET, codeAt(NOW - 60_000), NOW)).toBeNull();
  });

  it("rejeita formato inválido sem consultar o segredo", () => {
    expect(matchTotpStep(SECRET, "12345", NOW)).toBeNull();
    expect(matchTotpStep(SECRET, "abcdef", NOW)).toBeNull();
    expect(matchTotpStep(SECRET, "1234567", NOW)).toBeNull();
  });
});

describe("isReplayedStep", () => {
  it("bloqueia o mesmo passo ou anterior", () => {
    expect(isReplayedStep(100, null)).toBe(false);
    expect(isReplayedStep(101, 100)).toBe(false);
    expect(isReplayedStep(100, 100)).toBe(true);
    expect(isReplayedStep(99, 100)).toBe(true);
  });
});

describe("segredo e URI", () => {
  it("gera segredo base32 de 160 bits e URI otpauth", () => {
    const secret = createTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    const uri = totpUri(secret, "eu@exemplo.com");
    expect(uri.startsWith("otpauth://totp/FinControl:eu%40exemplo.com?")).toBe(true);
    expect(uri).toContain(`secret=${secret}`);
  });
});
