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
    ['інший предмет у тому самому слоті', { lessons: [lesson, { ...lesson, subject: 'Інший предмет' }] }],
    ['групи не масив', { groups: 'x', lessons: [lesson] }],
  ])('відхиляє: %s', (_n, payload) => {
    expect(validateImport(payload).ok).toBe(false);
  });

  describe('імпорт лише довідників', () => {
    const building = { code: 'Т', name: 'Корпус на Тарнавського', address: 'вул. Генерала Тарнавського, 107' };

    it('приймає довідники без пар', () => {
      const r = validateImport({ buildings: [building] });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.data.lessons).toEqual([]);
        expect(r.data.buildings).toEqual([building]);
      }
    });

    it('порожній запит і порожні lessons без довідників відхиляються', () => {
      expect(validateImport({}).ok).toBe(false);
      expect(validateImport({ lessons: [] }).ok).toBe(false);
      expect(validateImport({ buildings: [] }).ok).toBe(false);
    });

    it('довідники з помилками все одно відхиляються', () => {
      const r = validateImport({ buildings: [{ code: 'Т', name: '', address: '' }] });
      expect(r.ok).toBe(false);
    });

    it('lessons не масив із довідниками теж помилка', () => {
      expect(validateImport({ buildings: [building], lessons: 'x' }).ok).toBe(false);
    });
  });

  it('підгрупи одного слота, різні дні й різні групи не є дублями', () => {
    const r = validateImport({
      lessons: [
        { ...lesson, subgroup: 1 },
        { ...lesson, subgroup: 2, subject: 'Лаб 2' },
        { ...lesson, date: '2026-10-13' },
        { ...lesson, group: 'ПМІ-32' },
      ],
    });
    expect(r.ok).toBe(true);
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
