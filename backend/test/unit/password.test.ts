import { describe, expect, it } from 'vitest';
import { hashPassword, isValidNewPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, verifyPassword } from '../../src/lib/password';

describe('хеш пароля', () => {
  it('той самий пароль щоразу дає інший хеш, і кожен перевіряється', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$')).toBe(true);
    expect(a).not.toContain('correct');
    expect(await verifyPassword('correct horse battery', a)).toBe(true);
    expect(await verifyPassword('correct horse battery', b)).toBe(true);
  });

  it('інший пароль не проходить', async () => {
    const hash = await hashPassword('пароль-студента');
    expect(await verifyPassword('пароль-Студента', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('однаковий текст у різних формах Unicode це той самий пароль', async () => {
    const hash = await hashPassword('й-пароль-123'.normalize('NFC'));
    expect(await verifyPassword('й-пароль-123'.normalize('NFD'), hash)).toBe(true);
  });

  it('зіпсований чи чужий формат хешу це відмова, а не виняток', async () => {
    for (const bad of ['', 'abc', 'bcrypt$1$2$3$4$5', 'scrypt$16384$8$5$$', 'scrypt$x$8$5$c2FsdA==$aGFzaA==']) {
      expect(await verifyPassword('будь-який-пароль', bad)).toBe(false);
    }
  });

  it('новий пароль обмежений за довжиною', () => {
    expect(isValidNewPassword('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe(false);
    expect(isValidNewPassword('a'.repeat(PASSWORD_MIN_LENGTH))).toBe(true);
    expect(isValidNewPassword('a'.repeat(PASSWORD_MAX_LENGTH))).toBe(true);
    expect(isValidNewPassword('a'.repeat(PASSWORD_MAX_LENGTH + 1))).toBe(false);
  });
});
