import { describe, expect, it } from "vitest";
import { burnPasswordCheck, hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("usa argon2id e verifica a senha certa", async () => {
    const stored = await hashPassword("uma senha longa o bastante");
    expect(stored.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(stored, "uma senha longa o bastante")).toBe(true);
    expect(await verifyPassword(stored, "outra senha qualquer")).toBe(false);
  });

  it("devolve false para hash corrompido em vez de lançar", async () => {
    expect(await verifyPassword("nao-e-um-hash", "x")).toBe(false);
  });

  it("burnPasswordCheck não lança", async () => {
    await expect(burnPasswordCheck("qualquer")).resolves.toBeUndefined();
  });
});
