const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

// Підгрупа: 0 = усі підгрупи, 1 або 2
export const isSubgroup = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 2;

export const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

// Параметр пошуку ?q=: необовʼязковий рядок розумної довжини. Повторюваний параметр (?q=a&q=b) Fastify віддає
// масивом, і Prisma на ньому падає 500, тож відхиляємо його на межі як 400.
export const MAX_SEARCH_LENGTH = 100;
export const isSearchQuery = (v: unknown): v is string | undefined =>
  v === undefined || (typeof v === 'string' && v.length <= MAX_SEARCH_LENGTH);

// Дата у форматі YYYY-MM-DD, яка реально існує в календарі.
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
