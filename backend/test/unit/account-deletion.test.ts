import { describe, expect, it } from 'vitest';
import { canDeleteAccount } from '../../src/lib/accountDeletion';

const user = (role: string, email = 'a@lnu.edu.ua') => ({ role, email });

describe('canDeleteAccount', () => {
  it('студент і староста видаляються завжди', () => {
    expect(canDeleteAccount(user('STUDENT'), 0, [])).toEqual({ ok: true });
    expect(canDeleteAccount(user('HEADMAN'), 0, [])).toEqual({ ok: true });
  });

  it('адмін видаляється, коли є інший адмін', () => {
    expect(canDeleteAccount(user('ADMIN'), 1, [])).toEqual({ ok: true });
  });

  it('останнього адміна видаляти не можна', () => {
    expect(canDeleteAccount(user('ADMIN'), 0, [])).toEqual({ ok: false, error: 'LAST_ADMIN' });
    expect(canDeleteAccount(user('ADMIN'), 0, ['other@lnu.edu.ua'])).toEqual({ ok: false, error: 'LAST_ADMIN' });
  });

  it('адмін з ADMIN_EMAILS видаляється й сам відновить роль при наступному вході', () => {
    expect(canDeleteAccount(user('ADMIN', 'boss@lnu.edu.ua'), 0, ['boss@lnu.edu.ua'])).toEqual({ ok: true });
  });
});
