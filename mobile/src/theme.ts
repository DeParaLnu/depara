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
  textMuted: '#667281', // викладач, підписи
  textSecondary: '#4F5E70', // аудиторія, нейтральні бейджі
  textTime: '#5C6875', // час пари
  textWeekday: '#627080', // день тижня в смузі
  tabInactive: '#667281',
  border: '#E7EBF1',
  borderStrong: '#8A94A3', // контури контролів (радіо): ≥3:1 на білому
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
  TEMPORARILY_UNAVAILABLE: 'Сервер тимчасово недоступний. Спробуйте за хвилину.',
  RATE_LIMITED: 'Забагато запитів. Зачекайте хвилину і спробуйте ще раз.',
  LAST_ADMIN: 'Ви останній адміністратор: спершу призначте іншого.',
  ACCOUNT_CONFLICT: 'Цей акаунт уже пов’язано з іншим входом. Зверніться до підтримки.',
  // F6: заміни (коди з форми і з POST /substitutions)
  LESSON_REQUIRED: 'Оберіть пару.',
  KIND_REQUIRED: 'Оберіть тип зміни.',
  NEW_TEACHER_REQUIRED: 'Оберіть нового викладача.',
  NEW_CLASSROOM_REQUIRED: 'Оберіть нову аудиторію.',
  NEW_DATE_OR_PAIR_REQUIRED: 'Оберіть нову дату або номер пари.',
  MOVE_TARGET_SAME_AS_ORIGINAL: 'Нова дата й пара збігаються з поточними.',
  INVALID_COMMENT: 'Коментар задовгий: до 500 символів.',
  SUBSTITUTION_EXISTS: 'Для цієї пари вже є заміна. Спершу скасуйте її.',
  FORBIDDEN_GROUP: 'Можна змінювати лише пари своєї групи.',
  FORBIDDEN: 'Недостатньо прав для цієї дії.',
  LESSON_NOT_FOUND: 'Пару не знайдено. Оновіть розклад.',
  SUBSTITUTION_NOT_FOUND: 'Заміну вже скасовано. Оновіть розклад.',
  TEACHER_NOT_FOUND: 'Викладача не знайдено.',
  CLASSROOM_NOT_FOUND: 'Аудиторію не знайдено.',
  PAIR_NOT_FOUND: 'Такої пари немає в розкладі дзвінків.',
};

export const errorText = (code: string) => errorMessages[code] ?? 'Щось пішло не так. Спробуйте ще раз.';
