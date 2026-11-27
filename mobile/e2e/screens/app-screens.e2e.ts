import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { alertConfirm, allByTestIdPrefix, byLabel, byTestId, openTab } from '../helpers';

// Не перевірка, а обхід застосунку зі знімками екранів для демо й документації (workflow app-screenshots).
// Потрібні: збірка без E2E, бекенд із demo-seed (npm run seed:demo) і паролі демо-акаунтам (set-password).
const SCREENS = join(process.cwd(), 'e2e', 'artifacts', 'screens');
const PASSWORD = process.env.DEMO_PASSWORD ?? 'example-demo-password';

const shot = async (name: string) => {
  await browser.pause(1500); // дати домалюватись списку чи аркушу
  mkdirSync(SCREENS, { recursive: true });
  await browser.saveScreenshot(join(SCREENS, `${name}.png`));
};

const byDescription = (pattern: string) => $(`android=new UiSelector().descriptionMatches("${pattern}")`);

// Коли користувач не увійшов, застосунок показує привітання, а з нього «Розпочати» веде на вхід
async function openLogin(): Promise<void> {
  const start = byTestId('welcome-start');
  const email = byTestId('email-input');
  await browser.waitUntil(async () => (await start.isExisting()) || (await email.isExisting()), {
    timeout: 60000,
    timeoutMsg: 'Не відкрилось ні привітання, ні вхід',
  });
  if (await start.isExisting()) await start.click();
  await email.waitForDisplayed({ timeout: 15000 });
}

async function signIn(email: string): Promise<void> {
  await openLogin();
  await byTestId('email-input').setValue(email);
  await byTestId('password-input').setValue(PASSWORD);
  if (await browser.isKeyboardShown()) await browser.hideKeyboard();
  await byTestId('password-login-button').click();
}

async function signOut(): Promise<void> {
  await openTab('profile');
  const button = byTestId('sign-out-button');
  if (!(await button.isDisplayed())) {
    await $('android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().resourceId("sign-out-button"))');
  }
  await button.click();
  await browser.pause(800);
  if (await alertConfirm().isExisting()) await alertConfirm().click();
  await byTestId('tab-today').waitForDisplayed({ reverse: true, timeout: 15000 });
}

describe('знімки: вхід і онбординг', () => {
  it('привітання та вхід', async () => {
    await byTestId('welcome-start').waitForDisplayed({ timeout: 60000 });
    await shot('01-welcome');
    await openLogin();
    await shot('02-login');
    await byTestId('email-input').setValue('demo.student@lnu.edu.ua');
    await byTestId('password-input').setValue(PASSWORD);
    if (await browser.isKeyboardShown()) await browser.hideKeyboard();
    await shot('03-login-filled');
  });

  it('новий студент обирає факультет і групу', async () => {
    await signIn('demo.newcomer@lnu.edu.ua');
    await byTestId('faculty-list').waitForDisplayed({ timeout: 30000 });
    await shot('04-onboarding-faculty');
    await byLabel('Факультет прикладної математики та інформатики').click();
    await byTestId('group-list').waitForDisplayed({ timeout: 15000 });
    await byLabel('3 курс').click();
    await shot('05-onboarding-group');
    await byLabel('ПМІ-31, 3 курс').click();
    await byTestId('onboarding-continue').click();
    await byTestId('onboarding-notifications').waitForDisplayed({ timeout: 15000 });
    await shot('06-onboarding-notifications');
    await byTestId('onboarding-notifications-later').click();
    await byTestId('tab-today').waitForDisplayed({ timeout: 15000 });
    await signOut();
  });
});

