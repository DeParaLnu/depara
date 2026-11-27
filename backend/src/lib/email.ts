import { config } from '../config';

// Єдине правило домену пошти для всіх способів входу. Рівно одна @, і весь домен після неї збігається
// (відсікає "x@evil.com@lnu.edu.ua" і lnu.edu.ua.evil.com). Очікує пошту малими літерами.
export function isAllowedEmail(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 1 || email.indexOf('@') !== at) return false;
  return email.slice(at + 1) === config.allowedEmailDomain;
}
