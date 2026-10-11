import { describe, expect, it } from 'vitest';
import { csvToLessons, parseCsv } from '../../src/lib/csv';
import { validateImport } from '../../src/lib/scheduleImport';

const lesson = { group: 'ПМІ-31', date: '2026-10-12', pair: 2, subject: 'Бази даних' };

describe('validateImport', () => {
  it('приймає мінімальний набір і ставить значення за замовчуванням', () => {
    const r = validateImport({ lessons: [lesson] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.lessons[0]).toMatchObject({ type: 'OTHER', audience: 'GROUP', subgroup: 0, teacher: null, room: null });
    }
  });

  it.each([
    ['не об`єкт', 'abc'],
    ['порожні lessons', { lessons: [] }],
    ['неіснуюча дата', { lessons: [{ ...lesson, date: '2026-02-30' }] }],
    ['пара 0', { lessons: [{ ...lesson, pair: 0 }] }],
    ['порожній предмет', { lessons: [{ ...lesson, subject: ' ' }] }],
    ['невідомий тип', { lessons: [{ ...lesson, type: 'PARTY' }] }],
    ['підгрупа 5', { lessons: [{ ...lesson, subgroup: 5 }] }],
    ['аудиторія без корпусу', { lessons: [{ ...lesson, room: '218' }] }],
    ['дубль пари', { lessons: [lesson, lesson] }],
    ['групи не масив', { groups: 'x', lessons: [lesson] }],
  ])('відхиляє: %s', (_n, payload) => {
    expect(validateImport(payload).ok).toBe(false);
  });

  it('зібрані помилки містять номер рядка', () => {
    const r = validateImport({ lessons: [lesson, { ...lesson, pair: 'x' }] });
    expect(!r.ok && r.errors[0]).toContain('lessons[1].pair');
  });
});

describe('CSV', () => {
  it('парсить лапки, подвоєні лапки, ; та BOM', () => {
    const rows = parseCsv('﻿a;b\r\n"x;y";"he said ""hi"""\r\n');
    expect(rows).toEqual([['a', 'b'], ['x;y', 'he said "hi"']]);
  });

  it('перетворює рядки на пари, порожні клітинки пропускає', () => {
    const { lessons, errors } = csvToLessons('group,date,pair,subject,teacher\nПМІ-31,2026-10-12,2,БД,\n');
    expect(errors).toEqual([]);
    expect(lessons[0]).toEqual({ group: 'ПМІ-31', date: '2026-10-12', pair: 2, subject: 'БД' });
  });

  it('повідомляє про відсутні обов`язкові колонки', () => {
    expect(csvToLessons('group,date\nA,B\n').errors[0]).toContain('pair');
  });
});
