import { create } from 'zustand';
import { api, setSessionBridge, type Session } from '../../api';
import { resetCaches } from '../../lib/cacheReset';
import { clearPersistedQueries } from '../../lib/queryPersist';
import { unregisterPushToken } from '../push/registration';
import { cancelAllReminders } from '../reminders/notifications';
import { useReminderSettings } from '../reminders/settings';
import { getOrCreateDeviceId, loadStoredSession, saveStoredSession } from './storage';

// A1: стан сесії зі збереженням токенів у expo-secure-store та авто-рефрешем
type SessionState = {
  session: Session | null;
  deviceId: string | null;
  isHydrated: boolean;
  initSession: () => Promise<void>;
  setSession: (session: Session | null) => void;
  finishOnboarding: () => void;
  signOut: () => void;
};

// Сесія, що завершується на сервері. Екран входу зʼявляється одразу, а токен пристрою прибирається вже після цього.
// Якщо access за цей час прострочений, авто-refresh має її бачити, інакше токен лишиться і пуші йтимуть на телефон
// користувача, який вийшов.
let closing: Session | null = null;

// Спершу токен пристрою: для нього потрібен дійсний access, а вихід знищує сесію. Refresh беремо вже після нього:
// авто-refresh міг його замінити
async function closeOnServer(session: Session) {
  closing = session;
  await unregisterPushToken(session.accessToken);
  await api.logout(closing.refreshToken).catch(() => {});
  closing = null;
}

export const useSession = create<SessionState>((set, get) => ({
  session: null,
  deviceId: null,
  isHydrated: false,

  initSession: async () => {
    try {
      const [deviceId, session] = await Promise.all([getOrCreateDeviceId(), loadStoredSession()]);
      // Без сесії кешу даних на диску бути не може (лишився б після збою при виході): прибираємо його до того,
      // як дерево застосунку стане відновлювати кеш, інакше новий користувач побачив би чужий розклад
      if (!session) await clearPersistedQueries().catch(() => {});
      set({ deviceId, session, isHydrated: true });
    } catch {
      set({ isHydrated: true });
    }
  },

  setSession: (session) => {
    set({ session });
    void saveStoredSession(session);
  },

  finishOnboarding: () => {
    set((s) => {
      if (!s.session) return s;
      const updated: Session = { ...s.session, needsOnboarding: false };
      void saveStoredSession(updated);
      return { session: updated };
    });
  },

  signOut: () => {
    const current = get().session;
    if (current?.refreshToken) void closeOnServer(current);
    set({ session: null });
    void saveStoredSession(null);
    void resetCaches().catch(() => {});
    // Нагадування про пари попереднього користувача не мають спрацювати після виходу
    void cancelAllReminders();
    useReminderSettings.getState().clear();
  },
}));

// Підключаємо міст авто-рефрешу для перехоплення 401 TOKEN_EXPIRED в api.ts
setSessionBridge({
  getSession: () => useSession.getState().session ?? closing,
  getDeviceId: () => getOrCreateDeviceId(),
  onRefreshed: async (tokens) => {
    const current = useSession.getState().session;
    if (!current && closing) closing = { ...closing, ...tokens };
    if (current) {
      const updated: Session = {
        ...current,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
      useSession.setState({ session: updated });
      await saveStoredSession(updated);
    }
  },
  onRefreshFailed: async () => {
    // Користувач уже вийшов, закривається лише його сесія на сервері
    if (!useSession.getState().session) return;
    useSession.getState().signOut();
  },
});
