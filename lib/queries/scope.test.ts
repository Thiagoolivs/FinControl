import { describe, expect, it } from "vitest";
import { parseScopeParam, scopeWhere } from "./scope";

describe("scopeWhere", () => {
  it("filtra pelo escopo pedido", () => {
    expect(scopeWhere({ scope: "PJ" })).toEqual({ scope: "PJ" });
  });

  it("só remove o filtro com consolidated: true", () => {
    expect(scopeWhere({ consolidated: true })).toEqual({});
  });
});

describe("parseScopeParam", () => {
  it("lê o parâmetro da URL", () => {
    expect(parseScopeParam("pf")).toEqual({ scope: "PF" });
    expect(parseScopeParam(["pj", "pf"])).toEqual({ scope: "PJ" });
    expect(parseScopeParam(undefined)).toEqual({ consolidated: true });
    expect(parseScopeParam("PJ")).toEqual({ consolidated: true });
  });
});
