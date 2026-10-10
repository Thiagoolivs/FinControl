import { describe, expect, it } from "vitest";
import { bearerToken, secretsMatch } from "./secret";

describe("secretsMatch", () => {
  it("aceita só o segredo exato", () => {
    expect(secretsMatch("abc123", "abc123")).toBe(true);
    expect(secretsMatch("abc124", "abc123")).toBe(false);
    expect(secretsMatch("abc", "abc123")).toBe(false);
    expect(secretsMatch("", "abc123")).toBe(false);
  });
});

describe("bearerToken", () => {
  it("extrai o token do cabeçalho", () => {
    expect(bearerToken("Bearer s3cr3t")).toBe("s3cr3t");
    expect(bearerToken("bearer s3cr3t")).toBeNull();
    expect(bearerToken("Basic s3cr3t")).toBeNull();
    expect(bearerToken("Bearer a b")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});
