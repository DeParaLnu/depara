import { afterEach, describe, expect, it, vi } from 'vitest';

// config читає змінні при імпорті, тож для кожного значення модуль завантажуємо наново
async function graceFor(value: string | undefined): Promise<number> {
  vi.resetModules();
  if (value === undefined) delete process.env.REFRESH_REUSE_GRACE_SECONDS;
  else process.env.REFRESH_REUSE_GRACE_SECONDS = value;
  return (await import('../../src/config')).config.refreshReuseGraceSeconds;
}

afterEach(() => {
  delete process.env.REFRESH_REUSE_GRACE_SECONDS;
});

describe('refreshReuseGraceSeconds', () => {
  it('за замовчуванням 30', async () => {
    expect(await graceFor(undefined)).toBe(30);
  });

  it.each([
    ['0', 0],
    ['45', 45],
    // Redis відхиляє дробове EX, тож дріб відкидаємо
    ['1.5', 1],
    ['0.5', 0],
    ['-5', 0],
    ['abc', 0],
    ['', 0],
  ])('%j дає ціле невід’ємне %i', async (raw, expected) => {
    const value = await graceFor(raw);
    expect(value).toBe(expected);
    expect(Number.isInteger(value)).toBe(true);
  });
});
