import { allByTestIdPrefix, byTestId, loginAsStudent, openTab } from '../helpers';

// F3, «Деталі пари» (specs/f3-schedule.md): натиснути пару на екрані «Тиждень» відкриває аркуш з деталями.
// Контракт testID (src/features/schedule/components/LessonDetailsSheet.tsx):
//   lesson-details            аркуш деталей
//   lesson-details-time       рядок «11:50 – 13:10 · пн 12 жовтня»
//   lesson-details-location   рядок «Корпус Т · ауд. 218, вул. Тарнавського» (якщо в пари є аудиторія)
//   route-button              «Прокласти маршрут» (є лише коли відомий корпус)
//   lesson-details-backdrop   затемнення: тап закриває аркуш
describe('F3: деталі пари', () => {
  before(async () => {
    await loginAsStudent();
    await openTab('week');
    await byTestId('week-screen').waitForDisplayed({ timeout: 20000 });
  });

  it('тап по парі відкриває деталі з часом', async () => {
    const [first] = await allByTestIdPrefix('lesson-card-');
    await first.click();
    await byTestId('lesson-details').waitForDisplayed({ timeout: 10000 });
    await byTestId('lesson-details-time').waitForDisplayed();
  });

  it('тап по затемненню закриває деталі', async () => {
    await byTestId('lesson-details-backdrop').click();
    await byTestId('lesson-details').waitForDisplayed({ reverse: true, timeout: 10000 });
  });
});
