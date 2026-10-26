// На Android testID з React Native потрапляє в resource-id, тому шукаємо через UiSelector.
export const byTestId = (id: string) =>
  $(`android=new UiSelector().resourceId("${id}")`);

// Усі елементи з однаковим testID (наприклад, усі картки пар на екрані)
export const allByTestId = (id: string) =>
  $$(`android=new UiSelector().resourceId("${id}")`);

// accessibilityLabel з React Native на Android стає content-desc, Appium шукає його через "~"
export const byLabel = (label: string) => $(`~${label}`);

// Елемент, у якому є текст (точний збіг)
export const byText = (text: string) => $(`android=new UiSelector().text("${text}")`);

// Дані з seed (backend/prisma/seed/schedule.seed.json): один факультет і одна група
export const SEED = {
  faculty: 'Тестовий факультет',
  group: 'ТЕСТ-31',
  course: 3,
} as const;

/**
 * Вхід тестовим студентом (збірка з E2E=1 шле test:student@lnu.edu.ua) і, якщо треба, онбординг.
 * У свіжій базі студент новий і бачить вибір факультету. При повторному запуску на тій самій базі
 * група вже обрана і застосунок одразу відкриває вкладки. Хелпер обробляє обидва випадки,
 * тому сценарії не залежать від порядку запуску.
 */
export async function loginAsStudent(): Promise<void> {
  await byTestId('login-button').click();

  const faculty = byTestId('faculty-list');
  const tabs = byTestId('tab-today');
  await browser.waitUntil(async () => (await faculty.isDisplayed()) || (await tabs.isDisplayed()), {
    timeout: 20000,
    timeoutMsg: 'Після входу не відкрився ні онбординг, ні вкладки',
  });

  if (await faculty.isDisplayed()) {
    await byLabel(SEED.faculty).click();
    await byLabel(`${SEED.group}, ${SEED.course} курс`).click();
    // Підгрупа за замовчуванням 0 = «усі підгрупи»: сценарії бачать усі пари групи
    await byTestId('onboarding-continue').click();
    await tabs.waitForDisplayed({ timeout: 15000 });
  }
}

// Вкладки нижньої навігації: testID tab-today, tab-week, tab-rooms, tab-profile
export async function openTab(name: 'today' | 'week' | 'rooms' | 'profile'): Promise<void> {
  await byTestId(`tab-${name}`).click();
}

// Понеділок поточного тижня в UTC, як у backend/prisma/seed/seed.ts (--shift-to-current-week)
export function currentMonday(): Date {
  const d = new Date();
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

// YYYY-MM-DD дня поточного тижня: 0 = понеділок
export function weekDay(offset: number): string {
  const d = currentMonday();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
