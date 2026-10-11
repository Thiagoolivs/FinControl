// Onde o vocabulário da Pluggy vira o nosso. Puro: sem rede, sem banco.
import type { AccountType, AssetClass, ConnectionStatus } from "@/generated/prisma/enums";
import { localDateOf } from "@/lib/dates";
import { decimalToCents } from "@/lib/finance/money";

const STATUS: Record<string, ConnectionStatus> = {
  UPDATED: "UPDATED",
  UPDATING: "UPDATING",
  MERGING: "UPDATING",
  WAITING_USER_INPUT: "WAITING_USER_INPUT",
  WAITING_USER_ACTION: "WAITING_USER_INPUT",
  LOGIN_ERROR: "LOGIN_ERROR",
  OUTDATED: "OUTDATED",
};

/** Status desconhecido vira OUTDATED: melhor pedir atenção do que fingir que está tudo certo. */
export function toConnectionStatus(status: string): ConnectionStatus {
  return Object.hasOwn(STATUS, status) ? (STATUS[status] as ConnectionStatus) : "OUTDATED";
}

/** Conexão que só volta a funcionar com ação do usuário (reconectar). */
export function needsReconnect(status: ConnectionStatus): boolean {
  return status === "LOGIN_ERROR" || status === "OUTDATED";
}

/** null = tipo que esta fase não importa. */
export function toAccountType(type: string, subtype: string | null | undefined): AccountType | null {
  if (type === "CREDIT") return "CREDIT";
  if (type === "BANK") return subtype === "SAVINGS_ACCOUNT" ? "SAVINGS" : "CHECKING";
  return null;
}

/**
 * Sinal do app: negativo = saída. Em conta bancária a Pluggy já usa esse sinal; no cartão ela manda
 * compra positiva e pagamento/estorno negativo, então o sinal é invertido.
 * Compra em moeda estrangeira usa o valor convertido para a moeda da conta.
 */
export function toTransactionCents(
  accountType: AccountType,
  amount: number,
  amountInAccountCurrency?: number | null,
): number {
  const cents = decimalToCents(amountInAccountCurrency ?? amount);
  return accountType === "CREDIT" && cents !== 0 ? -cents : cents;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const UTC_MIDNIGHT = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?Z$/;

/**
 * Data de calendário de um campo de data da Pluggy. Meia-noite UTC exata é data sem hora serializada
 * (convertê-la para São Paulo jogaria a transação para o dia anterior); qualquer outro instante é
 * convertido para o dia local.
 */
export function toLocalDate(value: string): string {
  if (DATE_ONLY.test(value)) return value;
  const midnight = UTC_MIDNIGHT.exec(value);
  if (midnight?.[1]) return midnight[1];
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new RangeError(`Data inválida da Pluggy: ${value}`);
  return localDateOf(instant);
}

/**
 * Tipo/subtipo de investimento da Pluggy → nossa classe. FII vem como EQUITY/REAL_ESTATE_FUND; ETF e BDR
 * contam como ação; COE e Tesouro, como renda fixa. Desconhecido vira fundo (aparece, não some).
 */
export function toAssetClass(type: string, subtype: string | null | undefined): AssetClass {
  const sub = (subtype ?? "").toUpperCase();
  if (sub.includes("CRYPTO")) return "CRIPTO";
  if (sub === "REAL_ESTATE_FUND") return "FII";
  if (type === "EQUITY" || type === "ETF") return "ACAO";
  if (type === "FIXED_INCOME" || type === "COE" || sub === "TREASURY") return "RENDA_FIXA";
  return "FUNDO";
}

/** Quantidade como texto decimal sem notação científica (o banco guarda Decimal com 10 casas). */
export function toQuantity(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "0";
  return value.toFixed(10).replace(/\.?0+$/, "");
}
