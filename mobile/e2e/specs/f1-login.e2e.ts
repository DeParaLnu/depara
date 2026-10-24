import { byTestId } from '../helpers';

// Потрібні testID у застосунку: "login-button" на кнопці входу
// і "faculty-list" на списку факультетів. У збірці з E2E=1 кнопка входу
// має викликати POST /auth/microsoft з токеном "test:student@lnu.edu.ua".
describe('F1: вхід', () => {
  it('студент з тестовим акаунтом потрапляє на вибір факультету', async () => {
    await byTestId('login-button').click();
    await byTestId('faculty-list').waitForDisplayed({ timeout: 15000 });
  });
});
