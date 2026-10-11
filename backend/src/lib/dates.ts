// Понеділок тижня, до якого належить дата (UTC, час обнулено).
export function mondayOf(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayOfWeek = (x.getUTCDay() + 6) % 7; // понеділок = 0
  x.setUTCDate(x.getUTCDate() - dayOfWeek);
  return x;
}
