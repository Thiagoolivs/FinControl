// Dados fictícios do catálogo. Valores em centavos, coerentes entre si (bruto = disponível + reservado + negócio).
import type { CompositionSegment } from "@/components/ui/balance-hero";
import type { NavItem } from "@/components/ui/navigation";
import type { ProjectionMonth } from "@/components/ui/projection-chart";
import type { ScopeFilter } from "@/components/ui/status";
import type { TransactionItemData } from "@/components/ui/transaction-item";
import type { CategorySpend } from "@/lib/finance/categories";

type ScopeFixture = {
  heroCents: number;
  caption: string;
  segments: CompositionSegment[];
  total: { label: string; cents: number; href: string };
  stats: { label: string; hint: string; valueCents: number; scope?: "PJ"; href: string }[];
  categories: CategorySpend[];
  transactions: { label: string; items: TransactionItemData[] }[];
};

const reservado = { label: "Reservado", hint: "Imposto R$ 173,00 · custos R$ 1.113,50", valueCents: 128_650, scope: "PJ" as const, href: "#" };
const negocio = { label: "Caixa do negócio", hint: "[NOME DO NEGÓCIO]", valueCents: 315_000, scope: "PJ" as const, href: "#" };

const category = (id: string, name: string, icon: string, cents: number, averageRatioBps: number | null): CategorySpend => ({
  id,
  name,
  icon,
  cents,
  averageRatioBps,
});

const moradia = category("moradia", "Moradia", "home", 240_000, 10_000);
const alimentacao = category("alimentacao", "Alimentação", "food", 118_040, 10_400);
const lazer = category("lazer", "Lazer", "ticket", 65_500, 12_800);
const transporte = category("transporte", "Transporte", "car", 41_290, 9_100);
const software = category("software", "Software", "code", 21_200, 10_000);
const assinaturas = category("assinaturas", "Assinaturas", "repeat", 18_970, 10_000);
const tarifas = category("tarifas", "Tarifas bancárias", "receipt", 1_490, null);

const tx = (item: Omit<TransactionItemData, "href">): TransactionItemData => ({ ...item, href: "#" });

const ifood = tx({ id: "t1", description: "iFood", meta: "Alimentação · Delivery", amountCents: -5_890, kind: "out", scope: "PF", pending: true });
const ted = tx({ id: "t2", description: "TED recebida", meta: "Salário fixo · R$ 490,00 reservado", amountCents: 980_000, kind: "in", scope: "PJ" });
const uber = tx({ id: "t3", description: "Uber", meta: "Transporte", amountCents: -2_340, kind: "out", scope: "PF" });
const notion = tx({ id: "t4", description: "Notion", meta: "Software", amountCents: -5_200, kind: "out", scope: "PJ" });
const spotify = tx({ id: "t5", description: "Spotify", meta: "Assinaturas · recorrente", amountCents: -2_190, kind: "out", scope: "PF" });
const mercado = tx({ id: "t6", description: "Pão de Açúcar", meta: "Alimentação · Mercado", amountCents: -31_245, kind: "out", scope: "PF" });
const magalu = tx({ id: "t7", description: "Magazine Luiza", meta: "Casa · parcelado no cartão", amountCents: -18_990, kind: "out", scope: "PF", installment: "3/10" });
const daPJ = tx({ id: "t8", description: "Da conta PJ", meta: "Transferência · não é receita", amountCents: 400_000, kind: "transfer", scope: "PF" });
const tarifa = tx({ id: "t9", description: "Tarifa do banco", meta: "Tarifas bancárias", amountCents: -1_490, kind: "out", scope: "PJ" });
const pix = tx({ id: "t10", description: "Pix recebido", meta: "Sem stream · revisar", amountCents: 120_000, kind: "in", scope: "PJ" });
const paraPF = tx({ id: "t11", description: "Para a conta PF", meta: "Transferência · não é gasto", amountCents: -400_000, kind: "transfer", scope: "PJ" });

export const SCOPES: Record<ScopeFilter, ScopeFixture> = {
  TUDO: {
    heroCents: 1_430_580,
    caption: "de R$ 18.742,30 em 3 contas",
    segments: [
      { key: "disponivel", label: "Disponível", cents: 1_430_580, href: "#" },
      { key: "reservado", label: "Reservado", cents: 128_650, href: "#" },
      { key: "negocio", label: "Caixa do negócio", cents: 315_000, href: "#" },
    ],
    total: { label: "Saldo bruto", cents: 1_874_230, href: "#" },
    stats: [reservado, negocio, { label: "Saldo bruto", hint: "PF + PJ, antes das reservas", valueCents: 1_874_230, href: "#" }],
    categories: [moradia, alimentacao, lazer, transporte, software, assinaturas, tarifas],
    transactions: [
      { label: "Hoje", items: [ifood] },
      { label: "Ontem", items: [ted, uber] },
      { label: "6 out", items: [notion, spotify] },
    ],
  },
  PF: {
    heroCents: 612_040,
    caption: "em 2 contas PF · sem reservas",
    segments: [{ key: "disponivel", label: "Disponível", cents: 612_040, href: "#" }],
    total: { label: "Saldo bruto PF", cents: 612_040, href: "#" },
    stats: [{ label: "Saldo bruto", hint: "2 contas PF", valueCents: 612_040, href: "#" }],
    categories: [moradia, alimentacao, lazer, transporte, assinaturas],
    transactions: [
      { label: "Hoje", items: [ifood] },
      { label: "Ontem", items: [uber] },
      { label: "6 out", items: [spotify] },
      { label: "5 out", items: [mercado, magalu] },
      { label: "1 out", items: [daPJ] },
    ],
  },
  PJ: {
    heroCents: 818_540,
    caption: "de R$ 12.621,90 na conta PJ",
    segments: [
      { key: "disponivel", label: "Disponível", cents: 818_540, href: "#" },
      { key: "reservado", label: "Reservado", cents: 128_650, href: "#" },
      { key: "negocio", label: "Caixa do negócio", cents: 315_000, href: "#" },
    ],
    total: { label: "Saldo bruto PJ", cents: 1_262_190, href: "#" },
    stats: [reservado, negocio, { label: "Saldo bruto PJ", hint: "Antes das reservas", valueCents: 1_262_190, scope: "PJ", href: "#" }],
    categories: [software, tarifas],
    transactions: [
      { label: "Ontem", items: [ted] },
      { label: "6 out", items: [notion] },
      { label: "3 out", items: [tarifa] },
      { label: "2 out", items: [pix] },
      { label: "1 out", items: [paraPF] },
    ],
  },
};

