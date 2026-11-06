import { beforeEach, describe, expect, it, vi } from 'vitest';

const { registerPushToken, removePushToken, hasPermission, readPushToken } = vi.hoisted(() => ({
  registerPushToken: vi.fn(),
  removePushToken: vi.fn(),
  hasPermission: vi.fn(),
  readPushToken: vi.fn(),
}));

vi.mock('../../api', () => ({ api: { registerPushToken, removePushToken } }));
vi.mock('../../lib/logger', () => ({ log: { warn: vi.fn() } }));
vi.mock('../reminders/notifications', () => ({ hasPermission }));
vi.mock('./token', () => ({ readPushToken }));

import { syncPushToken, unregisterPushToken } from './registration';

const TOKEN = 'ExponentPushToken[abc]';

beforeEach(async () => {
  // Модуль памʼятає токен: кожен тест починає з виходу, потім чисті лічильники
  readPushToken.mockResolvedValue(null);
  await unregisterPushToken('tok');
  vi.clearAllMocks();
  hasPermission.mockResolvedValue(true);
  readPushToken.mockResolvedValue(TOKEN);
  registerPushToken.mockResolvedValue(undefined);
  removePushToken.mockResolvedValue(undefined);
});

describe('syncPushToken', () => {
  it('шле токен, коли є дозвіл', async () => {
    await syncPushToken('tok');
    expect(registerPushToken).toHaveBeenCalledWith('tok', TOKEN);
  });

  it('без дозволу не запитує токен і нічого не шле', async () => {
    hasPermission.mockResolvedValue(false);
    await syncPushToken('tok');
    expect(readPushToken).not.toHaveBeenCalled();
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  it('без токена (Expo Go, немає projectId) нічого не шле', async () => {
    readPushToken.mockResolvedValue(null);
    await syncPushToken('tok');
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  it('той самий токен шле один раз, новий шле знову', async () => {
    await syncPushToken('tok');
    await syncPushToken('tok');
    expect(registerPushToken).toHaveBeenCalledTimes(1);
    readPushToken.mockResolvedValue('ExponentPushToken[new]');
    await syncPushToken('tok');
    expect(registerPushToken).toHaveBeenLastCalledWith('tok', 'ExponentPushToken[new]');
  });

  it('після збою сервера пробує знову і не кидає помилку', async () => {
    registerPushToken.mockRejectedValueOnce(new Error('NETWORK_ERROR'));
    await expect(syncPushToken('tok')).resolves.toBeUndefined();
    await syncPushToken('tok');
    expect(registerPushToken).toHaveBeenCalledTimes(2);
  });

  it('одночасні виклики роблять один запит', async () => {
    await Promise.all([syncPushToken('tok'), syncPushToken('tok')]);
    expect(registerPushToken).toHaveBeenCalledTimes(1);
  });
});

describe('unregisterPushToken', () => {
  it('видаляє зареєстрований токен', async () => {
    await syncPushToken('tok');
    readPushToken.mockClear();
    await unregisterPushToken('tok');
    expect(removePushToken).toHaveBeenCalledWith('tok', TOKEN);
    expect(readPushToken).not.toHaveBeenCalled();
  });

  it('токен із минулого запуску теж видаляє', async () => {
    await unregisterPushToken('tok');
    expect(removePushToken).toHaveBeenCalledWith('tok', TOKEN);
  });

  it('вихід під час реєстрації не дає токену дійти до сервера', async () => {
    let release!: (value: string) => void;
    readPushToken.mockReturnValueOnce(new Promise<string>((resolve) => (release = resolve)));
    const sync = syncPushToken('tok');
    await Promise.resolve();
    const out = unregisterPushToken('tok');
    release(TOKEN);
    await Promise.all([sync, out]);
    expect(registerPushToken).not.toHaveBeenCalled();
    expect(removePushToken).toHaveBeenCalledWith('tok', TOKEN);
  });

  it('збій сервера не ламає вихід, а наступний вхід реєструє токен знову', async () => {
    await syncPushToken('tok');
    removePushToken.mockRejectedValueOnce(new Error('NETWORK_ERROR'));
    await expect(unregisterPushToken('tok')).resolves.toBeUndefined();
    await syncPushToken('tok2');
    expect(registerPushToken).toHaveBeenLastCalledWith('tok2', TOKEN);
  });
});
