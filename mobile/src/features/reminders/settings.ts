import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { log } from '../../lib/logger';
import { isReminderMinutes, type ReminderMinutes } from './plan';

// F8/F9: час нагадування перед парою. Нагадування локальні, тож вибір зберігається на пристрої і діє одразу,
// навіть без мережі. Профіль на сервері (PATCH /me { reminderMinutes }) отримує копію: з неї береться початкове
// значення на новому пристрої (див. useReminderMinutes).
const KEY = 'depara_reminder_minutes';

type ReminderSettings = {
  /** null: користувач ще не обирав на цьому пристрої */
  minutes: ReminderMinutes | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setMinutes: (minutes: ReminderMinutes) => void;
  clear: () => void;
};

const warn = (message: string, error: unknown) =>
  log.warn('reminders', message, { reason: error instanceof Error ? error.message : String(error) });

export const useReminderSettings = create<ReminderSettings>((set, get) => ({
  minutes: null,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const value = raw === null ? null : Number(raw);
      set({ minutes: isReminderMinutes(value) ? value : null, hydrated: true });
    } catch (error) {
      warn('не вдалося прочитати налаштування', error);
      set({ hydrated: true });
    }
  },

  setMinutes: (minutes) => {
    set({ minutes });
    AsyncStorage.setItem(KEY, String(minutes)).catch((e) => warn('не вдалося зберегти налаштування', e));
  },

  // Вихід з акаунта: наступний користувач на цьому пристрої почне з власного вибору
  clear: () => {
    set({ minutes: null });
    AsyncStorage.removeItem(KEY).catch((e) => warn('не вдалося очистити налаштування', e));
  },
}));
