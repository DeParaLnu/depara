import type { Lesson, LessonType, Substitution } from '../../api';
import { minutesOf, nowMinutes, toIsoDate } from '../../lib/date';

export const lessonTypeLabel: Record<LessonType, string | null> = {
  LECTURE: 'Лекція',
  PRACTICE: 'Практична',
  LAB: 'Лабораторна',
  EXAM: 'Іспит',
  OTHER: null,
};

export const audienceLabel = (a: Lesson['audience']) =>
  a === 'STREAM' ? 'Потік' : a === 'COMBINED' ? 'Збірна група' : null;

/** Бекенд віддає аудиторію як «218/Т» (номер/код корпусу). */
export function parseRoom(room: string | null): { number: string; building: string } | null {
  if (!room) return null;
  const [number, building] = room.split('/');
  return { number, building: building ?? '' };
}

export const roomLabel = (room: string | null) => {
  const r = parseRoom(room);
  if (!r) return null;
  return r.building ? `Корпус ${r.building} · ауд. ${r.number}` : `ауд. ${r.number}`;
};

export const substitutionBadge = (s: Substitution) =>
  s.kind === 'CANCELLED' ? 'Скасовано' : s.kind === 'MOVED' ? 'Перенесено' : 'Заміна';

export type LessonStatus =
  | { kind: 'done' }
  | { kind: 'now'; remainingMin: number; progress: number }
  | { kind: 'next' }
  | { kind: 'later' };

/**
 * Стан пари відносно «зараз». Для днів не з сьогодні всі пари «later»,
 * «next» отримує лише найближча пара сьогодні, яка ще не почалась (визначає викликач).
 */
export function lessonStatus(lesson: Lesson, now: Date): LessonStatus {
  if (lesson.date !== toIsoDate(now)) return { kind: lesson.date < toIsoDate(now) ? 'done' : 'later' };
  const start = minutesOf(lesson.start);
  const end = minutesOf(lesson.end);
  const t = nowMinutes(now);
  if (t >= end) return { kind: 'done' };
  if (t >= start) {
    return { kind: 'now', remainingMin: end - t, progress: Math.min(1, Math.max(0, (t - start) / (end - start))) };
  }
  return { kind: 'later' };
}

/** Позначає першу пару сьогодні, що ще не почалась і не скасована, як «next». */
export function withNext(lessons: Lesson[], now: Date): { lesson: Lesson; status: LessonStatus }[] {
  let nextAssigned = false;
  return lessons.map((lesson) => {
    let status = lessonStatus(lesson, now);
    const cancelled = lesson.substitution?.kind === 'CANCELLED';
    if (status.kind === 'later' && lesson.date === toIsoDate(now) && !nextAssigned && !cancelled) {
      nextAssigned = true;
      status = { kind: 'next' };
    }
    return { lesson, status };
  });
}
