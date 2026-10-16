import { describe, expect, it } from 'vitest';
import { API } from './helpers';

describe('X-Request-ID', () => {
  it('генерує id, якщо клієнт його не передав', async () => {
    const res = await fetch(`${API}/health`);
    expect(res.headers.get('x-request-id')).toMatch(/^[\w-]{8,64}$/);
  });

  it('зберігає коректний id від проксі', async () => {
    const res = await fetch(`${API}/health`, { headers: { 'x-request-id': 'abc12345-proxy-id' } });
    expect(res.headers.get('x-request-id')).toBe('abc12345-proxy-id');
  });

  it('замінює небезпечний id (пробіли, переноси, задовгий) на згенерований', async () => {
    for (const bad of ['short', 'has space in it', 'x'.repeat(200)]) {
      const res = await fetch(`${API}/health`, { headers: { 'x-request-id': bad } });
      expect(res.headers.get('x-request-id')).not.toBe(bad);
      expect(res.headers.get('x-request-id')).toMatch(/^[\w-]{8,64}$/);
    }
  });
});
