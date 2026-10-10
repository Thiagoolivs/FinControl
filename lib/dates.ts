// Datas de calendário ("YYYY-MM-DD") no fuso do app. Campos @db.Date guardam essas datas como meia-noite UTC.

export const APP_TIME_ZONE = "America/Sao_Paulo";

const localFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function assertDateOnly(date: string): void {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (!DATE_ONLY.test(date) || Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date) {
    throw new RangeError(`Data inválida: ${date}`);
  }
}

/** Dia de calendário de um instante em São Paulo. */
export function localDateOf(instant: Date): string {
  if (Number.isNaN(instant.getTime())) throw new RangeError("Instante inválido");
  return localFormat.format(instant);
}

export function todayLocal(now: Date = new Date()): string {
  return localDateOf(now);
}

export function addDays(date: string, days: number): string {
  assertDateOnly(date);
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** `to − from`, em dias. */
export function daysBetween(from: string, to: string): number {
  assertDateOnly(from);
  assertDateOnly(to);
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Valor para gravar em campo @db.Date. */
export function toDbDate(date: string): Date {
  assertDateOnly(date);
  return new Date(`${date}T00:00:00.000Z`);
}

/** Valor lido de campo @db.Date. */
export function fromDbDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
