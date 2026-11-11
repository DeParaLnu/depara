import type { Lesson } from '../../api';
import { fromIsoDate, minutesOf } from '../../lib/date';
import { roomLabel } from '../schedule/lesson';

// F8: локальні нагадування перед парою. Чиста логіка без нативних модулів (її перевіряють юніт-тести):
// які пари нагадати і коли. Саме планування сповіщень у notifications.ts.

/** Нагадування з кнопки в деталях однієї пари: окремий префікс, щоб загальне планування його не скасовувало. */
export const ONCE_PREFIX = 'once-';

export const REMINDER_OPTIONS = [0, 10, 15] as const;
export type ReminderMinutes = (typeof REMINDER_OPTIONS)[number];

export const isReminderMinutes = (v: unknown): v is ReminderMinutes =>
  typeof v === 'number' && (REMINDER_OPTIONS as readonly number[]).includes(v);

/** iOS тримає не більше 64 запланованих сповіщень на застосунок: беремо з запасом найближчі. */
export const MAX_REMINDERS = 40;

export type PlannedReminder = { id: string; at: Date; title: string; body: string };

/** Початок пари як локальний час телефона. Розклад у часі університету: для Львова й телефона в Україні це одне й те саме. */
export const lessonStart = (lesson: Lesson): Date => {
  const d = fromIsoDate(lesson.date);
  const m = minutesOf(lesson.start);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(m / 60), m % 60);
};

/** Нагадування для однієї пари за `minutes` хв до початку; null, якщо нагадувати не треба (скасована, перенесена, початок уже минув). */
export function planLessonReminder(
  lesson: Lesson,
  minutes: Exclude<ReminderMinutes, 0>,
  now: Date,
  idPrefix = 'lesson-',
): PlannedReminder | null {
  const kind = lesson.substitution?.kind;
  if (kind === 'CANCELLED' || kind === 'MOVED') return null;
  const at = new Date(lessonStart(lesson).getTime() - minutes * 60_000);
  if (at.getTime() <= now.getTime()) return null;

  const room = roomLabel(lesson.substitution?.newRoom ?? lesson.room);
  const teacher = lesson.substitution?.newTeacher ?? lesson.teacher;
  return {
    id: `${idPrefix}${lesson.id}`,
    at,
    title: `${lesson.subject} через ${minutes} хв`,
    body: [lesson.start, room, teacher].filter(Boolean).join(' · '),
  };
}

/**
 * Нагадування для пар, що ще попереду: за `minutes` хвилин до початку.
 * Скасовані пари пропускаємо. Перенесені теж: їхній новий час розклад не віддає (лише дату й номер пари).
 * Нова аудиторія й викладач із заміни потрапляють у текст.
 */
export function planReminders(lessons: Lesson[], minutes: ReminderMinutes, now: Date): PlannedReminder[] {
  if (minutes === 0) return [];
  const seen = new Set<string>();
  const planned: PlannedReminder[] = [];
  for (const lesson of lessons) {
    if (seen.has(lesson.id)) continue;
    seen.add(lesson.id);
    const reminder = planLessonReminder(lesson, minutes, now);
    if (reminder) planned.push(reminder);
  }
  return planned.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_REMINDERS);
}

/** Ключ плану: якщо він не змінився, перепланувати сповіщення не треба. */
export const planKey = (plan: PlannedReminder[]) =>
  plan.map((p) => `${p.id}@${p.at.getTime()}:${p.title}:${p.body}`).join('|');
