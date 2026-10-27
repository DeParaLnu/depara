// Кольори зняті з макетів Figma (файл «ДеПара», знімки в docs/design/). Значення з позначкою `~` не зустрілись
// у макетах напряму і залишаються оціненими.
export const colors = {
  primary: '#233F90',
  primaryDark: '#1B327A',
  accent: '#2864EC', // рамка поточної пари, прогрес
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceSoft: '#F5F8FF', // фон поточної пари
  surfaceTint: '#DCEAFF', // залишок прогресу, кола з іконками
  chip: '#F1F4F8', // неактивні дні, нейтральні бейджі
  text: '#111827',
  textMuted: '#7C8795', // викладач, підписи
  textSecondary: '#4F5E70', // аудиторія, нейтральні бейджі
  textTime: '#5C6875', // час пари
  textWeekday: '#627080', // день тижня в смузі
  tabInactive: '#728091',
  border: '#E7EBF1',
  tagBlue: '#DFF3FD',
  tagBlueText: '#166185',
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
