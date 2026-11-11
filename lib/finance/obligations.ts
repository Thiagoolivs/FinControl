// Contas fixas mensais com lembrete (ex.: DAS do MEI). Puro: só datas.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Dia `dueDay` de um mês "YYYY-MM", limitado ao último dia (31 em fevereiro vira 28/29). */
export function dueDateIn(month: string, dueDay: number): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new RangeError(`Mês inválido: ${month}`);
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) throw new RangeError(`Dia de vencimento inválido: ${dueDay}`);
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(Math.min(dueDay, lastDay)).padStart(2, "0")}`;
}

/** Próximo vencimento a partir de hoje (hoje conta): neste mês, se ainda não passou; senão, no seguinte. */
export function nextDueDate(today: string, dueDay: number): string {
  if (!DATE_ONLY.test(today)) throw new RangeError(`Data inválida: ${today}`);
  const thisMonth = dueDateIn(today.slice(0, 7), dueDay);
  if (thisMonth >= today) return thisMonth;
  const [year, month] = today.slice(0, 7).split("-").map(Number) as [number, number];
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  return dueDateIn(next, dueDay);
}
