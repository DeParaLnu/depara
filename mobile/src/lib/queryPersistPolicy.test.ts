import { describe, expect, it } from 'vitest';
import { PERSIST_MAX_AGE_MS, shouldPersistQuery } from './queryPersistPolicy';

const q = (key: unknown[], status = 'success') => ({ queryKey: key, state: { status } });

describe('shouldPersistQuery', () => {
  it.each([['week'], ['me'], ['groups'], ['buildings']])('зберігає успішний запит %s', (name) => {
    expect(shouldPersistQuery(q([name, '2026-11-02']))).toBe(true);
  });

  it('не зберігає пошук аудиторій та невідомі запити', () => {
    expect(shouldPersistQuery(q(['classrooms', 'N1', '']))).toBe(false);
    expect(shouldPersistQuery(q(['щось']))).toBe(false);
  });

  it('не зберігає запити без успіху (помилка, завантаження)', () => {
    expect(shouldPersistQuery(q(['week', 'd'], 'error'))).toBe(false);
    expect(shouldPersistQuery(q(['week', 'd'], 'pending'))).toBe(false);
  });

  it('строк збереження 14 днів', () => {
    expect(PERSIST_MAX_AGE_MS).toBe(14 * 24 * 3600 * 1000);
  });
});
