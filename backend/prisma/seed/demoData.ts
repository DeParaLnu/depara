// Дані для демо: факультети, групи, викладачі, корпуси і розклад на 5 тижнів навколо вказаної дати.
// Чиста функція без доступу до бази: її перевіряють юніт-тести (немає подвійних аудиторій і викладачів).
// Усе вигадане, окрім назв факультетів і вулиць: імена викладачів не належать реальним людям,
// а адреси корпусів орієнтовні. Перед показом команді/деканату звірте їх.
import type { ImportPayload } from '../../src/lib/scheduleImport';

type Kind = 'LECTURE' | 'PRACTICE' | 'LAB';
type Pair<T> = T | [T, T]; // одне значення для всіх груп шаблону або окреме для кожної з двох груп

interface Row {
  d: 1 | 2 | 3 | 4 | 5; // день тижня, 1 = понеділок
  p: Pair<number>; // номер пари
  subject: string;
  type: Kind; // лекція йде на весь потік (STREAM), решта на групу (GROUP)
  sub?: 1 | 2; // підгрупа (лабораторні діляться на двох)
  t: Pair<string>; // викладач
  r: Pair<string>; // аудиторія у форматі "номер/літера корпусу"
  week?: 'odd' | 'even'; // лише у непарні/парні тижні (чисельник/знаменник)
}

interface Template {
  faculty: string; // short_name
  groups: string[]; // 1 або 2 групи, що вчаться за цим шаблоном
  rows: Row[];
}

export const PAIR_TIMES = [
  { pair: 1, start: '08:30', end: '09:50' },
  { pair: 2, start: '10:10', end: '11:30' },
  { pair: 3, start: '11:50', end: '13:10' },
  { pair: 4, start: '13:30', end: '14:50' },
  { pair: 5, start: '15:05', end: '16:25' },
];

export const FACULTIES = [
  { name: 'Факультет прикладної математики та інформатики', short_name: 'ПМІ' },
  { name: 'Факультет електроніки та комп\'ютерних технологій', short_name: 'ФЕІ' },
  { name: 'Економічний факультет', short_name: 'ЕКО' },
  { name: 'Юридичний факультет', short_name: 'ЮР' },
];

export const GROUPS = [
  { code: 'ПМІ-11', course: 1, faculty: 'ПМІ' },
  { code: 'ПМІ-12', course: 1, faculty: 'ПМІ' },
  { code: 'ПМІ-31', course: 3, faculty: 'ПМІ' },
  { code: 'ФЕІ-21', course: 2, faculty: 'ФЕІ' },
  { code: 'ФЕІ-22', course: 2, faculty: 'ФЕІ' },
  { code: 'ЕК-11', course: 1, faculty: 'ЕКО' },
  // Для цієї групи розкладу немає навмисно: так показується екран «Розклад ще не опубліковано»
  { code: 'ЮР-41', course: 4, faculty: 'ЮР' },
];

export const UNPUBLISHED_GROUP = 'ЮР-41';

// Літери корпусів не збігаються з тестовими Б і Т із schedule.seed.json, щоб демо не перезаписувало їх
export const BUILDINGS = [
  { code: 'Г', name: 'Головний корпус', address: 'вул. Університетська, 1' },
  { code: 'Д', name: 'Корпус на Драгоманова', address: 'вул. Драгоманова, 50' },
  { code: 'К', name: 'Корпус на Кирила і Мефодія', address: 'вул. Кирила і Мефодія, 8' },
  { code: 'С', name: 'Спортивний комплекс', address: 'вул. Козельницька, 2а' },
];

