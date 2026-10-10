import { describe, expect, it } from "vitest";
import { formatBps, progressBps, shareBps } from "./share";

describe("shareBps", () => {
  it("calcula a parcela em basis points", () => {
    expect(shareBps(240000, 506490)).toBe(4738);
    expect(shareBps(1, 3)).toBe(3333);
    expect(shareBps(506490, 506490)).toBe(10000);
  });

  it("devolve 0 quando o total não é positivo", () => {
    expect(shareBps(100, 0)).toBe(0);
    expect(shareBps(100, -5)).toBe(0);
  });

  it("rejeita valores que não são centavos inteiros", () => {
    expect(() => shareBps(1.5, 10)).toThrow(RangeError);
  });
});

describe("progressBps", () => {
  it("limita entre 0 e 100%", () => {
    expect(progressBps(1900000, 5000000)).toBe(3800);
    expect(progressBps(6000000, 5000000)).toBe(10000);
    expect(progressBps(-100, 5000000)).toBe(0);
  });
});

describe("formatBps", () => {
  it("formata em pt-BR", () => {
    expect(formatBps(12800)).toBe("128%");
    expect(formatBps(4739, 1)).toBe("47,4%");
  });
});
