import { byTestId, loginAsStudent, openTab } from '../helpers';

// F6: студент не бачить кнопок заміни (specs/f6-substitutions.md, «Студент не бачить кнопки „Додати заміну“»)
describe('F6: студент без кнопок заміни', () => {
  before(async () => {
    await loginAsStudent();
  });

  it('на «Сьогодні» немає «Додати заміну»', async () => {
    await byTestId('tab-today').waitForDisplayed({ timeout: 20000 });
    // Розклад завантажився (кнопка оновлення є завжди, тож чекаємо на вкладку «Тиждень» з даними нижче)
    await openTab('week');
    await byTestId('week-screen').waitForDisplayed({ timeout: 20000 });
    await openTab('today');
    expect(await byTestId('add-substitution-fab').isExisting()).toBe(false);
  });
});
