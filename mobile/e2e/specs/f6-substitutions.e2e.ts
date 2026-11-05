import { ensureHeadman } from '../api';
import { alertConfirm, allByTestIdPrefix, byTestId, byText, loginAsHeadman, openTab, scrollToTestIdSuffix } from '../helpers';

// F6, «Заміни пар» (specs/f6-substitutions.md): староста створює заміну своєї групи, бачить її в розкладі
// без перезапуску і скасовує. Студент кнопки «Додати заміну» не бачить (f6-student.e2e.ts).
// Дані: seed з --shift-to-current-week; старосту ТЕСТ-31 готує ensureHeadman() через API.
//
// Контракт testID:
//   add-substitution-fab          «Додати заміну» на «Сьогодні»
//   substitution-lesson           поле «Пара» у формі; lesson-picker-item-<id> пари в списку вибору
//   substitution-kind-<KIND>      тип зміни; substitution-comment, substitution-submit
//   substitution-saved            екран «Заміну збережено»; substitution-done «До розкладу»
//   cancel-substitution-button    «Скасувати заміну» в деталях пари; add-substitution-button «Додати заміну»
describe('F6: заміни старостою', () => {
  let lessonId = '';

  before(async () => {
    await ensureHeadman();
    await loginAsHeadman();
  });

  it('староста бачить «Додати заміну» і відкриває форму', async () => {
    await byTestId('add-substitution-fab').waitForDisplayed({ timeout: 20000 });
    await byTestId('add-substitution-fab').click();
    await byTestId('substitution-lesson').waitForDisplayed({ timeout: 15000 });
  });

  it('скасування пари зберігається і показує «Заміну збережено»', async () => {
    await byTestId('substitution-lesson').click();
    await byTestId('lesson-picker').waitForDisplayed({ timeout: 10000 });
    const [first] = await allByTestIdPrefix('lesson-picker-item-');
    lessonId = String(await first.getAttribute('resource-id')).replace(/^.*lesson-picker-item-/, '');
    expect(lessonId).not.toBe('');
    await first.click();
    await byTestId('lesson-picker').waitForDisplayed({ reverse: true, timeout: 10000 });

    await byTestId('substitution-kind-CANCELLED').click();
    await byTestId('substitution-comment').setValue('E2E скасування');
    await byTestId('substitution-submit').click();
    await byTestId('substitution-saved').waitForDisplayed({ timeout: 15000 });
    await byTestId('substitution-done').click();
  });

  it('заміну видно в розкладі тижня без перезапуску', async () => {
    await openTab('week');
    await byTestId('week-screen').waitForDisplayed({ timeout: 20000 });
    const card = await scrollToTestIdSuffix(`-${lessonId}`);
    await card.click();
    await byTestId('lesson-details').waitForDisplayed({ timeout: 10000 });
    await byText('Скасовано').waitForDisplayed({ timeout: 10000 });
    await byTestId('cancel-substitution-button').waitForDisplayed();
  });

  it('скасування заміни повертає пару до звичайного вигляду', async () => {
    await byTestId('cancel-substitution-button').click();
    await alertConfirm().waitForDisplayed({ timeout: 10000 });
    await alertConfirm().click();
    await byTestId('lesson-details').waitForDisplayed({ reverse: true, timeout: 15000 });

    const card = await scrollToTestIdSuffix(`-${lessonId}`);
    await card.click();
    await byTestId('add-substitution-button').waitForDisplayed({ timeout: 15000 });
    await byTestId('lesson-details-backdrop').click();
  });
});
