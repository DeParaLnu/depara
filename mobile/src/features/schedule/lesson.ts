import type { Lesson, LessonType, Room, Substitution } from '../../api';
import { minutesOf, nowMinutes, toIsoDate } from '../../lib/date';
import { roomTitle } from '../rooms/format';

export const lessonTypeLabel: Record<LessonType, string | null> = {
  LECTURE: 'Лекція',
  PRACTICE: 'Практична',
  LAB: 'Лабораторна',
  EXAM: 'Іспит',
  OTHER: null,
};

export const audienceLabel = (a: Lesson['audience']) =>
  a === 'STREAM' ? 'Потік' : a === 'COMBINED' ? 'Збірна група' : null;

export const roomLabel = (room: Room | null) => (room ? roomTitle(room) : null);

/** Що показати в деталях пари з урахуванням заміни: нова аудиторія, викладач, корпус. */
export function lessonDetails(lesson: Lesson) {
  const sub = lesson.substitution;
  const cancelled = sub?.kind === 'CANCELLED';
  const room = sub?.newRoom ?? lesson.room;
  return {
    cancelled,
    teacher: sub?.newTeacher ?? lesson.teacher,
    // «Корпус Т · ауд. 218, вул. Генерала Тарнавського, 107»
    location: room ? `${roomLabel(room)}, ${room.building.address}` : null,
    // Маршрут має сенс лише для пари, що відбудеться, і лише коли відомий корпус (веде на адресу корпусу)
    route: !cancelled && room ? { building: room.building } : null,
  };
}

/**
 * Бейдж на картці й у рядку тижня: лише «Заміна» для пари, що відбудеться зі змінами (викладач, аудиторія, перенесення).
 * Скасована пара бейджа не має: її видно з перекресленого часу й назви.
 */
export const substitutionBadge = (s: Substitution) => (s.kind === 'CANCELLED' ? null : 'Заміна');

/** Підпис у деталях пари й для скрінрідера, де перекреслення не видно. */
export const substitutionStatus = (s: Substitution) => (s.kind === 'CANCELLED' ? 'Скасовано' : 'Заміна');

export type SlotGroup<T> = { key: string; items: T[] };

/**
 * Групує пари, що йдуть одночасно в різних підгрупах (той самий день і номер пари): староста чи «усі підгрупи»
 * бачить обидві, і їх варто показати одним блоком під спільним часом. Решта пар лишаються по одній.
 */
export function groupBySlot<T>(items: T[], lessonOf: (item: T) => Lesson): SlotGroup<T>[] {
  const groups: SlotGroup<T>[] = [];
  for (const item of items) {
    const lesson = lessonOf(item);
    const last = groups[groups.length - 1];
    const prev = last ? lessonOf(last.items[0]) : null;
    const sameSlot =
      !!prev && prev.date === lesson.date && prev.pairNumber === lesson.pairNumber && prev.subgroup > 0 && lesson.subgroup > 0;
    if (last && sameSlot && !last.items.some((x) => lessonOf(x).subgroup === lesson.subgroup)) last.items.push(item);
    else groups.push({ key: lesson.id, items: [item] });
  }
  return groups;
}

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
