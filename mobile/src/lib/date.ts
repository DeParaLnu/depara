// Дати розкладу це календарні дні без часового поясу (YYYY-MM-DD), час пар це «настінний» час
// університету (HH:MM). Тому все рахуємо в місцевому часі пристрою, без UTC.

const WEEKDAYS_SHORT = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const WEEKDAYS_FULL = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота'];
const WEEKDAYS_ACC = [
  'неділя',
  'понеділок',
  'вівторок',
  'середа',
  'четвер',
  'пʼятниця',
  'субота',
];
const MONTHS_GEN = [
  'січня',
  'лютого',
  'березня',
  'квітня',
  'травня',
  'червня',
  'липня',
  'серпня',
  'вересня',
  'жовтня',
  'листопада',
  'грудня',
];

const pad = (n: number) => String(n).padStart(2, '0');

export const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const fromIsoDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Понеділок тижня, до якого належить дата. */
export const mondayOf = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};

export const addDays = (d: Date, n: number) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
};

/** Сім днів тижня, починаючи з понеділка. */
export const weekDays = (monday: Date) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

export const weekdayShort = (d: Date) => WEEKDAYS_SHORT[d.getDay()];
export const weekdayShortCap = (d: Date) => {
  const s = WEEKDAYS_SHORT[d.getDay()];
  return s[0].toUpperCase() + s.slice(1);
};
export const dayMonth = (d: Date) => `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;

/** «пн 12 жовтня» для сьогодні, «Середа, 14 жовтня» для інших днів. */
export const headerTitle = (selected: Date, today: Date) =>
  toIsoDate(selected) === toIsoDate(today)
    ? `Сьогодні, ${weekdayShort(selected)} ${dayMonth(selected)}`
    : `${WEEKDAYS_FULL[selected.getDay()]}, ${dayMonth(selected)}`;

/** Для скрінрідера: «понеділок, 12 жовтня». */
export const dayLabel = (d: Date) => `${WEEKDAYS_ACC[d.getDay()]}, ${dayMonth(d)}`;

export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const nowMinutes = (now: Date) => now.getHours() * 60 + now.getMinutes();

export const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** «19–25 жовтня» або «28 жовтня – 3 листопада» для тижня, що починається в понеділок. */
export const weekRangeLabel = (monday: Date) => {
  const sunday = addDays(monday, 6);
  return monday.getMonth() === sunday.getMonth()
    ? `${monday.getDate()}–${dayMonth(sunday)}`
    : `${dayMonth(monday)} – ${dayMonth(sunday)}`;
};
