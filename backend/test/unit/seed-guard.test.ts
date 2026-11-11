import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Скрипти запускаються справжнім підпроцесом. База навмисне неіснуюча: навіть якби захисту не було, нічого не записалось би.
function run(script: string, nodeEnv: string) {
  return spawnSync('node_modules/.bin/tsx', [script], {
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, NODE_ENV: nodeEnv, DATABASE_URL: 'postgresql://nobody:nobody@127.0.0.1:1/depara_test_unreachable' },
  });
}

describe('seed не запускається на проді', () => {
  // Тестовий розклад перезаписує дзвінки й адреси корпусів: на справжній базі це зіпсувало б реальні дані
  it.each([
    ['prisma/seed/seed.ts', 'seed'],
    ['prisma/seed/demo.ts', 'seed:demo'],
  ])('%s відмовляє при NODE_ENV=production до будь-якого звернення до бази', (script, name) => {
    const res = run(script, 'production');
    expect(res.status).toBe(1);
    expect(res.stderr).toContain(`${name} не запускається при NODE_ENV=production`);
    expect(res.stdout).not.toContain('Seed готовий');
  });
});
