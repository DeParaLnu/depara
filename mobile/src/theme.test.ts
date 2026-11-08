import { describe, expect, it } from 'vitest';
import { darkColors, lightColors, type Colors } from './theme';

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Пари «текст на фоні», які реально є на екранах. Темних макетів немає, тож читабельність тримає цей тест
const TEXT_PAIRS: [keyof Colors, keyof Colors][] = [
  ['text', 'background'],
  ['text', 'surface'],
  ['text', 'surfaceSoft'],
  ['text', 'surfaceSelected'],
  ['textBody', 'background'],
  ['textMuted', 'background'],
  ['textMuted', 'surface'],
  ['textMuted', 'chip'],
  ['textSecondary', 'chip'],
  ['textTime', 'background'],
  ['textWeekday', 'chip'],
  ['primary', 'background'],
  ['primary', 'surface'],
  ['primary', 'surfaceTint'],
  ['onPrimary', 'primary'],
  ['onPrimary', 'accent'],
  ['tagBlueText', 'tagBlue'],
  ['warningText', 'warningBg'],
  ['warningText', 'warningBadge'],
  ['danger', 'background'],
  ['danger', 'dangerBg'],
  ['danger', 'dangerSurface'],
  ['success', 'successBg'],
];

describe('палітри', () => {
  it('у темній ті самі токени, що й у світлій', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  it('темна справді інша: фон темний, текст світлий', () => {
    expect(luminance(darkColors.background)).toBeLessThan(0.05);
    expect(luminance(darkColors.text)).toBeGreaterThan(0.8);
  });

  it.each(TEXT_PAIRS)('темна: %s на %s читається (AA, 4.5:1)', (fg, bg) => {
    expect(contrast(darkColors[fg], darkColors[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it('контури контролів у темній видно на фоні (3:1)', () => {
    expect(contrast(darkColors.borderStrong, darkColors.background)).toBeGreaterThanOrEqual(3);
  });
});
