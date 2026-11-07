import { describe, expect, it } from 'vitest';
import { isThemePreference, resolveScheme, themeLabel } from './preference';

describe('тема', () => {
  it('приймає лише відомі значення зі сховища', () => {
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('blue')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it('вибір користувача важливіший за телефон', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });

  it('«Системна» йде за телефоном, а без відповіді телефона світла', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', null)).toBe('light');
    expect(resolveScheme('system', 'unspecified')).toBe('light');
  });

  it('підпис для рядка в профілі', () => {
    expect(themeLabel('system')).toBe('Системна');
    expect(themeLabel('dark')).toBe('Темна');
  });
});
