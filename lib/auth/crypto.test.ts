import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, randomToken, sha256Hex } from "./crypto";

const MASTER = "a".repeat(48);

describe("encryptSecret / decryptSecret", () => {
  it("faz ida e volta", () => {
    const payload = encryptSecret("JBSWY3DPEHPK3PXP", MASTER, "totp");
    expect(payload.startsWith("v1.")).toBe(true);
    expect(payload).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(payload, MASTER, "totp")).toBe("JBSWY3DPEHPK3PXP");
  });

  it("gera IV novo a cada cifragem", () => {
    expect(encryptSecret("x", MASTER, "totp")).not.toBe(encryptSecret("x", MASTER, "totp"));
  });

  it("falha com outra chave mestra ou outra finalidade", () => {
    const payload = encryptSecret("segredo", MASTER, "totp");
    expect(() => decryptSecret(payload, "b".repeat(48), "totp")).toThrow();
    expect(() => decryptSecret(payload, MASTER, "outra")).toThrow();
  });

  it("detecta adulteração", () => {
    const [v, iv, tag, ct] = encryptSecret("segredo", MASTER, "totp").split(".");
    const flipped = Buffer.from(ct ?? "", "base64url");
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64url")].join("."), MASTER, "totp")).toThrow();
  });

  it("rejeita formato desconhecido", () => {
    expect(() => decryptSecret("v0.a.b.c", MASTER, "totp")).toThrow("formato inválido");
    expect(() => decryptSecret("lixo", MASTER, "totp")).toThrow("formato inválido");
  });
});

describe("tokens", () => {
  it("gera tokens únicos e hash estável", () => {
    expect(randomToken()).not.toBe(randomToken());
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
