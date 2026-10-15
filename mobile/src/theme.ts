export const colors = {
  primary: '#1E4E8C',
  primaryDark: '#163A69',
  background: '#F4F7FB',
  surface: '#FFFFFF',
  text: '#13213A',
  textMuted: '#5B6B82',
  border: '#DCE3EE',
  error: '#B3261E',
};

// Повідомлення для кодів помилок бекенду
export const errorMessages: Record<string, string> = {
  NETWORK_ERROR: 'Немає зв’язку із сервером. Перевірте інтернет і спробуйте ще раз.',
  NON_LNU_EMAIL: 'Увійти можна лише з пошти @lnu.edu.ua.',
  INVALID_TOKEN: 'Не вдалося підтвердити вхід через Google.',
  AUTH_NOT_CONFIGURED: 'Вхід тимчасово недоступний.',
};

export const errorText = (code: string) => errorMessages[code] ?? 'Щось пішло не так. Спробуйте ще раз.';