describe('знімки: студент', () => {
  before(async () => {
    await signIn('demo.student@lnu.edu.ua');
    await byTestId('tab-today').waitForDisplayed({ timeout: 30000 });
  });

  it('сьогодні', async () => {
    await shot('07-today');
    // на вихідних «Сьогодні» порожній: показуємо ще й понеділок
    await byDescription('(?i)понеділок.*').click();
    await shot('08-today-monday');
  });

  it('тиждень і деталі пари', async () => {
    await openTab('week');
    await byTestId('week-screen').waitForDisplayed({ timeout: 20000 });
    await shot('09-week');
    const [first] = await allByTestIdPrefix('lesson-card-');
    await first.click();
    await byTestId('lesson-details').waitForDisplayed({ timeout: 10000 });
    await shot('10-lesson-details');
    await byTestId('lesson-details-backdrop').click();
  });

  it('наступний тиждень із замінами', async () => {
    await openTab('week');
    await byLabel('Наступний тиждень').click();
    await byTestId('week-screen').waitForDisplayed({ timeout: 20000 });
    await shot('11-week-next');
    const changed = byDescription('.*(скасовано|перенесено|заміна|інш).*');
    if (await changed.isExisting()) {
      await changed.click();
      await byTestId('lesson-details').waitForDisplayed({ timeout: 10000 });
      await shot('12-substitution-details-student');
      await byTestId('lesson-details-backdrop').click();
    }
  });

  it('пошук аудиторій', async () => {
    await openTab('rooms');
    await byTestId('rooms-screen').waitForDisplayed({ timeout: 20000 });
    await shot('13-rooms');
    await byTestId('rooms-search-input').setValue('1');
    if (await browser.isKeyboardShown()) await browser.hideKeyboard();
    await shot('14-rooms-search');
  });

  it('профіль', async () => {
    await openTab('profile');
    await byTestId('profile-subgroup').waitForDisplayed({ timeout: 20000 });
    await shot('15-profile');
    await signOut();
  });
});

describe('знімки: староста', () => {
  let lessonId = '';

  before(async () => {
    await signIn('demo.headman@lnu.edu.ua');
    await byTestId('tab-today').waitForDisplayed({ timeout: 30000 });
  });

  it('створює заміну', async () => {
    await shot('16-today-headman');
    await byTestId('add-substitution-fab').click();
    await byTestId('substitution-lesson').waitForDisplayed({ timeout: 15000 });
    await shot('17-substitution-form');
    await byTestId('substitution-lesson').click();
    await byTestId('lesson-picker').waitForDisplayed({ timeout: 10000 });
    await shot('18-lesson-picker');
    const items = await allByTestIdPrefix('lesson-picker-item-');
    const item = items[items.length - 1];
    lessonId = String(await item.getAttribute('resource-id')).replace(/^.*lesson-picker-item-/, '');
    await item.click();
    await byTestId('lesson-picker').waitForDisplayed({ reverse: true, timeout: 10000 });
    await byTestId('substitution-kind-CANCELLED').click();
    await byTestId('substitution-comment').setValue('Викладач захворів');
    if (await browser.isKeyboardShown()) await browser.hideKeyboard();
    await shot('19-substitution-filled');
    await byTestId('substitution-submit').click();
    await byTestId('substitution-saved').waitForDisplayed({ timeout: 15000 });
    await shot('20-substitution-saved');
    await byTestId('substitution-done').click();
  });

  it('бачить заміну в розкладі й скасовує її', async () => {
    await openTab('week');
    await byTestId('week-screen').waitForDisplayed({ timeout: 20000 });
    const card = $(
      `android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().resourceIdMatches(".*-${lessonId}$"))`,
    );
    if (!(await card.isExisting())) {
      await byLabel('Наступний тиждень').click();
      await byTestId('week-screen').waitForDisplayed({ timeout: 20000 });
    }
    await shot('21-week-headman');
    await card.click();
    await byTestId('lesson-details').waitForDisplayed({ timeout: 10000 });
    await shot('22-substitution-details-headman');
    await byTestId('cancel-substitution-button').click();
    await alertConfirm().waitForDisplayed({ timeout: 10000 });
    await shot('23-cancel-confirm');
    await alertConfirm().click();
    await byTestId('lesson-details').waitForDisplayed({ reverse: true, timeout: 15000 });
    await shot('24-week-after-cancel');
  });
});
