import { RuleInputError } from "./mutations";

/** Mensagem para a UI: erro de validação vai como está; o resto é logado e vira mensagem genérica. */
export function describeRuleError(error: unknown): string {
  if (error instanceof RuleInputError) return error.message;
  console.error(error);
  return "Não foi possível salvar. Tente de novo.";
}
