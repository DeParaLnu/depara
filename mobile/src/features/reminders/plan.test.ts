import { describe, expect, it } from 'vitest';
import type { Lesson, Room, Substitution } from '../../api';
import { isReminderMinutes, lessonStart, MAX_REMINDERS, ONCE_PREFIX, planKey, planLessonReminder, planReminders } from './plan';

const room = (number: string, code: string): Room => ({
  id: `c-${number}`,
  number,
  label: `${number}/${code}`,
  building: { code, name: `Корпус ${code}`, address: 'вул. Тестова, 1' },
});
const lesson = (over: Partial<Lesson> = {}): Lesson => ({
  id: 'l1',
  date: '2026-11-04',
  pairNumber: 3,
  start: '11:50',
  end: '13:10',
  subject: 'Операційні системи',
  type: 'LAB',
  audience: 'GROUP',
  subgroup: 0,
  teacher: 'Бойко Я. В.',
  room: room('N10', 'Б'),
  substitution: null,
  ...over,
});
const sub = (over: Partial<Substitution>): Substitution => ({
  id: 's',
  kind: 'REPLACED',
  comment: null,
  newTeacher: null,
  newRoom: null,
  newDate: null,
  newPairNumber: null,
  ...over,
});
const at = (iso: string, hh: number, mm: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, hh, mm);
};

describe('planReminders', () => {
  it('нагадує за обрану кількість хвилин до початку пари, з аудиторією й викладачем', () => {
    const [r] = planReminders([lesson()], 10, at('2026-11-04', 8, 0));
    expect(r.at).toEqual(at('2026-11-04', 11, 40));
    expect(r).toMatchObject({
      id: 'lesson-l1',
      title: 'Операційні системи через 10 хв',
      body: '11:50 · Корпус Б · ауд. N10 · Бойко Я. В.',
    });
  });

  it('вимкнені нагадування (0) нічого не планують', () => {
    expect(planReminders([lesson()], 0, at('2026-11-04', 8, 0))).toEqual([]);
  });

  it('пари, час нагадування яких минув, пропускаються', () => {
    expect(planReminders([lesson()], 15, at('2026-11-04', 11, 35))).toEqual([]);
    expect(planReminders([lesson()], 15, at('2026-11-04', 11, 34))).toHaveLength(1);
  });

  it('скасовані й перенесені пари не нагадуються', () => {
    const now = at('2026-11-04', 8, 0);
    expect(planReminders([lesson({ substitution: sub({ kind: 'CANCELLED' }) })], 10, now)).toEqual([]);
    expect(planReminders([lesson({ substitution: sub({ kind: 'MOVED', newPairNumber: 5 }) })], 10, now)).toEqual([]);
  });

  it('нова аудиторія й викладач із заміни потрапляють у текст', () => {
    const [moved] = planReminders([lesson({ substitution: sub({ kind: 'ROOM_CHANGED', newRoom: room('218', 'Т') }) })], 10, at('2026-11-04', 8, 0));
    expect(moved.body).toBe('11:50 · Корпус Т · ауд. 218 · Бойко Я. В.');
    const [teacher] = planReminders([lesson({ substitution: sub({ newTeacher: 'Корчак Ю. М.' }) })], 10, at('2026-11-04', 8, 0));
    expect(teacher.body).toBe('11:50 · Корпус Б · ауд. N10 · Корчак Ю. М.');
  });

  it('пара без аудиторії й викладача: лише час', () => {
    const [r] = planReminders([lesson({ room: null, teacher: null })], 10, at('2026-11-04', 8, 0));
    expect(r.body).toBe('11:50');
  });

  it('сортує за часом, прибирає дублі, обмежує кількість', () => {
    const now = at('2026-11-02', 0, 0);
    const plan = planReminders(
      [lesson({ id: 'b', date: '2026-11-05' }), lesson({ id: 'a', date: '2026-11-04' }), lesson({ id: 'a', date: '2026-11-04' })],
      10,
      now,
    );
    expect(plan.map((p) => p.id)).toEqual(['lesson-a', 'lesson-b']);

    const many = Array.from({ length: MAX_REMINDERS + 10 }, (_, i) => lesson({ id: `x${i}`, date: '2026-11-06' }));
    expect(planReminders(many, 10, now)).toHaveLength(MAX_REMINDERS);
  });

  it('ключ плану змінюється, лише коли змінюється сам план', () => {
    const now = at('2026-11-04', 8, 0);
    expect(planKey(planReminders([lesson()], 10, now))).toBe(planKey(planReminders([lesson()], 10, at('2026-11-04', 9, 0))));
    expect(planKey(planReminders([lesson()], 10, now))).not.toBe(planKey(planReminders([lesson()], 15, now)));
  });
});

describe('planLessonReminder (кнопка в деталях пари)', () => {
  const now = at('2026-11-04', 8, 0);

  it('ставить нагадування за 10 хв з окремим префіксом id', () => {
    const r = planLessonReminder(lesson(), 10, now, ONCE_PREFIX);
    expect(r).toMatchObject({ id: 'once-l1', title: 'Операційні системи через 10 хв' });
    expect(r?.at).toEqual(at('2026-11-04', 11, 40));
  });

  it('без префікса id збігається з загальним нагадуванням', () => {
    expect(planLessonReminder(lesson(), 10, now)?.id).toBe('lesson-l1');
  });

  it('скасована, перенесена або вже почата пара нагадування не отримує', () => {
    expect(planLessonReminder(lesson({ substitution: sub({ kind: 'CANCELLED' }) }), 10, now)).toBeNull();
    expect(planLessonReminder(lesson({ substitution: sub({ kind: 'MOVED' }) }), 10, now)).toBeNull();
    expect(planLessonReminder(lesson(), 10, at('2026-11-04', 11, 45))).toBeNull();
  });
});

describe('допоміжне', () => {
  it('lessonStart бере дату й час пари', () => {
    expect(lessonStart(lesson({ date: '2026-12-31', start: '08:30' }))).toEqual(at('2026-12-31', 8, 30));
  });

  it('isReminderMinutes приймає лише 0, 10, 15', () => {
    expect([0, 10, 15].every(isReminderMinutes)).toBe(true);
    expect(isReminderMinutes(5)).toBe(false);
    expect(isReminderMinutes('10')).toBe(false);
  });
});
