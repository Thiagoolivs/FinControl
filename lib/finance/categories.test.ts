import { describe, expect, it } from "vitest";
import { type CategorySpend, foldCategories } from "./categories";

const cat = (id: string, cents: number): CategorySpend => ({ id, name: id, icon: "dots", cents, averageRatioBps: null });

describe("foldCategories", () => {
  it("ordena por valor e não junta quando cabe", () => {
    const result = foldCategories([cat("a", 100), cat("b", 300), cat("c", 200)], 3);
    expect(result.map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(result.every((r) => !r.isOther)).toBe(true);
  });

  it("junta as menores em 'Outras N' preservando o total", () => {
    const input = [cat("moradia", 240000), cat("alimentacao", 118040), cat("lazer", 65500), cat("transporte", 41290), cat("software", 21200), cat("assinaturas", 18970), cat("tarifas", 1490)];
    const result = foldCategories(input, 5);
    expect(result.map((r) => r.name)).toEqual(["moradia", "alimentacao", "lazer", "transporte", "Outras 3"]);
    expect(result.at(-1)?.cents).toBe(41660);
    expect(result.at(-1)?.isOther).toBe(true);
    const sum = (xs: { cents: number }[]) => xs.reduce((s, x) => s + x.cents, 0);
    expect(sum(result)).toBe(sum(input));
  });

  it("calcula parcelas sobre o total", () => {
    const result = foldCategories([cat("a", 750), cat("b", 250)], 5);
    expect(result.map((r) => r.shareBps)).toEqual([7500, 2500]);
  });

  it("lista vazia devolve vazio", () => {
    expect(foldCategories([], 5)).toEqual([]);
  });
});
