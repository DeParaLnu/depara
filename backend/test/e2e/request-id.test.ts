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

describe('готовність (/health/ready)', () => {
  it('на живому сервері з базою і Redis повертає 200', async () => {
    const res = await fetch(`${API}/health/ready`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', checks: { database: 'ok', redis: 'ok' } });
  });
});

describe('публічні сторінки для магазинів застосунків', () => {
  it('/privacy і /delete-account доступні без токена, українською, і посилаються одна на одну', async () => {
    const privacy = await fetch(`${API}/privacy`);
    expect(privacy.status).toBe(200);
    expect(privacy.headers.get('content-type')).toContain('text/html');
    const privacyText = await privacy.text();
    expect(privacyText).toContain('lang="uk"');
    expect(privacyText).toContain('Політика конфіденційності');
    expect(privacyText).toContain('/delete-account');

    const del = await fetch(`${API}/delete-account`);
    expect(del.status).toBe(200);
    const deleteText = await del.text();
    expect(deleteText).toContain('Видалити акаунт');
    expect(deleteText).toContain('/privacy');
  });
});

