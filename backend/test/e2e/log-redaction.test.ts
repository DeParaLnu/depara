import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';

// Застосунок запускається в цьому ж процесі з власним потоком логів
const lines: Record<string, unknown>[] = [];
const app = buildApp({
  logger: { level: 'info', stream: { write: (s: string) => lines.push(JSON.parse(s) as Record<string, unknown>) } },
});

afterAll(() => app.close());

describe('логи запитів', () => {
  it('query-рядок (там може бути пошта) не потрапляє в лог, шлях лишається', async () => {
    const res = await app.inject({ method: 'GET', url: '/health?q=secret.person@lnu.edu.ua', headers: { 'x-request-id': 'redact-req-0001' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-request-id']).toBe('redact-req-0001');

    const raw = JSON.stringify(lines);
    expect(raw).not.toContain('secret.person');
    const incoming = lines.find((l) => l.reqId === 'redact-req-0001' && l.msg === 'incoming request');
    expect((incoming?.req as { url: string }).url).toBe('/health');
  });
});
