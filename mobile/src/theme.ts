// Кольори зняті з макетів Figma (файл «ДеПара», знімки в docs/design/). Значення з позначкою `~` не зустрілись
// у макетах напряму і залишаються оціненими.
export const lightColors = {
  primary: '#233F90',
  primaryDark: '#1B327A',
  onPrimary: '#FFFFFF', // текст і іконки на primary та accent
  accent: '#2864EC', // рамка поточної пари, прогрес
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceSoft: '#F5F8FF', // фон поточної пари
  surfaceTint: '#DCEAFF', // залишок прогресу, кола з іконками
  surfaceSelected: '#EEF5FF', // обраний рядок, кола станів
  surfaceInfo: '#F8FAFC', // інформаційні блоки
  chip: '#F1F4F8', // неактивні дні, нейтральні бейджі
  overlay: 'rgba(17,24,39,0.45)', // затемнення під нижніми листами
  text: '#111827',
  textBody: '#374151', // варіанти вибору в онбордингу
  textMuted: '#667281', // викладач, підписи
  textSecondary: '#4F5E70', // аудиторія, нейтральні бейджі
  textTime: '#5C6875', // час пари
  textWeekday: '#627080', // день тижня в смузі
  tabInactive: '#667281',
  chevron: '#C4CBD4', // декоративні стрілки в списках
  border: '#E7EBF1',
  borderStrong: '#8A94A3', // контури контролів (радіо): ≥3:1 на білому
  tagBlue: '#DFF3FD',
  tagBlueText: '#166185',
  warning: '#F59E0B', // ~ ліва смуга заміни
  warningBg: '#FFF4C4',
  warningBadge: '#FEF3C7',
  warningText: '#92400E', // ~
  success: '#166534',
  successBg: '#DCFCE7',
  danger: '#B3261E',
  alertDot: '#E5352B', // крапка «у цей день є заміна» в смузі днів
  dangerBg: '#FDECEA', // ~
  dangerSurface: '#FFF7F6', // кнопка виходу
  dangerBorder: '#F5B5B0',
  error: '#B3261E',
};

export type Colors = typeof lightColors;

// Темних макетів немає: палітра підібрана під ті самі ролі, контраст перевіряє theme.test.ts.
// primary тут світлий, бо він ще й колір тексту, тому на ньому темний onPrimary, а не білий
export const darkColors: Colors = {
  primary: '#8FB4FF',
  primaryDark: '#7BA3F2',
  onPrimary: '#0B1A3D',
  accent: '#7AA7FF',
  background: '#0F141C',
  surface: '#18202B',
  surfaceSoft: '#1A2536',
  surfaceTint: '#24344F',
  surfaceSelected: '#1F2D45',
  surfaceInfo: '#161D27',
  chip: '#232C38',
  overlay: 'rgba(0,0,0,0.6)',
  text: '#F1F4F8',
  textBody: '#D5DBE3',
  textMuted: '#9BA7B5',
  textSecondary: '#AEB8C4',
  textTime: '#A3AEBB',
  textWeekday: '#A3AEBB',
  tabInactive: '#9BA7B5',
  chevron: '#5D6876',
  border: '#2A3441',
  borderStrong: '#7C8898',
  tagBlue: '#123548',
  tagBlueText: '#9FDCF7',
  warning: '#F59E0B',
  warningBg: '#3A2E0F',
  warningBadge: '#3D2F10',
  warningText: '#FBD38D',
  success: '#86EFAC',
  successBg: '#14361F',
  danger: '#FF8A80',
  alertDot: '#FF5A4F',
  dangerBg: '#3A1D1B',
  dangerSurface: '#2A1816',
  dangerBorder: '#6E2F2A',
  error: '#FF8A80',
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
  HEADMAN_GROUP_LOCKED: 'Групу старости змінює адміністратор.',
  GROUP_NOT_FOUND: 'Групу не знайдено. Оновіть список.',
  INVALID_SUBGROUP: 'Оберіть підгрупу: усі, 1 або 2.',
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
