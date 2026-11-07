import { describe, expect, it } from 'vitest';
import type { Lesson, Room, Teacher } from '../../api';
import { buildSubstitution, canManageSubstitutions, emptyForm, MAX_COMMENT, selectableLessons } from './form';

const classroom: Room = {
  id: 'c1',
  number: 'N10',
  label: 'N10/Б',
  building: { code: 'Б', name: 'Корпус на Драгоманова', address: 'вул. Драгоманова, 50' },
};
const lesson = (over: Partial<Lesson> = {}): Lesson => ({
  id: 'l1',
  date: '2026-11-04',
  pairNumber: 3,
  start: '11:50',
  end: '13:10',
  subject: 'Веб-програмування',
  type: 'LAB',
  audience: 'GROUP',
  subgroup: 0,
  teacher: 'доц. Горон Б. І.',
  room: classroom,
  substitution: null,
  ...over,
});
const teacher: Teacher = { id: 't1', fullName: 'Корчак Ю. М.', position: null };
const form = (over: Partial<ReturnType<typeof emptyForm>>) => ({ ...emptyForm(lesson()), ...over });

describe('buildSubstitution', () => {
  it('без пари або типу повертає помилку', () => {
    expect(buildSubstitution(emptyForm())).toEqual({ ok: false, error: 'LESSON_REQUIRED' });
    expect(buildSubstitution(form({}))).toEqual({ ok: false, error: 'KIND_REQUIRED' });
  });

  it('пара, що вже має заміну, відхиляється до відправки', () => {
    const withSub = lesson({ substitution: { id: 's' } as Lesson['substitution'] });
    expect(buildSubstitution({ ...emptyForm(withSub), kind: 'CANCELLED' })).toEqual({
      ok: false,
      error: 'SUBSTITUTION_EXISTS',
    });
  });

  it('скасування: лише пара і тип, коментар обрізається, порожній не відправляється', () => {
    expect(buildSubstitution(form({ kind: 'CANCELLED', comment: '   ' }))).toEqual({
      ok: true,
      body: { lessonId: 'l1', kind: 'CANCELLED' },
    });
    expect(buildSubstitution(form({ kind: 'CANCELLED', comment: ' Хворіє ', teacher }))).toEqual({
      ok: true,
      body: { lessonId: 'l1', kind: 'CANCELLED', comment: 'Хворіє' },
    });
  });

  it('інший викладач потребує викладача, зайву аудиторію не шле', () => {
    expect(buildSubstitution(form({ kind: 'REPLACED' }))).toEqual({ ok: false, error: 'NEW_TEACHER_REQUIRED' });
    expect(buildSubstitution(form({ kind: 'REPLACED', teacher, classroom }))).toEqual({
      ok: true,
      body: { lessonId: 'l1', kind: 'REPLACED', newTeacherId: 't1' },
    });
  });

  it('інша аудиторія потребує аудиторії', () => {
    expect(buildSubstitution(form({ kind: 'ROOM_CHANGED' }))).toEqual({ ok: false, error: 'NEW_CLASSROOM_REQUIRED' });
    expect(buildSubstitution(form({ kind: 'ROOM_CHANGED', classroom, teacher }))).toEqual({
      ok: true,
      body: { lessonId: 'l1', kind: 'ROOM_CHANGED', newClassroomId: 'c1' },
    });
  });

  it('перенесення: потрібні нова дата або пара, і хоч щось має відрізнятися', () => {
    expect(buildSubstitution(form({ kind: 'MOVED' }))).toEqual({ ok: false, error: 'NEW_DATE_OR_PAIR_REQUIRED' });
    expect(buildSubstitution(form({ kind: 'MOVED', newDate: '2026-11-04', newPairNumber: 3 }))).toEqual({
      ok: false,
      error: 'MOVE_TARGET_SAME_AS_ORIGINAL',
    });
    expect(buildSubstitution(form({ kind: 'MOVED', newPairNumber: 5 }))).toEqual({
      ok: true,
      body: { lessonId: 'l1', kind: 'MOVED', newPairNumber: 5 },
    });
    expect(buildSubstitution(form({ kind: 'MOVED', newDate: '2026-11-06', classroom, teacher }))).toEqual({
      ok: true,
      body: { lessonId: 'l1', kind: 'MOVED', newDate: '2026-11-06', newClassroomId: 'c1' },
    });
  });

  it('коментар довший за 500 символів відхиляється', () => {
    expect(buildSubstitution(form({ kind: 'CANCELLED', comment: 'а'.repeat(MAX_COMMENT) })).ok).toBe(true);
    expect(buildSubstitution(form({ kind: 'CANCELLED', comment: 'а'.repeat(MAX_COMMENT + 1) }))).toEqual({
      ok: false,
      error: 'INVALID_COMMENT',
    });
  });
});

describe('canManageSubstitutions', () => {
  it('староста з групою і адмін можуть, студент і староста без групи ні', () => {
    expect(canManageSubstitutions({ role: 'HEADMAN', groupId: 'g' })).toBe(true);
    expect(canManageSubstitutions({ role: 'ADMIN', groupId: null })).toBe(true);
    expect(canManageSubstitutions({ role: 'HEADMAN', groupId: null })).toBe(false);
    expect(canManageSubstitutions({ role: 'STUDENT', groupId: 'g' })).toBe(false);
    expect(canManageSubstitutions(undefined)).toBe(false);
  });
});

describe('selectableLessons', () => {
  it('прибирає пари із заміною і сортує за днем і номером', () => {
    const list = selectableLessons([
      lesson({ id: 'b', date: '2026-11-05', pairNumber: 1 }),
      lesson({ id: 'sub', substitution: { id: 's' } as Lesson['substitution'] }),
      lesson({ id: 'a2', date: '2026-11-04', pairNumber: 4 }),
      lesson({ id: 'a1', date: '2026-11-04', pairNumber: 2 }),
    ]);
    expect(list.map((l) => l.id)).toEqual(['a1', 'a2', 'b']);
  });
});
