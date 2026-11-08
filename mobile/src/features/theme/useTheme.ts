import { useColorScheme } from 'react-native';
import { darkColors, lightColors, type Colors } from '../../theme';
import { resolveScheme } from './preference';
import { useThemeSettings } from './settings';

export function useScheme(): 'light' | 'dark' {
  const preference = useThemeSettings((s) => s.preference);
  return resolveScheme(preference, useColorScheme());
}

export function useColors(): Colors {
  return useScheme() === 'dark' ? darkColors : lightColors;
}

/**
 * Стилі, що залежать від теми. Заміна модульного StyleSheet.create: кожну тему рахуємо один раз, а не при рендері.
 * const useStyles = makeStyles((colors) => StyleSheet.create({ ... })), у компоненті const styles = useStyles().
 */
export function makeStyles<T>(factory: (colors: Colors) => T): () => T {
  let light: T | undefined;
  let dark: T | undefined;
  return function useStyles() {
    if (useScheme() === 'dark') return (dark ??= factory(darkColors));
    return (light ??= factory(lightColors));
  };
}
