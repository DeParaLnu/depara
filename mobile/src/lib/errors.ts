import { ApiError } from '../api';
import { log } from './logger';

/** Код помилки для UI. Чиста функція без побічних ефектів: безпечна для виклику під час рендеру. */
export const errorCode = (error: unknown): string => (error instanceof ApiError ? error.code : 'UNKNOWN');

export const isNetworkError = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'NETWORK_ERROR';

/**
 * Для блоків catch в обробниках подій. Очікувані помилки API вже записані в api.ts і повертають свій код.
 * Неочікувані (баги) логуються зі стеком і лише потім перетворюються на UNKNOWN.
 * Помилки react-query логує глобальний обробник у _layout.tsx, тож для них достатньо errorCode().
 */
export function reportError(scope: string, error: unknown): string {
  if (!(error instanceof ApiError)) log.error(scope, 'неочікувана помилка', error);
  return errorCode(error);
}