export const GOALS = [
  { name: "Casamento", scope: "PF", currentCents: 1_900_000, targetCents: 5_000_000, monthlyRequiredCents: 221_429, targetDateLabel: "dez 2027", status: "on-track" },
  { name: "Carro", scope: "PF", currentCents: 840_000, targetCents: 6_000_000, monthlyRequiredCents: 258_000, targetDateLabel: "jun 2028", status: "late", realisticDateLabel: "mar 2029" },
  { name: "Investimentos", scope: "PF", currentCents: 2_350_000, targetCents: 10_000_000, monthlyRequiredCents: 153_000, targetDateLabel: "dez 2030", status: "on-track" },
  { name: "Eu mesmo", scope: "PF", currentCents: 500_000, targetCents: 500_000, monthlyRequiredCents: 0, targetDateLabel: "dez 2026", status: "done" },
  { name: "Reserva do negócio", scope: "PJ", currentCents: 600_000, targetCents: 2_000_000, monthlyRequiredCents: 100_000, targetDateLabel: "dez 2027", status: "on-track" },
] as const;

const MONTHS: Array<[string, string, string, number, number, number]> = [
  ["2026-11", "nov", "novembro de 2026", 1_520_000, 1_640_000, 315_000],
  ["2026-12", "dez", "dezembro de 2026", 1_210_000, 1_450_000, 290_000],
  ["2027-01", "jan/27", "janeiro de 2027", 820_000, 1_180_000, 262_000],
  ["2027-02", "fev", "fevereiro de 2027", 410_000, 890_000, 238_000],
  ["2027-03", "mar", "março de 2027", -180_000, 420_000, 205_000],
  ["2027-04", "abr", "abril de 2027", -350_000, 360_000, 171_000],
  ["2027-05", "mai", "maio de 2027", 120_000, 950_000, 150_000],
  ["2027-06", "jun", "junho de 2027", 480_000, 1_420_000, 168_000],
  ["2027-07", "jul", "julho de 2027", 760_000, 1_830_000, 210_000],
  ["2027-08", "ago", "agosto de 2027", 1_050_000, 2_240_000, 265_000],
  ["2027-09", "set", "setembro de 2027", 1_310_000, 2_620_000, 330_000],
  ["2027-10", "out", "outubro de 2027", 1_590_000, 3_010_000, 402_000],
];

export const PROJECTION: ProjectionMonth[] = MONTHS.map(([key, label, fullLabel, realisticCents, optimisticCents, businessCents]) => ({
  key,
  label,
  fullLabel,
  realisticCents,
  optimisticCents,
  businessCents,
}));

export const RULE_OPTIONS = {
  categories: [
    { id: "delivery", name: "Alimentação › Delivery" },
    { id: "mercado", name: "Alimentação › Mercado" },
    { id: "moradia", name: "Moradia" },
    { id: "transporte", name: "Transporte" },
    { id: "lazer", name: "Lazer" },
    { id: "impostos", name: "Impostos" },
    { id: "software", name: "Software" },
  ],
  streams: [
    { id: "salario", name: "Salário fixo" },
    { id: "projetos", name: "Projetos avulsos" },
    { id: "negocio", name: "[NOME DO NEGÓCIO]" },
  ],
  buckets: [
    { id: "imposto", name: "Reserva de imposto (PJ)" },
    { id: "custo", name: "Reserva de custo (PJ)" },
    { id: "caixa", name: "Caixa do negócio" },
  ],
};

export const PROPOSAL_ROWS = [
  { label: "Padrão", value: "PAG*IFOOD", mono: true },
  { label: "Tipo", value: "Contém" },
  { label: "Categoria", value: "Alimentação › Delivery" },
  { label: "Retroativo", value: "14 transações" },
];

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Hoje", icon: "home", badge: 2, badgeLabel: "2 alertas não lidos" },
  { href: "/transacoes", label: "Transações", icon: "list", badge: 3, badgeLabel: "3 transações para revisar" },
  { href: "/metas", label: "Metas", icon: "target" },
  { href: "/projecao", label: "Projeção", icon: "chart" },
];
