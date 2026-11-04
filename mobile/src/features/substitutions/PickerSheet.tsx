import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, errorText } from '../../theme';

export type PickerItem = { key: string; title: string; subtitle?: string };

type Props = {
  visible: boolean;
  title: string;
  items: PickerItem[];
  selectedKey?: string | null;
  onSelect: (key: string) => void;
  onClose: () => void;
  testID: string;
  /** Пошук: якщо задано, зверху поле вводу */
  search?: { value: string; onChange: (q: string) => void; placeholder: string };
  loading?: boolean;
  errorCode?: string | null;
  emptyText?: string;
};

// Нижній лист вибору (пара, викладач, аудиторія) для форми «Нова заміна»
export function PickerSheet({
  visible,
  title,
  items,
  selectedKey,
  onSelect,
  onClose,
  testID,
  search,
  loading,
  errorCode,
  emptyText = 'Нічого не знайдено',
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Закрити вибір"
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} testID={testID}>
          <View style={styles.handle} />
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {search ? (
            <TextInput
              testID={`${testID}-search`}
              value={search.value}
              onChangeText={search.onChange}
              placeholder={search.placeholder}
              placeholderTextColor={colors.textMuted}
              style={styles.search}
              autoCorrect={false}
              autoFocus
            />
          ) : null}
          {loading ? (
            <ActivityIndicator style={styles.state} color={colors.primary} accessibilityLabel="Завантаження" />
          ) : errorCode ? (
            <Text style={[styles.state, styles.error]}>{errorText(errorCode)}</Text>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.key}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              ListEmptyComponent={<Text style={[styles.state, styles.empty]}>{emptyText}</Text>}
              renderItem={({ item }) => {
                const selected = item.key === selectedKey;
                return (
                  <Pressable
                    testID={`${testID}-item-${item.key}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={item.subtitle ? `${item.title}, ${item.subtitle}` : item.title}
                    onPress={() => onSelect(item.key)}
                    style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                  >
                    <View style={styles.itemText}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      {item.subtitle ? <Text style={styles.itemSubtitle}>{item.subtitle}</Text> : null}
                    </View>
                    {selected ? <Ionicons name="checkmark" size={22} color={colors.primary} /> : null}
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,39,0.45)' },
  sheet: {
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 21,
    paddingTop: 12,
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 12 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: colors.text, marginBottom: 12 },
  search: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
    marginBottom: 8,
  },
  list: { flexGrow: 0 },
  item: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemPressed: { backgroundColor: colors.chip },
  itemText: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 16, lineHeight: 21, fontWeight: '600', color: colors.text },
  itemSubtitle: { fontSize: 14, lineHeight: 18, color: colors.textMuted },
  state: { paddingVertical: 24 },
  error: { color: colors.error, fontSize: 15, textAlign: 'center' },
  empty: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },
});