const T = {
  melnyk: 'Мельник Остап Іванович',
  koval: 'Коваль Ірина Петрівна',
  shevchuk: 'Шевчук Андрій Романович',
  bondarenko: 'Бондаренко Оксана Мирославівна',
  tkachuk: 'Ткачук Назар Богданович',
  kravets: 'Кравець Марта Юріївна',
  lys: 'Лис Тарас Олегович',
  havryliak: 'Гавриляк Софія Василівна',
  zinchuk: 'Зінчук Василь Петрович',
  dmytruk: 'Дмитрук Роман Ігорович',
  oliinyk: 'Олійник Дарина Святославівна',
  protsiuk: 'Процюк Богдан Тарасович',
  levytska: 'Левицька Наталія Ярославівна',
  stelmakh: 'Стельмах Ігор Леонідович',
  pylypiv: 'Пилипів Юлія Андріївна',
  romaniuk: 'Романюк Максим Олегович',
  kushnir: 'Кушнір Леся Орестівна',
  yaremchuk: 'Яремчук Олексій Вікторович',
  khomyn: 'Хомин Тетяна Григорівна',
  sydorchuk: 'Сидорчук Павло Миколайович',
  hryniv: 'Гринів Мирослав Андрійович',
  pankiv: 'Паньків Оксана Іванівна',
  stasiuk: 'Стасюк Віталій Романович',
  boichuk: 'Бойчук Ліна Олексіївна',
  martyniuk: 'Мартинюк Денис Петрович',
  ivaniv: 'Іванів Катерина Юріївна',
  hnatiuk: 'Гнатюк Артем Сергійович',
  fedyna: 'Федина Ірина Богданівна',
  savruk: 'Саврук Ольга Миколаївна',
  danyliuk: 'Данилюк Роман Євгенович',
  kyzyma: 'Кізима Світлана Павлівна',
  mazur: 'Мазур Тетяна Іванівна',
  pidlisnyi: 'Підлісний Андрій Васильович',
  tsymbal: 'Цимбал Юрій Орестович',
} as const;

export const TEACHERS: { full_name: string; position: string }[] = [
  [T.melnyk, 'професор'], [T.koval, 'доцент'], [T.shevchuk, 'доцент'], [T.bondarenko, 'старший викладач'],
  [T.tkachuk, 'асистент'], [T.kravets, 'доцент'], [T.lys, 'асистент'], [T.havryliak, 'доцент'],
  [T.zinchuk, 'професор'], [T.dmytruk, 'старший викладач'], [T.oliinyk, 'доцент'], [T.protsiuk, 'доцент'],
  [T.levytska, 'старший викладач'], [T.stelmakh, 'професор'], [T.pylypiv, 'асистент'], [T.romaniuk, 'доцент'],
  [T.kushnir, 'доцент'], [T.yaremchuk, 'доцент'], [T.khomyn, 'професор'], [T.sydorchuk, 'асистент'],
  [T.hryniv, 'доцент'], [T.pankiv, 'професор'], [T.stasiuk, 'доцент'], [T.boichuk, 'асистент'],
  [T.martyniuk, 'доцент'], [T.ivaniv, 'старший викладач'], [T.hnatiuk, 'асистент'], [T.fedyna, 'доцент'],
  [T.savruk, 'професор'], [T.danyliuk, 'доцент'], [T.kyzyma, 'доцент'], [T.mazur, 'старший викладач'],
  [T.pidlisnyi, 'асистент'], [T.tsymbal, 'доцент'],
].map(([full_name, position]) => ({ full_name, position }));

