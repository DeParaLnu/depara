// F9: вибір теми. Живе лише на пристрої, на сервер не передається
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Системна' },
  { value: 'light', label: 'Світла' },
  { value: 'dark', label: 'Темна' },
];

export const isThemePreference = (value: unknown): value is ThemePreference =>
  THEME_OPTIONS.some((o) => o.value === value);

export const themeLabel = (value: ThemePreference) => THEME_OPTIONS.find((o) => o.value === value)?.label ?? '';

/** Яка тема діє зараз: вибір користувача, а для «Системна» те, що каже телефон. */
export const resolveScheme = (preference: ThemePreference, system: string | null | undefined): 'light' | 'dark' => {
  if (preference !== 'system') return preference;
  return system === 'dark' ? 'dark' : 'light';
};
