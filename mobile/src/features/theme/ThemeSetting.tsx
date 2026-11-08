import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { THEME_OPTIONS, themeLabel, type ThemePreference } from './preference';
import { useThemeSettings } from './settings';
import { makeStyles, useColors } from './useTheme';

// F9: «ВИГЛЯД → Тема › Системна» (макет docs/design/19-profile.png). Вибір діє одразу і живе лише на пристрої
export function ThemeSetting() {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const preference = useThemeSettings((s) => s.preference);
  const setPreference = useThemeSettings((s) => s.setPreference);
  const [open, setOpen] = useState(false);

  const choose = (value: ThemePreference) => {
    setPreference(value);
    setOpen(false);
  };

  return (
    <View style={styles.block}>
      <Text style={styles.section}>ВИГЛЯД</Text>
      <Pressable
        testID="profile-theme"
        accessibilityRole="button"
        accessibilityLabel={`Тема ${themeLabel(preference)}`}
        accessibilityHint="Відкриває вибір теми"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <Text style={styles.rowLabel}>Тема</Text>
        <View style={styles.rowRight}>
          <Text style={styles.rowValue}>{themeLabel(preference)}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={styles.root}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Закрити вибір теми"
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="theme-sheet">
            <View style={styles.handle} />
            <Text style={styles.title} accessibilityRole="header">
              Тема
            </Text>
            <View accessibilityRole="radiogroup">
              {THEME_OPTIONS.map((o) => {
                const selected = o.value === preference;
                return (
                  <Pressable
                    key={o.value}
                    testID={`theme-option-${o.value}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, checked: selected }}
                    aria-checked={selected}
                    accessibilityLabel={o.label}
                    onPress={() => choose(o.value)}
                    style={({ pressed }) => [styles.option, pressed && styles.rowPressed]}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{o.label}</Text>
                    {selected ? <Ionicons name="checkmark" size={22} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    block: { marginTop: 18, gap: 4 },
    section: { fontSize: 13, fontWeight: '700', color: colors.textTime, letterSpacing: 0.3 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 50,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowPressed: { backgroundColor: colors.chip },
    rowLabel: { fontSize: 17, color: colors.text },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowValue: { fontSize: 17, fontWeight: '700', color: colors.text },
    root: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 21,
      paddingTop: 12,
    },
    handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 12 },
    title: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: colors.text, marginBottom: 8 },
    option: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    optionText: { fontSize: 17, color: colors.text },
    optionTextSelected: { fontWeight: '700', color: colors.primary },
  }),
);
