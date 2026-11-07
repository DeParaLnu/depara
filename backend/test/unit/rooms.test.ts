import { describe, expect, it } from 'vitest';
import { normalizeBuildingCode, normalizeRoom, normalizeRoomNumber, toRoom } from '../../src/lib/rooms';

describe('normalizeRoomNumber', () => {
  it.each([
    ['218', '218'],
    ['129а', '129а'],
    ['N10', 'N10'],
    ['№9', 'N9'],
    ['n10', 'N10'],
    ['Н10', 'N10'], // кирилична велика
    ['н10', 'N10'], // кирилична мала
    [' № 9 ', 'N9'],
    ['1 2', '12'], // нерозривний пробіл
    ['№', 'N'], // запит ще набирають
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeRoomNumber(raw)).toBe(expected);
  });

  it('не чіпає слова, що починаються на Н', () => {
    expect(normalizeRoomNumber('Навчальна')).toBe('Навчальна');
  });

  it('N не на початку лишається як є', () => {
    expect(normalizeRoomNumber('12N')).toBe('12N');
  });
});

describe('normalizeBuildingCode', () => {
  it.each([
    ['Т', 'Т'],
    ['T', 'Т'], // латинська
    ['t', 'Т'],
    ['т', 'Т'],
    ['б', 'Б'],
    [' C ', 'С'],
    ['K', 'К'],
    ['ТЕСТ-К', 'ТЕСТ-К'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeBuildingCode(raw)).toBe(expected);
  });
});

describe('normalizeRoom', () => {
  it('ділить по останньому слешу і нормалізує обидві частини', () => {
    expect(normalizeRoom('218/Т')).toEqual({ number: '218', code: 'Т' });
    expect(normalizeRoom(' № 9 / б ')).toEqual({ number: 'N9', code: 'Б' });
    expect(normalizeRoom('218/T')).toEqual({ number: '218', code: 'Т' });
    expect(normalizeRoom('12/1/Б')).toEqual({ number: '12/1', code: 'Б' });
  });

  it('без слеша корпус порожній', () => {
    expect(normalizeRoom('n1')).toEqual({ number: 'N1', code: '' });
    expect(normalizeRoom('')).toEqual({ number: '', code: '' });
  });

  it('незавершений запит лишає порожньою відсутню частину', () => {
    expect(normalizeRoom('218/')).toEqual({ number: '218', code: '' });
    expect(normalizeRoom('/Т')).toEqual({ number: '', code: 'Т' });
  });

  it('різні записи однієї аудиторії збігаються', () => {
    const same = ['№9/Б', 'N9/Б', 'n9/б', 'Н9/Б', ' № 9 / Б '].map(normalizeRoom);
    expect(new Set(same.map((r) => `${r.number}/${r.code}`))).toEqual(new Set(['N9/Б']));
  });
});

describe('toRoom', () => {
  it('збирає label і лишає лише публічні поля', () => {
    const building = { id: 'b', code: 'Т', name: 'Корпус', address: 'вул. Тарнавського' };
    const room = toRoom({ id: 'c', number: '218', building, floor: 2 } as Parameters<typeof toRoom>[0]);
    expect(room).toEqual({
      id: 'c',
      number: '218',
      label: '218/Т',
      building: { code: 'Т', name: 'Корпус', address: 'вул. Тарнавського' },
    });
  });
});
