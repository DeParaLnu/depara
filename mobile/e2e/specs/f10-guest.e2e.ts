import { byLabel, byTestId, SEED } from '../helpers';

// F10, сценарій «розклад без входу» (specs/f10-guest.md, критерії приймання).
// Потрібні testID: "guest-button" на екрані входу, "faculty-list", "onboarding-continue", "tab-today",
// "guest-sign-in" у профілі гостя.
describe('F10: гостьовий режим', () => {
  it('гість обирає групу і бачить вкладки без входу', async () => {
    await byTestId('guest-button').click();
    await byTestId('faculty-list').waitForDisplayed({ timeout: 15000 });
    await byLabel(SEED.faculty).click();
    await byLabel(`${SEED.group}, ${SEED.course} курс`).click();
    await byTestId('onboarding-continue').click();
    await byTestId('tab-today').waitForDisplayed({ timeout: 15000 });
  });

  it('у профілі гостя є кнопка входу', async () => {
    await byTestId('tab-profile').click();
    await byTestId('guest-sign-in').waitForDisplayed({ timeout: 10000 });
    await byTestId('guest-sign-in').click();
    await byTestId('login-button').waitForDisplayed({ timeout: 10000 });
  });
});
