import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, Platform } from 'react-native';
import { create } from 'zustand';
import { log } from '../../lib/logger';
import { isThemePreference, type ThemePreference } from './preference';

const KEY = 'depara_theme';

// Нативні елементи (алерти, клавіатура, перемикачі) теж ідуть за вибором. У вебі такого API немає
const applyToNative = (preference: ThemePreference) => {
  if (Platform.OS === 'web') return;
  Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
};

const warn = (message: string, error: unknown) =>
  log.warn('theme', message, { reason: error instanceof Error ? error.message : String(error) });

type ThemeSettings = {
  preference: ThemePreference;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setPreference: (preference: ThemePreference) => void;
};

// Вихід з акаунта вибір не скидає: це налаштування телефону, а не користувача
export const useThemeSettings = create<ThemeSettings>((set, get) => ({
  preference: 'system',
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const preference = isThemePreference(raw) ? raw : 'system';
      applyToNative(preference);
      set({ preference, hydrated: true });
    } catch (error) {
      warn('не вдалося прочитати тему', error);
      set({ hydrated: true });
    }
  },

  setPreference: (preference) => {
    applyToNative(preference);
    set({ preference });
    AsyncStorage.setItem(KEY, preference).catch((e) => warn('не вдалося зберегти тему', e));
  },
}));
