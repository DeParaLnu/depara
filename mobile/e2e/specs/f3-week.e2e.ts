import { allByTestId, byTestId, loginAsStudent, openTab, weekDay } from '../helpers';

// F3, сценарій «відкрити тиждень» (specs/f3-schedule.md, критерії приймання).
// Дані: seed з --shift-to-current-week, група ТЕСТ-31, студент з підгрупою 0 (бачить усі підгрупи).
// У seed пари є з понеділка по пʼятницю поточного тижня.
//
// Контракт testID для екрана «Тиждень» (src/app/(tabs)/week.tsx):
//   week-screen              корінь екрана, коли дані завантажені
//   week-day-YYYY-MM-DD      заголовок дня (лише дні, у яких є пари)
//   lesson-card              кожна картка пари (додати в LessonCard)
//   lesson-card-YYYY-MM-DD-N картка конкретної пари: дата і номер пари
describe('F3: розклад на тиждень', () => {
  before(async () => {
    await loginAsStudent();
    await openTab('week');
    await byTestId('week-screen').waitForDisplayed({ timeout: 20000 });
  });

  it('показує пари тижня', async () => {
    await byTestId(`week-day-${weekDay(0)}`).waitForDisplayed();
    const cards = await allByTestId('lesson-card');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('дні йдуть по порядку, а пари в дні за номером', async () => {
    // Понеділок вище за вівторок
    const mon = await byTestId(`week-day-${weekDay(0)}`).getLocation('y');
    const tue = await byTestId(`week-day-${weekDay(1)}`).getLocation('y');
    expect(mon).toBeLessThan(tue);

    // У понеділок у seed пари 2, 3, 4, 5: друга вище за четверту
    const pair2 = await byTestId(`lesson-card-${weekDay(0)}-2`).getLocation('y');
    const pair4 = await byTestId(`lesson-card-${weekDay(0)}-4`).getLocation('y');
    expect(pair2).toBeLessThan(pair4);
  });

  it('пʼятниця доступна прокручуванням', async () => {
    const friday = byTestId(`week-day-${weekDay(4)}`);
    // Прокрутка до елемента: у RN списках він може бути ще не відмальований
    await $(
      `android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().resourceId("week-day-${weekDay(4)}"))`,
    );
    await friday.waitForDisplayed();
  });
});
