import { describe, expect, it } from 'vitest';
import type { Lesson, Room, Substitution } from '../../api';
import { groupBySlot, lessonDetails, roomLabel, substitutionBadge, substitutionStatus } from './lesson';

const room218: Room = {
  id: 'c1',
  number: '218',
  label: '218/Т',
  building: { code: 'Т', name: 'Корпус на Тарнавського', address: 'вул. Генерала Тарнавського, 107' },
};
const roomN10: Room = {
  id: 'c2',
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
  subject: 'Операційні системи',
  type: 'LAB',
  audience: 'GROUP',
  subgroup: 0,
  teacher: 'Бойко Я. В.',
  room: room218,
  substitution: null,
  ...over,
});
const sub = (over: Partial<Substitution>): Substitution => ({
  id: 's',
  kind: 'ROOM_CHANGED',
  comment: null,
  newTeacher: null,
  newRoom: null,
  newDate: null,
  newPairNumber: null,
  ...over,
});

describe('roomLabel', () => {
  it('збирає підпис із готових полів', () => {
    expect(roomLabel(roomN10)).toBe('Корпус Б · ауд. N10');
  });

  it('без аудиторії повертає null', () => {
    expect(roomLabel(null)).toBeNull();
  });
});

describe('lessonDetails', () => {
  it('показує аудиторію з адресою і маршрут до її корпусу', () => {
    const d = lessonDetails(lesson());
    expect(d.location).toBe('Корпус Т · ауд. 218, вул. Генерала Тарнавського, 107');
    expect(d.route).toEqual({ building: room218.building });
  });

  it('нова аудиторія із заміни замінює і підпис, і корпус маршруту', () => {
    const d = lessonDetails(lesson({ substitution: sub({ newRoom: roomN10 }) }));
    expect(d.location).toBe('Корпус Б · ауд. N10, вул. Драгоманова, 50');
    expect(d.route).toEqual({ building: roomN10.building });
  });

  it('заміна без нової аудиторії лишає аудиторію пари', () => {
    const d = lessonDetails(lesson({ substitution: sub({ kind: 'REPLACED', newTeacher: 'Корчак Ю. М.' }) }));
    expect(d.location).toBe('Корпус Т · ауд. 218, вул. Генерала Тарнавського, 107');
    expect(d.teacher).toBe('Корчак Ю. М.');
  });

  it('пара без аудиторії не має ні місця, ні маршруту', () => {
    const d = lessonDetails(lesson({ room: null }));
    expect(d.location).toBeNull();
    expect(d.route).toBeNull();
  });

  it('скасована пара не має маршруту', () => {
    expect(lessonDetails(lesson({ substitution: sub({ kind: 'CANCELLED' }) })).route).toBeNull();
  });
});

describe('бейдж заміни', () => {
  it('скасована пара без бейджа (її видно з перекреслення), будь-яка інша зміна це «Заміна»', () => {
    expect(substitutionBadge(sub({ kind: 'CANCELLED' }))).toBeNull();
    for (const kind of ['REPLACED', 'ROOM_CHANGED', 'MOVED'] as const) {
      expect(substitutionBadge(sub({ kind }))).toBe('Заміна');
    }
  });

  it('у деталях і для скрінрідера скасування назване словом', () => {
    expect(substitutionStatus(sub({ kind: 'CANCELLED' }))).toBe('Скасовано');
    expect(substitutionStatus(sub({ kind: 'MOVED' }))).toBe('Заміна');
  });
});

describe('groupBySlot', () => {
  const ids = (lessons: Lesson[]) => groupBySlot(lessons, (l) => l).map((g) => g.items.map((l) => l.id));

  it('пари двох підгруп на один слот ідуть одним блоком', () => {
    const day = [
      lesson({ id: 'a', pairNumber: 1 }),
      lesson({ id: 'b1', pairNumber: 2, subgroup: 1 }),
      lesson({ id: 'b2', pairNumber: 2, subgroup: 2 }),
      lesson({ id: 'c', pairNumber: 3 }),
    ];
    expect(ids(day)).toEqual([['a'], ['b1', 'b2'], ['c']]);
  });

  it('пара всієї групи, одна підгрупа і різні дні не групуються', () => {
    expect(ids([lesson({ id: 'a', pairNumber: 2, subgroup: 1 }), lesson({ id: 'b', pairNumber: 3, subgroup: 2 })])).toEqual([['a'], ['b']]);
    expect(ids([lesson({ id: 'a', pairNumber: 2, subgroup: 0 }), lesson({ id: 'b', pairNumber: 2, subgroup: 1 })])).toEqual([['a'], ['b']]);
    expect(
      ids([lesson({ id: 'a', pairNumber: 2, subgroup: 1 }), lesson({ id: 'b', pairNumber: 2, subgroup: 2, date: '2026-11-05' })]),
    ).toEqual([['a'], ['b']]);
  });

  it('дві пари тієї самої підгрупи на один слот лишаються окремими', () => {
    expect(ids([lesson({ id: 'a', pairNumber: 2, subgroup: 1 }), lesson({ id: 'b', pairNumber: 2, subgroup: 1 })])).toEqual([['a'], ['b']]);
  });
});