const TEMPLATES: Template[] = [
  {
    // ПМІ, 1 курс, дві групи: практичні й лабораторні в різний час або в різних аудиторіях
    faculty: 'ПМІ',
    groups: ['ПМІ-11', 'ПМІ-12'],
    rows: [
      { d: 1, p: 1, subject: 'Математичний аналіз', type: 'LECTURE', t: T.melnyk, r: '201/Г' },
      { d: 1, p: 2, subject: 'Алгебра і геометрія', type: 'PRACTICE', t: [T.koval, T.shevchuk], r: ['312/Г', '314/Г'] },
      { d: 1, p: [3, 4], subject: 'Основи програмування', type: 'LAB', sub: 1, t: T.lys, r: '18/Д' },
      { d: 1, p: [3, 4], subject: 'Основи програмування', type: 'LAB', sub: 2, t: T.tkachuk, r: '19/Д' },
      { d: 2, p: 1, subject: 'Дискретна математика', type: 'LECTURE', t: T.koval, r: '203/Г' },
      { d: 2, p: 2, subject: 'Англійська мова', type: 'PRACTICE', t: [T.levytska, T.bondarenko], r: ['110/Г', '112/Г'] },
      { d: 2, p: 3, subject: 'Математичний аналіз', type: 'PRACTICE', t: [T.havryliak, T.oliinyk], r: ['305/Г', '307/Г'] },
      { d: 3, p: 2, subject: 'Основи програмування', type: 'LECTURE', t: T.shevchuk, r: '201/Г' },
      { d: 3, p: 3, subject: 'Історія України', type: 'LECTURE', t: T.zinchuk, r: '115/Г', week: 'odd' },
      { d: 3, p: 3, subject: 'Історія України', type: 'PRACTICE', t: [T.kushnir, T.protsiuk], r: ['117/Г', '118/Г'], week: 'even' },
      { d: 4, p: 1, subject: 'Алгебра і геометрія', type: 'LECTURE', t: T.koval, r: '203/Г' },
      { d: 4, p: [2, 3], subject: 'Фізична культура', type: 'PRACTICE', t: T.dmytruk, r: '1/С' },
      { d: 5, p: 1, subject: 'Дискретна математика', type: 'PRACTICE', t: [T.kravets, T.romaniuk], r: ['312/Г', '314/Г'] },
      { d: 5, p: 2, subject: 'Вступ до спеціальності', type: 'LECTURE', t: T.stelmakh, r: '201/Г', week: 'odd' },
    ],
  },
  {
    // ПМІ, 3 курс, одна група
    faculty: 'ПМІ',
    groups: ['ПМІ-31'],
    rows: [
      { d: 1, p: 1, subject: 'Організація баз даних та знань', type: 'LECTURE', t: T.yaremchuk, r: '205/Г' },
      { d: 1, p: 2, subject: 'Операційні системи', type: 'LECTURE', t: T.khomyn, r: '205/Г' },
      { d: 1, p: 3, subject: 'Організація баз даних та знань', type: 'LAB', sub: 1, t: T.sydorchuk, r: '22/Д' },
      { d: 1, p: 3, subject: 'Організація баз даних та знань', type: 'LAB', sub: 2, t: T.pylypiv, r: '23/Д' },
      { d: 2, p: 2, subject: 'Комп\'ютерні мережі', type: 'LECTURE', t: T.romaniuk, r: '209/Г' },
      { d: 2, p: 4, subject: 'Алгоритми та структури даних', type: 'PRACTICE', t: T.shevchuk, r: '316/Г' },
      { d: 2, p: 5, subject: 'Алгоритми та структури даних', type: 'LAB', sub: 1, t: T.pylypiv, r: '22/Д' },
      { d: 2, p: 5, subject: 'Алгоритми та структури даних', type: 'LAB', sub: 2, t: T.sydorchuk, r: '23/Д' },
      { d: 3, p: 1, subject: 'Теорія ймовірностей', type: 'LECTURE', t: T.protsiuk, r: '205/Г' },
      { d: 3, p: 2, subject: 'Теорія ймовірностей', type: 'PRACTICE', t: T.havryliak, r: '318/Г' },
      { d: 3, p: 4, subject: 'Англійська для IT', type: 'PRACTICE', t: T.levytska, r: '120/Г' },
      { d: 4, p: 2, subject: 'Комп\'ютерні мережі', type: 'LAB', sub: 1, t: T.boichuk, r: '24/Д' },
      { d: 4, p: 2, subject: 'Комп\'ютерні мережі', type: 'LAB', sub: 2, t: T.hnatiuk, r: '25/Д' },
      { d: 4, p: 3, subject: 'Операційні системи', type: 'PRACTICE', t: T.tkachuk, r: '19/Д' },
      { d: 5, p: 1, subject: 'Проєктна практика', type: 'PRACTICE', t: T.yaremchuk, r: '11/К', week: 'even' },
      { d: 5, p: 2, subject: 'Алгоритми та структури даних', type: 'LECTURE', t: T.shevchuk, r: '205/Г' },
    ],
  },
  {
    // ФЕІ, 2 курс, дві групи
    faculty: 'ФЕІ',
    groups: ['ФЕІ-21', 'ФЕІ-22'],
    rows: [
      { d: 1, p: 1, subject: 'Фізика', type: 'LECTURE', t: T.pankiv, r: '301/Д' },
      { d: 1, p: 2, subject: 'Електротехніка', type: 'LECTURE', t: T.hryniv, r: '301/Д' },
      { d: 1, p: [3, 4], subject: 'Електротехніка', type: 'LAB', sub: 1, t: T.boichuk, r: '12/Д' },
      { d: 1, p: [3, 4], subject: 'Електротехніка', type: 'LAB', sub: 2, t: T.hnatiuk, r: '13/Д' },
      { d: 2, p: 1, subject: 'Вища математика', type: 'LECTURE', t: T.stasiuk, r: '305/Д' },
      { d: 2, p: 2, subject: 'Вища математика', type: 'PRACTICE', t: [T.martyniuk, T.fedyna], r: ['307/Д', '309/Д'] },
      { d: 2, p: 3, subject: 'Англійська мова', type: 'PRACTICE', t: [T.ivaniv, T.levytska], r: ['110/Г', '112/Г'] },
      { d: 3, p: 2, subject: 'Схемотехніка', type: 'LECTURE', t: T.hryniv, r: '301/Д' },
      { d: 3, p: 3, subject: 'Схемотехніка', type: 'PRACTICE', t: [T.fedyna, T.martyniuk], r: ['307/Д', '309/Д'] },
      { d: 4, p: 1, subject: 'Фізика', type: 'PRACTICE', t: [T.boichuk, T.hnatiuk], r: ['311/Д', '313/Д'] },
      { d: 4, p: 2, subject: 'Програмування мовою C', type: 'LECTURE', t: T.sydorchuk, r: '301/Д', week: 'odd' },
      { d: 4, p: [3, 4], subject: 'Програмування мовою C', type: 'LAB', sub: 1, t: T.pylypiv, r: '14/Д' },
      { d: 4, p: [3, 4], subject: 'Програмування мовою C', type: 'LAB', sub: 2, t: T.lys, r: '15/Д' },
      { d: 5, p: [3, 4], subject: 'Фізична культура', type: 'PRACTICE', t: T.dmytruk, r: '1/С' },
    ],
  },
  {
    // ЕКО, 1 курс, одна група
    faculty: 'ЕКО',
    groups: ['ЕК-11'],
    rows: [
      { d: 1, p: 1, subject: 'Мікроекономіка', type: 'LECTURE', t: T.savruk, r: '101/К' },
      { d: 1, p: 2, subject: 'Мікроекономіка', type: 'PRACTICE', t: T.danyliuk, r: '103/К' },
      { d: 1, p: 3, subject: 'Вища математика для економістів', type: 'LECTURE', t: T.tsymbal, r: '101/К' },
      { d: 2, p: 2, subject: 'Статистика', type: 'LECTURE', t: T.kyzyma, r: '101/К' },
      { d: 2, p: 3, subject: 'Вища математика для економістів', type: 'PRACTICE', t: T.pidlisnyi, r: '105/К' },
      { d: 3, p: 1, subject: 'Бухгалтерський облік', type: 'LECTURE', t: T.mazur, r: '101/К' },
      { d: 3, p: 2, subject: 'Українська мова за професійним спрямуванням', type: 'PRACTICE', t: T.kushnir, r: '107/К' },
      { d: 3, p: 3, subject: 'Англійська мова', type: 'PRACTICE', t: T.bondarenko, r: '109/К' },
      { d: 4, p: 1, subject: 'Макроекономіка', type: 'LECTURE', t: T.savruk, r: '101/К', week: 'odd' },
      { d: 4, p: 1, subject: 'Макроекономіка', type: 'PRACTICE', t: T.danyliuk, r: '103/К', week: 'even' },
      { d: 4, p: 2, subject: 'Статистика', type: 'PRACTICE', t: T.kyzyma, r: '105/К' },
      { d: 5, p: 5, subject: 'Фізична культура', type: 'PRACTICE', t: T.dmytruk, r: '1/С' },
    ],
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function mondayOf(d: Date): number {
  const x = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return x - ((new Date(x).getUTCDay() + 6) % 7) * DAY_MS;
}

// Тижні від попереднього до третього наступного: є що гортати назад і вперед
export const WEEKS_BEFORE = 1;
export const WEEKS_AFTER = 3;

// Опорний понеділок для чисельника/знаменника: тиждень, що містить цей понеділок, вважається непарним
const PARITY_ANCHOR = Date.UTC(2026, 7, 31);

const pick = <T>(v: Pair<T>, i: number): T => (Array.isArray(v) ? v[i] : v);

export function buildDemoPayload(now: Date): ImportPayload {
  const thisMonday = mondayOf(now);
  const lessons: ImportPayload['lessons'] = [];

  for (let w = -WEEKS_BEFORE; w <= WEEKS_AFTER; w++) {
    const monday = thisMonday + w * 7 * DAY_MS;
    const weekIndex = Math.round((monday - PARITY_ANCHOR) / (7 * DAY_MS));
    const parity = Math.abs(weekIndex) % 2 === 0 ? 'odd' : 'even';

    for (const tpl of TEMPLATES) {
      tpl.groups.forEach((group, gi) => {
        for (const row of tpl.rows) {
          if (row.week && row.week !== parity) continue;
          lessons.push({
            group,
            faculty: tpl.faculty,
            date: iso(monday + (row.d - 1) * DAY_MS),
            pair: pick(row.p, gi),
            subject: row.subject,
            type: row.type,
            teacher: pick(row.t, gi),
            audience: row.type === 'LECTURE' ? 'STREAM' : 'GROUP',
            subgroup: row.sub ?? 0,
            room: pick(row.r, gi),
          });
        }
      });
    }
  }

  return {
    pair_times: PAIR_TIMES,
    faculties: FACULTIES,
    groups: GROUPS,
    buildings: BUILDINGS,
    teachers: TEACHERS,
    lessons,
  };
}

// Демо-акаунти. Адмін тут навмисно відсутній: його роль дає лише ADMIN_EMAILS.
export const DEMO_USERS = [
  { email: 'demo.student@lnu.edu.ua', fullName: 'Олена Демченко', role: 'STUDENT', group: 'ПМІ-31', subgroup: 1 },
  { email: 'demo.headman@lnu.edu.ua', fullName: 'Максим Староста', role: 'HEADMAN', group: 'ПМІ-31', subgroup: 0 },
  { email: 'demo.first-year@lnu.edu.ua', fullName: 'Соломія Першокурсниця', role: 'STUDENT', group: 'ПМІ-11', subgroup: 2 },
  { email: 'demo.electronics@lnu.edu.ua', fullName: 'Данило Електронов', role: 'STUDENT', group: 'ФЕІ-21', subgroup: 0 },
  { email: 'demo.unpublished@lnu.edu.ua', fullName: 'Ярина Без Розкладу', role: 'STUDENT', group: UNPUBLISHED_GROUP, subgroup: 0 },
  { email: 'demo.newcomer@lnu.edu.ua', fullName: 'Нова Користувачка', role: 'STUDENT', group: null, subgroup: 0 },
] as const;

export const DEMO_HEADMAN = 'demo.headman@lnu.edu.ua';
export const DEMO_STUDENT_GROUP = 'ПМІ-31';
