import { byTestId, byText, loginAsStudent, openTab } from '../helpers';

// F9, «Профіль» (specs/f9-profile.md): зміна підгрупи й вибір групи з профілю.
// У seed лише одна група (ТЕСТ-31), тож перевіряємо підгрупу і що вибір групи відкривається з поточної.
// Контракт testID: profile-group, profile-subgroup, subgroup-sheet, subgroup-option-<0|1|2>,
//   group-list, change-group-save
describe('F9: профіль', () => {
  before(async () => {
    await loginAsStudent();
    await openTab('profile');
    await byTestId('profile-subgroup').waitForDisplayed({ timeout: 20000 });
  });

  it('підгрупа змінюється з профілю і повертається назад', async () => {
    await byTestId('profile-subgroup').click();
    await byTestId('subgroup-sheet').waitForDisplayed({ timeout: 10000 });
    await byTestId('subgroup-option-1').click();
    await byTestId('subgroup-sheet').waitForDisplayed({ reverse: true, timeout: 15000 });
    await byTestId('profile-subgroup').waitForDisplayed();
    expect(await byTestId('profile-subgroup').getAttribute('content-desc')).toBe('Підгрупа 1');

    // Назад до «усіх підгруп», щоб не впливати на інші сценарії на тій самій базі
    await byTestId('profile-subgroup').click();
    await byTestId('subgroup-option-0').click();
    await byTestId('subgroup-sheet').waitForDisplayed({ reverse: true, timeout: 15000 });
    expect(await byTestId('profile-subgroup').getAttribute('content-desc')).toBe('Підгрупа Усі');
  });

  it('«Група» відкриває вибір з поточною групою, без змін зберегти не можна', async () => {
    await byTestId('profile-group').click();
    await byTestId('group-list').waitForDisplayed({ timeout: 15000 });
    await byText('ТЕСТ-31').waitForDisplayed();
    expect(await byTestId('change-group-save').isEnabled()).toBe(false);

    // Системне «Назад» повертає в профіль без змін
    await browser.back();
    await byTestId('profile-group').waitForDisplayed({ timeout: 15000 });
    expect(await byTestId('profile-group').getAttribute('content-desc')).toBe('Група ТЕСТ-31');
  });
});
