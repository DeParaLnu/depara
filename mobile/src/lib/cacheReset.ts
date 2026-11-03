// Скидання кешу даних користувача при виході. Кеш запитів живе в React-дереві, а вихід відбувається в сховищі
// сесії поза ним, тому корінь застосунку реєструє тут свій обробник.
let reset: (() => Promise<void> | void) | null = null;

export const registerCacheReset = (fn: (() => Promise<void> | void) | null) => {
  reset = fn;
};

export const resetCaches = async (): Promise<void> => {
  await reset?.();
};
