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

describe('JWT_SECRET', () => {
  const saved = { NODE_ENV: process.env.NODE_ENV, JWT_SECRET: process.env.JWT_SECRET };
  afterEach(() => {
    vi.restoreAllMocks();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const load = async (nodeEnv: string, secret: string | undefined) => {
    vi.resetModules();
    process.env.NODE_ENV = nodeEnv;
    if (secret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = secret;
    return (await import('../../src/config')).config.jwtSecret;
  };

  // Токени з відомим секретом можна підробити, зокрема токен адміна, тож значення з прикладів у проді відхиляємо
  it.each(['change-me-locally', 'змініть-мене', 'dev-only-secret', '  Change-Me-Locally  '])(
    'у production плейсхолдер %j не стартує',
    async (secret) => {
      await expect(load('production', secret)).rejects.toThrow(/placeholder/);
    },
  );

  it('у production без секрету не стартує, як і раніше', async () => {
    await expect(load('production', undefined)).rejects.toThrow(/JWT_SECRET is required/);
  });

  it('у production звичайні секрети проходять, зокрема той, що використовує CI (14 символів)', async () => {
    expect(await load('production', 'ci-only-secret')).toBe('ci-only-secret');
    expect(await load('production', 'a'.repeat(64))).toBe('a'.repeat(64));
  });

  it('у production короткий секрет лише попереджає в логу, але не зупиняє сервер', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await load('production', 'ci-only-secret')).toBe('ci-only-secret');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('JWT_SECRET'));

    warn.mockClear();
    await load('production', 'a'.repeat(32));
    expect(warn).not.toHaveBeenCalled();
  });

  // Локальна розробка й тести працюють з .env.example або без секрету
  it.each(['test', 'development'])('у %s плейсхолдер і відсутній секрет дозволені', async (env) => {
    expect(await load(env, 'change-me-locally')).toBe('change-me-locally');
    expect(await load(env, undefined)).toBe('dev-only-secret');
  });
});
