import { describe, expect, it } from "vitest";
import { buildSystemPrompt, INVIOLABLE_RULES } from "./system-prompt";

const context = {
  name: "Thiago",
  aboutMe: "PJ com salário fixo, abrindo um negócio.",
  today: "2026-10-11",
  weekday: "domingo",
  screenScope: "PF" as const,
  categories: [{ id: "c1", name: "Delivery" }],
  goals: [{ id: "g1", name: "Carro" }],
  streams: [{ id: "s1", name: "Salário fixo", type: "SALARIO_FIXO" }],
};

describe("buildSystemPrompt", () => {
  it("traz as cinco regras invioláveis, numeradas", () => {
    const prompt = buildSystemPrompt(context);
    INVIOLABLE_RULES.forEach((rule, index) => expect(prompt).toContain(`${index + 1}. ${rule}`));
    expect(INVIOLABLE_RULES).toHaveLength(5);
  });

  it("traz quem é o usuário, data, escopo, categorias, metas e streams", () => {
    const prompt = buildSystemPrompt(context);
    for (const piece of ["de Thiago", "PJ com salário fixo", "domingo, 2026-10-11", "Escopo da tela de onde ele perguntou: PF", "c1: Delivery", "g1: Carro", "s1: Salário fixo, SALARIO_FIXO"]) {
      expect(prompt).toContain(piece);
    }
  });

  it("proíbe recomendação de investimento e cálculo", () => {
    const prompt = buildSystemPrompt(context);
    expect(prompt).toContain("Proibido recomendar compra, venda ou alocação de investimento");
    expect(prompt).toContain("Você não calcula");
  });

  it("sem dados do usuário, diz que não informou", () => {
    expect(buildSystemPrompt({ ...context, name: null, aboutMe: null, goals: [] })).toContain("Sobre o usuário: (não informado).");
  });
});
