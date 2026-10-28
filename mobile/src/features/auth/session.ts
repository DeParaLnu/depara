import { create } from 'zustand';
import { api, setSessionBridge, type Session } from '../../api';
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

export const useSession = create<SessionState>((set, get) => ({
  session: null,
  deviceId: null,
  isHydrated: false,

  initSession: async () => {
    try {
      const [deviceId, session] = await Promise.all([getOrCreateDeviceId(), loadStoredSession()]);
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
    if (current?.refreshToken) {
      void api.logout(current.refreshToken).catch(() => {});
    }
    set({ session: null });
    void saveStoredSession(null);
  },
}));

// Підключаємо міст авто-рефрешу для перехоплення 401 TOKEN_EXPIRED в api.ts
setSessionBridge({
  getSession: () => useSession.getState().session,
  getDeviceId: () => getOrCreateDeviceId(),
  onRefreshed: async (tokens) => {
    const current = useSession.getState().session;
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
    useSession.getState().signOut();
  },
});
