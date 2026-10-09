import { describe, expect, it } from "vitest";
import { compilePattern } from "./match";

function matches(pattern: string, type: "PREFIX" | "CONTAINS" | "REGEX", description: string): boolean {
  const compiled = compilePattern(pattern, type);
  if (!compiled.ok) throw new Error(compiled.error);
  return compiled.test(description);
}

describe("compilePattern", () => {
  it("PREFIX compara o começo, sem diferenciar maiúsculas", () => {
    expect(matches("pag*ifood", "PREFIX", "PAG*IFOOD 4421")).toBe(true);
    expect(matches("IFOOD", "PREFIX", "PAG*IFOOD 4421")).toBe(false);
  });

  it("CONTAINS ignora espaços repetidos", () => {
    expect(matches("ifood", "CONTAINS", "PAG*IFOOD 4421")).toBe(true);
    expect(matches("pao de acucar", "CONTAINS", "COMPRA  PAO   DE ACUCAR 123")).toBe(true);
  });

  it("REGEX usa a expressão como está", () => {
    expect(matches("^UBER\\s*\\*?TRIP", "REGEX", "UBER *TRIP 8812")).toBe(true);
    expect(matches("^UBER\\s*\\*?TRIP", "REGEX", "PAG UBER TRIP")).toBe(false);
  });

  it("rejeita padrão vazio e regex inválida", () => {
    expect(compilePattern("   ", "CONTAINS")).toEqual({ ok: false, error: "Informe um padrão." });
    expect(compilePattern("(", "REGEX")).toEqual({ ok: false, error: "Expressão regular inválida." });
  });
});
