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

const dayMonth = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "UTC" });
const dayMonthYear = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const clock = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE });

/** Rótulo de grupo de transações: "Hoje", "Ontem", "8 de outubro", "30 de dezembro de 2025". */
export function formatDayLabel(date: string, today: string): string {
  const diff = daysBetween(date, today);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  const value = toDbDate(date);
  return date.slice(0, 4) === today.slice(0, 4) ? dayMonth.format(value) : dayMonthYear.format(value);
}

/** "agora", "há 12 min", "há 3 h", "há 2 dias". */
export function formatElapsed(instant: Date, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - instant.getTime()) / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} ${days === 1 ? "dia" : "dias"}`;
}

/** "hoje às 14:30", "amanhã às 08:15", "12 de outubro às 08:15". Horário de São Paulo. */
export function formatMoment(instant: Date, now: Date = new Date()): string {
  const time = clock.format(instant);
  const diff = daysBetween(localDateOf(now), localDateOf(instant));
  if (diff === 0) return `hoje às ${time}`;
  if (diff === 1) return `amanhã às ${time}`;
  return `${dayMonth.format(toDbDate(localDateOf(instant)))} às ${time}`;
}
