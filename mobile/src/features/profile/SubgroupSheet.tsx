import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme';
import { SUBGROUPS } from './group';

type Props = {
  visible: boolean;
  value: number;
  saving: boolean;
  error: string | null;
  onSelect: (subgroup: number) => void;
  onClose: () => void;
};

// F9: вибір підгрупи з профілю (нижній лист)
export function SubgroupSheet({ visible, value, saving, error, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Закрити вибір підгрупи"
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="subgroup-sheet">
          <View style={styles.handle} />
          <Text style={styles.title} accessibilityRole="header">
            Підгрупа
          </Text>
          <Text style={styles.hint}>Розклад покаже пари всієї групи й обраної підгрупи.</Text>
          <View accessibilityRole="radiogroup">
            {SUBGROUPS.map((s) => {
              const selected = s.value === value;
              return (
                <Pressable
                  key={s.value}
                  testID={`subgroup-option-${s.value}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, checked: selected, disabled: saving }}
                  aria-checked={selected}
                  accessibilityLabel={s.a11y}
                  disabled={saving}
                  onPress={() => onSelect(s.value)}
                  style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{s.a11y}</Text>
                  {selected ? <Ionicons name="checkmark" size={22} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
          {saving ? <ActivityIndicator style={styles.state} color={colors.primary} accessibilityLabel="Збереження" /> : null}
          {error ? (
            <Text style={[styles.state, styles.error]} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,39,0.45)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 21,
    paddingTop: 12,
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 12 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: colors.text },
  hint: { fontSize: 14, lineHeight: 19, color: colors.textMuted, marginTop: 4, marginBottom: 8 },
  option: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionPressed: { backgroundColor: colors.chip },
  optionText: { fontSize: 17, color: colors.text },
  optionTextSelected: { fontWeight: '700', color: colors.primary },
  state: { paddingTop: 14 },
  error: { color: colors.error, fontSize: 15, textAlign: 'center' },
});
