import { allByTestId, byTestId, loginAsStudent, openTab } from '../helpers';

// F5, сценарій «знайти аудиторію N1» (specs/f5-search.md, критерії приймання).
// У seed є аудиторії N10/Б і N11/Б (латинська N) і №9/Б, №5/Б (знак номера), тож запит N1
// має дати рівно дві: N10/Б і N11/Б.
//
// Контракт testID для екрана «Аудиторії» (src/app/(tabs)/rooms.tsx):
//   rooms-screen           корінь екрана
//   rooms-search-input     поле пошуку
//   rooms-results          список результатів
//   room-item              кожен рядок результату
//   room-item-<id>         рядок конкретної аудиторії: label з API, де / замінено на -, наприклад N10-Б
//                          (resource-id на Android надійніше без скісної риски)
//   room-building-<id>     підпис корпусу в цьому рядку (назва або літера корпусу)
//   rooms-error            стан помилки (не має зʼявлятися)
const search = async (text: string) => {
  const input = byTestId('rooms-search-input');
  await input.clearValue();
  if (text) await input.setValue(text);
};

describe('F5: пошук аудиторій', () => {
  before(async () => {
    await loginAsStudent();
    await openTab('rooms');
    await byTestId('rooms-screen').waitForDisplayed({ timeout: 20000 });
  });

  it('запит N1 знаходить N10/Б і N11/Б, а №9/Б ні', async () => {
    await search('N1');
    await byTestId('room-item-N10-Б').waitForDisplayed({ timeout: 10000 });
    await byTestId('room-item-N11-Б').waitForDisplayed();
    expect(await byTestId('room-item-№9-Б').isExisting()).toBe(false);
    const items = await allByTestId('room-item');
    expect(items.length).toBeLessThanOrEqual(20);
  });

  it('для кожної знайденої аудиторії видно корпус', async () => {
    await byTestId('room-building-N10-Б').waitForDisplayed();
    await byTestId('room-building-N11-Б').waitForDisplayed();
  });

  it('регістр запиту не впливає: n1 дає той самий результат', async () => {
    await search('n1');
    await byTestId('room-item-N10-Б').waitForDisplayed({ timeout: 10000 });
    await byTestId('room-item-N11-Б').waitForDisplayed();
  });

  it('порожній запит показує список без помилки', async () => {
    await search('');
    await byTestId('rooms-results').waitForDisplayed({ timeout: 10000 });
    expect(await byTestId('rooms-error').isExisting()).toBe(false);
  });
});
