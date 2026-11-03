// Правило видалення акаунта: останнього адміна видаляти не можна, інакше система лишається без адміністратора
// (ролі, групи, імпорт розкладу). Виняток: пошта з ADMIN_EMAILS, бо така людина відновить роль ADMIN при наступному вході.
export function canDeleteAccount(
  user: { role: string; email: string },
  otherAdmins: number,
  adminEmails: readonly string[],
): { ok: true } | { ok: false; error: 'LAST_ADMIN' } {
  if (user.role === 'ADMIN' && otherAdmins === 0 && !adminEmails.includes(user.email)) {
    return { ok: false, error: 'LAST_ADMIN' };
  }
  return { ok: true };
}
