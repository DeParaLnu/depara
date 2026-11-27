import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128; // довший рядок лише навантажував би процесор

// Параметри з OWASP Password Storage Cheat Sheet: N=2^14, r=8, p=5. 16 МБ памʼяті на перевірку посильно для
// невеликого VPS. Параметри зберігаються в самому хеші, тож їх можна підняти без зміни наявних паролів.
const PARAMS = { N: 16_384, r: 8, p: 5 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

export const isValidNewPassword = (password: string): boolean =>
  password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;

// NFC: «й» з різних клавіатур може приходити одним символом або двома, пароль має лишатися тим самим
const derive = (password: string, salt: Buffer, length: number, options: ScryptOptions): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password.normalize('NFC'), salt, length, options, (err, key) => (err ? reject(err) : resolve(key)));
  });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, KEY_LENGTH, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, salt, hash] = stored.split('$');
  const expected = Buffer.from(hash ?? '', 'base64');
  if (scheme !== 'scrypt' || !salt || expected.length !== KEY_LENGTH) return false;
  const params = { N: Number(N), r: Number(r), p: Number(p) };
  if (!Object.values(params).every((v) => Number.isInteger(v) && v > 0)) return false;
  return timingSafeEqual(await derive(password, Buffer.from(salt, 'base64'), KEY_LENGTH, params), expected);
}

// Хеш для перевірки, коли акаунта чи пароля немає: відповідь займає той самий час, і за ним не дізнатися,
// чи зареєстрована пошта
let dummy: Promise<string> | undefined;
export const dummyHash = (): Promise<string> => (dummy ??= hashPassword(randomBytes(16).toString('hex')));
