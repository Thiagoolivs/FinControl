import type { CategoryKind } from "@/generated/prisma/enums";
import type { IconName } from "@/components/ui/icon";

export type DefaultCategory = { name: string; icon: IconName; kind: CategoryKind; children?: string[] };

/**
 * Entradas que não são receita de uma stream (não geram reserva). Quem já tinha categorias recebeu esta
 * árvore pela migration `fila_recente_e_entradas`, com os mesmos nomes.
 */
export const INCOME_CATEGORIES: DefaultCategory = {
  name: "Entradas",
  icon: "arrow-in",
  kind: "RECEITA",
  children: ["Reembolso", "Rendimentos", "Pix e presentes recebidos", "Venda de algo", "Cashback e prêmios", "Outras entradas"],
};

/**
 * Árvore inicial (duas camadas). Só valores iniciais: o usuário renomeia, cria e apaga em Config → Categorias.
 * Subcategoria herda ícone e tipo da mãe. "Transferências" é de sistema (pareamento) e criada à parte.
 */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { name: "Moradia", icon: "home", kind: "ESSENCIAL", children: ["Aluguel", "Condomínio", "Luz, água e gás", "Internet e celular", "Manutenção da casa"] },
  { name: "Mercado", icon: "cart", kind: "ESSENCIAL" },
  { name: "Saúde", icon: "heart", kind: "ESSENCIAL", children: ["Farmácia", "Plano de saúde", "Consultas e exames"] },
  {
    name: "Transporte",
    icon: "car",
    kind: "ESSENCIAL",
    children: ["Combustível", "App de transporte", "Transporte público", "Estacionamento e pedágio", "Manutenção do carro"],
  },
  { name: "Educação", icon: "book", kind: "ESSENCIAL" },
  { name: "Impostos e tarifas", icon: "receipt", kind: "ESSENCIAL", children: ["DAS", "Tarifas bancárias", "Juros e IOF", "Outros impostos"] },
  { name: "Alimentação fora", icon: "food", kind: "VARIAVEL", children: ["Restaurantes", "Delivery", "Padaria e café"] },
  { name: "Lazer", icon: "ticket", kind: "VARIAVEL" },
  { name: "Compras", icon: "bag", kind: "VARIAVEL" },
  { name: "Assinaturas", icon: "repeat", kind: "VARIAVEL" },
  { name: "Trabalho", icon: "code", kind: "VARIAVEL" },
  { name: "Viagem", icon: "luggage", kind: "VARIAVEL" },
  { name: "Cuidados pessoais", icon: "user", kind: "VARIAVEL" },
  { name: "Presentes e doações", icon: "gift", kind: "VARIAVEL" },
  { name: "Outros", icon: "dots", kind: "VARIAVEL" },
  { name: "Investimentos", icon: "chart", kind: "INVESTIMENTO", children: ["Aplicações", "Previdência"] },
  INCOME_CATEGORIES,
];

export const CATEGORY_KIND_LABEL: Record<CategoryKind, string> = {
  ESSENCIAL: "Essencial",
  VARIAVEL: "Variável",
  INVESTIMENTO: "Investimento",
  TRANSFERENCIA: "Transferência",
  RECEITA: "Entrada",
};
