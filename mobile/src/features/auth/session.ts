import { create } from 'zustand';
import type { Session } from '../../api';

// Сесія поки живе в памʼяті: після перезапуску застосунку потрібен новий вхід.
// Збереження токенів у expo-secure-store і оновлення через /auth/refresh буде окремою задачею.
type SessionState = {
  session: Session | null;
  setSession: (session: Session | null) => void;
  finishOnboarding: () => void;
  signOut: () => void;
};

export const useSession = create<SessionState>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
  finishOnboarding: () =>
    set((s) => (s.session ? { session: { ...s.session, needsOnboarding: false } } : s)),
  signOut: () => set({ session: null }),
}));
