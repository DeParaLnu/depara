// Кольори зняті з макетів Figma (екрани «Сьогодні», «Розпочати»). Позначені `~` значення оцінені на око
// зі скриншота і мають бути звірені з токенами дизайнерів.
export const colors = {
  primary: '#233F8F',
  primaryDark: '#1B327A',
  accent: '#2864EC', // рамка поточної пари
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceSoft: '#F5F8FF', // фон поточної пари
  chip: '#F1F4F8', // неактивні дні, бейдж «Далі»
  text: '#111827',
  textMuted: '#6B7280', // ~
  border: '#E5E9F0', // ~
  tagBlue: '#DFF3FD',
  tagBlueText: '#1E4E8C', // ~
  warning: '#F59E0B', // ~ ліва смуга заміни
  warningBg: '#FFF4C4',
  warningBadge: '#FEF3C7',
  warningText: '#92400E', // ~
  danger: '#B3261E',
  dangerBg: '#FDECEA', // ~
  error: '#B3261E',
};

// Повідомлення для кодів помилок бекенду
export const errorMessages: Record<string, string> = {
  NETWORK_ERROR: 'Немає зв’язку із сервером. Перевірте інтернет і спробуйте ще раз.',
  NON_LNU_EMAIL: 'Увійти можна лише з пошти @lnu.edu.ua.',
  INVALID_TOKEN: 'Не вдалося підтвердити вхід через Microsoft.',
  AUTH_NOT_CONFIGURED: 'Вхід тимчасово недоступний.',
  GROUP_NOT_SET: 'Спершу оберіть свою групу.',
};

export const errorText = (code: string) => errorMessages[code] ?? 'Щось пішло не так. Спробуйте ще раз.';
