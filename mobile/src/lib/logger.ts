// Єдиний модуль логування: усі виклики консолі в застосунку йдуть тільки через нього.
// Так потім можна підключити Sentry чи інший сервіс, змінивши лише цей файл.
//
// debug/info (шум) існують лише в розробці. У прод-збірці __DEV__ = false, Metro підставляє константу,
// і функції для debug/info замінюються на порожню, а код з console вирізається під час мінімізації.
// УВАГА: щоб рядки повідомлень теж не потрапили в прод-бандл (перевірено експортом), виклик debug/info
// обгортайте в `if (__DEV__)`: if (__DEV__) log.debug('scope', '...'). Без обгортки лишаються текст і аргументи.
// warn (очікувані збої: мережа, 4xx/5xx) і error (баги, зі стеком) лишаються активними й у проді:
// їх видно в logcat/консолі пристрою, коли користувач відтворює проблему.
//
// НЕ логуйте токени, повні тіла відповідей, email, імʼя, deviceId. Дозволені коди помилок (NETWORK_ERROR, HTTP_500).
// Ключі, схожі на чутливі, у data автоматично замінюються на [redacted] як страховка, але покладатися на це не варто.

type Data = Record<string, unknown>;

const SENSITIVE_KEY = /token|authorization|password|secret|cookie|email|name|device/i;

function redact(data?: Data): Data | undefined {
  if (!data) return undefined;
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, SENSITIVE_KEY.test(key) ? '[redacted]' : value]),
  );
}

const format = (scope: string, message: string) => `[${scope}] ${message}`;
const noop = () => {};

export const log = {
  debug: __DEV__
    ? (scope: string, message: string, data?: Data) => console.debug(format(scope, message), redact(data) ?? '')
    : noop,
  info: __DEV__
    ? (scope: string, message: string, data?: Data) => console.info(format(scope, message), redact(data) ?? '')
    : noop,
  warn: (scope: string, message: string, data?: Data) =>
    console.warn(format(scope, message), redact(data) ?? ''),
  /** Баг: передайте саму помилку, щоб у лог потрапив стек. */
  error: (scope: string, message: string, error?: unknown, data?: Data) =>
    console.error(
      format(scope, message),
      error instanceof Error ? (error.stack ?? error.message) : (error ?? ''),
      redact(data) ?? '',
    ),
};
