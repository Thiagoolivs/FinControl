import { describe, expect, it } from "vitest";
import { averageRatioBps, type CategorySpend, foldCategories, spendByTopCategory } from "./categories";

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

describe("spendByTopCategory", () => {
  const parentOf = new Map<string, string | null>([
    ["alimentacao", null],
    ["delivery", "alimentacao"],
    ["restaurantes", "alimentacao"],
    ["lazer", null],
  ]);

  it("soma saídas e sobe subcategoria para a mãe", () => {
    const totals = spendByTopCategory(
      [
        { categoryId: "delivery", amountCents: -4_590 },
        { categoryId: "restaurantes", amountCents: -12_000 },
        { categoryId: "lazer", amountCents: -6_550 },
      ],
      parentOf,
    );
    expect(totals.get("alimentacao")).toBe(16_590);
    expect(totals.get("lazer")).toBe(6_550);
  });

  it("estorno abate e o total não fica negativo", () => {
    const totals = spendByTopCategory(
      [
        { categoryId: "lazer", amountCents: -10_000 },
        { categoryId: "lazer", amountCents: 3_000 },
        { categoryId: "delivery", amountCents: 5_000 },
      ],
      parentOf,
    );
    expect(totals.get("lazer")).toBe(7_000);
    expect(totals.get("alimentacao")).toBe(0);
  });

  it("sem categoria fica em null", () => {
    expect(spendByTopCategory([{ categoryId: null, amountCents: -1_000 }], parentOf).get(null)).toBe(1_000);
  });
});

describe("averageRatioBps", () => {
  it("compara com a média dos meses anteriores", () => {
    expect(averageRatioBps(120_000, [100_000, 100_000, 100_000])).toBe(12_000);
    expect(averageRatioBps(50_000, [100_000, 0, 50_000])).toBe(10_000);
  });

  it("sem histórico não há razão", () => {
    expect(averageRatioBps(10_000, [])).toBeNull();
    expect(averageRatioBps(10_000, [0, 0, 0])).toBeNull();
  });
});
