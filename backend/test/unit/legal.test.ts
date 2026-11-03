import { afterAll, describe, expect, it, vi } from 'vitest';

// config читає змінні при імпорті, тож контакт задаємо до нього (з розміткою, щоб перевірити екранування)
vi.hoisted(() => {
  process.env.PRIVACY_CONTACT_EMAIL = 'privacy"><script>alert(1)</script>@lnu.edu.ua';
  process.env.PRIVACY_OPERATOR = 'Кафедра <b>X</b>';
});

import { buildApp } from '../../src/app';

const app = buildApp();
afterAll(() => app.close());

describe('сторінки /privacy і /delete-account', () => {
  it.each(['/privacy', '/delete-account'])('%s: HTML з екранованими контактами й суворою CSP', async (url) => {
    const res = await app.inject(url);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    // змінні середовища не вставляються сирими
    expect(res.body).not.toContain('<script>');
    expect(res.body).not.toContain('<b>X</b>');
    expect(res.body).toContain('&lt;script&gt;');
    expect(res.body).toContain('mailto:privacy');
  });

  it('політика містить оператора й посилання на видалення акаунта', async () => {
    const body = (await app.inject('/privacy')).body;
    expect(body).toContain('Кафедра &lt;b&gt;X&lt;/b&gt;');
    expect(body).toContain('href="/delete-account"');
  });
});
