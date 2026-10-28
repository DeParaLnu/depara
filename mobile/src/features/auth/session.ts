import { create } from 'zustand';
import type { Session } from '../../api';

// Гість: користується застосунком без входу. Групу й підгрупу обирає сам, вони живуть лише на пристрої.
// groupId = null: гість ще не обрав групу (показуємо вибір групи).
export type Guest = { groupId: string | null; subgroup: number };

// Сесія поки живе в памʼяті: після перезапуску застосунку потрібен новий вхід (або новий вибір групи гостем).
// Збереження токенів у expo-secure-store і оновлення через /auth/refresh буде окремою задачею.
type SessionState = {
  session: Session | null;
  guest: Guest | null;
  setSession: (session: Session | null) => void;
  finishOnboarding: () => void;
  startGuest: () => void;
  setGuestGroup: (groupId: string | null, subgroup?: number) => void;
  /** Вийти з гостьового режиму на екран входу. */
  leaveGuest: () => void;
  signOut: () => void;
};

export const useSession = create<SessionState>((set) => ({
  session: null,
  guest: null,
  // Вхід завжди скасовує гостьовий режим: розклад далі береться з профілю користувача
  setSession: (session) => set({ session, guest: null }),
  finishOnboarding: () =>
    set((s) => (s.session ? { session: { ...s.session, needsOnboarding: false } } : s)),
  startGuest: () => set({ session: null, guest: { groupId: null, subgroup: 0 } }),
  setGuestGroup: (groupId, subgroup = 0) => set((s) => (s.guest ? { guest: { groupId, subgroup } } : s)),
  leaveGuest: () => set({ guest: null }),
  signOut: () => set({ session: null, guest: null }),
}));
