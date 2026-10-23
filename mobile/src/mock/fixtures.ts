import type { Group, LessonType, Substitution } from '../api';

// Мок-дані для розробки без бекенда і SSO (режим MOCK=1). Розклад взято з тестового тижня
// backend/prisma/seed/schedule.seed.json (група ТЕСТ-31), а дати не фіксовані: у кожному тижні
// пари повторюються з понеділка по пʼятницю, тож екрани «Сьогодні» і «Тиждень» не порожні.

export const MOCK_ME = {
  id: 'mock-user',
  email: 'student@lnu.edu.ua',
  fullName: 'Тестовий Студент',
  role: 'STUDENT' as const,
  reminderMinutes: 15,
};

export const MOCK_GROUPS: Group[] = [
  { id: 'mock-g-test-31', code: 'ТЕСТ-31', course: 3, faculty: 'Тестовий факультет' },
  { id: 'mock-g-test-11', code: 'ТЕСТ-11', course: 1, faculty: 'Тестовий факультет' },
  { id: 'mock-g-pmi-21', code: 'ПМІ-21', course: 2, faculty: 'Факультет прикладної математики та інформатики' },
  { id: 'mock-g-pmi-31', code: 'ПМІ-31', course: 3, faculty: 'Факультет прикладної математики та інформатики' },
  { id: 'mock-g-fei-41', code: 'ФеІ-41', course: 4, faculty: 'Факультет електроніки та комп’ютерних технологій' },
];

/** Розклад є лише в цієї групи. В інших груп тиждень порожній (так перевіряється порожній стан). */
export const MOCK_SCHEDULE_GROUP_ID = 'mock-g-test-31';

export const PAIR_TIMES: Record<number, { start: string; end: string }> = {
  1: { start: '08:30', end: '09:50' },
  2: { start: '10:10', end: '11:30' },
  3: { start: '11:50', end: '13:10' },
  4: { start: '13:30', end: '14:50' },
  5: { start: '15:05', end: '16:25' },
};

export type MockLesson = {
  /** 0 = понеділок … 4 = пʼятниця */
  day: number;
  pair: number;
  subject: string;
  type: LessonType;
  audience: 'STREAM' | 'COMBINED' | 'GROUP';
  subgroup: number;
  teacher: string | null;
  room: string | null; // «номер/код корпусу»
  substitution?: Omit<Substitution, 'id'>;
};

export const MOCK_LESSONS: MockLesson[] = [
  // Понеділок
  { day: 0, pair: 2, subject: 'Іноземна мова', type: 'PRACTICE', audience: 'COMBINED', subgroup: 1, teacher: 'Шандра Наталія Андріївна', room: '406/Т' },
  { day: 0, pair: 2, subject: 'Іноземна мова', type: 'PRACTICE', audience: 'COMBINED', subgroup: 2, teacher: 'Довбенко Лариса Василівна', room: '129а/Т' },
  { day: 0, pair: 3, subject: 'Оптоелектронна інформатика', type: 'LAB', audience: 'GROUP', subgroup: 1, teacher: 'Горон Богдан Ігорович', room: '218/Т' },
  { day: 0, pair: 3, subject: 'Операційні системи', type: 'LAB', audience: 'GROUP', subgroup: 2, teacher: 'Бойко Ярослав Васильович', room: 'N10/Б' },
  { day: 0, pair: 4, subject: 'Оптоелектронна інформатика', type: 'LECTURE', audience: 'STREAM', subgroup: 0, teacher: 'Корчак Юрій Михайлович', room: '1/Б' },
  { day: 0, pair: 5, subject: 'Організація баз даних та знань', type: 'LAB', audience: 'COMBINED', subgroup: 0, teacher: 'Цибуляк Богдан Зіновійович', room: '№9/Б' },
  // Вівторок
  { day: 1, pair: 1, subject: 'Основи національного спротиву', type: 'OTHER', audience: 'GROUP', subgroup: 0, teacher: null, room: null },
  {
    day: 1,
    pair: 3,
    subject: 'Основи web технологій',
    type: 'LECTURE',
    audience: 'COMBINED',
    subgroup: 0,
    teacher: 'Демків Лідія Степанівна',
    room: '3/Б',
    substitution: {
      kind: 'REPLACED',
      comment: 'Заміна викладача й аудиторії',
      newTeacher: 'Горон Богдан Ігорович',
      newRoom: '218/Т',
      newDate: null,
      newPairNumber: null,
    },
  },
  // Середа
  { day: 2, pair: 3, subject: 'Веб програмування на стороні сервера', type: 'LAB', audience: 'GROUP', subgroup: 1, teacher: 'Чмихало Олександр Сергійович', room: 'N11/Б' },
  { day: 2, pair: 3, subject: 'Оптоелектронна інформатика', type: 'LAB', audience: 'GROUP', subgroup: 2, teacher: 'Русиняк Михайло Омелянович', room: '218/Т' },
  { day: 2, pair: 4, subject: 'Операційні системи', type: 'LAB', audience: 'GROUP', subgroup: 1, teacher: 'Бойко Ярослав Васильович', room: 'N10/Б' },
  { day: 2, pair: 4, subject: 'Веб програмування на стороні сервера', type: 'LAB', audience: 'GROUP', subgroup: 2, teacher: 'Чмихало Олександр Сергійович', room: 'N11/Б' },
  { day: 2, pair: 5, subject: 'Організація баз даних та знань', type: 'LAB', audience: 'COMBINED', subgroup: 0, teacher: 'Галяткін Олександр Олександрович', room: '№5/Б' },
  // Четвер
  { day: 3, pair: 1, subject: 'Українська мова (за професійним спрямуванням)', type: 'LECTURE', audience: 'STREAM', subgroup: 0, teacher: 'Щепанська Христина Андріївна', room: '1/Б' },
  {
    day: 3,
    pair: 2,
    subject: 'Веб програмування на стороні сервера',
    type: 'LECTURE',
    audience: 'STREAM',
    subgroup: 0,
    teacher: 'Чмихало Олександр Сергійович',
    room: '1/Б',
    substitution: {
      kind: 'CANCELLED',
      comment: 'Лекцію скасовано',
      newTeacher: null,
      newRoom: null,
      newDate: null,
      newPairNumber: null,
    },
  },
  { day: 3, pair: 3, subject: 'Основи національного спротиву', type: 'OTHER', audience: 'GROUP', subgroup: 0, teacher: null, room: null },
  // Пʼятниця
  { day: 4, pair: 1, subject: 'Організація баз даних та знань', type: 'LECTURE', audience: 'STREAM', subgroup: 0, teacher: 'Гусак Олег Васильович', room: '1/Б' },
  { day: 4, pair: 2, subject: 'Операційні системи', type: 'LECTURE', audience: 'STREAM', subgroup: 0, teacher: 'Бойко Ярослав Васильович', room: '1/Б' },
  { day: 4, pair: 3, subject: 'Дія органічних речовин на психіку людини', type: 'LECTURE', audience: 'COMBINED', subgroup: 0, teacher: 'Тупичак Микола Анатолійович', room: null },
  { day: 4, pair: 4, subject: 'Дія органічних речовин на психіку людини', type: 'PRACTICE', audience: 'COMBINED', subgroup: 0, teacher: 'Тупичак Микола Анатолійович', room: null },
];
